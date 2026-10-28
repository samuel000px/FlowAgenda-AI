import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {seedAdmin} from '../lib/flowagenda.mjs';
import {seal,SCOPE} from '../lib/calendar-core.mjs';
const root=new URL('../',import.meta.url),cache=new Map();
const env=globalThis.__googleTestEnv={APP_SENHA:'test-only',CALENDAR_ENCRYPTION_KEY:'ab'.repeat(32),GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'test-secret',GOOGLE_REDIRECT_URI:'https://example.test/api/google/callback'};
function compile(path){
 if(cache.has(path))return cache.get(path);
 let source=readFileSync(new URL(path,root),'utf8').replace(/import\s*\{\s*env\s*\}\s*from 'cloudflare:workers';/,"const env=globalThis.__googleTestEnv;");
 source=source.replace(/from '([^']+)'/g,(full,spec)=>{
  if(!spec.startsWith('.'))return full;
  const u=new URL(spec,new URL(path,root));if(spec.endsWith('.mjs'))return 'from '+JSON.stringify(u.href);
  if(!existsSync(fileURLToPath(u)+'.ts'))return full;
  return 'from '+JSON.stringify(compile(decodeURIComponent(u.pathname.slice(root.pathname.length))+'.ts'));
 });
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const uri='data:text/javascript;base64,'+Buffer.from(js).toString('base64');cache.set(path,uri);return uri;
}
const google=await import(compile('lib/google-calendar.ts'));
const api=await import(compile('app/api/google/route.ts'));
const callback=await import(compile('app/api/google/callback/route.ts'));
const roomApi=await import(compile('app/api/room/route.ts'));
const {sessionCookie}=await import(compile('lib/admin-auth.ts'));
async function setup(count=1){
 const db=new DatabaseSync(':memory:');for(const f of ['0000_young_lizard.sql','0001_foamy_klaw.sql','0002_whatsapp.sql'])db.exec(readFileSync(new URL('drizzle/'+f,root),'utf8'));
 const prepare=(sql,args=[])=>({bind:(...next)=>prepare(sql,next),first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:{changes:db.prepare(sql).run(...args).changes}})});
 env.DB={prepare,batch:async statements=>{const results=[];for(const s of statements)results.push(await s.run());return results;}};
 const s=seedAdmin();s.clients=Array.from({length:count},(_,i)=>({id:'c'+i,name:'Cliente '+i,consent:false}));
 s.services=[{id:'s',name:'Manicure',price:45,duration:45}];
 s.staff=[{id:'p',name:'Lia',active:true,start:540,end:1080,break_start:0,break_end:0,services:['s']}];
 s.appointments=s.clients.map((c,i)=>({id:'a'+i,client_id:c.id,staff_id:'p',service_id:'s',date:new Date(Date.UTC(2030,0,i+1)).toISOString().slice(0,10),start:600,end:645,price:45,status:'booked',attendance:'unknown',result:null}));
 db.prepare('INSERT INTO rooms(id,manager,client,state,created,updated) VALUES(?,?,?,?,?,?)').run('test','manager','client',JSON.stringify(s),Date.now(),Date.now());
 const tokens=await seal({access:'old-access',refresh:'old-refresh',expires:Date.now()+3600000},env.CALENDAR_ENCRYPTION_KEY,'test');
 db.prepare('INSERT INTO calendar_connections(room,tokens,calendar,day) VALUES(?,?,?,?)').run('test',tokens,'old-calendar','2026-10-28');
 const cookie=(await sessionCookie(env,'test',true)).split(';')[0];
 return {db,s,cookie};
}
async function mocked(fn){
 const original=globalThis.fetch,events=new Map(),calls=[];let missingOld=false,fail=false;
 globalThis.fetch=async(url,options={})=>{
  const path=new URL(url).pathname,method=options.method||'GET';calls.push({path,method,body:options.body});
  if(path==='/token')return Response.json({access_token:'new-access',refresh_token:'new-refresh',expires_in:3600,scope:SCOPE});
  if(fail)return Response.json({}, {status:503});
  if(method==='GET'&&missingOld&&path.includes('/old-calendar/'))return Response.json({}, {status:404});
  if(path.endsWith('/calendars')&&method==='POST')return Response.json({id:'new-calendar'});
  if(method==='POST'||method==='PATCH'){const body=JSON.parse(options.body);events.set(body.id,body);return Response.json({id:body.id});}
  if(method==='DELETE'){events.delete(path.split('/').at(-1));return new Response(null,{status:204});}
  return Response.json({items:[]});
 };
 try{await fn({events,calls,missing:()=>{missingOld=true},fail:(value)=>{fail=value}});}finally{globalThis.fetch=original;}
}
test('closed-panel cron imports 50 appointments in bounded batches without WhatsApp and reports pending work',()=>mocked(async({events})=>{
 const {db}=await setup(50);try{
  await google.runCalendarSchedule(env);assert.equal(events.size,20);assert.equal((await google.calendarStatus(env,'test',true)).pending,30);
  await google.runCalendarSchedule(env);await google.runCalendarSchedule(env);
  const status=await google.calendarStatus(env,'test',true);assert.equal(events.size,50);assert.equal(status.pending,0);assert.ok(status.synced);assert.equal(status.appointments,50);
 }finally{db.close();}
}));
test('failed Google writes preserve local data and progress, release lock, and recover on forced retry',()=>mocked(async({events,fail})=>{
 const {db}=await setup();try{
  const before=db.prepare('SELECT state FROM rooms').get().state;fail(true);await google.syncCalendar(env,'test');
  const row=db.prepare('SELECT * FROM calendar_connections').get();assert.match(row.error,/503/);assert.equal(row.lease,0);assert.ok(row.retry>Date.now());assert.equal(db.prepare('SELECT state FROM rooms').get().state,before);
  fail(false);await google.syncCalendar(env,'test',true);assert.equal(events.size,1);assert.equal((await google.calendarStatus(env,'test',true)).error,'');
 }finally{db.close();}
}));
test('OAuth uses account chooser and PKCE, switches inaccessible calendars, consumes state and never returns credentials',()=>mocked(async({missing,events})=>{
 const {db}=await setup();try{
  await google.syncCalendar(env,'test');missing();
  const start=await google.startOAuth(env,'test','2026-10-28'),url=new URL(start.url);
  assert.equal(url.searchParams.get('scope'),SCOPE);assert.equal(url.searchParams.get('access_type'),'offline');assert.match(url.searchParams.get('prompt'),/select_account/);assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  const result=await google.finishOAuth(env,start.state,'test-code');assert.deepEqual(result,{room:'test'});
  const row=db.prepare('SELECT * FROM calendar_connections').get();assert.equal(row.calendar,'new-calendar');assert.ok(!row.tokens.includes('new-refresh'));assert.equal(Object.keys(JSON.parse(row.entries)).length,1);assert.equal(events.size,1);
  await assert.rejects(google.finishOAuth(env,start.state,'test-code'),/expirou|usada/);
 }finally{db.close();}
}));
test('customer-name-only admin edit synchronizes immediately and Google endpoints reject missing admin session',()=>mocked(async({events})=>{
 const {db,cookie}=await setup();try{
  await google.syncCalendar(env,'test');
  const res=await roomApi.POST(new Request('https://example.test/api/room',{method:'POST',headers:{Origin:'https://example.test',Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({action:'client_save',id:'c0',name:'Cliente renomeada',phone:'',consent:false})}));
  assert.equal(res.status,200,JSON.stringify(await res.json()));assert.match([...events.values()][0].summary,/Cliente renomeada/);
  const denied=await api.POST(new Request('https://example.test/api/google',{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json'},body:JSON.stringify({action:'sync'})}));assert.equal(denied.status,400);assert.match((await denied.json()).error,/administração/);
 }finally{db.close();}
}));
test('OAuth callback requires matching browser state and returns to the integration after consent',()=>mocked(async()=>{
 const {db}=await setup();try{
  const start=await google.startOAuth(env,'test','2026-10-28');
  const url='https://example.test/api/google/callback?state='+start.state+'&code=test-code';
  const invalid=await callback.GET(new Request(url));assert.equal(invalid.status,400);
  const response=await callback.GET(new Request(url,{headers:{Cookie:'encaixa_google_state='+start.state}}));assert.equal(response.status,303);assert.equal(response.headers.get('Location'),'https://example.test/painel?integracao=google');
 }finally{db.close();}
}));
