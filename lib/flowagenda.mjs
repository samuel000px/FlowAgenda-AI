// Administrative domain. Ported from agente-remarcacao/src/{score,filtros,estado,historico}.
import {replyIntent} from './conversation.mjs';
export const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export const today=(now=Date.now())=>new Date(now-3*3600000).toISOString().slice(0,10);
export const at=a=>Date.parse(`${a.date}T${clock(a.start)}:00-03:00`);
export const id=prefix=>prefix+crypto.randomUUID().replaceAll('-','').slice(0,16);
const fail=text=>{throw Error(text)};
export const get=(s,t,k)=>s[t].find(x=>x.id===k)||fail('Registro não encontrado.');
// Para cruzar cadastros: o mesmo nome com ou sem acento e maiúscula, e o mesmo número com ou sem o 55.
export const nameKey=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export const phoneKey=v=>{const d=String(v||'').replace(/\D/g,'');return d.length===10||d.length===11?'55'+d:d;};
export const sameName=(s,name,except='')=>s.clients.filter(c=>c.id!==except&&nameKey(c.name)===nameKey(name));
export const samePhone=(s,phone,except='')=>phoneKey(phone)?s.clients.find(c=>c.id!==except&&c.phone&&phoneKey(c.phone)===phoneKey(phone)):undefined;
const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
export const pending=o=>['pending','approval'].includes(o.status);
export const rateMiss=(missed,visits)=>(missed+1)/(visits+4);
export const probability=(accepted,proposals,prior=5)=>(accepted+2*prior/10)/(proposals+2);
export const difficulty=(notice,queue,occupancy=100)=>1-(0.6*Math.min(Math.max(notice,0)/48,1)*Math.min(Math.max(occupancy,0)/80,1)+0.4*Math.min(Math.max(queue,0)/3,1));
export function score(client,gap,origin,chosenLate=false){
  // Antecipar é só sim ou não. Quem disse sim parte da mesma chance; quem marcou mais tarde havendo
  // horários antes tende a não querer mudar e parte de uma chance menor.
  const prior=chosenLate?2:5;
  const chance=probability(client.accepted,client.proposals,prior),absence=rateMiss(client.missed,client.visits);
  const gain=chance*gap.price*(difficulty(gap.notice,gap.queue,gap.occupancy)-absence);
  const risk=chance*origin.price*difficulty(origin.notice,origin.queue,origin.occupancy);
  return {chance,absence,gain,risk,value:gain-risk};
}
// Funcionamento por dia da semana (0 = domingo), em minutos: terça a sexta 9h–18h, sábado 8h–17h.
export const defaultHours=()=>({2:[540,1080],3:[540,1080],4:[540,1080],5:[540,1080],6:[480,1020]});
export const withDefaults=s=>{
  s.settings={block:45,hours:defaultHours(),bookingDays:21,...s.settings};s.promos??=[];
  // A antiga nota de 0 a 10 virou sim ou não: nota 0 era "não quer antecipar".
  for(const c of s.clients)if('willingness' in c){if(c.willingness===0)c.consent=false;delete c.willingness;}
  for(const v of s.services){v.group??='Unhas';v.addon??=false;}
  return s;
};
// Catálogo tirado das fichas da Santa Cor. Valores e tempos são de exemplo até a revisão do salão.
// Adicionais somam só no preço; "variants" são opções do mesmo serviço (o comprimento da escova).
export function catalogoSantaCor(){
  const u=(id,name,duration,price)=>({id,name,duration,price,group:'Unhas',addon:false});
  const c=(id,name,duration,price,variants)=>({id,name,duration,price,group:'Cabelo',addon:false,...(variants?{variants}:{})});
  const extra=(id,name,price,group)=>({id,name,duration:0,price,group,addon:true});
  return [
    u('S1','Manicure',45,30),u('S2','Pedicure',45,35),u('S3','Manicure + Pedicure',90,60),u('S4','SPA Detox',45,50),u('S5','SPA Relaxante',45,50),
    u('S6','Alongamento de unhas',135,150),u('S7','Manutenção com permanente',90,90),u('S8','Banho de gel (1ª colocação)',90,100),
    extra('S9','Arte',10,'Unhas'),extra('S10','Francesinha',10,'Unhas'),
    c('S11','Escova',45,40,[{name:'Cabelo curto',duration:45,price:40},{name:'Cabelo médio',duration:45,price:50},{name:'Cabelo longo',duration:90,price:60},{name:'Cabelo extra longo',duration:90,price:80}]),
    c('S12','Lavagem simples',45,20),c('S13','Aplicação de coloração',90,80),
    extra('S14','Chapinha',15,'Cabelo'),extra('S15','Babyliss',20,'Cabelo'),
  ];
}
// "Pegue também": quem escolhe o gatilho (um serviço ou qualquer serviço de uma área) ganha desconto no alvo.
export const promosIniciais=()=>[
  {id:'D1',trigger:'S1',target:'S2',type:'percent',value:15,active:true},
  {id:'D2',trigger:'S2',target:'S5',type:'percent',value:20,active:true},
  {id:'D3',trigger:'group:Unhas',target:'S11',type:'amount',value:10,active:true},
  {id:'D4',trigger:'S11',target:'S1',type:'amount',value:10,active:true},
];
export function seedAdmin(){return {schemaVersion:2,salon:{name:'Santa Cor'},settings:{minNotice:1,maxDepth:2,autoNext:true,block:45,hours:defaultHours(),bookingDays:21},clients:[],staff:[],services:catalogoSantaCor(),promos:promosIniciais(),appointments:[],gaps:[],offers:[],messages:[],history:[],events:[],waitlist:[],aiUses:0};}
export function upgrade(s,day=today()){
  if(s.schemaVersion===2)return withDefaults(s);
  const base=seedAdmin();
  base.clients=s.clients.map(c=>({...c,phone:'',preferred:'',visits:0,missed:0,proposals:0,accepted:0}));
  base.staff=s.staff.map(p=>({...p,active:true}));base.services=s.services.map(v=>({...v,price:v.price||0}));
  base.appointments=s.appointments.map(a=>({...a,date:a.date||day,price:a.price||0,result:null,chosenLate:false}));
  // Existing reservations are kept; previous automatic offers cannot bypass approval.
  base.waitlist=s.waitlist.map(w=>({...w,date:day}));
  for(const a of base.appointments.filter(a=>a.status==='cancelled'))base.gaps.push(gapFrom(a));
  log(base,'Agenda existente incorporada à administração.');return base;
}
export function message(s,channel,sender,text,extra={},now=Date.now()){
  s.messages.push({id:id('M'),channel,sender,text,created:now,...extra});
}
function log(s,text,now=Date.now()){s.events.unshift({id:id('E'),text,created:now});s.events=s.events.slice(0,300);}
function history(s,c,type,reference,now){
  if(s.history.some(e=>e.reference===reference&&e.type===type))return;
  s.history.push({id:id('H'),client_id:c.id,type,reference,created:now});
  if(type==='attended'||type==='missed'){c.visits++;if(type==='missed')c.missed++;}
  if(['accepted','refused','unanswered'].includes(type)){c.proposals++;if(type==='accepted')c.accepted++;}
}
function gapFrom(a,depth=0,root=''){const k=id('G');return {id:k,root:root||k,date:a.date,start:a.start,end:a.end,service_id:a.service_id,staff_id:a.staff_id,price:a.price,depth,status:'open',cancelled_id:a.id};}
// Um pedido do site segura o horário até a gerência aceitar ou recusar.
const holds=a=>a.status==='booked'||a.status==='requested';
export function free(s,client,staff,date,start,end,exclude='',excludeOffer=''){
  const p=get(s,'staff',staff),overlaps=a=>a.date===date&&a.start<end&&a.end>start;
  return p.active!==false&&start>=p.start&&end<=p.end&&!(p.break_start<p.break_end&&start<p.break_end&&end>p.break_start)
    &&!s.appointments.some(a=>a.id!==exclude&&holds(a)&&(a.client_id===client||a.staff_id===staff)&&overlaps(a))
    &&!s.offers.some(o=>o.id!==excludeOffer&&pending(o)&&(o.client_id===client||o.staff_id===staff)&&overlaps(o));
}
export function dayStats(s,date){
  if(s.days?.[date])return s.days[date]; // Used by parity fixtures and imported day statistics.
  const capacity=s.staff.filter(p=>p.active!==false).reduce((n,p)=>n+Math.max(0,p.end-p.start-Math.max(0,p.break_end-p.break_start)),0);
  const occupied=s.appointments.filter(a=>a.date===date&&a.status==='booked').reduce((n,a)=>n+a.end-a.start,0);
  return {occupancy:capacity?Math.min(100,occupied/capacity*100):0,queue:s.waitlist.filter(w=>w.date===date&&w.status==='waiting').length};
}
const hole=(s,a,now)=>({...dayStats(s,a.date),price:a.price,notice:(at(a)-now)/3600000});
export const reasons={type:'Serviço diferente',duration:'Duração incompatível',earlier:'Atendimento não é posterior',notice:'Antecedência insuficiente',consent:'Não deseja antecipação',refused:'Já consultada neste fluxo',busy:'Horário indisponível',value:'Benefício esperado não positivo',reserved:'Cliente em outra proposta',depth:'Limite de desdobramentos'};
function hardReason(s,g,a,c,now,offerId=''){
  if(a.service_id!==g.service_id)return 'type';
  if(a.end-a.start>g.end-g.start)return 'duration';
  if(at(a)<=at(g))return 'earlier';
  if((at(g)-now)/3600000<s.settings.minNotice)return 'notice';
  if(!c.consent)return 'consent';
  if(!get(s,'staff',g.staff_id).services.includes(a.service_id)||!free(s,c.id,g.staff_id,g.date,g.start,g.start+a.end-a.start,a.id,offerId))return 'busy';
  if(s.offers.some(o=>o.id!==offerId&&pending(o)&&o.origin_id===a.id))return 'reserved';
  return null;
}
export function candidates(s,gapId,now=Date.now()){
  const g=get(s,'gaps',gapId);if(g.status!=='open'||g.depth>s.settings.maxDepth)return [];
  // Pedido com mais de um atendimento em sequência fica fora: antecipar só um quebraria a sequência.
  return s.appointments.filter(a=>a.status==='booked'&&!a.result&&!a.linked).map(a=>{
    const c=get(s,'clients',a.client_id);
    const active=s.offers.find(o=>o.gap_id===g.id&&pending(o));
    let reason=hardReason(s,g,a,c,now,active?.id||'');
    if(!reason&&s.offers.some(o=>o.root===g.root&&o.client_id===c.id&&['refused','unanswered','expired'].includes(o.status)))reason='refused';
    const values=reason?{}:score(c,hole(s,g,now),hole(s,a,now),a.chosenLate);
    if(!reason&&values.value<=0)reason='value';
    return {client_id:c.id,origin_id:a.id,name:c.name,preferred:!c.preferred||c.preferred===g.staff_id,reason,...values};
  }).sort((a,b)=>(a.reason?(a.reason==='value'?1:2):0)-(b.reason?(b.reason==='value'?1:2):0)||Number(b.preferred)-Number(a.preferred)||(b.value||0)-(a.value||0)||at(get(s,'appointments',a.origin_id))-at(get(s,'appointments',b.origin_id)));
}
export function seek(s,gapId,now=Date.now()){
  const g=get(s,'gaps',gapId),existing=s.offers.find(o=>o.gap_id===gapId&&pending(o));if(existing)return existing;
  if(g.status!=='open')fail('Esta vaga já foi encerrada.');
  const choice=candidates(s,gapId,now).find(c=>!c.reason);
  if(!choice){g.reason=g.depth>s.settings.maxDepth?'Limite de desdobramentos atingido.':'Nenhuma cliente elegível com benefício esperado positivo.';return null;}
  const a=get(s,'appointments',choice.origin_id),c=get(s,'clients',choice.client_id),p=get(s,'staff',g.staff_id);
  const o={id:id('O'),gap_id:g.id,root:g.root,origin_id:a.id,client_id:c.id,date:g.date,start:g.start,end:g.start+a.end-a.start,service_id:a.service_id,staff_id:g.staff_id,status:'pending',version:1,clarified:false,created:now,snapshot:JSON.stringify(a),...choice};
  s.offers.push(o);g.reason='';
  const day=d=>d.split('-').reverse().join('/');
  message(s,c.id,'agent',`Olá, ${c.name.split(' ')[0]}. Temos disponibilidade em ${day(g.date)} às ${clock(g.start)} com ${p.name}. Gostaria de antecipar seu atendimento?${o.preferred?'':` A profissional será ${p.name}, diferente da sua preferência.`} Se preferir, seu horário de ${day(a.date)} às ${clock(a.start)} permanece reservado.`,{offer_id:o.id},now);
  log(s,`Proposta preparada para ${c.name}. Benefício esperado: R$ ${o.value.toFixed(2)}.`,now);return o;
}
function next(s,o,now){if(s.settings.autoNext)seek(s,o.gap_id,now);}
export function respond(s,offerId,text,result,now=Date.now()){
  const o=get(s,'offers',offerId);if(o.status!=='pending')fail('A proposta já recebeu uma resposta ou foi encerrada.');
  if(at(o)<=now)fail('O horário da proposta já passou. Encerre a proposta.');
  if(!['accepted','refused','other','ambiguous'].includes(result))fail('Resposta inválida.');
  const c=get(s,'clients',o.client_id);message(s,c.id,'client',text,{offer_id:o.id},now);
  if(result==='ambiguous'&&!o.clarified){o.clarified=true;message(s,c.id,'agent',`Para confirmar: você aceita antecipar para ${o.date.split('-').reverse().join('/')} às ${clock(o.start)}? Seu horário atual será mantido se preferir.`,{offer_id:o.id},now);return;}
  if(result==='accepted'){
    o.status='approval';history(s,c,'accepted',o.id,now);
    message(s,c.id,'agent','Resposta registrada. A alteração está aguardando a confirmação da gerência; seu horário atual permanece reservado.',{},now);
    log(s,`${c.name} aceitou a proposta. Aguardando aprovação.`,now);
  }else{
    o.status='refused';o.answer=result;history(s,c,'refused',o.id,now);
    message(s,c.id,'agent','Entendido. Seu agendamento atual permanece reservado.',{},now);log(s,`${c.name}: proposta não aceita.`,now);next(s,o,now);
  }
}
export function tickAdmin(s,now=Date.now()){
  for(const o of s.offers.filter(pending))if(at(o)<=now){o.status='expired';if(!s.history.some(e=>e.reference===o.id))history(s,get(s,'clients',o.client_id),'unanswered',o.id,now);message(s,o.client_id,'agent','O prazo para este horário terminou. Seu agendamento original foi mantido.',{},now);}
  for(const a of s.appointments)if(a.status==='requested'&&at(a)<=now){a.status='expired';log(s,`Pedido de ${get(s,'clients',a.client_id).name} encerrado: o horário passou sem resposta.`,now);}
  for(const a of s.appointments)if(a.status==='booked'&&!a.reminded&&!a.result&&at(a)>now&&at(a)-now<=1800000){a.reminded=true;message(s,a.client_id,'agent',`Você confirma seu atendimento de ${get(s,'services',a.service_id).name} hoje às ${clock(a.start)}?`,{appointment_id:a.id,appointment_at:at(a)},now);}
  return s;
}
// Os atendimentos de um mesmo pedido do site são aceitos, recusados e cancelados juntos.
export const together=(s,a)=>a.order?s.appointments.filter(x=>x.order===a.order&&x.status===a.status):[a];
function invalidate(s,appointmentId,now){for(const o of s.offers.filter(o=>o.origin_id===appointmentId&&pending(o))){o.status='invalidated';message(s,o.client_id,'agent','A proposta foi encerrada porque o agendamento foi atualizado pela gerência.',{},now);}}
export function actAdmin(s,action,p={},now=Date.now()){
  tickAdmin(s,now);
  switch(action){
    case 'client_save':{
      const previous=p.id?get(s,'clients',p.id):null,name=String(p.name||'').trim(),phone=String(p.phone||'').replace(/\D/g,'');
      if(name.length<2||name.length>100||phone.length>15)fail('Confira nome e telefone.');
      if(p.preferred)get(s,'staff',p.preferred);
      const dono=samePhone(s,phone,previous?.id);if(dono)fail(`Este número já está no cadastro de ${dono.name}. Abra o cadastro dela para conferir.`);
      const xara=nameKey(name)!==nameKey(previous?.name)&&sameName(s,name,previous?.id)[0];
      if(xara&&!p.confirmNew)fail(`Já existe ${xara.name} no cadastro. Se for outra pessoa, confirme para cadastrar.`);
      const c={id:previous?.id||id('C'),name,phone,consent:!!p.consent,preferred:p.preferred||'',visits:previous?.visits||0,missed:previous?.missed||0,proposals:previous?.proposals||0,accepted:previous?.accepted||0};
      if(previous)Object.assign(previous,c);else s.clients.push(c);log(s,`Cadastro de ${name} atualizado.`,now);break;
    }
    case 'staff_save':{
      const name=String(p.name||'').trim();if(!name||name.length>80||!Array.isArray(p.services)||!p.services.length||!integer(p.start,0,1439)||!integer(p.end,p.start+1,1440)||!integer(p.break_start,0,1440)||!integer(p.break_end,p.break_start,1440))fail('Confira nome, serviços e expediente.');
      p.services.forEach(k=>get(s,'services',k));
      if(p.break_end>p.break_start&&(p.break_start<p.start||p.break_end>p.end))fail('O intervalo deve ficar dentro do expediente.');
      const values={name,services:p.services,start:p.start,end:p.end,break_start:p.break_start,break_end:p.break_end,active:p.active!==false};
      if(p.id)Object.assign(get(s,'staff',p.id),values);else s.staff.push({id:id('P'),...values});log(s,`Expediente de ${name} atualizado.`,now);break;
    }
    case 'service_save':{
      const name=String(p.name||'').trim(),group=String(p.group||'').trim(),addon=!!p.addon;
      if(!name||name.length>80||!group||group.length>40||!integer(p.duration,addon?0:5,480)||!Number.isFinite(p.price)||p.price<0||p.price>10000)fail('Confira serviço, área, duração e valor.');
      const variants=(Array.isArray(p.variants)?p.variants:[]).map(v=>({name:String(v?.name||'').trim(),duration:v?.duration,price:v?.price}));
      if(variants.length>8||variants.some(v=>!v.name||v.name.length>40||!integer(v.duration,5,480)||!Number.isFinite(v.price)||v.price<0||v.price>10000))fail('Confira as opções do serviço: nome, minutos e valor em cada linha.');
      const values={name,duration:addon?0:p.duration,price:p.price,group,addon};if(variants.length&&!addon)values.variants=variants;if(p.id){const v=get(s,'services',p.id);delete v.variants;Object.assign(v,values);}else s.services.push({id:id('S'),...values});
      if(p.id&&p.applyMissing){for(const a of s.appointments.filter(a=>a.service_id===p.id&&a.status==='booked'&&!a.result&&at(a)>now&&a.price===0)){invalidate(s,a.id,now);a.price=p.price;}for(const g of s.gaps.filter(g=>g.service_id===p.id&&g.status==='open'&&at(g)>now&&g.price===0))g.price=p.price;}break;
    }
    case 'book':case 'reschedule':{
      const c=get(s,'clients',p.client_id),svc=get(s,'services',p.service_id),staff=get(s,'staff',p.staff_id),previous=action==='reschedule'?get(s,'appointments',p.id):null;
      if(svc.addon)fail('Adicionais entram junto de um serviço, não sozinhos.');
      if(previous&&(previous.status!=='booked'||previous.result||at(previous)<=now))fail('Este atendimento não pode ser reagendado.');
      const end=p.start+svc.duration;
      if(!validDate(p.date)||!integer(p.start,0,1439)||at(p)<=now||!staff.services.includes(svc.id)||!free(s,c.id,staff.id,p.date,p.start,end,previous?.id||''))fail('O horário não está disponível para esta cliente e profissional.');
      const values={client_id:c.id,service_id:svc.id,staff_id:staff.id,date:p.date,start:p.start,end,price:svc.price,status:'booked',attendance:'unknown',reminded:false,result:null,chosenLate:!!p.chosenLate};
      if(previous){const gap=gapFrom(previous);invalidate(s,previous.id,now);Object.assign(previous,values);s.gaps.push(gap);}else s.appointments.push({id:id('A'),...values});
      log(s,`${action==='book'?'Agendamento':'Reagendamento'}: ${c.name}, ${p.date} às ${clock(p.start)}.`,now);break;
    }
    case 'cancel':{
      const a=get(s,'appointments',p.id);if(a.status==='cancelled')break;if(a.result||at(a)<=now)fail('Só é possível cancelar um atendimento futuro.');
      a.status='cancelled';invalidate(s,a.id,now);const g=gapFrom(a);s.gaps.push(g);log(s,`Cancelamento de ${get(s,'clients',a.client_id).name}.`,now);if(s.settings.autoNext)seek(s,g.id,now);break;
    }
    case 'request_accept':{
      const a=get(s,'appointments',p.id),items=together(s,a);if(a.status==='booked')break;if(a.status!=='requested')fail('Este pedido já foi decidido.');
      if(items.some(x=>at(x)<=now||!free(s,x.client_id,x.staff_id,x.date,x.start,x.end,x.id)))fail('O horário não está mais disponível. Recuse o pedido e combine outro horário.');
      const c=get(s,'clients',a.client_id);
      for(const x of items){x.status='booked';message(s,c.id,'agent',`Agendamento confirmado: ${get(s,'services',x.service_id).name} em ${x.date.split('-').reverse().join('/')} às ${clock(x.start)}, com ${get(s,'staff',x.staff_id).name}.`,{appointment_id:x.id},now);}
      log(s,`Pedido aceito: ${c.name}, ${a.date} às ${clock(a.start)}.`,now);break;
    }
    case 'request_decline':{
      const a=get(s,'appointments',p.id);if(a.status==='declined')break;if(a.status!=='requested')fail('Este pedido já foi decidido.');
      for(const x of together(s,a))x.status='declined';log(s,`Pedido recusado: ${get(s,'clients',a.client_id).name}, ${a.date} às ${clock(a.start)}.`,now);break;
    }
    case 'catalog_import':{
      const names=new Set(s.services.map(v=>v.name.toLowerCase()));let added=0;
      for(const v of catalogoSantaCor())if(!names.has(v.name.toLowerCase())){s.services.push({...v,id:id('S')});added++;}
      log(s,`${added} serviço(s) das fichas adicionados ao catálogo.`,now);break;
    }
    case 'promo_save':{
      const target=get(s,'services',String(p.target||'')),trigger=String(p.trigger||'');
      if(trigger.startsWith('group:')){if(!s.services.some(v=>v.group===trigger.slice(6)))fail('Área não encontrada.');}else get(s,'services',trigger);
      if(target.addon||trigger===target.id||!['percent','amount'].includes(p.type)||!Number.isFinite(p.value)||p.value<=0||(p.type==='percent'&&p.value>90)||p.value>10000)fail('Confira a oferta: serviço, tipo e valor do desconto.');
      const values={trigger,target:target.id,type:p.type,value:p.value,active:p.active!==false};
      if(p.id)Object.assign(get(s,'promos',p.id),values);else s.promos.push({id:id('D'),...values});break;
    }
    case 'promo_remove':s.promos=s.promos.filter(d=>d.id!==p.id);break;
    case 'seek':seek(s,p.id,now);break;
    case 'response':{
      const text=String(p.text||'').trim();if(!text||text.length>1000)fail('Informe uma resposta de até 1.000 caracteres.');
      const answer=p.result||(replyIntent(text)==='yes'?'accepted':replyIntent(text)==='no'?'refused':'ambiguous');respond(s,p.id,text,answer,now);if(p.interpretation){const o=get(s,'offers',p.id),w=p.interpretation.window,keys=w&&typeof w==='object'?Object.keys(w):[];o.interpretation={note:String(p.interpretation.note||'').slice(0,200),window:keys.length===1&&['after','before'].includes(keys[0])&&/^([01]\d|2[0-3]):[0-5]\d$/.test(w[keys[0]])?w:null};}break;
    }
    case 'unanswered':{
      const o=get(s,'offers',p.id);if(o.status!=='pending')fail('Esta proposta já foi respondida.');o.status='unanswered';history(s,get(s,'clients',o.client_id),'unanswered',o.id,now);message(s,o.client_id,'agent','Como não obtivemos retorno, encerramos esta proposta. Seu horário original continua reservado.',{},now);next(s,o,now);break;
    }
    case 'approve':{
      const o=get(s,'offers',p.id);if(o.status==='approved')break;if(o.status!=='approval')fail('A cliente precisa aceitar antes da aprovação.');
      const g=get(s,'gaps',o.gap_id),a=get(s,'appointments',o.origin_id),c=get(s,'clients',o.client_id);
      if(g.status!=='open'||g.depth>s.settings.maxDepth||a.status!=='booked'||a.result||JSON.stringify(a)!==o.snapshot||hardReason(s,g,a,c,now,o.id))fail('A agenda mudou. Rejeite esta proposta e revise a disponibilidade.');
      const newGap=gapFrom(a,g.depth+1,g.root);Object.assign(a,{date:g.date,start:o.start,end:o.end,staff_id:g.staff_id,attendance:'yes',reminded:true,source_offer:o.id});
      g.status='filled';o.status='approved';s.gaps.push(newGap);
      if(o.end<g.end)s.gaps.push({...g,id:id('G'),start:o.end,price:g.price*(g.end-o.end)/(g.end-g.start),status:'open'});
      message(s,c.id,'agent',`Alteração confirmada ${p.approvedBy?'pela equipe':'pela gerência'}: ${a.date.split('-').reverse().join('/')} às ${clock(a.start)}, com ${get(s,'staff',a.staff_id).name}.`,{},now);
      log(s,`Remarcação aprovada: ${c.name}. O horário anterior foi liberado.`,now);if(s.settings.autoNext)seek(s,newGap.id,now);break;
    }
    case 'reject':{
      const o=get(s,'offers',p.id);if(o.status!=='approval')fail('Não há aprovação pendente.');o.status='rejected';get(s,'gaps',o.gap_id).status='stopped';message(s,o.client_id,'agent','A alteração não foi confirmada pela gerência. Seu horário original permanece reservado.',{},now);log(s,'Proposta rejeitada pela gerência.',now);break;
    }
    case 'presence':{
      const a=get(s,'appointments',p.id);if(a.status!=='booked'||a.result||!['yes','no'].includes(p.answer))fail('Confirmação indisponível.');
      if(p.answer==='no')return actAdmin(s,'cancel',{id:a.id},now);a.attendance='yes';log(s,`Presença confirmada: ${get(s,'clients',a.client_id).name}.`,now);break;
    }
    case 'close':{
      const a=get(s,'appointments',p.id);if(a.result)break;if(a.status!=='booked'||at(a)+(a.end-a.start)*60000>now||!['attended','missed'].includes(p.result))fail('Registre o resultado após o término do atendimento.');
      a.result=p.result;history(s,get(s,'clients',a.client_id),p.result,a.id,now);log(s,`${get(s,'clients',a.client_id).name}: ${p.result==='attended'?'atendimento realizado':'falta registrada'}.`,now);break;
    }
    case 'message':{
      const c=get(s,'clients',p.client_id),text=String(p.text||'').trim();if(!text||text.length>1000)fail('Informe até 1.000 caracteres.');message(s,c.id,p.direction==='incoming'?'client':'manager',text,{},now);break;
    }
    case 'settings':{
      const name=String(p.name||'').trim();if(!name||name.length>100||!Number.isFinite(p.minNotice)||p.minNotice<0.25||p.minNotice>48)fail('Confira nome e antecedência mínima.');
      s.salon.name=name;s.settings.minNotice=p.minNotice;s.settings.autoNext=!!p.autoNext;
      if(p.block!==undefined){if(![15,30,45,60,90].includes(p.block))fail('Escolha um bloco de 15, 30, 45, 60 ou 90 minutos.');s.settings.block=p.block;}
      if(p.hours!==undefined){
        const hours={};for(const [day,span] of Object.entries(p.hours||{})){if(!integer(Number(day),0,6)||!Array.isArray(span)||!integer(span[0],0,1439)||!integer(span[1],span[0]+1,1440))fail('Confira os horários de funcionamento.');hours[day]=[span[0],span[1]];}
        s.settings.hours=hours;
      }
      break;
    }
    case 'waitlist_add':{
      get(s,'clients',p.client_id);get(s,'services',p.service_id);if(!validDate(p.date))fail('Data inválida.');
      if(!s.waitlist.some(w=>w.client_id===p.client_id&&w.date===p.date&&w.status==='waiting'))s.waitlist.push({id:id('W'),client_id:p.client_id,service_id:p.service_id,date:p.date,status:'waiting'});break;
    }
    case 'waitlist_remove':get(s,'waitlist',p.id).status='closed';break;
    case 'tick':break;
    default:fail('Operação desconhecida.');
  }
  return s;
}
export function summary(s,date=today()){
  const appointments=s.appointments.filter(a=>a.date===date&&a.status==='booked');
  return {booked:appointments.length,revenue:appointments.reduce((n,a)=>n+(a.result==='missed'?0:a.price),0),confirmed:appointments.filter(a=>a.attendance==='yes').length,approval:s.offers.filter(o=>o.status==='approval').length,pending:s.offers.filter(o=>o.status==='pending').length,recovered:s.offers.filter(o=>o.status==='approved'&&o.date===date).reduce((n,o)=>n+o.end-o.start,0),occupancy:dayStats(s,date).occupancy};
}

// Same expected-vacancy measure as the Python implementation, scoped to a cancellation flow.
export function vacancy(s,root,now=Date.now()){
 const items=s.gaps.filter(g=>g.root===root),initial=items.find(g=>g.id===root);
 const empty=g=>{const d=dayStats(s,g.date);return (g.end-g.start)/60*difficulty((at(g)-now)/3600000,d.queue,d.occupancy);};
 let after=0;
 for(const g of items){
  if(g.status==='filled'){
   const o=s.offers.find(o=>o.gap_id===g.id&&o.status==='approved');
   if(o){const c=get(s,'clients',o.client_id);after+=(o.end-o.start)/60*rateMiss(c.missed,c.visits);}
  }else if(!s.appointments.some(a=>a.status==='booked'&&a.date===g.date&&a.staff_id===g.staff_id&&a.start<=g.start&&a.end>=g.end))after+=empty(g);
 }
 return {before:initial?empty(initial):0,after};
}
