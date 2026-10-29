"use client";
// Os serviços vêm do painel (Equipe e serviços), os mesmos que aparecem no agendamento.
import {useEffect,useState} from 'react';
import {IconeArea,aPartirDe,duracao,reais,type Catalogo} from '../agendar/agendar';

export default function Servicos(){
  const [dados,setDados]=useState<Catalogo|null>(null),[erro,setErro]=useState('');
  useEffect(()=>{fetch('/api/agendar').then(r=>r.json()).then((d:any)=>{if(d.error)throw Error(d.error);setDados(d);}).catch(e=>setErro((e as Error).message));},[]);
  if(erro)return <p className="aviso" role="alert">{erro}</p>;
  if(!dados)return <p className="vazio">Carregando…</p>;
  if(!dados.services.length)return <p className="vazio">A lista de serviços ainda está sendo preparada.</p>;
  return <div className="servicos-lista">{dados.groups.map(g=>{const extras=dados.addons.filter(a=>a.group===g);return <div className="area" key={g}>
    <h3 className="area-titulo"><IconeArea area={g}/>{g}</h3>
    {dados.services.filter(v=>v.group===g).map(v=><div className="escolha" key={v.id}>
      <div><strong>{v.name}</strong><small>{v.variants.length?v.variants.map(o=>`${o.name} ${reais(o.price)}`).join(' · '):duracao(v.duration)}</small></div>
      <span className="preco">{v.variants.length?'a partir de ':''}{reais(aPartirDe(v))}</span>
      <a href={`/agendar?servico=${v.id}`}>Agendar</a>
    </div>)}
    {extras.length>0&&<p className="extras">Adicionais: {extras.map(a=>`${a.name} (+${reais(a.price)})`).join(' · ')}</p>}
  </div>;})}</div>;
}
