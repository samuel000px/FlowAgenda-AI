import test from 'node:test';
import assert from 'node:assert/strict';
import {seedAdmin} from '../lib/flowagenda.mjs';
import {moverAtendimento} from '../lib/assistente/mover.mjs';
import {slots} from '../lib/agendamento.mjs';
import {acharProfissional,acharCliente,acharAtendimento,consultarAgenda,consultarHorariosLivres,consultarHistoricoCliente,consultarResumoDia} from '../lib/assistente/consultas.mjs';

// Segunda-feira, 26/10/2026, 8h em Brasília: a terça é o primeiro dia útil.
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
const escova=(extra={})=>({id:'A1',client_id:'C1',service_id:'S11',staff_id:'P3',date:TERCA,start:540,end:630,price:60,variant:'Cabelo longo',addons:[{id:'S15',name:'Babyliss',price:20}],status:'booked',attendance:'yes',reminded:true,result:null,...extra});
function comEscova(extra){
  const s=salao();s.clients=[{id:'C1',name:'Ana',phone:''}];
  s.staff.push({id:'P4',name:'Bia',active:true,start:480,end:1080,break_start:0,break_end:0,services:['S11']});
  s.appointments=[escova(extra)];
  return s;
}

test('mover mantém duração, preço, opção e adicionais',()=>{
  const s=comEscova();
  const r=moverAtendimento(s,'A1',{staff_id:'P4'},{abrirVaga:false},now);
  const a=s.appointments[0];
  assert.deepEqual([a.start,a.end,a.price,a.variant,a.addons.length,a.attendance,a.reminded],[540,630,60,'Cabelo longo',1,'yes',true]);
  assert.equal(a.staff_id,'P4');
  assert.deepEqual(r.antes,{date:TERCA,start:540,end:630,staff_id:'P3'});
  assert.deepEqual(r.depois,{date:TERCA,start:540,end:630,staff_id:'P4'});
  assert.equal(s.gaps.length,0,'sem vaga quando abrirVaga=false');
});

test('mover para outro horário zera a confirmação e abre vaga quando pedido',()=>{
  const s=comEscova();
  const r=moverAtendimento(s,'A1',{start:630},{abrirVaga:true},now);
  const a=s.appointments[0];
  assert.deepEqual([a.start,a.end,a.price,a.variant,a.addons.length],[630,720,60,'Cabelo longo',1]);
  assert.deepEqual([a.attendance,a.reminded],['unknown',false]);
  assert.deepEqual(r.depois,{date:TERCA,start:630,end:720,staff_id:'P3'});
  assert.equal(s.gaps.length,1);
  assert.deepEqual([s.gaps[0].date,s.gaps[0].start,s.gaps[0].end,s.gaps[0].staff_id,s.gaps[0].status],[TERCA,540,630,'P3','open']);
  assert.deepEqual([s.gaps[0].service_id,s.gaps[0].price,s.gaps[0].cancelled_id],['S11',60,'A1'],'a vaga guarda serviço e preço do atendimento');
});

test('mover recusa quem não faz o serviço, horário ocupado, passado e atendimento encerrado',()=>{
  let s=comEscova();
  assert.throws(()=>moverAtendimento(s,'A1',{staff_id:'P2'},{abrirVaga:false},now),/não faz/);
  s=comEscova();
  s.appointments.push(escova({id:'A2',client_id:'C2',start:660,end:720}));
  assert.throws(()=>moverAtendimento(s,'A1',{start:630},{abrirVaga:false},now),/não está disponível/);
  assert.deepEqual([s.appointments[0].start,s.gaps.length],[540,0],'nada muda quando recusa');
  s=comEscova({result:'attended'});
  assert.throws(()=>moverAtendimento(s,'A1',{start:630},{abrirVaga:false},now),/não pode ser mudado/);
  s=comEscova({status:'cancelled'});
  assert.throws(()=>moverAtendimento(s,'A1',{start:630},{abrirVaga:false},now),/não pode ser mudado/);
  s=comEscova();
  assert.throws(()=>moverAtendimento(s,'A1',{date:'2026-10-25'},{abrirVaga:false},now),/não está disponível/);
  s=comEscova({date:'2026-10-26',start:420,end:510});
  assert.throws(()=>moverAtendimento(s,'A1',{start:540},{abrirVaga:false},now),/não pode ser mudado/);
});

// Ana às 09:00 com a Lia em Manicure, na terça.
function comAna(){
  const s=salao();
  s.clients=[{id:'C1',name:'Ana Souza',phone:'5583999990001',preferred:'P1',visits:3,missed:1}];
  s.appointments=[{id:'A1',client_id:'C1',service_id:'S1',staff_id:'P1',date:TERCA,start:540,end:585,price:30,status:'booked',attendance:'unknown',reminded:false,result:null}];
  return s;
}

