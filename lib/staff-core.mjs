import {actAdmin,at,id,nameKey,phoneKey,today} from './flowagenda.mjs';
import {bookInStore,catalog,slots} from './agendamento.mjs';

export function activeStaff(state,staffId){
 const staff=state.staff.find(p=>p.id===staffId&&p.active);
 if(!staff)throw Error('Este acesso da equipe não está mais disponível.');
 return staff;
}
export function relatedOffer(state,offer,staffId){
 return offer.staff_id===staffId||state.appointments.find(a=>a.id===offer.origin_id)?.staff_id===staffId;
}
export function staffView(state,staffId,date=today()){
 const staff=activeStaff(state,staffId);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z')))throw Error('Data inválida.');
 const name=(table,key)=>state[table].find(x=>x.id===key)?.name||'—';
 return {staff:{id:staff.id,name:staff.name},salon:state.salon.name,date,
  team:state.staff.filter(p=>p.active).map(p=>({id:p.id,name:p.name})),
  // Para marcar na loja: serviços, opções e quem faz cada um (sem preços de custo nem dados de clientes).
  catalog:(({services,staff,groups})=>({services,staff,groups}))(catalog(state)),
  appointments:state.appointments.filter(a=>a.date===date).sort((a,b)=>a.start-b.start).map(a=>({id:a.id,date:a.date,start:a.start,end:a.end,clientName:name('clients',a.client_id),serviceName:name('services',a.service_id),staffId:a.staff_id,staffName:name('staff',a.staff_id),status:a.status,result:a.result,attendance:a.attendance})),
  suggestions:state.offers.filter(o=>o.status==='approval'&&at(o)>Date.now()&&relatedOffer(state,o,staffId)).map(o=>{const a=state.appointments.find(a=>a.id===o.origin_id);return {id:o.id,clientName:name('clients',o.client_id),serviceName:name('services',o.service_id),from:a?{date:a.date,start:a.start,staffName:name('staff',a.staff_id)}:null,to:{date:o.date,start:o.start,staffName:name('staff',o.staff_id)}};}),
 };
}
/**
 * Busca de clientes para marcar horário: por parte do nome (sem ligar para acento) ou por 4 ou mais
 * dígitos do número. Devolve só o nome e o final do número, nunca o número inteiro.
 */
export function staffClients(state,staffId,query){
 activeStaff(state,staffId);
 const q=nameKey(query),digits=String(query||'').replace(/\D/g,'');
 if(q.length<2&&digits.length<4)return [];
 return state.clients.filter(c=>digits.length>=4?phoneKey(c.phone).includes(digits):nameKey(c.name).includes(q))
  .slice(0,8).map(c=>({id:c.id,name:c.name,phoneEnd:phoneKey(c.phone).slice(-4)}));
}
/** Horários livres para quem chegou na loja: a partir de agora, sem a antecedência do site. */
export function staffSlots(state,staffId,cart,date,now=Date.now()){
 activeStaff(state,staffId);
 return slots(state,cart,date,now,0).map(({start,time})=>({start,time}));
}
export function applyStaffAction(state,staffId,input,now=Date.now()){
 const staff=activeStaff(state,staffId);
 if(!['book_in_store','approve'].includes(input.action))throw Error('A equipe não tem permissão para esta ação.');
 if(!/^[a-f0-9-]{36}$/i.test(input.requestId||''))throw Error('Atualize a página antes de tentar novamente.');
 state.staffAudit??=[];
 if(state.staffAudit.some(a=>a.staffId===staffId&&a.requestId===input.requestId))return;
 let reference;
 if(input.action==='book_in_store'){
  // Só os campos do formulário; qualquer outro que chegue junto é ignorado.
  const created=bookInStore(state,{client_id:input.client_id,newClient:input.newClient===true,name:input.name,phone:input.phone,cart:input.cart,date:input.date,start:input.start,earlier:input.earlier},staff.name,now);
  reference=created[0].id;
 }else{
  const offer=state.offers.find(o=>o.id===input.id);
  if(!offer||!relatedOffer(state,offer,staffId))throw Error('Esta proposta não pertence aos seus atendimentos.');
  if(offer.status!=='approval')throw Error('A proposta precisa do aceite da cliente e estar pendente de aprovação.');
  actAdmin(state,'approve',{id:offer.id,approvedBy:staff.name},now);
  offer.approvedBy={role:'staff',id:staff.id,name:staff.name,at:now};reference=offer.id;
 }
 state.staffAudit.push({id:id('E'),staffId:staff.id,staffName:staff.name,requestId:input.requestId,action:input.action,reference,created:now});
 state.staffAudit=state.staffAudit.slice(-1000);
 state.events.unshift({id:id('E'),text:`${staff.name}: ${input.action==='approve'?'aprovação de remarcação':'horário marcado'} registrado.`,created:now});state.events=state.events.slice(0,300);
}
