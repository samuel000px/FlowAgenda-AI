# Decisões de projeto

Cada entrada traz a decisão, o motivo e a alternativa descartada. As decisões da seção 2 do
plano valem, salvo quando uma entrada abaixo diz o contrário.

---

## D1. O projeto fica em `agente-remarcacao/`, dentro deste repositório

- **Decisão:** criar o projeto Python numa subpasta e deixar o Encaixa (do colega) intacto na raiz.
- **Motivo:** quem avalia vê as duas coisas lado a lado e a origem das ideias reaproveitadas fica clara (ver `AUDITORIA.md`).
- **Descartado:** apagar o código TypeScript da raiz (ele ficaria só no histórico) ou criar outro repositório.

## D2. Domínio: esmalteria com uma única manicure

- **Decisão:** os dados sintéticos descrevem uma esmalteria com **uma profissional e uma agenda**.
- **Motivo:** escolha do autor. Mantém o tema do Encaixa e respeita o escopo de "uma profissional" (seção 3).
- **Descartado:** consultório de atendimento individual (o padrão do plano).
- **Observação:** o domínio fica concentrado em `data/` e nos prompts, então trocar depois continua barato.

## D3. LLM: Gemini na camada gratuita, em vez de Claude (**altera a seção 2 do plano**)

- **Decisão:** usar a API do Gemini (modelo `gemini-3.5-flash-lite`, o mesmo do Encaixa) pelo SDK
  `google-genai`. A chave fica em `GEMINI_API_KEY`, lida do `.env`. O nome do modelo também fica no `.env`.
- **Motivo:** custo. A camada gratuita custa US$ 0. A estimativa para uma rodada dos 6 cenários era de
  ~US$ 0,32 no Claude Sonnet 5.5 e ~US$ 0,02 no Claude Haiku 5.5.
- **Descartado:** Claude Sonnet 5.5 (o plano original) e Claude Haiku 5.5 (o mais barato entre os pagos).
- **Riscos aceitos:**
  - A camada gratuita tem **limite de chamadas**. Uma demonstração pode esbarrar nele.
  - Na camada gratuita, o Google **pode usar os dados enviados** para melhorar os produtos dele. Aceitável
    porque só mandamos **dados sintéticos** (seção 13).
- **Como mitigamos:** toda chamada ao modelo passa por **um único módulo** (`src/llm.py`). Voltar para o
  Claude é trocar esse arquivo, sem mexer no agente. O conceito de "tool use" da seção 9 vira
  *function calling* do Gemini; as regras continuam as mesmas (só duas funções expostas,
  `confirmar_movimento` fora da lista).

## D4. O código do Encaixa não é copiado; só as ideias

- **Decisão:** reescrever em Python as regras que valem a pena (filtros, revalidação, recusa → próxima).
- **Motivo:** o stack é outro (TypeScript) e o problema é diferente (lista de espera contra antecipação em cascata).
- **Descartado:** portar `lib/salon.mjs` linha a linha.
