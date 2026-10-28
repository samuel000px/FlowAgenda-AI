import {env} from 'cloudflare:workers';
import {sameOrigin} from '../../../lib/admin-auth';
import {requireStaff,staffCookie} from '../../../lib/staff-auth';
import {staffView,staffSlots,staffClients,applyStaffAction} from '../../../lib/staff-core.mjs';
import {connection,updateRoom,flushWhatsApp} from '../../../lib/whatsapp';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
export async function GET(req:Request){
 let s;try{s=await requireStaff(req,env);}catch(e){return json({error:(e as Error).message},401);}
 try{
  const q=new URL(req.url).searchParams,cart=q.get('cart');
  if(q.has('clientes'))return json({clients:staffClients(s.state,s.staffId,String(q.get('clientes')).slice(0,100))});
  // Com carrinho, devolve só os horários livres para marcar na loja.
  if(cart){if(cart.length>2000)throw Error('Carrinho grande demais.');return json(staffSlots(s.state,s.staffId,JSON.parse(cart),String(q.get('date')||'')));}
  // Como no painel da gerência, o acesso é renovado enquanto a funcionária está usando.
  const body=staffView(s.state,s.staffId,q.get('date')||undefined);
  if(s.expires-Date.now()>6*3600000)return json(body);
  return Response.json(body,{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Set-Cookie':await staffCookie(env,s.room,s.staffId,s.grant,new URL(req.url).protocol==='https:')}});
 }catch(e){return json({error:(e as Error).message},400);}
}
export async function POST(req:Request){
 try{
  sameOrigin(req);const session=await requireStaff(req,env),raw=await req.text();if(raw.length>3000)throw Error('Solicitação muito longa.');const p=JSON.parse(raw);
  const config=await connection(env,session.room);
  await updateRoom(env,session.room,s=>{
   if(s.staffAccess?.hash!==session.grant)throw Error('O link foi desativado. Entre novamente.');
   applyStaffAction(s,session.staffId,p);
  },config);
  let warning='';try{await flushWhatsApp(env,session.room);}catch{warning='A alteração foi salva. O envio pelo WhatsApp será retomado; não repita o cadastro.';}
  return json({ok:true,warning});
 }catch(e){return json({error:(e as Error).message},403);}
}
