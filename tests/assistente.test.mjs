import test from 'node:test';
import assert from 'node:assert/strict';
import {seedAdmin} from '../lib/flowagenda.mjs';
import {moverAtendimento} from '../lib/assistente/mover.mjs';
import {slots} from '../lib/agendamento.mjs';
import {acharProfissional,acharCliente,acharAtendimento,consultarAgenda,consultarHorariosLivres,consultarHistoricoCliente,consultarResumoDia} from '../lib/assistente/consultas.mjs';
import {planoRemarcar,planoTrocarProfissional,planoAusencia,planoDesfazer,aplicarPlano} from '../lib/assistente/planos.mjs';

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

test('data impossível vira pergunta, não erro',()=>{
  const s=comAna();
  for(const data of ['2026-13-01','2026-00-10','2026-10-32','2026-02-30','texto','']){
    assert.equal(consultarAgenda(s,{data}).tipo,'pergunta',data);
    assert.equal(consultarHorariosLivres(s,{data,servico:'Manicure'},now).tipo,'pergunta',data);
    assert.equal(consultarResumoDia(s,{data},now).tipo,data?'pergunta':'resposta',data);
  }
});

// Lia (P1) com Ana às 09:00 (Manicure) e Bia às 10:00 (Pedicure) na terça; Bia prefere a Nina.
function comFalta(){
  const s=salao();
  s.clients=[{id:'C1',name:'Ana Souza',phone:'5583999990001',preferred:'P1'},{id:'C2',name:'Bia Lima',phone:'83999990002',preferred:'P2'}];
  const base={date:TERCA,staff_id:'P1',status:'booked',attendance:'unknown',reminded:false,result:null};
  s.appointments=[{...base,id:'A1',client_id:'C1',service_id:'S1',start:540,end:585,price:30},{...base,id:'A2',client_id:'C2',service_id:'S2',start:600,end:645,price:35}];
  return s;
}
const textoDoLink=link=>decodeURIComponent(link.split('?text=')[1]);

test('falta: mesmo horário com outra profissional, preferida primeiro, sem abrir vaga',()=>{
  const s=comFalta();const antes=JSON.stringify(s);
  const {plano}=planoAusencia(s,{profissional:'Lia',data:TERCA},now);
  assert.equal(JSON.stringify(s),antes,'montar o plano não grava nada');
  assert.equal(plano.tipo,'ausencia');
  assert.equal(plano.validoAte,now+600000);
  assert.match(plano.titulo,/^Redistribuir a agenda da Lia · ter 27\/10$/);
  assert.deepEqual(plano.linhas.map(l=>[l.cliente,l.servico,l.de.hora,l.de.profissional,l.para.data,l.para.hora,l.para.staff_id,l.para.profissional]),
    [['Ana Souza','Manicure','09:00','Lia',TERCA,'09:00','P2','Nina'],['Bia Lima','Pedicure','10:00','Lia',TERCA,'10:00','P2','Nina']]);
  assert.equal(plano.impacto,'2 clientes afetadas. Valores não mudam.');
  const r=aplicarPlano(s,plano,now);
  assert.deepEqual(s.appointments.map(a=>[a.staff_id,a.start,a.end,a.price]),[['P2',540,585,30],['P2',600,645,35]]);
  assert.equal(s.gaps.length,0,'falta não abre vaga no horário de quem faltou');
  assert.equal(r.avisos.length,2);
  for(const v of r.avisos)assert.ok(v.link.startsWith('https://wa.me/'));
  assert.ok(r.avisos[1].link.startsWith('https://wa.me/5583999990002?text='),'número sem o 55 ganha o 55');
  assert.equal(textoDoLink(r.avisos[0].link),'Oi, Ana! Seu horário de 27/10 às 09:00 continua, mas agora com a Nina no lugar da Lia. Qualquer dúvida, é só responder. Equipe Santa Cor');
  assert.equal(r.avisos[0].cliente,'Ana Souza');
  assert.equal(r.pacote.mudancas.length,2);
  assert.deepEqual(r.pacote.mudancas[0].antes,{date:TERCA,start:540,end:585,staff_id:'P1'});
  assert.equal(s.assistente.pacotes[0].id,r.pacote.id);
  assert.equal(s.events[0].text,'Assistente, confirmado pela gerência: '+plano.titulo);
});

