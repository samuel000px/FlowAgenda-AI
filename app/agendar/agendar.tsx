"use client";
// Agendamento em formato de carrinho, na mesma tela: serviços (com opção e adicionais), uma
// profissional por área, dia, horário e dados da cliente. Os itens ficam em sequência, sem sobrepor.
// No fim, a própria cliente manda a confirmação para o WhatsApp do salão (assim a conversa parte
// dela e a resposta do salão não é cobrada).
import {useEffect,useState,type FormEvent} from 'react';
import {linkWhatsapp} from '../../lib/vitrine.mjs';
import {MAX_ITENS,prices} from '../../lib/agendamento.mjs';
import {salao} from '../salao';

type Opcao={name:string,duration:number,price:number};
export type Servico={id:string,name:string,duration:number,price:number,group:string,variants:Opcao[]};
export type Adicional={id:string,name:string,price:number,group:string};
type Pessoa={id:string,name:string,services:string[]};
type Oferta={id:string,trigger:string,target:string,type:'percent'|'amount',value:number};
type Plano={start:number,end:number,staff:string};
type Horario={start:number,time:string,plan:Plano[]};
export type Catalogo={groups:string[],services:Servico[],addons:Adicional[],staff:Pessoa[],promos:Oferta[],days:string[]};
type Item={service:string,variant?:number,addons:string[]};
const SEMANA=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const POR_PAGINA=6;
export const ICONE_AREA:Record<string,string>={Unhas:'💅',Cabelo:'💇'};
const dia=(d:string)=>d.split('-').reverse().slice(0,2).join('/');
const semana=(d:string)=>SEMANA[new Date(d+'T12:00:00Z').getUTCDay()];
const hora=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
export const reais=(v:number)=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const duracao=(m:number)=>m<60?`${m} min`:`${Math.floor(m/60)}h${m%60?String(m%60).padStart(2,'0'):''}`;
export const aPartirDe=(v:Servico)=>v.variants.length?Math.min(...v.variants.map(o=>o.price)):v.price;

/** Os itens com duração, preço e desconto calculados pela mesma regra do servidor. */
function calcular(dados:Catalogo,itens:Item[]){
  return prices({promos:dados.promos.map(d=>({...d,active:true}))},itens.map(x=>{
    const svc=dados.services.find(v=>v.id===x.service)!,variant=x.variant===undefined?null:svc.variants[x.variant];
    return {svc,variant,addons:x.addons.map(k=>dados.addons.find(a=>a.id===k)!),duration:variant?.duration??svc.duration,base:variant?.price??svc.price};
  })) as {svc:Servico,variant:Opcao|null,addons:Adicional[],duration:number,base:number,discount:number,price:number}[];
}

/** A oferta "pegue também" de maior desconto para o que já está no carrinho. */
function ofertaPara(dados:Catalogo,itens:Item[]){
  const dentro=itens.map(x=>dados.services.find(v=>v.id===x.service)!);
  return dados.promos.filter(d=>!itens.some(x=>x.service===d.target)&&dentro.some(v=>d.trigger===v.id||d.trigger==='group:'+v.group))
    .map(d=>{const alvo=dados.services.find(v=>v.id===d.target)!,base=aPartirDe(alvo);return {d,alvo,base,desconto:Math.min(base,d.type==='percent'?base*d.value/100:d.value)};})
    .sort((a,b)=>b.desconto-a.desconto)[0];
}

