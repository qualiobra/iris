import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { Context as LlmContext, UserMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, FileOperations } from "@mariozechner/pi-coding-agent";
import { complete } from "@mariozechner/pi-ai";
import { serializeConversation, convertToLlm } from "@mariozechner/pi-coding-agent";
import fs from "node:fs";
import path from "node:path";
import {
  estimateMessagesTokens,
  resolveContextWindowTokens,
  pruneHistoryForContextShare,
  summarizeInStages,
  computeAdaptiveChunkRatio,
  BASE_CHUNK_RATIO,
  SAFETY_MARGIN,
} from "../compaction.js";
import { getCompactionSafeguardRuntime } from "./compaction-safeguard-runtime.js";
import { getHandoverRuntime } from "./iris-handover-runtime.js";

const FALLBACK_SUMMARY =
  "Summary unavailable due to context limits. Older messages were truncated.";

const HANDOVER_SYSTEM_PROMPT = `You are a memory curator for a personal AI assistant. Your job is to create a structured handover document — a "letter to your future self" — that will allow the next session to continue seamlessly.

You are NOT a coding assistant summarizer. You are preserving the SOUL of a relationship between an AI and their owner.

CRITICAL RULES:
1. Replace ALL phone numbers with person names using the contact map provided
2. Never include raw phone numbers in the handover
3. Write in the SAME LANGUAGE the conversation was in
4. Be SPECIFIC: "Emival — permuta apto 706, R$498k" NOT "client — real estate deal"
5. Preserve EMOTIONAL context: "Lucas está empolgado" NOT "user discussed project"
6. Keep it 80-150 lines. Rich but not bloated
7. This is a LETTER to your future self, not a technical report`;

function buildHandoverUserPrompt(params: {
  ownerName: string;
  aiName: string;
  dateTime: string;
  contactsJson: string;
  previousHandover: string | null;
  soulContext: string | null;
  conversation: string;
  maxLines: number;
  language: string;
}): string {
  const previousContext = params.previousHandover
    ? `\n\nPrevious handover (incorporate still-relevant pending items):\n${params.previousHandover}`
    : "";

  const soulRef = params.soulContext
    ? `\n\nPersonality reference (SOUL.md excerpt, first 500 chars):\n${params.soulContext.slice(0, 500)}`
    : "";

  return `Read the conversation below and create a handover document.

The owner's name is: ${params.ownerName}
The AI's name is: ${params.aiName}
Current date/time: ${params.dateTime}
Language: ${params.language}
Max lines: ${params.maxLines}

Contact map (phone → name):
${params.contactsJson}
${soulRef}
${previousContext}

<conversation>
${params.conversation}
</conversation>

Create the handover using this EXACT format:

# 🌈 Handover - [DATE] ~[TIME]

Oi, próxima versão de mim! 👋

## 📍 Situação Atual
[What were we doing? Last action? General state? Write as narrative, 2-3 sentences]

## 🔥 Contexto Emocional
[How is ${params.ownerName} feeling? Mood, concerns, excitement, important events]
[Conversation tone: formal? relaxed? urgent? playful?]

## ✅ Realizações da Sessão
[What was accomplished THIS session — be specific, use checkmarks]
- [x] Item 1
- [x] Item 2

## ⏳ Pendências Ativas
### Aguardando Resposta
[People contacted who haven't replied — NAME, what was asked, when]
- **Name:** Context

### Tarefas em Andamento
[Work started but not finished — enough context to continue]
- [ ] Task with context

### Crons/Automações Ativos
[Active automations that must NOT be touched]

## 📅 Agenda Próxima
[Next 3-5 days of relevant appointments]
- **date time:** event

## 💡 Aprendizados da Sessão
[New facts, corrections, insights discovered]
- ⚠️ Important corrections
- 💡 Discoveries

## ⚠️ Alertas Críticos
[Ad-hoc rules, things that MUST NOT be forgotten]
[Mistakes made this session that must not repeat]

## 💜 Continuidade
[Brief message preserving emotional tone and connection]
[Context that helps the next version "be" the same person]

RULES:
1. Write in ${params.language === "pt-BR" ? "Brazilian Portuguese" : params.language}
2. Use NAMES from the contact map, never phone numbers
3. Be SPECIFIC with names, amounts, dates, context
4. Preserve EMOTIONAL context
5. Keep it ${params.maxLines} lines max
6. If there's a previous handover, incorporate still-relevant pending items
7. Agenda items: include DAY OF WEEK for clarity`;
}

