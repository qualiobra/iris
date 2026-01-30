/**
 * Smart Router V3 - Tests
 * Testes para o roteador inteligente
 *
 * @author Iris 🌈
 * @date 2026-01-30
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ContactManager } from "./contact-manager.js";
import { SmartRouter } from "./router.js";

describe("ContactManager", () => {
  let manager: ContactManager;

  beforeEach(() => {
    manager = new ContactManager();
  });

  describe("normalizePhone", () => {
    it("normaliza número brasileiro com formatação", () => {
      expect(manager.normalizePhone("+55 69 9602-1005")).toBe("556996021005");
    });

    it("adiciona código do país se ausente", () => {
      expect(manager.normalizePhone("69 9602-1005")).toBe("556996021005");
    });

    it("remove zeros iniciais", () => {
      expect(manager.normalizePhone("069 9602-1005")).toBe("556996021005");
    });
  });

  describe("addContact e findByPhone", () => {
    it("encontra contato por telefone exato", () => {
      manager.addContact("Daniela BYD", ["+55 69 8112-2833"]);
      const contact = manager.findByPhone("+55 69 8112-2833");
      expect(contact?.name).toBe("DANIELA BYD");
    });

    it("encontra contato por variação do número", () => {
      manager.addContact("Daniela BYD", ["+55 69 8112-2833"]);

      // Sem formatação
      expect(manager.findByPhone("5569811228")?.name).toBe("DANIELA BYD");

      // Últimos 8 dígitos
      expect(manager.findByPhone("81122833")?.name).toBe("DANIELA BYD");
    });
  });

  describe("findByName", () => {
    beforeEach(() => {
      manager.addContact("Lucas Araújo", ["+55 69 9602-1005"]);
      manager.addContact("Daniela BYD", ["+55 69 8112-2833"], ["Dani"]);
      manager.addContact("Paola", ["+55 69 9274-7532"]);
    });

    it("encontra por nome exato", () => {
      expect(manager.findByName("Lucas Araújo")?.name).toBe("LUCAS ARAÚJO");
    });

    it("encontra por primeiro nome", () => {
      expect(manager.findByName("Lucas")?.name).toBe("LUCAS ARAÚJO");
    });

    it("encontra por alias", () => {
      expect(manager.findByName("Dani")?.name).toBe("DANIELA BYD");
    });

    it("é case-insensitive", () => {
      expect(manager.findByName("lucas araújo")?.name).toBe("LUCAS ARAÚJO");
      expect(manager.findByName("PAOLA")?.name).toBe("PAOLA");
    });

    it("retorna undefined para contato não encontrado", () => {
      expect(manager.findByName("João Silva")).toBeUndefined();
    });
  });

  describe("parseMarkdown", () => {
    it("parseia formato básico", () => {
      const markdown = `
## 👨‍👩‍👧‍👦 Família

### Lucas Araújo
- WhatsApp: +55 69 9602-1005

### Roxana
- WhatsApp: +55 69 9910-1005
- Apelidos: Rox

## 🏗️ Trabalho

### Daniela BYD
- WhatsApp: +55 69 8112-2833
- Apelidos: Dani, Daniela
`;
      // Usando método privado via cast
      (manager as any).parseMarkdown(markdown);

      expect(manager.listAll().length).toBe(3);
      expect(manager.findByName("Lucas")?.category).toBe("👨‍👩‍👧‍👦 Família");
      expect(manager.findByName("Daniela")?.category).toBe("🏗️ Trabalho");
      expect(manager.findByName("Rox")?.name).toBe("ROXANA");
    });
  });
});

describe("SmartRouter", () => {
  let router: SmartRouter;

  beforeEach(() => {
    // Reset singleton
    const contactManager = new ContactManager();
    contactManager.addContact("Lucas Araújo", ["+55 69 9602-1005"]);
    contactManager.addContact("Daniela BYD", ["+55 69 8112-2833"], ["Dani"]);
    contactManager.addContact("Paola", ["+55 69 9274-7532"]);

    router = new SmartRouter({
      ownerPhone: "+55 69 9602-1005",
      ownerName: "Lucas Araújo",
    });
  });

  describe("formatIncoming", () => {
    it("formata mensagem de contato conhecido", () => {
      const result = router.formatIncoming("+556981122833", "Oi, tudo bem?");

      expect(result.prefix).toBe("(DANIELA BYD)");
      expect(result.fullMessage).toBe("(DANIELA BYD): Oi, tudo bem?");
      expect(result.contact?.name).toBe("DANIELA BYD");
    });

    it("formata mensagem de contato desconhecido", () => {
      const result = router.formatIncoming("+556999999999", "Olá!");

      expect(result.prefix).toContain("DESCONHECIDO");
      expect(result.contact).toBeUndefined();
      expect(result.context).toBeDefined();
    });
  });

  describe("processOutgoing", () => {
    it("extrai destinatário de mensagem com prefixo", () => {
      const results = router.processOutgoing("(DANIELA BYD): Ok, agendado para amanhã!");

      expect(results.length).toBe(1);
      expect(results[0].targetName).toBe("DANIELA BYD");
      expect(results[0].cleanContent).toBe("Ok, agendado para amanhã!");
      expect(results[0].success).toBe(true);
    });

    it("usa fuzzy matching para aliases", () => {
      const results = router.processOutgoing("(DANI): Combinado!");

      expect(results[0].targetName).toBe("DANIELA BYD");
      expect(results[0].success).toBe(true);
    });

    it("processa múltiplos destinatários", () => {
      const response = `(DANIELA BYD): Confirmado para amanhã!
(LUCAS ARAÚJO): Daniela confirmou a visita.`;

      const results = router.processOutgoing(response);

      expect(results.length).toBe(2);
      expect(results[0].targetName).toBe("DANIELA BYD");
      expect(results[1].targetName).toBe("LUCAS ARAÚJO");
    });

    it("envia para dono quando sem prefixo", () => {
      const results = router.processOutgoing("Esta mensagem não tem prefixo.");

      expect(results.length).toBe(1);
      expect(results[0].targetName).toBe("LUCAS ARAÚJO");
      expect(results[0].cleanContent).toBe("Esta mensagem não tem prefixo.");
    });

    it("retorna erro para contato não encontrado", () => {
      const results = router.processOutgoing("(JOÃO SILVA): Olá!");

      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain("não encontrado");
    });

    it("preserva mensagens multi-linha", () => {
      const response = `(DANIELA BYD): Segue os dados:
- Nome: João
- Telefone: 123456
- Endereço: Rua X`;

      const results = router.processOutgoing(response);

      expect(results[0].cleanContent).toContain("- Nome: João");
      expect(results[0].cleanContent).toContain("- Endereço: Rua X");
    });
  });

  describe("isFromOwner", () => {
    it("identifica mensagem do dono", () => {
      expect(router.isFromOwner("+556996021005")).toBe(true);
      expect(router.isFromOwner("556996021005")).toBe(true);
    });

    it("não identifica outros como dono", () => {
      expect(router.isFromOwner("+556981122833")).toBe(false);
    });
  });

  describe("hasTargetPrefix", () => {
    it("detecta mensagem com prefixo", () => {
      expect(router.hasTargetPrefix("(DANIELA BYD): Olá!")).toBe(true);
    });

    it("detecta mensagem sem prefixo", () => {
      expect(router.hasTargetPrefix("Olá, como vai?")).toBe(false);
    });
  });
});
