# Resultados

Gerado por `python avaliar.py` em 27/10/2026 17:30, com o modelo `gemini-3.5-flash-lite`.

> **Atenção:** são estimativas baseadas no próprio modelo de score, sobre **dados fictícios**, com
> respostas das clientes roteirizadas. Não é uma medição no mundo real. A métrica está em
> [docs/metrica.md](docs/metrica.md).

## Horas vagas esperadas no fim (menor é melhor)

Entre parênteses, a redução em relação a "ninguém faz nada".

| Cenário | Ninguém faz nada | Regra ingênua | Agente | Melhor |
|---|---|---|---|---|
| S1 Aviso tardio | 0.73 | 0.16 (79%) | 0.16 (79%) | empate |
| S2 Cascata que compensa | 0.69 | 0.33 (52%) | 0.20 (71%) | agente |
| S3 Cascata que não compensa | 0.71 | 0.80 (-13%) | 0.71 (0%) | agente |
| S4 Recusa | 0.59 | 0.44 (25%) | 0.44 (25%) | empate |
| S5 Cliente nova | 0.61 | 0.32 (48%) | 0.30 (51%) | agente |
| S6 Dia lotado | 0.62 | 0.36 (42%) | 0.06 (90%) | agente |
| **Total** | **3.97** | **2.42 (39%)** | **1.87 (53%)** | |

## O que cada estratégia fez

| Cenário | Regra ingênua | Agente | Agente bateu com o esperado? |
|---|---|---|---|
| S1 | Elisa recusou → Beatriz aceitou | Beatriz aceitou → não mexe | sim |
| S2 | Helena aceitou | Helena aceitou → Ingrid aceitou → não mexe | sim |
| S3 | Julia aceitou | não mexe | sim |
| S4 | Marina aceitou | Larissa recusou → Marina aceitou → não mexe | sim |
| S5 | Gabriela aceitou | Fernanda aceitou → não mexe | sim |
| S6 | Olivia aceitou | Natalia aceitou → não mexe | sim |

## Leitura

- **Empates.** No cenário 1, a primeira da ordem cronológica (Elisa) recusou, e a regra ingênua chegou
  na Beatriz do mesmo jeito. Se a Elisa tivesse aceitado, ficaria um buraco no fim do dia sem fila; o
  agente nem chega a perguntar para ela (poda). No cenário 4, a preferida do agente (Larissa) recusou e
  as duas estratégias terminaram com a Marina.
- **Onde o agente ganha.** Quando a ordem cronológica escolhe alguém cujo horário seria difícil de
  preencher (cenários 3 e 6), quando outra cliente tem menos risco de falta (cenário 5) e quando a cascata
  troca mais um buraco difícil por um fácil (cenário 2). No cenário 3 a regra ingênua deixa a agenda
  **pior** do que não fazer nada.
- Cada rodada usa o Gemini de verdade, então o modelo pode escolher diferente numa próxima execução. Se
  isso acontecer, a coluna "bateu com o esperado" mostra "não" e os números refletem o que de fato aconteceu.
