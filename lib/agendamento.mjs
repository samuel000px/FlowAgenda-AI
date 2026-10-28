// Agendamento pela página pública, no formato de carrinho. A cliente só vê serviços, profissionais e
// horários livres; nome e telefone de outras clientes nunca saem daqui. Cada item do carrinho vira um
// atendimento, um depois do outro, com uma profissional por área (unhas, cabelo). O pedido segura os
// horários até a gerência aceitar ou recusar (status "requested").
import {actAdmin,at,clock,free,get,id,message,phoneKey,sameName,samePhone,together,today,readBirthday} from './flowagenda.mjs';
import {queueNewMessages} from './whatsapp-core.mjs';
const fail=text=>{throw Error(text)};
const weekday=date=>new Date(date+'T12:00:00Z').getUTCDay();
const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
const addDays=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const label=date=>date.split('-').reverse().join('/');
const cents=v=>Math.round(v*100)/100;
export const MAX_ITENS=3;

/** Telefone só com números e com o 55 do Brasil na frente, como o wa.me pede. */
export const phoneDigits=phoneKey;

const activeStaff=s=>s.staff.filter(p=>p.active!==false&&p.services?.length);
export function catalog(s){
  const staff=activeStaff(s),main=s.services.filter(v=>!v.addon&&staff.some(p=>p.services.includes(v.id)));
  const groups=[...new Set(main.map(v=>v.group))];
  return {
    salon:s.salon.name,block:s.settings.block,groups,
    services:main.map(({id,name,duration,price,group,variants})=>({id,name,duration,price,group,variants:variants||[]})),
    addons:s.services.filter(v=>v.addon&&groups.includes(v.group)).map(({id,name,price,group})=>({id,name,price,group})),
    staff:staff.map(({id,name,services})=>({id,name,services})),
    promos:s.promos.filter(d=>d.active&&main.some(v=>v.id===d.target)).map(({id,trigger,target,type,value})=>({id,trigger,target,type,value})),
  };
}

/** Os próximos dias em que o salão abre, a partir de hoje. */
export function openDays(s,now=Date.now()){
  const days=[],first=today(now);
  for(let i=0;i<s.settings.bookingDays;i++){const d=addDays(first,i);if(s.settings.hours[weekday(d)])days.push(d);}
  return days;
}

/**
 * Confere o carrinho e devolve cada item com duração e preço já resolvidos. Carrinho:
 * {items:[{service, variant, addons}], staff:{'Mãos e pés':'P1', Cabelo:''}}; profissional vazia = qualquer uma.
 */
export function readCart(s,cart){
  const list=Array.isArray(cart?.items)?cart.items:[];
  if(!list.length)fail('Escolha pelo menos um serviço.');
  if(list.length>MAX_ITENS)fail(`Escolha no máximo ${MAX_ITENS} serviços por pedido.`);
  const items=list.map(x=>{
    const svc=get(s,'services',String(x?.service||''));if(svc.addon)fail('Adicionais entram junto de um serviço.');
    const variant=svc.variants?.length?svc.variants[Number(x.variant)]||fail(`Escolha uma opção de ${svc.name}.`):null;
    const addons=[...new Set(Array.isArray(x.addons)?x.addons.map(String):[])].map(k=>get(s,'services',k));
    if(addons.some(a=>!a.addon||a.group!==svc.group))fail('Adicional não combina com o serviço.');
    const staff=String(cart.staff?.[svc.group]||'');if(staff&&!get(s,'staff',staff).services.includes(svc.id))fail('A profissional escolhida não faz este serviço.');
    return {svc,variant,addons,staff,duration:variant?.duration??svc.duration,base:variant?.price??svc.price};
  });
  if(new Set(items.map(x=>x.svc.id)).size<items.length)fail('Serviço repetido no carrinho.');
  return prices(s,items);
}

/**
 * Desconto do "Pegue também": vale no item alvo quando um item que entrou ANTES no carrinho é o
 * gatilho. Assim duas ofertas cruzadas (A→B e B→A) não dão desconto duplo. Fica o maior.
 */
