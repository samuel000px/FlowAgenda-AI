# Decisões de projeto

Cada item tem a decisão, o motivo e o que ficou de fora. Vale o que está na seção 2 do plano,
a não ser quando um item abaixo diz outra coisa.

## D1. O projeto fica em `agente-remarcacao/`, dentro deste repositório

- Decisão: projeto Python numa subpasta, com o Encaixa do Samuel intacto na raiz.
- Motivo: quem avaliar vê os dois juntos e entende de onde vieram as ideias (ver `AUDITORIA.md`).
- Ficou de fora: apagar o código TypeScript da raiz ou abrir outro repositório.

## D2. Esmalteria com uma manicure só

- Decisão: os dados fictícios são de uma esmalteria com uma profissional e uma agenda.
- Motivo: mantém o tema do Encaixa e respeita o "uma profissional" da seção 3.
- Ficou de fora: consultório individual, que era o padrão do plano.
- O domínio fica só em `data/` e nos prompts, então dá para trocar depois sem muito trabalho.

## D3. Gemini (camada gratuita) no lugar do Claude. Muda a seção 2 do plano

- Decisão: API do Gemini, modelo `gemini-3.5-flash-lite` (o mesmo do Encaixa), pelo SDK
  `google-genai`. Chave em `GEMINI_API_KEY` no `.env`. O nome do modelo também fica no `.env`.
- Motivo: custo. A camada gratuita sai de graça. Pelas contas, uma rodada dos 6 cenários
  custaria uns US$ 0,32 no Claude Sonnet 5.5 e uns US$ 0,02 no Claude Haiku 5.5.
- Ficou de fora: Claude Sonnet 5.5 (o do plano) e Claude Haiku 5.5.
- Riscos:
  - A camada gratuita tem limite de chamadas e pode travar no meio de uma demonstração.
  - Nela o Google pode usar o que enviamos para melhorar os produtos dele. Como só mandamos
    dados fictícios, aceitamos.
- Para não ficar preso: só o `src/llm.py` fala com o modelo. Para voltar ao Claude, troca esse
  arquivo e o resto do agente continua igual. O "tool use" da seção 9 vira o function calling
  do Gemini, com as mesmas regras: duas funções expostas e `confirmar_movimento` fora da lista.

## D4. Do Encaixa vêm as ideias, não o código

- Decisão: reescrever em Python as regras que valem (filtros, conferir antes de confirmar,
  recusou passa para a próxima).
- Motivo: a linguagem é outra e o problema também (lista de espera contra antecipação em cascata).
- Ficou de fora: traduzir o `lib/salon.mjs` linha por linha.

## D5. O laço de function calling é nosso, não o automático do SDK

- Decisão: desligar o `automatic_function_calling` do `google-genai` e escrever o laço em `src/llm.py`.
- Motivo: assim cada passo (ferramenta, argumentos, resultado) fica registrado no log e o limite
  de 8 voltas da seção 9.4 é garantido pelo nosso código.
- Ficou de fora: deixar o SDK executar as funções sozinho, que é mais curto mas esconde os passos.

## D6. Cada cenário tem a sua agenda

- Decisão: `agenda.json` guarda uma agenda por cenário (horários e situação de cada dia). As
  clientes são as mesmas para todos. O `agendamento_atual` da cliente não fica no cadastro:
  sai do horário dela na agenda do cenário.
- Motivo: com uma agenda só para a semana inteira, todo cenário teria as mesmas candidatas e
  ficaria difícil montar, por exemplo, o cenário 3 (ninguém compensa) junto com o 2 (alguém compensa).
  Separando, cada cenário prova uma coisa e dá para conferir a conta na mão.
- Ficou de fora: uma agenda única de 7 dias com `agendamento_atual` dentro de `clientes.json`.
  Os cenários juntos cobrem 28/10 a 03/11 (domingo fechado).

## D7. Quem recusou não recebe outra proposta na mesma cascata

- Decisão: a lista de recusadas passa de um nível da cascata para o outro.
- Motivo: na vida real ninguém quer receber duas mensagens seguidas pedindo para mudar de horário.
  No cenário 4 a Larissa recusa e não é chamada de novo para o buraco de sábado.
- Ficou de fora: zerar as recusas a cada buraco novo.

## D8. Dois tipos de serviço: manicure (45 min, R$ 45) e pé e mão (90 min, R$ 80)

- Decisão: continua uma profissional só, mas com dois serviços.
- Motivo: sem isso os filtros de tipo e de duração da seção 7.1 nunca eliminariam ninguém.
- Ficou de fora: um serviço só.

## D9. O loader fica em `src/dados.py`

- Decisão: `src/dados.py` lê os três JSON e para com uma mensagem clara se algo não bater
  (cliente que não existe, faltas maiores que consultas, hora fora do formato etc.).
- Motivo: o plano pede um loader que valide, mas não diz onde. `modelos.py` fica só com as estruturas.
