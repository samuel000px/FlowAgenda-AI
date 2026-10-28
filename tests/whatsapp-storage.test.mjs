import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {seedAdmin,message} from '../lib/flowagenda.mjs';
import {queueMessage} from '../lib/whatsapp-core.mjs';
const root=new URL('../',import.meta.url),cache=new Map(),jobs=[];
globalThis.__waTestEnv={APP_SENHA:'only-a-test-password',CALENDAR_ENCRYPTION_KEY:'ab'.repeat(32)};
globalThis.__waJobs=jobs;
function compile(path){
 if(cache.has(path))return cache.get(path);
 let source=readFileSync(new URL(path,root),'utf8').replace("import {env} from 'cloudflare:workers';","const env=globalThis.__waTestEnv;")
  .replace("import {getRequestExecutionContext} from 'vinext/shims/request-context';","const getRequestExecutionContext=()=>({waitUntil:p=>globalThis.__waJobs.push(p)});");
 source=source.replace(/from '([^']+)'/g,(full,spec)=>{
  if(!spec.startsWith('.'))return full;
  const u=new URL(spec,new URL(path,root));if(spec.endsWith('.mjs'))return 'from '+JSON.stringify(u.href);
  const file=fileURLToPath(u)+'.ts';if(!existsSync(file))return full;
  const rel=decodeURIComponent(u.pathname.slice(root.pathname.length))+'.ts';return 'from '+JSON.stringify(compile(rel));
 });
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const uri='data:text/javascript;base64,'+Buffer.from(js).toString('base64');cache.set(path,uri);return uri;
}
const {connection,saveConnection,whatsappStatus,updateRoom,flushWhatsApp}=await import(compile('lib/whatsapp.ts'));
const {runWhatsAppSchedule}=await import(compile('lib/whatsapp-scheduler.ts'));
const webhook=await import(compile('app/api/whatsapp/webhook/route.ts'));
const api=await import(compile('app/api/whatsapp/route.ts'));
const env=globalThis.__waTestEnv;
function setup(){
 const db=new DatabaseSync(':memory:');for(const name of ['0000_young_lizard.sql','0001_foamy_klaw.sql','0002_whatsapp.sql'])db.exec(readFileSync(new URL('drizzle/'+name,root),'utf8'));
 const prepare=(sql,args=[])=>({bind:(...next)=>prepare(sql,next),first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:{changes:db.prepare(sql).run(...args).changes}})});
 env.DB={prepare,batch:async statements=>{db.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const s=seedAdmin();s.clients=[{id:'C1',name:'Teste',phone:'5581999999999',consent:true}];s.whatsappLastInbound={'5581999999999':Date.now()};
 db.prepare('INSERT INTO rooms(id,manager,client,state,created,updated) VALUES(?,?,?,?,?,?)').run('test','manager','client',JSON.stringify(s),Date.now(),Date.now());
 return {db,state:()=>JSON.parse(db.prepare('SELECT state FROM rooms WHERE id=?').get('test').state)};
}
const input={phoneId:'12345678',version:'v26.0',allowed:'5581999999999',accessToken:'fake-access-token-for-test-only',appSecret:'c'.repeat(32),enabled:true};
async function withFetch(fn){const original=globalThis.fetch;let sends=0;globalThis.fetch=async(url,options)=>options?.method==='POST'?(sends++,Response.json({messages:[{id:'wamid.sent.'+sends}]})):Response.json({id:input.phoneId,display_phone_number:'+55 81 99999-9999',verified_name:'Teste'});try{await fn(()=>sends);}finally{globalThis.fetch=original;}}
test('connection secrets are encrypted, scoped and never returned by the administration status',async()=>withFetch(async()=>{
 const {db}=setup();await saveConnection(env,'test',input);const raw=db.prepare('SELECT * FROM whatsapp_connections').get();assert.ok(!raw.secrets.includes(input.accessToken));assert.ok(!raw.settings.includes(input.appSecret));
 const c=await connection(env,'test'),status=await whatsappStatus(env,'test');assert.equal(c.accessToken,input.accessToken);assert.equal(status.accessToken,undefined);assert.equal(status.appSecret,undefined);assert.ok(status.verifyToken);
 await saveConnection(env,'test',{...input,accessToken:'',appSecret:''});assert.equal((await connection(env,'test')).accessToken,input.accessToken);db.close();
}));
test('concurrent outbox processors claim a message once and preserve its Meta ID',async()=>withFetch(async sends=>{
 const {db,state}=setup();await saveConnection(env,'test',input);const c=await connection(env,'test');await updateRoom(env,'test',s=>message(s,'C1','agent','Mensagem nova'),c);
 await Promise.all([flushWhatsApp(env,'test'),flushWhatsApp(env,'test')]);assert.equal(sends(),1);assert.equal(state().messages[0].whatsapp.id,'wamid.sent.1');assert.equal(state().messages[0].whatsapp.status,'accepted');db.close();
}));
test('changing a client phone blocks a queued message instead of sending it to the old owner',async()=>withFetch(async sends=>{
 const {db,state}=setup();await saveConnection(env,'test',input);const c=await connection(env,'test');await updateRoom(env,'test',s=>{message(s,'C1','agent','Mensagem');queueMessage(s,s.messages.at(-1),c);s.clients[0].phone='5581888888888';});
 await flushWhatsApp(env,'test');assert.equal(sends(),0);assert.equal(state().messages[0].whatsapp.status,'blocked');db.close();
}));
test('expired conversation queues text without silently substituting a paid template',async()=>withFetch(async sends=>{
 const {db,state}=setup();await saveConnection(env,'test',input);const c=await connection(env,'test');await updateRoom(env,'test',s=>{s.whatsappLastInbound={};message(s,'C1','agent','Olá');},c);await flushWhatsApp(env,'test');assert.equal(sends(),0);assert.equal(state().messages[0].whatsapp.status,'waiting_window');db.close();
}));
test('webhook route verifies the handshake, rejects forgery, persists and deduplicates actual replies',async()=>withFetch(async()=>{
 const {db,state}=setup();await saveConnection(env,'test',input);const c=await connection(env,'test');
 const base='https://example.test/api/whatsapp/webhook?room=test';
 assert.equal((await webhook.GET(new Request(base+'&hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42'))).status,403);
 const check=await webhook.GET(new Request(base+'&hub.mode=subscribe&hub.verify_token='+c.verifyToken+'&hub.challenge=42'));assert.equal(await check.text(),'42');
 const raw=JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:c.phoneId},messages:[{id:'wamid.received',from:input.allowed,type:'text',text:{body:'Olá'},timestamp:String(Math.floor(Date.now()/1000))}]}}]}]});
 const req=sig=>new Request(base,{method:'POST',headers:{'x-hub-signature-256':sig},body:raw});assert.equal((await webhook.POST(req('invalid'))).status,403);
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(c.appSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig='sha256='+Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw))).toString('hex');
 assert.equal((await webhook.POST(req(sig))).status,200);await Promise.all(jobs.splice(0));assert.equal(state().messages.filter(m=>m.whatsapp?.id==='wamid.received').length,1);
 assert.equal((await webhook.POST(req(sig))).status,200);await Promise.all(jobs.splice(0));assert.equal(state().messages.filter(m=>m.whatsapp?.id==='wamid.received').length,1);assert.deepEqual(state().whatsappInbox,[]);db.close();
}));
test('administration endpoint rejects anonymous reads and cross-origin changes',async()=>{const {db}=setup();assert.equal((await api.GET(new Request('https://example.test/api/whatsapp'))).status,401);const r=await api.POST(new Request('https://example.test/api/whatsapp',{method:'POST',headers:{Origin:'https://other.test'},body:'{"action":"disconnect"}'}));assert.equal(r.status,400);db.close();});

