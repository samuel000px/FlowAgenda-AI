"use client";
// Página pessoal do agendamento: quem tem o link vê os detalhes. Para cancelar, confirma primeiro (avisando
// que talvez não ache mais vaga) e vai para o /cancelar, que pede o motivo antes de cancelar.
import {useEffect,useState} from 'react';
import {reais} from '../../agendar/agendar';

export default function MeuAgendamento({token}:{token:string}){
  const [dados,setDados]=useState<Record<string,any>|null>(null),[erro,setErro]=useState(''),[confirmar,setConfirmar]=useState(false);
  useEffect(()=>{fetch(`/api/agendar?token=${encodeURIComponent(token)}`).then(r=>r.json()).then((d:any)=>{if(d.error)throw Error(d.error);setDados(d);}).catch(e=>setErro((e as Error).message));},[token]);
  if(!dados)return erro?<p className="aviso" role="alert">{erro}</p>:<p className="vazio">Carregando…</p>;
  return <div className="formulario">
    <p className="resumo">Olá, {dados.name}! Situação: <strong>{dados.status}</strong></p>
    <p className="resumo-dia">{dados.date.split('-').reverse().join('/')}</p>
    <ul className="detalhes">
      {(dados.items as any[]).map(x=><li key={x.name}><span>{x.time}–{x.end} · {x.staff}</span>{x.name}</li>)}
      <li><span>Total</span><strong>{reais(dados.total)}</strong></li>
    </ul>
    {erro&&<p className="aviso" role="alert">{erro}</p>}
    {dados.open&&(confirmar
      ?<div className="confirmar-cancelar"><p><strong>Tem certeza que quer cancelar?</strong></p><p>{dados.items.length>1?'Todos os horários deste pedido serão liberados':'Seu horário será liberado'} para outra cliente, e os horários costumam lotar: se mudar de ideia depois, talvez não encontre mais vaga nesse dia.</p><button className="botao" onClick={()=>setConfirmar(false)}>Manter meu horário</button><a className="botao claro" href={`/cancelar?t=${encodeURIComponent(token)}`}>Sim, quero cancelar</a></div>
      :<button className="botao claro" onClick={()=>setConfirmar(true)}>Cancelar agendamento</button>)}
  </div>;
}
