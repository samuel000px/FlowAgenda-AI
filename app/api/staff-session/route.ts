import {env} from 'cloudflare:workers';
import {sameOrigin} from '../../../lib/admin-auth';
import {roomByStaffToken,staffCookie,clearStaffCookie,requireStaff} from '../../../lib/staff-auth';
import {activeStaff} from '../../../lib/staff-core.mjs';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer',...headers}});
export async function POST(req:Request){try{
 sameOrigin(req);const raw=await req.text();if(raw.length>2000)throw Error('Solicitação inválida.');const p=JSON.parse(raw),secure=new URL(req.url).protocol==='https:';
 if(p.action==='logout')return json({ok:true},200,{'Set-Cookie':clearStaffCookie(secure)});
 if(!['list','login'].includes(p.action))throw Error('Operação inválida.');
 const {room,state,grant}=await roomByStaffToken(env,String(p.token||''));
 if(p.action==='list'){
  let selected='';try{const current=await requireStaff(req,env);if(current.room===room&&current.grant===grant)selected=current.staffId;}catch{}
  return json({salon:state.salon.name,staff:state.staff.filter((s:any)=>s.active).map((s:any)=>({id:s.id,name:s.name})),selected});
 }
 const staff=activeStaff(state,String(p.staffId||''));
 return json({selected:staff.id},200,{'Set-Cookie':await staffCookie(env,room,staff.id,grant,secure)});
}catch(e){return json({error:(e as Error).message},403);}}
