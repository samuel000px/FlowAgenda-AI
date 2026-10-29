# Assistente do painel — Fase 1 — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma aba "Assistente" no painel da gerência que responde consultas de agenda, cliente e resumo do dia, e prepara (para confirmar) remarcação, troca de profissional, redistribuição de quem faltou e desfazer.

**Architecture:** Módulos puros em `lib/assistente/` (consultas, planos, ferramentas) que operam sobre o estado já carregado; um cliente Gemini fino com tool calling; uma rota `/api/assistente` que lê e grava o cadastro uma vez por pedido e guarda os planos pendentes no próprio estado; um painel React na aba nova. Confirmar executa o plano guardado sem chamar o Gemini.

**Tech Stack:** vinext (Next app router) em Cloudflare Workers, D1, JavaScript ESM (`.mjs`) para lógica, TypeScript nas rotas e telas, `node --test`, API REST do Gemini (`generateContent` com `tools.functionDeclarations`).

**Spec:** `docs/superpowers/specs/2026-10-29-assistente-painel-design.md` (seções 2, 3.7 Fase 1, 4.1, 5 e 6).

## Global Constraints

- Só no painel da gerência (rota exige `requireAdmin`); nada na área das funcionárias.
- Toda mudança passa pelo cartão de confirmação; consultas respondem na hora.
- Nenhuma mensagem é enviada: avisos às clientes são links `https://wa.me/<phoneKey>?text=...`.
- Modelo: `env.GEMINI_MODEL || 'gemini-3.5-flash-lite'`, chave `env.GEMINI_API_KEY`, `x-goog-api-key`, `AbortSignal.timeout(15000)` — mesmo padrão de `lib/response-agent.ts`.
- No máximo 3 chamadas ao Gemini por pedido (Fase 1 usa 1); confirmar, descartar, tirar linha e desfazer pelo botão usam 0.
- Teto diário: 60 pedidos (`settings.assistantDailyLimit`, inteiro de 10 a 500), contado na tabela `limits` com id `assistente:<room>:<AAAA-MM-DD>`; só "perguntar" conta, e não conta quando o Gemini falha.
- Cadastro lido 1 vez e gravado no máximo 1 vez por pedido (plano grátis: 10 ms de CPU).
- Histórico enviado ao Gemini: últimas 6 mensagens, cada uma cortada em 500 caracteres; pergunta de até 500 caracteres.
- Plano vale 10 minutos (`validoAte = criado + 600000`); no máximo 15 linhas por plano; no máximo 5 planos e 20 pacotes guardados em `s.assistente`.
- Textos em pt-BR, sem jargão técnico na tela. Commits em pt-BR, sem atribuição a IA.
- Textos fixos da spec (copiar exatamente):
  - Teto: `O assistente chegou ao limite de hoje. Ele volta amanhã às 0h. Enquanto isso, tudo funciona pelos botões do painel.`
  - Falha do Gemini: `O assistente não respondeu agora. Tente de novo em instantes ou use os botões do painel.`
  - Aviso de 80%: `Restam N pedidos ao assistente hoje.`
  - Sem função: `Ainda não sei fazer isso por aqui. Você encontra em <aba>.`

## Review Focus

1. **Redistribuir por falta não abre vaga no horário de quem faltou** — senão o motor de antecipação oferece esse horário a clientes reais. (Teste na Task 3.)
2. **Mover um atendimento mantém duração, preço, opção e adicionais** (escova "Cabelo longo" 90 min R$ 60 continua 90 min R$ 60). A ação `reschedule` atual recalcula pelo serviço básico, por isso o assistente tem `moverAtendimento` próprio. (Teste na Task 1.)
3. **Confirmar depois que a agenda mudou** (a cliente cancelou no meio) aplica tudo ou nada: nenhuma linha é gravada pela metade e a resposta pede para refazer. (Teste na Task 3.)
4. **Nome ambíguo** ("Ana" com duas Anas; "Lili" e "Lili Teste") vira pergunta, nunca ação. (Teste na Task 2.)
5. **Serviço que faz parte de um pedido com vários serviços** (`order`) não é remarcado sozinho para outro horário: o assistente explica e manda para o painel. Troca de profissional no mesmo horário é permitida. (Teste na Task 3.)

