import test from 'node:test';
import assert from 'node:assert/strict';
import {seedAdmin,actAdmin} from '../lib/flowagenda.mjs';

const now=Date.parse('2030-01-01T09:00:00-03:00');
function fixture(){
 const s=seedAdmin();s.settings.autoNext=false;
 s.services=[{id:'S1',name:'Manicure',duration:45,price:45}];
 s.staff=[{id:'P1',name:'Lia',active:true,start:540,end:1080,break_start:0,break_end:0,services:['S1']}];
 s.clients=[{id:'C1',name:'Existente',phone:'81999999999',consent:false,willingness:5,preferred:'',visits:0,missed:0,proposals:0,accepted:0}];
 return s;
}
const booking=(extra={})=>({date:'2030-01-02',start:600,staff_id:'P1',service_id:'S1',...extra});
const client={name:'Nova cliente',phone:'(81) 98888-8888',consent:true,willingness:6};

test('administrative booking creates client and appointment together, ignoring injected history',()=>{
 const s=fixture();actAdmin(s,'book',booking({newClient:{...client,id:'C1',visits:999,preferred:'P1'}}),now);
 assert.equal(s.clients.length,2);assert.equal(s.appointments.length,1);
 const c=s.clients[1],a=s.appointments[0];
 assert.notEqual(c.id,'C1');assert.equal(a.client_id,c.id);assert.equal(c.phone,'5581988888888');
 assert.equal(c.visits,0);assert.equal(c.preferred,'');assert.equal(c.consent,true);
 assert.equal(a.status,'booked');assert.equal(a.end,645);assert.equal(a.price,45);
});
test('unavailable schedule cannot leave a new client behind',()=>{
 const s=fixture();actAdmin(s,'book',booking({client_id:'C1'}),now);
 const before=structuredClone(s);
 assert.throws(()=>actAdmin(s,'book',booking({newClient:client}),now),/horário não está disponível/);
 assert.deepEqual(s,before);
});
test('new client validation rejects duplicate normalized phone, invalid data and ambiguous selection',()=>{
 for(const extra of [
  {newClient:{...client,phone:'+55 (81) 99999-9999'}},
  {newClient:{...client,name:' '}},
  {newClient:{...client,phone:'123'}},
  {newClient:{...client,name:'Existente'}},
  {newClient:client,client_id:'C1'},
 ]){
  const s=fixture(),before=structuredClone(s);
  assert.throws(()=>actAdmin(s,'book',booking(extra),now));assert.deepEqual(s,before);
 }
});
test('existing-client bookings remain available and phone is optional for a new client',()=>{
 const s=fixture();actAdmin(s,'book',booking({client_id:'C1'}),now);
 actAdmin(s,'book',booking({start:660,newClient:{name:'Sem telefone'}}),now);
 assert.equal(s.clients.length,2);assert.equal(s.appointments[0].client_id,'C1');
 assert.equal(s.clients[1].phone,'');assert.equal(s.clients[1].consent,false);
 assert.equal(s.appointments[1].client_id,s.clients[1].id);
});
