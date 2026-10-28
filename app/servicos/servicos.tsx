"use client";
// Os serviços vêm do painel (Equipe e serviços), os mesmos que aparecem no agendamento.
import {useEffect,useState} from 'react';
import {duracao,reais} from '../agendar/agendar';

type Servico={id:string,name:string,duration:number,price:number};

export default function Servicos(){
  const [lista,setLista]=useState<Servico[]|null>(null),[erro,setErro]=useState('');
  useEffect(()=>{fetch('/api/agendar').then(r=>r.json()).then((d:any)=>{if(d.error)throw Error(d.error);setLista(d.services);}).catch(e=>setErro((e as Error).message));},[]);
  if(erro)return <p className="aviso" role="alert">{erro}</p>;
  if(!lista)return <p className="vazio">Carregando…</p>;
  if(!lista.length)return <p className="vazio">A lista de serviços ainda está sendo preparada.</p>;
  return <div className="servicos-lista">{lista.map(v=><div className="escolha" key={v.id}>
    <div><strong>{v.name}</strong><small>{duracao(v.duration)}</small></div>
    <span className="preco">{reais(v.price)}</span>
    <a href={`/agendar?servico=${v.id}`}>Agendar</a>
  </div>)}</div>;
}
