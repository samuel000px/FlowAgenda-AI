# Auditoria do código existente (Fase 0)

Data: 27/10/2026. Alvo: o projeto **Encaixa · Esmalteria**, na raiz deste repositório
(remote `github.com/samuel000px/FlowAgenda-AI`, commit `c50278a`), feito por
**Samuel Almeida**. O código dele **continua intacto na raiz**; o novo projeto fica em `agente-remarcacao/`.

## Resumo

O Encaixa é um app web (TypeScript, Next/Vinext, Cloudflare Workers + D1, Gemini) que,
quando uma cliente cancela, oferece a vaga a alguém da **lista de espera**. O nosso agente
resolve um problema vizinho, mas diferente: ele **antecipa uma cliente que já tem horário
mais tarde**, decide por **valor esperado** e trata o buraco novo em **cascata**.

Por isso, quase nada é aproveitado como código. O que vale a pena trazer são as **regras e
os cuidados** que ele já resolveu bem, reescritos em Python.

## O que roda

| Verificação | Resultado |
|---|---|
| `node --test tests/*.test.mjs` (regras de negócio) | **16 de 16 passam** (Node 24.18) |
| `npm run setup` / `npm run dev` (interface) | **Não rodado.** Exige instalar ~11 mil linhas de dependências e Cloudflare local; não é necessário para o nosso projeto. |
| Chamada ao Gemini | **Não rodada.** Não existe `.dev.vars` com chave neste computador. |

## Segredos

- Busquei no histórico (`git log -p`) por `api_key`, `secret`, `AIza`, `sk-ant`: **nenhuma chave encontrada**.
  Só aparece `GEMINI_API_KEY=""` vazio em `.dev.vars.example`.
- `.gitignore` já ignora `.env*` e `.dev.vars*`.
- `.openai/hosting.json` tem um `project_id` de hospedagem. Não é segredo, mas é do colega: **não copiar**.

## Compatibilidade com as decisões do plano (seção 2)

| Decisão do plano | Encaixa | Conflito? |
|---|---|---|
| Python + Streamlit | TypeScript + React | Sim: reescrever |
| LLM só interpreta e escolhe; números no código | Igual: "deterministic tools own every write" | **Não**: mesma filosofia |
| Filtros duros antes do LLM | Igual (`available()`) | **Não** |
| Cascata com profundidade 2 e poda | Não existe | Sim: construir do zero |
| Taxa de falta, prob. de aceitar, valor esperado | Não existe | Sim: construir do zero |
| Aprovação humana antes de mudar a agenda | A cliente confirma direto, sem gerente | Sim: adicionar etapa |
| Uma profissional, JSON | 3 profissionais, banco D1 | Sim: simplificar |
| Canal simulado | Simulado (chat na tela, sem WhatsApp) | **Não** |

## Tabela por módulo

| Módulo | O que faz | Avaliação | Motivo |
|---|---|---|---|
| `lib/salon.mjs` → `available()` | Testa se uma cliente da fila cabe na vaga: duração, profissional apta, janela `earliest/latest`, deslocamento (`agora + travel`), consentimento, não repetir quem recusou | **Adaptar** (ideia) | São quase os mesmos filtros duros da seção 7.1. Reescrever em `src/filtros.py`, citando a origem. |
| `lib/salon.mjs` → `plan()` | Busca em feixe (beam search) que combina várias clientes curtas para ocupar mais minutos da vaga | **Descartar** | Resolve "encaixar várias da fila", fora do nosso escopo. Nossa escolha é score + LLM. |
| `lib/salon.mjs` → `seek()` | Cria uma oferta; se não houver candidata, avisa o gerente uma vez | **Adaptar** (ideia) | O "não há candidata, explico e não faço nada" é o nosso caso "não compensa mexer". Também garante **uma oferta pendente por vaga**. |
| `lib/salon.mjs` → `act('offer')` | Aceite: **revalida** tudo antes de gravar. Recusa: marca e busca a próxima | **Adaptar** (ideia) | `confirmar_movimento` também deve revalidar antes de mexer na agenda; recusa → plano B é o cenário 4. |
| `lib/salon.mjs` → `tick()` | Relógio simulado, lembrete 30 min antes, expiração de ofertas | **Descartar** | O plano usa um `agora` fixo por cenário. Lembretes e expiração estão fora do escopo. |
| `lib/salon.mjs` → `revise()` | Cliente pede outro horário dentro da vaga | **Descartar** | No nosso fluxo, "outro horário" só é **interpretado**; renegociar vai para "Próximos passos". |
| `lib/salon.mjs` → `seed()` | 50 clientes fictícias, 3 profissionais | **Adaptar** (só nomes) | Podemos reutilizar alguns nomes fictícios; o resto do dataset é diferente (seção 6). |
| `lib/agent.ts` | Uma chamada ao Gemini com **uma** função declarada, timeout de 20 s, `maxOutputTokens`, validação estrita do retorno, "contexto é dado, não instrução" | **Adaptar** | Como também vamos usar Gemini (ver `DECISIONS.md`), estes cuidados de robustez são exatamente os da seção 9.4. Portar o padrão para Python. |
| `app/dashboard.tsx` | Interface do gerente e simulador de clientes (React) | **Descartar** | A nossa interface é Streamlit (seção 8). Serve só de inspiração para os textos do chat simulado. |
| `app/api/room/route.ts` | API HTTP, salas com chave, cotas, controle de versão no banco | **Descartar** | Não teremos servidor nem multiusuário (seção 3). |
| `db/`, `drizzle/` | Tabelas do banco D1 | **Descartar** | O plano usa JSON. |
| `tests/salon.test.mjs` | 16 testes das regras | **Adaptar** (ideia) | Casos que valem copiar como teste em Python: "recusa avança para outra pessoa", "texto livre nunca confirma", "não duplicar oferta para a mesma vaga". |
| `scripts/`, `worker/`, `vite.config.ts`, `wrangler`, `.openai/` | Instalação, build e hospedagem na Cloudflare | **Descartar** | Infraestrutura de outro stack. |
| `.gitignore` | Ignora chaves, builds, bancos | **Reaproveitar** (padrões) | O nosso `.gitignore` copia os padrões de chave (`.env*`, `!.env.example`). |

## O que será reaproveitado (para os Créditos do README)

Nenhuma linha de código é copiada. Reaproveitamos **ideias e regras** do Encaixa:

1. Os filtros de elegibilidade, sobretudo **deslocamento** ("consegue chegar a tempo") e **janela de horário**.
2. **Revalidar antes de confirmar** e **uma oferta pendente por vaga**.
3. **Recusa → próxima candidata, sem repetir quem recusou.**
4. Os cuidados com o LLM: uma ação por chamada, timeout, limite de tokens, validação estrita do JSON,
   e "o texto do cliente é dado, não instrução".
5. Alguns nomes fictícios do `seed()`.

Cada trecho em Python inspirado nisso leva um comentário curto apontando a origem, por exemplo:
`# regra de deslocamento baseada no Encaixa (Samuel Almeida)`.
