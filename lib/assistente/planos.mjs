// Planos do assistente: toda mudança na agenda vira um plano (o cartão de confirmação) montado sem gravar
// nada. Só aplicarPlano grava, e grava tudo ou nada: se a agenda mudou desde o plano, nenhuma linha passa.
import {at,clock,free,get,id,nameKey,phoneKey,today} from '../flowagenda.mjs';
import {itemName,slots} from '../agendamento.mjs';
import {moverAtendimento} from './mover.mjs';
import {acharAtendimento,acharCliente,acharProfissional,diaValido,dm,pergunta,resposta} from './consultas.mjs';

const VALIDADE=600000,MAX_LINHAS=15,MAX_PACOTES=20;
const AGENDA_MUDOU='A agenda mudou desde o plano. Peça de novo para eu refazer.';
const fail=texto=>{throw Error(texto)};
const horaValida=h=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(h??''));
const minutos=h=>Number(h.slice(0,2))*60+Number(h.slice(3,5));
const addDias=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
const SEMANA=['dom','seg','ter','qua','qui','sex','sáb'];
const diaSemana=d=>SEMANA[new Date(d+'T12:00:00Z').getUTCDay()];
const plural=(n,um,varios)=>`${n} ${n===1?um:varios}`;
const posicao=a=>({date:a.date,start:a.start,end:a.end,staff_id:a.staff_id});
const mesmaPosicao=(a,p)=>a.date===p.date&&a.start===p.start&&a.end===p.end&&a.staff_id===p.staff_id;
const nomePro=(s,k)=>s.staff.find(p=>p.id===k)?.name||'sem profissional';
const clienteDe=(s,a)=>s.clients.find(c=>c.id===a.client_id);
// Número que dá para abrir no wa.me; sem ele a cliente fica sem botão de aviso.
const zap=c=>{const f=phoneKey(c?.phone);return f.length>=10?f:'';};

// Cópia rasa só do que moverAtendimento mexe: serve para testar mudanças sem tocar no cadastro.
const rascunho=s=>({...s,appointments:s.appointments.map(a=>({...a})),offers:s.offers.map(o=>({...o})),messages:[...s.messages],gaps:[...s.gaps]});
const tentar=(r,a,destino,now)=>{try{moverAtendimento(r,a.id,destino,{abrirVaga:false},now);return '';}catch(e){return e.message;}};

// O carrinho de um atendimento já marcado, com a mesma opção (a escova longa dura mais que a curta).
function carrinho(s,a,staff=''){
  const svc=get(s,'services',a.service_id),item={service:svc.id};
  if(svc.variants?.length)item.variant=Math.max(0,svc.variants.findIndex(v=>v.name===a.variant));
  return {items:[item],staff:{[svc.group]:staff}};
}
const livres=(s,a,date,staff,now)=>{try{return slots(s,carrinho(s,a,staff),date,now,0);}catch{return [];}};

const emBreve=(quando,now)=>{const m=Math.round((at(quando)-now)/60000);return m<60?`começa em ${m} min; confira com a profissional`:'';};
const para=(s,date,start,staff)=>({data:date,hora:clock(start),staff_id:staff,profissional:nomePro(s,staff)});
// "posicao" é a foto do atendimento na hora do plano: no Confirmar, qualquer diferença recusa o plano inteiro.
const linha=(s,a,destino,extra={})=>({id:id('L'),atendimento_id:a.id,cliente:clienteDe(s,a)?.name||'Cliente',servico:itemName(s,a),
  de:{data:a.date,hora:clock(a.start),profissional:nomePro(s,a.staff_id)},para:destino,posicao:posicao(a),...extra});

function montar(s,tipo,titulo,linhas,avisos,now){
  const contato=linhas.filter(l=>l.para||tipo==='ausencia');
  const clientes=[...new Set(contato.map(l=>get(s,'appointments',l.atendimento_id).client_id))];
  const semZap=clientes.filter(k=>!zap(s.clients.find(c=>c.id===k))).length;
  const impacto=`${plural(clientes.length,'cliente afetada','clientes afetadas')}${semZap?` · ${semZap} sem WhatsApp no cadastro`:''}. Valores não mudam.`;
  return {plano:{id:id('Q'),tipo,titulo,criado:now,validoAte:now+VALIDADE,linhas,impacto,avisos}};
}

