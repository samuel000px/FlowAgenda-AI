"use client";
import {useState} from 'react';
import {MessageCircle,ExternalLink,X} from 'lucide-react';
type Row=Record<string,any>;
type Props={tickets:Row[],actor:Row,busy:boolean,run:(action:string,p:Row)=>Promise<boolean>,admin?:boolean,error?:string};
export default function SupportPanel({tickets,actor,busy,run,admin=false,error=''}:Props){
 const [selected,setSelected]=useState<Row|null>(null),[closing,setClosing]=useState<Row|null>(null);
 const mine=(t:Row)=>t.owner?.id===actor.id&&t.owner?.role===actor.role;
 async function close(){if(closing&&await run('support_close',{id:closing.id})){setClosing(null);setSelected(null);}}
 return <div className="support-workspace">
  <section className="panel support-intro"><div><h2>Quem precisa de ajuda?</h2><p>Assuma um pedido, converse com a cliente e encerre quando terminar.</p></div>{admin&&<a className="button secondary" href="/atendimento" target="_blank" rel="noreferrer">Abrir página da cliente <ExternalLink size={16}/></a>}</section>
  <p className="muted small">Encerrar uma conversa não cancela o agendamento. O WhatsApp abre na conta conectada ao aparelho de quem clicar; a mensagem só é enviada após tocar em Enviar.</p>

  <div className="support-grid">{tickets.map(t=><article className="panel support-card" key={t.id}>
   <div className="row between wrap"><h2>{t.name}</h2>{t.kind==='cancel'&&<span className="badge amber">Cancelamento</span>}<span className="badge neutral">{t.source==='demo'?'Exemplo':t.owner?'Em atendimento':'Aguardando'}</span></div>
   <p className="support-preview">{t.text}</p>{t.appointment&&<small className="support-horario">Horário encontrado: {t.appointment}</small>}<small>{new Date(t.updated).toLocaleString('pt-BR')} {t.owner&&`· Com ${t.owner.name}`}</small>
   <div className="support-buttons"><button className="secondary" disabled={busy} onClick={()=>{setSelected(t);}}>Ver atendimento</button>{(!t.owner||(admin&&!mine(t)))&&<button disabled={busy} onClick={()=>run('support_claim',{id:t.id})}>{t.owner?'Assumir atendimento':'Vou atender'}</button>}{t.owner&&!mine(t)&&<small>{t.owner.name} está cuidando deste pedido.</small>}{(mine(t)||admin)&&<button className="text-button" disabled={busy} onClick={()=>setClosing(t)}>Encerrar conversa</button>}</div>
  </article>)}</div>
  {!tickets.length&&<section className="panel empty"><MessageCircle size={30}/><h3>Nenhuma conversa aguardando</h3><p>Os pedidos para falar com a equipe aparecerão aqui.</p></section>}
  {selected&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="support-title"><div className="panel-heading"><h2 id="support-title">Atendimento de {selected.name}</h2><button className="icon-button" aria-label="Fechar atendimento" onClick={()=>setSelected(null)}><X size={20}/></button></div><div className="modal-content support-detail">{error&&<p className="error" role="alert">{error}</p>}<p className="support-preview">{selected.text}</p>{selected.source==='demo'?<p className="notice">Esta é uma conversa de exemplo. Nenhuma mensagem será enviada pelo WhatsApp.</p>:<p className="muted">WhatsApp: {selected.phone||'Número indisponível'}</p>}
   {(()=>{const current=tickets.find(t=>t.id===selected.id);if(!current)return <p className="notice">Esta conversa já foi encerrada.</p>;return <>{(!current.owner||(admin&&!mine(current)))&&<button disabled={busy} onClick={()=>run('support_claim',{id:current.id})}>{current.owner?'Assumir atendimento':'Vou atender esta cliente'}</button>}{mine(current)&&(current.source==='demo'?<div className="demo-chat"><p className="demo-in">Cliente: Gostaria de confirmar quais serviços vocês oferecem.</p><p className="demo-out">Você poderá conversar com a cliente pelo WhatsApp do seu aparelho.</p></div>:/^[1-9]\d{9,14}$/.test(current.phone)?<a className="button" target="_blank" rel="noreferrer" href={`https://wa.me/${current.phone}?text=${encodeURIComponent(`Olá! Sou ${actor.name}, da Santa Cor. Recebi seu pedido de atendimento. Como posso ajudar?`)}`}><ExternalLink size={17}/>Conversar no meu WhatsApp</a>:<p className="notice">Este pedido não tem um número válido para abrir o WhatsApp.</p>)}{current.owner&&!mine(current)&&<p className="notice">Em atendimento com {current.owner.name}.</p>}{(mine(current)||admin)&&<button className="secondary" disabled={busy} onClick={()=>setClosing(current)}>Encerrar conversa</button>}</>;})()}
  </div></section></div>}
  {closing&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="close-support"><div className="modal-content support-detail"><h2 id="close-support">Encerrar a conversa de {closing.name}?</h2><p>O pedido sairá da lista. Os horários agendados continuarão iguais.</p><div className="modal-actions"><button className="secondary" disabled={busy} onClick={()=>setClosing(null)}>Voltar</button><button disabled={busy} onClick={close}>Encerrar conversa</button></div></div></section></div>}
 </div>;
}
