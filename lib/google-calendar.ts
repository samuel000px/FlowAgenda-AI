import {requireAdmin} from './admin-auth';
import { challenge, digest, googleCall, nonce, pushEvents, seal, SCOPE, unseal, validDay } from './calendar-core.mjs';

type Env=Cloudflare.Env;
export const configured=(env:Env)=>!!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET&&env.GOOGLE_REDIRECT_URI&&/^[a-f0-9]{64}$/i.test(env.CALENDAR_ENCRYPTION_KEY||''));
export async function managerRoom(req:Request,env:Env){
  return requireAdmin(req,env);
}
export async function calendarStatus(env:Env,room:string){
  const row=await env.DB!.prepare('SELECT calendar,day,synced,error,lease FROM calendar_connections WHERE room=?').bind(room).first<any>();
  return {configured:configured(env),connected:!!row,day:row?.day||'',synced:row?.synced||0,error:row?.error||'',syncing:(row?.lease||0)>Date.now(),url:row?`https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(row.calendar)}`:'',redirect:env.GOOGLE_REDIRECT_URI||''};
}
async function tokenRequest(env:Env,params:Record<string,string>){
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID!,client_secret:env.GOOGLE_CLIENT_SECRET!,...params}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Não foi possível autorizar o Google Agenda. Reconecte a conta.');
  const value:any=await response.json();
  if(!value.access_token)throw Error('O Google não retornou uma autorização válida.');
  return value;
}
export async function startOAuth(env:Env,room:string,day:string){
  if(!configured(env))throw Error('Configure as credenciais Google no servidor primeiro.');
  if(!validDay(day))throw Error('Escolha a data da agenda.');
  const state=nonce(),verifier=nonce(),now=Date.now();
  await env.DB!.batch([
    env.DB!.prepare('DELETE FROM calendar_oauth WHERE room=? OR expires<?').bind(room,now),
    env.DB!.prepare('INSERT INTO calendar_oauth(state,room,verifier,day,expires) VALUES(?,?,?,?,?)').bind(await digest(state),room,verifier,day,now+600000)
  ]);
  const params=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID!,redirect_uri:env.GOOGLE_REDIRECT_URI!,response_type:'code',scope:SCOPE,access_type:'offline',prompt:'consent',state,code_challenge:await challenge(verifier),code_challenge_method:'S256'});
  return {state,url:`https://accounts.google.com/o/oauth2/v2/auth?${params}`};
}
export async function finishOAuth(env:Env,state:string,code:string){
  if(!configured(env)||!state||!code)throw Error('Autorização incompleta. Volte ao painel e conecte novamente.');
  // Consume state atomically; callbacks cannot be replayed.
  const pending=await env.DB!.prepare('DELETE FROM calendar_oauth WHERE state=? AND expires>? RETURNING *').bind(await digest(state),Date.now()).first<any>();
  if(!pending)throw Error('Esta autorização expirou ou já foi usada. Tente novamente.');
  const previous=await env.DB!.prepare('SELECT * FROM calendar_connections WHERE room=?').bind(pending.room).first<any>();
  if(previous?.lease>Date.now())throw Error('Há uma sincronização em andamento. Aguarde e tente novamente.');
  const tokens=await tokenRequest(env,{grant_type:'authorization_code',code,redirect_uri:env.GOOGLE_REDIRECT_URI!,code_verifier:pending.verifier});
  if(!tokens.refresh_token)throw Error('O Google não autorizou a sincronização contínua. Remova o acesso anterior e conecte novamente.');
  if(tokens.scope&&!tokens.scope.split(' ').includes(SCOPE))throw Error('Autorize a criação do calendário da Santa Cor.');
  const calendar=previous?.calendar||(await googleCall(tokens.access_token,'/calendars','POST',{summary:`Santa Cor · Atendimentos · ${pending.room.slice(0,6)}`,description:'Agenda de atendimentos da Santa Cor.',timeZone:'America/Fortaleza'})).id;
  const encrypted=await seal({access:tokens.access_token,refresh:tokens.refresh_token,expires:Date.now()+Number(tokens.expires_in||3600)*1000},env.CALENDAR_ENCRYPTION_KEY,pending.room);
  await env.DB!.prepare("INSERT INTO calendar_connections(room,tokens,calendar,day) VALUES(?,?,?,?) ON CONFLICT(room) DO UPDATE SET tokens=excluded.tokens,error='',retry=0").bind(pending.room,encrypted,calendar,pending.day).run();
  await syncCalendar(env,pending.room,true);
  const owner=await env.DB!.prepare('SELECT manager FROM rooms WHERE id=?').bind(pending.room).first<any>();
  return {room:pending.room,key:owner.manager};
}
export async function syncCalendar(env:Env,room:string,force=false){
  if(!configured(env))return;
  const now=Date.now(),lock=nonce();
  // Serialize Google writes per room, including writes triggered by client responses.
  const row=await env.DB!.prepare('UPDATE calendar_connections SET lock=?,lease=? WHERE room=? AND lease<? AND (retry<? OR ?=1) RETURNING *').bind(lock,now+120000,room,now,now,force?1:0).first<any>();
  if(!row)return;
  let entries=JSON.parse(row.entries);
  try{
    const current=await env.DB!.prepare('SELECT state FROM rooms WHERE id=?').bind(room).first<any>();
    if(!current)throw Error('Sala não encontrada.');
    const state=JSON.parse(current.state);
    let tokens=await unseal(row.tokens,env.CALENDAR_ENCRYPTION_KEY,room);
    const call=async(path:string,method?:string,body?:any)=>{
      return googleCall(tokens.access,path,method,body);
    };
    // Refresh once before parallel event requests to avoid racing refresh tokens.
    if(tokens.expires<Date.now()+60000){
      const updated=await tokenRequest(env,{grant_type:'refresh_token',refresh_token:tokens.refresh});
      tokens={access:updated.access_token,refresh:updated.refresh_token||tokens.refresh,expires:Date.now()+Number(updated.expires_in||3600)*1000};
      await env.DB!.prepare('UPDATE calendar_connections SET tokens=? WHERE room=? AND lock=?').bind(await seal(tokens,env.CALENDAR_ENCRYPTION_KEY,room),room,lock).run();
    }
    entries=await pushEvents(room,state,row.day,row.calendar,entries,call);
    await env.DB!.prepare("UPDATE calendar_connections SET entries=?,synced=?,error='',retry=0 WHERE room=? AND lock=?").bind(JSON.stringify(entries),Date.now(),room,lock).run();
  }catch(error:any){
    entries=error.entries||entries;
    const message=String(error.message||'Falha na sincronização.').slice(0,240);
    await env.DB!.prepare('UPDATE calendar_connections SET entries=?,error=?,retry=? WHERE room=? AND lock=?').bind(JSON.stringify(entries),message,Date.now()+60000,room,lock).run();
  }finally{
    await env.DB!.prepare("UPDATE calendar_connections SET lock='',lease=0 WHERE room=? AND lock=?").bind(room,lock).run();
  }
}
