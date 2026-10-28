import {env} from 'cloudflare:workers';
import {sameOrigin} from '../../../lib/admin-auth';
import {requireStaff} from '../../../lib/staff-auth';
import {staffView,applyStaffAction} from '../../../lib/staff-core.mjs';
import {connection,updateRoom,flushWhatsApp} from '../../../lib/whatsapp';
import {syncCalendar} from '../../../lib/google-calendar';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
export async function GET(req:Request){try{const s=await requireStaff(req,env);return json(staffView(s.state,s.staffId,new URL(req.url).searchParams.get('date')||undefined));}catch(e){return json({error:(e as Error).message},401);}}
export async function POST(req:Request){
 try{
  sameOrigin(req);const session=await requireStaff(req,env),raw=await req.text();if(raw.length>3000)throw Error('Solicitação muito longa.');const p=JSON.parse(raw);
  const config=await connection(env,session.room);
  await updateRoom(env,session.room,s=>{
   if(s.staffAccess?.hash!==session.grant)throw Error('O link foi desativado. Entre novamente.');
   applyStaffAction(s,session.staffId,p);
  },config);
  let warning='';try{await syncCalendar(env,session.room);await flushWhatsApp(env,session.room);}catch{warning='A alteração foi salva. A sincronização externa será retomada; não repita o cadastro.';}
  return json({ok:true,warning});
 }catch(e){return json({error:(e as Error).message},403);}
}
