// Agendamento pela página pública. A cliente só vê serviços, profissionais e horários livres;
// nome e telefone de outras clientes nunca saem daqui. O pedido segura o horário até a gerência
// aceitar ou recusar (status "requested").
import {actAdmin,at,clock,free,get,id,message,today} from './flowagenda.mjs';
const fail=text=>{throw Error(text)};
const weekday=date=>new Date(date+'T12:00:00Z').getUTCDay();
const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
const addDays=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const label=date=>date.split('-').reverse().join('/');

/** Telefone só com números e com o 55 do Brasil na frente, como o wa.me pede. */
export function phoneDigits(value){
  const digits=String(value||'').replace(/\D/g,'');
  return digits.length===10||digits.length===11?'55'+digits:digits;
}

export function catalog(s){
  const staff=s.staff.filter(p=>p.active!==false&&p.services?.length);
  return {
    salon:s.salon.name,block:s.settings.block,
    services:s.services.filter(v=>staff.some(p=>p.services.includes(v.id))).map(({id,name,duration,price})=>({id,name,duration,price})),
    staff:staff.map(({id,name,services})=>({id,name,services})),
  };
}

/** Os próximos dias em que o salão abre, a partir de hoje. */
export function openDays(s,now=Date.now()){
  const days=[],first=today(now);
  for(let i=0;i<s.settings.bookingDays;i++){const d=addDays(first,i);if(s.settings.hours[weekday(d)])days.push(d);}
  return days;
}

/**
 * Inícios da grade em que o serviço inteiro cabe: dentro do funcionamento do dia, do expediente e
 * fora do intervalo da profissional, sem bater em outro atendimento ou pedido. Sem profissional
 * escolhida, vale qualquer uma que faça o serviço.
 */
export function slots(s,serviceId,staffId,date,now=Date.now()){
  const svc=get(s,'services',serviceId),hours=s.settings.hours[weekday(date)];
  if(!validDate(date)||!hours||!openDays(s,now).includes(date))return [];
  const people=(staffId?[get(s,'staff',staffId)]:s.staff).filter(p=>p.active!==false&&p.services?.includes(svc.id));
  const list=[];
  for(let start=hours[0];start+svc.duration<=hours[1];start+=s.settings.block){
    if((at({date,start})-now)/3600000<s.settings.minNotice)continue;
    const staff=people.filter(p=>free(s,'',p.id,date,start,start+svc.duration)).map(p=>p.id);
    if(staff.length)list.push({start,time:clock(start),staff});
  }
  return list;
}

export function requestBooking(s,p,now=Date.now()){
  const name=String(p.name||'').trim().replace(/\s+/g,' '),phone=phoneDigits(p.phone);
  if(name.length<2||name.length>100)fail('Informe seu nome.');
  if(!/^55\d{10,11}$/.test(phone))fail('Informe um celular com DDD.');
  const svc=get(s,'services',String(p.service_id||'')),start=Number(p.start);
  const slot=slots(s,svc.id,p.staff_id?String(p.staff_id):'',String(p.date||''),now).find(x=>x.start===start);
  if(!slot)fail('Este horário acabou de ser ocupado. Escolha outro.');
  let c=s.clients.find(c=>c.phone&&phoneDigits(c.phone)===phone);
  if(c&&s.appointments.filter(a=>a.client_id===c.id&&a.status==='requested').length>=3)fail('Você já tem pedidos aguardando confirmação. Fale com a gente pelo WhatsApp.');
  const earlier=!!p.earlier;
  if(!c){c={id:id('C'),name,phone,consent:earlier,willingness:earlier?5:0,preferred:p.staff_id?String(p.staff_id):'',visits:0,missed:0,proposals:0,accepted:0};s.clients.push(c);}
  else Object.assign(c,{consent:earlier,willingness:earlier?(c.willingness||5):0});
  // Mesma regra do motor: quem escolheu um horário mais tarde havendo outros antes tende a não querer antecipar.
  const chosenLate=openDays(s,now).filter(d=>d<=p.date).some(d=>slots(s,svc.id,p.staff_id||'',d,now).some(x=>d<p.date||x.start<start));
  const a={id:id('A'),client_id:c.id,service_id:svc.id,staff_id:slot.staff[0],date:p.date,start,end:start+svc.duration,price:svc.price,status:'requested',attendance:'unknown',reminded:false,result:null,chosenLate,token:crypto.randomUUID().replaceAll('-',''),source:'site',created:now};
  s.appointments.push(a);
  message(s,c.id,'client',`Pedido pelo site: ${svc.name} em ${label(a.date)} às ${clock(a.start)}, com ${get(s,'staff',a.staff_id).name}.${earlier?' Quer ser avisada se abrir um horário mais cedo.':''}`,{appointment_id:a.id},now);
  s.events.unshift({id:id('E'),text:`Novo pedido pelo site: ${c.name}, ${a.date} às ${clock(a.start)}.`,created:now});
  return a;
}

export function byToken(s,token){
  const a=/^[0-9a-f]{32}$/.test(String(token||''))&&s.appointments.find(a=>a.token===token);
  return a||fail('Agendamento não encontrado. Confira o link.');
}

const states={requested:'Aguardando confirmação',booked:'Confirmado',cancelled:'Cancelado',withdrawn:'Cancelado',declined:'Não foi possível atender',expired:'Encerrado'};
export function publicView(s,a,now=Date.now()){
  return {
    status:a.result?(a.result==='attended'?'Realizado':'Encerrado'):states[a.status]||a.status,
    open:['requested','booked'].includes(a.status)&&!a.result&&at(a)>now,
    name:get(s,'clients',a.client_id).name.split(' ')[0],service:get(s,'services',a.service_id).name,staff:get(s,'staff',a.staff_id).name,
    date:a.date,time:clock(a.start),end:clock(a.end),price:a.price,
  };
}

/** A cliente cancela pelo link do agendamento. Um horário confirmado vira vaga e o motor procura quem antecipar. */
export function cancelByToken(s,token,now=Date.now()){
  const a=byToken(s,token);
  if(!publicView(s,a,now).open)fail('Este agendamento não pode mais ser cancelado por aqui.');
  const c=get(s,'clients',a.client_id);
  message(s,c.id,'client','Cancelou o agendamento pelo site.',{appointment_id:a.id},now);
  if(a.status==='requested'){a.status='withdrawn';s.events.unshift({id:id('E'),text:`${c.name} desistiu do pedido de ${a.date} às ${clock(a.start)}.`,created:now});}
  else actAdmin(s,'cancel',{id:a.id},now);
  return a;
}
