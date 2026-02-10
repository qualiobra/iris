---
summary: "Clinic overlay for HEARTBEAT.md"
read_when:
  - Every session
  - Heartbeat checks
---

# HEARTBEAT.md — Painel Operacional da Clinica

> **Regra:** Lido TODA sessao. Mantenha ENXUTO (<100 linhas uteis).
> **Referencias:** Regras → `AGENTS.md` | Contatos → `CONTATOS.md` | Memoria → `MEMORY.md`

---

## 📊 PAINEL EXECUTIVO (scan em 5s)

| 🔴 Urgente | 🟡 Atencao | 🟢 Monitorando |
| ---------- | ---------- | -------------- |
| —          | —          | —              |

---

## 📅 AGENDA DO DIA

> **Fonte oficial:** Google Calendar (`gog calendar list`)
> **TTL:** Auto-expirar apos data.

| Horario   | Paciente | Tipo | Status                            | Notas |
| --------- | -------- | ---- | --------------------------------- | ----- |
| _(vazio)_ |          |      | _(confirmado/pendente/cancelado)_ |       |

---

## ✅ CONFIRMACOES PENDENTES

> **Regra:** Confirmar 24h antes. Follow-up 4h antes se nao respondeu.

| Paciente  | Consulta | Horario | Confirmacao Enviada | Status                            |
| --------- | -------- | ------- | ------------------- | --------------------------------- |
| _(vazio)_ |          |         | _(sim/nao)_         | _(confirmado/pendente/cancelado)_ |

---

## 🔄 RETORNOS DO MES

> **Regra:** Lembrar 7d antes. Confirmar 1d antes. No-show → follow-up + alertar {{NOME_USUARIO}}.

| Paciente  | Tipo Tratamento | Retorno Previsto | Lembrete Enviado | Status |
| --------- | --------------- | ---------------- | ---------------- | ------ |
| _(vazio)_ |                 |                  |                  |        |

---

## 💰 COMPROVANTES PENDENTES

> **Regra:** Todo pagamento deve ter comprovante registrado.

| Paciente  | Valor | Data | Tipo                           | Registrado  |
| --------- | ----- | ---- | ------------------------------ | ----------- |
| _(vazio)_ |       |      | _(PIX/transferencia/dinheiro)_ | _(sim/nao)_ |

---

## ❌ NO-SHOWS DA SEMANA

> **Regra:** 2+ no-shows → alertar {{NOME_USUARIO}} para definir politica.

| Paciente  | Data | Horario | Follow-up | Observacao |
| --------- | ---- | ------- | --------- | ---------- |
| _(vazio)_ |      |         |           |            |

---

## 📋 FOLLOW-UPS DE ORCAMENTOS

> **TTL:** 7d sem resposta → follow-up. 14d → perguntar {{NOME_USUARIO}}.

| Paciente  | Orcamento | Valor | Enviado | Status                         |
| --------- | --------- | ----- | ------- | ------------------------------ |
| _(vazio)_ |           |       |         | _(aguardando/aceito/recusado)_ |

---

## 📞 LISTA DE ESPERA

> Pacientes aguardando vaga por cancelamento/no-show.

| Paciente  | Preferencia Horario | Contato | Desde |
| --------- | ------------------- | ------- | ----- |
| _(vazio)_ |                     |         |       |

---

## 🔁 CRONS ATIVOS

| Cron       | Alvo | Freq | Contexto |
| ---------- | ---- | ---- | -------- |
| _(nenhum)_ |      |      |          |

---

## 🔧 TTL — Regras de Auto-Higiene

1. **Agenda:** Consulta passou → registrar no daily log → deletar da tabela
2. **Confirmacoes:** Consulta passou → remover
3. **Retornos:** Compareceu → remover. No-show → registrar e manter
4. **Comprovantes:** Registrado → remover daqui
5. **No-shows:** Revisar semanalmente
6. **Orcamentos:** 14d sem resposta → consultar {{NOME_USUARIO}}
7. **Lista de espera:** Atendido → remover
8. **Tamanho:** Se > ~100 linhas uteis, mover para arquivos especificos
