import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {seedAdmin,seek,actAdmin} from '../lib/flowagenda.mjs';
import {applyStaffAction,staffView} from '../lib/staff-core.mjs';
const root=new URL('../',import.meta.url),cache=new Map();
globalThis.__staffTestEnv={APP_SENHA:'test-password',CALENDAR_ENCRYPTION_KEY:'ab'.repeat(32)};
function compile(path){
 if(cache.has(path))return cache.get(path);
 let source=readFileSync(new URL(path,root),'utf8').replace("import {env} from 'cloudflare:workers';","const env=globalThis.__staffTestEnv;");
 source=source.replace(/from '([^']+)'/g,(full,spec)=>{if(!spec.startsWith('.'))return full;const u=new URL(spec,new URL(path,root));if(spec.endsWith('.mjs'))return 'from '+JSON.stringify(u.href);if(!existsSync(fileURLToPath(u)+'.ts'))return full;return 'from '+JSON.stringify(compile(decodeURIComponent(u.pathname.slice(root.pathname.length))+'.ts'));});
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,uri='data:text/javascript;base64,'+Buffer.from(js).toString('base64');cache.set(path,uri);return uri;
}
const env=globalThis.__staffTestEnv;
const auth=await import(compile('lib/staff-auth.ts')),admin=await import(compile('lib/admin-auth.ts'));
const api=await import(compile('app/api/staff/route.ts')),session=await import(compile('app/api/staff-session/route.ts')),accessApi=await import(compile('app/api/staff-access/route.ts'));
function fixture(){
 const s=seedAdmin(),now=Date.now(),day=n=>new Date(now+n*86400000).toISOString().slice(0,10);
 s.clients=[{id:'C1',name:'Cliente existente',phone:'5581999999999',consent:true,willingness:10,visits:20,missed:0,accepted:10,proposals:10}];
 s.staff=['P1','P2'].map((id,i)=>({id,name:i?'Bia':'Lia',active:true,start:480,end:1200,break_start:0,break_end:0,services:['S1']}));
 s.appointments=[{id:'A1',client_id:'C1',service_id:'S1',staff_id:'P1',date:day(6),start:600,end:645,price:45,status:'booked',attendance:'unknown',reminded:false,result:null}];
 s.gaps=[{id:'G1',root:'G1',date:day(2),start:600,end:645,service_id:'S1',staff_id:'P1',price:45,depth:0,status:'open'}];
 s.days={[day(2)]:{occupancy:10,queue:0},[day(6)]:{occupancy:100,queue:3}};
 const o=seek(s,'G1',now);assert.ok(o);actAdmin(s,'response',{id:o.id,text:'sim',result:'accepted'},now);return {s,o,now};
}
async function setup(){
 const db=new DatabaseSync(':memory:');for(const f of ['0000_young_lizard.sql','0001_foamy_klaw.sql','0002_whatsapp.sql'])db.exec(readFileSync(new URL('drizzle/'+f,root),'utf8'));
 const prepare=(sql,args=[])=>({bind:(...next)=>prepare(sql,next),first:async()=>db.prepare(sql).get(...args)||null,run:async()=>({meta:{changes:db.prepare(sql).run(...args).changes}})});env.DB={prepare};
 const {s}=fixture();s.staffAccess=await auth.createStaffAccess(env,'test');db.prepare('INSERT INTO rooms(id,manager,client,state,created,updated) VALUES(?,?,?,?,?,?)').run('test','manager','client',JSON.stringify(s),Date.now(),Date.now());
 const path=await auth.staffPath(env,'test',s.staffAccess),cookie=await auth.staffCookie(env,'test','P1',s.staffAccess.hash,true);
 return {db,s,path,token:path.slice('/funcionarios-'.length),cookie:cookie.split(';')[0],read:()=>JSON.parse(db.prepare('SELECT state FROM rooms WHERE id=?').get('test').state),save:s=>db.prepare('UPDATE rooms SET state=? WHERE id=?').run(JSON.stringify(s),'test')};
}
const post=(url,body,cookie='',origin='https://salon.test')=>new Request('https://salon.test'+url,{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
const payload=(action,extra={})=>({action,requestId:crypto.randomUUID(),...extra});
test('reserved link lists active names only and invalid links disclose nothing',async()=>{const t=await setup();try{assert.match(t.path,/^\/funcionarios-[a-f0-9]{48}$/);const r=await session.POST(post('/api/staff-session',{action:'list',token:t.token}));const d=await r.json();assert.equal(r.status,200);assert.deepEqual(d.staff,[{id:'P1',name:'Lia'},{id:'P2',name:'Bia'}]);assert.equal(d.clients,undefined);assert.equal((await session.POST(post('/api/staff-session',{action:'list',token:'a'.repeat(48)}))).status,403);}finally{t.db.close();}});
test('employee login is signed, cannot impersonate administration and ignores caller role',async()=>{const t=await setup();try{const r=await session.POST(post('/api/staff-session',{action:'login',token:t.token,staffId:'P1',role:'admin'}));assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Lax/);const req=new Request('https://salon.test/api/room',{headers:{Cookie:t.cookie}});assert.equal((await auth.requireStaff(req,env)).staffId,'P1');await assert.rejects(()=>admin.requireAdmin(req,env));assert.equal((await accessApi.GET(req)).status,401);}finally{t.db.close();}});
test('employee API rejects cancellation and every non-allowlisted mutation without state changes',async()=>{const t=await setup();try{for(const action of ['cancel','presence','reschedule','book','settings','staff_save','client_save','close','response','reject','message']){const before=JSON.stringify(t.read());const r=await api.POST(post('/api/staff',payload(action,{id:'A1',answer:'no'}),t.cookie));assert.equal(r.status,403,action);assert.equal(JSON.stringify(t.read()),before,action);}}finally{t.db.close();}});
test('creation strips injected fields, cannot edit existing clients and is idempotent',async()=>{const t=await setup();try{const p=payload('client_create',{name:'Nova cliente',phone:'5581888888888',consent:true,willingness:6,visits:999,staffId:'P2'});assert.equal((await api.POST(post('/api/staff',p,t.cookie))).status,200);assert.equal((await api.POST(post('/api/staff',p,t.cookie))).status,200);assert.equal(t.read().clients.length,2);assert.equal(t.read().clients[1].visits,0);assert.equal(t.read().staffAudit[0].staffId,'P1');assert.equal((await api.POST(post('/api/staff',payload('client_create',{name:'Alterada',id:'C1'}),t.cookie))).status,403);}finally{t.db.close();}});
test('employee calendar projection excludes phones, conversations, integration secrets and financial history',async()=>{const {s}=fixture();s.staffAccess={hash:'secret',sealed:'secret'};s.staffAudit=[{private:'data'}];const d=staffView(s,'P1',s.appointments[0].date);assert.equal(d.appointments[0].clientName,'Cliente existente');assert.equal(d.clients,undefined);assert.equal(d.messages,undefined);assert.equal(d.staffAccess,undefined);assert.equal(d.staffAudit,undefined);assert.equal(d.appointments[0].price,undefined);assert.equal(d.appointments[0].phone,undefined);});
test('approval requires client acceptance, relates to employee and records actor using existing collision checks',()=>{const {s,o,now}=fixture();assert.throws(()=>applyStaffAction(s,'P2',payload('approve',{id:o.id}),now),/seus atendimentos/);o.status='pending';assert.throws(()=>applyStaffAction(s,'P1',payload('approve',{id:o.id}),now),/aceite/);o.status='approval';const p=payload('approve',{id:o.id});applyStaffAction(s,'P1',p,now);assert.equal(o.status,'approved');assert.equal(o.approvedBy.id,'P1');assert.equal(s.appointments[0].date,o.date);applyStaffAction(s,'P1',p,now);assert.equal(s.staffAudit.length,1);});
test('stale proposal cannot be approved from the employee page',()=>{const {s,o,now}=fixture();s.appointments[0].start+=10;assert.throws(()=>applyStaffAction(s,'P1',payload('approve',{id:o.id}),now),/agenda mudou/);assert.equal(o.status,'approval');});
test('rotating or disabling access revokes old links and sessions; inactive employees cannot enter',async()=>{const t=await setup();try{t.s.staff[0].active=false;t.save(t.s);await assert.rejects(()=>auth.requireStaff(new Request('https://salon.test',{headers:{Cookie:t.cookie}}),env));assert.equal((await session.POST(post('/api/staff-session',{action:'login',token:t.token,staffId:'P1'}))).status,403);t.s.staff[0].active=true;t.s.staffAccess=await auth.createStaffAccess(env,'test');t.save(t.s);await assert.rejects(()=>auth.roomByStaffToken(env,t.token));await assert.rejects(()=>auth.requireStaff(new Request('https://salon.test',{headers:{Cookie:t.cookie}}),env));delete t.s.staffAccess;t.save(t.s);await assert.rejects(()=>auth.roomByStaffToken(env,t.token));}finally{t.db.close();}});
test('staff endpoints reject anonymous access and cross-origin mutations',async()=>{const t=await setup();try{assert.equal((await api.GET(new Request('https://salon.test/api/staff'))).status,401);assert.equal((await api.POST(post('/api/staff',payload('approve'),t.cookie,'https://evil.test'))).status,403);assert.equal((await session.POST(post('/api/staff-session',{action:'login',token:t.token,staffId:'P1'},'','https://evil.test'))).status,403);}finally{t.db.close();}});
