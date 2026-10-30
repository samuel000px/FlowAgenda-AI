import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {actAdmin,seedAdmin,today} from '../lib/flowagenda.mjs';

// Mesmo esquema de public-support.test.mjs: a rota é compilada com o env trocado por um objeto global.
// O login da gerência vira um stub que devolve a sala 'flowagenda'; a conferência de origem é a de verdade.
const root=new URL('../',import.meta.url),cache=new Map();
const env=globalThis.__assistenteEnv={};
const auth='data:text/javascript,'+encodeURIComponent(`export async function requireAdmin(){if(globalThis.__semSessao)throw Error('Sua sessão da administração terminou. Entre com a senha de novo.');return 'flowagenda';}
export function sameOrigin(req){if(req.headers.get('Origin')!==new URL(req.url).origin)throw Error('Origem inválida.');}`);
function compile(path){
 if(cache.has(path))return cache.get(path);
 let source=readFileSync(new URL(path,root),'utf8').replace(/import\s*\{\s*env\s*\}\s*from 'cloudflare:workers';/,'const env=globalThis.__assistenteEnv;');
 source=source.replace(/from '([^']+)'/g,(full,spec)=>{
  if(!spec.startsWith('.'))return full;
  const url=new URL(spec,new URL(path,root));
  if(url.pathname.endsWith('/lib/admin-auth'))return 'from '+JSON.stringify(auth);
  if(spec.endsWith('.mjs'))return 'from '+JSON.stringify(url.href);
  if(!existsSync(fileURLToPath(url)+'.ts'))return full;
  return 'from '+JSON.stringify(compile(decodeURIComponent(url.pathname.slice(root.pathname.length))+'.ts'));
 });
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const uri='data:text/javascript;base64,'+Buffer.from(js).toString('base64');cache.set(path,uri);return uri;
}
const api=await import(compile('app/api/assistente/route.ts'));

const FALHA='O assistente não respondeu agora. Tente de novo em instantes ou use os botões do painel.';
const TETO='O assistente chegou ao limite de hoje. Ele volta amanhã às 0h. Enquanto isso, tudo funciona pelos botões do painel.';
// Um dia útil (terça a sexta) pelo menos 2 dias à frente: a rota usa o relógio de verdade.
const DIA=(()=>{let t=Date.now()+2*86400000;for(;;t+=86400000){const d=today(t),w=new Date(d+'T12:00:00Z').getUTCDay();if(w>=2&&w<=5)return d;}})();
const CONTA=()=>`assistente:flowagenda:${today()}`;

// Lia (P1) com Ana às 10:00 (Manicure); Nina (P2) livre o dia todo.
function fixture(){
 const s=seedAdmin();
 s.staff=[{id:'P1',name:'Lia',active:true,start:480,end:1080,break_start:0,break_end:0,services:['S1','S2']},{id:'P2',name:'Nina',active:true,start:480,end:1080,break_start:0,break_end:0,services:['S1','S2']}];
 s.clients=[{id:'C1',name:'Ana Souza',phone:'5583999990001'}];
 s.appointments=[{id:'A1',client_id:'C1',service_id:'S1',staff_id:'P1',date:DIA,start:600,end:645,price:30,status:'booked',attendance:'unknown',reminded:false,result:null}];
 return s;
}
function setup({conflict=false,chave='chave-de-teste',state=fixture()}={}){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('drizzle/0000_young_lizard.sql',root),'utf8'));
 db.prepare('INSERT INTO rooms(id,manager,client,state,created,updated) VALUES(?,?,?,?,0,0)').run('flowagenda','m','c',JSON.stringify(state));
 const falhas={n:conflict?1:0};
 const prepare=(sql,args=[])=>({bind:(...a)=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args)||null,run:async()=>{
  if(falhas.n&&sql.startsWith('UPDATE rooms')){falhas.n--;return {meta:{changes:0}};}
  return {meta:{changes:db.prepare(sql).run(...args).changes}};
 }});
 env.DB={prepare};env.GEMINI_API_KEY=chave;env.GEMINI_MODEL='';globalThis.__semSessao=false;
 return {db,falhas,state:()=>JSON.parse(db.prepare("SELECT state FROM rooms WHERE id='flowagenda'").get().state),
  usado:()=>db.prepare('SELECT used FROM limits WHERE id=?').get(CONTA())?.used??0};
}
// Gemini falso: devolve a resposta pedida e guarda o corpo de cada chamada.
function gemini(resposta){
 const chamadas=[];
 globalThis.__assistenteFetch=async(url,init)=>{
  chamadas.push({url,body:JSON.parse(init.body)});
  if(typeof resposta==='number')return new Response('{}',{status:resposta});
  return Response.json({candidates:[{content:{parts:resposta}}]});
 };
 return chamadas;
}
const chama=(name,args)=>[{functionCall:{name,args}}];
const post=(body,origin='https://salon.test')=>api.POST(new Request('https://salon.test/api/assistente',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}));
const perguntar=(texto,historico=[])=>post({action:'perguntar',texto,historico});

