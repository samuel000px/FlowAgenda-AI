import {actAdmin,at,message,clock} from './flowagenda.mjs';
import {replyIntent} from './conversation.mjs';

export const phone = value => String(value || '').replace(/\D/g, '');
export const validPhone = value => /^[1-9]\d{9,14}$/.test(value);
export const SENT = ['accepted','sent','delivered','read'];
export function normalizeConfig(input, previous = {}) {
  const phoneId = String(input.phoneId || '').trim();
  const version = String(input.version || 'v26.0').trim();
  const mode = input.mode || previous.mode || 'test';
  if (!['test','business'].includes(mode)) throw Error('Selecione número de teste ou número da esmalteria.');
  const restricted = mode === 'test' || input.restricted !== false;
  const allowed = [...new Set(String(input.allowed || '').split(/[\n,;]/).map(phone).filter(Boolean))];
  if (!/^\d{5,30}$/.test(phoneId)) throw Error('Informe o ID do número de telefone fornecido pela Meta.');
  if (!/^v\d{2}\.0$/.test(version)) throw Error('Confira a versão da API exibida no painel da Meta.');
  if ((restricted && !allowed.length) || allowed.length > (mode==='test'?5:500) || allowed.some(p => !validPhone(p))) throw Error(mode==='test'?'Cadastre de 1 a 5 números de teste, com país e DDD.':'Cadastre de 1 a 500 números autorizados ou desative a lista limitada.');
  const templates = {enabled:mode==='business'&&input.templates?.enabled===true,language:String(input.templates?.language||'pt_BR'),offer:String(input.templates?.offer||'').trim(),reminder:String(input.templates?.reminder||'').trim()};
  if (!/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(templates.language)) throw Error('Confira o idioma dos modelos, por exemplo pt_BR.');
  for (const name of [templates.offer,templates.reminder]) if(name && !/^[a-z0-9_]{1,512}$/.test(name)) throw Error('Use o nome do modelo aprovado na Meta, com letras minúsculas, números e sublinhado.');
  if(templates.enabled&&(!templates.offer||!templates.reminder)) throw Error('Informe os dois modelos aprovados antes de ativar mensagens fora da janela de 24 horas.');
  const accessToken = String(input.accessToken || previous.accessToken || '').trim();
  const appSecret = String(input.appSecret || previous.appSecret || '').trim();
  if (accessToken.length < 20 || accessToken.length > 4096 || /\s/.test(accessToken)) throw Error('Informe um token de acesso válido da Meta.');
  if (!/^[a-f0-9]{32}$/i.test(appSecret)) throw Error('Informe o App Secret em Configurações básicas do aplicativo Meta.');
  return {phoneId,version,mode,restricted,templates,allowed,accessToken,appSecret,enabled:!!input.enabled};
}

export const incomingAllowed = (config,from) => validPhone(from) && (config.mode==='business'&&!config.restricted || config.allowed.includes(from));

export async function verifySignature(raw, signature, secret) {
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature || '') || !secret) return false;
  const bytes = Uint8Array.from(signature.slice(7).match(/../g), n => parseInt(n,16));
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(raw));
}

