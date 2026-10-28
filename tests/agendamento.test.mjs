import test from 'node:test';
import assert from 'node:assert/strict';
import {actAdmin,candidates,seedAdmin,tickAdmin,upgrade} from '../lib/flowagenda.mjs';
import {byToken,cancelByToken,catalog,openDays,phoneDigits,publicView,readCart,requestBooking,slots} from '../lib/agendamento.mjs';

// Segunda-feira, 26/10/2026, 8h em Brasília: a agenda abre na terça.
const now=Date.parse('2026-10-26T08:00:00-03:00');
const TERCA='2026-10-27';
function salao(){
  const s=seedAdmin();
  s.staff=[
    {id:'P1',name:'Lia',active:true,start:480,end:1080,break_start:720,break_end:765,services:['S1','S2','S3','S5']},
    {id:'P2',name:'Nina',active:true,start:480,end:1080,break_start:0,break_end:0,services:['S1','S2']},
    {id:'P3',name:'Rafa',active:true,start:480,end:1080,break_start:0,break_end:0,services:['S11','S12']},
  ];
  return s;
}
const manicure=(staff='P1',extra={})=>({items:[{service:'S1',...extra}],staff:{Unhas:staff}});
const pedido=(s,extra={})=>requestBooking(s,{cart:manicure(),date:TERCA,start:540,name:'Ana Souza',phone:'(83) 99999-0000',earlier:true,...extra},now);

test('agenda abre de terça a sábado, com sábado das 8h às 17h',()=>{
  const s=salao(),days=openDays(s,now);
  assert.equal(days[0],TERCA);
  assert.ok(!days.includes('2026-11-01')&&!days.includes('2026-11-02'),'domingo e segunda fechados');
  assert.equal(slots(s,manicure('P2'),'2026-10-31',now)[0].time,'08:00');
  assert.equal(slots(s,manicure('P2'),TERCA,now)[0].time,'09:00');
  assert.deepEqual(slots(s,manicure('P2'),'2026-11-01',now),[]);
});

test('horários seguem a grade de 45 minutos e o carrinho inteiro cabe antes de fechar',()=>{
  const s=salao(),terca=slots(s,manicure('P2'),TERCA,now).map(x=>x.time);
  assert.deepEqual(terca.slice(0,3),['09:00','09:45','10:30']);
  assert.equal(terca.at(-1),'17:15');
  assert.equal(slots(s,{items:[{service:'S3'}],staff:{Unhas:'P1'}},TERCA,now).at(-1).time,'16:30');
});

test('intervalo da profissional e antecedência mínima tiram horários',()=>{
  const s=salao(),lia=slots(s,manicure(),TERCA,now).map(x=>x.time);
  assert.ok(!lia.includes('12:00'),'12:00–12:45 é o intervalo da Lia');
  assert.equal(slots(s,manicure('P2'),TERCA,Date.parse('2026-10-27T10:00:00-03:00'))[0].time,'11:15');
});

test('carrinho com unhas e cabelo: em sequência, uma profissional por área',()=>{
  const s=salao(),cart={items:[{service:'S1'},{service:'S11',variant:2}],staff:{Unhas:'P2',Cabelo:''}};
  const [first]=slots(s,cart,TERCA,now);
  assert.equal(first.time,'09:00');
  assert.deepEqual(first.plan.map(x=>[x.start,x.end,x.staff]),[[540,585,'P2'],[585,675,'P3']],'escova longa (90 min) começa quando a manicure acaba');
  assert.equal(slots(s,cart,TERCA,now).at(-1).time,'15:45','15:45 + 45 + 90 = 18:00');
});

test('sem sobreposição: o segundo item precisa da profissional livre logo depois do primeiro',()=>{
  const s=salao();
  requestBooking(s,{cart:{items:[{service:'S12'}],staff:{Cabelo:'P3'}},date:TERCA,start:585,name:'Bia',phone:'83988887777'},now);
  const cart={items:[{service:'S1'},{service:'S11',variant:0}],staff:{Unhas:'P2',Cabelo:'P3'}};
  assert.ok(!slots(s,cart,TERCA,now).some(x=>x.start===540),'Rafa está ocupada às 09:45');
});

test('mesma área no carrinho fica com a mesma profissional',()=>{
  const s=salao(),cart={items:[{service:'S2'},{service:'S5'}],staff:{Unhas:''}};
  const plan=slots(s,cart,TERCA,now)[0].plan;
  assert.equal(plan[0].staff,'P1');assert.equal(plan[1].staff,'P1','só a Lia faz SPA Relaxante, então ela faz os dois');
});

