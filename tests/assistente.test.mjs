import test from 'node:test';
import assert from 'node:assert/strict';
import {free,seedAdmin} from '../lib/flowagenda.mjs';
import {moverAtendimento} from '../lib/assistente/mover.mjs';
import {slots} from '../lib/agendamento.mjs';
import {dm,acharProfissional,acharCliente,acharAtendimento,consultarAgenda,consultarHorariosLivres,consultarHistoricoCliente,consultarResumoDia} from '../lib/assistente/consultas.mjs';
import {planoRemarcar,planoTrocarProfissional,planoAusencia,planoDesfazer,aplicarPlano} from '../lib/assistente/planos.mjs';
import {FERRAMENTAS,executarFerramenta,instrucoes} from '../lib/assistente/ferramentas.mjs';

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
  // Uma proposta pendente da Ana: mover a primeira linha a encerraria (e escreveria uma mensagem) na cópia.
  t.offers.push({id:'O1',client_id:'C1',staff_id:'P2',date:'2026-10-28',start:540,end:585,status:'pending',origin_id:'A1',gap_id:'G1',service_id:'S1'});
  const antesT=JSON.stringify(t);
  assert.throws(()=>aplicarPlano(t,p,now),/agenda mudou/);
  assert.deepEqual(t.appointments.map(a=>a.staff_id),['P1','P1','P2']);
  assert.equal(t.assistente,undefined);
  assert.equal(JSON.stringify(t),antesT,'nem a proposta, nem as mensagens, nem as vagas mudam');
  // Sem o conflito, a mesma proposta é encerrada de verdade.
  t.appointments.pop();aplicarPlano(t,planoAusencia(t,{profissional:'Lia',data:TERCA},now).plano,now);
  assert.equal(t.offers[0].status,'invalidated');assert.equal(t.messages.length,1);
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
  const nada=aplicarPlano(t,p,now);
  assert.deepEqual(nada.avisos,[]);
  assert.deepEqual([nada.pacoteId,nada.desfazivel],[null,false]);
  assert.deepEqual([t.appointments[0].start,t.appointments[0].staff_id],[600,'P2']);
  // Nenhuma linha voltou: o pacote não é marcado como desfeito e continua podendo ser desfeito.
  assert.equal(t.assistente.pacotes.length,1);assert.equal(t.assistente.pacotes[0].desfeito,undefined);
  assert.equal(planoDesfazer(t,now).plano.desfaz,t.assistente.pacotes[0].id);
});

