import test from 'node:test';
import assert from 'node:assert/strict';
import {eventFor} from '../lib/calendar-core.mjs';
const state={clients:[{id:'c',name:'Cliente'}],services:[{id:'s',name:'Manicure'}],staff:[{id:'p',name:'Profissional'}]};
test('each calendar appointment keeps its own day, including midnight end',async()=>{
 const a={id:'a',client_id:'c',service_id:'s',staff_id:'p',date:'2026-11-03',start:1410,end:1440};
 const e=await eventFor('test',state,a,'2026-10-28');assert.equal(e.start.dateTime,'2026-11-03T23:30:00-03:00');assert.equal(e.end.dateTime,'2026-11-04T00:00:00-03:00');assert.doesNotMatch(e.description,/demonstra|fict/i);
 const b=await eventFor('test',state,{...a,date:'2026-11-04'},'2026-10-28');assert.equal(e.id,b.id);
});
