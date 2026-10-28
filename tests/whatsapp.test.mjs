import test from 'node:test';
import assert from 'node:assert/strict';
import {seedAdmin,actAdmin,seek,tickAdmin,message,at} from '../lib/flowagenda.mjs';
import {awaitingReply,verifySignature,normalizeConfig,queueNewMessages,queueMessage,windowOpen,recipientError,payloadFor,receiveMessage,applyStatus,metaCall,replyContext,prepareDelivery} from '../lib/whatsapp-core.mjs';
const now=Date.parse('2026-10-28T08:00:00-03:00');
const config={phoneId:'12345678',version:'v26.0',allowed:['5581999999999','5581888888888'],accessToken:'test-token-not-a-real-credential',appSecret:'a'.repeat(32),enabled:true,verified:now};
function ready(){
 const s=seedAdmin();s.clients=[{id:'C1',name:'Ana',phone:config.allowed[0],consent:true,willingness:10,visits:20,missed:0,accepted:10,proposals:10},{id:'C2',name:'Bia',phone:config.allowed[1],consent:true,willingness:9,visits:20,missed:0,accepted:9,proposals:10}];
 s.staff=[{id:'P1',name:'Carla',active:true,start:480,end:1200,break_start:0,break_end:0,services:['S1']}];
 s.days={'2026-10-28':{occupancy:10,queue:0},'2026-10-30':{occupancy:100,queue:3}};
 s.appointments=s.clients.map((c,i)=>({id:'A'+i,client_id:c.id,service_id:'S1',staff_id:'P1',date:'2026-10-30',start:600+i*60,end:645+i*60,price:45,status:'booked',attendance:'unknown',reminded:false,result:null}));
 s.gaps=[{id:'G1',root:'G1',date:'2026-10-28',start:600,end:645,service_id:'S1',staff_id:'P1',price:45,depth:0,status:'open'}];
 const o=seek(s,'G1',now);assert.ok(o);s.whatsappLastInbound={[config.allowed[0]]:now-1000,[config.allowed[1]]:now-1000};
 const m=s.messages[0];queueMessage(s,m,config,now);m.whatsapp={...m.whatsapp,status:'sent',id:'wamid.proposal',sentAt:now};return {s,o,m};
}
const event=(text='sim',extra={})=>({id:'wamid.incoming',from:config.allowed[0],type:'text',timestamp:String((now+2000)/1000),text:{body:text},...extra});
test('test configuration validates credentials, version and participant list',()=>{
 const c=normalizeConfig({...config,allowed:config.allowed.join('\n')});assert.deepEqual(c.allowed,config.allowed);
 assert.throws(()=>normalizeConfig({...config,allowed:'123'}),/números/);
 assert.throws(()=>normalizeConfig({...config,allowed:config.allowed[0],version:'https://example.com'}),/versão/);
 assert.throws(()=>normalizeConfig({...config,allowed:config.allowed[0],appSecret:'bad'}),/App Secret/);
});
test('signed webhook accepts authentic raw bytes, rejects changed payload and missing signatures',async()=>{
 const raw=JSON.stringify({object:'whatsapp_business_account'}),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(config.appSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig='sha256='+Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw))).toString('hex');
 assert.equal(await verifySignature(raw,sig,config.appSecret),true);assert.equal(await verifySignature(raw+' ',sig,config.appSecret),false);assert.equal(await verifySignature(raw,null,config.appSecret),false);assert.equal(await verifySignature(raw,sig,'other'),false);
});
test('connecting never enrolls old drafts and respects automation pause',()=>{
 const {s}=ready();delete s.messages[0].whatsapp;const ids=new Set(s.messages.map(m=>m.id));queueNewMessages(s,ids,config,now);assert.equal(s.messages[0].whatsapp,undefined);
 message(s,'C1','agent','Nova mensagem',{},now);queueNewMessages(s,ids,{...config,enabled:false},now);assert.equal(s.messages.at(-1).whatsapp,undefined);
 queueNewMessages(s,ids,config,now);assert.equal(s.messages.at(-1).whatsapp.status,'queued');
});
test('recipient restrictions prevent sends to fictional, unconsented, duplicate or unlisted phones',()=>{
 const {s,m}=ready();delete m.whatsapp;s.clients[0].phone='';assert.throws(()=>queueMessage(s,m,config,now,true),/Cadastre/);
 s.clients[0].phone=config.allowed[0];s.clients[0].consent=false;assert.match(recipientError(s,'C1',config),/autorização/);
 s.clients[0].consent=true;s.clients[1].phone=s.clients[0].phone;assert.match(recipientError(s,'C1',config),/mais de um/);
 s.clients[1].phone=config.allowed[1];assert.match(recipientError(s,'C1',{...config,allowed:[]}),/lista/);
});
test('24-hour window only opens with a real inbound event, greeting is the only test template',()=>{
 const {s,m}=ready();delete m.whatsapp;s.whatsappLastInbound={};queueMessage(s,m,config,now);assert.equal(m.whatsapp.status,'waiting_window');
 assert.equal(windowOpen(s,config.allowed[0],now),false);message(s,'C1','client','Resposta manual',{},now);assert.equal(windowOpen(s,config.allowed[0],now),false);
 const hello={id:'Mabc',channel:'C1',sender:'manager',text:'Teste',template:'hello_world'};queueMessage(s,hello,config,now,true);assert.equal(hello.whatsapp.status,'queued');assert.equal(payloadFor(hello).template.name,'hello_world');
 receiveMessage(s,event('oi'),config,now+2000);assert.equal(windowOpen(s,config.allowed[0],now+2000),true);assert.equal(windowOpen(s,config.allowed[0],now+2000+24*3600000),false);
});
test('buttons reference a specific question and do not promise automatic approval',()=>{const {m}=ready(),p=payloadFor(m);assert.equal(p.type,'interactive');assert.equal(p.interactive.action.buttons[0].reply.id,`fa:${m.id}:yes`);assert.equal(p.biz_opaque_callback_data,m.id);});
test('acceptance waits for the manager and webhook replay cannot duplicate history',()=>{
 const {s,o}=ready(),before=structuredClone(s.appointments);assert.equal(receiveMessage(s,event(),config,now+2000),true);assert.equal(o.status,'approval');assert.deepEqual(s.appointments,before);
 const count=s.messages.length;assert.equal(receiveMessage(s,event(),config,now+3000),false);assert.equal(s.messages.length,count);assert.equal(s.history.length,1);
});
test('refusal advances to another eligible client without changing bookings',()=>{
 const {s,o}=ready(),before=structuredClone(s.appointments);receiveMessage(s,event('não'),config,now+2000);assert.equal(o.status,'refused');assert.equal(s.offers.find(o=>o.status==='pending').client_id,'C2');assert.deepEqual(s.appointments,before);
});
test('unknown quote, stale event and unrelated outgoing message cannot accept a proposal',()=>{
 for(const kind of ['quote','stale','other']){const {s,o,m}=ready();let e=event();if(kind==='quote')e.context={id:'wamid.other'};
 if(kind==='stale'){e.timestamp=String((now-20*60000)/1000);m.whatsapp.sentAt=now-30*60000;}
 if(kind==='other'){message(s,'C1','manager','Como posso ajudar?',{},now);const last=s.messages.at(-1);last.whatsapp={...m.whatsapp,id:'wamid.other'};}
 receiveMessage(s,e,config,now+2000);assert.equal(o.status,'pending',kind);assert.equal(s.messages.at(-1).sender,'client');}
});
test('an old or forged button cannot answer a different proposal',()=>{
 const {s,o,m}=ready();receiveMessage(s,event('',{type:'interactive',interactive:{button_reply:{id:'fa:M0000:yes',title:'Aceitar horário'}}}),config,now+2000);assert.equal(o.status,'pending');
 receiveMessage(s,event('',{id:'wamid.valid',type:'interactive',interactive:{button_reply:{id:`fa:${m.id}:yes`,title:'Aceitar horário'}}}),config,now+2000);assert.equal(o.status,'approval');
});
test('unsupported media, paused automation and unknown client cannot modify appointments',()=>{
 for(const kind of ['media','paused','unknown']){const {s,o}=ready();let e=event(),c=config;if(kind==='media')e={...e,type:'audio',text:undefined};if(kind==='paused')c={...config,enabled:false};if(kind==='unknown')s.clients[0].phone='';receiveMessage(s,e,c,now+2000);assert.equal(o.status,'pending');assert.equal(s.messages.at(-1).sender,'client');}
});
test('delivery callbacks are scoped to sender and recipient and cannot regress read to sent',()=>{
 const {s,m}=ready();applyStatus(s,{id:m.whatsapp.id,status:'read',recipient_id:config.allowed[0],timestamp:now/1000},'wrong');assert.equal(m.whatsapp.status,'sent');
 const status={id:m.whatsapp.id,status:'read',recipient_id:config.allowed[0],timestamp:now/1000};applyStatus(s,status,config.phoneId);assert.equal(m.whatsapp.status,'read');applyStatus(s,{...status,status:'sent'},config.phoneId);assert.equal(m.whatsapp.status,'read');applyStatus(s,{...status,status:'failed'},config.phoneId);assert.equal(m.whatsapp.status,'read');
});
test('callback can recover an uncertain send using its local message reference',()=>{const {s,m}=ready();m.whatsapp.status='unknown';delete m.whatsapp.id;applyStatus(s,{id:'wamid.recovered',biz_opaque_callback_data:m.id,status:'delivered',recipient_id:config.allowed[0],timestamp:now/1000},config.phoneId);assert.equal(m.whatsapp.id,'wamid.recovered');assert.equal(m.whatsapp.status,'delivered');});
test('30-minute attendance response cancels only the referenced future booking',()=>{
 const {s}=ready();s.offers=[];s.messages=[];const a=s.appointments[0],time=at(a)-20*60000;tickAdmin(s,time);const reminder=s.messages.find(m=>m.appointment_id===a.id);s.whatsappLastInbound[config.allowed[0]]=time;queueMessage(s,reminder,config,time);reminder.whatsapp={...reminder.whatsapp,status:'sent',sentAt:time,id:'wamid.reminder'};
 receiveMessage(s,event('não',{timestamp:String((time+2000)/1000),context:{id:'wamid.reminder'}}),config,time+2000);assert.equal(a.status,'cancelled');assert.equal(s.appointments[1].status,'booked');
});
test('rebooking invalidates the old reminder before any send or inbound mutation',()=>{const {s}=ready();s.offers=[];s.messages=[];const a=s.appointments[0],time=at(a)-20*60000;tickAdmin(s,time);const m=s.messages[0];s.whatsappLastInbound[config.allowed[0]]=time;queueMessage(s,m,config,time);m.whatsapp={...m.whatsapp,status:'sent',sentAt:time,id:'wamid.old'};a.start+=60;a.end+=60;receiveMessage(s,event('não',{timestamp:String((time+2000)/1000),context:{id:'wamid.old'}}),config,time+2000);assert.equal(a.status,'booked');});
test('API error messages never echo tokens and ambiguous HTTP failures are marked uncertain',async()=>{
 await assert.rejects(()=>metaCall(config,'123/messages','POST',{},async()=>{throw Error('SECRET-TOKEN');}),e=>e.uncertain&&!e.message.includes('SECRET'));
 await assert.rejects(()=>metaCall(config,'123/messages','POST',{},async()=>Response.json({error:{code:190,message:'SECRET-TOKEN'}},{status:400})),e=>!e.uncertain&&e.message.includes('expirou')&&!e.message.includes('SECRET'));
});