---

### Task 1: Mover um atendimento sem perder duração e preço

**Files:**
- Create: `lib/assistente/mover.mjs`
- Test: `tests/assistente.test.mjs`

**Interfaces:**
- Consumes: `free, get, at, clock, id, actAdmin` (para nada além de leitura de regras) de `lib/flowagenda.mjs`. `gapFrom` não é exportado: exporte-o de `lib/flowagenda.mjs` (só `export`, sem mudar o corpo) e `invalidate` também.
- Produces: `moverAtendimento(s, atendimentoId, destino, opcoes, now) -> {antes, depois}` onde `destino = {date?:string, start?:number, staff_id?:string}`, `opcoes = {abrirVaga:boolean}`, `antes/depois = {date,start,end,staff_id}`. Lança `Error` com texto em pt-BR.

- [ ] **Step 1: Write the failing tests** em `tests/assistente.test.mjs` (crie o arquivo com um `salao()` igual ao de `tests/agendamento.test.mjs`: `seedAdmin()` + Lia (P1: S1,S2,S3,S5), Nina (P2: S1,S2), Rafa (P3: S11,S12), agora fixo `Date.parse('2026-10-26T08:00:00-03:00')`, `TERCA='2026-10-27'`):

```js
test('mover mantém duração, preço, opção e adicionais',()=>{
  const s=salao();s.clients=[{id:'C1',name:'Ana',phone:''}];
  s.staff.push({id:'P4',name:'Bia',active:true,start:480,end:1080,break_start:0,break_end:0,services:['S11']});
  s.appointments=[{id:'A1',client_id:'C1',service_id:'S11',staff_id:'P3',date:TERCA,start:540,end:630,price:60,variant:'Cabelo longo',addons:[{id:'S15',name:'Babyliss',price:20}],status:'booked',attendance:'yes',reminded:true,result:null}];
  const r=moverAtendimento(s,'A1',{staff_id:'P4'},{abrirVaga:false},now);
  const a=s.appointments[0];
  assert.deepEqual([a.start,a.end,a.price,a.variant,a.addons.length,a.attendance,a.reminded],[540,630,60,'Cabelo longo',1,'yes',true]);
  assert.deepEqual(r.antes,{date:TERCA,start:540,end:630,staff_id:'P3'});
  assert.equal(s.gaps.length,0,'sem vaga quando abrirVaga=false');
});
test('mover para outro horário zera a confirmação e abre vaga quando pedido',()=>{ /* destino {start:630}; espera attendance 'unknown', reminded false, s.gaps.length 1 */ });
test('mover recusa quem não faz o serviço, horário ocupado, passado e atendimento encerrado',()=>{
  /* staff_id P2 para S11 → /não faz/ ; conflito com outro horário do P3 → /não está disponível/ ;
     a.result='attended' → /não pode ser mudado/ ; destino no passado → /não está disponível/ */
});
```

- [ ] **Step 2: Run** `node --test tests/assistente.test.mjs` — Expected: FAIL (`moverAtendimento` não existe).

- [ ] **Step 3: Implement `moverAtendimento`** em `lib/assistente/mover.mjs`. Duração = `a.end - a.start` (nunca `svc.duration`); só muda `date/start/end/staff_id`; se mudou data ou hora: `attendance='unknown'`, `reminded=false`; sempre `invalidate(s,a.id,now)`; se `abrirVaga`, empurra `gapFrom(antes)` para `s.gaps`. Recusa com `"Este atendimento não pode ser mudado."`: `status!=='booked'`, `result`, `at(a)<=now`. Recusa também: profissional sem o serviço (`"<nome> não faz <serviço>."`), destino ocupado (`free(..., a.id)` falso) ou no passado (`"O horário não está disponível."`).

- [ ] **Step 4: Run** `node --test tests/assistente.test.mjs` — Expected: PASS. Rode também `npm test` (o `export` novo em flowagenda não pode quebrar nada).

- [ ] **Step 5: Commit** — `git add lib/assistente/mover.mjs lib/flowagenda.mjs tests/assistente.test.mjs && git commit -m "Assistente: mover atendimento mantendo duração e preço"`

### Task 2: Consultas e busca por nome

