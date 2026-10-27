'use client';
import {useEffect,useState} from 'react';
import {CalendarDays,ExternalLink,RefreshCw} from 'lucide-react';
type Credentials={id:string,key:string};
export default function CalendarPanel({credentials}:{credentials:Credentials}){
  const [status,setStatus]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [day,setDay]=useState(()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza'}).format(new Date()));
  const headers={'Content-Type':'application/json','X-Room':credentials.id,'X-Room-Key':credentials.key};
  async function request(body?:any){
    const response=await fetch('/api/google',{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
    const result:any=await response.json();if(!response.ok)throw Error(result.error||'Não foi possível acessar a integração.');return result;
  }
  useEffect(()=>{
    let disposed=false,inFlight=false;
    const update=async()=>{
      if(inFlight)return;inFlight=true;
      try{let next=await request();if(next.connected&&!next.syncing)next=await request({action:'sync'});if(!disposed){setStatus(next);setError('')}}catch(e){if(!disposed)setError((e as Error).message)}finally{inFlight=false}
    };
    update();const timer=setInterval(update,15000);return()=>{disposed=true;clearInterval(timer)};
  },[credentials.id,credentials.key]);
  async function action(action:string){
    setBusy(true);setError('');
    try{const next=await request({action,day,force:true});if(next.url&&action==='connect'){sessionStorage.setItem('encaixa-return',location.hash);location.assign(next.url)}else setStatus(next)}catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  return <section className="panel calendar-panel"><div className="panel-head"><div className="row"><CalendarDays size={22}/><div><h2>Google Agenda</h2><small>Encaixa → calendário exclusivo da esmalteria</small></div></div><span className={`tag ${status?.connected?'green':''}`}>{status?.connected?'CONECTADO':'NÃO CONECTADO'}</span></div><div className="calendar-body">
    <p>Os 18 atendimentos iniciais, novos agendamentos e encaixes confirmados aparecem no Google. Cancelamentos e reagendamentos são atualizados automaticamente.</p>
    {status?.connected?<><div className="row calendar-controls"><span>Data: <strong>{status.day.split('-').reverse().join('/')}</strong> · Fortaleza</span><a className="secondary" href={status.url} target="_blank" rel="noreferrer">Abrir Google Agenda <ExternalLink size={15}/></a><button className="secondary" disabled={busy||status.syncing} onClick={()=>action('sync')}><RefreshCw size={15}/> Sincronizar agora</button><button className="text-button" disabled={busy||status.syncing} onClick={()=>action('connect')}>Reconectar conta</button><button className="text-button" disabled={busy||status.syncing} onClick={()=>action('disconnect')}>Desconectar</button></div><small>{status.syncing?'Sincronização em andamento…':status.synced?`Última sincronização: ${new Date(status.synced).toLocaleTimeString('pt-BR')}`:'Aguardando primeira sincronização.'} Ao desconectar, os eventos existentes permanecem no Google.</small></>:<div className="row calendar-controls"><label>Data dos atendimentos <input type="date" aria-label="Data da agenda Google" value={day} onChange={e=>setDay(e.target.value)}/></label><button className="primary" disabled={busy||!status?.configured||!day} onClick={()=>action('connect')}>{busy?'Conectando…':'Conectar Google Agenda'}</button></div>}
    {(error||status?.error)&&<div className="error" role="alert">{error||status.error} Os agendamentos permanecem salvos no Encaixa.</div>}
    {status&&!status.configured&&<details className="calendar-setup" open><summary>Preparar a conexão no computador</summary><ol><li>No <a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer">Google Cloud</a>, habilite a Google Calendar API.</li><li>Em Google Auth Platform, configure o público de teste e adicione sua conta como usuário de teste. Crie um cliente OAuth do tipo <strong>Aplicativo da Web</strong>.</li><li>Cadastre o retorno <code>{typeof location!=='undefined'?location.origin:''}/api/google/callback</code>.</li><li>Preencha <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> e <code>GOOGLE_REDIRECT_URI</code> em <code>.dev.vars</code>. Gere a chave de proteção com <code>npm run calendar:setup</code> e reinicie o Encaixa.</li></ol><p>Depois, clique em Conectar e autorize sua conta. A chave do Gemini não substitui essas credenciais.</p></details>}
    <small>A sincronização é do Encaixa para o Google. Edite os atendimentos pelo Encaixa. Não há mensagens reais de WhatsApp.</small>
  </div></section>;
}
