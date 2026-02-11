import type { Api, Model } from "@mariozechner/pi-ai";
import type { SessionManager } from "@mariozechner/pi-coding-agent";
import type { OpenClawConfig } from "../../config/config.js";
import { resolveContextWindowInfo } from "../context-window-guard.js";
import { DEFAULT_CONTEXT_TOKENS } from "../defaults.js";
import { setCompactionSafeguardRuntime } from "../pi-extensions/compaction-safeguard-runtime.js";
import compactionSafeguardExtension from "../pi-extensions/compaction-safeguard.js";
import contextPruningExtension from "../pi-extensions/context-pruning.js";
import { setContextPruningRuntime } from "../pi-extensions/context-pruning/runtime.js";
import { computeEffectiveSettings } from "../pi-extensions/context-pruning/settings.js";
import { makeToolPrunablePredicate } from "../pi-extensions/context-pruning/tools.js";
import { setHandoverRuntime } from "../pi-extensions/iris-handover-runtime.js";
import irisHandoverExtension from "../pi-extensions/iris-handover.js";
import { ensurePiCompactionReserveTokens } from "../pi-settings.js";
import { isCacheTtlEligibleProvider, readLastCacheTtlTimestamp } from "./cache-ttl.js";

type ExtensionFactory = (api: any) => void;

function resolveContextWindowTokens(params: {
  cfg: OpenClawConfig | undefined;
  provider: string;
  modelId: string;
  model: Model<Api> | undefined;
}): number {
  return resolveContextWindowInfo({
    cfg: params.cfg,
    provider: params.provider,
    modelId: params.modelId,
    modelContextWindow: params.model?.contextWindow,
    defaultTokens: DEFAULT_CONTEXT_TOKENS,
  }).tokens;
}

function buildContextPruningFactory(params: {
  cfg: OpenClawConfig | undefined;
  sessionManager: SessionManager;
  provider: string;
  modelId: string;
  model: Model<Api> | undefined;
}): { factory?: ExtensionFactory } {
  const raw = params.cfg?.agents?.defaults?.contextPruning;
  if (raw?.mode !== "cache-ttl") {
    return {};
  }
  if (!isCacheTtlEligibleProvider(params.provider, params.modelId)) {
    return {};
  }

  const settings = computeEffectiveSettings(raw);
  if (!settings) {
    return {};
  }

  setContextPruningRuntime(params.sessionManager, {
    settings,
    contextWindowTokens: resolveContextWindowTokens(params),
    isToolPrunable: makeToolPrunablePredicate(settings.tools),
    lastCacheTouchAt: readLastCacheTtlTimestamp(params.sessionManager),
  });

  return { factory: contextPruningExtension };
}

function resolveCompactionMode(cfg?: OpenClawConfig): "default" | "safeguard" | "handover" {
  const mode = cfg?.agents?.defaults?.compaction?.mode;
  if (mode === "safeguard" || mode === "handover") {
    return mode;
  }
  return "default";
}

export function buildEmbeddedExtensions(params: {
  cfg: OpenClawConfig | undefined;
  sessionManager: SessionManager;
  provider: string;
  modelId: string;
  model: Model<Api> | undefined;
}): { extensionFactories: ExtensionFactory[] } {
  const factories: ExtensionFactory[] = [];
  const compactionMode = resolveCompactionMode(params.cfg);
  if (compactionMode === "safeguard" || compactionMode === "handover") {
    const compactionCfg = params.cfg?.agents?.defaults?.compaction;
    const contextWindowInfo = resolveContextWindowInfo({
      cfg: params.cfg,
      provider: params.provider,
      modelId: params.modelId,
      modelContextWindow: params.model?.contextWindow,
      defaultTokens: DEFAULT_CONTEXT_TOKENS,
    });

    if (compactionMode === "safeguard") {
      setCompactionSafeguardRuntime(params.sessionManager, {
        maxHistoryShare: compactionCfg?.maxHistoryShare,
        contextWindowTokens: contextWindowInfo.tokens,
      });
      factories.push(compactionSafeguardExtension);
    } else {
      // handover mode — also sets safeguard runtime as fallback
      setCompactionSafeguardRuntime(params.sessionManager, {
        maxHistoryShare: compactionCfg?.maxHistoryShare,
        contextWindowTokens: contextWindowInfo.tokens,
      });
      setHandoverRuntime(params.sessionManager, {
        contextWindowTokens: contextWindowInfo.tokens,
        maxHistoryShare: compactionCfg?.maxHistoryShare,
        handoverConfig: compactionCfg?.handover,
        workspace: params.cfg?.agents?.defaults?.workspace,
      });
      factories.push(irisHandoverExtension);
    }
  }
  const pruning = buildContextPruningFactory(params);
  if (pruning.factory) {
    factories.push(pruning.factory);
  }
  return { extensionFactories: factories };
}

export { ensurePiCompactionReserveTokens };