test('falta: a preferida da cliente vem primeiro, depois quem tem menos horários no dia',()=>{
  const s=comFalta();
  s.staff.push({id:'P4',name:'Duda',active:true,start:480,end:1080,break_start:0,break_end:0,services:['S1','S2']});
  s.clients.push({id:'C9',name:'Carla',phone:''});
  s.appointments.push({...s.appointments[0],id:'A9',client_id:'C9',staff_id:'P2',start:900,end:945}); // Nina com um horário à tarde
  const {plano}=planoAusencia(s,{profissional:'Lia',data:TERCA},now);
  assert.deepEqual(plano.linhas.map(l=>l.para.profissional),['Duda','Nina'],'Ana (prefere a Lia) vai para quem tem menos; Bia vai para a Nina, a preferida');
  // Sem preferência: a segunda linha conta a primeira, que já foi para a Duda (Duda 1, Nina 2).
  s.clients[1].preferred='';
  s.appointments.push({...s.appointments[2],id:'A8',start:1000,end:1045}); // Nina com dois à tarde
  assert.deepEqual(planoAusencia(s,{profissional:'Lia',data:TERCA},now).plano.linhas.map(l=>l.para.profissional),['Duda','Duda']);
});

test('falta: sem ninguém livre, a linha fica sem vaga com sugestões e não é movida',()=>{
  const ocupada=()=>{
    const s=comFalta();s.appointments.pop();
    s.clients.push({id:'C9',name:'Carla',phone:''});
    s.appointments.push({...s.appointments[0],id:'A9',client_id:'C9',staff_id:'P2'}); // Nina ocupada às 09:00
    return s;
  };
  const s=ocupada();
  const {plano}=planoAusencia(s,{profissional:'Lia',data:TERCA},now);
  const l=plano.linhas[0];
  assert.equal(l.para,null);
  assert.match(l.aviso,/sem vaga.*Sugestões:/);
  assert.equal(l.aviso,'sem vaga neste dia. Sugestões: 09:45 (Nina), 10:30 (Nina)','mais tarde no mesmo dia e sem a Lia');
  const r=aplicarPlano(s,plano,now);
  assert.equal(s.appointments[0].staff_id,'P1');
  assert.equal(s.gaps.length,0);
  assert.equal(r.pacote.mudancas.length,0);
  assert.equal(textoDoLink(r.avisos[0].link),'Oi, Ana! A Lia não vai poder atender 27/10 às 09:00. Quer que a gente procure outro horário para você? Equipe Santa Cor');
  assert.match(textoDoLink(r.avisos[0].link),/Quer que a gente procure outro horário/);
  // No próprio dia, o aviso diz "hoje".
  const cedo=Date.parse('2026-10-27T07:00:00-03:00');
  assert.match(planoAusencia(ocupada(),{profissional:'Lia',data:TERCA},cedo).plano.linhas[0].aviso,/^sem vaga hoje\. Sugestões: 09:45 \(Nina\)/);
  // Nada livre nem nos próximos dias: lista de espera.
  const t=ocupada();t.settings.bookingDays=1;
  assert.equal(planoAusencia(t,{profissional:'Lia',data:TERCA},now).plano.linhas[0].aviso,'sem vaga; oferecer a lista de espera');
});

test('falta: o texto avisa que a profissional continua no site',()=>{
  const s=comFalta();
  const {plano}=planoAusencia(s,{profissional:'lia',data:TERCA},now);
  assert.ok(plano.avisos.includes('A Lia continua aparecendo no agendamento do site neste dia. Para tirar, marque-a como inativa em Equipe e serviços.'));
  // Pedido do site ainda em Aceitações não é movido, mas aparece no cartão.
  s.appointments.push({...s.appointments[0],id:'A7',start:900,end:945,status:'requested'});
  assert.ok(planoAusencia(s,{profissional:'Lia',data:TERCA},now).plano.avisos.includes('A Lia também tem 1 pedido neste dia esperando em Aceitações.'));
  s.appointments.pop();
  // Já marcada como inativa: ainda é achada pelo nome e o aviso do site some.
  s.staff[0].active=false;
  const p=planoAusencia(s,{profissional:'Lia',data:TERCA},now).plano;
  assert.equal(p.linhas.length,2);
  assert.ok(!p.avisos.some(a=>/continua aparecendo/.test(a)));
  // Sem horários, data impossível e nome ambíguo não viram plano.
  assert.deepEqual(planoAusencia(s,{profissional:'Nina',data:TERCA},now),{tipo:'resposta',texto:'A Nina não tem horários marcados em 27/10.'});
  assert.equal(planoAusencia(s,{profissional:'Lia',data:'2026-02-30'},now).tipo,'pergunta');
  s.staff.push({id:'P9',name:'Nina Teste',active:true,start:480,end:1080,break_start:0,break_end:0,services:['S1']});
  assert.equal(planoAusencia(s,{profissional:'Ni',data:TERCA},now).tipo,'pergunta');
});

