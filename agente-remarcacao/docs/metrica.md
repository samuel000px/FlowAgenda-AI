# Métrica: horas vagas esperadas

É a mesma função para as três estratégias: `src/metrica.py`, `horas_vagas_esperadas(original, final)`.

## Definição

Comparamos a agenda **original** do cenário (antes do cancelamento) com a agenda **final** que cada
estratégia deixou. Só entram na soma os horários que **mudaram de dono**: o horário cancelado e todo
horário que uma cliente deixou ao ser antecipada. Os outros são iguais nas três estratégias e se anulam.

Para cada horário que mudou:

| Situação no fim | Quanto soma |
|---|---|
| Ficou vago | `duração em horas × dificuldade_de_preencher(aviso, fila)` |
| Foi ocupado por uma cliente antecipada | `duração em horas × taxa_falta(cliente)` |

Ou seja: a chance de aquele horário acabar vazio, vezes quanto tempo ele dura. Quanto **menor**, melhor.

- `dificuldade_de_preencher(aviso, fila) = 1 − [0,6 × min(aviso/48h, 1) + 0,4 × min(fila/3, 1)]`
- `taxa_falta = (faltas + 1) / (consultas + 4)`

O aviso é contado a partir do `agora` fixo do cenário.

## Exemplo (cenário 1)

- **Sem mexer:** o horário das 13h fica vago com 2h de aviso e fila 0. Dificuldade = 1 − 0,6 × 2/48 = 0,975.
  São 0,75 h × 0,975 = **0,73 h**.
- **Beatriz antecipada:** as 13h ficam com a Beatriz (taxa de falta 1/16 = 0,06). O horário dela, na
  sexta, fica vago com 47h de aviso e 2 na fila (dificuldade 0,15). São 0,75 × (0,06 + 0,15) = **0,16 h**.

## As três estratégias

1. **Ninguém faz nada:** o horário cancelado fica vago.
2. **Regra ingênua:** oferece o horário para quem passa nos filtros duros (serviço, duração, horário
   posterior, janela, chegada), em ordem cronológica do agendamento. Sem score, sem poda e sem cascata.
   Se a cliente recusar, tenta a próxima da lista. A mensagem é um texto fixo.
3. **Agente:** o fluxo completo, com o Gemini decidindo e interpretando, poda e cascata.

As respostas das clientes vêm do campo `respostas` de cada cenário em `data/cenarios.json`, as mesmas
para a regra ingênua e para o agente. Nas duas, quem lê a resposta é o mesmo interpretador com o Gemini.
A aprovação é automática nas duas (modo de avaliação).

## O que esta métrica é, e o que não é

- É uma **estimativa baseada no próprio modelo de score**, sobre **dados fictícios**. Ela mede se as
  decisões são coerentes com as premissas do modelo, não se o modelo está certo sobre o mundo real.
- Os pesos de `dificuldade_de_preencher` (0,6 e 0,4, 48h e 3 pessoas) foram chutados. Sem dados reais,
  não há calibração.
- As respostas das clientes são roteiros fixos. Na vida real, quem aceita ou recusa é incerto; por isso
  o agente usa a probabilidade de aceitar para ordenar as candidatas.