test('adicionais somam no preço e não no tempo; desconto do "pegue também" vale no item alvo',()=>{
  const s=salao(),items=readCart(s,{items:[{service:'S1',addons:['S10','S9']},{service:'S2'}],staff:{}});
  assert.equal(items[0].duration,45);
  assert.equal(items[0].price,50,'manicure 30 + francesinha 10 + arte 10');
  assert.equal(items[1].discount,5.25,'15% da pedicure (35)');
  assert.equal(items[1].price,29.75);
  assert.throws(()=>readCart(s,{items:[{service:'S1',addons:['S14']}],staff:{}}),/não combina/);
  assert.throws(()=>readCart(s,{items:[{service:'S11'}],staff:{}}),/opção/);
});

test('ofertas cruzadas não dão desconto duplo: vale só no item que entrou depois',()=>{
  const s=salao(),[unha,escova]=readCart(s,{items:[{service:'S1'},{service:'S11',variant:0}],staff:{}});
  assert.equal(unha.discount,0);assert.equal(escova.discount,10);
  const [escova2,unha2]=readCart(s,{items:[{service:'S11',variant:0},{service:'S1'}],staff:{}});
  assert.equal(escova2.discount,0);assert.equal(unha2.discount,10);
});

test('desconto por área e só o maior quando dois combinam',()=>{
  const s=salao(),items=readCart(s,{items:[{service:'S2'},{service:'S11',variant:3}],staff:{}});
  assert.equal(items[1].discount,10,'qualquer serviço de unhas dá R$ 10 na escova');
  s.promos.push({id:'D9',trigger:'S2',target:'S11',type:'percent',value:50,active:true});
  assert.equal(readCart(s,{items:[{service:'S2'},{service:'S11',variant:3}],staff:{}})[1].discount,40,'50% de 80 ganha dos R$ 10');
  s.promos.forEach(d=>d.active=false);
  assert.equal(readCart(s,{items:[{service:'S2'},{service:'S11',variant:3}],staff:{}})[1].discount,0);
});

test('pedido segura os horários, cria a cliente e só a gerência confirma (o pedido inteiro)',()=>{
  const s=salao(),cart={items:[{service:'S1',addons:['S10']},{service:'S11',variant:1}],staff:{Unhas:'P1',Cabelo:'P3'}};
  const [a,b]=requestBooking(s,{cart,date:TERCA,start:540,name:'Ana Souza',phone:'(83) 99999-0000',earlier:true},now);
  assert.equal(a.status,'requested');assert.equal(a.order,b.order);assert.equal(a.token,b.token);assert.ok(a.linked);
  assert.equal(b.start,585);assert.equal(b.variant,'Cabelo médio');assert.equal(a.addons[0].name,'Francesinha');
  assert.equal(s.clients[0].phone,'5583999990000');
  assert.throws(()=>pedido(s,{name:'Bia',phone:'83988887777'}),/ocupado/);
  actAdmin(s,'request_accept',{id:a.id},now);
  assert.equal(a.status,'booked');assert.equal(b.status,'booked');
});

test('pedido com dois atendimentos fica fora da antecipação automática',()=>{
  const s=salao();
  const [a]=requestBooking(s,{cart:{items:[{service:'S1'},{service:'S12'}],staff:{Unhas:'P2',Cabelo:'P3'}},date:'2026-10-30',start:540,name:'Ana',phone:'83999990000',earlier:true},now);
  actAdmin(s,'request_accept',{id:a.id},now);
  const [solo]=pedido(s,{name:'Bia',phone:'83988887777',date:'2026-10-29',start:585,cart:manicure('P2')});
  actAdmin(s,'request_accept',{id:solo.id},now);
  const [vaga]=pedido(s,{name:'Cris',phone:'83977776666',cart:manicure('P2')});
  actAdmin(s,'request_accept',{id:vaga.id},now);actAdmin(s,'cancel',{id:vaga.id},now);
  const nomes=candidates(s,s.gaps.at(-1).id,now).map(c=>c.name);
  assert.ok(nomes.includes('Bia')&&!nomes.includes('Ana'));
});

test('sem preferência, fica com a primeira profissional livre',()=>{
  const s=salao(),[a]=pedido(s,{cart:manicure('')});
  assert.equal(a.staff_id,'P1');
  const [b]=pedido(s,{cart:manicure(''),name:'Bia',phone:'83988887777'});
  assert.equal(b.staff_id,'P2');
});

test('mesma cliente pelo telefone e limite de três pedidos abertos',()=>{
  const s=salao();
  for(const start of [540,585,630])pedido(s,{start,phone:'5583999990000'});
  assert.equal(s.clients.length,1);
  assert.throws(()=>pedido(s,{start:675}),/aguardando/);
});

test('recusa libera o horário e pedido vencido é encerrado',()=>{
  const s=salao(),[a]=pedido(s);
  actAdmin(s,'request_decline',{id:a.id},now);
  assert.equal(a.status,'declined');
  assert.ok(slots(s,manicure(),TERCA,now).some(x=>x.start===540));
  const [b]=pedido(s,{start:585});
  tickAdmin(s,Date.parse('2026-10-27T10:00:00-03:00'));
  assert.equal(b.status,'expired');
});

