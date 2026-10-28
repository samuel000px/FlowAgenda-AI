"use client";
import {useEffect,useState} from 'react';
import {CalendarDays,ExternalLink,RefreshCw,Link2} from 'lucide-react';
import {today} from '../lib/flowagenda.mjs';

export default function CalendarPanel(){
 const [status,setStatus]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){
  try{const r=await fetch('/api/google');const d:any=await r.json();if(!r.ok)throw Error(d.error);setStatus(d);}
  catch(e){setError((e as Error).message);}
 }
 useEffect(()=>{void load();const t=setInterval(load,15000);return()=>clearInterval(t);},[]);
 async function run(action:string){
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,day:today(),force:true})});
   const d:any=await r.json();if(!r.ok)throw Error(d.error);
   if(d.url&&action==='connect')location.assign(d.url);else setStatus(d);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const pending=status?.pending||0;
 return <section className="panel integration calendar-integration">
  <div className="integration-icon"><CalendarDays size={30}/></div>
  <div>
   <span className="eyebrow">SUA AGENDA, SEM REDIGITAR</span>
   <h2>Google Agenda</h2>
   <p>Escolha a conta Google da administração. Criamos uma agenda da esmalteria e mantemos os horários atualizados para você acompanhar no computador ou no celular.</p>
   <span className={'badge '+(status?.error?'amber':status?.connected?'green':'neutral')}>
    {!status?'Verificando conexão…':status.error?'Conexão precisa de atenção':status.connected?pending?'Atualizando agenda':'Conta conectada':'Ainda não conectado'}
   </span>
   <div className="calendar-benefits">
    <div><strong>Serviços no horário certo</strong><p>Cliente, serviço e profissional no título. O início e o fim respeitam a duração do atendimento, com uma cor para cada profissional.</p></div>
    <div><strong>Mudanças acompanhadas</strong><p>Novos horários, remarcações aprovadas e cancelamentos atualizam a mesma agenda. Pedidos aguardando aceite só entram depois de aprovados.</p></div>
    <div><strong>Aniversários lembrados</strong><p>Preencha dia e mês em Clientes → Editar, ou ao cadastrar no agendamento. O lembrete aparece todo ano, sem ocupar um horário de serviço.</p></div>
   </div>
   {!status?.connected&&<p className="notice">1. Toque em Conectar conta Google. 2. Escolha sua conta. 3. Autorize a agenda da esmalteria. Sua senha é informada somente na página do Google.</p>}
   {status&&!status.configured&&<p className="notice">A conexão precisa ser ativada pelo responsável pelo sistema. Depois disso, basta escolher sua conta Google.</p>}
   {status?.connected&&<p className="muted small">{status.appointments} atendimento(s) e {status.birthdays} aniversário(s) na sincronização.{pending>0?` Faltam ${pending} atualização(ões); elas serão enviadas nas próximas sincronizações.`:status.error?' Aguardando nova tentativa de conexão.':' Todas as informações salvas estão em dia com o Google.'}</p>}
   {status?.synced>0&&<p className="muted small">Última sincronização completa: {new Date(status.synced).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'})}</p>}
   {(error||status?.error)&&<p role="alert" className="error">{error||status.error} Os dados do painel continuam salvos.</p>}
   <div className="actions">
    {status?.connected?<>
     <a className="button" href={status.url} target="_blank" rel="noreferrer"><ExternalLink size={16}/>Abrir Google Agenda</a>
     <button className="secondary" disabled={busy||status.syncing} onClick={()=>run('sync')}><RefreshCw size={16}/>{busy||status.syncing?'Sincronizando…':'Atualizar agora'}</button>
     <button className="text-button" disabled={busy||status.syncing} onClick={()=>run('connect')}>Reconectar ou trocar conta</button>
     <button className="text-button" disabled={busy||status.syncing} onClick={()=>{if(confirm('Desconectar a conta? Os eventos existentes permanecerão no Google Agenda.'))void run('disconnect');}}>Desconectar</button>
    </>:<button disabled={busy||!status?.configured} onClick={()=>run('connect')}><Link2 size={16}/>{busy?'Conectando…':'Conectar conta Google'}</button>}
   </div>
   <p className="muted small">Faça alterações neste painel para manter tudo organizado. Mudanças feitas diretamente no Google não voltam para o sistema. Ao trocar de conta, a agenda da conta anterior permanece lá.</p>
  </div>
 </section>;
}
