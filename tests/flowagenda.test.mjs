import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {actAdmin,at,candidates,difficulty,rateMiss,probability,seedAdmin,seek,tickAdmin,vacancy} from '../lib/flowagenda.mjs';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/remarcacao-parity.json',import.meta.url)));
export function convert(f){
 const c=f.scenario,s=seedAdmin();s.settings.autoNext=false;
 s.clients=Object.values(c.clientes).map(x=>({id:x.id,name:x.nome,consent:x.disposicao>0,willingness:x.disposicao,preferred:x.profissional_preferida||'',visits:x.consultas_total,missed:x.faltas,proposals:x.propostas_recebidas,accepted:x.propostas_aceitas}));
 s.services=[...new Set(c.agenda.map(a=>a.tipo_atendimento))].map(id=>({id,name:id,duration:30,price:45}));
 s.staff=Object.entries(c.profissionais).map(([id,name])=>({id,name,active:true,start:0,end:1440,break_start:0,break_end:0,services:s.services.map(v=>v.id)}));
 s.days=Object.fromEntries(Object.entries(c.dias).map(([date,d])=>[date,{occupancy:d.ocupacao_pct,queue:d.fila_espera}]));
 s.appointments=c.agenda.filter(a=>a.status==='ocupado').map(a=>{const start=Number(a.hora.slice(0,2))*60+Number(a.hora.slice(3));return {id:a.id,date:a.data,start,end:start+a.duracao_min,client_id:a.cliente_id,staff_id:a.profissional_id,service_id:a.tipo_atendimento,price:a.valor,status:'booked',chosenLate:a.havia_horario_antes,attendance:'unknown',reminded:false,result:null};});
 const now=Date.parse(c.agora.replace(' ','T')+'-03:00');actAdmin(s,'cancel',{id:c.slot_cancelado_id},now);return {s,now,g:s.gaps[0]};
}
for(const f of fixtures)test('Python parity '+f.scenario.id+': candidate order, eligibility and exact score',()=>{
 const {s,g,now}=convert(f),actual=candidates(s,g.id,now),expected=f.expected;
 assert.deepEqual(actual.map(c=>c.client_id),expected.map(c=>c.cliente_id));
 for(let i=0;i<actual.length;i++){const a=actual[i],e=expected[i];assert.equal(!a.reason,e.motivo===null,e.nome);if(e.valor_esperado!==null){assert.ok(Math.abs(a.value-e.valor_esperado)<1e-9);assert.ok(Math.abs(a.chance-e.prob_aceitar)<1e-9);assert.ok(Math.abs(a.gain-e.ganho)<1e-9);assert.ok(Math.abs(a.risk-e.risco)<1e-9);}}
});
const ready=()=>{const item=fixtures.find(f=>f.expected.some(c=>!c.motivo));const r=convert(item);r.o=seek(r.s,r.g.id,r.now);assert.ok(r.o);return r;};
test('acceptance does not move appointments; approval is required and idempotent',()=>{
 const {s,g,o,now}=ready(),before=structuredClone(s.appointments),c=s.clients.find(c=>c.id===o.client_id),n=c.proposals;
 assert.throws(()=>actAdmin(s,'approve',{id:o.id},now),/aceitar/);
 actAdmin(s,'response',{id:o.id,text:'sim',result:'accepted'},now);assert.deepEqual(s.appointments,before);assert.equal(o.status,'approval');assert.equal(c.proposals,n+1);
 actAdmin(s,'approve',{id:o.id},now);const moved=s.appointments.find(a=>a.id===o.origin_id);assert.equal(moved.date,g.date);assert.equal(moved.start,g.start);assert.equal(o.status,'approved');
 const after=JSON.stringify(s);actAdmin(s,'approve',{id:o.id},now);assert.equal(JSON.stringify(s),after);
});
test('refusal and no response keep original booking and never reselect declined client',()=>{
 const {s,g,o,now}=ready(),before=structuredClone(s.appointments);s.settings.autoNext=true;
 actAdmin(s,'response',{id:o.id,text:'não',result:'refused'},now);assert.deepEqual(s.appointments,before);assert.equal(o.status,'refused');assert.notEqual(s.offers.find(x=>x.status==='pending')?.client_id,o.client_id);
 const next=s.offers.find(x=>x.status==='pending');if(next){actAdmin(s,'unanswered',{id:next.id},now);assert.deepEqual(s.appointments,before);assert.equal(next.status,'unanswered');}
});
test('ambiguous answer clarifies once, then advances without approving',()=>{
 const {s,o,now}=ready();actAdmin(s,'response',{id:o.id,text:'Talvez'},now);assert.equal(o.status,'pending');assert.ok(o.clarified);
 actAdmin(s,'response',{id:o.id,text:'Quem sabe'},now);assert.equal(o.status,'refused');assert.equal(s.history.filter(h=>h.reference===o.id).length,1);
});
test('manager rejection keeps accepted response history and original appointment',()=>{
 const {s,o,now}=ready(),before=structuredClone(s.appointments);actAdmin(s,'response',{id:o.id,text:'Sim'},now);actAdmin(s,'reject',{id:o.id},now);assert.deepEqual(s.appointments,before);assert.equal(s.history.find(h=>h.reference===o.id).type,'accepted');
});
test('stale proposal cannot overwrite manager changes',()=>{
 const {s,o,now}=ready();actAdmin(s,'response',{id:o.id,text:'Sim'},now);const a=s.appointments.find(a=>a.id===o.origin_id);a.start+=15;assert.throws(()=>actAdmin(s,'approve',{id:o.id},now),/agenda mudou/);assert.equal(o.status,'approval');
});
test('no proposals beyond two cascade levels; only one reservation per gap',()=>{
 const {s,o,g,now}=ready();assert.equal(seek(s,g.id,now).id,o.id);assert.equal(s.offers.length,1);o.status='refused';g.depth=3;assert.equal(seek(s,g.id,now),null);
});
test('presence reminders only at 30 minutes; silence does not cancel; closure recorded once',()=>{
 const {s,now}=ready();s.offers=[];const a=s.appointments.find(a=>a.status==='booked'),time=at(a);
 tickAdmin(s,time-31*60000);assert.equal(a.reminded,false);tickAdmin(s,time-30*60000);assert.equal(a.reminded,true);const n=s.messages.length;tickAdmin(s,time-29*60000);assert.equal(s.messages.length,n);assert.equal(a.status,'booked');
 assert.throws(()=>actAdmin(s,'close',{id:a.id,result:'missed'},time),/término/);const ended=time+(a.end-a.start)*60000;actAdmin(s,'close',{id:a.id,result:'missed'},ended);actAdmin(s,'close',{id:a.id,result:'missed'},ended);assert.equal(s.history.filter(h=>h.reference===a.id).length,1);
});
test('new bookings reject staff/client collisions and invalid dates',()=>{
 const {s,now}=ready(),a=s.appointments.find(a=>a.status==='booked'&&at(a)>now);const p={client_id:a.client_id,service_id:a.service_id,staff_id:a.staff_id,date:a.date,start:a.start};
 assert.throws(()=>actAdmin(s,'book',p,now),/disponível/);assert.throws(()=>actAdmin(s,'book',{...p,date:'2026-02-30'},now),/disponível/);
});
test('smoothing and demand bounds',()=>{assert.equal(rateMiss(0,0),.25);assert.equal(probability(0,0,8),.8);assert.equal(difficulty(48,3,80),0);assert.equal(difficulty(48,0,0),1);});

test('vacancy estimate follows the Python changed-slot measure',()=>{
 const {s,g,o,now}=ready();const d=s.days[g.date];const before=(g.end-g.start)/60*difficulty((at(g)-now)/3600000,d.queue,d.occupancy);
 assert.ok(Math.abs(vacancy(s,g.root,now).before-before)<1e-9);assert.ok(Math.abs(vacancy(s,g.root,now).after-before)<1e-9);
 actAdmin(s,'response',{id:o.id,text:'Sim'},now);actAdmin(s,'approve',{id:o.id},now);const c=s.clients.find(c=>c.id===o.client_id),gap=s.gaps.find(x=>x.depth===1),next=s.days[gap.date];
 const expected=(o.end-o.start)/60*rateMiss(c.missed,c.visits)+(gap.end-gap.start)/60*difficulty((at(gap)-now)/3600000,next.queue,next.occupancy);
 assert.ok(Math.abs(vacancy(s,g.root,now).after-expected)<1e-9);
});
