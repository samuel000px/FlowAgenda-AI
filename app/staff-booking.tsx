"use client";
// Marcar horário para quem chegou na loja, pensado para o celular da funcionária: serviço, com quem,
// dia, horário, nome e se a cliente quer antecipar. Entra direto na agenda, já confirmado.
import {useEffect,useState,type FormEvent} from 'react';
import {CalendarPlus} from 'lucide-react';
import {today} from '../lib/flowagenda.mjs';
type Row=Record<string,any>;
const amanha=()=>{const d=new Date(today()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);};
const rotulo=(d:string)=>d===today()?'Hoje':d===amanha()?'Amanhã':d.split('-').reverse().slice(0,2).join('/');

export default function StaffBooking({catalog,me,busy,act,onDone}:{catalog:Row,me:string,busy:boolean,act:(action:string,p:Row,message?:string)=>Promise<boolean>,onDone:(date:string)=>void}){
 const [servico,setServico]=useState(''),[opcao,setOpcao]=useState(''),[pessoa,setPessoa]=useState(''),[data,setData]=useState(today()),[inicio,setInicio]=useState<number|null>(null);
 const [horarios,setHorarios]=useState<Row[]|null>(null),[erro,setErro]=useState(''),[antecipar,setAntecipar]=useState<boolean|null>(null);
 const escolhido=catalog.services.find((v:Row)=>v.id===servico),equipe=catalog.staff.filter((p:Row)=>p.services.includes(servico));
 const falta=escolhido?.variants.length&&opcao==='';

 // Ao trocar de serviço, a profissional começa por quem está usando o celular, se ela fizer o serviço.
 function trocarServico(id:string){setServico(id);setOpcao('');const faz=catalog.staff.filter((p:Row)=>p.services.includes(id));setPessoa(faz.some((p:Row)=>p.id===me)?me:faz[0]?.id||'');}

 useEffect(()=>{
  setInicio(null);setHorarios(null);setErro('');
  if(!servico||!pessoa||!data||falta)return;
  let valido=true;
  const cart={items:[{service:servico,...(opcao!==''?{variant:Number(opcao)}:{})}],staff:{[escolhido.group]:pessoa}};
  fetch(`/api/staff?cart=${encodeURIComponent(JSON.stringify(cart))}&date=${data}`).then(r=>r.json()).then((d:any)=>{if(!valido)return;if(d.error)setErro(d.error);setHorarios(d.slots||[]);}).catch(()=>{if(valido)setErro('Não foi possível buscar os horários.');});
  return()=>{valido=false};
 },[servico,opcao,pessoa,data]); // eslint-disable-line react-hooks/exhaustive-deps

 async function marcar(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const form=e.currentTarget,f=new FormData(form);
  const cart={items:[{service:servico,...(opcao!==''?{variant:Number(opcao)}:{})}],staff:{[escolhido.group]:pessoa}};
  const hora=horarios?.find(h=>h.start===inicio)?.time;
  if(await act('book_in_store',{name:f.get('name'),phone:f.get('phone'),cart,date:data,start:inicio,earlier:antecipar},`Horário marcado: ${String(f.get('name')).split(' ')[0]}, ${rotulo(data).toLowerCase()} às ${hora}. Já está na agenda.`)){
   form.reset();setServico('');setOpcao('');setPessoa('');setAntecipar(null);onDone(data);
  }
 }

 const grupos:string[]=catalog.groups?.length?catalog.groups:[...new Set<string>(catalog.services.map((v:Row)=>v.group))];
 if(!catalog.services.length)return <section className="panel empty"><CalendarPlus size={30}/><h3>Nenhum serviço disponível</h3><p>A gerência precisa cadastrar serviços e profissionais em Equipe e serviços.</p></section>;
 return <section className="panel staff-booking"><h2>Marcar para quem chegou</h2><p className="muted small">O horário entra direto na agenda, já confirmado.</p>
  <form onSubmit={marcar}>
   <label className="field"><span>Serviço</span><select value={servico} onChange={e=>trocarServico(e.target.value)} required disabled={busy}>
    <option value="" disabled>Escolha o serviço</option>
    {grupos.map(g=><optgroup key={g} label={g||'Serviços'}>{catalog.services.filter((v:Row)=>v.group===g).map((v:Row)=><option key={v.id} value={v.id}>{v.name}</option>)}</optgroup>)}
   </select></label>
   {escolhido?.variants.length>0&&<label className="field"><span>Opção</span><select value={opcao} onChange={e=>setOpcao(e.target.value)} required disabled={busy}><option value="" disabled>Escolha</option>{escolhido.variants.map((v:Row,i:number)=><option key={v.name} value={i}>{v.name}</option>)}</select></label>}

   {escolhido&&<fieldset className="staff-step"><legend>Com quem</legend><div className="staff-chips">{equipe.map((p:Row)=><button type="button" key={p.id} aria-pressed={pessoa===p.id} disabled={busy} onClick={()=>setPessoa(p.id)}>{p.id===me?`${p.name} (eu)`:p.name}</button>)}</div></fieldset>}

   {escolhido&&<fieldset className="staff-step"><legend>Quando</legend><div className="staff-chips">{[today(),amanha()].map(d=><button type="button" key={d} aria-pressed={data===d} disabled={busy} onClick={()=>setData(d)}>{rotulo(d)}</button>)}<input className="staff-other-day" aria-label="Outro dia" type="date" min={today()} value={data} disabled={busy} onChange={e=>{if(e.target.value)setData(e.target.value);}}/></div></fieldset>}

   {escolhido&&!falta&&<fieldset className="staff-step"><legend>Horário</legend>
    {horarios===null?<p className="muted small">{erro||'Buscando horários livres…'}</p>
     :horarios.length?<div className="staff-slots">{horarios.map(h=><button type="button" key={h.start} aria-pressed={inicio===h.start} disabled={busy} onClick={()=>setInicio(h.start)}>{h.time}</button>)}</div>
     :<p className="muted small">{erro||'Nenhum horário livre neste dia. Tente outro dia ou outra profissional.'}</p>}
   </fieldset>}

   {inicio!==null&&<>
    <label className="field"><span>Nome da cliente</span><input name="name" required minLength={2} maxLength={100} autoComplete="off" autoCapitalize="words" disabled={busy}/></label>
    <label className="field"><span>WhatsApp (opcional)</span><input name="phone" type="tel" inputMode="tel" autoComplete="off" placeholder="(83) 99999-9999" maxLength={20} disabled={busy}/></label>
    <fieldset className="staff-step"><legend>Gostaria de antecipar caso encontrássemos outro horário mais cedo?</legend><div className="staff-yesno">{[[true,'Sim'],[false,'Não']].map(([v,t])=><button type="button" key={t as string} aria-pressed={antecipar===v} disabled={busy} onClick={()=>setAntecipar(v as boolean)}>{t as string}</button>)}</div></fieldset>
    <button type="submit" className="staff-submit" disabled={busy||antecipar===null}><CalendarPlus size={18}/>{busy?'Marcando…':'Marcar horário'}</button>
   </>}
  </form>
 </section>;
}
