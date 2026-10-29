import {env} from 'cloudflare:workers';
import {sameOrigin} from '../../../lib/admin-auth';
import {digest} from '../../../lib/cripto.mjs';
import {publicSupportInput,requestPublicSupport} from '../../../lib/support-core.mjs';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
export async function POST(req:Request){
 let input;
 try{
  sameOrigin(req);
  const raw=await req.text();if(raw.length>4000)return json({error:'Pedido muito longo. Escreva uma mensagem menor.'},413);
  input=publicSupportInput(JSON.parse(raw));
 }catch(e){return json({error:e instanceof SyntaxError?'Confira os dados do pedido.':(e as Error).message},400);}
 try{
  const room='flowagenda'; // Public visitors cannot select another workspace.
  const bucket='support:'+Math.floor(Date.now()/3600000)+':'+await digest(req.headers.get('CF-Connecting-IP')||'local');
  const quota=await env.DB!.prepare('INSERT INTO limits(id,used) VALUES(?,1) ON CONFLICT(id) DO UPDATE SET used=used+1 WHERE used<10 RETURNING used').bind(bucket).first();
  if(!quota)return json({error:'Você já enviou vários pedidos. Aguarde um pouco antes de tentar novamente.'},429);
  for(let attempt=0;attempt<3;attempt++){
   const row=await env.DB!.prepare('SELECT state,version FROM rooms WHERE id=?').bind(room).first<any>();
   if(!row)return json({error:'O atendimento está indisponível no momento. Tente novamente mais tarde.'},503);
   const state=JSON.parse(row.state);
   try{requestPublicSupport(state,{...input,consent:true});}catch(e){return json({error:(e as Error).message},400);}
   const encoded=JSON.stringify(state);
   if(encoded===row.state)return json({ok:true});
   const saved=await env.DB!.prepare('UPDATE rooms SET state=?,version=version+1,updated=? WHERE id=? AND version=?').bind(encoded,Date.now(),room,row.version).run();
   if(saved.meta.changes)return json({ok:true});
  }
  return json({error:'Não conseguimos registrar agora. Tente novamente em instantes.'},409);
 }catch{return json({error:'Não foi possível registrar o pedido. Tente novamente em instantes.'},503);}
}
