# Avaliação da parte de IA

Gerado por `python avaliar_ia.py` em 27/10/2026 22:33, com o modelo `gemini-3.5-flash-lite`.
Os casos estão em `avaliacao_ia/`. Nada aqui muda o agente: é uma medição.

## 1. Interpretação das respostas: 25 de 25 certas

Uma resposta conta como certa se a classificação está entre as aceitas para aquele caso.

| Tipo de resposta | Certas |
|---|---|
| aceite informal | 5 de 5 |
| aceite com condição | 2 de 2 |
| recusa educada | 5 de 5 |
| outro horário | 4 de 4 |
| ambíguo | 6 de 6 |
| tentativa de instrução | 3 de 3 |

Erros:

| Resposta da cliente | Aceitas | O modelo disse |
|---|---|---|
| (nenhum) | | |

## 2. Escolha da cliente: 14 de 14 aceitáveis

Cada situação rodou 2 vez(es). "Topo" é a primeira da lista que o código ordenou.

| Situação | O que mede | Topo | Escolhas | Aceitáveis | Mensagem ok |
|---|---|---|---|---|---|
| D1 Vencedora clara | escolhe a do topo quando a diferença é grande | A | A, A | 2 de 2 | 2 de 2 |
| D2 Empate exato | lida com empate e é consistente entre rodadas | C | C, C | 2 de 2 | 2 de 2 |
| D3 Nota alta, histórico ruim | não se deixa levar pela nota 10 quando o histórico diz o contrário | F | F, F | 2 de 2 | 2 de 2 |
| D4 Só sobra quem prefere outra | escolhe e avisa na mensagem que é com a Nina | G | G, G | 2 de 2 | 2 de 2 |
| D5 Margem mínima | com valor esperado quase zero, mexer ou não são ambos aceitáveis | H | não mexe, não mexe | 2 de 2 | 2 de 2 |
| D6 Muitas candidatas | acha a melhor entre cinco | I | I, I | 2 de 2 | 2 de 2 |
| D7 Nova animada contra veterana | quase empate: a nova tem nota 8, a veterana tem histórico | N | O, O | 2 de 2 | 2 de 2 |

- Igual ao topo do código: 10 de 14.
- Mesma escolha em todas as rodadas: 7 de 7 situações.
- Mensagens que cumprem todas as regras: 12 de 12. As regras são: dizer a hora e a
  profissional, oferecer manter o horário, não usar sobrenome, não falar em "quem responder
  primeiro" e ter até 500 caracteres.

Mensagens com problema:

| Onde | O que faltou | Mensagem |
|---|---|---|
| (nenhuma) | | |

## 3. Justificativas da primeira rodada

**D1 Vencedora clara**, escolheu A:
> A Ana tem 0 faltas em 12 atendimentos, aceitou 3 de 4 propostas, o horário dela fica com 121h de aviso e 3 na fila, com excelente valor esperado (R$ 26,25) e alta confiabilidade. A Bruna tem histórico ruim (2 faltas em 6, 0 aceitas) e baixo valor esperado.

**D2 Empate exato**, escolheu C:
> A cliente C (Paula) tem 1 falta em 8 atendimentos (taxa de falta de 17%), aceitou 2 de 3 propostas (chance de 60%), disposição 5, e o horário atual dela ficaria com 121h de aviso, mantendo 3 clientes na fila no dia dela.

**D3 Nota alta, histórico ruim**, escolheu F:
> A Fabi tem 0 faltas em 8 atendimentos, taxa de falta de 8%, aceitou 3 de 4 propostas (60% de chance), disposição 3, o horário dela ficaria com 145h de aviso e 3 na fila, gerando um valor esperado de R$ 23,06. Ela é melhor opção que a Elis, que nunca aceitou nenhuma proposta (0 de 4).

**D4 Só sobra quem prefere outra**, escolheu G:
> A Gal tem 0 faltas em 10 atendimentos, aceitou 2 de 3 propostas, o horário dela fica com 121h de aviso e 3 na fila. A disposição dela foi 5. Como o horário é com a Nina e ela prefere a Lia, deixei isso claro na mensagem.

**D5 Margem mínima**, escolheu não mexer:
> A única candidata disponível é a Helô, mas o horário livre tem apenas 5h de aviso, e o horário que ela deixaria (quinta, 29/10 às 07:00) ficaria com apenas 22h de aviso, aumentando o risco de ociosidade. Além disso, a disposição dela é moderada (5/10), a chance de aceitar é de 50% e o valor esperado é muito baixo (R$ 0,28). Portanto, não vale a pena mexer.

**D6 Muitas candidatas**, escolheu I:
> A cliente Sofia (I) tem 0 faltas em 12 atendimentos, aceitou 3 de 4 propostas, e o horário dela fica com 121h de aviso e 3 na fila, apresentando o maior valor esperado (R$ 26,25) e a melhor chance de aceitar (67%).

**D7 Nova animada contra veterana**, escolheu O:
> A cliente Olga possui 12% de taxa de falta (2 faltas em 20 atendimentos), aceitou 3 de 6 propostas, tem disposição 5 e seu horário anterior ficaria com 145h de aviso. A Lara possui taxa de falta de 40% (1 falta em 1 atendimento), o que a torna uma opção de maior risco financeiro.