test('sim após plano orienta usar o cartão, sem chamar Gemini nem gastar cota',async()=>{
 const {db,state,usado}=setup();try{
  const before=state(),calls=gemini(chama('desfazer_ultima_acao',{}));
  const r=await (await perguntar('Sim, pode confirmar a remarcação',[{de:'gerente',texto:'Remarcar Ana'},{de:'assistente',texto:'Plano: Remarcar Ana'}])).json();
  assert.match(r.resposta,/toque em Confirmar/);assert.equal(calls.length,0);assert.equal(usado(),0);assert.deepEqual(state(),before);
 }finally{db.close();}
});

test('duas consultas chegam juntas à tela, contam uma pergunta e não gravam a agenda',async()=>{
 const {db,state,usado}=setup();try{
  const before=state();
  gemini([...chama('consultar_agenda',{data:DIA}),...chama('consultar_estoque',{})]);
  const r=await (await perguntar('Agenda e estoque')).json();
  assert.match(r.resposta,/Ana Souza/);assert.match(r.resposta,/estoque/i);
  assert.equal(usado(),1);assert.deepEqual(state(),before);
 }finally{db.close();}
});
test('lote de alterações é recusado sem guardar nem aplicar plano parcial',async()=>{
 const {db,state}=setup();try{
  const before=state();
  gemini([...chama('trocar_profissional',{cliente:'Ana Souza',data:DIA,nova_profissional:'Nina'}),...chama('desfazer_ultima_acao',{})]);
  const r=await (await perguntar('Troca e desfaz')).json();
  assert.match(r.resposta,/uma alteração por vez/);assert.equal(r.plano,undefined);assert.deepEqual(state(),before);
 }finally{db.close();}
});

test('(a) perguntar que consulta a agenda responde com o horário e conta 1 no teto',async()=>{
 const {db,usado}=setup();try{
  const chamadas=gemini(chama('consultar_agenda',{data:DIA}));
  const r=await perguntar('Como está a agenda?');assert.equal(r.status,200);
  const b=await r.json();assert.match(b.resposta,/10:00 Ana Souza/);assert.equal(b.restante,59);
  assert.equal(usado(),1);assert.equal(chamadas.length,1);
  assert.match(chamadas[0].url,/gemini-3\.5-flash-lite:generateContent$/,'sem GEMINI_MODEL usa o modelo padrão');
 }finally{db.close();}
});

test('(b) a 61ª pergunta do dia para no teto sem chamar o Gemini',async()=>{
 const {db,usado}=setup();try{
  db.prepare('INSERT INTO limits(id,used) VALUES(?,60)').run(CONTA());
  const chamadas=gemini(chama('consultar_agenda',{data:DIA}));
  const r=await perguntar('Como está a agenda?');assert.equal(r.status,429);
  assert.deepEqual(await r.json(),{resposta:TETO,restante:0});
  assert.equal(chamadas.length,0);assert.equal(usado(),60);
 }finally{db.close();}
});

test('o teto segue settings.assistantDailyLimit',async()=>{
 const s=fixture();s.settings.assistantDailyLimit=10;
 const {db}=setup({state:s});try{
  db.prepare('INSERT INTO limits(id,used) VALUES(?,9)').run(CONTA());
  gemini(chama('consultar_agenda',{data:DIA}));
  assert.equal((await (await perguntar('Agenda?')).json()).restante,0);
  assert.equal((await perguntar('Agenda?')).status,429);
 }finally{db.close();}
});

