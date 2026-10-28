import { env } from 'cloudflare:workers';
import { calendarStatus, managerRoom, startOAuth, syncCalendar } from '../../../lib/google-calendar';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200,headers={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store',...headers}});
export async function GET(req:Request){
  try{return json(await calendarStatus(env,await managerRoom(req,env)))}catch(e){return json({error:(e as Error).message},400)}
}
export async function POST(req:Request){
  try{
    const origin=new URL(req.url).origin;
    if(req.headers.get('Origin')!==origin)return json({error:'Origem inválida.'},403);
    const room=await managerRoom(req,env),raw=await req.text();
    if(raw.length>1000)return json({error:'Solicitação inválida.'},413);
    const body=JSON.parse(raw);
    if(body.action==='connect'){
      if(env.GOOGLE_REDIRECT_URI&&new URL(env.GOOGLE_REDIRECT_URI).origin!==origin)throw Error('Abra o FlowAgenda-AI no mesmo endereço configurado em GOOGLE_REDIRECT_URI.');
      const result=await startOAuth(env,room,String(body.day||''));
      return json({url:result.url},200,{'Set-Cookie':`encaixa_google_state=${result.state}; Path=/api/google; HttpOnly; SameSite=Lax; Max-Age=600${origin.startsWith('https:')?'; Secure':''}`});
    }
    if(body.action==='sync')await syncCalendar(env,room,body.force===true);
    else if(body.action==='disconnect'){
      const active=await env.DB!.prepare('SELECT lease FROM calendar_connections WHERE room=?').bind(room).first<any>();
      if(active?.lease>Date.now())throw Error('Aguarde a sincronização terminar para desconectar.');
      await env.DB!.batch([env.DB!.prepare('DELETE FROM calendar_connections WHERE room=? AND lease<?').bind(room,Date.now()),env.DB!.prepare('DELETE FROM calendar_oauth WHERE room=?').bind(room)]);
    }else throw Error('Ação desconhecida.');
    return json(await calendarStatus(env,room));
  }catch(e){return json({error:(e as Error).message},400)}
}
