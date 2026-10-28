import { env } from 'cloudflare:workers';
import { finishOAuth } from '../../../../lib/google-calendar';
export const dynamic='force-dynamic';
export async function GET(req:Request){
  const url=new URL(req.url),state=url.searchParams.get('state')||'';
  const cookie=req.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('encaixa_google_state='))?.slice('encaixa_google_state='.length);
  const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Set-Cookie':`encaixa_google_state=; Path=/api/google; HttpOnly; SameSite=Lax; Max-Age=0${url.protocol==='https:'?'; Secure':''}`};
  try{
    if(!state||!cookie||state!==cookie)throw Error('A autorização não corresponde a este navegador. Volte e conecte novamente.');
    if(url.searchParams.has('error'))throw Error('O acesso ao Google Agenda não foi autorizado.');
    await finishOAuth(env,state,url.searchParams.get('code')||'');
    const destination=new URL('/painel?integracao=google',env.GOOGLE_REDIRECT_URI!);

    return new Response(null,{status:303,headers:{...headers,Location:destination.toString()}});
  }catch(e){
    return new Response(`Conexão Google Agenda: ${(e as Error).message}\n\nVolte à aba do painel da Santa Cor e tente novamente.`,{status:400,headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});
  }
}