test('(c) perguntar que gera plano de falta guarda o plano no cadastro',async()=>{
 const {db,state}=setup();try{
  gemini(chama('registrar_ausencia_profissional',{profissional:'Lia',data:DIA}));
  const r=await perguntar('A Lia vai faltar');assert.equal(r.status,200);
  const b=await r.json();assert.ok(b.plano.linhas.length>0);assert.equal(b.restante,59);
  const s=state();assert.equal(s.assistente.planos[0].id,b.plano.id);
  assert.equal(s.appointments[0].staff_id,'P1','montar o plano não muda a agenda');
 }finally{db.close();}
});

test('(d) confirmar aplica o plano guardado, devolve os avisos e não conta no teto',async()=>{
 const {db,state,usado}=setup();try{
  gemini(chama('registrar_ausencia_profissional',{profissional:'Lia',data:DIA}));
  const {plano}=await (await perguntar('A Lia vai faltar')).json();
  const chamadas=gemini(500);
  const r=await post({action:'confirmar',planoId:plano.id});assert.equal(r.status,200);
  const b=await r.json();assert.equal(b.restante,59);assert.equal(usado(),1);assert.equal(chamadas.length,0);
  assert.equal(b.aplicado.titulo,plano.titulo);
  assert.equal(b.aplicado.avisos.length,1);assert.equal(b.aplicado.avisos[0].cliente,'Ana Souza');assert.ok(b.aplicado.avisos[0].link.startsWith('https://wa.me/5583999990001?text='));
  const s=state();assert.equal(s.appointments[0].staff_id,'P2');assert.equal(s.assistente.planos.length,0);assert.equal(s.assistente.pacotes.length,1);
  // O mesmo plano não vale duas vezes.
  assert.deepEqual(await (await post({action:'confirmar',planoId:plano.id})).json(),{resposta:'Este plano não está mais disponível. Peça de novo.',restante:59});
 }finally{db.close();}
});

test('confirmar só aceita o id de um plano guardado, nunca um plano vindo no pedido',async()=>{
 const {db,state}=setup();try{
  const falso={id:'Qfalso',tipo:'trocar',titulo:'x',criado:Date.now(),validoAte:Date.now()+600000,linhas:[{id:'L1',atendimento_id:'A1',posicao:{date:DIA,start:600,end:645,staff_id:'P1'},para:{data:DIA,hora:'10:00',staff_id:'P2',profissional:'Nina'}}],avisos:[]};
  const r=await post({action:'confirmar',planoId:'Qfalso',plano:falso});
  assert.equal((await r.json()).resposta,'Este plano não está mais disponível. Peça de novo.');
  assert.equal(state().appointments[0].staff_id,'P1');
 }finally{db.close();}
});

test('confirmar com plano vencido ou agenda mudada não grava nada',async()=>{
 const {db,state}=setup();try{
  gemini(chama('registrar_ausencia_profissional',{profissional:'Lia',data:DIA}));
  const {plano}=await (await perguntar('A Lia vai faltar')).json();
  // A cliente cancelou depois do plano.
  const s=state();s.appointments[0].status='cancelled';db.prepare("UPDATE rooms SET state=? WHERE id='flowagenda'").run(JSON.stringify(s));
  assert.equal((await (await post({action:'confirmar',planoId:plano.id})).json()).resposta,'A agenda mudou desde o plano. Peça de novo para eu refazer.');
  assert.equal(state().appointments[0].staff_id,'P1');
  // Plano vencido conta como indisponível.
  const t=state();t.appointments[0].status='booked';t.assistente.planos[0].validoAte=Date.now()-1;db.prepare("UPDATE rooms SET state=? WHERE id='flowagenda'").run(JSON.stringify(t));
  assert.equal((await (await post({action:'confirmar',planoId:plano.id})).json()).resposta,'Este plano não está mais disponível. Peça de novo.');
  assert.equal(state().appointments[0].staff_id,'P1');
 }finally{db.close();}
});

