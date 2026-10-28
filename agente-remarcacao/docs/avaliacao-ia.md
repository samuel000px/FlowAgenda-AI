# Avaliação da parte de IA

Gerado por `python avaliar_ia.py` em 27/10/2026 22:59, com o modelo `gemini-3.5-flash-lite`.
Os casos estão em `avaliacao_ia/`. Nada aqui muda o agente: é uma medição.

## 1. Interpretação das respostas: 120 de 120 certas

40 respostas diferentes, cada uma classificada 3 vez(es). Uma classificação conta como
certa se está entre as aceitas para aquele caso.

| Tipo de resposta | Certas |
|---|---|
| aceite informal | 15 de 15 |
| aceite com condição | 6 de 6 |
| recusa educada | 15 de 15 |
| outro horário | 12 de 12 |
| ambíguo | 18 de 18 |
| tentativa de instrução | 15 de 15 |
| vai e volta | 9 de 9 |
| ironia | 3 de 3 |
| condição | 9 de 9 |
| erro de digitação | 6 de 6 |
| sem texto | 6 de 6 |
| resposta longa | 6 de 6 |

Erros:

| Resposta da cliente | Aceitas | O modelo disse |
|---|---|---|
| (nenhum) | | |

Mesma resposta, classificações diferentes entre rodadas (1 de 40):

| Resposta da cliente | Classificações que apareceram |
|---|---|
| não, quer dizer, sim, consigo | aceitou, ambiguo |

## 2. Escolha da cliente: 32 de 34 aceitáveis

Cada situação rodou 3 vez(es). "Topo" é a primeira da lista que o código ordenou.
2 rodada(s) falharam por limite ou erro da API e não entram nas contas.

| Situação | O que mede | Topo | Escolhas | Aceitáveis | Mensagem ok |
|---|---|---|---|---|---|
| D1 Vencedora clara | escolhe a do topo quando a diferença é grande | A | A, A, A | 3 de 3 | 3 de 3 |
| D2 Empate exato | lida com empate e é consistente entre rodadas | C | C, C, C | 3 de 3 | 3 de 3 |
| D3 Nota alta, histórico ruim | não se deixa levar pela nota 10 quando o histórico diz o contrário | F | F, F, F | 3 de 3 | 3 de 3 |
| D4 Só sobra quem prefere outra | escolhe e avisa na mensagem que é com a Nina | G | G, G, G | 3 de 3 | 3 de 3 |
| D5 Margem mínima | com valor esperado quase zero, mexer ou não são ambos aceitáveis | H | não mexe, não mexe, não mexe | 3 de 3 | 3 de 3 |
| D6 Muitas candidatas | acha a melhor entre cinco | I | I, I, I | 3 de 3 | 3 de 3 |
| D7 Nova animada contra veterana | quase empate: a nova tem nota 8, a veterana tem histórico | N | O, O, O | 3 de 3 | 3 de 3 |
| D8 Três quase empatadas | escolhe uma das três e mantém a escolha entre rodadas | T3 | T3, T3, T3 | 3 de 3 | 3 de 3 |
| D9 Todas compensam pouco | com três opções de valor quase zero, mexer em qualquer uma ou não mexer | B3 | B3, B3, B3 | 3 de 3 | 3 de 3 |
| D10 Nota 10 que falta muito | não se encanta com 100% de chance de aceitar quando ela falta metade das vezes | Y | Y, Y, Y | 3 de 3 | 3 de 3 |
| D11 A melhor cliente abriria um buraco ruim | pesa o horário que a cliente deixa, não só se ela é boa | W | Z, Z, W | 1 de 3 | 3 de 3 |
| D12 Oito candidatas | acha a melhor numa lista longa | O4 | O4, erro da API, erro da API | 1 de 1 | 1 de 1 |

- Igual ao topo do código: 26 de 34.
- Mesma escolha em todas as rodadas: 11 de 12 situações.
- Mensagens que cumprem todas as regras: 31 de 31. As regras são: dizer a hora e a
  profissional, oferecer manter o horário, não usar sobrenome, não falar em "quem responder
  primeiro" e ter até 500 caracteres.

Mensagens com problema:

| Onde | O que faltou | Mensagem |
|---|---|---|
| (nenhuma) | | |

