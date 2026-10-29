import {env} from 'cloudflare:workers';
import {tickAdmin,upgrade} from '../../../lib/flowagenda.mjs';
import {byToken,cancelByToken,catalog,changeWithWhatsApp,openDays,publicView,requestBooking,requestInterest,slots} from '../../../lib/agendamento.mjs';
import {connection,flushWhatsApp} from '../../../lib/whatsapp';
import {sameOrigin} from '../../../lib/admin-auth';
import {digest} from '../../../lib/cripto.mjs';
export const dynamic='force-dynamic';
// A página pública usa a mesma agenda que a administração abre depois do login.
const ROOM='flowagenda';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
async function load(){
 const row=await env.DB!.prepare('SELECT * FROM rooms WHERE id=?').bind(ROOM).first<any>();
 if(!row)throw Error('A agenda online ainda não está disponível. Fale com a gente pelo WhatsApp.');
 return {row,state:tickAdmin(upgrade(JSON.parse(row.state)))};
}
// Duas clientes podem pedir ao mesmo tempo: se a versão mudou, relê e tenta de novo.
// Mensagens novas da agente (como a proposta que um cancelamento gera) vão para a fila do WhatsApp.
async function change(apply:(state:any)=>any){
 const config=await connection(env,ROOM);
 for(let i=0;i<3;i++){
  const {row,state}=await load(),result=changeWithWhatsApp(state,apply,config);
  const done=await env.DB!.prepare('UPDATE rooms SET state=?,version=version+1,updated=? WHERE id=? AND version=?').bind(JSON.stringify(state),Date.now(),ROOM,row.version).run();
  if(done.meta.changes)return {state,result};
 }
 throw Error('Muita gente agendando agora. Tente de novo em instantes.');
}
export async function GET(req:Request){
 try{
  const q=new URL(req.url).searchParams,{state}=await load();
  if(q.get('token'))return json(publicView(state,byToken(state,q.get('token'))));
  const cart=q.get('cart'),date=q.get('date');
  if(cart&&cart.length>2000)return json({error:'Carrinho grande demais.'},413);
  return json({...catalog(state),days:openDays(state),slots:cart&&date?slots(state,JSON.parse(cart),date):[]});
 }catch(e){return json({error:(e as Error).message},400);}
}
export async function POST(req:Request){
 try{
  sameOrigin(req);const raw=await req.text();if(raw.length>2000)return json({error:'Solicitação inválida.'},413);
  const bucket='public:'+Math.floor(Date.now()/3600000)+':'+await digest(req.headers.get('CF-Connecting-IP')||'local');
  const quota=await env.DB!.prepare('INSERT INTO limits(id,used) VALUES(?,1) ON CONFLICT(id) DO UPDATE SET used=used+1 WHERE used<20 RETURNING used').bind(bucket).first();
  if(!quota)return json({error:'Muitas tentativas. Aguarde um pouco ou fale com a gente pelo WhatsApp.'},429);
  const p=JSON.parse(raw);
  if(p.action==='cancel'){
   const {state,result}=await change(s=>cancelByToken(s,String(p.token||''),Date.now(),String(p.reason||'').slice(0,600)));
   await flushWhatsApp(env,ROOM);
   return json(publicView(state,result));
  }
  if(p.action==='interest'){const {result}=await change(s=>requestInterest(s,p));return json(result);}
  const {state,result}=await change(s=>requestBooking(s,p));
  return json({token:result[0].token,...publicView(state,result[0])});
 }catch(e){return json({error:(e as Error).message},400);}
}
