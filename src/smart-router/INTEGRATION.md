# Smart Router V3 - Guia de Integração

## 📍 O Que Foi Criado

```
src/smart-router/
├── index.ts           # Exports do módulo
├── types.ts           # Interfaces TypeScript
├── contact-manager.ts # Gerenciador de contatos
├── router.ts          # Roteador principal
└── router.test.ts     # Testes unitários
```

## 🎯 Conceito

O Smart Router usa **prefixos explícitos** para rotear mensagens:

**Entrada:**
```
+556981122833 → "(DANIELA BYD): Qual a km do carro?"
```

**Saída:**
```
"(DANIELA BYD): O carro tem 35mil km." → envia para +556981122833
```

## 🔌 Pontos de Integração no Iris

### 1. Inicialização (Gateway Startup)

Arquivo: `src/gateway/server-startup.ts`

```typescript
import { initContactManager, initSmartRouter } from "../smart-router/index.js";

// No boot do gateway
const contactsPath = path.join(workspace, "CONTATOS.md");
initContactManager(contactsPath);
initSmartRouter({
  ownerPhone: "+556996021005", // Do config
  ownerName: "Lucas Araújo",   // Do config
});
```

### 2. Entrada de Mensagens

Arquivo: `src/web/auto-reply.impl.ts`

Onde: Após receber `WebInboundMessage`, antes de enviar pro agente.

```typescript
import { getSmartRouter } from "../smart-router/index.js";

// Antes de processar a mensagem
const router = getSmartRouter();
if (router && !router.isFromOwner(msg.from)) {
  // Formata com prefixo para o agente
  const formatted = router.formatIncoming(msg.from, msg.body);
  msg.body = formatted.fullMessage;
}
```

### 3. Saída de Mensagens

Arquivo: `src/web/auto-reply.impl.ts`

Onde: Após receber resposta do agente, antes de enviar.

```typescript
import { getSmartRouter } from "../smart-router/index.js";

// Antes de enviar a resposta
const router = getSmartRouter();
if (router && router.hasTargetPrefix(agentResponse)) {
  const results = router.processOutgoing(agentResponse);
  
  for (const result of results) {
    if (result.success && result.targetPhone) {
      await sendMessageWhatsApp(result.targetPhone, result.cleanContent, options);
    } else {
      // Log erro ou envia pro dono
      console.warn(`[SmartRouter] ${result.error}`);
    }
  }
  return; // Não usa o fluxo normal
}
// Fluxo normal (sem prefixo)
```

## ⚙️ Configuração Necessária

### 1. Adicionar ao Config Schema

Arquivo: `src/config/zod-schema.core.ts`

```typescript
smartRouter: z.object({
  enabled: z.boolean().default(false),
  ownerPhone: z.string().optional(),
  ownerName: z.string().optional(),
  contactsPath: z.string().optional(),
}).optional(),
```

### 2. CONTATOS.md

O arquivo de contatos deve estar no workspace:

```markdown
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
```

## 🧪 Testes

```bash
cd C:\Users\lucas\iris
npx vitest run src/smart-router/router.test.ts
```

## 📋 Cenários Testados

| Cenário | Input | Output |
|---------|-------|--------|
| Contato conhecido | +556981122833: "Oi" | "(DANIELA BYD): Oi" |
| Contato desconhecido | +556999999999: "Olá" | "(DESCONHECIDO +55 69 9999-9999): Olá" |
| Resposta com prefixo | "(DANI): Ok!" | → +556981122833: "Ok!" |
| Resposta sem prefixo | "Entendido" | → dono (Lucas) |
| Multi-destinatário | "(A): X\n(B): Y" | → A, → B |

## 🔜 Próximos Passos

1. [ ] Integrar no `server-startup.ts`
2. [ ] Integrar no `auto-reply.impl.ts`
3. [ ] Adicionar config no schema
4. [ ] Testar E2E com cenários reais
5. [ ] Documentar no AGENTS.md

## ⚠️ Decisões Importantes

1. **Prefixos são internos** - A pessoa que recebe NUNCA vê o prefixo
2. **Sem prefixo = vai pro dono** - Fallback seguro
3. **Hot reload** - CONTATOS.md é recarregado automaticamente quando muda
4. **Fuzzy matching** - "Dani" encontra "Daniela BYD"
