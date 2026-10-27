import { env } from 'cloudflare:workers';
import { act, seed, tick, metrics } from '../../../lib/salon.mjs';
import { interpret } from '../../../lib/agent';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
const token=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
const db=()=>{if(!env.DB)throw new Error('Banco indisponível.');return env.DB};
async function quota(key:string,max:number){const row=await db().prepare('INSERT INTO limits(id,used) VALUES (?,1) ON CONFLICT(id) DO UPDATE SET used=used+1 WHERE used<? RETURNING used').bind(key,max).first();if(!row)throw new Error('Limite diário da demonstração atingido. Tente amanhã.');}
async function load(req:Request){const room=req.headers.get('X-Room'),secret=req.headers.get('X-Room-Key');if(!room||!secret)throw new Error('Abra o link completo da sala.');const row=await db().prepare('SELECT * FROM rooms WHERE id=?').bind(room).first<any>();if(!row||![row.manager,row.client].includes(secret))throw new Error('Sala ou acesso inválido.');return {row,role:secret===row.manager?'manager':'client',state:JSON.parse(row.state)};}
async function save(row:any,state:any){const text=JSON.stringify(state);if(text===row.state)return;const r=await db().prepare('UPDATE rooms SET state=?,version=version+1,updated=? WHERE id=? AND version=?').bind(text,Date.now(),row.id,row.version).run();if(!r.meta.changes)throw new Error('A sala foi atualizada em outra tela. Atualize e tente novamente.');}
function view(row:any,state:any,role:string){return {id:row.id,state,role,metrics:metrics(state),ai_configured:!!env.GEMINI_API_KEY,...(role==='manager'?{client_key:row.client}:{})};}
export async function GET(req:Request){try{const {row,state,role}=await load(req);tick(state);await save(row,state);return json(view(row,state,role));}catch(e){return json({error:(e as Error).message},400);}}
export async function POST(req:Request){
 try{
  const origin=req.headers.get('Origin');if(origin&&origin!==new URL(req.url).origin)return json({error:'Origem inválida.'},403);
  if(Number(req.headers.get('Content-Length')||0)>12000)return json({error:'Mensagem muito longa.'},413);
  const raw=await req.text();if(raw.length>12000)return json({error:'Mensagem muito longa.'},413);const p=JSON.parse(raw);
  if(p.action==='create'){
   await quota('rooms:'+new Date().toISOString().slice(0,10),100);
   const room=token().slice(0,24),manager=token(),client=token(),state=seed(),time=Date.now();
   await db().prepare('INSERT INTO rooms(id,manager,client,state,created,updated) VALUES (?,?,?,?,?,?)').bind(room,manager,client,JSON.stringify(state),time,time).run();
   return json({id:room,key:manager,client_key:client,role:'manager',state,metrics:metrics(state),ai_configured:!!env.GEMINI_API_KEY});
  }
  const {row,state,role}=await load(req);
  if(p.action==='ai'){
   if(!env.GEMINI_API_KEY)throw new Error('Gemini não configurado.');
   if(state.aiUses>=30)throw new Error('Esta sala chegou a 30 mensagens com IA. Continue pelos botões.');
   await quota('ai:'+new Date().toISOString().slice(0,10),100);
   tick(state);await interpret(state,String(p.text||''),p.as_client?'client':role,String(p.client_id||''),env.GEMINI_API_KEY,env.GEMINI_MODEL||'gemini-3.5-flash-lite');
  }else act(state,p.action,p,role);
  await save(row,state);return json(view(row,state,role));
 }catch(e){return json({error:(e as Error).message},400)}
}
