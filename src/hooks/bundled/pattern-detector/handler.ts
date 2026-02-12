import fs from "node:fs";
import path from "node:path";
import type {
  PluginHookBeforeAgentStartEvent,
  PluginHookAgentContext,
  PluginHookBeforeAgentStartResult,
} from "../../../plugins/types.js";
import { loadConfig } from "../../../config/config.js";
import { resolveSessionTranscriptsDirForAgent } from "../../../config/sessions/paths.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import { resolveHookConfig } from "../../config.js";

const log = createSubsystemLogger("hooks/pattern-detector");

// --- Outbound alert cooldown (breaks re-alert loops) ---
const COOLDOWN_FILE = "outbound-alert-cooldowns.json";
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

type CooldownMap = Record<string, number>; // alert string → timestamp ms

function loadAlertCooldowns(agentId?: string): CooldownMap {
  try {
    const dir = resolveSessionTranscriptsDirForAgent(agentId);
    const file = path.join(dir, COOLDOWN_FILE);
    if (!fs.existsSync(file)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return {};
  }
}

function saveAlertCooldowns(agentId: string | undefined, cooldowns: CooldownMap): void {
  try {
    const dir = resolveSessionTranscriptsDirForAgent(agentId);
    const file = path.join(dir, COOLDOWN_FILE);
    fs.writeFileSync(file, JSON.stringify(cooldowns));
  } catch {
    // silent — cooldown persistence failure is non-critical
  }
}

export type PatternDefinition = {
  id: string;
  label: string;
  regex: string;
  flags?: string;
  template: string;
  enabled: boolean;
  direction?: "inbound" | "outbound" | "both";
};

export const DEFAULT_PATTERNS: PatternDefinition[] = [
  {
    id: "phone",
    label: "Telefone",
    regex: "\\+?\\d{2}\\s?\\(?\\d{2}\\)?\\s?\\d{4,5}[-.\\s]?\\d{4}",
    flags: "g",
    template: "⚡ Numero detectado: {{match}}. Verificar: existe nos contatos? Salvar?",
    enabled: true,
    direction: "inbound",
  },
  {
    id: "date",
    label: "Data",
    regex: "\\d{1,2}/\\d{1,2}(/\\d{2,4})?",
    flags: "g",
    template: "📅 Data mencionada: {{match}}. Criar evento/lembrete?",
    enabled: true,
    direction: "inbound",
  },
  {
    id: "currency",
    label: "Valor R$",
    regex: "R\\$\\s?[\\d.,]+",
    flags: "g",
    template: "💰 Valor detectado: {{match}}. Registrar no financeiro?",
    enabled: true,
    direction: "inbound",
  },
  {
    id: "url",
    label: "Link/URL",
    regex: "https?://\\S+",
    flags: "gi",
    template: "🔗 Link recebido: {{match}}. Classificar e salvar?",
    enabled: true,
    direction: "inbound",
  },
];

// Regex compilation cache to avoid recompilation per prompt
const regexCache = new Map<string, RegExp | null>();

function compileRegex(pattern: string, flags: string): RegExp | null {
  const key = `${pattern}::${flags}`;
  if (regexCache.has(key)) {
    return regexCache.get(key)!;
  }
  try {
    const re = new RegExp(pattern, flags);
    regexCache.set(key, re);
    return re;
  } catch (err) {
    log.warn(`Invalid regex pattern: ${pattern} — ${String(err)}`);
    regexCache.set(key, null);
    return null;
  }
}

export function runPatternMatching(
  text: string,
  patterns: PatternDefinition[],
  directionFilter: "inbound" | "outbound",
): string[] {
  // Strip bracket metadata only for inbound (envelope headers, structural markers)
  const body = directionFilter === "inbound" ? text.replace(/\[[^\]]+\]\s*/g, "") : text;

  const alerts: string[] = [];
  const seenMatches = new Set<string>();

  for (const pattern of patterns) {
    if (!pattern.enabled) {
      continue;
    }

    // Skip patterns that don't match the direction filter
    const patternDir = pattern.direction ?? "inbound";
    if (patternDir !== "both" && patternDir !== directionFilter) {
      continue;
    }

    const flags = pattern.flags ?? "g";
    const re = compileRegex(pattern.regex, flags);
    if (!re) {
      continue;
    }

    re.lastIndex = 0;
    let matchCount = 0;
    let match: RegExpExecArray | null;

    while ((match = re.exec(body)) !== null && matchCount < 20) {
      if (match[0].length === 0) {
        re.lastIndex++;
        continue;
      }

      const matchValue = match[0];
      const dedupeKey = `${pattern.id}::${matchValue}`;
      if (seenMatches.has(dedupeKey)) {
        continue;
      }
      seenMatches.add(dedupeKey);

      const alert = pattern.template.replace(/\{\{match\}\}/g, matchValue);
      alerts.push(alert);
      matchCount++;

      // For non-global regex, break after first match
      if (!flags.includes("g")) {
        break;
      }
    }
  }

  return alerts;
}

