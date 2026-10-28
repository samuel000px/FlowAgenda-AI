import {env} from 'cloudflare:workers';
import {clearSession,requireAdmin,sameOrigin,sessionCookie} from '../../../lib/admin-auth';
import {digest,nonce} from '../../../lib/cripto.mjs';
import {seedAdmin} from '../../../lib/flowagenda.mjs';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200,headers={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store',...headers}});
export async function GET(req:Request){try{return json({authenticated:true,room:await requireAdmin(req,env)})}catch{return json({authenticated:false,configured:!!env.APP_SENHA})}}
export async function POST(req:Request){
 try{
  sameOrigin(req);const secure=new URL(req.url).protocol==='https:';const raw=await req.text();if(raw.length>2000)return json({error:'Solicitação inválida.'},413);
  const p=JSON.parse(raw);if(p.action==='logout')return json({ok:true},200,{'Set-Cookie':clearSession(secure)});
  if(!env.APP_SENHA)return json({error:'A senha de administração ainda não foi configurada.'},503);
  const bucket='login:'+Math.floor(Date.now()/3600000)+':'+await digest(req.headers.get('CF-Connecting-IP')||'local');
  const quota=await env.DB!.prepare('INSERT INTO limits(id,used) VALUES(?,1) ON CONFLICT(id) DO UPDATE SET used=used+1 WHERE used<30 RETURNING used').bind(bucket).first();
  if(!quota)return json({error:'Muitas tentativas. Aguarde para tentar novamente.'},429);
  const expected=await digest(env.APP_SENHA),received=await digest(String(p.password||''));let difference=0;for(let i=0;i<expected.length;i++)difference|=expected.charCodeAt(i)^received.charCodeAt(i);
  if(difference)return json({error:'Senha incorreta.'},401);
  let room='flowagenda';
  // A legacy workspace can only be opened after password login AND its original manager key.
  if(p.room&&p.key){const old=await env.DB!.prepare('SELECT id FROM rooms WHERE id=? AND manager=?').bind(String(p.room),String(p.key)).first<any>();if(old)room=old.id;}
  else if(p.room){const saved=await env.DB!.prepare("SELECT id FROM rooms WHERE id=? AND json_extract(state,'$.schemaVersion')=2").bind(String(p.room)).first<any>();if(saved)room=saved.id;}
  const now=Date.now();await env.DB!.prepare('INSERT OR IGNORE INTO rooms(id,manager,client,state,created,updated) VALUES(?,?,?,?,?,?)').bind(room,nonce(),nonce(),JSON.stringify(seedAdmin()),now,now).run();
  return json({authenticated:true,room},200,{'Set-Cookie':await sessionCookie(env,room,secure)});
 }catch(e){return json({error:(e as Error).message},400)}
}
