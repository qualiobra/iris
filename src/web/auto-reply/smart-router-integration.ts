/**
 * Smart Router Integration
 * Integra o Smart Router no fluxo de auto-reply do WhatsApp
 *
 * Regra principal: Mensagens sem prefixo de destinatário vão APENAS pro owner.
 * Isso evita vazamento de mensagens internas para terceiros.
 *
 * @author Iris 🌈
 * @date 2026-01-30
 */

import { getSmartRouter, initSmartRouter } from "../../smart-router/index.js";
import { initContactManager } from "../../smart-router/contact-manager.js";
import type { ParsedOutbound } from "../../smart-router/types.js";
import type { loadConfig } from "../../config/config.js";
import { logVerbose } from "../../globals.js";
import { getActiveWebListener } from "../active-listener.js";
import * as path from "node:path";
import * as fs from "node:fs";

let initialized = false;

/**
 * Inicializa o Smart Router com configurações do gateway
 */
export function initSmartRouterFromConfig(params: {
  cfg: ReturnType<typeof loadConfig>;
  workspaceDir: string;
}): boolean {
  if (initialized) return true;

  const smartRouterConfig = params.cfg.smartRouter;
  if (!smartRouterConfig?.enabled) {
    logVerbose("[SmartRouter] Desabilitado na configuração");
    return false;
  }

  const ownerPhone = smartRouterConfig.ownerPhone;
  const ownerName = smartRouterConfig.ownerName;

  if (!ownerPhone || !ownerName) {
    logVerbose("[SmartRouter] ownerPhone ou ownerName não configurados");
    return false;
  }

  // Resolve caminho do CONTATOS.md
  const contactsPath =
    smartRouterConfig.contactsPath ?? path.join(params.workspaceDir, "CONTATOS.md");

  if (!fs.existsSync(contactsPath)) {
    logVerbose(`[SmartRouter] CONTATOS.md não encontrado em: ${contactsPath}`);
    return false;
  }

  try {
    initContactManager(contactsPath);
    initSmartRouter({
      ownerPhone,
      ownerName,
      contactsPath,
      verbose: smartRouterConfig.verbose ?? false,
    });
    initialized = true;
    logVerbose(`[SmartRouter] Inicializado - Owner: ${ownerName} (${ownerPhone})`);
    return true;
  } catch (err) {
    logVerbose(`[SmartRouter] Erro na inicialização: ${String(err)}`);
    return false;
  }
}

/**
 * Verifica se o Smart Router está ativo
 */
export function isSmartRouterActive(): boolean {
  return initialized && getSmartRouter() !== null;
}

/**
 * Formata mensagem de entrada com prefixo do remetente
 * Usado para que o agente saiba de quem veio a mensagem
 *
 * @example
 * formatIncomingMessage("+556981122833", "Qual a km?")
 * // Retorna: "(DANIELA BYD): Qual a km?"
 */
export function formatIncomingMessage(phone: string, content: string): string {
  const router = getSmartRouter();
  if (!router) return content;

  // Não formata mensagens do owner
  if (router.isFromOwner(phone)) {
    return content;
  }

  const formatted = router.formatIncoming(phone, content);
  return formatted.fullMessage;
}

/**
 * Verifica se uma mensagem é do owner
 */
export function isMessageFromOwner(phone: string): boolean {
  const router = getSmartRouter();
  if (!router) return true; // Se não tem router, assume que é do owner (comportamento padrão)
  return router.isFromOwner(phone);
}

export interface RouteDecision {
  /** Se deve usar roteamento personalizado */
  useCustomRouting: boolean;
  /** Lista de destinatários e mensagens */
  routes: ParsedOutbound[];
  /** Telefone do owner (fallback) */
  ownerPhone: string;
  /** Se a mensagem original era do owner */
  isFromOwner: boolean;
}

/**
 * Decide para onde a resposta deve ir
 *
 * Regras:
 * 1. Se a mensagem original é do owner → responde pro owner (comportamento padrão)
 * 2. Se a resposta tem prefixo "(NOME): mensagem" → roteia pro destinatário
 * 3. Se a resposta NÃO tem prefixo → vai pro OWNER, não pro remetente original
 *
 * @param originalFrom Telefone de quem mandou a mensagem original
 * @param agentResponse Resposta gerada pelo agente
 */
