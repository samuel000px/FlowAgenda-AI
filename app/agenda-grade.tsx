"use client";
// Agenda do dia no estilo do Google Agenda: uma coluna por profissional, horários na lateral e cada
// atendimento como um bloco na cor da profissional (sempre a mesma para cada uma).
// As caixas de seleção mostram ou escondem cada profissional; a escolha fica guardada no navegador.
import {useEffect,useMemo,useState} from 'react';
import {digest} from '../lib/cripto.mjs';
type Row=Record<string,any>;
// Paleta de cores de evento do Google Agenda.
const GOOGLE:Record<string,string>={'1':'#7986cb','2':'#33b679','3':'#8e24aa','5':'#f6bf26','6':'#f4511e','7':'#039be5','9':'#3f51b5','10':'#0b8043'};
const IDS=['1','2','3','5','6','7','9','10'];
const PX=1.3; // pixels por minuto: meia hora = 39px
const hora=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const CHAVE='flowagenda.agenda.ocultas';

export function useOcultas(){
 const [ocultas,setOcultas]=useState<string[]>([]);
 useEffect(()=>{try{setOcultas(JSON.parse(localStorage.getItem(CHAVE)||'[]'));}catch{/* sem armazenamento: mostra todas */}},[]);
 const trocar=(lista:string[])=>{setOcultas(lista);try{localStorage.setItem(CHAVE,JSON.stringify(lista));}catch{/* só nesta visita */}};
 return [ocultas,trocar] as const;
}

export function useCores(staff:Row[]){
 const [cores,setCores]=useState<Record<string,string>>({});
 const chave=staff.map(p=>p.id).join(',');
 useEffect(()=>{let vivo=true;Promise.all(staff.map(async p=>[p.id,GOOGLE[IDS[parseInt((await digest(String(p.id))).slice(0,8),16)%IDS.length]]])).then(l=>{if(vivo)setCores(Object.fromEntries(l));});return()=>{vivo=false};},[chave]);// eslint-disable-line react-hooks/exhaustive-deps
 return cores;
}

export function ProfissionaisFiltro({staff,ocultas,setOcultas,cores,contagem}:{staff:Row[],ocultas:string[],setOcultas:(l:string[])=>void,cores:Record<string,string>,contagem:Record<string,number>}){
 const todas=ocultas.length===0;
 return <div className="agenda-filtro" role="group" aria-label="Profissionais visíveis">
  <label className="agenda-check"><input type="checkbox" checked={todas} onChange={()=>setOcultas(todas?staff.map(p=>p.id):[])}/>Todas</label>
  {staff.map(p=><label key={p.id} className="agenda-check"><input type="checkbox" checked={!ocultas.includes(p.id)} onChange={e=>setOcultas(e.target.checked?ocultas.filter(x=>x!==p.id):[...ocultas,p.id])}/><i style={{background:cores[p.id]||'#b9a3a8'}}/>{p.name}<small>{contagem[p.id]||0}</small></label>)}
 </div>;
}

export default function AgendaGrade({date,items,staff,cores,hours,label,client,status,onManage,onConversation}:{date:string,items:Row[],staff:Row[],cores:Record<string,string>,hours?:number[],label:(a:Row)=>string,client:(id:string)=>Row,status:(a:Row)=>{text:string,kind:string},onManage:(a:Row)=>void,onConversation:(id:string)=>void}){
 const [agora,setAgora]=useState(()=>Date.now());
 useEffect(()=>{const t=setInterval(()=>setAgora(Date.now()),60000);return()=>clearInterval(t);},[]);
 // A grade vai do início do expediente (ou do primeiro horário) ao fim, de meia em meia hora.
 const [ini,fim]=useMemo(()=>{
  const a=Math.min(hours?.[0]??540,...items.map(x=>x.start)),b=Math.max(hours?.[1]??1080,...items.map(x=>x.end));
  return [Math.floor(a/30)*30,Math.ceil(b/30)*30];
 },[items,hours]);
 const linhas=Array.from({length:(fim-ini)/30+1},(_,i)=>ini+i*30),altura=(fim-ini)*PX;
 const hoje=new Date(agora-3*3600000).toISOString().slice(0,10)===date,minAgora=Math.floor((agora-3*3600000)%86400000/60000);
 if(!staff.length)return <p className="empty-inline">Marque pelo menos uma profissional para ver a agenda.</p>;
 return <div className="agenda-grade" style={{['--colunas' as string]:staff.length}}>
  <div className="agenda-cabecalho"><span/>{staff.map(p=><div key={p.id}><i style={{background:cores[p.id]}}/><strong>{p.name}</strong><small>{items.filter(a=>a.staff_id===p.id&&['booked','requested'].includes(a.status)).length} atend.</small></div>)}</div>
  <div className="agenda-corpo" style={{height:altura}}>
   <div className="agenda-horas">{linhas.map(m=><span key={m} style={{top:(m-ini)*PX}} className={m%60?'meia':''}>{m%60?'':hora(m)}</span>)}</div>
   {linhas.map(m=><div key={m} className={'agenda-linha'+(m%60?' meia':'')} style={{top:(m-ini)*PX}}/>)}
   {hoje&&minAgora>=ini&&minAgora<=fim&&<div className="agenda-agora" style={{top:(minAgora-ini)*PX}}><b/></div>}
   {staff.map((p,col)=><div key={p.id} className="agenda-coluna" style={{gridColumn:col+2}}>
    {items.filter(a=>a.staff_id===p.id).map(a=>{
     const st=status(a),cor=cores[p.id]||'#b9a3a8',podeGerenciar=a.status==='booked'&&!a.result&&Date.parse(`${a.date}T${hora(a.start)}:00-03:00`)>agora;
     const classe='agenda-bloco '+(a.status==='requested'?'pedido':!['booked'].includes(a.status)?'cancelado':a.result==='missed'?'falta':a.result==='attended'?'feito':'');
     return <button key={a.id} type="button" className={classe} style={{top:(a.start-ini)*PX+1,height:Math.max(22,(a.end-a.start)*PX-3),['--cor' as string]:cor}}
      title={`${hora(a.start)}–${hora(a.end)} · ${client(a.client_id).name} · ${label(a)} · ${st.text}`}
      onClick={()=>podeGerenciar?onManage(a):onConversation(a.client_id)}>
      <strong>{client(a.client_id).name}</strong><span>{hora(a.start)}–{hora(a.end)} · {label(a)}</span>{(a.end-a.start)>=60&&<em>{st.text}</em>}
     </button>;
    })}
   </div>)}
  </div>
 </div>;
}
