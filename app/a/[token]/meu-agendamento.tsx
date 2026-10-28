"use client";
// Página pessoal do agendamento: quem tem o link vê os detalhes e pode cancelar.
import {useEffect,useState} from 'react';
import {reais} from '../../agendar/agendar';

export default function MeuAgendamento({token}:{token:string}){
  const [dados,setDados]=useState<Record<string,any>|null>(null),[erro,setErro]=useState(''),[confirmar,setConfirmar]=useState(false),[ocupado,setOcupado]=useState(false);
  useEffect(()=>{fetch(`/api/agendar?token=${encodeURIComponent(token)}`).then(r=>r.json()).then((d:any)=>{if(d.error)throw Error(d.error);setDados(d);}).catch(e=>setErro((e as Error).message));},[token]);
  async function cancelar(){
    setOcupado(true);setErro('');
    try{const r=await fetch('/api/agendar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'cancel',token})});const d:any=await r.json();if(!r.ok)throw Error(d.error);setDados(d);setConfirmar(false);}
    catch(e){setErro((e as Error).message);}
    finally{setOcupado(false);}
  }
  if(!dados)return erro?<p className="aviso" role="alert">{erro}</p>:<p className="vazio">Carregando…</p>;
  return <div className="formulario">
    <p className="resumo">Olá, {dados.name}! Situação: <strong>{dados.status}</strong></p>
    <ul className="detalhes">
      <li><span>Serviço</span>{dados.service}</li>
      <li><span>Profissional</span>{dados.staff}</li>
      <li><span>Quando</span>{dados.date.split('-').reverse().join('/')} às {dados.time}</li>
      <li><span>Valor</span>{reais(dados.price)}</li>
    </ul>
    {erro&&<p className="aviso" role="alert">{erro}</p>}
    {dados.open&&(confirmar
      ?<><p>Tem certeza? O horário será liberado para outra cliente.</p><button className="botao" disabled={ocupado} onClick={cancelar}>{ocupado?'Cancelando…':'Sim, cancelar'}</button><button className="botao claro" onClick={()=>setConfirmar(false)}>Manter agendamento</button></>
      :<button className="botao claro" onClick={()=>setConfirmar(true)}>Cancelar agendamento</button>)}
  </div>;
}
