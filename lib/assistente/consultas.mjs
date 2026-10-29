// Consultas do assistente do painel: só leem o cadastro e devolvem texto pronto. Nada aqui grava.
// As funções "achar..." só devolvem um resultado quando ele é único; com dúvida devolvem uma pergunta,
// para o assistente nunca escolher sozinho entre duas pessoas com nome parecido.
import {at,clock,nameKey,summary,today} from '../flowagenda.mjs';
import {financeView} from '../finance-core.mjs';
import {supportView} from '../support-core.mjs';
import {itemName,slots} from '../agendamento.mjs';

const abertos=['booked','requested'];
export const dm=data=>`${String(data).slice(8,10)}/${String(data).slice(5,7)}`;
const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const plural=(n,um,varios)=>`${n} ${n===1?um:varios}`;
// Data que vem do modelo pode ser bem formada e impossível (2026-13-01): Date inválida não pode estourar.
export const diaValido=d=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(d)))return false;
  const x=new Date(d+'T12:00:00Z');
  return !isNaN(x)&&x.toISOString().slice(0,10)===d;
};
export const pergunta=texto=>({tipo:'pergunta',texto});
export const resposta=texto=>({tipo:'resposta',texto});
const soDigitos=v=>String(v||'').replace(/\D/g,'');
const final=c=>soDigitos(c.phone).length>=4?` (final ${soDigitos(c.phone).slice(-4)})`:'';
const nomeCliente=(s,a)=>s.clients.find(c=>c.id===a.client_id)?.name||'Cliente';
const nomePro=(s,a)=>s.staff.find(p=>p.id===a.staff_id)?.name||'sem profissional';

// Profissional por nome: o nome exato ganha de "começa com"; com mais de uma possível, pergunta.
export function acharProfissional(s,nome){
  const equipe=s.staff.filter(p=>p.active!==false&&!p.removed),k=nameKey(nome);
  const lista=ps=>ps.map(p=>p.name).join(', ');
  for(const tipo of [p=>nameKey(p.name)===k,p=>nameKey(p.name).startsWith(k)]){
    const achadas=k?equipe.filter(tipo):[];
    if(achadas.length===1)return {pro:achadas[0]};
    if(achadas.length>1)return {pergunta:`Qual delas? ${lista(achadas)}`};
  }
  return {pergunta:`Não achei a profissional "${String(nome||'').trim()}". A equipe é: ${lista(equipe)}.`};
}

// Cliente por parte do nome e/ou pelo menos 4 dígitos do celular ("Ana 0002" junta os dois filtros).
export function acharCliente(s,busca){
  const texto=String(busca||''),digitos=soDigitos(texto);
  const nome=nameKey(texto).replace(/[^a-z\s]/g,' ').replace(/\s+/g,' ').trim(),porNumero=digitos.length>=4;
  const achadas=nome||porNumero?s.clients.filter(c=>(!nome||nameKey(c.name).includes(nome))&&(!porNumero||soDigitos(c.phone).includes(digitos))):[];
  if(achadas.length===1)return {cliente:achadas[0]};
  if(!achadas.length)return {pergunta:`Não achei a cliente "${texto.trim()}".`};
  const resto=achadas.length-5;
  return {pergunta:`Achei mais de uma: ${achadas.slice(0,5).map(c=>c.name+final(c)).join(', ')}${resto>0?` (e mais ${resto})`:''}. Qual?`};
}

// Atendimento (marcado ou pedido) da cliente num dia; a hora "HH:MM" desempata quando há mais de um.
export function acharAtendimento(s,{cliente,data,hora}){
  const c=typeof cliente==='string'?s.clients.find(x=>x.id===cliente):cliente;
  if(!c)return {pergunta:'Não achei essa cliente.'};
  const doDia=s.appointments.filter(a=>a.client_id===c.id&&a.date===data&&abertos.includes(a.status)).sort((a,b)=>a.start-b.start);
  if(!doDia.length)return {pergunta:`${c.name} não tem atendimento em ${dm(data)}.`};
  const certos=hora?doDia.filter(a=>clock(a.start)===hora):doDia;
  if(!certos.length)return {pergunta:`${c.name} não tem atendimento às ${hora} em ${dm(data)}. Os horários dela são: ${doDia.map(a=>clock(a.start)).join(', ')}.`};
  if(certos.length===1)return {atendimento:certos[0]};
  return {pergunta:`${c.name} tem mais de um atendimento em ${dm(data)}: ${certos.map(a=>`${clock(a.start)} ${itemName(s,a)}`).join(', ')}. Qual?`};
}

// A profissional pode vir como código (o que a tela guarda) ou como nome (o que a gerente digita).
const profissional=(s,quem)=>{const p=s.staff.find(x=>x.id===quem);return p?{pro:p}:acharProfissional(s,quem);};

export function consultarAgenda(s,{data,profissional:quem}){
  if(!diaValido(data))return pergunta('Qual dia você quer ver?');
  let pro=null;
  if(quem){const r=profissional(s,quem);if(r.pergunta)return pergunta(r.pergunta);pro=r.pro;}
  const lista=s.appointments.filter(a=>a.date===data&&abertos.includes(a.status)&&(!pro||a.staff_id===pro.id)).sort((a,b)=>a.start-b.start||a.end-b.end);
  if(!lista.length)return resposta(`Nenhum atendimento em ${dm(data)}.`);
  const linhas=lista.map(a=>`${clock(a.start)} ${nomeCliente(s,a)} · ${itemName(s,a)} · ${nomePro(s,a)}${a.status==='requested'?' · pedido a aceitar':''}`);
  return resposta(`Agenda de ${dm(data)}${pro?` com ${pro.name}`:''}:\n${linhas.join('\n')}`);
}

