/**
 * Smart Router V3 - Types
 * Tipos para o roteador inteligente de mensagens
 *
 * @author Iris 🌈
 * @date 2026-01-30
 */

export interface Contact {
  /** Nome do contato (MAIÚSCULO para matching) */
  name: string;
  /** Lista de números de telefone (formato original) */
  phones: string[];
  /** Números normalizados (E.164 sem +) */
  normalizedPhones: string[];
  /** Apelidos alternativos para matching */
  aliases?: string[];
  /** Categoria do contato (família, trabalho, etc.) */
  category?: string;
}

export interface FormattedInbound {
  /** Prefixo formatado: "(NOME PESSOA)" */
  prefix: string;
  /** Conteúdo da mensagem */
  content: string;
  /** Mensagem completa: "(NOME PESSOA): conteúdo" */
  fullMessage: string;
  /** Contato encontrado (se houver) */
  contact?: Contact;
  /** Contexto de menções anteriores (para desconhecidos) */
  context?: string;
  /** Número de telefone original */
  phone: string;
  /** Número normalizado */
  normalizedPhone: string;
}

export interface ParsedOutbound {
  /** Nome extraído do prefixo */
  targetName: string;
  /** Número de telefone encontrado */
  targetPhone?: string;
  /** Mensagem sem o prefixo */
  cleanContent: string;
  /** Se conseguiu resolver o destinatário */
  success: boolean;
  /** Erro se não conseguiu */
  error?: string;
}

export interface RouterConfig {
  /** Telefone do dono (para fallback) */
  ownerPhone: string;
  /** Nome do dono */
  ownerName: string;
  /** Caminho para CONTATOS.md */
  contactsPath?: string;
  /** Habilitar logs detalhados */
  verbose?: boolean;
}
