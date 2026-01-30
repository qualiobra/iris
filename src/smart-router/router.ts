/**
 * Smart Router V3 - Main Router
 * Roteador inteligente para formatação e direcionamento de mensagens
 *
 * @author Iris 🌈
 * @date 2026-01-30
 */

import { getContactManager, type ContactManager } from "./contact-manager.js";
import type { Contact, FormattedInbound, ParsedOutbound, RouterConfig } from "./types.js";

export class SmartRouter {
  private contactManager: ContactManager;
  private ownerPhone: string;
  private ownerName: string;
  private verbose: boolean;

  constructor(config: RouterConfig) {
    this.contactManager = getContactManager();
    this.ownerPhone = this.contactManager.normalizePhone(config.ownerPhone);
    this.ownerName = config.ownerName.toUpperCase();
    this.verbose = config.verbose ?? false;

    // Adiciona o dono como contato
    this.contactManager.addContact(config.ownerName, [config.ownerPhone]);

    if (this.verbose) {
      console.log(`[SmartRouter] Inicializado`);
      console.log(`  - Dono: ${this.ownerName} (${this.contactManager.formatPhone(this.ownerPhone)})`);
    }
  }

  // ===========================================================================
  // ENTRADA DE MENSAGENS
  // ===========================================================================

  /**
   * Formata uma mensagem de entrada com prefixo do contato
   *
   * Entrada: telefone + mensagem
   * Saída: "(NOME PESSOA): mensagem"
   */
  formatIncoming(phone: string, content: string): FormattedInbound {
    const normalizedPhone = this.contactManager.normalizePhone(phone);
    const contact = this.contactManager.findByPhone(phone);

    if (contact) {
      // Contato conhecido
      const prefix = `(${contact.name})`;
      return {
        prefix,
        content,
        fullMessage: `${prefix}: ${content}`,
        contact,
        phone,
        normalizedPhone,
      };
    }

    // Contato desconhecido
    const formattedPhone = this.contactManager.formatPhone(phone);
    const prefix = `(DESCONHECIDO ${formattedPhone})`;

    return {
      prefix,
      content,
      fullMessage: `${prefix}: ${content}`,
      phone,
      normalizedPhone,
      context: "Contato não encontrado em CONTATOS.md",
    };
  }

  /**
   * Verifica se uma mensagem é do dono
   */
  isFromOwner(phone: string): boolean {
    const normalized = this.contactManager.normalizePhone(phone);
    return normalized === this.ownerPhone || normalized.slice(-8) === this.ownerPhone.slice(-8);
  }

  // ===========================================================================
  // SAÍDA DE MENSAGENS
  // ===========================================================================

  /**
   * Regex para extrair prefixo de mensagem
   * Exemplos:
   * - "(DANIELA BYD): mensagem" -> { name: "DANIELA BYD", content: "mensagem" }
   * - "(LUCAS): oi" -> { name: "LUCAS", content: "oi" }
   */
  private static PREFIX_REGEX = /^\(([^)]+)\):\s*(.*)$/s;

  /**
   * Processa uma resposta do agente e extrai o destinatário
   *
   * Entrada: "(DANIELA BYD): Ok, agendado!"
   * Saída: { targetPhone: "+556981122833", cleanContent: "Ok, agendado!" }
   */
  processOutgoing(agentResponse: string): ParsedOutbound[] {
    const results: ParsedOutbound[] = [];
    const lines = agentResponse.split("\n");

    let currentTarget: string | null = null;
    let currentContent: string[] = [];

    for (const line of lines) {
      // Tenta extrair prefixo
      const prefixMatch = line.match(SmartRouter.PREFIX_REGEX);

      if (prefixMatch) {
        // Nova mensagem com prefixo
        // Primeiro, finaliza a anterior se houver
        if (currentTarget !== null) {
          results.push(this.resolveOutgoing(currentTarget, currentContent.join("\n")));
        }

        currentTarget = prefixMatch[1];
        currentContent = prefixMatch[2] ? [prefixMatch[2]] : [];
      } else if (currentTarget !== null) {
        // Continuação da mensagem atual
        currentContent.push(line);
      } else {
        // Sem prefixo e sem contexto anterior - vai pro dono
        if (line.trim()) {
          currentTarget = this.ownerName;
          currentContent.push(line);
        }
      }
    }

    // Finaliza a última
    if (currentTarget !== null) {
      results.push(this.resolveOutgoing(currentTarget, currentContent.join("\n")));
    }

    // Se não extraiu nada, manda tudo pro dono
    if (results.length === 0 && agentResponse.trim()) {
      results.push({
        targetName: this.ownerName,
        targetPhone: this.ownerPhone,
        cleanContent: agentResponse.trim(),
        success: true,
      });
    }

    return results;
  }

  /**
   * Resolve um destinatário específico
   */
  private resolveOutgoing(targetName: string, content: string): ParsedOutbound {
    const normalizedName = targetName.toUpperCase().trim();
    const cleanContent = content.trim();

    // Busca contato (com fuzzy matching)
    const contact = this.contactManager.findByName(normalizedName);

    if (contact) {
      return {
        targetName: contact.name,
        targetPhone: contact.phones[0],
        cleanContent,
        success: true,
      };
    }

    // Contato não encontrado
    return {
      targetName: normalizedName,
      cleanContent,
      success: false,
      error: `Contato "${normalizedName}" não encontrado. Disponíveis: ${this.contactManager
        .listAll()
        .map((c) => c.name)
        .join(", ")}`,
    };
  }

  /**
   * Processa uma única resposta (conveniente para respostas simples)
   */
  processOutgoingSingle(agentResponse: string): ParsedOutbound {
    const results = this.processOutgoing(agentResponse);
    return (
      results[0] ?? {
        targetName: this.ownerName,
        targetPhone: this.ownerPhone,
        cleanContent: agentResponse,
        success: true,
      }
    );
  }

  /**
   * Verifica se uma resposta tem prefixo de destinatário
   */
  hasTargetPrefix(response: string): boolean {
    const firstLine = response.split("\n")[0];
    return SmartRouter.PREFIX_REGEX.test(firstLine);
  }

  // ===========================================================================
  // UTILITÁRIOS
  // ===========================================================================

  /**
   * Busca contato por telefone
   */
  findContact(phone: string): Contact | undefined {
    return this.contactManager.findByPhone(phone);
  }

  /**
   * Lista todos os contatos
   */
  listContacts(): Contact[] {
    return this.contactManager.listAll();
  }

  /**
   * Formata número para exibição
   */
  formatPhone(phone: string): string {
    return this.contactManager.formatPhone(phone);
  }

  /**
   * Normaliza número de telefone
   */
  normalizePhone(phone: string): string {
    return this.contactManager.normalizePhone(phone);
  }

  /**
   * Retorna informações do dono
   */
  getOwner(): { name: string; phone: string } {
    return {
      name: this.ownerName,
      phone: this.ownerPhone,
    };
  }
}

// Singleton para uso global
let globalRouter: SmartRouter | null = null;

export function getSmartRouter(): SmartRouter | null {
  return globalRouter;
}

export function initSmartRouter(config: RouterConfig): SmartRouter {
  globalRouter = new SmartRouter(config);
  return globalRouter;
}