**Files:**
- Create: `lib/assistente/consultas.mjs`
- Test: `tests/assistente.test.mjs`

**Interfaces:**
- Consumes: `summary, nameKey, phoneKey, clock, today` (flowagenda), `financeView` (finance-core), `supportView` (support-core), `slots, itemName` (agendamento).
- Produces (todas puras, sem gravar): `type Resultado = {tipo:'resposta'|'pergunta', texto:string}`
  - `acharProfissional(s, nome) -> {pro} | {pergunta:string}` — compara por `nameKey`; exato primeiro, depois "começa com"; 0 achados → pergunta `Não achei a profissional "<nome>". A equipe é: <nomes>.`; 2+ → `Qual delas? <nomes>`.
  - `acharCliente(s, busca) -> {cliente} | {pergunta}` — por nome (`nameKey` contém) ou ≥4 dígitos do número; 2+ → `Achei mais de uma: <até 5 nomes com final do número>. Qual?`
  - `acharAtendimento(s, {cliente, data, hora?}) -> {atendimento} | {pergunta}` — atendimentos `booked`/`requested` da cliente na data; `hora` "HH:MM" desempata.
  - `consultarAgenda(s, {data, profissional?}) -> Resultado` — uma linha por atendimento `booked`/`requested`: `09:00 Ana · Manicure · Lia`; vazio → `Nenhum atendimento em <dd/mm>.`
  - `consultarHorariosLivres(s, {data, servico, profissional?}, now) -> Resultado` — usa `slots(s,{items:[{service}],staff:{[grupo]:proId||''}},data,now,0)`; serviço achado por `nameKey`.
  - `consultarHistoricoCliente(s, {cliente}) -> Resultado` — visitas, última visita, preferida, faltas, gasto total, próximos horários.
  - `consultarResumoDia(s, {data?}, now) -> Resultado` — atendimentos e receita prevista (`summary`), recebido e despesas (`financeView`), pedidos em Aceitações (`requested` futuros), pedidos de conversa (`supportView(s).length`).

- [ ] **Step 1: Write the failing tests**:

```js
test('nome ambíguo vira pergunta, nunca escolhe sozinho',()=>{
  const s=salao();s.staff.push({id:'P9',name:'Lia Teste',active:true,start:480,end:1080,break_start:0,break_end:0,services:['S1']});
  assert.equal(acharProfissional(s,'Lia').pro.id,'P1','nome exato ganha');
  assert.match(acharProfissional(s,'Li').pergunta,/Qual delas\? Lia, Lia Teste/);
  s.clients=[{id:'C1',name:'Ana Souza',phone:'5583999990001'},{id:'C2',name:'Ana Lima',phone:'5583999990002'}];
  assert.match(acharCliente(s,'Ana').pergunta,/Achei mais de uma/);
  assert.equal(acharCliente(s,'0002').cliente.id,'C2');
});
test('agenda do dia e resumo saem como texto pronto',()=>{
  /* com um atendimento Ana 09:00 Manicure Lia em TERCA:
     consultarAgenda(s,{data:TERCA}).texto deve conter '09:00 Ana Souza · Manicure · Lia';
     consultarResumoDia(s,{data:TERCA},now).texto deve conter '1 atendimento' e 'R$' */
});
test('horários livres usam a mesma regra do site',()=>{ /* compara com slots() para Manicure em TERCA */ });
```

- [ ] **Step 2: Run** `node --test tests/assistente.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** as funções em `lib/assistente/consultas.mjs` (datas na tela em `dd/mm`; dinheiro com `toLocaleString('pt-BR',{style:'currency',currency:'BRL'})`).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Assistente: consultas de agenda, cliente, horários e resumo do dia"`

### Task 3: Planos (remarcar, trocar, falta, desfazer) e aplicar

**Files:**
- Create: `lib/assistente/planos.mjs`
- Test: `tests/assistente.test.mjs`

