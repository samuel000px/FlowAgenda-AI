import test from 'node:test';
import assert from 'node:assert/strict';
import {seedAdmin} from '../lib/flowagenda.mjs';
import {openSupport,supportAction,supportView} from '../lib/support-core.mjs';
import {financeAction,financeView} from '../lib/finance-core.mjs';
import {receiveMessage,awaitingReply} from '../lib/whatsapp-core.mjs';
const now=Date.parse('2026-10-28T15:00:00-03:00'),staff={role:'staff',id:'P1',name:'Lia'},other={role:'staff',id:'P2',name:'Bia'},admin={role:'admin',id:'admin',name:'Administração'};
function fixture(){const s=seedAdmin();s.clients=[{id:'C1',name:'Ana',phone:'5581999999999',consent:true}];s.appointments=[{id:'A1',client_id:'C1',service_id:s.services[0].id,date:'2026-10-28',start:600,end:645,status:'booked',result:'attended',price:45}];return s;}
test('unhandled WhatsApp input creates one ticket, closing preserves bookings and a new message reopens support',()=>{
 const s=fixture(),appointments=structuredClone(s.appointments),config={phoneId:'12345678',allowed:['5581999999999'],enabled:true};
 const event={id:'in-1',from:'5581999999999',timestamp:String(now/1000),type:'text',text:{body:'Quero falar com uma atendente'}};
 receiveMessage(s,event,config,now);receiveMessage(s,event,config,now);
 assert.equal(supportView(s).length,1);const t=supportView(s)[0];assert.equal(t.name,'Ana');
 supportAction(s,'support_claim',{id:t.id},staff,now);
 assert.throws(()=>supportAction(s,'support_claim',{id:t.id},other,now),/outra pessoa/);
 assert.throws(()=>supportAction(s,'support_close',{id:t.id},other,now),/outra pessoa/);
 supportAction(s,'support_close',{id:t.id},staff,now);assert.equal(supportView(s).length,0);assert.equal(awaitingReply(s).length,0);
 receiveMessage(s,{...event,id:'in-2'},config,now);assert.equal(supportView(s).length,1);assert.deepEqual(s.appointments,appointments);
});
test('demo is admin-only and does not create messages for sending or fake client contacts',()=>{
 const s=fixture();assert.throws(()=>supportAction(s,'support_demo',{},staff),/administração/);
 supportAction(s,'support_demo',{},admin);supportAction(s,'support_demo',{},admin);
 assert.equal(supportView(s).length,1);assert.equal(s.messages.length,0);assert.equal(supportView(s)[0].phone,'');assert.equal(s.clients.length,1);
});
test('finance separates expected revenue from cash and records payments and expenses once',()=>{
 const s=fixture();assert.equal(financeView(s,'2026-10-28').received,0);assert.equal(financeView(s,'2026-10-28').expected,45);
 financeAction(s,'payment_record',{id:'A1',method:'Pix',amount:999999},now);financeAction(s,'payment_record',{id:'A1',method:'Pix'},now);
 const expense={requestId:crypto.randomUUID(),description:'Material',amount:12.5,date:'2026-10-28'};
 financeAction(s,'expense_add',expense,now);financeAction(s,'expense_add',expense,now);
 const f=financeView(s,'2026-10-28');assert.equal(f.received,45);assert.equal(f.spent,12.5);assert.equal(f.balance,32.5);assert.equal(f.pending.length,0);assert.equal(s.payments.length,1);assert.equal(s.expenses.length,1);
});
test('cash date uses local day of payment and cannot count canceled or missed services',()=>{
 const s=fixture();s.appointments[0].date='2026-10-27';financeAction(s,'payment_record',{id:'A1',method:'Dinheiro'},now);
 assert.equal(financeView(s,'2026-10-27').received,0);assert.equal(financeView(s,'2026-10-28').received,45);
 for(const patch of [{status:'cancelled'},{result:'missed'},{result:null}]){const t=fixture();Object.assign(t.appointments[0],patch);assert.throws(()=>financeAction(t,'payment_record',{id:'A1',method:'Pix'},now));assert.equal(t.payments,undefined);}
});
test('invalid expenses never enter the balance',()=>{
 for(const amount of [-1,0,NaN,Infinity]){const s=fixture();assert.throws(()=>financeAction(s,'expense_add',{requestId:crypto.randomUUID(),description:'Material',date:'2026-10-28',amount},now));assert.equal(s.expenses,undefined);}
});