test('nome ambíguo vira pergunta, nunca escolhe sozinho',()=>{
  const s=salao();s.staff.push({id:'P9',name:'Lia Teste',active:true,start:480,end:1080,break_start:0,break_end:0,services:['S1']});
  assert.equal(acharProfissional(s,'Lia').pro.id,'P1','nome exato ganha');
  assert.equal(acharProfissional(s,'lía').pro.id,'P1','sem acento e sem maiúscula');
  assert.equal(acharProfissional(s,'Ni').pro.id,'P2','começa com, quando só uma');
  assert.match(acharProfissional(s,'Li').pergunta,/Qual delas\? Lia, Lia Teste/);
  assert.match(acharProfissional(s,'Zuleica').pergunta,/Não achei a profissional "Zuleica"\. A equipe é: Lia, Nina, Rafa, Lia Teste\./);
  s.staff.push({id:'P8',name:'Lili',active:false,start:480,end:1080,break_start:0,break_end:0,services:['S1']},{id:'P7',name:'Lila',active:true,removed:true,start:480,end:1080,break_start:0,break_end:0,services:['S1']});
  assert.doesNotMatch(acharProfissional(s,'Lil').pergunta,/Lil[ia]/,'inativa e removida ficam de fora');
  s.clients=[{id:'C1',name:'Ana Souza',phone:'5583999990001'},{id:'C2',name:'Ana Lima',phone:'5583999990002'},{id:'C3',name:'Lili',phone:''},{id:'C4',name:'Lili Teste',phone:'5583999990004'}];
  const q=acharCliente(s,'Ana').pergunta;
  assert.match(q,/^Achei mais de uma: Ana Souza \(final 0001\), Ana Lima \(final 0002\)\. Qual\?$/);
  assert.match(acharCliente(s,'Lili').pergunta,/Achei mais de uma: Lili, Lili Teste \(final 0004\)\. Qual\?/,'nome que é parte de outro também pergunta');
  assert.equal(acharCliente(s,'0002').cliente.id,'C2');
  assert.equal(acharCliente(s,'(83) 99999-0002').cliente.id,'C2');
  assert.equal(acharCliente(s,'ana 0002').cliente.id,'C2','nome mais final do número desempata');
  assert.equal(acharCliente(s,'Ana Souza').cliente.id,'C1');
  assert.equal(acharCliente(s,'ánà lima').cliente.id,'C2');
  assert.match(acharCliente(s,'Zuleica').pergunta,/Não achei a cliente "Zuleica"/);
  assert.match(acharCliente(s,'12').pergunta,/Não achei/,'menos de 4 dígitos não busca por número');
});

test('muitas clientes: a pergunta lista só cinco',()=>{
  const s=salao();s.clients=Array.from({length:7},(_,i)=>({id:'C'+i,name:'Ana '+i,phone:'558399999000'+i}));
  const q=acharCliente(s,'Ana').pergunta;
  assert.equal(q.split('(final').length-1,5);
});

test('achar atendimento: uma, várias, hora desempata, cancelado não conta',()=>{
  const s=comAna();const c=s.clients[0];
  assert.equal(acharAtendimento(s,{cliente:c,data:TERCA}).atendimento,s.appointments[0],'devolve o próprio objeto');
  assert.equal(acharAtendimento(s,{cliente:'C1',data:TERCA}).atendimento.id,'A1','aceita o id da cliente');
  s.appointments.push({...s.appointments[0],id:'A2',service_id:'S2',start:840,end:885},{...s.appointments[0],id:'A3',start:960,end:1005,status:'cancelled'});
  assert.match(acharAtendimento(s,{cliente:c,data:TERCA}).pergunta,/Ana Souza tem mais de um atendimento em 27\/10: 09:00 Manicure, 14:00 Pedicure\. Qual\?/);
  assert.equal(acharAtendimento(s,{cliente:c,data:TERCA,hora:'14:00'}).atendimento.id,'A2');
  assert.match(acharAtendimento(s,{cliente:c,data:TERCA,hora:'16:00'}).pergunta,/às 16:00/);
  assert.match(acharAtendimento(s,{cliente:c,data:'2026-10-28'}).pergunta,/Ana Souza não tem atendimento em 28\/10\./);
  s.appointments[1].status='requested';
  assert.equal(acharAtendimento(s,{cliente:c,data:TERCA,hora:'14:00'}).atendimento.id,'A2','pedido em Aceitações também conta');
});

