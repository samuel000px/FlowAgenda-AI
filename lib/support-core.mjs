// Human support requests are separate from bookings and agent proposals.
const phoneOf=v=>{const n=String(v||'').replace(/\D/g,'');return n.length===10||n.length===11?'55'+n:n;};
export function publicSupportInput(p){
 if(!p||typeof p!=='object')throw Error('Confira os dados do pedido.');
 const name=String(p.name||'').trim().replace(/\s+/g,' '),text=String(p.text||'').trim(),phone=phoneOf(p.phone);
 if(name.length<2||name.length>100)throw Error('Informe seu nome, com 2 a 100 caracteres.');
 if(!/^55[1-9]\d(?:[2-5]\d{7}|9\d{8})$/.test(phone))throw Error('Informe um WhatsApp brasileiro válido, com DDD.');
 if(text.length<3||text.length>1000)throw Error('Conte como podemos ajudar, com 3 a 1.000 caracteres.');
 if(p.consent!==true)throw Error('Autorize o contato por WhatsApp para receber uma resposta.');
 const requestId=String(p.requestId||'');
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId))throw Error('Atualize a página e envie novamente.');
 return {name,text,phone,requestId};
}
export function requestPublicSupport(s,p,now=Date.now()){
 const input=publicSupportInput(p),messageId='site:'+input.requestId;
 // Retrying an uncertain request never edits an existing ticket or changes its owner.
 if((s.supportTickets||[]).some(t=>t.messageId===messageId))return;
 if((s.supportTickets||[]).filter(t=>t.status!=='closed').length>=100)throw Error('Nossa fila está cheia. Tente novamente mais tarde.');
 const ticket=openSupport(s,{...input,channel:messageId,source:'site',messageId},now);
 ticket.contactConsentAt=now;
}
export function openSupport(s,input,now=Date.now()){
 s.supportTickets??=[];
 if(input.messageId&&s.supportTickets.some(t=>t.messageId===input.messageId))return;
 let t=s.supportTickets.find(t=>t.channel===input.channel&&t.source===input.source&&t.status!=='closed');
 const fields={name:String(input.name||'Cliente').slice(0,100),phone:phoneOf(input.phone),text:String(input.text||'Gostaria de falar com uma atendente.').slice(0,1000),messageId:input.messageId||'',updated:now};
 if(t)Object.assign(t,fields);
 else {t={id:'H'+crypto.randomUUID().replaceAll('-',''),channel:input.channel,source:input.source,status:'open',created:now,...fields};s.supportTickets.push(t);}
 return t;
}
export function supportView(s){
 return (s.supportTickets||[]).filter(t=>t.status!=='closed').sort((a,b)=>a.created-b.created).map(t=>({id:t.id,name:t.name,phone:t.phone,text:t.text,status:t.status,source:t.source,kind:t.kind||'',appointment:t.appointment||'',created:t.created,updated:t.updated,owner:t.owner||null}));
}
/**
 * Pedido de cancelamento pelo site (/cancelar). Não cancela nada: vira um pedido em Ações, marcado como
 * cancelamento, e a equipe confirma com a cliente pelo WhatsApp. Se o celular e o dia batem com um horário
 * marcado, o pedido já diz qual é, para a equipe achar mais rápido.
 */
export function requestCancellation(s,p,now=Date.now()){
 if(String(p?.reason||'').trim().length<3)throw Error('Conte o motivo do cancelamento.');
 const base=publicSupportInput({...p,text:p.reason}),service=String(p.service||'').trim().slice(0,100);
 const date=String(p.date||''),time=String(p.time||'');
 if(!service)throw Error('Informe qual era o procedimento.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z')))throw Error('Informe o dia do horário.');
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Informe o horário.');
 const messageId='cancel:'+base.requestId;
 if((s.supportTickets||[]).some(t=>t.messageId===messageId))return;
 if((s.supportTickets||[]).filter(t=>t.status!=='closed').length>=100)throw Error('Nossa fila está cheia. Tente novamente mais tarde.');
 const dia=date.split('-').reverse().join('/'),[h,m]=time.split(':').map(Number),inicio=h*60+m;
 const cliente=s.clients.find(c=>c.phone&&phoneOf(c.phone)===base.phone);
 const marcado=cliente&&s.appointments.filter(a=>a.client_id===cliente.id&&a.date===date&&['booked','requested'].includes(a.status)).sort((a,b)=>Math.abs(a.start-inicio)-Math.abs(b.start-inicio))[0];
 const appointment=marcado?`${s.services.find(v=>v.id===marcado.service_id)?.name||'Serviço'} com ${s.staff.find(p=>p.id===marcado.staff_id)?.name||'—'}, ${dia} às ${String(Math.floor(marcado.start/60)).padStart(2,'0')}:${String(marcado.start%60).padStart(2,'0')}`:'';
 const text=`Pedido de cancelamento: ${service}, ${dia} às ${time}. Motivo: ${base.text}`;
 const ticket=openSupport(s,{name:base.name,phone:base.phone,text,channel:messageId,source:'site',messageId},now);
 Object.assign(ticket,{kind:'cancel',appointment,contactConsentAt:now});
}
export function supportAction(s,action,p,actor,now=Date.now()){
 if(!actor||!['admin','staff'].includes(actor.role))throw Error('Entre no painel para atender.');
 if(action==='support_demo'){
  if(actor.role!=='admin')throw Error('Apenas a administração pode criar um exemplo.');
  return openSupport(s,{channel:'demo:customer',source:'demo',name:'Cliente de exemplo',text:'Oi! Gostaria de tirar uma dúvida com uma atendente.',phone:''},now);
 }
 if(!['support_claim','support_close'].includes(action))throw Error('Ação de atendimento inválida.');
 const t=s.supportTickets?.find(t=>t.id===p.id);if(!t)throw Error('Pedido de conversa não encontrado.');
 if(t.owner&&actor.role!=='admin'&&(t.owner.id!==actor.id||t.owner.role!==actor.role))throw Error('Este pedido já está com outra pessoa da equipe.');
 if(t.status==='closed'){if(action==='support_close')return t;throw Error('Este pedido já foi encerrado.');}
 if(action==='support_claim'){t.owner={role:actor.role,id:actor.id,name:actor.name};t.status='serving';}
 else {t.status='closed';t.closed=now;t.closedBy={role:actor.role,id:actor.id,name:actor.name};}
 t.updated=now;
 s.events??=[];s.events.unshift({id:crypto.randomUUID(),text:`${actor.name}: conversa de ${t.name} ${action==='support_close'?'encerrada':'assumida'}.`,created:now});s.events=s.events.slice(0,300);
 return t;
}