// Remarcar e trocar de profissional: um atendimento, uma linha. Mudar só a profissional não abre vaga.
function planoMover(s,{cliente,data,hora,nova_data,nova_hora,nova_profissional},tipo,now){
  if(!diaValido(data))return pergunta('Qual é o dia do atendimento?');
  if(hora&&!horaValida(hora))return pergunta('Que horas é o atendimento?');
  if(nova_data&&!diaValido(nova_data))return pergunta('Para qual dia?');
  if(nova_hora&&!horaValida(nova_hora))return pergunta('Para que horas?');
  if(tipo==='trocar'&&!nova_profissional)return pergunta('Com qual profissional?');
  const rc=acharCliente(s,cliente);if(rc.pergunta)return pergunta(rc.pergunta);
  const ra=acharAtendimento(s,{cliente:rc.cliente,data,hora});if(ra.pergunta)return pergunta(ra.pergunta);
  const c=rc.cliente,a=ra.atendimento;
  if(!nova_data&&!nova_hora&&!nova_profissional)return pergunta(`Para quando a ${c.name} quer mudar?`);
  if(a.status==='requested')return resposta('Este horário ainda é um pedido em Aceitações. Aceite ou recuse por lá antes de mudar.');
  if(a.result||at(a)<=now)return resposta('Este atendimento não pode ser mudado.');
  let staff=a.staff_id;
  if(nova_profissional){const rp=acharProfissional(s,nova_profissional);if(rp.pergunta)return pergunta(rp.pergunta);staff=rp.pro.id;}
  const date=nova_data||a.date,start=nova_hora?minutos(nova_hora):a.start,mudouHorario=date!==a.date||start!==a.start;
  // Sem mudança não tem plano: mover para o mesmo lugar abriria uma vaga num horário que continua ocupado.
  if(!mudouHorario&&staff===a.staff_id)return resposta(`A ${c.name} já está ${dm(a.date)} às ${clock(a.start)} com a ${nomePro(s,a.staff_id)}.`);
  const juntos=a.order?s.appointments.filter(x=>x.order===a.order&&x.id!==a.id&&['booked','requested'].includes(x.status)):[];
  if(mudouHorario&&juntos.length)return resposta(`Este atendimento faz parte de um pedido com mais serviços (${[a,...juntos].sort((x,y)=>x.start-y.start).map(x=>itemName(s,x)).join(', ')}). Para mudar o horário, mude o pedido inteiro pela Agenda do painel.`);
  const erro=tentar(rascunho(s),a,{date,start,staff_id:staff},now);
  if(erro){
    const outros=erro==='O horário não está disponível.'?livres(s,a,date,staff,now).slice(0,8).map(x=>x.time):[];
    return resposta(erro+(outros.length?` Horários livres com a ${nomePro(s,staff)} em ${dm(date)}: ${outros.join(', ')}.`:''));
  }
  const l=linha(s,a,para(s,date,start,staff),{abrirVaga:mudouHorario});
  const breve=emBreve(a,now)||emBreve({date,start},now);if(breve)l.aviso=breve;
  const titulo=mudouHorario
    ?`Remarcar ${c.name}: ${dm(a.date)} ${clock(a.start)} → ${dm(date)} ${clock(start)}${staff!==a.staff_id?` com a ${nomePro(s,staff)}`:''}`
    :`${c.name} ${dm(a.date)} ${clock(a.start)}: ${nomePro(s,a.staff_id)} → ${nomePro(s,staff)}`;
  return montar(s,tipo,titulo,[l],[],now);
}
export const planoRemarcar=(s,args={},now=Date.now())=>planoMover(s,args,'remarcar',now);
// Trocar é só a profissional, no mesmo dia e hora, mesmo que venha um horário junto.
export const planoTrocarProfissional=(s,{cliente,data,hora,nova_profissional}={},now=Date.now())=>planoMover(s,{cliente,data,hora,nova_profissional},'trocar',now);

// A profissional que faltou pode já ter sido marcada como inativa (para sumir do site): o nome exato ainda vale.
function acharAusente(s,nome){
  const r=acharProfissional(s,nome);if(r.pro)return r;
  const k=nameKey(nome),inativas=k?s.staff.filter(p=>!p.removed&&p.active===false&&nameKey(p.name)===k):[];
  return inativas.length===1?{pro:inativas[0]}:r;
}

// Até 2 horários para quem ficou sem vaga: no mesmo dia mais tarde (sem a que faltou), depois nos 3 dias seguintes.
function sugestoes(semEla,comEla,a,now){
  const achados=[];
  for(let i=0;i<=3&&achados.length<2;i++){
    const dia=addDias(a.date,i),base=i?comEla:semEla;
    for(const x of livres(base,a,dia,'',now))if((i||x.start>a.start)&&achados.length<2)achados.push(`${i?dm(dia)+' ':''}${x.time} (${nomePro(base,x.plan[0].staff)})`);
  }
  return achados;
}