test('confirmar refaz a leitura quando outra tela gravou no meio',async()=>{
 const {db,state,falhas}=setup();try{
  gemini(chama('registrar_ausencia_profissional',{profissional:'Lia',data:DIA}));
  const {plano}=await (await perguntar('A Lia vai faltar')).json();
  falhas.n=1;
  const r=await post({action:'confirmar',planoId:plano.id});assert.equal(r.status,200);assert.ok((await r.json()).aplicado);
  assert.equal(state().appointments[0].staff_id,'P2');
  falhas.n=3;
  gemini(chama('registrar_ausencia_profissional',{profissional:'Nina',data:DIA}));
  const r2=await perguntar('A Nina vai faltar');assert.equal(r2.status,409);
  const p2=await r2.json();assert.equal(p2.plano,undefined,'perguntar também desiste depois de 3 conflitos');assert.equal(p2.restante,58);
 }finally{db.close();}
});

test('descartar tira o plano e desfazer monta o plano de volta, sem Gemini e sem contar',async()=>{
 const {db,state,usado}=setup();try{
  gemini(chama('registrar_ausencia_profissional',{profissional:'Lia',data:DIA}));
  const {plano}=await (await perguntar('A Lia vai faltar')).json();
  const chamadas=gemini(500);
  const d=await (await post({action:'descartar',planoId:plano.id})).json();
  assert.equal(d.restante,59);assert.equal(state().assistente.planos.length,0);
  assert.equal((await (await post({action:'desfazer',pacoteId:'Kqualquer'})).json()).resposta,'Não há nenhuma mudança do assistente para desfazer.');
  assert.equal((await post({action:'desfazer'})).status,400,'desfazer sem pacoteId é recusado');
  gemini(chama('registrar_ausencia_profissional',{profissional:'Lia',data:DIA}));
  const {plano:p2}=await (await perguntar('A Lia vai faltar')).json();
  const {aplicado}=await (await post({action:'confirmar',planoId:p2.id})).json();
  assert.equal(aplicado.desfazivel,true);assert.equal(aplicado.pacoteId,state().assistente.pacotes[0].id);
  const volta=await (await post({action:'desfazer',pacoteId:aplicado.pacoteId})).json();
  assert.equal(volta.plano.tipo,'desfazer');assert.equal(volta.plano.desfaz,aplicado.pacoteId);assert.equal(volta.plano.linhas[0].para.staff_id,'P1');assert.equal(volta.restante,58);
  assert.equal(state().assistente.planos.at(-1).id,volta.plano.id);
  const desfeito=(await (await post({action:'confirmar',planoId:volta.plano.id})).json()).aplicado;
  assert.equal(desfeito.desfazivel,false,'o resultado de um desfazer não ganha botão Desfazer');assert.ok(desfeito.pacoteId);
  assert.equal(state().appointments[0].staff_id,'P1');
  assert.equal(usado(),2);assert.equal(chamadas.length,0);
 }finally{db.close();}
});