test('confirmar depois que a agenda mudou não grava nada pela metade',()=>{
  const s=comFalta();
  const {plano}=planoAusencia(s,{profissional:'Lia',data:TERCA},now);
  s.appointments[1].status='cancelled';
  const antes=JSON.stringify(s);
  assert.throws(()=>aplicarPlano(s,plano,now),/^Error: A agenda mudou desde o plano\. Peça de novo para eu refazer\.$/);
  assert.equal(s.appointments[0].staff_id,'P1');
  assert.equal(JSON.stringify(s),antes,'nada gravado');
  // A Nina foi ocupada no horário da Bia depois do plano: a primeira linha também não é gravada.
  const t=comFalta();const p=planoAusencia(t,{profissional:'Lia',data:TERCA},now).plano;
  t.appointments.push({...t.appointments[1],id:'A9',client_id:'C9',staff_id:'P2'});
  assert.throws(()=>aplicarPlano(t,p,now),/agenda mudou/);
  assert.deepEqual(t.appointments.map(a=>a.staff_id),['P1','P1','P2']);
  assert.equal(t.assistente,undefined);
});

test('plano vencido e plano com mais de 15 linhas',()=>{
  const s=comFalta();
  const {plano}=planoAusencia(s,{profissional:'Lia',data:TERCA},now);
  assert.throws(()=>aplicarPlano(s,plano,plano.validoAte+1),/Este plano venceu\. Peça de novo\./);
  assert.equal(s.appointments[0].staff_id,'P1');
  const t=salao();
  t.clients=Array.from({length:16},(_,i)=>({id:'C'+i,name:'Cliente '+i,phone:''}));
  t.appointments=t.clients.map((c,i)=>({id:'A'+i,client_id:c.id,service_id:'S1',staff_id:'P1',date:TERCA,start:480+30*i,end:510+30*i,price:30,status:'booked',attendance:'unknown',reminded:false,result:null}));
  const p=planoAusencia(t,{profissional:'Lia',data:TERCA},now).plano;
  assert.equal(p.linhas.length,15);
  assert.ok(p.avisos.some(a=>/Mostrei os 15 primeiros/.test(a)));
  assert.equal(p.linhas[14].de.hora,'15:00','os primeiros pelo horário');
  assert.match(p.impacto,/15 clientes afetadas · 15 sem WhatsApp no cadastro/);
});

test('pedido com vários serviços não muda de horário sozinho',()=>{
  const s=comAna();
  Object.assign(s.appointments[0],{order:'R1',linked:true});
  s.appointments.push({...s.appointments[0],id:'A2',service_id:'S2',start:585,end:630});
  const r=planoRemarcar(s,{cliente:'Ana',data:TERCA,hora:'09:00',nova_hora:'14:00'},now);
  assert.equal(r.tipo,'resposta');
  assert.match(r.texto,/faz parte de um pedido com mais serviços/);
  assert.match(planoRemarcar(s,{cliente:'Ana',data:TERCA,hora:'09:00',nova_data:'2026-10-28'},now).texto,/faz parte de um pedido com mais serviços/);
  const t=planoTrocarProfissional(s,{cliente:'Ana',data:TERCA,hora:'09:00',nova_profissional:'Nina'},now);
  assert.equal(t.plano.tipo,'trocar');
  assert.deepEqual([t.plano.linhas[0].para.hora,t.plano.linhas[0].para.profissional],['09:00','Nina']);
  assert.ok(planoRemarcar(s,{cliente:'Ana',data:TERCA,hora:'09:00',nova_profissional:'Nina'},now).plano,'remarcar só a profissional também pode');
  assert.equal(planoTrocarProfissional(s,{cliente:'Ana',data:TERCA,hora:'09:00',nova_hora:'14:00',nova_profissional:'Nina'},now).plano.linhas[0].para.hora,'09:00','trocar ignora horário novo');
  const quaseNaHora=Date.parse('2026-10-27T08:30:00-03:00');
  assert.equal(planoTrocarProfissional(s,{cliente:'Ana',data:TERCA,hora:'09:00',nova_profissional:'Nina'},quaseNaHora).plano.linhas[0].aviso,'começa em 30 min; confira com a profissional');
  aplicarPlano(s,t.plano,now);
  assert.deepEqual(s.appointments.map(a=>[a.staff_id,a.start]),[['P2',540],['P1',585]]);
  assert.equal(s.gaps.length,0,'trocar de profissional no mesmo horário não abre vaga');
  // Com o outro serviço do pedido cancelado, ela fica sozinha e pode mudar de horário.
  s.appointments[1].status='cancelled';
  assert.ok(planoRemarcar(s,{cliente:'Ana',data:TERCA,hora:'09:00',nova_hora:'14:00'},now).plano);
});

