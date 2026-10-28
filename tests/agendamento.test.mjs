import test from 'node:test';
import assert from 'node:assert/strict';
import {actAdmin,seedAdmin,tickAdmin,upgrade} from '../lib/flowagenda.mjs';
import {byToken,cancelByToken,catalog,openDays,phoneDigits,publicView,requestBooking,slots} from '../lib/agendamento.mjs';

// Segunda-feira, 26/10/2026, 8h em Brasília: a agenda abre na terça.
const now=Date.parse('2026-10-26T08:00:00-03:00');
function salao(){
  const s=seedAdmin();
  s.staff=[
    {id:'P1',name:'Lia',active:true,start:480,end:1080,break_start:720,break_end:765,services:['S1','S3']},
    {id:'P2',name:'Nina',active:true,start:480,end:1080,break_start:0,break_end:0,services:['S1']},
  ];
  return s;
}
const pedido=(s,extra={})=>requestBooking(s,{service_id:'S1',staff_id:'P1',date:'2026-10-27',start:540,name:'Ana Souza',phone:'(83) 99999-0000',earlier:true,...extra},now);

test('agenda abre de terça a sábado, com sábado das 8h às 17h',()=>{
  const s=salao(),days=openDays(s,now);
  assert.equal(days[0],'2026-10-27');
  assert.ok(!days.includes('2026-11-01')&&!days.includes('2026-11-02'),'domingo e segunda fechados');
  assert.equal(slots(s,'S1','P2','2026-10-31',now)[0].time,'08:00');
  assert.equal(slots(s,'S1','P2','2026-10-27',now)[0].time,'09:00');
  assert.deepEqual(slots(s,'S1','P2','2026-11-01',now),[]);
});

test('horários seguem a grade de 45 minutos e o serviço inteiro cabe antes de fechar',()=>{
  const s=salao(),terca=slots(s,'S1','P2','2026-10-27',now).map(x=>x.time);
  assert.deepEqual(terca.slice(0,3),['09:00','09:45','10:30']);
  assert.equal(terca.at(-1),'17:15');
  assert.equal(slots(s,'S3','P1','2026-10-27',now).at(-1).time,'16:30');
});

test('intervalo da profissional e antecedência mínima tiram horários',()=>{
  const s=salao(),lia=slots(s,'S1','P1','2026-10-27',now).map(x=>x.time);
  assert.ok(!lia.includes('12:00'),'12:00–12:45 é o intervalo da Lia');
  const quase=Date.parse('2026-10-27T10:00:00-03:00');
  assert.equal(slots(s,'S1','P2','2026-10-27',quase)[0].time,'11:15');
});

test('pedido segura o horário, cria a cliente e só a gerência confirma',()=>{
  const s=salao(),a=pedido(s);
  assert.equal(a.status,'requested');
  assert.equal(s.clients[0].phone,'5583999990000');
  assert.equal(s.clients[0].consent,true);
  assert.ok(!slots(s,'S1','P1','2026-10-27',now).some(x=>x.start===540),'horário reservado');
  assert.throws(()=>pedido(s,{name:'Bia',phone:'83988887777'}),/ocupado/);
  actAdmin(s,'request_accept',{id:a.id},now);
  assert.equal(a.status,'booked');
});

test('sem preferência, fica com a primeira profissional livre',()=>{
  const s=salao(),a=pedido(s,{staff_id:''});
  assert.equal(a.staff_id,'P1');
  const b=pedido(s,{staff_id:'',name:'Bia',phone:'83988887777'});
  assert.equal(b.staff_id,'P2');
});

test('mesma cliente pelo telefone e limite de três pedidos abertos',()=>{
  const s=salao();
  for(const start of [540,585,630])pedido(s,{start,phone:'5583999990000'});
  assert.equal(s.clients.length,1);
  assert.throws(()=>pedido(s,{start:675}),/aguardando/);
});

test('recusa libera o horário e pedido vencido é encerrado',()=>{
  const s=salao(),a=pedido(s);
  actAdmin(s,'request_decline',{id:a.id},now);
  assert.equal(a.status,'declined');
  assert.ok(slots(s,'S1','P1','2026-10-27',now).some(x=>x.start===540));
  const b=pedido(s,{start:585});
  tickAdmin(s,Date.parse('2026-10-27T10:00:00-03:00'));
  assert.equal(b.status,'expired');
});

test('cancelar pelo link: pedido vira desistência; confirmado vira vaga para o motor',()=>{
  const s=salao(),a=pedido(s);
  assert.equal(byToken(s,a.token).id,a.id);
  assert.throws(()=>byToken(s,'x'.repeat(32)),/não encontrado/);
  cancelByToken(s,a.token,now);
  assert.equal(a.status,'withdrawn');
  const b=pedido(s,{start:585});actAdmin(s,'request_accept',{id:b.id},now);
  cancelByToken(s,b.token,now);
  assert.equal(b.status,'cancelled');
  assert.equal(s.gaps.at(-1).cancelled_id,b.id);
  assert.throws(()=>cancelByToken(s,b.token,now),/não pode/);
});

test('a parte pública não mostra telefone nem outras clientes',()=>{
  const s=salao(),a=pedido(s);
  const view=JSON.stringify({...catalog(s),view:publicView(s,a,now)});
  assert.ok(!view.includes('99999')&&!view.includes('Souza'));
  assert.equal(publicView(s,a,now).name,'Ana');
});

test('telefone ganha o 55 e agendas antigas recebem o funcionamento padrão',()=>{
  assert.equal(phoneDigits('(83) 99999-0000'),'5583999990000');
  assert.equal(phoneDigits('5583999990000'),'5583999990000');
  const antiga=seedAdmin();delete antiga.settings.hours;delete antiga.settings.block;
  assert.equal(upgrade(antiga).settings.block,45);
  assert.deepEqual(upgrade(antiga).settings.hours[6],[480,1020]);
});

test('configurações recusam bloco ou horário inválidos',()=>{
  const s=salao(),base={name:'Santa Cor',minNotice:1,autoNext:true};
  assert.throws(()=>actAdmin(s,'settings',{...base,block:50},now),/bloco/);
  assert.throws(()=>actAdmin(s,'settings',{...base,hours:{2:[600,540]}},now),/funcionamento/);
  actAdmin(s,'settings',{...base,block:30,hours:{3:[540,1080]}},now);
  assert.deepEqual(openDays(s,now).slice(0,2),['2026-10-28','2026-11-04']);
});
