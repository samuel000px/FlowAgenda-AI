import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/assistente/gemini.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {pedirAoGemini}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const FALHA='O assistente não respondeu agora. Tente de novo em instantes ou use os botões do painel.';
const ferramentas=[{name:'consultar_agenda',description:'x',parameters:{type:'OBJECT',properties:{data:{type:'STRING'}}}},{name:'desfazer_ultima_acao',description:'y'}];
const resposta=parts=>Response.json({candidates:[{content:{parts}}]});
// Fetcher falso que guarda a chamada para os testes conferirem.
const falso=(r,vistas=[])=>Object.assign(async(url,init)=>{vistas.push({url,init,corpo:JSON.parse(init.body)});return typeof r==='function'?r():r;},{vistas});
const base=(extra={})=>({key:'k',model:'modelo-x',instrucoes:'Seja breve.',historico:[],texto:'oi',ferramentas,...extra});
test('functionCall vira ferramenta com os argumentos',async()=>{
 const f=falso(resposta([{functionCall:{name:'consultar_agenda',args:{data:'2026-10-27'}}}]));
 assert.deepEqual(await pedirAoGemini(base({fetcher:f})),{ferramenta:{nome:'consultar_agenda',args:{data:'2026-10-27'}}});
});
test('functionCall sem args devolve args vazio',async()=>{
 const f=falso(resposta([{functionCall:{name:'desfazer_ultima_acao'}}]));
 assert.deepEqual(await pedirAoGemini(base({fetcher:f})),{ferramenta:{nome:'desfazer_ultima_acao',args:{}}});
});
test('a primeira functionCall vence mesmo com texto antes',async()=>{
 const f=falso(resposta([{text:'vou ver'},{functionCall:{name:'consultar_agenda',args:{}}}]));
 assert.equal((await pedirAoGemini(base({fetcher:f}))).ferramenta.nome,'consultar_agenda');
});
test('texto das partes é juntado',async()=>{
 const f=falso(resposta([{text:'Olá, '},{text:'tudo bem?'}]));
 assert.deepEqual(await pedirAoGemini(base({fetcher:f})),{texto:'Olá, tudo bem?'});
});
test('429 vira limite-gemini',async()=>{
 await assert.rejects(()=>pedirAoGemini(base({fetcher:falso(new Response('{}',{status:429}))})),/limite-gemini/);
});
test('resposta não ok, rede e timeout viram a mensagem de falha',async()=>{
 await assert.rejects(()=>pedirAoGemini(base({fetcher:falso(new Response('{}',{status:500}))})),e=>e.message===FALHA);
 await assert.rejects(()=>pedirAoGemini(base({fetcher:async()=>{throw Error('detalhe-interno');}})),e=>e.message===FALHA);
 await assert.rejects(()=>pedirAoGemini(base({fetcher:async()=>{throw new DOMException('t','TimeoutError');}})),e=>e.message===FALHA);
});
test('corpo e chamada seguem o padrão do Gemini; texto e histórico cortados em 500',async()=>{
 const vistas=[],longo='a'.repeat(900);
 const historico=[{de:'gerente',texto:longo},{de:'assistente',texto:'resposta'}];
 await pedirAoGemini(base({historico,texto:longo,fetcher:falso(resposta([{text:'ok'}]),vistas)}));
 const {url,init,corpo}=vistas[0];
 assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/modelo-x:generateContent');
 assert.equal(init.method,'POST');assert.equal(init.headers['x-goog-api-key'],'k');assert.ok(init.signal);
 assert.deepEqual(corpo.systemInstruction,{parts:[{text:'Seja breve.'}]});
 assert.equal(corpo.contents.length,historico.length+1);
 assert.deepEqual(corpo.contents.map(c=>c.role),['user','model','user']);
 for(const c of corpo.contents)for(const p of c.parts)assert.ok(p.text.length<=500);
 assert.equal(corpo.contents[2].parts[0].text.length,500);
 assert.deepEqual(corpo.tools,[{functionDeclarations:ferramentas}]);
 assert.deepEqual(corpo.toolConfig,{functionCallingConfig:{mode:'AUTO'}});
});
test('demora, queda ou 404 no modelo escolhido tentam o reserva uma vez',async()=>{
 for(const primeiro of [async()=>{throw new DOMException('t','TimeoutError');},async()=>new Response('{}',{status:503}),async()=>new Response('{}',{status:404})]){
  const vistas=[];let n=0;
  const f=async(url,init)=>{vistas.push(url);return n++?resposta([{text:'ok'}]):primeiro();};
  assert.deepEqual(await pedirAoGemini(base({fetcher:f})),{texto:'ok'});
  assert.equal(vistas.length,2);
  assert.match(vistas[1],/models\/gemini-3\.1-flash-lite:generateContent$/);
 }
});
test('chave inválida não tenta o reserva',async()=>{
 const vistas=[];
 await assert.rejects(()=>pedirAoGemini(base({fetcher:falso(new Response('{}',{status:400}),vistas)})),e=>e.message===FALHA);
 assert.equal(vistas.length,1);
});
test('limite no primeiro e resposta no reserva',async()=>{
 let n=0;
 const f=async()=>n++?resposta([{text:'ok'}]):new Response('{}',{status:429});
 assert.deepEqual(await pedirAoGemini(base({fetcher:f})),{texto:'ok'});
});