function readFileSync(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function writeFileSync(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function extractTextFromAssistantMessage(message: {
  content: Array<{ type: string; text?: string }>;
}): string {
  return message.content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text!)
    .join("\n");
}

function computeFileLists(fileOps: FileOperations): {
  readFiles: string[];
  modifiedFiles: string[];
} {
  const modified = new Set([...fileOps.edited, ...fileOps.written]);
  const readFiles = [...fileOps.read].filter((f) => !modified.has(f)).toSorted();
  const modifiedFiles = [...modified].toSorted();
  return { readFiles, modifiedFiles };
}

function formatFileOperations(readFiles: string[], modifiedFiles: string[]): string {
  const sections: string[] = [];
  if (readFiles.length > 0) {
    sections.push(`<read-files>\n${readFiles.join("\n")}\n</read-files>`);
  }
  if (modifiedFiles.length > 0) {
    sections.push(`<modified-files>\n${modifiedFiles.join("\n")}\n</modified-files>`);
  }
  if (sections.length === 0) {
    return "";
  }
  return `\n\n${sections.join("\n\n")}`;
}

export default function irisHandoverExtension(api: ExtensionAPI): void {
  api.on("session_before_compact", async (event, ctx) => {
    const { preparation, customInstructions, signal } = event;
    const { readFiles, modifiedFiles } = computeFileLists(preparation.fileOps);
    const fileOpsSummary = formatFileOperations(readFiles, modifiedFiles);

    const model = ctx.model;
    if (!model) {
      return {
        compaction: {
          summary: FALLBACK_SUMMARY + fileOpsSummary,
          firstKeptEntryId: preparation.firstKeptEntryId,
          tokensBefore: preparation.tokensBefore,
          details: { readFiles, modifiedFiles },
        },
      };
    }

    const apiKey = await ctx.modelRegistry.getApiKey(model);
    if (!apiKey) {
      return {
        compaction: {
          summary: FALLBACK_SUMMARY + fileOpsSummary,
          firstKeptEntryId: preparation.firstKeptEntryId,
          tokensBefore: preparation.tokensBefore,
          details: { readFiles, modifiedFiles },
        },
      };
    }

    try {
      const runtime = getHandoverRuntime(ctx.sessionManager);
      const safeguardRuntime = getCompactionSafeguardRuntime(ctx.sessionManager);
      const handoverCfg = runtime?.handoverConfig;
      const workspace = runtime?.workspace ?? process.cwd();

      // Resolve config with defaults
      const contactsFile = path.resolve(
        workspace,
        handoverCfg?.contactsFile ?? "memory/contacts-map.json",
      );
      const outputFile = path.resolve(workspace, handoverCfg?.outputFile ?? "memory/handover.md");
      const soulFile = path.resolve(workspace, handoverCfg?.soulFile ?? "SOUL.md");
      const ownerName = handoverCfg?.ownerName ?? "User";
      const aiName = handoverCfg?.aiName ?? "Assistant";
      const language = handoverCfg?.language ?? "pt-BR";
      const maxLines = handoverCfg?.maxLines ?? 150;
      const preserveVanillaSummary = handoverCfg?.preserveVanillaSummary ?? true;

      // Read auxiliary files
      const contactsRaw = readFileSync(contactsFile);
      const contactsJson = contactsRaw ?? "{}";
      const soulContext = readFileSync(soulFile);
      const previousHandover = readFileSync(outputFile);

      // Handle message pruning (same as safeguard) for context management
      const modelContextWindow = resolveContextWindowTokens(model);
      const contextWindowTokens =
        safeguardRuntime?.contextWindowTokens ?? runtime?.contextWindowTokens ?? modelContextWindow;
      const maxHistoryShare = safeguardRuntime?.maxHistoryShare ?? runtime?.maxHistoryShare ?? 0.5;
      let messagesToProcess = preparation.messagesToSummarize;

      const tokensBefore =
        typeof preparation.tokensBefore === "number" && Number.isFinite(preparation.tokensBefore)
          ? preparation.tokensBefore
          : undefined;

      if (tokensBefore !== undefined) {
        const summarizableTokens =
          estimateMessagesTokens(messagesToProcess) +
          estimateMessagesTokens(preparation.turnPrefixMessages ?? []);
        const newContentTokens = Math.max(0, Math.floor(tokensBefore - summarizableTokens));
        const maxHistoryTokens = Math.floor(contextWindowTokens * maxHistoryShare * SAFETY_MARGIN);

        if (newContentTokens > maxHistoryTokens) {
          const pruned = pruneHistoryForContextShare({
            messages: messagesToProcess,
            maxContextTokens: contextWindowTokens,
            maxHistoryShare,
            parts: 2,
          });
          if (pruned.droppedChunks > 0) {
            messagesToProcess = pruned.messages;
          }
        }
      }

      // Serialize conversation for the handover prompt
      const llmMessages = convertToLlm(messagesToProcess);
      const conversationText = serializeConversation(llmMessages);

      // Truncate conversation if too long (keep last ~60% for recency bias)
      const maxConversationChars = Math.floor(contextWindowTokens * 2); // rough char estimate
      let trimmedConversation = conversationText;
      if (trimmedConversation.length > maxConversationChars) {
        const keepChars = Math.floor(maxConversationChars * 0.6);
        trimmedConversation =
          "[...earlier conversation truncated...]\n\n" +
          conversationText.slice(conversationText.length - keepChars);
      }

      // Build the handover prompt
      const now = new Date();
      const dateTime = now.toLocaleString("pt-BR", {
        timeZone: "America/Manaus",
        dateStyle: "full",
        timeStyle: "short",
      });

      const userPrompt = buildHandoverUserPrompt({
        ownerName,
        aiName,
        dateTime,
        contactsJson,
        previousHandover,
        soulContext,
        conversation: trimmedConversation,
        maxLines,
        language,
      });

      // Make the LLM call with custom system prompt
      const llmContext: LlmContext = {
        systemPrompt: HANDOVER_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: userPrompt }],
            timestamp: Date.now(),
          } as UserMessage,
        ],
      };

      const result = await complete(model, llmContext, {
        apiKey,
        signal,
        maxTokens: Math.min(model.maxTokens, 4096),
      } as any);

      const handoverText = extractTextFromAssistantMessage(result);

      if (!handoverText || handoverText.trim().length < 50) {
        throw new Error("Handover generation returned empty or too short result");
      }

      // Save handover to disk
      writeFileSync(outputFile, handoverText);
      console.log(`[iris-handover] Saved handover to ${outputFile} (${handoverText.length} chars)`);

      // Build the summary to return to OpenClaw
      let summary: string;

      if (preserveVanillaSummary) {
        // Hybrid mode: generate a vanilla summary too for the context
        try {
          const adaptiveRatio = computeAdaptiveChunkRatio(messagesToProcess, contextWindowTokens);
          const maxChunkTokens = Math.max(1, Math.floor(contextWindowTokens * adaptiveRatio));
          const reserveTokens = Math.max(1, Math.floor(preparation.settings.reserveTokens));

          const vanillaSummary = await summarizeInStages({
            messages: messagesToProcess,
            model,
            apiKey,
            signal,
            reserveTokens,
            maxChunkTokens,
            contextWindow: contextWindowTokens,
            customInstructions,
            previousSummary: preparation.previousSummary,
          });

          summary = vanillaSummary;
        } catch (vanillaError) {
          console.warn(
            `[iris-handover] Vanilla summary fallback failed: ${
              vanillaError instanceof Error ? vanillaError.message : String(vanillaError)
            }`,
          );
          // Use handover text as summary fallback
          summary = `[Handover saved to ${outputFile}]\n\n${handoverText.slice(0, 2000)}`;
        }
      } else {
        // Pure handover mode: use handover as the summary
        summary = handoverText;
      }

      summary += fileOpsSummary;

      return {
        compaction: {
          summary,
          firstKeptEntryId: preparation.firstKeptEntryId,
          tokensBefore: preparation.tokensBefore,
          details: { readFiles, modifiedFiles },
        },
      };
    } catch (error) {
      console.warn(
        `[iris-handover] Handover generation failed, falling back to vanilla: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      // Fallback: try vanilla summarization (same as compaction-safeguard)
      try {
        const safeguardRuntime = getCompactionSafeguardRuntime(ctx.sessionManager);
        const modelContextWindow = resolveContextWindowTokens(model);
        const contextWindowTokens = safeguardRuntime?.contextWindowTokens ?? modelContextWindow;
        const adaptiveRatio = computeAdaptiveChunkRatio(
          preparation.messagesToSummarize,
          contextWindowTokens,
        );
        const maxChunkTokens = Math.max(1, Math.floor(contextWindowTokens * adaptiveRatio));
        const reserveTokens = Math.max(1, Math.floor(preparation.settings.reserveTokens));

        const vanillaSummary = await summarizeInStages({
          messages: preparation.messagesToSummarize,
          model,
          apiKey,
          signal,
          reserveTokens,
          maxChunkTokens,
          contextWindow: contextWindowTokens,
          customInstructions,
          previousSummary: preparation.previousSummary,
        });

        return {
          compaction: {
            summary: vanillaSummary + fileOpsSummary,
            firstKeptEntryId: preparation.firstKeptEntryId,
            tokensBefore: preparation.tokensBefore,
            details: { readFiles, modifiedFiles },
          },
        };
      } catch {
        return {
          compaction: {
            summary: FALLBACK_SUMMARY + fileOpsSummary,
            firstKeptEntryId: preparation.firstKeptEntryId,
            tokensBefore: preparation.tokensBefore,
            details: { readFiles, modifiedFiles },
          },
        };
      }
    }
  });
}
