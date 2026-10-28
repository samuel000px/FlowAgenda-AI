"use client";
// Fechar um atendimento: quem atendeu, quanto a cliente pagou de verdade e como pagou. Usado pela
// gerência (Fechamento) e pela equipe (aba Fechamento do celular).
import {useState,type FormEvent} from 'react';
type Row=Record<string,any>;
const METODOS=['Pix','Dinheiro','Cartão'];

export default function ClosingDialog({appointment,team,busy,error='',onSubmit,onClose}:{appointment:Row,team:Row[],busy:boolean,error?:string,onSubmit:(p:Row)=>Promise<boolean>,onClose:()=>void}){
 const [method,setMethod]=useState('');
 async function enviar(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const f=new FormData(e.currentTarget);
  if(await onSubmit({id:appointment.id,staffId:f.get('staffId'),amount:Number(String(f.get('amount')).replace(',','.')),method,note:f.get('note')}))onClose();
 }
 return <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="closing-title"><form className="modal-content closing-form" onSubmit={enviar}>
  <h2 id="closing-title">Fechar atendimento</h2>
  <p className="muted">{appointment.clientName} · {appointment.serviceName}</p>
  {error&&<p className="error" role="alert">{error}</p>}
  <label className="field"><span>Quem atendeu</span><select name="staffId" defaultValue={appointment.staffId} disabled={busy}>{team.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  <label className="field"><span>Quanto a cliente pagou (R$)</span><input name="amount" type="number" inputMode="decimal" min="0" max="10000" step="0.01" required defaultValue={appointment.price??''} disabled={busy}/><small>Se fez algo a mais (ex.: babyboomer que não estava na agenda), coloque o valor que ficou.</small></label>
  <fieldset className="closing-methods"><legend>Como pagou</legend>{METODOS.map(m=><button type="button" key={m} className={method===m?'':'secondary'} aria-pressed={method===m} disabled={busy} onClick={()=>setMethod(m)}>{m}</button>)}</fieldset>
  {method==='Cartão'&&<p className="muted small">No cartão, o valor já vai com a taxa da maquininha.</p>}
  <label className="field"><span>O que mudou no atendimento? (opcional)</span><input name="note" maxLength={200} placeholder="Ex.: fez francesinha também" disabled={busy}/></label>
  <div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>Voltar</button><button disabled={busy||!method}>{method?'Fechar atendimento':'Escolha como pagou'}</button></div>
 </form></section></div>;
}