export function prices(s,items){
  return items.map((x,i)=>{
    const others=items.slice(0,i);
    const discount=Math.max(0,...s.promos.filter(d=>d.active&&d.target===x.svc.id&&others.some(o=>d.trigger===o.svc.id||d.trigger==='group:'+o.svc.group))
      .map(d=>cents(Math.min(x.base,d.type==='percent'?x.base*d.value/100:d.value))));
    const extras=x.addons.reduce((n,a)=>n+a.price,0);
    return {...x,discount,price:cents(x.base-discount+extras)};
  });
}

/**
 * Para um início, encaixa os itens em sequência e escolhe, em cada área, uma profissional livre em
 * todos os itens daquela área (ou confere a escolhida). Devolve a profissional de cada item, ou null.
 */
export function fit(s,items,date,start,client=''){
  const hours=s.settings.hours[weekday(date)],starts=[];let cursor=start;
  for(const x of items){starts.push(cursor);cursor+=x.duration;}
  if(!hours||start<hours[0]||cursor>hours[1])return null;
  const chosen={};
  for(const group of new Set(items.map(x=>x.svc.group))){
    const mine=items.map((x,i)=>[x,i]).filter(([x])=>x.svc.group===group),wanted=mine[0][0].staff;
    const people=wanted?[get(s,'staff',wanted)]:activeStaff(s);
    const p=people.find(p=>p.active!==false&&mine.every(([x,i])=>p.services.includes(x.svc.id)&&free(s,client,p.id,date,starts[i],starts[i]+x.duration)));
    if(!p)return null;chosen[group]=p.id;
  }
  return items.map((x,i)=>({start:starts[i],end:starts[i]+x.duration,staff:chosen[x.svc.group]}));
}

/**
 * Inícios da grade em que o carrinho inteiro cabe em sequência, respeitando a antecedência mínima
 * (em horas). Na loja a cliente já está ali, então a antecedência é zero.
 */
export function slots(s,cart,date,now=Date.now(),lead=s.settings.minNotice){
  const items=readCart(s,cart),hours=s.settings.hours[weekday(date)];
  if(!validDate(date)||!hours||!openDays(s,now).includes(date))return [];
  const list=[];
  for(let start=hours[0];start<hours[1];start+=s.settings.block){
    if((at({date,start})-now)/3600000<lead)continue;
    const plan=fit(s,items,date,start);if(plan)list.push({start,time:clock(start),plan});
  }
  return list;
}

