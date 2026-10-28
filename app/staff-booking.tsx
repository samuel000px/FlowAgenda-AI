"use client";
// Marcar horário pela funcionária, pensado para o celular: para quem chegou na loja ou para outro dia.
// Serviço, com quem, dia, horário, cliente e se ela quer antecipar. Entra direto na agenda, confirmado.
import {useEffect,useState,type FormEvent} from 'react';
import {CalendarPlus,UserPlus} from 'lucide-react';
import {nameKey,phoneKey,today} from '../lib/flowagenda.mjs';
type Row=Record<string,any>;
const amanha=()=>{const d=new Date(today()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);};
const rotulo=(d:string)=>d===today()?'Hoje':d===amanha()?'Amanhã':d.split('-').reverse().slice(0,2).join('/');
const final=(c:Row)=>c.phoneEnd?`final ${c.phoneEnd}`:'sem celular';

/** Clientes do cadastro que batem com o texto (nome ou 4+ dígitos), buscadas com uma pequena pausa. */
function useClientes(texto:string){
 const [lista,setLista]=useState<Row[]>([]),q=texto.trim(),curto=nameKey(q).length<2&&q.replace(/\D/g,'').length<4;
 useEffect(()=>{
  if(curto)return;let valido=true;
  const t=setTimeout(()=>{fetch('/api/staff?clientes='+encodeURIComponent(q)).then(r=>r.json()).then((d:any)=>{if(valido)setLista(d.clients||[]);}).catch(()=>{});},250);
  return()=>{valido=false;clearTimeout(t);};
 },[q,curto]);
 return curto?[]:lista;
}