test('remarcar abre a vaga do horário antigo e o aviso traz o novo horário',()=>{
  const s=comAna();
  const {plano}=planoRemarcar(s,{cliente:'Ana',data:TERCA,nova_hora:'14:00'},now);
  assert.equal(plano.tipo,'remarcar');
  assert.deepEqual([plano.linhas[0].de.hora,plano.linhas[0].para.data,plano.linhas[0].para.hora,plano.linhas[0].para.profissional],['09:00',TERCA,'14:00','Lia']);
  assert.equal(plano.impacto,'1 cliente afetada. Valores não mudam.');
  const r=aplicarPlano(s,plano,now);
  assert.deepEqual([s.appointments[0].start,s.appointments[0].end,s.appointments[0].price],[840,885,30]);
  assert.deepEqual(s.gaps.map(g=>[g.start,g.staff_id,g.status]),[[540,'P1','open']]);
  assert.equal(textoDoLink(r.avisos[0].link),'Oi, Ana! Seu horário mudou para 27/10 às 14:00 com a Lia. Qualquer dúvida, é só responder. Equipe Santa Cor');
  // Outro dia e outra profissional de uma vez.
  const t=comAna();
  const q=planoRemarcar(t,{cliente:'Ana',data:TERCA,nova_data:'2026-10-28',nova_hora:'10:30',nova_profissional:'Nina'},now).plano;
  aplicarPlano(t,q,now);
  assert.deepEqual([t.appointments[0].date,t.appointments[0].start,t.appointments[0].staff_id],['2026-10-28',630,'P2']);
});

test('remarcar recusa sem mudança, horário ocupado, quem não faz o serviço e cliente ambígua',()=>{
  const s=comAna();const antes=JSON.stringify(s);
  assert.deepEqual(planoTrocarProfissional(s,{cliente:'Ana',data:TERCA,nova_profissional:'Lia'},now),{tipo:'resposta',texto:'A Ana Souza já está 27/10 às 09:00 com a Lia.'});
  assert.equal(planoRemarcar(s,{cliente:'Ana',data:TERCA,nova_data:TERCA,nova_hora:'09:00'},now).texto,'A Ana Souza já está 27/10 às 09:00 com a Lia.');
  assert.equal(planoRemarcar(s,{cliente:'Ana',data:TERCA},now).tipo,'pergunta','sem dizer para quando');
  assert.equal(planoTrocarProfissional(s,{cliente:'Ana',data:TERCA},now).tipo,'pergunta','sem dizer com quem');
  assert.match(planoTrocarProfissional(s,{cliente:'Ana',data:TERCA,nova_profissional:'Rafa'},now).texto,/Rafa não faz Manicure/);
  assert.equal(planoRemarcar(s,{cliente:'Ana',data:TERCA,nova_hora:'25:00'},now).tipo,'pergunta');
  assert.equal(planoRemarcar(s,{cliente:'Ana',data:TERCA,nova_data:'2026-13-01'},now).tipo,'pergunta');
  assert.equal(JSON.stringify(s),antes,'montar planos não grava nada');
  s.clients.push({id:'C9',name:'Carla',phone:''});
  s.appointments.push({...s.appointments[0],id:'A9',client_id:'C9',staff_id:'P2',start:840,end:885});
  const ocupado=planoRemarcar(s,{cliente:'Ana',data:TERCA,nova_hora:'14:00',nova_profissional:'Nina'},now);
  assert.equal(ocupado.tipo,'resposta');
  assert.match(ocupado.texto,/^O horário não está disponível\. Horários livres com a Nina em 27\/10: 09:00, 09:45/);
  assert.doesNotMatch(ocupado.texto,/14:00/);
  s.clients.push({id:'C2',name:'Ana Lima',phone:''});
  assert.match(planoRemarcar(s,{cliente:'Ana',data:TERCA,nova_hora:'14:00'},now).texto,/Achei mais de uma/);
  s.appointments[0].status='requested';
  assert.match(planoRemarcar(s,{cliente:'Ana Souza',data:TERCA,nova_hora:'14:00'},now).texto,/Aceitações/);
});

