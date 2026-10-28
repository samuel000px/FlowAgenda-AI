import {env} from 'cloudflare:workers';
import {requireAdmin,sameOrigin} from '../../../lib/admin-auth';
import {connection,saveConnection,whatsappStatus,updateRoom,flushWhatsApp} from '../../../lib/whatsapp';
import {queueMessage,phone} from '../../../lib/whatsapp-core.mjs';
import {message} from '../../../lib/flowagenda.mjs';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){try{const room=await requireAdmin(req,env);return json({...await whatsappStatus(env,room),webhookPath:'/api/whatsapp/webhook?room='+encodeURIComponent(room)});}catch(e){return json({error:(e as Error).message},/Entre/.test((e as Error).message)?401:400);}}
export async function POST(req:Request){
 try{
  sameOrigin(req);const room=await requireAdmin(req,env),raw=await req.text();if(raw.length>12000)return json({error:'Solicitação muito longa.'},413);
  const p=JSON.parse(raw);
  if(p.action==='connect')await saveConnection(env,room,p);
  else if(p.action==='disconnect'){
   await updateRoom(env,room,s=>{for(const m of s.messages){if(['queued','waiting_window'].includes(m.whatsapp?.status)){m.whatsapp.status='blocked';m.whatsapp.error='Conexão desconectada. Revise antes de reenviar.';}}});
   await env.DB!.prepare('DELETE FROM whatsapp_connections WHERE room=?').bind(room).run();
  }
  else{
   const c=await connection(env,room);if(!c?.verified)throw Error('Configure e valide a conexão em Integrações.');
   if(p.action==='greeting'&&c.mode==='business')throw Error('No número da esmalteria, peça à cliente para enviar a primeira mensagem ou configure os modelos aprovados.');
   if(['send','greeting','retry'].includes(p.action)){
    await updateRoom(env,room,state=>{
     let m;
     if(p.action==='retry'){
      m=state.messages.find((m:any)=>m.id===p.id&&m.sender!=='client');if(!m)throw Error('Mensagem não encontrada.');
      if(m.whatsapp?.status==='unknown')throw Error('O envio não pôde ser confirmado. Confira a conversa antes de escrever outra mensagem.');
     }else{
      const text=String(p.text||'').trim();if(p.action==='send'&&(!text||text.length>1000))throw Error('Escreva uma mensagem de até 1.000 caracteres.');
      if(!/^[a-f0-9-]{36}$/i.test(p.requestId||''))throw Error('Atualize a página e tente novamente.');
      m=state.messages.find((m:any)=>m.requestId===p.requestId);
      if(!m){
       if(p.action==='greeting'){
        const client=state.clients.find((x:any)=>x.id===p.clientId),to=phone(client?.phone);
        if(state.messages.some((x:any)=>x.template==='hello_world'&&x.whatsapp?.to===to&&x.created>Date.now()-60000))throw Error('Aguarde um minuto antes de enviar outra saudação.');
       }
       message(state,p.clientId,'manager',p.action==='greeting'?'Saudação de teste da Meta (hello_world). Responda no WhatsApp para iniciar o atendimento.':text,{requestId:p.requestId,...(p.action==='greeting'?{template:'hello_world'}:{})});m=state.messages.at(-1);
      }
     }
     queueMessage(state,m,c,Date.now(),true);
    });
   }else if(p.action!=='flush')throw Error('Operação desconhecida.');
   await flushWhatsApp(env,room);
  }
  return json({...await whatsappStatus(env,room),webhookPath:'/api/whatsapp/webhook?room='+encodeURIComponent(room)});
 }catch(e){return json({error:(e as Error).message},/Entre/.test((e as Error).message)?401:400);}
}