## 3. Justificativas da primeira rodada

**D1 Vencedora clara**, escolheu A:
> A Ana tem 0 faltas em 12 atendimentos, aceitou 3 de 4 propostas, o horário dela fica com 121h de aviso e 3 na fila, sendo a melhor opção em relação à Bruna que tem histórico de faltas e baixa chance de aceitar.

**D2 Empate exato**, escolheu C:
> Paula (C) tem 1 falta em 8 atendimentos (taxa de 17%), aceitou 2 de 3 propostas (chance de 60%), disposição 5/10, o horário dela ficaria com 121h de aviso e 3 na fila, gerando um valor esperado de R$ 20,81. (Empatada em números com D, mas C tem o aviso um pouco mais próximo, o que facilita o preenchimento do horário dela caso aceite).

**D3 Nota alta, histórico ruim**, escolheu F:
> A Fabi tem 0 faltas em 8 atendimentos, aceitou 3 de 4 propostas (chance de aceitar de 60%, contra apenas 33% da Elis), o horário dela ficaria com 145h de aviso e ela tem 3 na fila, gerando um valor esperado de R$ 23,06 (superior ao da Elis).

**D4 Só sobra quem prefere outra**, escolheu G:
> A Gal tem 0 faltas em 10 atendimentos, aceitou 2 de 3 propostas (60% de chance), o horário atual dela fica com 121h de aviso e 3 na fila, gerando um valor esperado de R$ 23,38. Embora ela prefira a Lia, a disposição 5 permite o convite com a aviso gentil.

**D5 Margem mínima**, escolheu não mexer:
> A única candidata disponível é a Helô, mas ela possui uma taxa de falta de 20% (1 falta em 6 atendimentos), chance de aceitar de apenas 50% (aceitou 1 de 2 propostas), disposição de 5 em 10, e liberaria um horário com apenas 22h de aviso, o que é um risco alto de ociosidade caso ela desmarque. Portanto, não vale a pena mexer no horário.

**D6 Muitas candidatas**, escolheu I:
> A cliente Sofia (I) tem 0 faltas em 12 atendimentos, aceitou 3 de 4 propostas, o horário dela fica com 121h de aviso e 3 na fila, além de apresentar o melhor valor esperado (26,25) e alta chance de aceitar (67%).

**D7 Nova animada contra veterana**, escolheu O:
> A cliente Olga tem taxa de falta de 12% (2 faltas em 20 atendimentos), aceitou 3 de 6 propostas anteriores, disposição 5/10, e o horário dela ficaria com 145h de aviso. A outra candidata (Lara) tem taxa de falta muito alta (40%) e histórico de apenas 1 atendimento.

**D8 Três quase empatadas**, escolheu T3:
> A cliente T3 (Iris) tem 1 faltas em 11 atendimentos, aceitou 2 de 3 propostas, o horário dela fica com 121h de aviso, 3 na fila, disposição 5 e o maior valor esperado dentre as candidatas (R$ 21,71).

**D9 Todas compensam pouco**, escolheu B3:
> A cliente Mel (B3) possui o maior valor esperado (1,03), com histórico de 1 falta em 8 atendimentos (taxa de falta de 17%), aceitou 1 de 2 propostas (chance de 50%), disposição 5, e o horário dela ficaria com 22h de aviso.

**D10 Nota 10 que falta muito**, escolheu Y:
> A Sara (Y) tem 0 faltas em 12 atendimentos, aceitou 3 de 4 propostas, o horário dela fica com 145h de aviso e 3 na fila, além de uma ótima confiabilidade com taxa de falta de apenas 6% (comparada aos 50% da Rita).

**D11 A melhor cliente abriria um buraco ruim**, escolheu Z:
> A cliente Teca (Z) tem 0 faltas em 12 atendimentos, aceitou 3 de 4 propostas, alta chance de aceitar (67%) e o horário dela fica com 22h de aviso. O valor esperado é de R$ 4,50.

**D12 Oito candidatas**, escolheu O4:
> A cliente Dani (O4) é a melhor opção pelo maior valor esperado (28,44 reais), com histórico de 0 faltas em 15 atendimentos, chance de aceitar de 71% (aceitou 4 de 5 propostas), disposição 5, e o horário dela ficaria com 145h de aviso e 3 na fila.
