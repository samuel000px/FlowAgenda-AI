"use client";
// Agendamento em passos na mesma tela: serviço, profissional, dia, horário e dados da cliente.
// No fim, a própria cliente manda a confirmação para o WhatsApp do salão (assim a conversa parte
// dela e a resposta do salão não é cobrada).
import {useEffect,useState,type FormEvent} from 'react';
import {linkWhatsapp} from '../../lib/vitrine.mjs';
import {salao} from '../salao';

type Servico={id:string,name:string,duration:number,price:number};
type Pessoa={id:string,name:string,services:string[]};
type Horario={start:number,time:string,staff:string[]};
type Dados={services:Servico[],staff:Pessoa[],days:string[],slots:Horario[]};
const SEMANA=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const POR_PAGINA=6;
const dia=(d:string)=>d.split('-').reverse().slice(0,2).join('/');
const semana=(d:string)=>SEMANA[new Date(d+'T12:00:00Z').getUTCDay()];
const iniciais=(v:string)=>v.split(' ').slice(0,2).map(x=>x[0]).join('').toUpperCase();
export const reais=(v:number)=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const duracao=(m:number)=>m<60?`${m} min`:`${Math.floor(m/60)}h${m%60?String(m%60).padStart(2,'0'):''}`;

export default function Agendar(){
  const [dados,setDados]=useState<Dados|null>(null),[erro,setErro]=useState(''),[ocupado,setOcupado]=useState(false);
  const [servico,setServico]=useState(''),[pessoa,setPessoa]=useState<string|null>(null),[pagina,setPagina]=useState(0),[data,setData]=useState(''),[inicio,setInicio]=useState<number|null>(null);
  const [horarios,setHorarios]=useState<Horario[]|null>(null),[pedido,setPedido]=useState<Record<string,any>|null>(null);

  useEffect(()=>{
    fetch('/api/agendar').then(r=>r.json()).then((d:any)=>{
      if(d.error)throw Error(d.error);
      setDados(d);const pedidoNaUrl=new URLSearchParams(location.search).get('servico');
      if(d.services.some((v:Servico)=>v.id===pedidoNaUrl))setServico(pedidoNaUrl!);
    }).catch(e=>setErro((e as Error).message));
  },[]);

  // Sempre que serviço, profissional ou dia mudam, busca os horários de novo.
  useEffect(()=>{
    setInicio(null);setHorarios(null);
    if(!servico||pessoa===null||!data)return;
    let valido=true;
    fetch(`/api/agendar?service=${servico}&staff=${pessoa}&date=${data}`).then(r=>r.json()).then((d:any)=>{if(valido){if(d.error)setErro(d.error);setHorarios(d.slots||[]);}});
    return()=>{valido=false};
  },[servico,pessoa,data]);

  async function enviar(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setOcupado(true);setErro('');
    const f=new FormData(e.currentTarget);
    try{
      const r=await fetch('/api/agendar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({service_id:servico,staff_id:pessoa,date:data,start:inicio,name:f.get('name'),phone:f.get('phone'),earlier:f.has('earlier')})});
      const d:any=await r.json();if(!r.ok)throw Error(d.error);setPedido(d);scrollTo(0,0);
    }catch(e){setErro((e as Error).message);}
    finally{setOcupado(false);}
  }

  if(pedido){
    const link=`${location.origin}/a/${pedido.token}`;
    const texto=`Olá! Sou ${pedido.name} e agendei ${pedido.service} para ${semana(pedido.date).toLowerCase()}, ${dia(pedido.date)}, às ${pedido.time} com ${pedido.staff}. Meu agendamento: ${link}`;
    return <div className="sucesso">
      <div className="selo-ok" aria-hidden="true">💅</div>
      <header className="titulo-pagina"><h1>Pedido recebido!</h1></header>
      <p>Obrigada, {pedido.name}! Recebemos seu pedido e vamos confirmar o horário com você em breve.</p>
      <ul className="detalhes">
        <li><span>Serviço</span>{pedido.service}</li>
        <li><span>Profissional</span>{pedido.staff}</li>
        <li><span>Quando</span>{semana(pedido.date)}, {dia(pedido.date)} às {pedido.time}</li>
        <li><span>Valor</span>{reais(pedido.price)}</li>
      </ul>
      <a className="botao" href={linkWhatsapp(salao.whatsapp,texto)} target="_blank" rel="noopener">Confirmar pelo WhatsApp</a>
      <a className="botao claro" href={`/a/${pedido.token}`}>Ver meu agendamento</a>
    </div>;
  }

  if(!dados)return erro?<p className="aviso" role="alert">{erro}</p>:<p className="vazio">Carregando…</p>;
  if(!dados.services.length)return <p className="vazio">A agenda online ainda está sendo preparada. Fale com a gente pelo WhatsApp.</p>;
  const escolhido=dados.services.find(v=>v.id===servico),equipe=dados.staff.filter(p=>p.services.includes(servico));
  const dias=dados.days.slice(pagina*POR_PAGINA,(pagina+1)*POR_PAGINA),nome=(id:string)=>dados.staff.find(p=>p.id===id)?.name||'';
  const horario=horarios?.find(h=>h.start===inicio);

  return <>
    <div className="passo">
      <span className="rotulo">1 · Serviço</span>
      {escolhido?<div className="escolha marcada"><div><strong>{escolhido.name}</strong><small>{duracao(escolhido.duration)} · {reais(escolhido.price)}</small></div><button className="trocar" onClick={()=>{setServico('');setPessoa(null);setData('');}}>Trocar</button></div>
        :dados.services.map(v=><button key={v.id} className="escolha" onClick={()=>{setServico(v.id);setPessoa(null);setData('');}}><div><strong>{v.name}</strong><small>{duracao(v.duration)}</small></div><span className="preco">{reais(v.price)}</span></button>)}
    </div>

    {escolhido&&<div className="passo">
      <span className="rotulo">2 · Profissional</span>
      <div className="chips">
        <button className="chip" aria-pressed={pessoa===''} onClick={()=>setPessoa('')}>Sem preferência</button>
        {equipe.map(p=><button key={p.id} className="chip" aria-pressed={pessoa===p.id} onClick={()=>setPessoa(p.id)}>{p.name}</button>)}
      </div>
    </div>}

    {escolhido&&pessoa!==null&&<div className="passo">
      <span className="rotulo">3 · Dia</span>
      <div className="dias">
        <button className="seta-dia" aria-label="Dias anteriores" disabled={pagina===0} onClick={()=>setPagina(pagina-1)}>‹</button>
        <div className="chips">{dias.map(d=><button key={d} className="chip" aria-pressed={data===d} onClick={()=>setData(d)}>{dia(d)}<small>{semana(d)}</small></button>)}</div>
        <button className="seta-dia" aria-label="Próximos dias" disabled={(pagina+1)*POR_PAGINA>=dados.days.length} onClick={()=>setPagina(pagina+1)}>›</button>
      </div>
    </div>}

    {data&&<div className="passo">
      <span className="rotulo">4 · Horário</span>
      {horarios===null?<p className="vazio">Buscando horários…</p>
        :horarios.length?<div className="chips">{horarios.map(h=><button key={h.start} className="chip" aria-pressed={inicio===h.start} onClick={()=>setInicio(h.start)}>{h.time}</button>)}</div>
        :<p className="vazio">Nenhum horário livre neste dia. Experimente outro dia{pessoa?' ou outra profissional':''}.</p>}
    </div>}

    {horario&&<form className="passo formulario" onSubmit={enviar}>
      <p className="resumo">{escolhido!.name} · {semana(data)}, {dia(data)} às {horario.time} · com {nome(pessoa||horario.staff[0])}</p>
      <label>Seu nome<input type="text" name="name" required minLength={2} maxLength={100} autoComplete="name"/></label>
      <label>Celular com DDD<input type="tel" name="phone" required inputMode="tel" autoComplete="tel" placeholder="(83) 99999-9999"/></label>
      <label className="marcar"><input type="checkbox" name="earlier" defaultChecked/>Se abrir um horário mais cedo, quero ser avisada.</label>
      {erro&&<p className="aviso" role="alert">{erro}</p>}
      <button className="botao" type="submit" disabled={ocupado}>{ocupado?'Enviando…':'Pedir este horário'}</button>
    </form>}
    {erro&&!horario&&<p className="aviso passo" role="alert">{erro}</p>}
  </>;
}