export function recipientError(state, clientId, config) {
  const c = state.clients.find(c => c.id === clientId);
  if (!c) return 'Vincule este telefone a uma cliente em Clientes.';
  const to = phone(c.phone);
  if (!validPhone(to)) return 'Cadastre o WhatsApp da cliente com país e DDD.';
  if (state.clients.filter(c => phone(c.phone) === to).length !== 1) return 'Este telefone está em mais de um cadastro. Corrija antes de enviar.';
  if (!incomingAllowed(config,to)) return 'Número fora da lista de destinatários autorizados em Integrações.';
  if (!c.consent) return 'Registre a autorização de contato no cadastro da cliente.';
  return '';
}
export function windowOpen(state, to, now = Date.now()) {
  const last = state.whatsappLastInbound?.[to] || 0;
  return last > now - 24*3600000 && last <= now;
}
export function currentQuestion(state, m, now = Date.now()) {
  if (m.offer_id) {
    const o = state.offers.find(o => o.id === m.offer_id);
    return o?.status === 'pending' && at(o) > now;
  }
  if (m.appointment_id) {
    const a = state.appointments.find(a => a.id === m.appointment_id);
    return a?.status === 'booked' && !a.result && a.attendance !== 'yes' && at(a) > now &&
      (m.appointment_at || m.whatsapp?.appointmentAt) === at(a);
  }
  return true;
}
export function queueMessage(state, m, config, now = Date.now(), manual = false) {
  if (m.sender === 'client' || !config?.verified) throw Error('Valide a conexão com a Meta antes de enviar.');
  if(m.template && (m.template!=='hello_world'||config.mode==='business')) throw Error('A saudação de teste só está disponível com o número de teste da Meta.');
  if (m.whatsapp && ['queued','sending','unknown',...SENT].includes(m.whatsapp.status)) return;
  const error = recipientError(state,m.channel,config);
  if (error) { if (manual) throw Error(error); m.whatsapp={status:'blocked',error}; return; }
  if (!currentQuestion(state,m,now)) { if (manual) throw Error('Esta proposta ou confirmação já foi encerrada.'); m.whatsapp={status:'cancelled',error:'Solicitação encerrada.'}; return; }
  const to = phone(state.clients.find(c=>c.id===m.channel).phone);
  m.whatsapp = {status:'waiting_window',to,
    phoneId:config.phoneId,queuedAt:now,manual,appointmentAt:m.appointment_id ? at(state.appointments.find(a=>a.id===m.appointment_id)) : undefined};
  if(prepareDelivery(state,m,config,now))m.whatsapp.status='queued';
}
// Re-evaluate permissions and template settings immediately before every send.
export function prepareDelivery(state,m,config,now=Date.now()) {
  delete m.whatsapp.template;
  if(m.template)return m.template==='hello_world'&&config.mode!=='business';
  if(windowOpen(state,m.whatsapp.to,now))return true;
  if(config.mode!=='business'||!config.templates?.enabled)return false;
  const kind=m.offer_id?'offer':m.appointment_id?'reminder':null;
  const booking=kind==='offer'?state.offers.find(o=>o.id===m.offer_id):kind==='reminder'?state.appointments.find(a=>a.id===m.appointment_id):null;
  const name=kind&&config.templates[kind];
  if(!booking||!name||!currentQuestion(state,m,now))return false;
  const client=state.clients.find(c=>c.id===m.channel),service=state.services.find(s=>s.id===booking.service_id),staff=state.staff.find(s=>s.id===booking.staff_id);
  if(!client||!service||!staff)return false;
  m.whatsapp.template={name,language:config.templates.language,parameters:[client.name,service.name,`${booking.date.split('-').reverse().join('/')} às ${clock(booking.start)}`,staff.name]};
  return true;
}
// Only newly created drafts are enrolled. Connecting never sends the old history.
export function queueNewMessages(state, previousIds, config, now = Date.now()) {
  if (!config?.enabled || !config.verified) return;
  for (const m of state.messages) if (!previousIds.has(m.id) && m.sender === 'agent') queueMessage(state,m,config,now);
}
export function payloadFor(m) {
  const base = {messaging_product:'whatsapp',recipient_type:'individual',to:m.whatsapp.to,biz_opaque_callback_data:m.id};
  const t=m.whatsapp.template;
  if(t)return {...base,type:'template',template:{name:t.name,language:{code:t.language},components:[{type:'body',parameters:t.parameters.map(text=>({type:'text',text}))},...['yes','no'].map((answer,index)=>({type:'button',sub_type:'quick_reply',index:String(index),parameters:[{type:'payload',payload:`fa:${m.id}:${answer}`}]}))]}};
  if (m.template === 'hello_world') return {...base,type:'template',template:{name:'hello_world',language:{code:'en_US'}}};
  if (m.offer_id || m.appointment_id) return {...base,type:'interactive',interactive:{type:'button',body:{text:m.text},action:{buttons:[
    {type:'reply',reply:{id:`fa:${m.id}:yes`,title:m.offer_id?'Aceitar horário':'Confirmar presença'}},
    {type:'reply',reply:{id:`fa:${m.id}:no`,title:m.offer_id?'Manter meu horário':'Não vou comparecer'}}]}}};
  return {...base,type:'text',text:{preview_url:false,body:m.text}};
}
export function metaError(code, status) {
  return ({190:'O token da Meta expirou ou é inválido. Atualize em Integrações.',131030:'Cadastre e verifique este destinatário no painel de testes da Meta.',131047:'A janela de 24 horas terminou. Peça à cliente para enviar uma mensagem ou configure os modelos aprovados.',131026:'A Meta não entregou a mensagem. Confira o telefone e o status da conta na Meta.',131031:'A conta WhatsApp está restrita. Confira o painel da Meta.',10:'O token não tem a permissão necessária.',100:'Confira o ID do telefone, a versão da API e os dados no painel da Meta.'})[code] || `A Meta recusou a solicitação (HTTP ${status}${code?`, código ${code}`:''}).`;
}
export async function metaCall(config, path, method='GET', body, fetcher=fetch) {
  let r;
  try {r=await fetcher(`https://graph.facebook.com/${config.version}/${path}`,{method,headers:{Authorization:`Bearer ${config.accessToken}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});}
  catch {const e=new Error('Não foi possível confirmar o envio. Confira a conversa antes de tentar outra mensagem.');e.uncertain=method==='POST';throw e;}
  let d;try {d=await r.json();}catch {d={};}
  if (!r.ok || d.error) {const e=new Error(metaError(Number(d.error?.code),r.status));e.uncertain=method==='POST'&&r.status>=500;throw e;}
  return d;
}

export function applyStatus(state, status, phoneId) {
  const m=state.messages.find(m=>m.whatsapp?.phoneId===phoneId &&
    ((m.whatsapp.id && m.whatsapp.id===status.id) || (status.biz_opaque_callback_data===m.id && ['sending','unknown'].includes(m.whatsapp.status))));
  if (!m || phone(status.recipient_id)!==m.whatsapp.to || !['sent','delivered','read','failed'].includes(status.status)) return;
  const current=m.whatsapp.status;
  if (status.status==='failed') {if(['delivered','read'].includes(current))return; m.whatsapp.error=metaError(status.errors?.[0]?.code,400);}
  else if (SENT.indexOf(status.status)<SENT.indexOf(current)) return;
  m.whatsapp.id=status.id;m.whatsapp.status=status.status;m.whatsapp.updated=Number(status.timestamp)*1000;
}
export function replyContext(state, event, config) {
  const to=phone(event.from),time=Number(event.timestamp)*1000;
  const sent=state.messages.filter(m=>m.whatsapp?.phoneId===config.phoneId && m.whatsapp.to===to &&
    SENT.includes(m.whatsapp.status) && m.whatsapp.sentAt<=time+1000);
  const button=event.interactive?.button_reply?.id||event.button?.payload;
  if (button) {const match=/^fa:(M[a-f0-9]+):(yes|no)$/.exec(button);return match?sent.find(m=>m.id===match[1]&&(!event.context?.id||m.whatsapp.id===event.context.id)):undefined;}
  if(event.context?.id)return sent.find(m=>m.whatsapp.id===event.context.id);
  return sent.reverse().sort((a,b)=>(b.whatsapp.sentAt-a.whatsapp.sentAt)||b.created-a.created)[0];
}
export function receiveMessage(state,event,config,now=Date.now(),interpretation=null) {
  if(!event.id || state.messages.some(m=>m.sender==='client'&&m.whatsapp?.id===event.id))return false;
  const from=phone(event.from),timestamp=Number(event.timestamp)*1000;
  if(!incomingAllowed(config,from)||!Number.isFinite(timestamp)||timestamp>now+300000)return false;
  const matches=state.clients.filter(c=>phone(c.phone)===from),c=matches.length===1?matches[0]:null;
  const text=String(event.text?.body||event.interactive?.button_reply?.title||event.button?.text||`[${event.type||'Conteúdo'} recebido: confira no WhatsApp]`).slice(0,1000);
  const optOut=/^(sair|parar|parar mensagens|cancelar mensagens|nao quero receber mensagens)[.!]?$/i.test(text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim());
  if(optOut&&c)c.consent=false;
  const context=replyContext(state,event,config);
  const direct=(event.interactive?.button_reply?.id||event.button?.payload)?.match(/^fa:M[a-f0-9]+:(yes|no)$/)?.[1] || replyIntent(text);
  const before=state.messages.length;
  let outcome=optOut&&c?'Autorização de contato removida a pedido da cliente. Nenhum agendamento foi cancelado.':'Mensagem recebida. Atendimento da equipe necessário.';
  state.whatsappLastInbound??={};state.whatsappLastInbound[from]=Math.max(state.whatsappLastInbound[from]||0,Math.min(now,timestamp));
  // Delayed or unrelated replies are recorded, but cannot modify a newer booking.
  if(config.enabled&&c&&c.consent&&context?.channel===c.id&&!event.oversized&&['text','interactive','button'].includes(event.type)&&timestamp>=now-10*60000&&currentQuestion(state,context,now)) {
    if(context.offer_id) {
      actAdmin(state,'response',{id:context.offer_id,text,result:direct==='yes'?'accepted':direct==='no'?'refused':interpretation?.result||'ambiguous',...(interpretation?{interpretation}:{})},now);
      outcome='Resposta vinculada à proposta. Aceites aguardam aprovação da gerência.';
    } else if(context.appointment_id && direct) {
      message(state,c.id,'client',text,{appointment_id:context.appointment_id},now);
      actAdmin(state,'presence',{id:context.appointment_id,answer:direct},now);
      message(state,c.id,'agent',direct==='yes'?'Presença confirmada. Esperamos você no horário agendado.':'Cancelamento registrado. Obrigada por avisar.',{},now);
      outcome=direct==='yes'?'Presença confirmada.':'Atendimento cancelado pela cliente; vaga encaminhada ao fluxo de encaixe.';
    }
  }
  if(state.messages.length===before)message(state,c?.id||`wa:${from}`,'client',text,{},now);
  const incoming=state.messages.slice(before).find(m=>m.sender==='client');
  incoming.whatsapp={id:event.id,status:'received',from,phoneId:config.phoneId,timestamp,outcome};
  return true;
}
