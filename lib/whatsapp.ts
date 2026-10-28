import {seal,unseal,nonce} from './calendar-core.mjs';
import {upgrade,tickAdmin} from './flowagenda.mjs';
import {normalizeConfig,queueNewMessages,recipientError,currentQuestion,prepareDelivery,payloadFor,metaCall,SENT,phone} from './whatsapp-core.mjs';
type Env=Cloudflare.Env;
export async function connection(env:Env,room:string):Promise<any>{
 const row=await env.DB!.prepare('SELECT * FROM whatsapp_connections WHERE room=?').bind(room).first<any>();
 if(!row)return null;
 return {...JSON.parse(row.settings),...await unseal(row.secrets,env.CALENDAR_ENCRYPTION_KEY,'whatsapp:'+room),phoneId:row.phone_id,verified:row.verified,webhookVerified:row.webhook_verified,received:row.received,created:row.created};
}
export async function whatsappStatus(env:Env,room:string){
 const c=await connection(env,room);
 return c?{configured:true,phoneId:c.phoneId,version:c.version,mode:c.mode||'test',restricted:c.restricted!==false,templates:c.templates||{enabled:false,language:'pt_BR',offer:'',reminder:''},allowed:c.allowed,enabled:c.enabled,verified:c.verified,webhookVerified:c.webhookVerified,received:c.received,schedulerChecked:c.schedulerChecked||0,schedulerError:c.schedulerError||'',verifyToken:c.verifyToken,displayPhone:c.displayPhone||'',name:c.name||''}:{configured:false,enabled:false,allowed:[],version:'v26.0'};
}
export async function saveConnection(env:Env,room:string,input:any){
 const old=await connection(env,room),c=normalizeConfig(input,old||{}),changed=old?.phoneId!==c.phoneId||old?.appSecret!==c.appSecret;
 // Read-only validation. Saving credentials never sends a WhatsApp message.
 const identity=await metaCall(c,`${c.phoneId}?fields=id,display_phone_number,verified_name`);
 if(identity.id!==c.phoneId)throw Error('A Meta não confirmou o ID deste telefone.');
 const verifyToken=changed?nonce():old.verifyToken;
 const secrets=await seal({accessToken:c.accessToken,appSecret:c.appSecret,verifyToken},env.CALENDAR_ENCRYPTION_KEY,'whatsapp:'+room);
 const settings=JSON.stringify({allowed:c.allowed,version:c.version,mode:c.mode,restricted:c.restricted,templates:c.templates,enabled:c.enabled,schedulerChecked:old?.schedulerChecked||0,schedulerError:old?.schedulerError||'',displayPhone:identity.display_phone_number||'',name:identity.verified_name||''});
 try{await env.DB!.prepare('INSERT INTO whatsapp_connections(room,phone_id,secrets,settings,verified,webhook_verified,created) VALUES(?,?,?,?,?,?,?) ON CONFLICT(room) DO UPDATE SET phone_id=excluded.phone_id,secrets=excluded.secrets,settings=excluded.settings,verified=excluded.verified,webhook_verified=excluded.webhook_verified').bind(room,c.phoneId,secrets,settings,Date.now(),changed?0:old.webhookVerified,Date.now()).run();}
 catch{throw Error('Não foi possível salvar. Este número pode estar conectado a outra esmalteria.');}
}
// All mutations use the same room version as the existing administration endpoints.
export async function updateRoom(env:Env,room:string,mutate:(state:any)=>void,config?:any){
 for(let attempt=0;attempt<6;attempt++){
  const row=await env.DB!.prepare('SELECT state,version FROM rooms WHERE id=?').bind(room).first<any>();
  if(!row)throw Error('Cadastro administrativo não encontrado.');
  const state=upgrade(JSON.parse(row.state)),ids=new Set(state.messages.map((m:any)=>m.id));
  mutate(state);queueNewMessages(state,ids,config);
  const encoded=JSON.stringify(state);if(encoded===row.state)return state;
  const r=await env.DB!.prepare('UPDATE rooms SET state=?,version=version+1,updated=? WHERE id=? AND version=?').bind(encoded,Date.now(),room,row.version).run();
  if(r.meta.changes)return state;
 }
 throw Error('A agenda está recebendo outra atualização. Tente novamente.');
}
export async function flushWhatsApp(env:Env,room:string){
 const config=await connection(env,room);if(!config?.verified)return;
 // A claim is persisted before each HTTP call. Ambiguous timeouts are never auto-retried.
 for(let count=0;count<4;count++){
  let claimed:any=null;
  await updateRoom(env,room,state=>{
   claimed=null;const now=Date.now();
   for(const m of state.messages){
    const w=m.whatsapp;if(!w)continue;
    if(w.status==='sending'&&w.attemptAt<now-60000){w.status='unknown';w.error='Envio sem confirmação. Confira a conversa antes de reenviar.';}
    if(!['queued','waiting_window'].includes(w.status)||(!config.enabled&&!w.manual))continue;
    const reason=recipientError(state,m.channel,config);
    if(w.phoneId!==config.phoneId||phone(state.clients.find((c:any)=>c.id===m.channel)?.phone)!==w.to||reason||!currentQuestion(state,m,now)){w.status='blocked';w.error=reason||'Conexão, telefone ou agendamento alterado. Revise a mensagem.';continue;}
    if(m.template&&config.mode==='business'){w.status='blocked';w.error='Saudação de teste desativada para o número da esmalteria.';continue;}
    if(!prepareDelivery(state,m,config,now)){w.status='waiting_window';continue;}
    w.status='sending';w.attemptAt=now;w.sentAt=now;w.attempt=nonce();claimed=structuredClone(m);break;
   }
  });
  if(!claimed)break;
  try{
   const reply=await metaCall(config,`${config.phoneId}/messages`,'POST',payloadFor(claimed));
   if(!reply.messages?.[0]?.id){const e:any=Error('A Meta não confirmou o identificador. Confira a conversa antes de reenviar.');e.uncertain=true;throw e;}
   await updateRoom(env,room,state=>{const m=state.messages.find((m:any)=>m.id===claimed.id);if(!m||m.whatsapp.attempt!==claimed.whatsapp.attempt)return;m.whatsapp.id=reply.messages[0].id;if(!SENT.includes(m.whatsapp.status)&&m.whatsapp.status!=='failed')m.whatsapp.status='accepted';if(m.whatsapp.status!=='failed')delete m.whatsapp.error;});
  }catch(e:any){await updateRoom(env,room,state=>{const m=state.messages.find((m:any)=>m.id===claimed.id);if(m?.whatsapp.attempt===claimed.whatsapp.attempt&&!SENT.includes(m.whatsapp.status)){m.whatsapp.status=e.uncertain?'unknown':'failed';m.whatsapp.error=e.message;}});}
 }
}
export async function tickWhatsApp(env:Env,room:string){const c=await connection(env,room);if(!c?.enabled)return;await updateRoom(env,room,s=>{tickAdmin(s);},c);await flushWhatsApp(env,room);}