export function requestBooking(s,p,now=Date.now()){
  const name=String(p.name||'').trim().replace(/\s+/g,' '),phone=phoneDigits(p.phone);
  if(name.length<2||name.length>100)fail('Informe seu nome.');
  if(!/^55\d{10,11}$/.test(phone))fail('Informe um celular com DDD.');
  const items=readCart(s,p.cart),start=Number(p.start),date=String(p.date||'');
  if(!slots(s,p.cart,date,now).some(x=>x.start===start))fail('Este horário acabou de ser ocupado. Escolha outro.');
  let c=s.clients.find(c=>c.phone&&phoneDigits(c.phone)===phone);
  if(c&&new Set(s.appointments.filter(a=>a.client_id===c.id&&a.status==='requested').map(a=>a.order||a.id)).size>=3)fail('Você já tem pedidos aguardando confirmação. Fale com a gente pelo WhatsApp.');
  // Qualquer pessoa pode digitar qualquer celular, então o site só cria cadastro novo. Autorização,
  // nota e preferência de quem já é cliente ficam como a gerência deixou (e quem pediu para parar
  // as mensagens continua sem receber).
  const earlier=!!p.earlier,firstStaff=String(p.cart.staff?.[items[0].svc.group]||''),birthday=readBirthday(p.birthday);
  if(!c){c={id:id('C'),name,phone,consent:earlier,preferred:firstStaff,birthday,visits:0,missed:0,proposals:0,accepted:0};s.clients.push(c);}
  else if(birthday&&!c.birthday)c.birthday=birthday; // só preenche o que está vazio, nunca troca
  const plan=fit(s,items,date,start,c.id)||fail('Você já tem outro atendimento neste horário.');
  // Mesma regra do motor: quem escolheu um horário mais tarde havendo outros antes tende a não querer antecipar.
  const chosenLate=openDays(s,now).filter(d=>d<=date).some(d=>slots(s,p.cart,d,now).some(x=>d<date||x.start<start));
  const order=id('R'),token=crypto.randomUUID().replaceAll('-',''),linked=items.length>1;
  const created=items.map((x,i)=>({id:id('A'),client_id:c.id,service_id:x.svc.id,staff_id:plan[i].staff,date,start:plan[i].start,end:plan[i].end,price:x.price,
    ...(x.variant?{variant:x.variant.name}:{}),addons:x.addons.map(a=>({id:a.id,name:a.name,price:a.price})),discount:x.discount,
    status:'requested',attendance:'unknown',reminded:false,result:null,chosenLate,order,linked,token,source:'site',name,created:now}));
  s.appointments.push(...created);
  const resumo=created.map(a=>`${itemName(s,a)} às ${clock(a.start)} com ${get(s,'staff',a.staff_id).name}`).join('; ');
  message(s,c.id,'client',`Pedido pelo site${name!==c.name?` (nome informado: ${name})`:''} para ${label(date)}: ${resumo}.${earlier?' Quer ser avisada se abrir um horário mais cedo.':''}`,{appointment_id:created[0].id},now);
  s.events.unshift({id:id('E'),text:`Novo pedido pelo site: ${c.name}, ${date} às ${clock(start)}.`,created:now});
  return created;
}

/**
 * Horário marcado pela funcionária, para quem chegou na loja ou para outro dia: entra direto como
 * confirmado. A cliente vem da lista (client_id) ou é nova; nova com um número ou nome que já existe
 * é cruzada com o cadastro para não duplicar. Se a cliente da lista trocou de número, o novo
 * substitui o antigo. A resposta sobre antecipar é dada ali, pessoalmente, e vale para o cadastro.
 */
export function bookInStore(s,p,staffName,now=Date.now()){
  if(typeof p.earlier!=='boolean')fail('Pergunte se ela gostaria de antecipar caso apareça um horário mais cedo.');
  const items=readCart(s,p.cart),start=Number(p.start),date=String(p.date||'');
  if(!slots(s,p.cart,date,now,0).some(x=>x.start===start))fail('Este horário acabou de ser ocupado. Escolha outro.');
  const c=storeClient(s,p,items,staffName,now);
  const plan=fit(s,items,date,start,c.id)||fail('Esta cliente já tem outro atendimento neste horário.');
  const order=items.length>1?id('R'):undefined;
  const created=items.map((x,i)=>({id:id('A'),client_id:c.id,service_id:x.svc.id,staff_id:plan[i].staff,date,start:plan[i].start,end:plan[i].end,price:x.price,
    ...(x.variant?{variant:x.variant.name}:{}),addons:x.addons.map(a=>({id:a.id,name:a.name,price:a.price})),discount:x.discount,
    status:'booked',attendance:'unknown',reminded:false,result:null,chosenLate:false,...(order?{order,linked:true}:{}),source:'loja',created:now}));
  s.appointments.push(...created);
  s.events.unshift({id:id('E'),text:`${staffName} marcou: ${c.name}, ${label(date)} às ${clock(start)}.`,created:now});
  return created;
}

/**
 * A cliente que a funcionária escolheu (client_id) ou uma nova, cruzada com o cadastro: o mesmo
 * número vira a cliente dona dele; o mesmo nome só vira outro cadastro com newClient. Se a cliente
 * da lista trocou de número, o novo substitui o antigo. A resposta sobre antecipar vale para ela.
 */
