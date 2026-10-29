"use client";
// Aba "Assistente" da gerência: conversa curta com cartão de confirmação. Toda mudança chega como plano e só
// acontece quando a gerente toca em Confirmar; consultas respondem na hora. Nenhuma mensagem sai sozinha: os
// avisos às clientes são links do WhatsApp que a gerente abre. Tudo conversa com /api/assistente.
// Props: onRefresh recarrega o cadastro do painel depois de confirmar ou desfazer; onAbrirAba(id) troca a aba
// do painel (usada pelos atalhos quando o teto do dia acaba, ex.: 'agenda', 'requests', 'moves', 'closing', 'finances');
// visivel diz se a aba está à mostra: o painel continua montado (escondido) nas outras abas, para a conversa,
// os cartões e os botões do WhatsApp não sumirem e um Confirmar em andamento terminar aqui mesmo.
import {useCallback,useEffect,useRef,useState,type KeyboardEvent} from 'react';
import {Send,Sparkles,Undo2,X,MessageCircle} from 'lucide-react';
type Row=Record<string,any>;
type Props={onRefresh:()=>Promise<void>,onAbrirAba:(id:string)=>void,visivel?:boolean};
// Uma mensagem da conversa. "plano" vira cartão; "feito" vira o aviso de que foi aplicado (com os links e o Desfazer).
// feito.pacoteId é o pacote gravado (null quando nada mudou); só com desfazivel a mensagem pode ganhar o Desfazer.
type Feito={titulo:string,avisos:Row[],pacoteId:string|null,desfazivel:boolean};
type Msg={id:number,de:'gerente'|'assistente',texto:string,plano?:Row,tiradas?:string[],estado?:'aberto'|'aplicado'|'cancelado'|'perdido',feito?:Feito,desfeito?:boolean};

const FALHA='O assistente não respondeu agora. Tente de novo em instantes ou use os botões do painel.';
const TETO='O assistente chegou ao limite de hoje. Ele volta amanhã às 0h. Enquanto isso, tudo funciona pelos botões do painel.';
const ATALHOS=['Resumo de hoje','Agenda de amanhã','Uma profissional faltou'];
const ABAS=[['agenda','Agenda'],['requests','Aceitações'],['moves','Remarcações'],['closing','Fechamento'],['finances','Finanças']];
const DIAS=['dom','seg','ter','qua','qui','sex','sáb'];
const dia=(d:string)=>{const [a,m,x]=d.split('-').map(Number);return `${DIAS[new Date(a,m-1,x).getDay()]} ${String(x).padStart(2,'0')}/${String(m).padStart(2,'0')}`;};
const hhmm=(ms:number)=>new Date(ms).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
// Só abre links do WhatsApp; qualquer outra coisa que venha no aviso é ignorada.
const linkOk=(l:unknown)=>typeof l==='string'&&l.startsWith('https://wa.me/');
const plural=(n:number,um:string,varios:string)=>`${n} ${n===1?um:varios}`;

