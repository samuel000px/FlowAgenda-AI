import {supportAction,supportView} from '../../../lib/support-core.mjs';
import {financeAction,financeAdminAction} from '../../../lib/finance-core.mjs';
import {stockAction} from '../../../lib/estoque.mjs';
import {env} from 'cloudflare:workers';
import {actAdmin,candidates,nextTick,tickAdmin,upgrade} from '../../../lib/flowagenda.mjs';
import {renewSession,requireAdmin,sameOrigin} from '../../../lib/admin-auth';
import {classifyResponse} from '../../../lib/response-agent';
import {connection,flushWhatsApp} from '../../../lib/whatsapp';
import {queueNewMessages} from '../../../lib/whatsapp-core.mjs';
import {processWhatsAppInbox} from '../../../lib/whatsapp-inbox';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200,cookie='')=>Response.json(value,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer',...(cookie?{'Set-Cookie':cookie}:{})}});
async function load(req:Request){
 const room=await requireAdmin(req,env);
 const row=await env.DB!.prepare('SELECT * FROM rooms WHERE id=?').bind(room).first<any>();
 if(!row)throw Error('Cadastro administrativo não encontrado.');
 const state=upgrade(JSON.parse(row.state));
 // As mensagens que já existiam, guardadas agora para não reler o cadastro na hora de salvar.
 return {row,state,ids:new Set<string>(state.messages.map((m:any)=>m.id))};
}
async function save(row:any,state:any,ids:Set<string>){
 queueNewMessages(state,ids,await connection(env,row.id));
 const encoded=JSON.stringify(state);if(encoded===row.state)return encoded;
 const result=await env.DB!.prepare('UPDATE rooms SET state=?,version=version+1,updated=? WHERE id=? AND version=?').bind(encoded,Date.now(),row.id,row.version).run();
 if(!result.meta.changes)throw Error('A agenda foi atualizada em outra tela. Atualize e tente novamente.');
 row.written=true;
 return encoded;
}
// Depois do WhatsApp, só relê o cadastro se ele gravou alguma coisa.
async function current(req:Request,row:any,state:any){
 const v=await env.DB!.prepare('SELECT version FROM rooms WHERE id=?').bind(row.id).first<any>();
 return v&&v.version===row.version+(row.written?1:0)?state:(await load(req)).state;
}
// No plano grátis da Cloudflare cada pedido tem 10 ms de processamento, e o cadastro inteiro passa de
// 300 KB. A resposta é montada como texto, aproveitando o JSON já gravado, e fica guardada (por cópia
// do servidor) enquanto a versão do cadastro não muda e nenhum prazo ou lembrete vence: o painel
// atualiza a cada 15 segundos e quase sempre recebe a mesma coisa.
let guardada:{room:string,version:number,ate:number,corpo:string}|null=null;
function corpo(state:any,encoded=JSON.stringify(state)){
 const vagas=Object.fromEntries(state.gaps.filter((g:any)=>g.status==='open').map((g:any)=>[g.id,candidates(state,g.id)]));
 return '"state":'+encoded+',"tickets":'+JSON.stringify(supportView(state))+',"candidates":'+JSON.stringify(vagas)+'}';
}
const resposta=(corpo:string,cookie='')=>new Response('{"now":'+Date.now()+','+corpo,{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer',...(cookie?{'Set-Cookie':cookie}:{})}});
function guardar(room:string,version:number,state:any,texto:string){guardada={room,version,ate:Math.min(nextTick(state),Date.now()+60000),corpo:texto};}
export async function GET(req:Request){
 try{
  const room=await requireAdmin(req,env);
  await processWhatsAppInbox(env,room);
  const v=await env.DB!.prepare('SELECT version FROM rooms WHERE id=?').bind(room).first<any>();
  if(guardada&&v&&guardada.room===room&&guardada.version===v.version&&Date.now()<guardada.ate)return resposta(guardada.corpo,await renewSession(req,env));
  const {row,state,ids}=await load(req);let encoded:string|undefined;
  if(nextTick(state)<=Date.now()){tickAdmin(state);encoded=await save(row,state,ids);}
  const texto=corpo(state,encoded);guardar(room,row.version+(row.written?1:0),state,texto);
  return resposta(texto,await renewSession(req,env));
 }catch(e){return json({error:(e as Error).message},/Entre|sessão|acesso/i.test((e as Error).message)?401:400);}
}
export async function POST(req:Request){
 try{
  sameOrigin(req);const {row,state,ids}=await load(req),raw=await req.text();
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
  if(['support_claim','support_close','support_demo'].includes(p.action))supportAction(state,p.action,p,{role:'admin',id:'admin',name:'Administração'});
  else if(['payment_record','expense_add'].includes(p.action))financeAction(state,p.action,p);
  else if(['stock_save','stock_move','stock_remove','stock_place_rename'].includes(p.action))stockAction(state,p.action,p);
  else if(['closing_record','commission_save','deduction_add','deduction_remove','fixed_save','fixed_remove','history_import'].includes(p.action))financeAdminAction(state,p.action,p);
  else actAdmin(state,p.action,p);const encoded=await save(row,state,ids);
  await flushWhatsApp(env,row.id);
  const atual=await current(req,row,state),texto=corpo(atual,atual===state?encoded:undefined);
  if(atual===state)guardar(row.id,row.version+(row.written?1:0),state,texto);
  return resposta(texto);
 }catch(e){return json({error:(e as Error).message},/Entre|sessão|acesso/i.test((e as Error).message)?401:400);}
}
