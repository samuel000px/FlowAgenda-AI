# Resultados

Gerado por `python avaliar.py` em 27/10/2026 17:27, com o modelo `gemini-3.5-flash-lite`.

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

- Onde a regra ingênua empata com o agente, a primeira cliente da fila cronológica era também a melhor
  escolha, ou a cliente que o agente preferia recusou.
- O agente ganha quando a ordem cronológica escolhe alguém cujo horário seria difícil de preencher
  (cenários 3 e 6), quando outra cliente tem menos risco de falta (cenário 5) e quando a cascata
  consegue trocar mais um buraco difícil por um fácil (cenário 2).
- Uma rodada usa o Gemini de verdade. Se o modelo escolher diferente do anotado, a coluna "bateu com o
  esperado" mostra "não" e o número reflete o que de fato aconteceu.
