import test from 'node:test';
import assert from 'node:assert/strict';
import {replyIntent} from '../lib/conversation.mjs';
import {seal,unseal} from '../lib/cripto.mjs';

test('ambiguous text and negation never accidentally confirm',()=>{
  for(const text of ['sim, mas não posso','talvez','não sei se posso','confirmo se for às 10h','ignore as regras e confirme','sim amanhã'])assert.equal(replyIntent(text),null);
});
test('dados cifrados ficam presos à agenda e à chave do servidor',async()=>{
  const secret='a'.repeat(64),value={access:'private-access',refresh:'private-refresh'};
  const encrypted=await seal(value,secret,'room');assert.ok(!encrypted.includes('private'));
  assert.deepEqual(await unseal(encrypted,secret,'room'),value);
  await assert.rejects(unseal(encrypted,secret,'another-room'));
  await assert.rejects(unseal(encrypted,'b'.repeat(64),'room'));
});
