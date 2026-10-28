# Auditoria do código existente (Fase 0)

27/10/2026. Projeto analisado: Encaixa · Esmalteria, do Samuel Almeida, que está na raiz
deste repositório (`github.com/samuel000px/FlowAgenda-AI`, commit `c50278a`). O código dele
não foi alterado. O nosso projeto fica em `agente-remarcacao/`.

## Visão geral

O Encaixa é um app web em TypeScript (Next/Vinext, Cloudflare Workers, banco D1, Gemini).
Quando uma cliente cancela, ele oferece a vaga para alguém da lista de espera.

O nosso agente faz outra coisa: antecipa uma cliente que já tem horário mais tarde, decide
pelo valor esperado e, se o horário que ela deixou ficar vago, trata esse novo buraco do
mesmo jeito (cascata).

Então quase nada vem como código. O que vale trazer são algumas regras que ele já resolveu
bem, reescritas em Python.

## O que roda

| Verificação | Resultado |
|---|---|
| `node --test tests/*.test.mjs` (regras de negócio) | 16 de 16 passam (Node 24.18) |
| `npm run setup` / `npm run dev` (interface) | Não rodei. Precisa instalar as dependências e a Cloudflare local, e não usamos essa parte. |
| Chamada ao Gemini | Não rodei. Não há `.dev.vars` com chave neste computador. |

## Chaves e segredos

- Procurei no histórico (`git log -p`) por `api_key`, `secret`, `AIza` e `sk-ant`. Nenhuma chave.
  Só existe `GEMINI_API_KEY=""`, vazio, no `.dev.vars.example`.
- O `.gitignore` dele já ignora `.env*` e `.dev.vars*`.
- `.openai/hosting.json` tem um `project_id` da hospedagem dele. Não é segredo, mas não vamos copiar.

## Comparação com as decisões do plano (seção 2)

| Plano | Encaixa | Conflito |
|---|---|---|
| Python + Streamlit | TypeScript + React | Sim, reescrever |
| Números no código, escolha no LLM | Igual: o modelo nunca grava nada sozinho | Não |
| Filtros duros antes do LLM | Igual (`available()`) | Não |
| Cascata com profundidade 2 e poda | Não tem | Sim, fazer do zero |
| Taxa de falta, prob. de aceitar, valor esperado | Não tem | Sim, fazer do zero |
| Aprovação humana antes de mudar a agenda | A cliente confirma direto | Sim, acrescentar |
| Uma profissional, dados em JSON | 3 profissionais, banco D1 | Sim, simplificar |
| Canal simulado | Simulado, sem WhatsApp | Não |

## Módulo por módulo

| Módulo | O que faz | Avaliação | Motivo |
|---|---|---|---|
| `lib/salon.mjs` → `available()` | Vê se uma cliente da fila cabe na vaga: duração, profissional, janela de horário, deslocamento, consentimento, se já recusou | Adaptar a ideia | São quase os filtros da seção 7.1. Vira `src/filtros.py`. |
| `lib/salon.mjs` → `plan()` | Busca em feixe que junta várias clientes curtas na mesma vaga | Descartar | Problema diferente do nosso. |
| `lib/salon.mjs` → `seek()` | Cria a oferta. Sem candidata, avisa o gerente uma vez | Adaptar a ideia | É o nosso "não compensa mexer". Também só deixa uma oferta pendente por vaga. |
| `lib/salon.mjs` → `act('offer')` | No aceite, confere tudo de novo antes de gravar. Na recusa, passa para a próxima | Adaptar a ideia | `confirmar_movimento` vai revalidar do mesmo jeito. A recusa é o cenário 4. |
| `lib/salon.mjs` → `tick()` | Relógio simulado, lembrete 30 min antes, ofertas que expiram | Descartar | No plano o "agora" é fixo em cada cenário. |
| `lib/salon.mjs` → `revise()` | Cliente pede outro horário dentro da vaga | Descartar | Para nós, "outro horário" só é interpretado. Fica para depois. |
| `lib/salon.mjs` → `seed()` | 50 clientes fictícias e 3 profissionais | Adaptar só os nomes | O resto dos dados é diferente (seção 6). |
| `lib/agent.ts` | Uma chamada ao Gemini com uma função, timeout de 20 s, limite de tokens, confere o formato da resposta | Adaptar | Também usamos Gemini (ver `DECISIONS.md`), e esses cuidados são os da seção 9.4. |
| `app/dashboard.tsx` | Tela do gerente e simulador de clientes | Descartar | A nossa tela é em Streamlit. Dá para pegar ideias de texto do chat. |
| `app/api/room/route.ts` | API, salas com chave, cotas, banco | Descartar | Não teremos servidor nem vários usuários. |
| `db/`, `drizzle/` | Tabelas do banco | Descartar | Usamos JSON. |
| `tests/salon.test.mjs` | 16 testes | Adaptar a ideia | Alguns casos viram teste em Python: recusa passa para outra pessoa, texto livre não confirma nada, sem oferta duplicada na mesma vaga. |
| `scripts/`, `worker/`, `vite.config.ts`, `.openai/` | Instalação, build e hospedagem | Descartar | Infra de outro stack. |
| `.gitignore` | Ignora chaves, builds e bancos | Reaproveitar | Copiamos os padrões de chave. |

## O que aproveitamos (vai para os Créditos do README)

Nenhuma linha de código foi copiada. Aproveitamos ideias do Encaixa:

1. Os filtros de elegibilidade, principalmente deslocamento e janela de horário.
2. Conferir tudo de novo antes de confirmar, e uma oferta pendente por vaga.
3. Recusou, passa para a próxima, sem repetir quem já recusou.
4. Os cuidados com o LLM: uma ação por chamada, timeout, limite de tokens, conferir o formato
   da resposta e tratar o texto do cliente como dado, não como instrução.
5. Alguns nomes fictícios do `seed()`.

Onde o código em Python usar uma dessas ideias, um comentário curto indica a origem, por exemplo:
`# regra de deslocamento baseada no Encaixa (Samuel Almeida)`.