test('agenda do dia e resumo saem como texto pronto',()=>{
  const s=comAna();
  const ag=consultarAgenda(s,{data:TERCA});
  assert.equal(ag.tipo,'resposta');
  assert.match(ag.texto,/09:00 Ana Souza · Manicure · Lia/);
  assert.equal(consultarAgenda(s,{data:TERCA,profissional:'P2'}).texto,'Nenhum atendimento em 27/10.');
  assert.match(consultarAgenda(s,{data:TERCA,profissional:'P1'}).texto,/09:00 Ana Souza/);
  assert.equal(consultarAgenda(s,{data:'2026-10-28'}).texto,'Nenhum atendimento em 28/10.');
  s.appointments.push({...s.appointments[0],id:'A2',client_id:'C9',start:480,end:525,status:'cancelled'},{...s.appointments[0],id:'A3',start:420,end:465,status:'requested'});
  const linhas=consultarAgenda(s,{data:TERCA}).texto.split('\n').filter(l=>/^\d\d:\d\d/.test(l));
  assert.equal(linhas.length,2,'cancelado fica de fora');
  assert.match(linhas[0],/^07:00 Ana Souza/,'ordem por horário');
  const r=consultarResumoDia(s,{data:TERCA},now);
  assert.equal(r.tipo,'resposta');
  assert.match(r.texto,/1 atendimento\b/);assert.match(r.texto,/R\$/);
  assert.match(r.texto,/1 pedido.*Aceitações/s);
  assert.doesNotMatch(consultarResumoDia(salao(),{data:TERCA},now).texto,/NaN|undefined/);
  assert.match(consultarResumoDia(salao(),{data:TERCA},now).texto,/Nenhum atendimento/);
});

test('consultas não gravam nada no cadastro',()=>{
  const s=comAna();const antes=JSON.stringify(s);
  consultarAgenda(s,{data:TERCA});consultarHorariosLivres(s,{data:TERCA,servico:'Manicure'},now);
  consultarHistoricoCliente(s,{cliente:s.clients[0]},now);consultarResumoDia(s,{data:TERCA},now);
  acharProfissional(s,'Lia');acharCliente(s,'Ana');acharAtendimento(s,{cliente:'C1',data:TERCA});
  assert.equal(JSON.stringify(s),antes);
});

test('horários livres usam a mesma regra do site',()=>{
  const s=comAna();
  const esperado=slots(s,{items:[{service:'S1'}],staff:{'Mãos e pés':''}},TERCA,now,0).map(x=>x.time);
  assert.ok(esperado.length>0);
  const r=consultarHorariosLivres(s,{data:TERCA,servico:'manicure'},now);
  assert.equal(r.tipo,'resposta');
  for(const h of esperado)assert.ok(r.texto.includes(h),h);
  assert.match(r.texto,/Manicure.*27\/10/s);
  // só a Lia: ocupada às 09:00, então esse horário some
  const lia=consultarHorariosLivres(s,{data:TERCA,servico:'Manicure',profissional:'Lia'},now);
  const soLia=slots(s,{items:[{service:'S1'}],staff:{'Mãos e pés':'P1'}},TERCA,now,0).map(x=>x.time);
  assert.ok(!soLia.includes('09:00'));
  assert.ok(!lia.texto.includes('09:00')&&lia.texto.includes(soLia[0]));
  assert.match(lia.texto,/com Lia/);
  assert.equal(consultarHorariosLivres(s,{data:TERCA,servico:'Manicure',profissional:'Rafa'},now).tipo,'pergunta','Rafa não faz manicure');
  assert.equal(consultarHorariosLivres(s,{data:TERCA,servico:'Manicure',profissional:'Ni'},now).tipo,'resposta');
  assert.equal(consultarHorariosLivres(s,{data:TERCA,servico:'Zzz'},now).tipo,'pergunta');
  assert.match(consultarHorariosLivres(s,{data:'2026-10-25',servico:'Manicure'},now).texto,/Nenhum horário livre/,'domingo fechado');
  assert.equal(consultarHorariosLivres(s,{data:TERCA,servico:'Escova'},now).tipo,'pergunta','escova pede a opção');
  assert.match(consultarHorariosLivres(s,{data:TERCA,servico:'Escova'},now).texto,/Cabelo longo/);
  assert.equal(consultarHorariosLivres(s,{data:TERCA,servico:'Escova',opcao:'longo'},now).tipo,'resposta');
});

test('histórico da cliente: visitas, última, preferida, faltas, gasto e próximos',()=>{
  const s=comAna();
  s.appointments.push(
    {...s.appointments[0],id:'A5',date:'2026-10-10',price:30,result:'attended',attendance:'yes'},
    {...s.appointments[0],id:'A6',date:'2026-09-20',price:45,result:'attended',attendance:'yes'},
    {...s.appointments[0],id:'A7',date:'2026-09-01',price:30,result:'missed'});
  s.payments=[{id:'Y1',appointmentId:'A5',amount:35,date:'2026-10-10'}];
  const r=consultarHistoricoCliente(s,{cliente:s.clients[0]},now);
  assert.equal(r.tipo,'resposta');
  assert.match(r.texto,/Ana Souza/);
  assert.match(r.texto,/3 visitas/);
  assert.match(r.texto,/última.*10\/10/i);
  assert.match(r.texto,/preferida.*Lia/i);
  assert.match(r.texto,/1 falta/);
  assert.match(r.texto,/R\$\s?80,00/,'35 pago + 45 da agenda');
  assert.match(r.texto,/27\/10 às 09:00/);
  const nova=consultarHistoricoCliente({...s,appointments:[],payments:[]},{cliente:'C1'},now);
  assert.doesNotMatch(nova.texto,/NaN|undefined/);
});