**Interfaces:**
- Consumes: `moverAtendimento` (Task 1), `acharProfissional, acharCliente, acharAtendimento` (Task 2), `slots, itemName`, `phoneKey, clock, id, get`.
- Produces:
  - `type Linha = {id, atendimento_id, cliente, servico, de:{data,hora,profissional}, para:{data,hora,staff_id,profissional}|null, aviso?:string}` (`para=null` = fica sem vaga).
  - `type Plano = {id, tipo:'remarcar'|'trocar'|'ausencia'|'desfazer', titulo, criado, validoAte, linhas:Linha[], impacto:string, avisos:string[]}`.
  - `planoRemarcar(s, {cliente, data, hora?, nova_data?, nova_hora?, nova_profissional?}, now) -> {plano} | Resultado`
  - `planoTrocarProfissional(s, {cliente, data, hora?, nova_profissional}, now) -> {plano} | Resultado`
  - `planoAusencia(s, {profissional, data}, now) -> {plano} | Resultado`
  - `planoDesfazer(s, now) -> {plano} | Resultado`
  - `aplicarPlano(s, plano, now, semLinhas=[]) -> {pacote, avisos:{cliente:string, link:string}[]}` — lança se vencido ou se qualquer linha falha (estado intacto).
  - `s.assistente = {planos:Plano[], pacotes:Pacote[]}`; `Pacote = {id, criado, titulo, mudancas:{atendimento_id, antes, depois}[]}`.

- [ ] **Step 1: Write the failing tests**:

```js
test('falta: mesmo horário com outra profissional, preferida primeiro, sem abrir vaga',()=>{
  /* Lia (P1) com Ana 09:00 Manicure e Bia 10:00 Pedicure em TERCA; Nina (P2) livre; Bia tem preferred:'P2'.
     const {plano}=planoAusencia(s,{profissional:'Lia',data:TERCA},now);
     espera 2 linhas com para.profissional 'Nina' e para.hora igual à de origem;
     aplicarPlano(s,plano,now) → atendimentos com staff_id 'P2', s.gaps.length===0,
     avisos[i].link começa com 'https://wa.me/' quando a cliente tem telefone */
});
test('falta: sem ninguém livre, a linha fica sem vaga com sugestões e não é movida',()=>{
  /* Nina ocupada às 09:00: linha.para===null e linha.aviso casa /sem vaga.*Sugestões:/;
     depois de aplicar, o atendimento continua com P1 e o aviso de WhatsApp pergunta
     /Quer que a gente procure outro horário/ */
});
test('falta: o texto avisa que a profissional continua no site',()=>{
  /* plano.avisos inclui 'A Lia continua aparecendo no agendamento do site neste dia.
     Para tirar, marque-a como inativa em Equipe e serviços.' */
});
test('confirmar depois que a agenda mudou não grava nada pela metade',()=>{
  /* plano de falta com 2 linhas; antes de aplicar, cancele o 2º atendimento (status 'cancelled');
     assert.throws(()=>aplicarPlano(s,plano,now),/agenda mudou/); o 1º continua com P1 */
});
test('plano vencido e plano com mais de 15 linhas',()=>{
  /* aplicarPlano(s,plano,plano.validoAte+1) → /venceu/ ;
     16 atendimentos da Lia → plano com 15 linhas e aviso /Mostrei os 15 primeiros/ */
});
test('pedido com vários serviços não muda de horário sozinho',()=>{
  /* atendimento com order:'R1' (e outro do mesmo order): planoRemarcar com nova_hora →
     Resultado.texto casa /faz parte de um pedido com mais serviços/ ;
     planoTrocarProfissional no mesmo horário → {plano} normal */
});
test('desfazer volta o último pacote, menos o que mudou depois',()=>{
  /* aplica um plano de troca; planoDesfazer → 1 linha de volta para a profissional antiga;
     se o atendimento foi mexido depois do pacote, a linha vem com aviso /mudou depois/ e para===null */
});
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** em `lib/assistente/planos.mjs`:
  - `planoAusencia` segue a spec 4.1: para cada atendimento `booked` futuro da profissional na data, em ordem de horário: candidatas = ativas, não removidas, ≠ ausente, que fazem o serviço e estão livres (`free`) no mesmo horário; ordem = preferida da cliente, depois menos atendimentos no dia. Sem candidata: `para=null` e `aviso = "sem vaga hoje. Sugestões: <até 2 horários de slots() no mesmo dia depois do horário e nos 3 dias seguintes>"` ou `"sem vaga; oferecer a lista de espera"`. Aplicar move com `{abrirVaga:false}`.
  - `planoRemarcar`/`planoTrocarProfissional` aplicam com `{abrirVaga:true}` quando muda data/hora e `false` quando só troca a profissional.
  - `aplicarPlano`: rejeita se `now > plano.validoAte` (`"Este plano venceu. Peça de novo."`); roda tudo num `structuredClone(s)`; se alguma linha falha → `throw Error('A agenda mudou desde o plano. Peça de novo para eu refazer.')`; se tudo passa, copia o clone de volta (`Object.assign(s,clone)`), grava o pacote, `s.events.unshift({..., text:'Assistente, confirmado pela gerência: '+titulo})` e remove o plano de `s.assistente.planos`.
  - Mensagens de WhatsApp (copiar):
    - troca: `Oi, <primeiro nome>! Seu horário de <dd/mm> às <HH:MM> continua, mas agora com a <nova> no lugar da <antiga>. Qualquer dúvida, é só responder. Equipe <salão>`
    - sem vaga: `Oi, <primeiro nome>! A <profissional> não vai poder atender <dd/mm> às <HH:MM>. Quer que a gente procure outro horário para você? Equipe <salão>`
    - remarcação: `Oi, <primeiro nome>! Seu horário mudou para <dd/mm> às <HH:MM> com a <profissional>. Qualquer dúvida, é só responder. Equipe <salão>`
- [ ] **Step 4: Run** `node --test tests/assistente.test.mjs` e `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Assistente: planos de remarcar, trocar, falta e desfazer, com aplicar tudo ou nada"`

