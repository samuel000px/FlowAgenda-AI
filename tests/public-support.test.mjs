import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {seedAdmin} from '../lib/flowagenda.mjs';
import {publicSupportInput,requestPublicSupport,supportAction,supportView} from '../lib/support-core.mjs';
import {staffView,applyStaffAction} from '../lib/staff-core.mjs';

const root=new URL('../',import.meta.url),cache=new Map();
const env=globalThis.__publicSupportEnv={};
function compile(path){
 if(cache.has(path))return cache.get(path);
 let source=readFileSync(new URL(path,root),'utf8').replace(/import\s*\{\s*env\s*\}\s*from 'cloudflare:workers';/,'const env=globalThis.__publicSupportEnv;');
 source=source.replace(/from '([^']+)'/g,(full,spec)=>{
  if(!spec.startsWith('.'))return full;
  const url=new URL(spec,new URL(path,root));
  if(spec.endsWith('.mjs'))return 'from '+JSON.stringify(url.href);
  if(!existsSync(fileURLToPath(url)+'.ts'))return full;
  return 'from '+JSON.stringify(compile(decodeURIComponent(url.pathname.slice(root.pathname.length))+'.ts'));
 });
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const uri='data:text/javascript;base64,'+Buffer.from(js).toString('base64');cache.set(path,uri);return uri;
}
const api=await import(compile('app/api/atendimento/route.ts'));
const input=()=>({name:'Cliente de exemplo',phone:'(83) 99999-0000',text:'Gostaria de tirar uma dúvida sobre um serviço.',consent:true,requestId:crypto.randomUUID()});
function fixture(){const s=seedAdmin();s.staff=[{id:'P1',name:'Lia',services:['S1'],active:true,start:540,end:1080},{id:'P2',name:'Nina',services:['S1'],active:true,start:540,end:1080}];return s;}
function setup({conflict=false}={}){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('drizzle/0000_young_lizard.sql',root),'utf8'));
 const state=fixture();db.prepare('INSERT INTO rooms(id,manager,client,state,created,updated) VALUES(?,?,?,?,0,0)').run('flowagenda','private-manager','private-client',JSON.stringify(state));
 let failOnce=conflict;
 const prepare=(sql,args=[])=>({bind:(...a)=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args)||null,run:async()=>{
  if(failOnce&&sql.startsWith('UPDATE rooms')){failOnce=false;return {meta:{changes:0}};}
  return {meta:{changes:db.prepare(sql).run(...args).changes}};
 }});
 env.DB={prepare};
 return {db,state:()=>JSON.parse(db.prepare("SELECT state FROM rooms WHERE id='flowagenda'").get().state)};
}
const post=(body,origin='https://salon.test')=>api.POST(new Request('https://salon.test/api/atendimento',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'127.0.0.1'},body:JSON.stringify(body)}));

test('public request appears for administration and employees without changing clients, bookings or outbound messages',async()=>{
 const {db,state}=setup({conflict:true});try{
  const before=state(),p=input();const response=await post({...p,room:'another-room',owner:{role:'admin'},status:'closed'});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});
  const s=state();assert.equal(supportView(s).length,1);assert.equal(staffView(s,'P1').tickets.length,1);
  const t=supportView(s)[0];assert.equal(t.source,'site');assert.equal(t.owner,null);assert.equal(t.status,'open');assert.equal(t.phone,'5583999990000');
  assert.deepEqual(s.clients,before.clients);assert.deepEqual(s.appointments,before.appointments);assert.deepEqual(s.messages,before.messages);
  applyStaffAction(s,'P1',{action:'support_claim',id:t.id,requestId:crypto.randomUUID()});
  assert.throws(()=>applyStaffAction(s,'P2',{action:'support_claim',id:t.id,requestId:crypto.randomUUID()}),/outra pessoa/);
  supportAction(s,'support_claim',{id:t.id},{role:'admin',id:'admin',name:'Administração'});
  assert.equal(supportView(s)[0].owner.role,'admin');
  supportAction(s,'support_close',{id:t.id},{role:'admin',id:'admin',name:'Administração'});
  assert.equal(staffView(s,'P1').tickets.length,0);assert.deepEqual(s.appointments,before.appointments);
 }finally{db.close();}
});
test('retries do not duplicate or rewrite a claimed or closed ticket',()=>{
 const s=fixture(),p=input();requestPublicSupport(s,p);const t=s.supportTickets[0];
 supportAction(s,'support_claim',{id:t.id},{role:'staff',id:'P1',name:'Lia'});
 requestPublicSupport(s,{...p,name:'Alterado',text:'Outro texto'});
 assert.equal(t.name,p.name);assert.equal(t.text,p.text);assert.equal(t.owner.id,'P1');assert.equal(s.supportTickets.length,1);
 supportAction(s,'support_close',{id:t.id},{role:'staff',id:'P1',name:'Lia'});requestPublicSupport(s,p);assert.equal(supportView(s).length,0);
 requestPublicSupport(s,{...p,requestId:crypto.randomUUID()});assert.equal(supportView(s).length,1);
});
test('public form validates consent, phone, message length and request identifier',()=>{
 for(const patch of [{name:'A'},{name:'x'.repeat(101)},{phone:'123'},{phone:'00000000000'},{text:'oi'},{text:'x'.repeat(1001)},{consent:false},{consent:'true'},{requestId:'unsafe'}])assert.throws(()=>publicSupportInput({...input(),...patch}));
 assert.equal(publicSupportInput(input()).phone,'5583999990000');
});
test('endpoint rejects cross-origin submissions and oversized bodies without writing',async()=>{
 const {db,state}=setup();try{
  assert.equal((await post(input(),'https://other.test')).status,400);
  assert.equal((await post({...input(),text:'x'.repeat(5000)})).status,413);
  assert.equal((await post({...input(),consent:false})).status,400);
  assert.equal(state().supportTickets,undefined);
 }finally{db.close();}
});
test('public endpoint limits requests without exposing private records',async()=>{
 const {db,state}=setup();try{
  for(let n=0;n<10;n++)assert.equal((await post(input())).status,200);
  const r=await post(input());assert.equal(r.status,429);assert.equal(state().supportTickets.length,10);
  assert.ok(!JSON.stringify(await r.json()).includes('private-manager'));
 }finally{db.close();}
});
