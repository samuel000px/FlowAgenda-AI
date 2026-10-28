import {env} from 'cloudflare:workers';
import {connection,updateRoom} from '../../../../lib/whatsapp';
import {verifySignature,applyStatus,phone,incomingAllowed} from '../../../../lib/whatsapp-core.mjs';
import {digest} from '../../../../lib/calendar-core.mjs';
import {processWhatsAppInbox} from '../../../../lib/whatsapp-inbox';
import {getRequestExecutionContext} from 'vinext/shims/request-context';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const u=new URL(req.url),room=u.searchParams.get('room')||'',c=await connection(env,room);
 if(!c||u.searchParams.get('hub.mode')!=='subscribe'||await digest(u.searchParams.get('hub.verify_token')||'')!==await digest(c.verifyToken))return new Response('Verificação inválida.',{status:403});
 const challenge=u.searchParams.get('hub.challenge');if(!challenge||challenge.length>200)return new Response('Desafio inválido.',{status:400});
 await env.DB!.prepare('UPDATE whatsapp_connections SET webhook_verified=? WHERE room=?').bind(Date.now(),room).run();
 return new Response(challenge,{headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});
}
export async function POST(req:Request){
 try{
  if(Number(req.headers.get('content-length')||0)>262144)return new Response('Payload muito grande.',{status:413});
  const raw=await req.text();if(raw.length>262144)return new Response('Payload muito grande.',{status:413});
  const room=new URL(req.url).searchParams.get('room')||'',c=await connection(env,room);
  if(!c||!await verifySignature(raw,req.headers.get('x-hub-signature-256'),c.appSecret))return new Response('Assinatura inválida.',{status:403});
  const body=JSON.parse(raw);if(body.object!=='whatsapp_business_account')return new Response('Evento inválido.',{status:400});
  for(const entry of body.entry||[])for(const change of entry.changes||[]){
   const value=change.value;if(change.field!=='messages'||value?.metadata?.phone_number_id!==c.phoneId)continue;
   await updateRoom(env,room,s=>{
    for(const event of value.messages||[]){
     if(!event.id||!incomingAllowed(c,phone(event.from)))continue;
     s.whatsappInbox??=[];
     if(s.messages.some((m:any)=>m.sender==='client'&&m.whatsapp?.id===event.id)||s.whatsappInbox.some((i:any)=>i.event.id===event.id))continue;
     s.whatsappInbox.push({phoneId:c.phoneId,event:{id:String(event.id),from:phone(event.from),timestamp:String(event.timestamp),type:String(event.type),oversized:String(event.text?.body||'').length>1000,
      ...(event.text?.body?{text:{body:String(event.text.body).slice(0,1000)}}:{}),...(event.context?.id?{context:{id:String(event.context.id)}}:{}),
      ...(event.button?{button:{text:String(event.button.text||'').slice(0,100),payload:String(event.button.payload||'').slice(0,200)}}:{}),
      ...(event.interactive?.button_reply?{interactive:{button_reply:{id:String(event.interactive.button_reply.id),title:String(event.interactive.button_reply.title).slice(0,100)}}}:{})}});
    }
    for(const status of value.statuses||[])applyStatus(s,status,c.phoneId);
   });
   await env.DB!.prepare('UPDATE whatsapp_connections SET received=? WHERE room=?').bind(Date.now(),room).run();
  }
  const work=processWhatsAppInbox(env,room),ctx=getRequestExecutionContext();
  if(ctx)ctx.waitUntil(work.catch(()=>{/* Durable inbox will be retried on the next event or panel refresh. */}));else await work;
  return Response.json({received:true});
 }catch{return Response.json({error:'Não foi possível processar o evento. A Meta pode tentar novamente.'},{status:503});}
}