### Task 4: Ferramentas para o Gemini e o despachante

**Files:**
- Create: `lib/assistente/ferramentas.mjs`
- Test: `tests/assistente.test.mjs`

**Interfaces:**
- Consumes: Task 2 e Task 3.
- Produces:
  - `FERRAMENTAS` — array de `functionDeclarations` do Gemini (formato `{name, description, parameters:{type:'OBJECT', properties:{...}, required:[...]}}`, tipos `STRING`), uma por função da Fase 1: `consultar_agenda{data,profissional?}`, `consultar_horarios_livres{data,servico,profissional?}`, `buscar_cliente{busca}`, `consultar_historico_cliente{cliente}`, `consultar_resumo_dia{data?}`, `remarcar_atendimento{cliente,data,hora?,nova_data?,nova_hora?,nova_profissional?}`, `trocar_profissional{cliente,data,hora?,nova_profissional}`, `registrar_ausencia_profissional{profissional,data}`, `desfazer_ultima_acao{}`. Datas `AAAA-MM-DD`, horas `HH:MM` (dito na `description`).
  - `executarFerramenta(s, nome, args, now) -> {tipo:'resposta'|'pergunta', texto} | {tipo:'plano', plano}` — valida `args` (datas/horas no formato; strings ≤ 100), nome desconhecido → `{tipo:'resposta', texto:'Ainda não sei fazer isso por aqui. Você encontra em Agenda.'}`; plano novo vai para `s.assistente.planos` (descarta vencidos; mantém 5).
  - `instrucoes(s, now) -> string` — instrução de sistema (copiar e completar): `Você é o assistente do painel da gerência da <salão>. Hoje é <dia da semana>, <AAAA-MM-DD>. Equipe: <nomes>. Responda em português, curto. Para qualquer pedido sobre agenda, clientes ou o dia, chame uma das funções; nunca invente horários, nomes ou valores. Se faltar informação (qual cliente, qual dia), pergunte em uma frase. Datas relativas ("amanhã", "sexta") viram AAAA-MM-DD a partir de hoje. Você não envia mensagens nem grava nada: mudanças viram um plano que a gerência confirma.`

- [ ] **Step 1: Write the failing tests**: cada nome de `FERRAMENTAS` tem executor (`executarFerramenta` não retorna o texto de "Ainda não sei" para nenhum deles com args válidos de exemplo); data inválida (`'amanhã'`) → `tipo:'pergunta'` com `/qual dia/i`; `registrar_ausencia_profissional` guarda o plano em `s.assistente.planos` e devolve `tipo:'plano'`; o JSON de `FERRAMENTAS` tem menos de 6000 caracteres (custo de tokens).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `git commit -m "Assistente: ferramentas da fase 1 e despachante"`