// Spec 4.1: cada horário da que faltou vai, no mesmo horário, para outra que faz o serviço e está livre
// (a preferida da cliente primeiro, depois a com menos horários no dia). Quem não tem ninguém livre NÃO
// é movida: a linha fica sem vaga, com sugestões para a gerência combinar com a cliente.
// Aplicar não abre vaga: o horário da que faltou não pode ser oferecido a outras clientes.
export function planoAusencia(s,{profissional,data}={},now=Date.now()){
  if(!diaValido(data))return pergunta('Qual dia ela vai faltar?');
  const rp=acharAusente(s,profissional);if(rp.pergunta)return pergunta(rp.pergunta);
  const aus=rp.pro;
  const todos=s.appointments.filter(a=>a.staff_id===aus.id&&a.date===data&&a.status==='booked'&&!a.result&&at(a)>now).sort((a,b)=>a.start-b.start||a.end-b.end);
  if(!todos.length)return resposta(`A ${aus.name} não tem horários marcados em ${dm(data)}.`);
  // As trocas já decididas entram no rascunho, para a linha seguinte não pôr duas clientes no mesmo horário.
  const r=rascunho(s),equipe=s.staff.filter(p=>p.active!==false&&!p.removed&&p.id!==aus.id);
  const noDia=k=>r.appointments.filter(x=>x.date===data&&x.staff_id===k&&x.status==='booked').length;
  const linhas=todos.slice(0,MAX_LINHAS).map(a=>{
    const preferida=clienteDe(s,a)?.preferred;
    const quem=equipe.filter(p=>p.services.includes(a.service_id)&&free(r,a.client_id,p.id,a.date,a.start,a.end,a.id))
      .map(p=>({p,n:noDia(p.id)})).sort((x,y)=>Number(y.p.id===preferida)-Number(x.p.id===preferida)||x.n-y.n)[0]?.p;
    if(!quem)return linha(s,a,null);
    moverAtendimento(r,a.id,{staff_id:quem.id},{abrirVaga:false},now);
    const l=linha(s,a,para(s,a.date,a.start,quem.id)),breve=emBreve(a,now);if(breve)l.aviso=breve;
    return l;
  });
  const semEla={...r,staff:r.staff.map(p=>p.id===aus.id?{...p,active:false}:p)};
  for(const l of linhas)if(!l.para){
    const sug=sugestoes(semEla,r,get(s,'appointments',l.atendimento_id),now);
    l.aviso=sug.length?`sem vaga ${data===today(now)?'hoje':'neste dia'}. Sugestões: ${sug.join(', ')}`:'sem vaga; oferecer a lista de espera';
  }
  const avisos=[];
  if(aus.active!==false)avisos.push(`A ${aus.name} continua aparecendo no agendamento do site neste dia. Para tirar, marque-a como inativa em Equipe e serviços.`);
  if(todos.length>MAX_LINHAS)avisos.push(`Mostrei os ${MAX_LINHAS} primeiros horários de ${todos.length}. Depois de confirmar, peça de novo para ver o resto.`);
  const pedidos=new Set(s.appointments.filter(a=>a.staff_id===aus.id&&a.date===data&&a.status==='requested'&&at(a)>now).map(a=>a.order||a.id)).size;
  if(pedidos)avisos.push(`A ${aus.name} também tem ${plural(pedidos,'pedido','pedidos')} neste dia esperando em Aceitações.`);
  return montar(s,'ausencia',`Redistribuir a agenda da ${aus.name} · ${diaSemana(data)} ${dm(data)}`,linhas,avisos,now);
}

// Volta o último pacote confirmado que ainda não foi desfeito. O que mudou depois dele fica como está.
export function planoDesfazer(s,now=Date.now()){
  const pacote=(s.assistente?.pacotes||[]).find(p=>!p.desfeito&&!p.desfaz);
  if(!pacote)return resposta('Não há nenhuma mudança do assistente para desfazer.');
  const r=rascunho(s);
  const linhas=pacote.mudancas.filter(m=>s.appointments.some(a=>a.id===m.atendimento_id)).map(m=>{
    const a=get(s,'appointments',m.atendimento_id);
    // Sem "posicao": linha que não volta não é conferida no Confirmar.
    const fica=aviso=>{const l=linha(s,a,null,{aviso});delete l.posicao;return l;};
    if(a.status!=='booked'||a.result||!mesmaPosicao(a,m.depois))return fica('mudou depois do assistente; confira na Agenda');
    if(at(a)<=now)return fica('o horário já passou');
    const v=m.antes;
    if(tentar(r,a,{date:v.date,start:v.start,staff_id:v.staff_id},now))return fica('o horário de antes não está mais livre; confira na Agenda');
    return linha(s,a,para(s,v.date,v.start,v.staff_id),{abrirVaga:v.date!==a.date||v.start!==a.start,...(m.vaga?{fecharVaga:m.vaga}:{})});
  });
  const {plano}=montar(s,'desfazer',`Desfazer: ${pacote.titulo}`,linhas,[],now);
  return {plano:{...plano,desfaz:pacote.id}};
}

