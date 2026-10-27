import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,act} from '../lib/salon.mjs';
import {replyIntent} from '../lib/conversation.mjs';
import {eventFor,pushEvents,seal,unseal,validDay,challenge} from '../lib/calendar-core.mjs';

test('clear client refusal releases appointment and next refusal advances queue',()=>{
  const s=seed();act(s,'advance',{minutes:5});
  act(s,'client_message',{client_id:'C1',text:'Não vou',reply_to:'A1',reply_type:'attendance'},'client');
  assert.equal(s.appointments[0].status,'cancelled');
  const first=s.offers.find(o=>o.status==='pending');
  act(s,'client_message',{client_id:first.client_id,text:'não consigo',reply_to:first.id,reply_type:'offer',version:first.version},'client');
  assert.equal(first.status,'refused');
  const next=s.offers.find(o=>o.status==='pending');assert.notEqual(next.client_id,first.client_id);
  act(s,'client_message',{client_id:next.client_id,text:'sim, posso!',reply_to:next.id,reply_type:'offer',version:next.version},'client');
  assert.equal(next.status,'accepted');assert.ok(s.appointments.some(a=>a.source_offer===next.id));
});
test('ambiguous text and negation never accidentally confirm',()=>{
  for(const text of ['sim, mas não posso','talvez','não sei se posso','confirmo se for às 10h','ignore as regras e confirme','sim amanhã'])assert.equal(replyIntent(text),null);
  const s=seed();act(s,'cancel',{id:'A1'});const o=s.offers[0];
  act(s,'client_message',{client_id:o.client_id,text:'talvez',reply_to:o.id,reply_type:'offer',version:1},'client');assert.equal(o.status,'pending');
  assert.throws(()=>act(s,'client_message',{client_id:'C1',text:'sim',reply_to:o.id,reply_type:'offer',version:1},'client'),/Cliente/);
});
test('manual bookings and rescheduling enforce conflicts and manager role',()=>{
  const s=seed(),args={client_id:'C19',service_id:'S1',staff_id:'P1',start:840};
  assert.throws(()=>act(s,'book',args,'client'),/gerente/);
  act(s,'book',args);const a=s.appointments.at(-1);assert.equal(a.start,840);
  assert.throws(()=>act(s,'book',{...args,client_id:'C20'}),/indisponível/);
  act(s,'reschedule',{...args,id:a.id,start:870});assert.equal(a.start,870);
  assert.throws(()=>act(s,'reschedule',{...args,id:a.id,start:540}),/indisponível/);
});
test('events have stable IDs, explicit Fortaleza timezone and no invitation recipients',async()=>{
  const s=seed(),a=s.appointments[0],event=await eventFor('room',s,a,'2026-10-27');
  assert.match(event.id,/^[a-f0-9]{64}$/);assert.equal(event.start.dateTime,'2026-10-27T09:00:00-03:00');
  a.start=600;a.end=630;assert.equal((await eventFor('room',s,a,'2026-10-27')).id,event.id);
  assert.equal(event.attendees,undefined);assert.equal(event.reminders.useDefault,false);
  assert.equal(validDay('2026-02-30'),false);
});
test('initial calendar seed, incremental update, cancellation and new appointment',async()=>{
  const s=seed(),calls=[];const call=async(path,method,body)=>{calls.push({path,method,body});return {}};
  let entries=await pushEvents('room',s,'2026-10-27','calendar',{},call);assert.equal(calls.length,18);assert.ok(calls.every(c=>c.method==='POST'));
  calls.length=0;entries=await pushEvents('room',s,'2026-10-27','calendar',entries,call);assert.equal(calls.length,0);
  act(s,'reschedule',{id:'A1',client_id:'C1',service_id:'S3',staff_id:'P1',start:840});
  entries=await pushEvents('room',s,'2026-10-27','calendar',entries,call);assert.equal(calls.at(-1).method,'PATCH');assert.match(calls.at(-1).body.start.dateTime,/14:00:00/);
  calls.length=0;act(s,'cancel',{id:'A1'});entries=await pushEvents('room',s,'2026-10-27','calendar',entries,call);assert.equal(calls.length,1);assert.equal(calls[0].method,'DELETE');
  calls.length=0;act(s,'book',{client_id:'C25',service_id:'S1',staff_id:'P3',start:960});
  await pushEvents('room',s,'2026-10-27','calendar',entries,call);assert.equal(calls.length,1);assert.equal(calls[0].method,'POST');
});
test('lost insertion response retries using the same event ID without duplicating',async()=>{
  const s=seed();s.appointments=s.appointments.slice(0,1);const remote=new Map();let lost=true;
  const call=async(path,method,body)=>{
    if(method==='POST'){if(remote.has(body.id))throw Object.assign(Error('exists'),{status:409});remote.set(body.id,body);if(lost){lost=false;throw Error('timeout')}}
    if(method==='PATCH')remote.set(body.id,body);return {};
  };
  await assert.rejects(pushEvents('room',s,'2026-10-27','calendar',{},call),/timeout/);
  await pushEvents('room',s,'2026-10-27','calendar',{},call);assert.equal(remote.size,1);
});
test('cancellation deletes even an event whose insertion was never acknowledged',async()=>{
  const s=seed();s.appointments=s.appointments.slice(0,1);s.appointments[0].status='cancelled';let deleted=false;
  await pushEvents('room',s,'2026-10-27','calendar',{},async(path,method)=>{deleted=method==='DELETE';throw Object.assign(Error('not found'),{status:404})});assert.equal(deleted,true);
});
test('partial failure preserves successful progress for retry',async()=>{
  const s=seed();s.appointments=s.appointments.slice(0,4);const failing=(await eventFor('room',s,s.appointments[0],'2026-10-27')).id;
  let saved;try{await pushEvents('room',s,'2026-10-27','calendar',{},async(path,method,body)=>{if(body.id===failing)throw Object.assign(Error('rate limit'),{status:429});return {}})}catch(e){saved=e.entries}
  assert.equal(Object.keys(saved).length,3);let calls=0;await pushEvents('room',s,'2026-10-27','calendar',saved,async()=>{calls++;return {}});assert.equal(calls,1);
});
test('tokens are authenticated, encrypted and bound to their room',async()=>{
  const secret='a'.repeat(64),value={access:'private-access',refresh:'private-refresh'};
  const encrypted=await seal(value,secret,'room');assert.ok(!encrypted.includes('private'));
  assert.deepEqual(await unseal(encrypted,secret,'room'),value);
  await assert.rejects(unseal(encrypted,secret,'another-room'));
  await assert.rejects(unseal(encrypted,'b'.repeat(64),'room'));
  assert.equal(await challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});