const business={...config,mode:'business',restricted:false,allowed:[],templates:{enabled:true,offer:'flowagenda_encaixe',reminder:'flowagenda_presenca',language:'pt_BR'}};
test('business mode allows consented registered customers beyond test list, while limited activation stays restricted',()=>{
 const {s}=ready();assert.equal(recipientError(s,'C1',business),'');assert.match(recipientError(s,'C1',{...business,restricted:true}),/lista/);
 s.clients[0].consent=false;assert.match(recipientError(s,'C1',business),/autorização/);
 assert.throws(()=>normalizeConfig({...config,mode:'business',allowed:'',restricted:true}),/autorizados/);
 const c=normalizeConfig({...config,mode:'business',allowed:'',restricted:false});assert.equal(c.templates.enabled,false);
 assert.throws(()=>normalizeConfig({...config,mode:'business',allowed:'',restricted:false,templates:{enabled:true}}),/dois modelos/);
});
test('business templates require explicit opt-in, fixed parameters and specific reply IDs',()=>{
 const {s,m}=ready();delete m.whatsapp;s.whatsappLastInbound={};queueMessage(s,m,{...business,templates:{...business.templates,enabled:false}},now);assert.equal(m.whatsapp.status,'waiting_window');
 queueMessage(s,m,business,now);assert.equal(m.whatsapp.status,'queued');const p=payloadFor(m);assert.equal(p.type,'template');assert.equal(p.template.name,'flowagenda_encaixe');assert.deepEqual(p.template.components[0].parameters.map(p=>p.text),['Ana','Manicure','28/10/2026 às 10:00','Carla']);assert.equal(p.template.components[1].parameters[0].payload,`fa:${m.id}:yes`);
 assert.equal(prepareDelivery(s,m,{...business,templates:{enabled:false}},now),false);assert.equal(m.whatsapp.template,undefined);
 s.whatsappLastInbound[config.allowed[0]]=now;assert.equal(prepareDelivery(s,m,business,now),true);assert.equal(payloadFor(m).type,'interactive');
});
test('business accounts cannot send test greeting and arbitrary text cannot bypass conversation window',()=>{
 const {s}=ready();s.whatsappLastInbound={};const hello={id:'Mabc',sender:'manager',channel:'C1',template:'hello_world',text:'Teste'};
 assert.throws(()=>queueMessage(s,hello,business,now,true),/teste/);
 const free={id:'Mdef',sender:'manager',channel:'C1',text:'Olá'};queueMessage(s,free,business,now);assert.equal(free.whatsapp.status,'waiting_window');
});
test('template quick replies bind to the correct sent offer and reject a mismatched quoted message',()=>{
 for(const wrong of [false,true]){const {s,o,m}=ready();const e=event('',{type:'button',text:undefined,button:{text:'Aceitar horário',payload:`fa:${m.id}:yes`},context:{id:wrong?'wamid.other':m.whatsapp.id}});receiveMessage(s,e,business,now+2000);assert.equal(o.status,wrong?'pending':'approval');}
});
test('business reminder template carries appointment information and cancellation is scoped to it',()=>{
 const {s}=ready();s.messages=[];s.offers=[];const a=s.appointments[0],time=at(a)-20*60000;tickAdmin(s,time);s.whatsappLastInbound={};const m=s.messages[0];queueMessage(s,m,business,time);assert.equal(payloadFor(m).template.name,'flowagenda_presenca');m.whatsapp={...m.whatsapp,status:'sent',id:'wamid.reminder',sentAt:time};receiveMessage(s,event('',{type:'button',text:undefined,timestamp:String((time+2000)/1000),button:{text:'Não vou comparecer',payload:`fa:${m.id}:no`},context:{id:m.whatsapp.id}}),business,time+2000);assert.equal(a.status,'cancelled');assert.equal(s.appointments[1].status,'booked');
});

test('opt-out removes contact consent without cancelling bookings and blocks subsequent sends',()=>{
 const {s,m}=ready(),before=structuredClone(s.appointments);receiveMessage(s,event('PARAR'),business,now+2000);assert.equal(s.clients[0].consent,false);assert.deepEqual(s.appointments,before);assert.match(recipientError(s,'C1',business),/autorização/);
});

test('conversa que o robô não resolve conta em "Responder WhatsApp" até alguém da equipe responder',()=>{
 const s=seedAdmin();s.clients=[{id:'C1',name:'Ana',phone:config.allowed[0],consent:true,visits:0,missed:0,accepted:0,proposals:0}];
 receiveMessage(s,event('Quero falar com uma atendente, por favor'),config,now+2000);
 receiveMessage(s,event('oi',{id:'wamid.outro',from:'5581777777777'}),{...config,allowed:[...config.allowed,'5581777777777']},now+2000);
 assert.deepEqual(awaitingReply(s).sort(),['C1','wa:5581777777777']);
 actAdmin(s,'message',{client_id:'C1',text:'Oi, Ana! Sou a Lia, como posso ajudar?'},now+3000);
 assert.deepEqual(awaitingReply(s),['wa:5581777777777']);
});
