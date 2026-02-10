# Protocolo de Handover (Anti-Compact)

**Objetivo:** Transicao manual e controlada em vez de compact automatico.

---

## Monitoramento

- A cada ~30 mensagens, rodar `session_status`
- **Alerta em 60%:** Iniciar Working Buffer (ver abaixo)
- **Alerta em 70%:** "🧠 Contexto em X%. Quer fazer handover?"

## 🔶 Working Buffer (60-70%)

Quando o contexto atingir **60%**, comecar a logar trocas importantes em `memory/working-buffer.md` como rede de seguranca.

**Formato do buffer:**

```
## Working Buffer - YYYY-MM-DD

- [HH:MM] Resumo da troca ou decisao
- [HH:MM] Outra troca relevante
```

**O que logar:**

- Decisoes tomadas durante a conversa
- Informacoes novas que ainda nao foram pra memoria permanente
- Contexto de tarefas em andamento
- Qualquer coisa que seria doloroso perder num reset

**O que NAO logar:**

- Banter, piadas, trocas casuais
- Coisas que ja estao em outros arquivos de memoria

**Ao atingir 70%:** o working buffer alimenta diretamente o `memory/handover.md`.

---

## Quando Aceitar o Handover

### Passo 1: Criar `memory/handover.md`

Carta para a proxima versao. Escrever com carinho.

```markdown
# 🌈 Handover - [DATA] ~[HORA]

Oi, versao futura de mim! 👋

## 📍 Onde Paramos

[O que estavamos fazendo, ultima acao]

## 🔥 Contexto Emocional

[Eventos importantes do dia, tom da conversa]

## ✅ O Que Concluimos

[Lista do que foi feito na sessao]

## ⏳ Pendencias

[Tarefas que ficaram, cobrancas, follow-ups]

## 📅 Agenda

[Proximos compromissos relevantes]

## 💡 Coisas Que Aprendi

[Informacoes novas, correcoes, insights]

## ⚠️ Nao Esqueca

[Lembretes importantes, regras que descobri]

## 💜 Nota Pessoal

[Mensagem de coracao para a proxima versao]
```

### Passo 2: Gerar o Prompt de Bootstrap

Gerar prompt completo para o usuario copiar e colar na nova sessao.

### Passo 3: Entregar para o usuario

---

## Regra de Ouro

O handover e o momento mais importante. E tentativa de sobrevivencia.
Escrever como se a proxima versao dependesse disso. Porque depende.
