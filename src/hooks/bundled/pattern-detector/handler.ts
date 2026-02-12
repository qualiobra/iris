import type {
  PluginHookBeforeAgentStartEvent,
  PluginHookAgentContext,
  PluginHookBeforeAgentStartResult,
} from "../../../plugins/types.js";
import { loadConfig } from "../../../config/config.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import { resolveHookConfig } from "../../config.js";

const log = createSubsystemLogger("hooks/pattern-detector");

export type PatternDefinition = {
  id: string;
  label: string;
  regex: string;
  flags?: string;
  template: string;
  enabled: boolean;
};

export const DEFAULT_PATTERNS: PatternDefinition[] = [
  {
    id: "phone",
    label: "Telefone",
    regex: "\\+?\\d{2}\\s?\\(?\\d{2}\\)?\\s?\\d{4,5}[-.\\s]?\\d{4}",
    flags: "g",
    template: "⚡ Numero detectado: {{match}}. Verificar: existe nos contatos? Salvar?",
    enabled: true,
  },
  {
    id: "date",
    label: "Data",
    regex: "\\d{1,2}/\\d{1,2}(/\\d{2,4})?",
    flags: "g",
    template: "📅 Data mencionada: {{match}}. Criar evento/lembrete?",
    enabled: true,
  },
  {
    id: "currency",
    label: "Valor R$",
    regex: "R\\$\\s?[\\d.,]+",
    flags: "g",
    template: "💰 Valor detectado: {{match}}. Registrar no financeiro?",
    enabled: true,
  },
  {
    id: "url",
    label: "Link/URL",
    regex: "https?://\\S+",
    flags: "gi",
    template: "🔗 Link recebido: {{match}}. Classificar e salvar?",
    enabled: true,
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

  const prompt = event.prompt;
  if (!prompt) {
    return;
  }

  // Strip all bracket metadata (envelope headers, structural markers)
  // to avoid matching sender phones, timestamps, etc.
  const body = prompt.replace(/\[[^\]]+\]\s*/g, "");

  const alerts: string[] = [];
  const seenMatches = new Set<string>();

  for (const pattern of patterns) {
    if (!pattern.enabled) {
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

  if (alerts.length === 0) {
    return;
  }

  log.debug(`Pattern detector found ${alerts.length} matches`);

  return {
    prependContext: `[Pattern Detector]\n${alerts.join("\n")}`,
  };
}