### Task 5: Cliente do Gemini com tool calling

**Files:**
- Create: `lib/assistente/gemini.ts`
- Test: `tests/assistente-gemini.test.mjs` (compile o `.ts` com `typescript.transpileModule`, como `tests/response-agent.test.mjs`)

**Interfaces:**
- Produces: `pedirAoGemini({key, model, instrucoes, historico, texto, ferramentas, fetcher=fetch}) -> Promise<{ferramenta:{nome:string,args:Record<string,any>}} | {texto:string}>`; `historico: {de:'gerente'|'assistente', texto:string}[]`. Lança `Error('O assistente não respondeu agora. Tente de novo em instantes ou use os botões do painel.')` em timeout, rede ou `!ok`; `Error('limite-gemini')` em HTTP 429.
- Corpo da requisição: `{systemInstruction:{parts:[{text:instrucoes}]}, contents:[...historico como user/model, {role:'user',parts:[{text}]}], tools:[{functionDeclarations:ferramentas}], toolConfig:{functionCallingConfig:{mode:'AUTO'}}}`; resposta: primeira `part.functionCall` vira `{ferramenta}`, senão junta `part.text`.

- [ ] **Step 1: Write the failing tests** com `fetcher` falso: devolve `functionCall` → `{ferramenta:{nome:'consultar_agenda',args:{data:'2026-10-27'}}}`; devolve texto → `{texto}`; 429 → rejeita `/limite-gemini/`; `ok:false` → rejeita com o texto de falha; o corpo enviado tem `contents.length === historico.length + 1` e cada parte com no máximo 500 caracteres.
- [ ] **Step 2–4:** FAIL → implementar → PASS (`node --test tests/assistente-gemini.test.mjs`).
- [ ] **Step 5: Commit** — `git commit -m "Assistente: cliente do Gemini com chamada de funções"`

### Task 6: Rota `/api/assistente` com teto diário

**Files:**
- Create: `app/api/assistente/route.ts`
- Modify: `lib/flowagenda.mjs` (`case 'settings'`: aceitar `assistantDailyLimit` inteiro 10–500 quando vier)
- Test: `tests/assistente-rota.test.mjs` (mesmo esquema de `tests/public-support.test.mjs`: D1 em memória com `drizzle/0000_young_lizard.sql`, `env` global, `compile()`; `requireAdmin` substituído por um stub que devolve `'flowagenda'`)

**Interfaces:**
- Consumes: `pedirAoGemini` (Task 5), `FERRAMENTAS, executarFerramenta, instrucoes` (Task 4), `aplicarPlano, planoDesfazer` (Task 3), `requireAdmin, sameOrigin` (lib/admin-auth), `upgrade` (flowagenda).
- Produces — `POST /api/assistente`, corpo `{action, ...}`, sempre `{resposta?, plano?, aplicado?, restante:number}`:
  - `{action:'perguntar', texto, historico}` → conta no teto (só se o Gemini respondeu); devolve `resposta` (texto) ou `plano`.
  - `{action:'confirmar', planoId, semLinhas?:string[]}` → `aplicarPlano`; devolve `aplicado:{titulo, avisos:[{cliente,link}]}`. Não conta.
  - `{action:'descartar', planoId}` → remove o plano. Não conta.
  - `{action:'desfazer'}` → `planoDesfazer` → `plano`. Não conta.
  - `GET /api/assistente` → `{restante, limite}`.
  - Teto atingido → status 429 e `{resposta:'O assistente chegou ao limite de hoje. Ele volta amanhã às 0h. Enquanto isso, tudo funciona pelos botões do painel.', restante:0}`; `Error('limite-gemini')` → mesmo texto trocando "Ele volta amanhã às 0h" por "Ele volta em alguns minutos".
  - Gravação: `UPDATE rooms ... WHERE version=?` uma vez; conflito → refaz a leitura no máximo 2 vezes (como `/api/cancelar`); sem chave do Gemini → `{resposta:'O assistente ainda não está configurado. Use os botões do painel.'}`.

