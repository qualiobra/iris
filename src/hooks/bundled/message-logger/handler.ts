import fs from "node:fs";
import path from "node:path";
import type {
  PluginHookMessageReceivedEvent,
  PluginHookMessageSentEvent,
  PluginHookMessageContext,
} from "../../../plugins/types.js";
import { loadConfig } from "../../../config/config.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import { getContactManager } from "../../../smart-router/contact-manager.js";
import { resolveHookConfig } from "../../config.js";

const log = createSubsystemLogger("hooks/message-logger");

function resolveOutputDir(
  hookConfig: Record<string, unknown> | undefined,
  cfg: Record<string, unknown>,
): string {
  if (hookConfig?.outputDir && typeof hookConfig.outputDir === "string") {
    return hookConfig.outputDir;
  }
  // Resolve from workspace dir
  const agents = cfg.agents as Record<string, unknown> | undefined;
  const defaults = agents?.defaults as Record<string, unknown> | undefined;
  const workspace = defaults?.workspace as Record<string, unknown> | undefined;
  const workspaceDir =
    (workspace?.dir as string) ??
    ((cfg.workspace as Record<string, unknown> | undefined)?.dir as string) ??
    "";
  if (!workspaceDir) {
    return "";
  }
  return path.join(workspaceDir, "chat-history");
}

function slugifyContact(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown"
  );
}

function resolveContactInfo(
  identifier: string,
  metadata?: Record<string, unknown>,
): { name: string; phone: string } {
  // Extract phone from JID (e.g., "5569996021005@s.whatsapp.net" -> "5569996021005")
  const phone = (metadata?.senderE164 as string) ?? identifier.split("@")[0] ?? "";

  // Try senderName from metadata first (WhatsApp display name)
  const senderName = metadata?.senderName as string | undefined;
  if (senderName) {
    return { name: senderName, phone };
  }

  // Try contact manager
  try {
    const contact = getContactManager().findByPhone(phone);
    if (contact?.name) {
      return { name: contact.name, phone };
    }
  } catch {
    // Contact manager may not be initialized
  }

  // Fallback: sanitized phone
  return { name: phone, phone };
}

function formatTimestamp(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function formatDateSection(date: Date): string {
  return date.toISOString().split("T")[0]; // YYYY-MM-DD
}

function buildFilePath(outputDir: string, contactSlug: string, date: Date): string {
  const dateStr = formatDateSection(date);
  return path.join(outputDir, contactSlug, `${dateStr}.md`);
}

async function appendToLog(
  filePath: string,
  contactName: string,
  phone: string,
  date: Date,
  direction: "\u2190" | "\u2192",
  content: string,
): Promise<void> {
  const dirPath = path.dirname(filePath);

  // Create directory if needed
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  const dateStr = formatDateSection(date);
  const timeStr = formatTimestamp(date);
  const fileExists = fs.existsSync(filePath);

  let prefix = "";

  if (!fileExists) {
    // New file: add header
    prefix = `# Chat: ${contactName} (${phone})\n## ${dateStr}\n\n`;
  } else {
    // Check if we need a new date section
    const existingContent = fs.readFileSync(filePath, "utf-8");
    if (!existingContent.includes(`## ${dateStr}`)) {
      prefix = `\n## ${dateStr}\n\n`;
    }
  }

  // Format multiline content
  const formattedContent = content.replace(/\n/g, "\n    ");
  const entry = `${prefix}${direction} ${timeStr} | ${formattedContent}\n`;

  fs.appendFileSync(filePath, entry, "utf-8");
}

export async function messageLoggerReceivedHandler(
  event: PluginHookMessageReceivedEvent,
  _ctx: PluginHookMessageContext,
): Promise<void> {
  try {
    const cfg = loadConfig();
    const hookConfig = resolveHookConfig(cfg, "message-logger");

    if (hookConfig?.enabled === false) {
      return;
    }

    const outputDir = resolveOutputDir(
      hookConfig as Record<string, unknown> | undefined,
      cfg as unknown as Record<string, unknown>,
    );
    if (!outputDir) {
      log.debug("No output directory resolved, skipping message log");
      return;
    }

    const { name, phone } = resolveContactInfo(event.from, event.metadata);
    const contactSlug = slugifyContact(name);
    const date = event.timestamp ? new Date(event.timestamp * 1000) : new Date();
    const filePath = buildFilePath(outputDir, contactSlug, date);

    await appendToLog(filePath, name, phone, date, "\u2190", event.content);
    log.debug(`Logged inbound message from ${name} to ${filePath}`);
  } catch (err) {
    log.error(`Failed to log received message: ${String(err)}`);
  }
}

export async function messageLoggerSentHandler(
  event: PluginHookMessageSentEvent,
  _ctx: PluginHookMessageContext,
): Promise<void> {
  try {
    // Only log successful deliveries
    if (!event.success) {
      return;
    }

    const cfg = loadConfig();
    const hookConfig = resolveHookConfig(cfg, "message-logger");

    if (hookConfig?.enabled === false) {
      return;
    }

    const outputDir = resolveOutputDir(
      hookConfig as Record<string, unknown> | undefined,
      cfg as unknown as Record<string, unknown>,
    );
    if (!outputDir) {
      return;
    }

    const { name, phone } = resolveContactInfo(event.to, undefined);
    const contactSlug = slugifyContact(name);
    const date = new Date();
    const filePath = buildFilePath(outputDir, contactSlug, date);

    await appendToLog(filePath, name, phone, date, "\u2192", event.content);
    log.debug(`Logged outbound message to ${name} at ${filePath}`);
  } catch (err) {
    log.error(`Failed to log sent message: ${String(err)}`);
  }
}