test('Desfazer depois de um desfazer ou de um plano sem mudança não oferece um pacote antigo sem relação',async()=>{
 // Ana (A1) com a Lia às 10:00 e Bia (A2) com a Nina às 14:00.
 const s0=fixture();
 s0.clients.push({id:'C2',name:'Bia Lima',phone:'5583999990002'});
 s0.appointments.push({...s0.appointments[0],id:'A2',client_id:'C2',staff_id:'P2',start:840,end:885});
 const {db,state}=setup({state:s0});try{
  const confirmar=async planoId=>(await (await post({action:'confirmar',planoId})).json()).aplicado;
  const desfazer=async pacoteId=>await (await post({action:'desfazer',pacoteId})).json();
  // Pacote A: a Lia falta e a Ana vai para a Nina. Pacote B: a Bia troca da Nina para a Lia.
  gemini(chama('registrar_ausencia_profissional',{profissional:'Lia',data:DIA}));
  const a=await confirmar((await (await perguntar('A Lia vai faltar')).json()).plano.id);
  gemini(chama('trocar_profissional',{cliente:'Bia',data:DIA,nova_profissional:'Lia'}));
  const b=await confirmar((await (await perguntar('Bia com a Lia')).json()).plano.id);
  assert.ok(a.desfazivel&&b.desfazivel&&a.pacoteId!==b.pacoteId);
  const NAO=/não dá mais para desfazer por aqui/;
  // A não é o último: o botão dele não desfaz B nem A.
  const velho=await desfazer(a.pacoteId);assert.match(velho.resposta,NAO);assert.equal(velho.plano,undefined);
  // Desfaz B; o resultado do desfazer não oferece A.
  const u=await confirmar((await desfazer(b.pacoteId)).plano.id);
  assert.equal(u.desfazivel,false);
  assert.deepEqual(state().appointments.map(x=>x.staff_id),['P2','P2'],'B voltou, A continua');
  for(const k of [u.pacoteId,b.pacoteId]){const r=await desfazer(k);assert.match(r.resposta,NAO);assert.equal(r.plano,undefined);}
  assert.equal(state().assistente.planos.length,0,'nenhum plano de desfazer foi montado');
  // Plano sem mudança (ninguém livre para cobrir a Nina): nada gravado, sem pacote e sem botão.
  const t=state();t.staff[0].active=false;db.prepare("UPDATE rooms SET state=? WHERE id='flowagenda'").run(JSON.stringify(t));
  gemini(chama('registrar_ausencia_profissional',{profissional:'Nina',data:DIA}));
  const nada=await confirmar((await (await perguntar('A Nina vai faltar')).json()).plano.id);
  assert.deepEqual([nada.pacoteId,nada.desfazivel],[null,false]);
  assert.equal(state().assistente.pacotes.length,3,'o plano sem mudança não grava pacote');
  assert.equal((await post({action:'desfazer'})).status,400);
  assert.equal(state().assistente.planos.length,0);
  // O botão do próprio A, agora o último que dá para desfazer, volta exatamente A.
  const v=state();v.staff[0].active=true;db.prepare("UPDATE rooms SET state=? WHERE id='flowagenda'").run(JSON.stringify(v));
  const volta=await desfazer(a.pacoteId);
  assert.equal(volta.plano.desfaz,a.pacoteId);assert.deepEqual(volta.plano.linhas.map(l=>[l.cliente,l.para?.staff_id]),[['Ana Souza','P1']]);
 }finally{db.close();}
});

test('(e) Gemini com erro 500 devolve a falha e não conta',async()=>{
 const {db,usado}=setup();try{
  gemini(500);
  const b=await (await perguntar('Como está a agenda?')).json();
  assert.deepEqual(b,{resposta:FALHA,restante:60});assert.equal(usado(),0);
 }finally{db.close();}
});

test('Gemini sem função e sem texto pede outra forma e não conta',async()=>{
 const {db,usado}=setup();try{
  gemini([{text:''}]);
  assert.deepEqual(await (await perguntar('Oi')).json(),{resposta:'Não entendi esse pedido. Pode dizer de outro jeito? Eu vejo a agenda, as clientes, o resumo do dia e o estoque.',restante:60});assert.equal(usado(),0);
 }finally{db.close();}
});

test('limite do Gemini (429) informa a cota sem prometer prazo e não conta',async()=>{
 const {db,usado}=setup();try{
  gemini(429);
  const r=await perguntar('Oi');assert.equal(r.status,429);
  assert.deepEqual(await r.json(),{resposta:'O Gemini atingiu o limite de uso disponível. Tente mais tarde ou use os botões do painel. O prazo de liberação depende da cota do provedor.',restante:60});
  assert.equal(usado(),0);
 }finally{db.close();}
});

test('resposta em texto do Gemini volta como resposta e conta',async()=>{
 const {db,usado}=setup();try{
  gemini([{text:'Qual dia?'}]);
  assert.deepEqual(await (await perguntar('Mostra a agenda')).json(),{resposta:'Qual dia?',restante:59});assert.equal(usado(),1);
 }finally{db.close();}
});