/**
 * Drain pending outbound alerts written by deliver.ts.
 * Reads and truncates the pending-outbound-alerts.jsonl file atomically.
 */
function drainPendingOutboundAlerts(agentId?: string): string[] {
  try {
    const alertsDir = resolveSessionTranscriptsDirForAgent(agentId);
    const alertsFile = path.join(alertsDir, "pending-outbound-alerts.jsonl");

    if (!fs.existsSync(alertsFile)) {
      return [];
    }

    const raw = fs.readFileSync(alertsFile, "utf-8").trim();
    if (!raw) {
      return [];
    }

    // Truncate immediately to avoid double-processing
    fs.writeFileSync(alertsFile, "");

    const allAlerts: string[] = [];
    for (const line of raw.split("\n")) {
      try {
        const entry = JSON.parse(line) as { alerts?: string[] };
        if (Array.isArray(entry.alerts)) {
          allAlerts.push(...entry.alerts);
        }
      } catch {
        // skip malformed lines
      }
    }

    if (allAlerts.length > 0) {
      log.info(`[outbound] drained ${allAlerts.length} pending alerts`);
    }
    return allAlerts;
  } catch {
    return [];
  }
}

export async function patternDetectorHandler(
  event: PluginHookBeforeAgentStartEvent,
  _ctx: PluginHookAgentContext,
): Promise<PluginHookBeforeAgentStartResult | void> {
  const cfg = loadConfig();
  const hookConfig = resolveHookConfig(cfg, "pattern-detector");

  if (hookConfig?.enabled === false) {
    return;
  }

  const patterns: PatternDefinition[] = Array.isArray(hookConfig?.patterns)
    ? (hookConfig.patterns as PatternDefinition[])
    : DEFAULT_PATTERNS;

  const allAlerts: string[] = [];

  // 1. Inbound pattern matching (no cooldown — user messages are organic)
  const prompt = event.prompt;
  if (prompt) {
    allAlerts.push(...runPatternMatching(prompt, patterns, "inbound"));
  }

  // 2. Drain pending outbound alerts with cooldown dedup
  const rawOutbound = drainPendingOutboundAlerts(_ctx.agentId);
  if (rawOutbound.length > 0) {
    const cooldownMs =
      typeof hookConfig?.outboundCooldownMinutes === "number"
        ? hookConfig.outboundCooldownMinutes * 60 * 1000
        : DEFAULT_COOLDOWN_MS;
    const cooldowns = loadAlertCooldowns(_ctx.agentId);
    const now = Date.now();

    // Prune expired entries
    for (const key of Object.keys(cooldowns)) {
      if (now - cooldowns[key] > cooldownMs) {
        delete cooldowns[key];
      }
    }

    // Filter: skip alerts still in cooldown
    const fresh = rawOutbound.filter(
      (alert) => !(alert in cooldowns) || now - cooldowns[alert] > cooldownMs,
    );

    // Record delivered alerts
    for (const alert of fresh) {
      cooldowns[alert] = now;
    }

    saveAlertCooldowns(_ctx.agentId, cooldowns);

    if (fresh.length < rawOutbound.length) {
      log.debug(
        `[outbound] suppressed ${rawOutbound.length - fresh.length} duplicate alerts (cooldown)`,
      );
    }

    allAlerts.push(...fresh);
  }

  if (allAlerts.length === 0) {
    return;
  }

  log.debug(`Pattern detector found ${allAlerts.length} matches (inbound+outbound)`);

  return {
    prependContext: `[Pattern Detector]\n${allAlerts.join("\n")}`,
  };
}