// A frase de cada linha: sem vaga, troca de profissional no mesmo horário ou remarcação.
function frase({de,para:p}){
  if(!p)return `A ${de.profissional} não vai poder atender ${dm(de.data)} às ${de.hora}. Quer que a gente procure outro horário para você?`;
  if(p.data===de.data&&p.hora===de.hora)return `Seu horário de ${dm(de.data)} às ${de.hora} continua, mas agora com a ${p.profissional} no lugar da ${de.profissional}.`;
  return `Seu horário mudou para ${dm(p.data)} às ${p.hora} com a ${p.profissional}.`;
}
// Um botão por cliente afetada (spec 4.1): as linhas dela viram uma mensagem só, com um "Oi" e uma assinatura,
// para ela não receber dois avisos que parecem se contradizer.
function avisosPorCliente(s,linhas){
  const porCliente=new Map();
  for(const l of linhas){const k=get(s,'appointments',l.atendimento_id).client_id;porCliente.set(k,[...(porCliente.get(k)||[]),l]);}
  return [...porCliente].map(([k,ls])=>{
    const c=s.clients.find(x=>x.id===k),fone=zap(c);if(!fone)return null;
    const partes=[`Oi, ${c.name.trim().split(/\s+/)[0]}!`,...ls.map(frase)];
    if(ls.some(l=>l.para))partes.push('Qualquer dúvida, é só responder.');
    partes.push(`Equipe ${s.salon?.name||''}`.trim());
    return {cliente:c.name,link:`https://wa.me/${fone}?text=${encodeURIComponent(partes.join(' '))}`};
  }).filter(Boolean);
}

// Grava o plano numa cópia e só passa a cópia para o cadastro se todas as linhas deram certo.
// semLinhas: ids das linhas que a gerência tirou do cartão antes de confirmar.
export function aplicarPlano(s,plano,now=Date.now(),semLinhas=[]){
  if(!plano||!(now<=plano.validoAte))fail('Este plano venceu. Peça de novo.');
  const tirar=new Set(semLinhas),linhas=plano.linhas.filter(l=>!tirar.has(l.id));
  const r=structuredClone(s),mudancas=[];
  for(const l of linhas){
    if(!l.posicao)continue;
    const a=r.appointments.find(x=>x.id===l.atendimento_id);
    if(!a||a.status!=='booked'||a.result||!mesmaPosicao(a,l.posicao))fail(AGENDA_MUDOU);
    if(!l.para)continue;
    const vagas=r.gaps.length;let mov;
    try{mov=moverAtendimento(r,a.id,{date:l.para.data,start:minutos(l.para.hora),staff_id:l.para.staff_id},{abrirVaga:!!l.abrirVaga},now);}catch{fail(AGENDA_MUDOU);}
    mudancas.push({atendimento_id:a.id,...mov,...(r.gaps.length>vagas?{vaga:r.gaps.at(-1).id}:{})});
    // Desfazer uma remarcação: a vaga aberta no horário de antes deixa de existir, porque a cliente voltou para ele.
    const g=l.fecharVaga&&r.gaps.find(g=>g.id===l.fecharVaga&&g.status==='open');if(g)g.status='closed';
  }
  const ast=r.assistente??={};ast.planos??=[];ast.pacotes??=[];
  const pacote={id:id('K'),criado:now,titulo:plano.titulo,mudancas,...(plano.desfaz?{desfaz:plano.desfaz}:{})};
  if(plano.desfaz){const alvo=ast.pacotes.find(p=>p.id===plano.desfaz);if(alvo)alvo.desfeito=true;}
  if(mudancas.length)ast.pacotes=[pacote,...ast.pacotes].slice(0,MAX_PACOTES);
  ast.planos=ast.planos.filter(p=>p.id!==plano.id);
  r.events.unshift({id:id('E'),text:'Assistente, confirmado pela gerência: '+plano.titulo,created:now});r.events=r.events.slice(0,300);
  const avisos=avisosPorCliente(r,linhas.filter(l=>l.para||plano.tipo==='ausencia'));
  Object.assign(s,r);
  return {pacote,avisos};
}