test('tirar uma linha antes de confirmar e cliente sem WhatsApp',()=>{
  const s=comFalta();s.clients[0].phone='';
  const {plano}=planoAusencia(s,{profissional:'Lia',data:TERCA},now);
  assert.equal(plano.impacto,'2 clientes afetadas · 1 sem WhatsApp no cadastro. Valores não mudam.');
  s.assistente={planos:[plano],pacotes:[]};
  const r=aplicarPlano(s,plano,now,[plano.linhas[0].id]);
  assert.deepEqual(s.appointments.map(a=>a.staff_id),['P1','P2'],'a linha tirada não muda');
  assert.deepEqual(r.avisos.map(v=>v.cliente),['Bia Lima']);
  assert.equal(s.assistente.planos.length,0,'o plano confirmado sai da lista');
  // Sem telefone, a cliente fica sem botão.
  const t=comFalta();t.clients[0].phone='';
  assert.deepEqual(aplicarPlano(t,planoAusencia(t,{profissional:'Lia',data:TERCA},now).plano,now).avisos.map(v=>v.cliente),['Bia Lima']);
});

test('desfazer volta o último pacote, menos o que mudou depois',()=>{
  const s=comAna();
  assert.equal(planoDesfazer(s,now).tipo,'resposta','sem nada para desfazer');
  aplicarPlano(s,planoTrocarProfissional(s,{cliente:'Ana',data:TERCA,nova_profissional:'Nina'},now).plano,now);
  const d=planoDesfazer(s,now).plano;
  assert.equal(d.tipo,'desfazer');
  assert.equal(d.linhas.length,1);
  assert.deepEqual([d.linhas[0].de.profissional,d.linhas[0].para.profissional,d.linhas[0].para.hora],['Nina','Lia','09:00']);
  const r=aplicarPlano(s,d,now);
  assert.equal(s.appointments[0].staff_id,'P1');
  assert.equal(s.gaps.length,0);
  assert.equal(textoDoLink(r.avisos[0].link),'Oi, Ana! Seu horário de 27/10 às 09:00 continua, mas agora com a Lia no lugar da Nina. Qualquer dúvida, é só responder. Equipe Santa Cor');
  assert.equal(planoDesfazer(s,now).tipo,'resposta','o que já foi desfeito não volta de novo');
  // Mexido depois do pacote: a linha fica sem volta e nada muda.
  const t=comAna();
  aplicarPlano(t,planoTrocarProfissional(t,{cliente:'Ana',data:TERCA,nova_profissional:'Nina'},now).plano,now);
  Object.assign(t.appointments[0],{start:600,end:645});
  const p=planoDesfazer(t,now).plano;
  assert.equal(p.linhas[0].para,null);
  assert.match(p.linhas[0].aviso,/mudou depois/);
  assert.deepEqual(aplicarPlano(t,p,now).avisos,[]);
  assert.deepEqual([t.appointments[0].start,t.appointments[0].staff_id],[600,'P2']);
});

test('desfazer uma remarcação fecha a vaga aberta e abre a do horário novo',()=>{
  const s=comAna();
  aplicarPlano(s,planoRemarcar(s,{cliente:'Ana',data:TERCA,nova_hora:'14:00'},now).plano,now);
  const r=aplicarPlano(s,planoDesfazer(s,now).plano,now);
  assert.deepEqual([s.appointments[0].start,s.appointments[0].end,s.appointments[0].staff_id],[540,585,'P1']);
  assert.deepEqual(s.gaps.map(g=>[g.start,g.status]),[[540,'closed'],[840,'open']]);
  assert.match(textoDoLink(r.avisos[0].link),/Seu horário mudou para 27\/10 às 09:00 com a Lia/);
  // Se o horário antigo foi ocupado depois, não dá para voltar.
  const t=comAna();
  aplicarPlano(t,planoRemarcar(t,{cliente:'Ana',data:TERCA,nova_hora:'14:00'},now).plano,now);
  t.clients.push({id:'C9',name:'Carla',phone:''});
  t.appointments.push({...t.appointments[0],id:'A9',client_id:'C9',start:540,end:585});
  const l=planoDesfazer(t,now).plano.linhas[0];
  assert.equal(l.para,null);
  assert.match(l.aviso,/não está mais livre/);
});
