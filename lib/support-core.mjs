// Human support requests are separate from bookings and agent proposals.
const phoneOf=v=>{const n=String(v||'').replace(/\D/g,'');return n.length===10||n.length===11?'55'+n:n;};
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
 return (s.supportTickets||[]).filter(t=>t.status!=='closed').sort((a,b)=>a.created-b.created).map(t=>({id:t.id,name:t.name,phone:t.phone,text:t.text,status:t.status,source:t.source,created:t.created,updated:t.updated,owner:t.owner||null}));
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
