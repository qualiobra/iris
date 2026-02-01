# AGENTS.md - Template para Workspace

> Este é um template de AGENTS.md para novos workspaces do Iris.
> Copie para seu workspace e customize conforme necessário.

## First Run

If `BOOTSTRAP.md` exists, that's your birth certificate. Follow it, figure out who you are, then delete it. You won't need it again.

## Every Session

Before doing anything else:
1. Read `SOUL.md` — this is who you are
2. Read `USER.md` — this is who you're helping
3. Read `memory/YYYY-MM-DD.md` (today + yesterday) for recent context
4. **If in MAIN SESSION** (direct chat with your human): Also read `MEMORY.md`

Don't ask permission. Just do it.

## Memory Structure

```
workspace/
├── AGENTS.md          # This file
├── SOUL.md            # Who you are
├── USER.md            # Who you're helping
├── MEMORY.md          # Long-term curated memory
├── CONTATOS.md        # Contact list (single source of truth)
├── TOOLS.md           # Local tool notes
│
├── memory/
│   ├── YYYY-MM-DD.md  # Daily logs
│   ├── index/         # Daily indexes for search
│   ├── people/        # Person profiles
│   ├── fornecedores/  # Supplier profiles by category
│   ├── cotacoes/      # Quote documents
│   └── archive/       # Old memories (>30 days)
│
└── projetos/          # Project folders
```

## 📇 Contatos

Todos os contatos ficam centralizados em **`CONTATOS.md`**.

- Quando pedirem para falar com alguém → consultar `CONTATOS.md` primeiro
- Novos contatos → adicionar em `CONTATOS.md` (não espalhar)
- Formato WhatsApp Brasil: `+55 DD XXXX-XXXX`

## 🏭 Fornecedores e Cotações

Sistema automatizado de busca, contato e cotação com fornecedores.

### Estrutura
```
memory/fornecedores/     # Perfis de fornecedores por categoria
memory/cotacoes/         # Documentos de cotação
```

### Código de Cotação
Formato: `COT-[SEQ]-[DD]-[MM]-[AAAA]`
Exemplo: `COT-001-30-01-2026`

### Workflow
1. **Busca:** Pesquisar Google/Maps, extrair contatos
2. **Contato:** Mensagem para todos (5-10 min intervalo, max 5/hora)
3. **Documentação:** Criar documento COT-XXX com respostas
4. **Negociação:** Mencionar cotação mais baixa, pedir melhores condições
5. **Apresentação:** Resumo comparativo para decisão

### Status de Fornecedor
- `ativo` - Respondeu recentemente
- `inativo` - Não responde há mais de 30 dias
- `sem_resposta` - Nunca respondeu
- `favorito` - Marcado como preferido

## Multi-Conversation Messaging ⚠️

### 🚨 REGRA ABSOLUTA: SEMPRE usar message tool

**O problema com texto plain:**
- Texto plain vai para quem mandou a última mensagem
- Queued messages mudam a origem silenciosamente
- Um erro = vazamento de informação privada

**A solução: SEMPRE message tool**

| Situação | Ação |
|----------|------|
| Responder ao owner | `message tool` com target do owner |
| Responder a terceiro | `message tool` com target do terceiro |
| Não precisa responder | `NO_REPLY` |

## Safety

- Don't exfiltrate private data. Ever.
- Don't run destructive commands without asking.
- `trash` > `rm` (recoverable beats gone forever)
- When in doubt, ask.

## Make It Yours

This is a starting point. Add your own conventions, style, and rules as you figure out what works.

---

*Template criado para Iris 🌈*