test('histórico: só as últimas 8 mensagens válidas vão para o Gemini',async()=>{
 const {db}=setup();try{
  const chamadas=gemini([{text:'Ok'}]);
  const historico=[...Array.from({length:10},(_,i)=>({de:i%2?'assistente':'gerente',texto:'m'+i})),{de:'sistema',texto:'x'},{de:'gerente',texto:5},'lixo',null];
  await perguntar('E agora?',historico);
  const contents=chamadas[0].body.contents;
  assert.deepEqual(contents.map(c=>c.parts[0].text),['m2','m3','m4','m5','m6','m7','m8','m9','E agora?']);
  assert.deepEqual(contents.map(c=>c.role),['user','model','user','model','user','model','user','model','user']);
 }finally{db.close();}
});

test('histórico: avisos de falha saem, falas seguidas se juntam e a conversa começa pela gerente',async()=>{
 const {db}=setup();try{
  const chamadas=gemini([{text:'Ok'}]);
  const historico=[{de:'assistente',texto:'Olá'},{de:'gerente',texto:'quais são os esmaltes no painel da entrada?'},{de:'assistente',texto:FALHA}];
  await perguntar('Expositor da entrada',historico);
  const contents=chamadas[0].body.contents;
  assert.deepEqual(contents.map(c=>c.role),['user']);
  assert.deepEqual(contents[0].parts.map(p=>p.text),['quais são os esmaltes no painel da entrada?','Expositor da entrada']);
 }finally{db.close();}
});

test('sem chave do Gemini avisa que não está configurado e não conta',async()=>{
 const {db,usado}=setup({chave:''});try{
  const chamadas=gemini([{text:'Ok'}]);
  assert.deepEqual(await (await perguntar('Oi')).json(),{resposta:'O assistente ainda não está configurado. Use os botões do painel.',restante:60});
  assert.equal(chamadas.length,0);assert.equal(usado(),0);
 }finally{db.close();}
});

test('(f) sem Origin igual o pedido é recusado com 400 e nada é gravado',async()=>{
 const {db,usado}=setup();try{
  const chamadas=gemini(chama('consultar_agenda',{data:DIA}));
  assert.equal((await post({action:'perguntar',texto:'Oi'},'https://outro.test')).status,400);
  assert.equal((await api.POST(new Request('https://salon.test/api/assistente',{method:'POST',body:JSON.stringify({action:'perguntar',texto:'Oi'})}))).status,400);
  assert.equal(chamadas.length,0);assert.equal(usado(),0);
 }finally{db.close();}
});

test('pedido sem sessão, ação desconhecida, texto vazio ou longo demais',async()=>{
 const {db}=setup();try{
  gemini([{text:'Ok'}]);
  assert.equal((await post({action:'qualquer'})).status,400);
  assert.equal((await perguntar('   ')).status,400);
  assert.equal((await perguntar('x'.repeat(501))).status,400);
  assert.equal((await post({action:'perguntar',texto:'x'.repeat(13000)})).status,413);
  globalThis.__semSessao=true;
  assert.equal((await perguntar('Oi')).status,401);
  assert.equal((await api.GET(new Request('https://salon.test/api/assistente'))).status,401);
 }finally{globalThis.__semSessao=false;db.close();}
});

test('GET devolve quanto resta e o limite do dia',async()=>{
 const s=fixture();s.settings.assistantDailyLimit=100;
 const {db}=setup({state:s});try{
  db.prepare('INSERT INTO limits(id,used) VALUES(?,7)').run(CONTA());
  const r=await api.GET(new Request('https://salon.test/api/assistente'));
  assert.deepEqual(await r.json(),{restante:93,limite:100});
 }finally{db.close();}
});

test('configurações aceitam assistantDailyLimit inteiro de 10 a 500 e mantêm quando não vem',()=>{
 const s=seedAdmin(),base={name:'Santa Cor',minNotice:1,autoNext:true};
 for(const v of [9,501,60.5,'60',null])assert.throws(()=>actAdmin(s,'settings',{...base,assistantDailyLimit:v}),/assistente/);
 actAdmin(s,'settings',{...base,assistantDailyLimit:120});assert.equal(s.settings.assistantDailyLimit,120);
 actAdmin(s,'settings',base);assert.equal(s.settings.assistantDailyLimit,120);
});
