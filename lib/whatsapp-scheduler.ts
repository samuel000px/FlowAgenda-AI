import {tickWhatsApp} from './whatsapp';
import {processWhatsAppInbox} from './whatsapp-inbox';

// Cloudflare invokes this after deployment; no public unauthenticated trigger.
export async function runWhatsAppSchedule(env:Cloudflare.Env) {
 if(!env.DB || !env.CALENDAR_ENCRYPTION_KEY)return;
 const {results}=await env.DB.prepare("SELECT room FROM whatsapp_connections WHERE json_extract(settings, '$.enabled')=1").all<{room:string}>();
 let failed=false;
 for(const {room} of results){
  let error='';
  try{await tickWhatsApp(env,room);await processWhatsAppInbox(env,room);}
  catch{failed=true;error='A rotina não concluiu. A fila será retomada na próxima execução.';}
  await env.DB.prepare("UPDATE whatsapp_connections SET settings=json_set(settings, '$.schedulerChecked', ?, '$.schedulerError', ?) WHERE room=?").bind(Date.now(),error,room).run();
 }
 if(failed)throw Error('Uma rotina WhatsApp precisa de nova tentativa. Consulte Integrações.');
}
