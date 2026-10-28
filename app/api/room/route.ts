import {env} from 'cloudflare:workers';
import {actAdmin,candidates,tickAdmin,upgrade} from '../../../lib/flowagenda.mjs';
import {calendarStatus,syncCalendar} from '../../../lib/google-calendar';
import {requireAdmin,sameOrigin} from '../../../lib/admin-auth';
import {classifyResponse} from '../../../lib/response-agent';
import {connection,flushWhatsApp} from '../../../lib/whatsapp';
import {queueNewMessages} from '../../../lib/whatsapp-core.mjs';
import {processWhatsAppInbox} from '../../../lib/whatsapp-inbox';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
async function load(req:Request){
 const room=await requireAdmin(req,env);
 const row=await env.DB!.prepare('SELECT * FROM rooms WHERE id=?').bind(room).first<any>();
 if(!row)throw Error('Cadastro administrativo não encontrado.');
 const connection=await calendarStatus(env,room);
 return {row,state:upgrade(JSON.parse(row.state),connection.day||undefined)};
}
async function save(row:any,state:any){
 queueNewMessages(state,new Set(JSON.parse(row.state).messages.map((m:any)=>m.id)),await connection(env,row.id));
 const encoded=JSON.stringify(state);if(encoded===row.state)return false;
 const result=await env.DB!.prepare('UPDATE rooms SET state=?,version=version+1,updated=? WHERE id=? AND version=?').bind(encoded,Date.now(),row.id,row.version).run();
 if(!result.meta.changes)throw Error('A agenda foi atualizada em outra tela. Atualize e tente novamente.');
 return JSON.stringify(JSON.parse(row.state).appointments)!==JSON.stringify(state.appointments);
}
function view(state:any){return {state,now:Date.now(),candidates:Object.fromEntries(state.gaps.filter((g:any)=>g.status==='open').map((g:any)=>[g.id,candidates(state,g.id)]))};}
export async function GET(req:Request){
 try{const {row,state}=await load(req);tickAdmin(state);await save(row,state);await processWhatsAppInbox(env,row.id);await syncCalendar(env,row.id);const fresh=await load(req);return json(view(fresh.state));}
 catch(e){return json({error:(e as Error).message},/Entre|sessão|acesso/i.test((e as Error).message)?401:400);}
}
export async function POST(req:Request){
 try{
  sameOrigin(req);const {row,state}=await load(req),raw=await req.text();
  if(raw.length>12000)return json({error:'Solicitação muito longa.'},413);
  const p=JSON.parse(raw);
  if(p.action==='response'&&!p.result){
   const offer=state.offers.find((o:any)=>o.id===p.id&&o.status==='pending');if(!offer)throw Error('Proposta indisponível.');
   if(env.GEMINI_API_KEY){
    const quota=await env.DB!.prepare('INSERT INTO limits(id,used) VALUES (?,1) ON CONFLICT(id) DO UPDATE SET used=used+1 WHERE used<100 RETURNING used').bind('responses:'+row.id+':'+new Date().toISOString().slice(0,10)).first();
    if(!quota)throw Error('Limite diário de interpretação atingido. Registre a decisão pelos botões.');
   }
   p.interpretation=await classifyResponse([...state.messages].reverse().find((m:any)=>m.offer_id===offer.id&&m.sender==='agent')?.text||'',String(p.text||''),env.GEMINI_API_KEY,env.GEMINI_MODEL);p.result=p.interpretation.result;
  }
  actAdmin(state,p.action,p);const changed=await save(row,state);if(changed)await syncCalendar(env,row.id);
  await flushWhatsApp(env,row.id);const fresh=await load(req);return json(view(fresh.state));
 }catch(e){return json({error:(e as Error).message},/Entre|sessão|acesso/i.test((e as Error).message)?401:400);}
}