test('cancelar pelo link: pedido vira desistência; confirmado vira vaga para o motor',()=>{
  const s=salao(),[a,b]=requestBooking(s,{cart:{items:[{service:'S1'},{service:'S12'}],staff:{Unhas:'P2',Cabelo:'P3'}},date:TERCA,start:540,name:'Ana',phone:'83999990000'},now);
  assert.equal(byToken(s,a.token).id,a.id);
  assert.throws(()=>byToken(s,'x'.repeat(32)),/não encontrado/);
  cancelByToken(s,a.token,now);
  assert.equal(a.status,'withdrawn');assert.equal(b.status,'withdrawn');
  const [c]=pedido(s,{start:585});actAdmin(s,'request_accept',{id:c.id},now);
  cancelByToken(s,c.token,now);
  assert.equal(c.status,'cancelled');
  assert.equal(s.gaps.at(-1).cancelled_id,c.id);
  assert.throws(()=>cancelByToken(s,c.token,now),/não pode/);
});

test('a parte pública não mostra telefone nem outras clientes',()=>{
  const s=salao(),[a]=pedido(s);
  const view=JSON.stringify({...catalog(s),view:publicView(s,a,now)});
  assert.ok(!view.includes('99999')&&!view.includes('Souza'));
  assert.equal(publicView(s,a,now).name,'Ana');
  assert.equal(publicView(s,a,now).total,30);
});

test('catálogo público: só serviços que alguém faz, adicionais da mesma área e ofertas ativas',()=>{
  const c=catalog(salao());
  assert.ok(c.services.some(v=>v.name==='Escova'&&v.variants.length===4));
  assert.ok(!c.services.some(v=>v.name==='Alongamento de unhas'),'ninguém faz alongamento ainda');
  assert.deepEqual(c.addons.map(a=>a.name).sort(),['Arte','Babyliss','Chapinha','Francesinha']);
  assert.ok(c.promos.length>=3);
});

test('telefone ganha o 55 e agendas antigas recebem funcionamento, áreas e ofertas',()=>{
  assert.equal(phoneDigits('(83) 99999-0000'),'5583999990000');
  assert.equal(phoneDigits('5583999990000'),'5583999990000');
  const antiga=seedAdmin();delete antiga.settings.hours;delete antiga.settings.block;delete antiga.promos;antiga.services=[{id:'S1',name:'Manicure',duration:45,price:45}];
  const nova=upgrade(antiga);
  assert.equal(nova.settings.block,45);assert.deepEqual(nova.settings.hours[6],[480,1020]);
  assert.equal(nova.services[0].group,'Unhas');assert.deepEqual(nova.promos,[]);
});

test('painel: importar catálogo das fichas, salvar oferta e serviço com opções',()=>{
  const s=salao();s.services=[{id:'S1',name:'Manicure',duration:45,price:45,group:'Unhas',addon:false}];
  actAdmin(s,'catalog_import',{},now);
  assert.equal(s.services.filter(v=>v.name==='Manicure').length,1,'não duplica');
  assert.ok(s.services.length>10);
  const escova=s.services.find(v=>v.name==='Escova');
  actAdmin(s,'promo_save',{trigger:'S1',target:escova.id,type:'percent',value:10},now);
  assert.equal(s.promos.at(-1).target,escova.id);
  assert.throws(()=>actAdmin(s,'promo_save',{trigger:'S1',target:escova.id,type:'percent',value:95},now),/oferta/);
  actAdmin(s,'service_save',{id:escova.id,name:'Escova',group:'Cabelo',duration:45,price:40,variants:[{name:'Curto',duration:45,price:40}]},now);
  assert.equal(escova.variants.length,1);
  actAdmin(s,'service_save',{id:escova.id,name:'Escova',group:'Cabelo',duration:45,price:40},now);
  assert.equal(escova.variants,undefined);
  s.clients.push({id:'C1',name:'Ana'});
  assert.throws(()=>actAdmin(s,'book',{client_id:'C1',service_id:s.services.find(v=>v.addon).id,staff_id:'P1'},now),/Adicionais/);
});

test('configurações recusam bloco ou horário inválidos',()=>{
  const s=salao(),base={name:'Santa Cor',minNotice:1,autoNext:true};
  assert.throws(()=>actAdmin(s,'settings',{...base,block:50},now),/bloco/);
  assert.throws(()=>actAdmin(s,'settings',{...base,hours:{2:[600,540]}},now),/funcionamento/);
  actAdmin(s,'settings',{...base,block:30,hours:{3:[540,1080]}},now);
  assert.deepEqual(openDays(s,now).slice(0,2),['2026-10-28','2026-11-04']);
});
