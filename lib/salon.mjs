// Pure domain engine. Writes are committed with a database version check.
export const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export const overlap=(a,b)=>a.start<b.end&&a.end>b.start;
const fail=text=>{throw new Error(text)};
const id=prefix=>prefix+crypto.randomUUID().slice(0,12);
export const get=(s,table,key)=>s[table].find(x=>x.id===key)||fail('Registro não encontrado.');
export function message(s,channel,sender,text,extra={}){s.messages.push({id:id('m'),channel,sender,text,time:s.minute,...extra});s.messages=s.messages.slice(-500)}
function event(s,text,actor='Agenda'){s.events.unshift({id:id('e'),time:s.minute,actor,text});s.events=s.events.slice(0,100)}
export function seed(){
 const names=['Ana Lima','Beatriz Alves','Camila Rocha','Daniela Lima','Elisa Costa','Fernanda Melo','Gabriela Dias','Helena Reis','Ingrid Santos','Julia Moraes','Karina Silva','Larissa Gomes','Marina Souza','Natalia Barros','Olivia Ramos','Patricia Araujo','Rafaela Nunes','Sofia Martins','Isabela Costa','Joana Ribeiro','Luana Freitas','Marta Oliveira','Nicole Dias','Paula Castro','Renata Mendes','Sara Almeida','Talita Braga','Valeria Leal','Yasmin Lopes','Alice Teixeira','Bruna Pinheiro','Clara Dantas','Debora Pires','Ester Monteiro','Flavia Campos','Giovana Moura','Heloisa Cruz','Iara Lopes','Jessica Duarte','Livia Cardoso','Mirela Siqueira','Nara Azevedo','Priscila Vieira','Raquel Brito','Samara Cunha','Tainá Farias','Vanessa Tavares','Vitoria Sales','Wanda Maia','Zelia Coelho'];
 const s={minute:505,running:false,anchor:Date.now(),strategy:'occupancy',auto:true,clients:names.map((name,i)=>({id:`C${i+1}`,name,consent:i!==45&&i!==46,travel:10})),services:[{id:'S1',name:'Manicure',duration:15,buffer:0},{id:'S2',name:'Pedicure',duration:15,buffer:0},{id:'S3',name:'Pé e mão',duration:30,buffer:0},{id:'S4',name:'Esmaltação em gel',duration:45,buffer:0}],staff:[{id:'P1',name:'Lia',services:['S1','S2','S3','S4'],start:540,end:1080,break_start:720,break_end:780},{id:'P2',name:'Nina',services:['S1','S2','S3'],start:540,end:1080,break_start:720,break_end:780},{id:'P3',name:'Rafa',services:['S1','S4'],start:540,end:1080,break_start:720,break_end:780}],appointments:[],waitlist:[],offers:[],messages:[],events:[],aiUses:0};
 for(let i=0;i<18;i++){const p=i%3,start=540+Math.floor(i/3)*45,service=p===0?'S3':'S1';s.appointments.push({id:`A${i+1}`,client_id:`C${i+1}`,staff_id:`P${p+1}`,service_id:service,start,end:start+(service==='S3'?30:15),status:'booked',attendance:'unknown',reminded:false})}
 for(let i=18;i<50;i++)s.waitlist.push({id:`W${i+1}`,client_id:`C${i+1}`,service_id:['S1','S2','S3','S4'][(i-18)%4],staff_id:i%5===0?'P2':'',earliest:540+(i%7===0?60:0),latest:1080,status:'waiting',order:i});
 message(s,'manager','agent','Bom dia! Às 08:30, vou perguntar às clientes das 09:00 se elas vêm. Se uma recusar, preparo um encaixe e acompanho a resposta.');event(s,'Sala criada com 50 clientes fictícias.');return s;
}
export function free(s,client,staff,start,end,exclude=''){
 const p=get(s,'staff',staff);return start>=p.start&&end<=p.end&&!(p.break_start<p.break_end&&overlap({start,end},{start:p.break_start,end:p.break_end}))&&!s.appointments.some(a=>a.id!==exclude&&a.status==='booked'&&(a.client_id===client||a.staff_id===staff)&&overlap(a,{start,end}));
}
function available(s,g,w,cursor=g.start){
 const c=get(s,'clients',w.client_id),service=get(s,'services',w.service_id),p=get(s,'staff',g.staff_id);
 if(w.status!=='waiting'||!c.consent||(w.staff_id&&w.staff_id!==g.staff_id)||!p.services.includes(w.service_id)||s.offers.some(o=>o.status==='pending'&&o.client_id===w.client_id)||s.offers.some(o=>o.gap_id===g.id&&o.waitlist_id===w.id&&['refused','expired'].includes(o.status)))return null;
 const length=service.duration+service.buffer;
 for(let start=Math.ceil(Math.max(cursor,g.start,w.earliest,s.minute+c.travel+1)/5)*5;start+length<=Math.min(g.end,w.latest);start+=5){const end=start+length;if(free(s,w.client_id,g.staff_id,start,end)&&!s.offers.some(o=>o.status==='pending'&&o.staff_id===g.staff_id&&overlap(o,{start,end})))return {waitlist_id:w.id,client_id:w.client_id,service_id:w.service_id,staff_id:g.staff_id,start,end,order:w.order}}
 return null;
}
export function plan(s,gapId){
 const g=get(s,'appointments',gapId);if(g.status!=='cancelled')return [];
 const candidates=s.waitlist.filter(w=>w.status==='waiting');
 if(s.strategy==='fifo')return candidates.sort((a,b)=>a.order-b.order).map(w=>available(s,g,w)).filter(Boolean).slice(0,1);
 // Bounded beam search considers windows, travel, duration and skill. FIFO breaks ties.
 let beam=[{items:[],cursor:g.start,filled:0,order:0}],best=beam[0];
 for(let depth=0;depth<12;depth++){const next=[];for(const state of beam)for(const w of candidates){if(state.items.some(x=>x.client_id===w.client_id))continue;const item=available(s,g,w,state.cursor);if(item)next.push({items:[...state.items,item],cursor:item.end,filled:state.filled+item.end-item.start,order:state.order+w.order})}if(!next.length)break;next.sort((a,b)=>b.filled-a.filled||a.order-b.order||a.cursor-b.cursor);if(next[0].filled>best.filled||(next[0].filled===best.filled&&next[0].order<best.order))best=next[0];beam=next.slice(0,40)}return best.items;
}
export function seek(s,gapId){
 const existing=s.offers.find(o=>o.gap_id===gapId&&o.status==='pending');if(existing)return existing;
 const g=get(s,'appointments',gapId);if(g.status!=='cancelled')fail('Este atendimento ainda está reservado.');
 const planned=plan(s,gapId),choice=planned[0];
 if(!choice){if(!g.noMatch){message(s,'manager','agent',`Sem cliente compatível para o espaço livre de ${clock(g.start)}–${clock(g.end)} com ${get(s,'staff',g.staff_id).name}.`);g.noMatch=true}return null}g.noMatch=false;
 const o={...choice,id:id('O'),gap_id:gapId,status:'pending',version:1,expires:Math.min(s.minute+10,choice.start-get(s,'clients',choice.client_id).travel),created:s.minute};s.offers.push(o);
 const name=get(s,'clients',o.client_id).name,svc=get(s,'services',o.service_id).name;
 message(s,o.client_id,'agent',`Oi, ${name.split(' ')[0]}! Abriu um horário para ${svc} às ${clock(o.start)}, com ${get(s,'staff',o.staff_id).name}. Você consegue vir? Responda até ${clock(o.expires)}.`,{offer_id:o.id});
 message(s,'manager','agent',`Posso encaixar ${name} às ${clock(o.start)}. Enviei a proposta de ${svc} e aguardo a confirmação. O plano pode aproveitar ${planned.reduce((n,x)=>n+x.end-x.start,0)} minutos desta vaga.`,{offer_id:o.id});event(s,`Oferta para ${name}: ${clock(o.start)}–${clock(o.end)}.`,'Encaixe');return o;
}
export function tick(s,now=Date.now()){
 if(s.running){const passed=Math.floor((now-s.anchor)/60000);if(passed>0){s.minute=Math.min(1439,s.minute+passed);s.anchor+=passed*60000}}
 for(const o of s.offers)if(o.status==='pending'&&s.minute>=o.expires){o.status='expired';message(s,o.client_id,'agent','O prazo desta proposta terminou. Seu nome continua na lista de espera.');message(s,'manager','agent',`A proposta de ${get(s,'clients',o.client_id).name} expirou. Vou consultar a próxima opção.`);event(s,'Proposta expirada; nenhuma reserva criada.','Atendimento')}
 for(const a of s.appointments)if(a.status==='booked'&&!a.reminded&&a.attendance==='unknown'&&a.start-s.minute<=30&&a.start>s.minute){a.reminded=true;message(s,a.client_id,'agent',`Seu atendimento de ${get(s,'services',a.service_id).name} é às ${clock(a.start)} com ${get(s,'staff',a.staff_id).name}. Você confirma que vem?`,{appointment_id:a.id});message(s,'manager','agent',`Pedi a confirmação de ${get(s,'clients',a.client_id).name} para ${clock(a.start)}. Sem resposta, o horário continua reservado.`);event(s,`Confirmação enviada a ${get(s,'clients',a.client_id).name}.`,'Presença')}
 if(s.auto)for(const g of s.appointments.filter(a=>a.status==='cancelled'&&a.end>s.minute))seek(s,g.id);
}
export function revise(s,o,start,serviceId=o.service_id){
 if(o.status!=='pending'||s.minute>=o.expires)fail('Esta oferta não está mais disponível.');
 const g=get(s,'appointments',o.gap_id),w=get(s,'waitlist',o.waitlist_id),c=get(s,'clients',o.client_id),svc=get(s,'services',serviceId),p=get(s,'staff',o.staff_id),end=start+svc.duration+svc.buffer;
 if(!Number.isInteger(start)||!c.consent||!p.services.includes(serviceId)||start<Math.max(g.start,w.earliest,s.minute+c.travel)||end>Math.min(g.end,w.latest)||!free(s,c.id,p.id,start,end))fail('Esse horário ou serviço não cabe na vaga e na disponibilidade da cliente.');
 o.start=start;o.end=end;o.service_id=serviceId;o.version++;o.expires=Math.min(o.expires,start-c.travel);message(s,c.id,'agent',`Podemos ajustar para ${clock(start)}–${clock(end)}, ${svc.name}. Confira e confirme a nova proposta.`,{offer_id:o.id});event(s,'Alteração validada, aguardando confirmação.','Atendimento');
}
export function act(s,action,p={},role='manager'){
 tick(s);
 if(['advance','running','settings','seek','cancel','manager_message','service','request_presence'].includes(action)&&role!=='manager')fail('Esta ação é exclusiva do gerente.');
 switch(action){
 case 'advance':if(![5,15,30].includes(p.minutes))fail('Avance 5, 15 ou 30 minutos.');s.minute=Math.min(1439,s.minute+p.minutes);s.anchor=Date.now();break;
 case 'running':s.running=!!p.value;s.anchor=Date.now();break;
 case 'settings':if(!['fifo','occupancy'].includes(p.strategy))fail('Estratégia inválida.');s.strategy=p.strategy;s.auto=!!p.auto;break;
 case 'service':{const svc=get(s,'services',p.id);if(!Number.isInteger(p.duration)||p.duration<5||p.duration>120||p.duration%5)fail('Use de 5 a 120 minutos em passos de 5.');svc.duration=p.duration;break}
 case 'request_presence':{const a=get(s,'appointments',p.id);if(a.status!=='booked')fail('Atendimento cancelado.');if(!a.reminded){a.reminded=true;message(s,a.client_id,'agent',`Você confirma seu atendimento às ${clock(a.start)}?`,{appointment_id:a.id})}break}
 case 'cancel':{const a=get(s,'appointments',p.id);if(a.status==='cancelled')break;if(a.start<=s.minute)fail('Só é possível cancelar atendimentos futuros.');a.status='cancelled';message(s,'manager','agent',`Horário de ${get(s,'clients',a.client_id).name} liberado. Vou buscar um encaixe.`);event(s,`Cancelamento: ${a.id}.`);break}
 case 'attendance':{const a=get(s,'appointments',p.id);if(a.client_id!==p.client_id)fail('Cliente inválida.');if(a.status!=='booked'||!a.reminded||a.start<=s.minute)fail('Confirmação indisponível.');if(!['yes','no'].includes(p.answer))fail('Escolha uma resposta.');if(a.attendance!=='unknown')break;a.attendance=p.answer;if(p.answer==='no')a.status='cancelled';message(s,a.client_id,'client',p.answer==='yes'?'Sim, vou ao atendimento.':'Não vou conseguir ir. Pode liberar meu horário.');message(s,a.client_id,'agent',p.answer==='yes'?'Presença confirmada. Até já!':'Entendido! Liberei este horário. A equipe pode ajudar você a remarcar.');message(s,'manager','agent',`${get(s,'clients',a.client_id).name} ${p.answer==='yes'?'confirmou presença.':'não poderá vir. Vou procurar uma substituta na lista.'}`);event(s,`Presença ${p.answer==='yes'?'confirmada':'recusada'}: ${a.id}.`,'Presença');break}
 case 'seek':seek(s,p.id);break;
 case 'offer':{
 const o=get(s,'offers',p.id);if(o.client_id!==p.client_id)fail('Cliente inválida.');if(o.status==='accepted'&&p.answer==='yes')break;if(o.status!=='pending'||s.minute>=o.expires)fail('Proposta encerrada. Atualize a conversa.');if(o.version!==p.version)fail('A proposta mudou. Confira os novos detalhes.');if(!['yes','no'].includes(p.answer))fail('Escolha uma resposta.');
 if(p.answer==='no'){o.status='refused';message(s,o.client_id,'client','Não consigo aceitar este encaixe.');message(s,o.client_id,'agent','Tudo bem. Você continua na lista de espera.');message(s,'manager','agent',`${get(s,'clients',o.client_id).name} recusou o encaixe. Vou consultar outra cliente.`)}
 else{const c=get(s,'clients',o.client_id),w=get(s,'waitlist',o.waitlist_id),svc=get(s,'services',o.service_id),g=get(s,'appointments',o.gap_id),staff=get(s,'staff',o.staff_id);if(!c.consent||w.status!=='waiting'||!staff.services.includes(o.service_id)||(w.staff_id&&w.staff_id!==o.staff_id)||o.start<Math.max(g.start,w.earliest,s.minute+c.travel)||o.end>Math.min(g.end,w.latest)||o.end-o.start!==svc.duration+svc.buffer||!free(s,o.client_id,o.staff_id,o.start,o.end))fail('A disponibilidade mudou. Peça uma nova proposta.');o.status='accepted';w.status='booked';s.appointments.push({id:id('A'),client_id:o.client_id,staff_id:o.staff_id,service_id:o.service_id,start:o.start,end:o.end,status:'booked',attendance:'yes',reminded:true,source_offer:o.id});message(s,o.client_id,'client','Confirmo este encaixe.');message(s,o.client_id,'agent',`Agendado! Esperamos você às ${clock(o.start)}.`);message(s,'manager','agent',`${c.name} confirmou! Recuperei ${o.end-o.start} minutos. Vou verificar se cabe outra pessoa na vaga restante.`);event(s,`Encaixe confirmado: ${c.name}.`,'Encaixe')}break}
 case 'revise':{const o=get(s,'offers',p.id);if(o.client_id!==p.client_id)fail('Cliente inválida.');revise(s,o,p.start,p.service_id);break}
 case 'manager_message':{const text=String(p.text||'').trim();if(!text||text.length>1000)fail('Escreva até 1.000 caracteres.');message(s,'manager','manager',text);message(s,'manager','agent',`Agora são ${clock(s.minute)}: há ${s.appointments.filter(a=>a.status==='booked').length} atendimentos e ${s.offers.filter(o=>o.status==='pending').length} proposta(s) pendentes. Use “Verificar vagas” para buscar encaixes. A interpretação de mensagens livres está disponível no modo Gemini.`);break}
 case 'client_message':{const c=get(s,'clients',p.client_id),text=String(p.text||'').trim();if(!text||text.length>1000)fail('Escreva até 1.000 caracteres.');message(s,c.id,'client',text);message(s,c.id,'agent','Recebi sua mensagem. Registre sua decisão nos botões de presença ou de encaixe abaixo. Para outro horário, use “Pedir alteração”.');break}
 case 'tick':break;
 default:fail('Ação desconhecida.');
 }tick(s);return s;
}
export function metrics(s){return {recovered:s.appointments.filter(a=>a.status==='booked'&&a.source_offer).reduce((n,a)=>n+a.end-a.start,0),booked:s.appointments.filter(a=>a.status==='booked').length,pending:s.offers.filter(o=>o.status==='pending').length,waiting:s.waitlist.filter(w=>w.status==='waiting').length}}