test('desfazer pelo pacote: só o último que ainda não voltou, nunca um mais antigo',()=>{
  const s=comAna();
  s.clients.push({id:'C2',name:'Bia Lima',phone:''});
  s.appointments.push({...s.appointments[0],id:'A2',client_id:'C2',start:840,end:885});
  const a=aplicarPlano(s,planoTrocarProfissional(s,{cliente:'Ana',data:TERCA,nova_profissional:'Nina'},now).plano,now);
  assert.deepEqual([a.pacoteId,a.desfazivel],[a.pacote.id,true]);
  const b=aplicarPlano(s,planoTrocarProfissional(s,{cliente:'Bia',data:TERCA,nova_profissional:'Nina'},now).plano,now);
  const NAO=/Esta mudança não dá mais para desfazer por aqui/;
  assert.match(planoDesfazer(s,now,a.pacoteId).texto,NAO,'A não é o último');
  const pb=planoDesfazer(s,now,b.pacoteId).plano;assert.equal(pb.desfaz,b.pacoteId);
  const u=aplicarPlano(s,pb,now);
  assert.deepEqual([u.desfazivel,typeof u.pacoteId],[false,'string'],'desfazer não ganha botão de desfazer');
  assert.equal(s.assistente.pacotes.find(p=>p.id===b.pacoteId).desfeito,true);
  for(const k of [u.pacoteId,b.pacoteId])assert.match(planoDesfazer(s,now,k).texto,NAO);
  // Um plano de desfazer não vale duas vezes.
  assert.throws(()=>aplicarPlano(s,pb,now),NAO);
  assert.equal(planoDesfazer(s,now,a.pacoteId).plano.desfaz,a.pacoteId,'agora A é o último');
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

// Oráculo do jeito antigo: as trocas gravadas no cadastro inteiro (sem filtro de dias nem cache) e as sugestões
// calculadas com slots() sobre ele, na mesma regra de planoAusencia.
function sugestoesNoCadastroInteiro(s,plano,ausente){
  const r=structuredClone(s);aplicarPlano(r,plano,now);
  const semEla={...r,staff:r.staff.map(p=>p.id===ausente?{...p,active:false}:p)};
  return plano.linhas.filter(l=>!l.para).map(l=>{
    const a=s.appointments.find(x=>x.id===l.atendimento_id),grupo=s.services.find(v=>v.id===a.service_id).group,achados=[];
    for(let i=0;i<=3&&achados.length<2;i++){
      const dia=addDias(a.date,i),base=i?r:semEla;
      for(const x of slots(base,{items:[{service:a.service_id}],staff:{[grupo]:''}},dia,now,0))
        if((i||x.start>a.start)&&achados.length<2)achados.push(`${i?dm(dia)+' ':''}${x.time} (${base.staff.find(p=>p.id===x.plan[0].staff).name})`);
    }
    return achados.length?`sem vaga neste dia. Sugestões: ${achados.join(', ')}`:'sem vaga; oferecer a lista de espera';
  });
}
const addDias=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};

test('falta num dia cheio: o rascunho só com o dia e os 3 seguintes dá o mesmo plano que o cadastro inteiro',()=>{
  // Lia, Nina e Duda com 12 horários por dia em 10 semanas (histórico, a semana da falta e depois): ~1.200 atendimentos.
  const s=salao();
  s.staff.push({id:'P4',name:'Duda',active:true,start:480,end:1080,break_start:0,break_end:0,services:['S1','S2']});
  s.clients=Array.from({length:300},(_,i)=>({id:'C'+i,name:'Cliente '+i,phone:''}));
  // Horários que ficam livres: no dia da falta, Nina 10:30 e Duda 15:00 (as duas trocas); na quarta, Nina 09:00 e
  // 13:30 (esta com uma proposta pendente); a quinta cheia; na sexta, Duda 12:45. As sugestões precisam chegar à
  // sexta, então um rascunho que perdesse um dia da janela (ou as propostas) daria outro texto. Na outra semana,
  // fora da janela, tudo livre para a Nina; no histórico, uma em cada 17 cancelada.
  const livre=new Set([`${TERCA}|P2|630`,`${TERCA}|P4|900`,'2026-10-28|P2|540','2026-10-28|P2|810','2026-10-30|P4|765']);
  let n=0;
  for(let d=-56;d<=13;d++){
    const dia=addDias(TERCA,d),w=new Date(dia+'T12:00:00Z').getUTCDay();if(w<2||w>5)continue;
    for(const pro of ['P1','P2','P4'])for(let k=0;k<12;k++){
      const start=540+45*k;
      if(livre.has(`${dia}|${pro}|${start}`)||(d>=7&&pro==='P2'))continue;
      s.appointments.push({id:'A'+n,client_id:'C'+(n%300),service_id:k%3?'S1':'S2',staff_id:pro,date:dia,start,end:start+45,price:30,status:d<0&&n%17===0?'cancelled':'booked',attendance:'unknown',reminded:false,result:null});n++;
    }
  }
  // A Lia às 12:45 faz SPA Relaxante, que só ela faz: o cache por serviço não pode emprestar os horários da manicure.
  s.appointments.find(a=>a.date===TERCA&&a.staff_id==='P1'&&a.start===765).service_id='S5';
  s.offers.push({id:'O1',client_id:'C1',staff_id:'P2',date:'2026-10-28',start:810,end:855,status:'pending',gap_id:'G1',origin_id:'A0',service_id:'S1'});
  assert.ok(s.appointments.length>=1200,'cadastro grande');
  const {plano}=planoAusencia(s,{profissional:'Lia',data:TERCA},now);
  const movidas=plano.linhas.filter(l=>l.para),semVaga=plano.linhas.filter(l=>!l.para);
  assert.deepEqual(movidas.map(l=>[l.de.hora,l.para.profissional]),[['10:30','Nina'],['15:00','Duda']]);
  assert.equal(semVaga.length,10);
  // As trocas são as mesmas do cadastro inteiro: cada uma cabe nele sem conflito, e nenhuma linha sem vaga tinha alguém livre.
  const r=structuredClone(s);aplicarPlano(r,plano,now);
  for(const l of semVaga){const a=s.appointments.find(x=>x.id===l.atendimento_id);
    assert.ok(!['P2','P4'].some(k=>free(r,a.client_id,k,a.date,a.start,a.end,a.id)),'ninguém livre no cadastro inteiro');}
  assert.deepEqual(semVaga.map(l=>l.aviso),sugestoesNoCadastroInteiro(s,plano,'P1'));
  for(const l of semVaga)assert.equal(l.aviso,l.de.hora==='12:45'?'sem vaga; oferecer a lista de espera':'sem vaga neste dia. Sugestões: 28/10 09:00 (Nina), 30/10 12:45 (Duda)');
});

test('falta: cliente com duas linhas recebe um aviso só, com as duas frases',()=>{
  // Ana com Manicure 09:00 e Pedicure 09:45 com a Lia; a Nina está livre às 09:00 e ocupada às 09:45.
  const s=comFalta();
  Object.assign(s.appointments[1],{client_id:'C1',start:585,end:630});
  s.clients.push({id:'C9',name:'Carla',phone:''});
  s.appointments.push({...s.appointments[1],id:'A9',client_id:'C9',staff_id:'P2'});
  const {plano}=planoAusencia(s,{profissional:'Lia',data:TERCA},now);
  assert.deepEqual(plano.linhas.map(l=>l.para?.profissional??null),['Nina',null]);
  assert.equal(plano.impacto,'1 cliente afetada. Valores não mudam.');
  const r=aplicarPlano(s,plano,now);
  assert.equal(r.avisos.length,1,'um botão por cliente');
  assert.equal(r.avisos[0].cliente,'Ana Souza');
  const texto=textoDoLink(r.avisos[0].link);
  assert.match(texto,/continua, mas agora com a Nina no lugar da Lia/);
  assert.match(texto,/Quer que a gente procure outro horário/);
  assert.equal(texto,'Oi, Ana! Seu horário de 27/10 às 09:00 continua, mas agora com a Nina no lugar da Lia. A Lia não vai poder atender 27/10 às 09:45. Quer que a gente procure outro horário para você? Qualquer dúvida, é só responder. Equipe Santa Cor');
  assert.equal(texto.split('Oi,').length-1,1);
  assert.equal(texto.split('Equipe Santa Cor').length-1,1);
});

// ---- Ferramentas do Gemini e despachante ----
const EXEMPLOS={
  consultar_agenda:{data:TERCA},
  consultar_horarios_livres:{data:TERCA,servico:'Manicure'},
  buscar_cliente:{busca:'Ana'},
  consultar_historico_cliente:{cliente:'Ana'},
  consultar_resumo_dia:{data:TERCA},
  consultar_estoque:{busca:'painel da parede'},
  remarcar_atendimento:{cliente:'Ana',data:TERCA,nova_hora:'14:00'},
  trocar_profissional:{cliente:'Ana',data:TERCA,nova_profissional:'Nina'},
  registrar_ausencia_profissional:{profissional:'Lia',data:TERCA},
  desfazer_ultima_acao:{},
};
const SEM_FUNCAO='Ainda não sei fazer isso por aqui. Você encontra em Agenda.';

test('ferramentas: todas as declaradas têm executor e o JSON é enxuto',()=>{
  assert.deepEqual(FERRAMENTAS.map(f=>f.name).sort(),Object.keys(EXEMPLOS).sort());
  for(const f of FERRAMENTAS){
    if(f.parameters){
      assert.equal(f.parameters.type,'OBJECT');
      assert.ok(Object.keys(f.parameters.properties).length>0,f.name+': properties vazio');
    }
    for(const p of Object.values(f.parameters?.properties||{}))assert.equal(p.type,'STRING');
    const r=executarFerramenta(comAna(),f.name,EXEMPLOS[f.name],now);
    assert.notEqual(r.texto,SEM_FUNCAO,f.name);
    assert.ok(['resposta','pergunta','plano'].includes(r.tipo),f.name);
  }
  assert.ok(JSON.stringify(FERRAMENTAS).length<6000);
});

test('ferramentas: nome desconhecido e data inválida',()=>{
  const s=comAna();
  assert.deepEqual(executarFerramenta(s,'apagar_tudo',{},now),{tipo:'resposta',texto:SEM_FUNCAO});
  for(const nome of ['consultar_agenda','consultar_horarios_livres','remarcar_atendimento','registrar_ausencia_profissional']){
    for(const data of ['amanhã','2026-13-01']){
      const r=executarFerramenta(s,nome,{...EXEMPLOS[nome],data},now);
      assert.equal(r.tipo,'pergunta',nome);assert.match(r.texto,/qual dia/i);
    }
  }
  const h=executarFerramenta(s,'remarcar_atendimento',{cliente:'Ana',data:TERCA,nova_hora:'duas da tarde'},now);
  assert.equal(h.tipo,'pergunta');assert.match(h.texto,/hora/i);
  const longo=executarFerramenta(s,'buscar_cliente',{busca:'a'.repeat(101)},now);
  assert.equal(longo.tipo,'pergunta');
  assert.equal(executarFerramenta(s,'consultar_resumo_dia',{},now).tipo,'resposta','data é opcional no resumo');
});

test('ferramentas: ausência guarda o plano, descarta vencidos e mantém 5',()=>{
  const s=comFalta();
  const r=executarFerramenta(s,'registrar_ausencia_profissional',{profissional:'Lia',data:TERCA},now);
  assert.equal(r.tipo,'plano');
  assert.equal(s.assistente.planos.at(-1),r.plano);
  const velho={id:'Qv',validoAte:now-1};s.assistente.planos.unshift(velho);
  for(let i=0;i<6;i++)executarFerramenta(s,'registrar_ausencia_profissional',{profissional:'Lia',data:TERCA},now+i);
  assert.equal(s.assistente.planos.length,5);
  assert.ok(!s.assistente.planos.includes(velho));
  assert.ok(Array.isArray(s.assistente.pacotes));
});

test('ferramentas: buscar_cliente responde com a ficha ou pergunta quando há dúvida',()=>{
  const s=comAna();s.clients.push({id:'C2',name:'Ana Lima',phone:''});
  const dup=executarFerramenta(s,'buscar_cliente',{busca:'Ana'},now);
  assert.equal(dup.tipo,'pergunta');assert.match(dup.texto,/mais de uma/);
  const um=executarFerramenta(s,'buscar_cliente',{busca:'Souza'},now);
  assert.equal(um.tipo,'resposta');assert.match(um.texto,/Ana Souza/);
});

test('ferramentas: chaves extras vindas do modelo não passam',()=>{
  const s=comAna();
  const r=executarFerramenta(s,'trocar_profissional',{cliente:'Ana',data:TERCA,nova_profissional:'Nina',nova_hora:'15:00',nova_data:'2026-10-28'},now);
  assert.equal(r.tipo,'plano');assert.equal(r.plano.linhas[0].para.hora,'09:00');assert.equal(r.plano.linhas[0].para.data,TERCA);
});

test('instruções: salão, dia da semana, data e equipe',()=>{
  const t=instrucoes(salao(),now);
  assert.match(t,/^Você é o assistente do painel da gerência da Santa Cor\. Hoje é segunda-feira, 2026-10-26\. Equipe: Lia, Nina, Rafa\. /);
  assert.match(t,/mudanças viram um plano que a gerência confirma\.$/);
});

test('estoque: busca por lugar ou item, avisa o que repor e o que não achou',()=>{
  const s=comAna();
  s.stock=[
    {id:'K1',name:'Esmalte vermelho',place:'Painel da parede',qty:2,min:3},
    {id:'K2',name:'Esmalte nude',place:'Painel da parede',qty:8,min:0},
    {id:'K3',name:'Acetona',place:'Armário',qty:5,min:1},
  ];
  const lugar=executarFerramenta(s,'consultar_estoque',{busca:'painel da parede da loja'},now);
  assert.equal(lugar.tipo,'resposta');
  assert.match(lugar.texto,/^2 itens no estoque, 1 para repor\./);
  assert.match(lugar.texto,/Painel da parede: Esmalte vermelho \(2, repor\), Esmalte nude \(8\)/);
  assert.doesNotMatch(lugar.texto,/Acetona/);
  assert.match(executarFerramenta(s,'consultar_estoque',{busca:'acetona'},now).texto,/Armário: Acetona \(5\)/);
  assert.match(executarFerramenta(s,'consultar_estoque',{},now).texto,/^3 itens/);
  assert.match(executarFerramenta(s,'consultar_estoque',{busca:'algodão'},now).texto,/Não achei "algodão".*Lugares cadastrados: Painel da parede, Armário\./);
  delete s.stock;
  assert.match(executarFerramenta(s,'consultar_estoque',{},now).texto,/Ainda não há itens/);
});