test('business settings survive encrypted persistence and cannot send hello_world on a real number',async()=>withFetch(async sends=>{
 const {db}=setup();await saveConnection(env,'test',{...input,mode:'business',restricted:false,allowed:'',templates:{enabled:true,language:'pt_BR',offer:'flowagenda_encaixe',reminder:'flowagenda_presenca'}});const c=await connection(env,'test');assert.equal(c.mode,'business');assert.equal(c.restricted,false);assert.equal(c.templates.enabled,true);assert.equal((await whatsappStatus(env,'test')).templates.offer,'flowagenda_encaixe');
 await assert.rejects(()=>updateRoom(env,'test',s=>{message(s,'C1','manager','Teste',{template:'hello_world'});queueMessage(s,s.messages.at(-1),c,Date.now(),true);}),/teste/);assert.equal(sends(),0);db.close();
}));
test('scheduled run prepares and sends reminder without a browser and repeated runs do not duplicate it',async()=>withFetch(async sends=>{
 const {db,state}=setup();await saveConnection(env,'test',{...input,mode:'business',restricted:false,allowed:'',templates:{enabled:true,language:'pt_BR',offer:'flowagenda_encaixe',reminder:'flowagenda_presenca'}});
 const local=new Date(Date.now()+15*60000-3*3600000).toISOString(),date=local.slice(0,10),start=Number(local.slice(11,13))*60+Number(local.slice(14,16));
 await updateRoom(env,'test',s=>{s.whatsappLastInbound={};s.staff=[{id:'P1',name:'Lia'}];s.appointments=[{id:'A1',client_id:'C1',service_id:'S1',staff_id:'P1',date,start,end:start+45,status:'booked',attendance:'unknown',reminded:false}];});
 await runWhatsAppSchedule(env);assert.equal(sends(),1);assert.equal(state().messages[0].whatsapp.template.name,'flowagenda_presenca');assert.ok((await whatsappStatus(env,'test')).schedulerChecked);await runWhatsAppSchedule(env);assert.equal(sends(),1);db.close();
}));
test('scheduled run does not process reminders while automation is paused',async()=>withFetch(async sends=>{
 const {db}=setup();await saveConnection(env,'test',{...input,enabled:false});await runWhatsAppSchedule(env);assert.equal(sends(),0);assert.equal((await whatsappStatus(env,'test')).schedulerChecked,0);db.close();
}));

test('a failed delivery callback arriving before the HTTP acknowledgement remains failed',async()=>{
 const original=globalThis.fetch;const {db,state}=setup();globalThis.fetch=async(url,options)=>{
  if(options?.method!=='POST')return Response.json({id:input.phoneId});
  const payload=JSON.parse(options.body);await updateRoom(env,'test',s=>{const m=s.messages.find(m=>m.id===payload.biz_opaque_callback_data);m.whatsapp.status='failed';m.whatsapp.error='Conta restrita';m.whatsapp.id='wamid.early';});return Response.json({messages:[{id:'wamid.early'}]});
 };
 try{await saveConnection(env,'test',input);const c=await connection(env,'test');await updateRoom(env,'test',s=>message(s,'C1','agent','Olá'),c);await flushWhatsApp(env,'test');assert.equal(state().messages[0].whatsapp.status,'failed');assert.equal(state().messages[0].whatsapp.error,'Conta restrita');}finally{globalThis.fetch=original;db.close();}
});