// Serviço (nunca adicional) pelo nome: exato, depois "começa com", depois "contém".
function acharServico(s,nome){
  const k=nameKey(nome),principais=s.services.filter(v=>!v.addon);
  for(const tipo of [v=>nameKey(v.name)===k,v=>nameKey(v.name).startsWith(k),v=>nameKey(v.name).includes(k)]){
    const achados=k?principais.filter(tipo):[];
    if(achados.length===1)return {svc:achados[0]};
    if(achados.length>1)return {pergunta:`Qual serviço? ${achados.map(v=>v.name).join(', ')}`};
  }
  return {pergunta:`Não achei o serviço "${String(nome||'').trim()}".`};
}

// Mesma conta da página de agendamento (slots), só que sem antecedência mínima: quem pergunta é a gerência.
export function consultarHorariosLivres(s,{data,servico,profissional:quem,opcao},now=Date.now()){
  if(!diaValido(data))return pergunta('Qual dia você quer ver?');
  const achado=acharServico(s,servico);if(achado.pergunta)return pergunta(achado.pergunta);
  const svc=achado.svc;
  let pro=null;
  if(quem){
    const r=profissional(s,quem);if(r.pergunta)return pergunta(r.pergunta);
    pro=r.pro;if(!pro.services.includes(svc.id))return pergunta(`${pro.name} não faz ${svc.name}.`);
  }
  const item={service:svc.id};let nome=svc.name;
  if(svc.variants?.length){
    const k=nameKey(opcao),i=k?svc.variants.findIndex(v=>nameKey(v.name).includes(k)):-1;
    if(i<0)return pergunta(`Qual opção de ${svc.name}? ${svc.variants.map(v=>v.name).join(', ')}`);
    item.variant=i;nome+=` (${svc.variants[i].name})`;
  }
  const horarios=slots(s,{items:[item],staff:{[svc.group]:pro?.id||''}},data,now,0).map(x=>x.time);
  const quando=`${nome}${pro?` com ${pro.name}`:''} em ${dm(data)}`;
  return resposta(horarios.length?`Horários livres de ${quando}: ${horarios.join(', ')}.`:`Nenhum horário livre de ${quando}.`);
}

// Ficha rápida: visitas, última visita, profissional preferida, faltas, quanto já gastou e o que vem aí.
export function consultarHistoricoCliente(s,{cliente},now=Date.now()){
  const c=typeof cliente==='string'?s.clients.find(x=>x.id===cliente):cliente;
  if(!c)return pergunta('Não achei essa cliente.');
  const minhas=s.appointments.filter(a=>a.client_id===c.id&&a.status==='booked');
  const feitos=minhas.filter(a=>a.result==='attended').sort((a,b)=>b.date.localeCompare(a.date));
  const gasto=feitos.reduce((n,a)=>n+Math.round(Number((s.payments||[]).find(p=>p.appointmentId===a.id)?.amount??a.price??0)*100),0)/100;
  const proximos=s.appointments.filter(a=>a.client_id===c.id&&abertos.includes(a.status)&&!a.result&&at(a)>now).sort((a,b)=>at(a)-at(b)).slice(0,5);
  const preferida=s.staff.find(p=>p.id===c.preferred)?.name;
  const faltas=c.missed||0;
  return resposta([
    `${c.name}${final(c)}`,
    `${plural(c.visits||0,'visita','visitas')} · ${feitos.length?`última em ${dm(feitos[0].date)}`:'sem visita registrada'} · ${preferida?`preferida: ${preferida}`:'sem profissional preferida'}`,
    faltas?plural(faltas,'falta','faltas'):'Nenhuma falta',
    `Gasto total: ${brl(gasto)}`,
    proximos.length?`Próximos: ${proximos.map(a=>`${dm(a.date)} às ${clock(a.start)} ${itemName(s,a)}${a.status==='requested'?' (pedido)':''}`).join('; ')}`:'Sem horários marcados.',
  ].join('\n'));
}

export function consultarResumoDia(s,{data}={},now=Date.now()){
  const dia=data||today(now);
  if(!diaValido(dia))return pergunta('Qual dia você quer ver?');
  const r=summary(s,dia),f=financeView(s,dia);
  // Um pedido com vários serviços (order) conta uma vez só.
  const pedidos=new Set(s.appointments.filter(a=>a.status==='requested'&&at(a)>now).map(a=>a.order||a.id)).size;
  const conversas=supportView(s).length;
  return resposta([
    `Resumo de ${dm(dia)}:`,
    r.booked?`${plural(r.booked,'atendimento','atendimentos')}, receita prevista ${brl(r.revenue)}`:'Nenhum atendimento marcado',
    `Recebido ${brl(f.received)} · Despesas ${brl(f.spent)}`,
    `${plural(pedidos,'pedido','pedidos')} em Aceitações`,
    `${plural(conversas,'pedido','pedidos')} de conversa`,
  ].join('\n'));
}
