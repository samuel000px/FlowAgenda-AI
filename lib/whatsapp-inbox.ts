import {connection,updateRoom,flushWhatsApp} from './whatsapp';
import {receiveMessage,replyContext} from './whatsapp-core.mjs';
import {classifyResponse} from './response-agent';
import {replyIntent} from './conversation.mjs';
// Webhooks are acknowledged only after the inbox is durable. A later panel refresh
// retries pending work if the worker is stopped while interpreting a response.
export async function processWhatsAppInbox(env:Cloudflare.Env,room:string){
 const c=await connection(env,room);if(!c)return;
 for(let count=0;count<5;count++){
  // Fila vazia (o normal): o próprio banco responde, sem trazer o cadastro inteiro para o servidor.
  const fila=await env.DB!.prepare("SELECT json_array_length(state,'$.whatsappInbox') AS n FROM rooms WHERE id=?").bind(room).first<any>();
  if(!fila?.n)break;
  const row=await env.DB!.prepare('SELECT state FROM rooms WHERE id=?').bind(room).first<any>();if(!row)break;
  const state=JSON.parse(row.state),item=state.whatsappInbox?.[0];if(!item)break;
  const event=item.event,context=replyContext(state,event,c);let interpretation:any=null,expectedContext='';
  if(item.phoneId===c.phoneId&&c.enabled&&context?.offer_id&&event.type==='text'&&!event.oversized&&!replyIntent(event.text?.body||'')&&!state.messages.some((m:any)=>m.whatsapp?.id===event.id)&&env.GEMINI_API_KEY){
   const quota=await env.DB!.prepare('INSERT INTO limits(id,used) VALUES(?,1) ON CONFLICT(id) DO UPDATE SET used=used+1 WHERE used<100 RETURNING used').bind('responses:'+room+':'+new Date().toISOString().slice(0,10)).first();
   if(quota)try{interpretation=await classifyResponse(context.text,String(event.text?.body||'').slice(0,1000),env.GEMINI_API_KEY,env.GEMINI_MODEL);expectedContext=context.id;}catch{/* A model outage cannot drop an incoming reply. */}
  }
  await updateRoom(env,room,s=>{
   if(!s.whatsappInbox?.some((i:any)=>i.event.id===event.id))return;
   if(item.phoneId===c.phoneId){const current=replyContext(s,event,c);receiveMessage(s,event,c,Date.now(),current?.id===expectedContext?interpretation:null);}
   s.whatsappInbox=s.whatsappInbox.filter((i:any)=>i.event.id!==event.id);
  },c);
 }
 await flushWhatsApp(env,room);
}