export default function Agendar(){
  const [dados,setDados]=useState<Catalogo|null>(null),[erro,setErro]=useState(''),[ocupado,setOcupado]=useState(false);
  const [itens,setItens]=useState<Item[]>([]),[aberto,setAberto]=useState(''),[opcao,setOpcao]=useState<number|undefined>(),[extras,setExtras]=useState<string[]>([]);
  const [equipe,setEquipe]=useState<Record<string,string>>({}),[pagina,setPagina]=useState(0),[data,setData]=useState(''),[inicio,setInicio]=useState<number|null>(null);
  const [horarios,setHorarios]=useState<Horario[]|null>(null),[pedido,setPedido]=useState<Record<string,any>|null>(null);

  useEffect(()=>{
    fetch('/api/agendar').then(r=>r.json()).then((d:any)=>{
      if(d.error)throw Error(d.error);
      setDados(d);const daUrl=new URLSearchParams(location.search).get('servico');
      if(d.services.some((v:Servico)=>v.id===daUrl))setAberto(daUrl!);
    }).catch(e=>setErro((e as Error).message));
  },[]);

  const areas=dados?[...new Set(itens.map(x=>dados.services.find(v=>v.id===x.service)!.group))]:[];
  const carrinho={items:itens,staff:Object.fromEntries(areas.map(g=>[g,equipe[g]??'']))};
  const pronto=areas.length>0&&areas.every(g=>g in equipe);
  const chave=pronto&&data?JSON.stringify(carrinho):'';

  // Sempre que o carrinho, as profissionais ou o dia mudam, busca os horários de novo.
  useEffect(()=>{
    setInicio(null);setHorarios(null);
    if(!chave)return;
    let valido=true;
    fetch(`/api/agendar?cart=${encodeURIComponent(chave)}&date=${data}`).then(r=>r.json()).then((d:any)=>{if(valido){if(d.error)setErro(d.error);setHorarios(d.slots||[]);}});
    return()=>{valido=false};
  },[chave,data]);

  function abrir(id:string){setAberto(aberto===id?'':id);setOpcao(undefined);setExtras([]);setErro('');}
  function adicionar(service:string,variant?:number,addons:string[]=[]){setItens([...itens,{service,variant,addons}]);setAberto('');setOpcao(undefined);setExtras([]);}
  function tirar(i:number){setItens(itens.filter((_,j)=>j!==i));}

  async function enviar(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setOcupado(true);setErro('');
    const f=new FormData(e.currentTarget);
    try{
      const r=await fetch('/api/agendar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cart:carrinho,date:data,start:inicio,name:f.get('name'),phone:f.get('phone'),earlier:f.has('earlier')})});
      const d:any=await r.json();if(!r.ok)throw Error(d.error);setPedido(d);scrollTo(0,0);
    }catch(e){setErro((e as Error).message);}
    finally{setOcupado(false);}
  }

  if(pedido){
    const link=`${location.origin}/a/${pedido.token}`;
    const lista=(pedido.items as any[]).map(x=>`${x.name} às ${x.time} com ${x.staff}`).join('; ');
    const texto=`Olá! Sou ${pedido.name} e agendei para ${semana(pedido.date).toLowerCase()}, ${dia(pedido.date)}: ${lista}. Meu agendamento: ${link}`;
    return <div className="sucesso">
      <div className="selo-ok" aria-hidden="true">💅</div>
      <header className="titulo-pagina"><h1>Pedido recebido!</h1></header>
      <p>Obrigada, {pedido.name}! Recebemos seu pedido e vamos confirmar o horário com você em breve.</p>
      <p className="resumo-dia">{semana(pedido.date)}, {dia(pedido.date)}</p>
      <ul className="detalhes">{(pedido.items as any[]).map(x=><li key={x.name}><span>{x.time} · {x.staff}</span>{x.name}</li>)}<li><span>Total</span><strong>{reais(pedido.total)}</strong></li></ul>
      <a className="botao" href={linkWhatsapp(salao.whatsapp,texto)} target="_blank" rel="noopener">Confirmar pelo WhatsApp</a>
      <a className="botao claro" href={`/a/${pedido.token}`}>Ver meu agendamento</a>
    </div>;
  }

  if(!dados)return erro?<p className="aviso" role="alert">{erro}</p>:<p className="vazio">Carregando…</p>;
  if(!dados.services.length)return <p className="vazio">A agenda online ainda está sendo preparada. Fale com a gente pelo WhatsApp.</p>;
  const calculados=calcular(dados,itens),total=calculados.reduce((n,x)=>n+x.price,0),economia=calculados.reduce((n,x)=>n+x.discount,0);
  const oferta=itens.length<MAX_ITENS?ofertaPara(dados,itens):undefined,cheio=itens.length>=MAX_ITENS;
  const dias=dados.days.slice(pagina*POR_PAGINA,(pagina+1)*POR_PAGINA),nome=(id:string)=>dados.staff.find(p=>p.id===id)?.name||'';
  const horario=horarios?.find(h=>h.start===inicio);

  const config=(v:Servico)=>{
    const adicionais=dados.addons.filter(a=>a.group===v.group),falta=v.variants.length>0&&opcao===undefined;
    return <div className="config">
      {v.variants.length>0&&<><p className="mini">Escolha uma opção</p><div className="chips">{v.variants.map((o,i)=><button key={o.name} className="chip" aria-pressed={opcao===i} onClick={()=>setOpcao(i)}>{o.name}<small>{duracao(o.duration)} · {reais(o.price)}</small></button>)}</div></>}
      {adicionais.length>0&&<><p className="mini">Adicionais</p><div className="chips">{adicionais.map(a=><button key={a.id} className="chip" aria-pressed={extras.includes(a.id)} onClick={()=>setExtras(extras.includes(a.id)?extras.filter(k=>k!==a.id):[...extras,a.id])}>{a.name}<small>+ {reais(a.price)}</small></button>)}</div></>}
      <button className="botao" disabled={falta} onClick={()=>adicionar(v.id,opcao,extras)}>{falta?'Escolha uma opção':'Adicionar ao carrinho'}</button>
    </div>;
  };

  return <>
    <div className="passo">
      <span className="rotulo">1 · Serviços</span>
      {cheio?<p className="vazio">Seu carrinho está completo ({MAX_ITENS} serviços).</p>:dados.groups.map(g=><div key={g} className="area">
        <h3>{ICONE_AREA[g]||'✨'} {g}</h3>
        {dados.services.filter(v=>v.group===g&&!itens.some(x=>x.service===v.id)).map(v=><div key={v.id} id={'svc-'+v.id} className={'escolha-caixa'+(aberto===v.id?' marcada':'')}>
          <button className="escolha" aria-expanded={aberto===v.id} onClick={()=>abrir(v.id)}><div><strong>{v.name}</strong><small>{v.variants.length?'Várias opções':duracao(v.duration)}</small></div><span className="preco">{v.variants.length?'a partir de ':''}{reais(aPartirDe(v))}</span></button>
          {aberto===v.id&&config(v)}
        </div>)}
      </div>)}
    </div>

    {itens.length>0&&<div className="passo carrinho">
      <span className="rotulo">🛒 Seu carrinho</span>
      {calculados.map((x,i)=><div className="linha" key={x.svc.id}>
        <div><strong>{x.svc.name}{x.variant?` · ${x.variant.name}`:''}</strong>
          {x.addons.map(a=><small key={a.id}>+ {a.name} ({reais(a.price)})</small>)}
          {x.discount>0&&<small className="desconto">Desconto de {reais(x.discount)}</small>}
        </div>
        <span className="preco">{reais(x.price)}</span>
        <button className="tirar" aria-label={`Tirar ${x.svc.name}`} onClick={()=>tirar(i)}>×</button>
      </div>)}
      {oferta&&<div className="oferta">
        <p><strong>✨ Pegue também: {oferta.alvo.name}</strong></p>
        <p>{oferta.alvo.variants.length?'a partir de ':''}<s>{reais(oferta.base)}</s> <b>{reais(oferta.base-oferta.desconto)}</b> · você economiza {reais(oferta.desconto)}</p>
        <button className="botao claro" onClick={()=>{if(!oferta.alvo.variants.length)return adicionar(oferta.alvo.id);abrir(oferta.alvo.id);setTimeout(()=>document.getElementById('svc-'+oferta.alvo.id)?.scrollIntoView({behavior:'smooth',block:'center'}),50);}}>+ {oferta.alvo.variants.length?'Escolher opção':'Adicionar'}</button>
      </div>}
      <div className="linha total"><span>Total{economia>0?` (economia de ${reais(economia)})`:''}</span><strong>{reais(total)}</strong></div>
    </div>}

    {areas.length>0&&<div className="passo">
      <span className="rotulo">2 · Profissional</span>
      {areas.map(g=>{const fazem=dados.staff.filter(p=>itens.every(x=>{const v=dados.services.find(v=>v.id===x.service)!;return v.group!==g||p.services.includes(v.id);}));
        return <div key={g} className="area-equipe"><p className="mini">{ICONE_AREA[g]||'✨'} {g}</p><div className="chips">
          <button className="chip" aria-pressed={equipe[g]===''} onClick={()=>setEquipe({...equipe,[g]:''})}>Sem preferência</button>
          {fazem.map(p=><button key={p.id} className="chip" aria-pressed={equipe[g]===p.id} onClick={()=>setEquipe({...equipe,[g]:p.id})}>{p.name}</button>)}
        </div>{!fazem.length&&<p className="aviso">Nenhuma profissional faz todos os serviços de {g} juntos. Tire um deles do carrinho.</p>}</div>;})}
    </div>}

    {pronto&&<div className="passo">
      <span className="rotulo">3 · Dia</span>
      <div className="dias">
        <button className="seta-dia" aria-label="Dias anteriores" disabled={pagina===0} onClick={()=>setPagina(pagina-1)}>‹</button>
        <div className="chips">{dias.map(d=><button key={d} className="chip" aria-pressed={data===d} onClick={()=>setData(d)}>{dia(d)}<small>{semana(d)}</small></button>)}</div>
        <button className="seta-dia" aria-label="Próximos dias" disabled={(pagina+1)*POR_PAGINA>=dados.days.length} onClick={()=>setPagina(pagina+1)}>›</button>
      </div>
    </div>}

    {pronto&&data&&<div className="passo">
      <span className="rotulo">4 · Horário</span>
      {horarios===null?<p className="vazio">Buscando horários…</p>
        :horarios.length?<div className="chips">{horarios.map(h=><button key={h.start} className="chip" aria-pressed={inicio===h.start} onClick={()=>setInicio(h.start)}>{h.time}</button>)}</div>
        :<p className="vazio">Nenhum horário livre para tudo isso neste dia. Experimente outro dia ou "Sem preferência".</p>}
    </div>}

    {horario&&<form className="passo formulario" onSubmit={enviar}>
      <div className="resumo"><p><strong>{semana(data)}, {dia(data)}</strong></p>{horario.plan.map((x,i)=><p key={i}>{hora(x.start)}–{hora(x.end)} · {calculados[i].svc.name} com {nome(x.staff)}</p>)}<p>Total: <strong>{reais(total)}</strong></p></div>
      <label>Seu nome<input type="text" name="name" required minLength={2} maxLength={100} autoComplete="name"/></label>
      <label>Celular com DDD<input type="tel" name="phone" required inputMode="tel" autoComplete="tel" placeholder="(83) 99999-9999"/></label>
      <label className="marcar"><input type="checkbox" name="earlier" defaultChecked/>Se abrir um horário mais cedo, quero ser avisada.</label>
      {erro&&<p className="aviso" role="alert">{erro}</p>}
      <button className="botao" type="submit" disabled={ocupado}>{ocupado?'Enviando…':'Pedir horário'}</button>
    </form>}
    {erro&&!horario&&<p className="aviso passo" role="alert">{erro}</p>}
  </>;
}
