"use client";
import {useRef,useState,type FormEvent} from 'react';
import {CheckCircle2,MessageCircle,ArrowRight} from 'lucide-react';
export default function Atendimento(){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[sent,setSent]=useState(false);
 const locked=useRef(false),requestId=useRef('');
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(locked.current)return;locked.current=true;setBusy(true);setError('');
  const f=new FormData(e.currentTarget);requestId.current||=crypto.randomUUID();
  try{
   const r=await fetch('/api/atendimento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.get('name'),phone:f.get('phone'),text:f.get('text'),consent:f.has('consent'),requestId:requestId.current})});
   const data:any=await r.json();if(!r.ok)throw Error(data.error||'Não foi possível enviar. Tente novamente.');setSent(true);
  }catch(e){setError((e as Error).message||'Confira sua conexão e tente novamente.');}finally{locked.current=false;setBusy(false);}
 }
 if(sent)return <section className="atendimento-sucesso" role="status"><CheckCircle2 size={42}/><h2>Seu pedido foi enviado</h2><p>A equipe já pode ver sua mensagem e vai entrar em contato pelo WhatsApp informado.</p><p className="atendimento-nota">O retorno acontece durante o horário de atendimento. Seus agendamentos continuam como estão.</p><a className="botao" href="/">Voltar para o início <ArrowRight size={18}/></a></section>;
 return <form className="formulario atendimento-form" onSubmit={submit}>
  <label>Seu nome<input name="name" autoComplete="name" minLength={2} maxLength={100} required placeholder="Como você se chama?" disabled={busy}/></label>
  <label>Seu WhatsApp com DDD<input name="phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={22} required placeholder="(83) 99999-9999" aria-describedby="support-phone-hint" disabled={busy}/><small id="support-phone-hint">É por esse número que a equipe vai falar com você.</small></label>
  <label>Como podemos ajudar?<textarea name="text" rows={5} minLength={3} maxLength={1000} required placeholder="Conte sua dúvida ou o que você precisa." disabled={busy}/></label>
  <label className="atendimento-consent"><input name="consent" type="checkbox" required disabled={busy}/><span>Autorizo a equipe a entrar em contato pelo WhatsApp para responder a este pedido.</span></label>
  {error&&<p className="atendimento-erro" role="alert">{error}</p>}
  <button className="botao" type="submit" disabled={busy}><MessageCircle size={20}/>{busy?'Enviando seu pedido…':'Solicitar atendimento'}</button>
  <p className="atendimento-nota">Este pedido não agenda nem cancela horários.</p>
 </form>;
}