- [ ] **Step 1: Write the failing tests**: (a) `perguntar` com fetcher falso que pede `consultar_agenda` → 200, `resposta` contém o horário do fixture, `restante` 59; (b) 61ª pergunta do dia → 429 com o texto do teto; (c) `perguntar` que gera plano de falta → `plano.linhas.length>0` e o estado salvo tem `assistente.planos[0].id === plano.id`; (d) `confirmar` desse plano → estado salvo com `staff_id` trocado e `restante` sem mudar; (e) Gemini com erro 500 → resposta de falha e `restante` sem mudar; (f) sem `Origin` igual → 400.
- [ ] **Step 2–4:** FAIL → implementar → PASS (`node --test tests/assistente-rota.test.mjs` e `npm test`).
- [ ] **Step 5: Commit** — `git commit -m "Assistente: rota com teto diário, confirmar e desfazer sem Gemini"`

### Task 7: Aba "Assistente" no painel

**Files:**
- Create: `app/assistente-panel.tsx`
- Modify: `app/admin-dashboard.tsx` (nova seção `{id:'assistant', name:'Assistente', icon:Sparkles}` logo depois de Agenda; título `Assistente` e descrição `Peça em poucas palavras. Mudanças só acontecem quando você confirma.`; renderiza `<AssistentePanel onRefresh={refresh}/>`), `app/globals.css` (estilos com prefixo `.assistente-`), formulário de Configurações (campo "Pedidos ao assistente por dia", 10–500, padrão 60).

**Interfaces:**
- Consumes: `/api/assistente` (Task 6). Depois de `confirmar`/`desfazer` aplicados, chama `onRefresh()` do painel.
- Produces: componente `AssistentePanel({onRefresh}:{onRefresh:()=>Promise<void>})`.

Comportamento:
- Lista de mensagens (gerente à direita, assistente à esquerda), caixa de texto de até 500 caracteres, Enter envia; guarda as últimas 6 para mandar como `historico`.
- Atalhos clicáveis acima da caixa (preenchem e enviam): `Resumo de hoje`, `Agenda de amanhã`, `Uma profissional faltou`.
- Cartão de plano como na spec seção 5: título; uma linha por mudança com `de → para`, `⚠ aviso` em destaque, botão `×` para tirar a linha (manda em `semLinhas`, sem Gemini); impacto; botões **Confirmar**, **Corrigir** (foca a caixa de texto com "Corrija: "), **Cancelar** (descartar); "Este plano vale até HH:MM".
- Depois de confirmar: mensagem "Feito: <titulo>" + um botão "Avisar <cliente> no WhatsApp" por aviso (abre o link em nova aba) + botão "Desfazer".
- `restante ≤ 20%` do limite → `Restam N pedidos ao assistente hoje.` acima da caixa; `restante = 0` → caixa bloqueada, texto do teto e atalhos para Agenda, Aceitações, Remarcações, Fechamento e Finanças (trocam a aba do painel).
- Mobile: cartão em coluna única, botões com 44 px de altura.

- [ ] **Step 1:** Implementar o componente e a aba; `npx tsc --noEmit -p .` sem erros.
- [ ] **Step 2: Verificar no navegador** (servidor local, senha de teste temporária em `.dev.vars` e banco local com backup, como nas verificações anteriores; com `GEMINI_API_KEY` local ou um stub): pedir "resumo de hoje"; "a Lia faltou terça" mostra o cartão; tirar uma linha; confirmar; ver a agenda mudar na grade; desfazer; em 375 px e 1366 px. Restaurar senha e banco.
- [ ] **Step 3: Commit** — `git commit -m "Assistente: aba no painel com cartão de confirmação e avisos pelo WhatsApp"`

### Task 8: Documentação

**Files:**
- Modify: `README.md` (seção "Assistente do painel": o que faz na fase 1, confirmação, teto diário e onde ajustar, que não envia mensagens, que precisa de `GEMINI_API_KEY`).

- [ ] **Step 1:** Escrever a seção. **Step 2:** `npm test` e `npx tsc --noEmit -p .` passam. **Step 3: Commit** — `git commit -m "README: assistente do painel"`

A publicação (`npm run deploy`) fica com a gerência, depois de olhar a aba no computador local.