export default function AssistentePanel({onRefresh,onAbrirAba,visivel=true}:Props){
 const [msgs,setMsgs]=useState<Msg[]>([]),[texto,setTexto]=useState(''),[ocupado,setOcupado]=useState(false),[pensando,setPensando]=useState(false);
 const [restante,setRestante]=useState<number|null>(null),[limite,setLimite]=useState(60),[agora,setAgora]=useState(()=>Date.now());
 const caixa=useRef<HTMLTextAreaElement>(null),lista=useRef<HTMLDivElement>(null),seq=useRef(0);
 const bloqueado=restante===0,poucos=restante!==null&&restante>0&&restante<=Math.floor(limite*0.2);

 // Quanto resta do dia: lido cada vez que a aba aparece (outra tela pode ter usado pedidos no meio).
 useEffect(()=>{
  if(!visivel)return;
  let vivo=true;
  fetch('/api/assistente').then(async r=>(r.ok?await r.json():null) as {restante:number,limite:number}|null).then(d=>{if(vivo&&d){setRestante(d.restante);setLimite(d.limite);}}).catch(()=>{});
  setAgora(Date.now());
  return ()=>{vivo=false;};
 },[visivel]);
 useEffect(()=>{const t=setInterval(()=>setAgora(Date.now()),30000);return ()=>clearInterval(t);},[]);
 // Sempre mostra a mensagem mais recente, também ao voltar para a aba (escondida, a lista não rola).
 useEffect(()=>{const l=lista.current;if(l&&visivel)l.scrollTop=l.scrollHeight;},[msgs,pensando,visivel]);

 const add=useCallback((m:Omit<Msg,'id'>)=>{const id=++seq.current;setMsgs(v=>[...v,{...m,id}]);return id;},[]);
 const mudar=(id:number,p:Partial<Msg>)=>setMsgs(v=>v.map(m=>m.id===id?{...m,...p}:m));
 async function chamar(corpo:Row){
  const r=await fetch('/api/assistente',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(corpo)});
  let d:Row={};try{d=await r.json();}catch{}
  if(typeof d.restante==='number')setRestante(d.restante);
  return {status:r.status,ok:r.ok,d};
 }
 // Falha de rede ou sessão vencida: fala com a gerente em vez de deixar a tela parada.
 function semResposta(status?:number){
  if(status===401){add({de:'assistente',texto:'Sua sessão terminou. Entre de novo no painel.'});void onRefresh();}
  else add({de:'assistente',texto:FALHA});
 }
 // Resposta do assistente: texto ou cartão de plano.
 function mostrar(d:Row){
  if(d.plano)add({de:'assistente',texto:`Plano: ${d.plano.titulo}`,plano:d.plano,tiradas:[],estado:'aberto'});
  else if(d.resposta)add({de:'assistente',texto:d.resposta});
 }

 async function enviar(t:string){
  const q=t.trim();if(!q||ocupado||bloqueado)return;
  // As 6 mensagens anteriores seguem junto para o assistente entender "e amanhã?".
  const historico=msgs.slice(-6).map(m=>({de:m.de,texto:m.texto}));
  add({de:'gerente',texto:q});setTexto('');setOcupado(true);setPensando(true);
  try{
   const {status,ok,d}=await chamar({action:'perguntar',texto:q,historico});
   // O teto do dia já aparece fixo acima da caixa; não repete o mesmo texto na conversa.
   if(status===429&&d.restante===0)return;
   if(d.error)add({de:'assistente',texto:d.error});
   else if(!ok&&!d.resposta)semResposta(status);
   else mostrar(d);
  }catch{semResposta();}
  finally{setPensando(false);setOcupado(false);}
 }
 async function confirmar(m:Msg){
  setOcupado(true);
  try{
   const {status,d}=await chamar({action:'confirmar',planoId:m.plano!.id,semLinhas:m.tiradas||[]});
   if(d.aplicado){
    const ap=d.aplicado,volta=m.plano!.desfaz;
    mudar(m.id,{estado:'aplicado'});
    // Um desfazer confirmado tira o botão da mensagem do pacote que voltou; se nenhuma linha voltou (sem pacoteId),
    // o servidor não marca o pacote e o botão continua.
    if(typeof volta==='string'&&ap.pacoteId)setMsgs(v=>v.map(x=>x.feito?.pacoteId===volta?{...x,desfeito:true}:x));
    add({de:'assistente',texto:`Feito: ${ap.titulo}`,feito:{titulo:ap.titulo,avisos:ap.avisos||[],pacoteId:typeof ap.pacoteId==='string'?ap.pacoteId:null,desfazivel:ap.desfazivel===true}});
    await onRefresh();
   }else if(d.resposta){
    // Plano vencido ou agenda mudada: o cartão não vale mais. Conflito de gravação (409) ou falha do servidor (503)
    // não mudam o plano guardado: o cartão fica e dá para tentar de novo.
    if(status!==409&&status!==503)mudar(m.id,{estado:'perdido'});
    add({de:'assistente',texto:d.resposta});
   }else semResposta(status);
  }catch{semResposta();}
  finally{setOcupado(false);}
 }
 async function cancelar(m:Msg){
  setOcupado(true);
  try{
   const {status,d}=await chamar({action:'descartar',planoId:m.plano!.id});
   if(d.resposta){mudar(m.id,{estado:'cancelado'});add({de:'assistente',texto:d.resposta});}else semResposta(status);
  }catch{semResposta();}
  finally{setOcupado(false);}
 }
 // Desfazer pede exatamente o pacote desta mensagem. A mensagem só é marcada como desfeita quando o cartão de
 // desfazer for confirmado; se o servidor responde que não dá mais (ok, sem plano), o botão sai dela.
 async function desfazer(m:Msg){
  setOcupado(true);
  try{
   const {status,ok,d}=await chamar({action:'desfazer',pacoteId:m.feito!.pacoteId});
   if(d.plano)mostrar(d);
   else if(d.resposta){if(ok)mudar(m.id,{feito:{...m.feito!,desfazivel:false}});mostrar(d);}
   else semResposta(status);
  }catch{semResposta();}
  finally{setOcupado(false);}
 }
 const corrigir=()=>{setTexto('Corrija: ');requestAnimationFrame(()=>{const c=caixa.current;if(c){c.focus();c.setSelectionRange(c.value.length,c.value.length);}});};
 const tecla=(e:KeyboardEvent<HTMLTextAreaElement>)=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void enviar(texto);}};
 const tirar=(m:Msg,lid:string,volta=false)=>mudar(m.id,{tiradas:volta?(m.tiradas||[]).filter(x=>x!==lid):[...(m.tiradas||[]),lid]});

 // O Desfazer fica só na confirmação mais recente que mudou a agenda e ainda não voltou (resultado de desfazer e
 // plano sem mudança não têm botão), e some enquanto o cartão de desfazer dela está aberto.
 const ultimoFeito=[...msgs].reverse().find(m=>m.feito?.desfazivel&&!m.desfeito)?.id;
 const desfazendo=new Set(msgs.filter(m=>m.estado==='aberto'&&m.plano?.desfaz&&agora<=m.plano.validoAte).map(m=>m.plano!.desfaz as string));

 function cartao(m:Msg){
  const p=m.plano!,tiradas=m.tiradas||[],linhas:Row[]=p.linhas||[],vivas=linhas.filter(l=>!tiradas.includes(l.id));
  const vencido=agora>p.validoAte,aberto=m.estado==='aberto'&&!vencido,datas=new Set(linhas.map(l=>l.de.data)).size>1;
  // Com linhas tiradas, o impacto do servidor fica velho: conta de novo o que vai mudar e quem recebe aviso
  // (na falta, também quem ficou sem vaga), pela mesma regra do servidor.
  const mudam=vivas.filter(l=>l.para).length,afetadas=new Set(vivas.filter(l=>l.para||p.tipo==='ausencia').map(l=>l.cliente)).size;
  const total=linhas.filter(l=>l.para).length;
  const impacto=tiradas.length?`Com as linhas tiradas: ${mudam} de ${total} ${total===1?'mudança':'mudanças'} ·${plural(afetadas,'cliente afetada','clientes afetadas')}. Valores não mudam.`:p.impacto;
  // Falta (M+ na spec) mostra os avisos em vermelho.
  return <div className={'assistente-cartao'+(aberto?'':' is-fechado')+(p.tipo==='ausencia'?' is-grande':'')}>
   <h3>{p.titulo}</h3>
   {vivas.map(l=><div className="assistente-linha" key={l.id}>
    <div className="assistente-quando">{datas&&<small>{dia(l.de.data)}</small>}<strong>{l.de.hora}</strong></div>
    <div className="assistente-mudanca">
     <b>{l.cliente} · {l.servico}</b>
     {l.para?<span>{l.de.profissional} → {l.para.profissional}<em>{l.para.data===l.de.data&&l.para.hora===l.de.hora?'mesmo horário':`${dia(l.para.data)} às ${l.para.hora}`}</em></span>
      :<span>{l.de.profissional}<em>{p.tipo==='desfazer'?'fica como está':'fica sem horário'}</em></span>}
     {l.aviso&&<span className="assistente-aviso">⚠ {l.aviso}</span>}
    </div>
    {aberto&&<button type="button" className="assistente-tirar" aria-label={`Tirar ${l.cliente} do plano`} title="Tirar esta linha" disabled={ocupado} onClick={()=>tirar(m,l.id)}><X size={15}/></button>}
   </div>)}
   {!vivas.length&&<p className="assistente-vazio">Todas as linhas foram tiradas. Nada será mudado.</p>}
   {aberto&&tiradas.length>0&&<p className="assistente-tiradas">{tiradas.length===1?'1 linha tirada':`${tiradas.length} linhas tiradas`} · <button type="button" className="assistente-link" onClick={()=>mudar(m.id,{tiradas:[]})}>Colocar de volta</button></p>}
   {(p.avisos||[]).map((a:string,i:number)=><p className="assistente-aviso" key={i}>⚠ {a}</p>)}
   {impacto&&<p className="assistente-impacto">{impacto}</p>}
   {aberto?<>
    <div className="assistente-botoes">
     <button type="button" disabled={ocupado||!vivas.length} onClick={()=>void confirmar(m)}>Confirmar</button>
     <button type="button" className="secondary" disabled={ocupado} onClick={corrigir}>Corrigir</button>
     <button type="button" className="secondary" disabled={ocupado} onClick={()=>void cancelar(m)}>Cancelar</button>
    </div>
    <small className="assistente-validade">Este plano vale até {hhmm(p.validoAte)}.</small>
   </>:<small className="assistente-validade">{m.estado==='aplicado'?'Plano aplicado.':m.estado==='cancelado'?'Plano cancelado. Nada foi mudado.':'Este plano não vale mais. Peça de novo.'}</small>}
  </div>;
 }

 return <section className="panel assistente">
  <div className="assistente-lista" ref={lista} role="log" aria-live="polite" aria-label="Conversa com o assistente">
   {!msgs.length&&<div className="assistente-intro"><Sparkles size={22}/><strong>O que você precisa?</strong><p>Peça em poucas palavras, como “a Lia faltou terça” ou “resumo de hoje”. Eu mostro o que vai mudar e só aplico depois que você confirmar.</p></div>}
   {msgs.map(m=><div className={'assistente-msg '+(m.de==='gerente'?'is-gerente':'is-assistente')} key={m.id}>
    {m.plano?cartao(m):<div className="assistente-balao">
     <p>{m.texto}</p>
     {m.feito&&<div className="assistente-feito">
      {m.feito.avisos.filter(a=>linkOk(a.link)).map((a,i)=><a key={i} className="button secondary" href={a.link} target="_blank" rel="noopener noreferrer"><MessageCircle size={16}/>Avisar {a.cliente} no WhatsApp</a>)}
      {m.id===ultimoFeito&&!desfazendo.has(m.feito.pacoteId||'')&&<button type="button" className="secondary" disabled={ocupado} onClick={()=>void desfazer(m)}><Undo2 size={16}/>Desfazer</button>}
     </div>}
    </div>}
   </div>)}
   {pensando&&<div className="assistente-msg is-assistente"><div className="assistente-balao assistente-pensando" role="status">Pensando…</div></div>}
  </div>
  {poucos&&<p className="assistente-resta">{restante===1?'Resta 1 pedido ao assistente hoje.':`Restam ${restante} pedidos ao assistente hoje.`}</p>}
  {bloqueado?<div className="assistente-teto">
   <p>{TETO}</p>
   <div className="assistente-atalhos">{ABAS.map(([id,nome])=><button type="button" className="secondary" key={id} onClick={()=>onAbrirAba(id)}>{nome}</button>)}</div>
  </div>:<>
   <div className="assistente-atalhos">{ATALHOS.map(a=><button type="button" className="secondary" key={a} disabled={ocupado} onClick={()=>void enviar(a)}>{a}</button>)}</div>
   <form className="assistente-caixa" onSubmit={e=>{e.preventDefault();void enviar(texto);}}>
    <textarea ref={caixa} rows={2} maxLength={500} value={texto} onChange={e=>setTexto(e.target.value)} onKeyDown={tecla} placeholder="Escreva o que você precisa" aria-label="Pedido ao assistente"/>
    <button type="submit" disabled={ocupado||!texto.trim()}><Send size={16}/>Enviar</button>
   </form>
  </>}
 </section>;
}
