import {digest,nonce} from './calendar-core.mjs';
const cookieName='flowagenda_session';
const encode=(value:Uint8Array)=>btoa(String.fromCharCode(...value)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const decode=(value:string)=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
async function signingKey(env:Cloudflare.Env){
  if(!env.APP_SENHA||!env.CALENDAR_ENCRYPTION_KEY)throw Error('Configure APP_SENHA e a chave de proteção no servidor.');
  const secret=await digest(env.CALENDAR_ENCRYPTION_KEY+':'+env.APP_SENHA);
  return crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
export async function sessionCookie(env:Cloudflare.Env,room:string,secure:boolean){
  const payload=encode(new TextEncoder().encode(JSON.stringify({room,expires:Date.now()+8*3600000,nonce:nonce()})));
  const signature=encode(new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(env),new TextEncoder().encode(payload))));
  return `${cookieName}=${payload}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${secure?'; Secure':''}`;
}
export const clearSession=(secure:boolean)=>`${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure?'; Secure':''}`;
export async function requireAdmin(req:Request,env:Cloudflare.Env){return (await readSession(req,env)).room;}
/**
 * O login dura 8 horas, mas é renovado enquanto o painel está aberto e em uso: quem entra de manhã
 * não é derrubada no meio do expediente. Devolve o cookie novo quando faltam menos de 6 horas.
 */
export async function renewSession(req:Request,env:Cloudflare.Env){
  try{const s=await readSession(req,env);return s.expires-Date.now()<6*3600000?await sessionCookie(env,s.room,new URL(req.url).protocol==='https:'):'';}catch{return '';}
}
async function readSession(req:Request,env:Cloudflare.Env){
  try{
    const value=req.headers.get('cookie')?.split(';').map(c=>c.trim()).find(c=>c.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    if(!value||value.length>2048)throw Error();
    const [payload,signature]=value.split('.');
    if(!await crypto.subtle.verify('HMAC',await signingKey(env),decode(signature),new TextEncoder().encode(payload)))throw Error();
    const data=JSON.parse(new TextDecoder().decode(decode(payload)));
    if(typeof data.room!=='string'||!Number.isFinite(data.expires)||data.expires<Date.now())throw Error();
    return {room:data.room as string,expires:data.expires as number};
  }catch{throw Error('Sua sessão da administração terminou. Entre com a senha de novo.');}
}
export function sameOrigin(req:Request){if(req.headers.get('Origin')!==new URL(req.url).origin)throw Error('Origem inválida.');}