export function decideRouting(originalFrom: string, agentResponse: string): RouteDecision {
  const router = getSmartRouter();

  // Se não tem router, comportamento padrão (responde pra quem mandou)
  if (!router) {
    return {
      useCustomRouting: false,
      routes: [],
      ownerPhone: "",
      isFromOwner: true,
    };
  }

  const owner = router.getOwner();
  const isFromOwner = router.isFromOwner(originalFrom);

  // Se é do owner, não precisa de roteamento especial
  if (isFromOwner) {
    return {
      useCustomRouting: false,
      routes: [],
      ownerPhone: owner.phone,
      isFromOwner: true,
    };
  }

  // Verifica se a resposta tem prefixo de destinatário
  const hasPrefix = router.hasTargetPrefix(agentResponse);

  if (hasPrefix) {
    // Resposta tem prefixo → roteia conforme especificado
    const routes = router.processOutgoing(agentResponse);
    return {
      useCustomRouting: true,
      routes,
      ownerPhone: owner.phone,
      isFromOwner: false,
    };
  }

  // Resposta SEM prefixo de terceiro → vai pro OWNER (regra de segurança!)
  // Isso evita vazamento de mensagens internas
  return {
    useCustomRouting: true,
    routes: [
      {
        targetName: owner.name,
        targetPhone: owner.phone,
        cleanContent: agentResponse.trim(),
        success: true,
      },
    ],
    ownerPhone: owner.phone,
    isFromOwner: false,
  };
}

/**
 * Retorna informações do owner
 */
export function getOwnerInfo(): { name: string; phone: string } | null {
  const router = getSmartRouter();
  if (!router) return null;
  return router.getOwner();
}

/**
 * Envia mensagem para um destinatário específico usando o listener ativo
 *
 * @param to Número de telefone do destinatário
 * @param text Texto da mensagem
 * @param accountId ID da conta WhatsApp (opcional)
 */
export async function sendToTarget(
  to: string,
  text: string,
  accountId?: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const listener = getActiveWebListener(accountId);
  if (!listener) {
    return {
      success: false,
      error: "No active WhatsApp listener",
    };
  }

  try {
    const result = await listener.sendMessage(to, text);
    logVerbose(`[SmartRouter] Mensagem enviada para ${to}: ${text.slice(0, 50)}...`);
    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logVerbose(`[SmartRouter] Erro ao enviar para ${to}: ${error}`);
    return {
      success: false,
      error,
    };
  }
}

/**
 * Processa e envia uma resposta usando o Smart Router
 *
 * Esta função implementa a regra de segurança:
 * - Se a mensagem original não é do owner
 * - E a resposta não tem prefixo de destinatário
 * - Então a resposta vai pro OWNER, não pro remetente original
 *
 * @param originalFrom Telefone de quem mandou a mensagem original
 * @param agentResponse Resposta do agente
 * @param accountId ID da conta WhatsApp (opcional)
 * @returns Array com resultados de cada envio
 */
export async function routeAndSendResponse(
  originalFrom: string,
  agentResponse: string,
  accountId?: string,
): Promise<
  Array<{
    target: string;
    success: boolean;
    messageId?: string;
    error?: string;
  }>
> {
  const routing = decideRouting(originalFrom, agentResponse);

  // Se não precisa de roteamento customizado, retorna vazio (usa fluxo padrão)
  if (!routing.useCustomRouting) {
    return [];
  }

  const results: Array<{
    target: string;
    success: boolean;
    messageId?: string;
    error?: string;
  }> = [];

  for (const route of routing.routes) {
    if (!route.success || !route.targetPhone) {
      logVerbose(`[SmartRouter] Rota falhou: ${route.error}`);
      results.push({
        target: route.targetName,
        success: false,
        error: route.error ?? "Target phone not found",
      });
      continue;
    }

    const sendResult = await sendToTarget(route.targetPhone, route.cleanContent, accountId);
    results.push({
      target: route.targetPhone,
      ...sendResult,
    });
  }

  return results;
}
