import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,act} from '../lib/salon.mjs';
import {replyIntent} from '../lib/conversation.mjs';
import {seal,unseal} from '../lib/cripto.mjs';

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
test('dados cifrados ficam presos à agenda e à chave do servidor',async()=>{
  const secret='a'.repeat(64),value={access:'private-access',refresh:'private-refresh'};
  const encrypted=await seal(value,secret,'room');assert.ok(!encrypted.includes('private'));
  assert.deepEqual(await unseal(encrypted,secret,'room'),value);
  await assert.rejects(unseal(encrypted,secret,'another-room'));
  await assert.rejects(unseal(encrypted,'b'.repeat(64),'room'));
});