function storeClient(s,p,items,staffName,now){
  const phone=p.phone?phoneDigits(p.phone):'';
  if(phone&&!/^55\d{10,11}$/.test(phone))fail('Confira o celular com DDD ou deixe em branco.');
  let c;
  if(p.client_id){
    c=get(s,'clients',String(p.client_id));
    if(phone&&phone!==phoneDigits(c.phone)){
      const dono=samePhone(s,phone,c.id);if(dono)fail(`Este número já está no cadastro de ${dono.name}.`);
      const antigo=phoneDigits(c.phone);c.phone=phone;
      s.events.unshift({id:id('E'),text:`${staffName} trocou o número de ${c.name}${antigo?` (final ${antigo.slice(-4)})`:''} pelo final ${phone.slice(-4)}.`,created:now});
    }
  }else{
    const name=String(p.name||'').trim().replace(/\s+/g,' ');
    if(name.length<2||name.length>100)fail('Informe o nome da cliente.');
    c=samePhone(s,phone);
    const xara=!c&&sameName(s,name)[0];
    if(xara&&!p.newClient)fail(`Já existe ${xara.name} no cadastro. Escolha ela na lista ou confirme que é outra pessoa.`);
    if(!c){c={id:id('C'),name,phone,consent:p.earlier,preferred:String(p.cart?.staff?.[items[0].svc.group]||''),visits:0,missed:0,proposals:0,accepted:0};s.clients.push(c);}
  }
  c.consent=p.earlier;
  const birthday=readBirthday(p.birthday);if(birthday)c.birthday=birthday;
  return c;
}

/** O salão abre neste dia da semana (pelo funcionamento em Configurações). */
export const openOn=(s,date)=>validDate(date)&&!!s.settings.hours[weekday(date)];

/** Dia sem nenhum horário livre para o carrinho, num dia em que o salão abre: "data cheia". */
const dateFull=(s,cart,date,now,lead)=>!!s.settings.hours[weekday(date)]&&validDate(date)&&date>=today(now)&&!slots(s,cart,date,now,lead).length;

/** Entrada da lista de espera com prioridade: quem demonstrou interesse numa data cheia vem primeiro. */
function interest(s,c,items,cart,date,source,now){
  if(s.waitlist.some(w=>w.client_id===c.id&&w.date===date&&w.status==='waiting'))fail('Já está na lista de espera desta data.');
  const w={id:id('W'),client_id:c.id,service_id:items[0].svc.id,staff_id:String(cart.staff?.[items[0].svc.group]||''),date,status:'waiting',priority:1,source,created:now,
    ...(items.length>1?{note:items.map(x=>x.svc.name).join(' + ')}:{})};
  s.waitlist.push(w);return w;
}

/** Pela equipe: data cheia, a cliente entra na lista de espera daquela data com prioridade. */
export function interestInStore(s,p,staffName,now=Date.now()){
  if(typeof p.earlier!=='boolean')fail('Pergunte se ela gostaria de antecipar caso apareça um horário mais cedo.');
  const items=readCart(s,p.cart),date=String(p.date||'');
  if(!dateFull(s,p.cart,date,now,0))fail('Esta data ainda tem horário livre. Marque direto.');
  const c=storeClient(s,p,items,staffName,now),w=interest(s,c,items,p.cart,date,'loja',now);
  s.events.unshift({id:id('E'),text:`${staffName} pôs ${c.name} na lista de espera de ${label(date)}.`,created:now});
  return w;
}

/**
 * Pelo site: data cheia, a cliente demonstra interesse e entra na lista de espera com prioridade. Como
 * no pedido, o celular de quem já é cliente só registra o interesse, sem mexer no cadastro.
 */
