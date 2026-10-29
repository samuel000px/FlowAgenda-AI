import test from 'node:test';
import assert from 'node:assert/strict';
import {seedAdmin} from '../lib/flowagenda.mjs';
import {moverAtendimento} from '../lib/assistente/mover.mjs';

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
