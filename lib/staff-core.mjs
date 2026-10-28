import {actAdmin,at,id,today} from './flowagenda.mjs';

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
  appointments:state.appointments.filter(a=>a.date===date).sort((a,b)=>a.start-b.start).map(a=>({id:a.id,date:a.date,start:a.start,end:a.end,clientName:name('clients',a.client_id),serviceName:name('services',a.service_id),staffId:a.staff_id,staffName:name('staff',a.staff_id),status:a.status,result:a.result,attendance:a.attendance})),
  suggestions:state.offers.filter(o=>o.status==='approval'&&at(o)>Date.now()&&relatedOffer(state,o,staffId)).map(o=>{const a=state.appointments.find(a=>a.id===o.origin_id);return {id:o.id,clientName:name('clients',o.client_id),serviceName:name('services',o.service_id),from:a?{date:a.date,start:a.start,staffName:name('staff',a.staff_id)}:null,to:{date:o.date,start:o.start,staffName:name('staff',o.staff_id)}};}),
 };
}
export function applyStaffAction(state,staffId,input,now=Date.now()){
 const staff=activeStaff(state,staffId);
 if(!['client_create','approve'].includes(input.action))throw Error('A equipe não tem permissão para esta ação.');
 if(!/^[a-f0-9-]{36}$/i.test(input.requestId||''))throw Error('Atualize a página antes de tentar novamente.');
 state.staffAudit??=[];
 if(state.staffAudit.some(a=>a.staffId===staffId&&a.requestId===input.requestId))return;
 let reference;
 if(input.action==='client_create'){
  if(input.id)throw Error('Este acesso permite apenas cadastrar novas clientes.');
  const phone=String(input.phone||'').replace(/\D/g,'');
  if(phone&&!/^[1-9]\d{9,14}$/.test(phone))throw Error('Informe o telefone com país e DDD ou deixe em branco.');
  if(phone&&state.clients.some(c=>c.phone===phone))throw Error('Este telefone já está cadastrado. Peça à gerência para conferir.');
  actAdmin(state,'client_save',{name:input.name,phone,consent:input.consent===true,willingness:Number(input.willingness??5),preferred:''},now);
  reference=state.clients.at(-1).id;
 }else{
  const offer=state.offers.find(o=>o.id===input.id);
  if(!offer||!relatedOffer(state,offer,staffId))throw Error('Esta proposta não pertence aos seus atendimentos.');
  if(offer.status!=='approval')throw Error('A proposta precisa do aceite da cliente e estar pendente de aprovação.');
  actAdmin(state,'approve',{id:offer.id,approvedBy:staff.name},now);
  offer.approvedBy={role:'staff',id:staff.id,name:staff.name,at:now};reference=offer.id;
 }
 state.staffAudit.push({id:id('E'),staffId:staff.id,staffName:staff.name,requestId:input.requestId,action:input.action,reference,created:now});
 state.staffAudit=state.staffAudit.slice(-1000);
 state.events.unshift({id:id('E'),text:`${staff.name}: ${input.action==='approve'?'aprovação de remarcação':'cadastro de cliente presencial'} registrado.`,created:now});state.events=state.events.slice(0,300);
}
