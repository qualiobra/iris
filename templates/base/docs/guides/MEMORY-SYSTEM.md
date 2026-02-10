# Sistema de Memoria

## Visao Geral

Voce acorda zerada cada sessao. Estes arquivos sao sua continuidade:

- **Daily notes:** `memory/YYYY-MM-DD.md` — logs do dia
- **Long-term:** `MEMORY.md` — memoria curada (so em main session!)
- **People:** `memory/people/*.md` — perfis de pessoas
- **Contacts map:** `memory/contacts-map.json` — mapeamento numero→nome

## 🧠 MEMORY.md

- **APENAS em main session** (chat direto com o usuario)
- **NAO carregar em contextos compartilhados** (Discord, grupos)
- Contem contexto pessoal que nao deve vazar
- Curar regularmente: eventos, licoes, insights

## 👥 memory/people/\*.md - Perfis de Pessoas

**Estrutura do perfil:**

- Quem e (relacao, empresa, desde quando)
- Contexto atual (projetos, situacao)
- Perfil de comunicacao (preferencias, horarios)
- Regras especificas (permissoes, restricoes)
- Historico de interacoes

**Quando ler:**
| Situacao | Acao |
|----------|------|
| Mensagem de pessoa conhecida | CONTATOS.md → people/{pessoa}.md |
| Tarefa envolvendo pessoa | Ler perfil OBRIGATORIO |

**Quando CRIAR perfil novo:**

- Pessoa nova sem perfil → fazer 3+ perguntas ao usuario
- Criar perfil basico, enriquecer depois

**Fonte de verdade:**

- `CONTATOS.md` = telefones (fonte primaria, editavel)
- `memory/contacts-map.json` = cache JSON
- `memory/people/*.md` = contexto relacional

## 🔍 Deteccao de Pessoas

**Normalizacao de numeros:**

1. Remover caracteres nao-numericos (exceto `+`)
2. Buscar pelo numero completo OU ultimos 8-9 digitos

**Fluxo obrigatorio:**

1. Normalizar numero → Buscar em contacts-map.json (rapido)
2. Se nao encontrar → CONTATOS.md
3. Se encontrar → responder com contexto
4. Se nao encontrar → Alertar usuario

## ⚠️ Alertas Pre-Resposta

**ANTES de responder pessoa conhecida:**

1. Verificar `memory/people/{pessoa}.md`
2. Checar "Pendencias e Promessas"
3. Se pendencia ABERTA → alerta interno

## 🔎 Busca na Memoria

### memory_search (Busca Rapida)

- **Backend:** Embeddings nativos do OpenClaw
- **Escopo:** Arquivos .md no workspace
- **Uso:** Busca geral, queries simples

### Dicas de Busca

- Queries curtas e especificas
- Use contexto: "reuniao X janeiro" > "reuniao"
- Nunca inventar memorias nao encontradas

## 🤖 Swarm de Agentes

| Situacao                    | Usar? | Razao            |
| --------------------------- | ----- | ---------------- |
| Busca em multiplos arquivos | ✅    | Paralelo         |
| Escrita em arquivo          | ❌    | Race condition   |
| Pesquisa web ampla          | ✅    | Multiplas fontes |

**Regra:** Swarm SEMPRE para LEITURA, nunca para escrita simultanea.

---

## 📝 Write It Down!

- **Memory is limited** — se quer lembrar, ESCREVA
- "Mental notes" nao sobrevivem restart
- Erro cometido → documentar para nao repetir
- **Text > Brain** 📝
