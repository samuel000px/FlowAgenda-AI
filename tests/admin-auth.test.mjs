import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/admin-auth.ts',import.meta.url),'utf8').replace("'./calendar-core.mjs'",JSON.stringify(new URL('../lib/calendar-core.mjs',import.meta.url).href));
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {sessionCookie,requireAdmin,renewSession,sameOrigin,clearSession}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const env={APP_SENHA:'only-for-unit-tests',CALENDAR_ENCRYPTION_KEY:'ab'.repeat(32)};
test('admin cookies are signed, HttpOnly, scoped to room, and expire',async()=>{
 const cookie=await sessionCookie(env,'unit-test',true);assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Lax/);
 const request=new Request('https://local.invalid/api/room',{headers:{cookie:cookie.split(';')[0]}});
 assert.equal(await requireAdmin(request,env),'unit-test');
 await assert.rejects(()=>requireAdmin(request,{...env,APP_SENHA:'changed'}),/senha/);
 const real=Date.now;try{Date.now=()=>real()+9*3600000;await assert.rejects(()=>requireAdmin(request,env),/senha/);}finally{Date.now=real;}
});
test('headers and edited cookies cannot impersonate administration',async()=>{
 await assert.rejects(()=>requireAdmin(new Request('https://local.invalid',{headers:{'X-Room':'unit-test','X-Room-Key':'old-manager-link'}}),env),/senha/);
 const cookie=await sessionCookie(env,'unit-test',false),[payload,sig]=cookie.split(';')[0].split('=')[1].split('.');
 const altered=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(payload,'base64url').toString()),room:'other'})).toString('base64url');
 await assert.rejects(()=>requireAdmin(new Request('https://local.invalid',{headers:{cookie:'flowagenda_session='+altered+'.'+sig}}),env),/senha/);
 assert.match(clearSession(false),/Max-Age=0/);
});
test('mutations require the same origin',()=>{
 assert.throws(()=>sameOrigin(new Request('https://local.invalid/api/room',{headers:{Origin:'https://other.invalid'}})),/Origem/);
 assert.doesNotThrow(()=>sameOrigin(new Request('https://local.invalid/api/room',{headers:{Origin:'https://local.invalid'}})));
});
test('login em uso é renovado antes de vencer; sem login não renova',async()=>{
 const cookie=await sessionCookie(env,'unit-test',true),request=new Request('https://local.invalid/api/room',{headers:{cookie:cookie.split(';')[0]}});
 assert.equal(await renewSession(request,env),'','recém-criado não precisa renovar');
 const real=Date.now;try{Date.now=()=>real()+3*3600000;const novo=await renewSession(request,env);assert.match(novo,/^flowagenda_session=.+Max-Age=28800/);
  Date.now=()=>real()+9*3600000;assert.equal(await renewSession(request,env),'','vencido não renova: precisa da senha');}finally{Date.now=real;}
 assert.equal(await renewSession(new Request('https://local.invalid'),env),'');
});