export function requestInterest(s,p,now=Date.now()){
  const name=String(p.name||'').trim().replace(/\s+/g,' '),phone=phoneDigits(p.phone);
  if(name.length<2||name.length>100)fail('Informe seu nome.');
  if(!/^55\d{10,11}$/.test(phone))fail('Informe um celular com DDD.');
  const items=readCart(s,p.cart),date=String(p.date||'');
  if(!openDays(s,now).includes(date)||!dateFull(s,p.cart,date,now,s.settings.minNotice))fail('Esta data ainda tem horário livre. Escolha um horário.');
  let c=samePhone(s,phone);
  if(c&&s.waitlist.filter(w=>w.client_id===c.id&&w.status==='waiting').length>=3)fail('Você já está na lista de espera de outras datas. Fale com a gente pelo WhatsApp.');
  const birthday=readBirthday(p.birthday);
  if(!c){c={id:id('C'),name,phone,consent:!!p.earlier,preferred:String(p.cart.staff?.[items[0].svc.group]||''),birthday,visits:0,missed:0,proposals:0,accepted:0};s.clients.push(c);}
  else if(birthday&&!c.birthday)c.birthday=birthday;
  const w=interest(s,c,items,p.cart,date,'site',now);if(name!==c.name)w.name=name;
  message(s,c.id,'client',`Interesse pelo site${name!==c.name?` (nome informado: ${name})`:''} em ${label(date)}: ${items.map(x=>x.svc.name).join(' + ')}. Data cheia, entrou na lista de espera.`,{},now);
  s.events.unshift({id:id('E'),text:`${c.name} demonstrou interesse em ${label(date)} pelo site (lista de espera).`,created:now});
  return {date,name:name.split(' ')[0],services:items.map(x=>x.svc.name)};
}

/** "Escova (Cabelo longo) + Babyliss": o nome do item com opção e adicionais. */
export function itemName(s,a){
  return get(s,'services',a.service_id).name+(a.variant?` (${a.variant})`:'')+(a.addons||[]).map(x=>' + '+x.name).join('');
}

export function byToken(s,token){
  const a=/^[0-9a-f]{32}$/.test(String(token||''))&&s.appointments.find(a=>a.token===token);
  return a||fail('Agendamento não encontrado. Confira o link.');
}

const states={requested:'Aguardando confirmação',booked:'Confirmado',cancelled:'Cancelado',withdrawn:'Cancelado',declined:'Não foi possível atender',expired:'Encerrado'};
export function publicView(s,a,now=Date.now()){
  const items=a.order?s.appointments.filter(x=>x.order===a.order).sort((x,y)=>x.start-y.start):[a],first=items[0];
  return {
    status:first.result?(first.result==='attended'?'Realizado':'Encerrado'):states[first.status]||first.status,
    open:['requested','booked'].includes(first.status)&&!first.result&&at(first)>now,
    // O nome digitado no pedido, nunca o do cadastro: quem tem só o celular não descobre de quem é.
    name:(a.name||get(s,'clients',a.client_id).name).split(' ')[0],date:first.date,time:clock(first.start),
    items:items.map(x=>({name:itemName(s,x),staff:get(s,'staff',x.staff_id).name,time:clock(x.start),end:clock(x.end),price:x.price,discount:x.discount||0})),
    total:cents(items.reduce((n,x)=>n+x.price,0)),
  };
}

/** A cliente cancela pelo link. Horários confirmados viram vaga e o motor procura quem antecipar. */
export function cancelByToken(s,token,now=Date.now()){
  const a=byToken(s,token);
  if(!publicView(s,a,now).open)fail('Este agendamento não pode mais ser cancelado por aqui.');
  const c=get(s,'clients',a.client_id),items=together(s,a);
  message(s,c.id,'client','Cancelou o agendamento pelo site.',{appointment_id:a.id},now);
  if(a.status==='requested'){for(const x of items)x.status='withdrawn';s.events.unshift({id:id('E'),text:`${c.name} desistiu do pedido de ${a.date} às ${clock(a.start)}.`,created:now});}
  else for(const x of items)actAdmin(s,'cancel',{id:x.id},now);
  return a;
}

/** Aplica uma mudança da parte pública e põe na fila do WhatsApp as mensagens novas da agente,
 * como o painel faz ao salvar (por exemplo a proposta que nasce de um cancelamento pelo link). */
export function changeWithWhatsApp(s,apply,config,now=Date.now()){
  const before=new Set(s.messages.map(m=>m.id)),result=apply(s);
  queueNewMessages(s,before,config,now);
  return result;
}