export default function StaffBooking({catalog,me,busy,act,onDone}:{catalog:Row,me:string,busy:boolean,act:(action:string,p:Row,message?:string)=>Promise<boolean>,onDone:(date:string)=>void}){
 const [servico,setServico]=useState(''),[opcao,setOpcao]=useState(''),[pessoa,setPessoa]=useState(''),[data,setData]=useState(today()),[inicio,setInicio]=useState<number|null>(null);
 const [horarios,setHorarios]=useState<Row[]|null>(null),[erro,setErro]=useState(''),[antecipar,setAntecipar]=useState<boolean|null>(null);
 // Cliente: busca no cadastro, uma da lista (cliente) ou uma nova (nova=true, com nome e celular).
 const [busca,setBusca]=useState(''),[cliente,setCliente]=useState<Row|null>(null),[nova,setNova]=useState(false),[nome,setNome]=useState(''),[celular,setCelular]=useState(''),[outra,setOutra]=useState(false);
 const achadas=useClientes(cliente?'':nova?nome:busca),pelonumero=useClientes(nova&&phoneKey(celular).length>=12?celular:'');
 const xara=nova?achadas.find(c=>nameKey(c.name)===nameKey(nome)):undefined,dono=pelonumero[0];
 const escolhido=catalog.services.find((v:Row)=>v.id===servico),equipe=catalog.staff.filter((p:Row)=>p.services.includes(servico));
 const falta=escolhido?.variants.length&&opcao==='';

 // Ao trocar de serviço, a profissional começa por quem está usando o celular, se ela fizer o serviço.
 function trocarServico(id:string){setServico(id);setOpcao('');const faz=catalog.staff.filter((p:Row)=>p.services.includes(id));setPessoa(faz.some((p:Row)=>p.id===me)?me:faz[0]?.id||'');}
 function usar(c:Row){setCliente(c);setNova(false);setCelular('');setOutra(false);}
 function limpar(){setCliente(null);setNova(false);setBusca('');setNome('');setCelular('');setOutra(false);}

 useEffect(()=>{
  setInicio(null);setHorarios(null);setErro('');
  if(!servico||!pessoa||!data||falta)return;
  let valido=true;
  const cart={items:[{service:servico,...(opcao!==''?{variant:Number(opcao)}:{})}],staff:{[escolhido.group]:pessoa}};
  fetch(`/api/staff?cart=${encodeURIComponent(JSON.stringify(cart))}&date=${data}`).then(r=>r.json()).then((d:any)=>{if(!valido)return;if(d.error)setErro(d.error);setHorarios(d.slots||[]);}).catch(()=>{if(valido)setErro('Não foi possível buscar os horários.');});
  return()=>{valido=false};
 },[servico,opcao,pessoa,data]); // eslint-disable-line react-hooks/exhaustive-deps

 async function marcar(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  const cart={items:[{service:servico,...(opcao!==''?{variant:Number(opcao)}:{})}],staff:{[escolhido.group]:pessoa}};
  const hora=horarios?.find(h=>h.start===inicio)?.time,quem=(cliente?.name||nome).split(' ')[0];
  const p=cliente?{client_id:cliente.id,phone:celular}:{name:nome,phone:celular,newClient:outra};
  if(await act('book_in_store',{...p,cart,date:data,start:inicio,earlier:antecipar},`Horário marcado: ${quem}, ${rotulo(data).toLowerCase()} às ${hora}. Já está na agenda.`)){
   setServico('');setOpcao('');setPessoa('');setAntecipar(null);limpar();onDone(data);
  }
 }

 const grupos:string[]=catalog.groups?.length?catalog.groups:[...new Set<string>(catalog.services.map((v:Row)=>v.group))];
 const pronta=cliente||(nova&&nome.trim().length>=2&&!dono&&(!xara||outra));
 if(!catalog.services.length)return <section className="panel empty"><CalendarPlus size={30}/><h3>Nenhum serviço disponível</h3><p>A gerência precisa cadastrar serviços e profissionais em Equipe e serviços.</p></section>;
 return <section className="panel staff-booking"><h2>Marcar para quem chegou ou para outro dia</h2><p className="muted small">O horário entra direto na agenda, já confirmado.</p>
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
    <fieldset className="staff-step"><legend>Cliente</legend>
     {cliente?<>
      <div className="staff-picked"><div><strong>{cliente.name}</strong><small>Celular {final(cliente)}</small></div><button type="button" className="text-button" disabled={busy} onClick={limpar}>Trocar</button></div>
      <label className="field"><span>{cliente.phoneEnd?'Ela trocou de número? Novo celular (opcional)':'Celular (opcional)'}</span><input type="tel" inputMode="tel" autoComplete="off" placeholder="(83) 99999-9999" maxLength={20} value={celular} onChange={e=>setCelular(e.target.value)} disabled={busy}/>{cliente.phoneEnd&&celular&&<small>O número antigo (final {cliente.phoneEnd}) é apagado e fica só este.</small>}</label>
     </>:nova?<>
      <label className="field"><span>Nome da nova cliente</span><input required minLength={2} maxLength={100} autoComplete="off" autoCapitalize="words" value={nome} onChange={e=>{setNome(e.target.value);setOutra(false);}} disabled={busy}/></label>
      {xara&&<div className="staff-match"><p>Já existe <strong>{xara.name}</strong> ({final(xara)}) no cadastro.</p><button type="button" className="secondary" disabled={busy} onClick={()=>usar(xara)}>É ela: usar este cadastro</button><label className="check-field"><input type="checkbox" checked={outra} onChange={e=>setOutra(e.target.checked)} disabled={busy}/>É outra pessoa, com o mesmo nome</label></div>}
      <label className="field"><span>Celular (opcional)</span><input type="tel" inputMode="tel" autoComplete="off" placeholder="(83) 99999-9999" maxLength={20} value={celular} onChange={e=>setCelular(e.target.value)} disabled={busy}/></label>
      {dono&&<div className="staff-match"><p>Este número já é de <strong>{dono.name}</strong>.</p><button type="button" className="secondary" disabled={busy} onClick={()=>usar(dono)}>Usar o cadastro dela</button></div>}
      <button type="button" className="text-button" disabled={busy} onClick={limpar}>Voltar para a busca</button>
     </>:<>
      <label className="field"><span>Nome ou celular</span><input type="search" autoComplete="off" autoCapitalize="words" placeholder="Comece a digitar…" value={busca} onChange={e=>setBusca(e.target.value)} disabled={busy}/></label>
      {achadas.length>0&&<div className="staff-found">{achadas.map(c=><button type="button" key={c.id} disabled={busy} onClick={()=>usar(c)}><strong>{c.name}</strong><small>{final(c)}</small></button>)}</div>}
      <button type="button" className="secondary staff-new" disabled={busy} onClick={()=>{const digitos=busca.replace(/\D/g,'');setNova(true);setNome(digitos.length>=4?'':busca.trim());setCelular(digitos.length>=4?busca:'');}}><UserPlus size={17}/>{busca.trim()&&busca.replace(/\D/g,'').length<4?`Cadastrar nova: ${busca.trim()}`:'Cadastrar nova cliente'}</button>
     </>}
    </fieldset>
    {pronta&&<>
     <fieldset className="staff-step"><legend>Gostaria de antecipar caso encontrássemos outro horário mais cedo?</legend><div className="staff-yesno">{[[true,'Sim'],[false,'Não']].map(([v,t])=><button type="button" key={t as string} aria-pressed={antecipar===v} disabled={busy} onClick={()=>setAntecipar(v as boolean)}>{t as string}</button>)}</div></fieldset>
     <button type="submit" className="staff-submit" disabled={busy||antecipar===null}><CalendarPlus size={18}/>{busy?'Marcando…':'Marcar horário'}</button>
    </>}
   </>}
  </form>
 </section>;
}
