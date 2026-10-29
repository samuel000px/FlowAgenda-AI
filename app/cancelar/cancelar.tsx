"use client";
import {useRef,useState,type FormEvent} from 'react';
import {CheckCircle2,CalendarX2,ArrowRight} from 'lucide-react';
export default function Cancelar({servicos}:{servicos:string[]}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[sent,setSent]=useState(false);
 const locked=useRef(false),requestId=useRef('');
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(locked.current)return;locked.current=true;setBusy(true);setError('');
  const f=new FormData(e.currentTarget);requestId.current||=crypto.randomUUID();
  try{
   const body={name:f.get('name'),phone:f.get('phone'),service:f.get('service'),date:f.get('date'),time:f.get('time'),reason:f.get('reason'),consent:f.has('consent'),requestId:requestId.current};
   const r=await fetch('/api/cancelar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const data:any=await r.json();if(!r.ok)throw Error(data.error||'Não foi possível enviar. Tente novamente.');setSent(true);
  }catch(e){setError((e as Error).message||'Confira sua conexão e tente novamente.');}finally{locked.current=false;setBusy(false);}
 }
 if(sent)return <section className="atendimento-sucesso" role="status"><CheckCircle2 size={42}/><h2>Recebemos seu pedido</h2><p>A equipe vai entrar em contato pelo WhatsApp informado para confirmar o cancelamento.</p><p className="atendimento-nota">Até a confirmação, o horário continua reservado.</p><a className="botao" href="/">Voltar para o início <ArrowRight size={18}/></a></section>;
 return <form className="formulario atendimento-form" onSubmit={submit}>
  <label>Seu nome<input name="name" autoComplete="name" minLength={2} maxLength={100} required placeholder="Como você se chama?" disabled={busy}/></label>
  <label>Seu WhatsApp com DDD<input name="phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={22} required placeholder="(83) 99999-9999" disabled={busy}/><small>O mesmo número usado no agendamento, se possível.</small></label>
  <label>Qual era o procedimento?<select name="service" required defaultValue="" disabled={busy}><option value="" disabled>Escolha o serviço</option>{servicos.map(n=><option key={n} value={n}>{n}</option>)}<option value="Outro">Outro</option></select></label>
  <div className="cancelar-quando"><label>Dia<input name="date" type="date" required disabled={busy}/></label><label>Horário<input name="time" type="time" required disabled={busy}/></label></div>
  <label>Motivo do cancelamento<textarea name="reason" rows={4} minLength={3} maxLength={600} required placeholder="Conte rapidinho o que aconteceu." disabled={busy}/></label>
  <label className="atendimento-consent"><input name="consent" type="checkbox" required disabled={busy}/><span>Autorizo a equipe a entrar em contato pelo WhatsApp sobre este pedido.</span></label>
  {error&&<p className="atendimento-erro" role="alert">{error}</p>}
  <button className="botao" type="submit" disabled={busy}><CalendarX2 size={20}/>{busy?'Enviando seu pedido…':'Pedir cancelamento'}</button>
  <p className="atendimento-nota">Este pedido não cancela sozinho: a equipe confirma com você.</p>
 </form>;
}
