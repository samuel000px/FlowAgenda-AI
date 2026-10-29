import type {Metadata} from 'next';
import {env} from 'cloudflare:workers';
import {salao} from '../salao';
import Cancelar from './cancelar';
import '../vitrine.css';
import '../atendimento/atendimento.css';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Pedir cancelamento',description:'Peça o cancelamento de um horário. A equipe confirma com você pelo WhatsApp.'};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const t=(await searchParams).t,token=typeof t==='string'?t:'';
 let name=salao.nome,servicos:string[]=[];
 // Nome do salão e serviços vêm do banco, sem trazer o cadastro inteiro para a página.
 try{
  const row=await env.DB?.prepare("SELECT json_extract(state,'$.salon.name') AS name,(SELECT json_group_array(json_extract(value,'$.name')) FROM json_each(state,'$.services') WHERE json_extract(value,'$.addon') IS NOT 1) AS servicos FROM rooms WHERE id='flowagenda'").first<{name:string,servicos:string}>();
  if(row?.name)name=row.name;if(row?.servicos)servicos=JSON.parse(row.servicos);
 }catch{}
 return <div className="vitrine-fundo"><main className="vitrine atendimento-publico">
 <a className="voltar" href="/">← Voltar para o início</a>
 <header className="titulo-pagina"><img src="/logo-sc.png" alt="" className="atendimento-logo"/><p className="rotulo">{name}</p><h1>{token?'Cancelar agendamento':'Pedir cancelamento'}</h1><p>{token?'Conte o motivo para confirmar o cancelamento. Ele ajuda a gente a organizar a agenda.':'Conte qual horário você quer cancelar. A equipe vai entrar em contato pelo WhatsApp para confirmar.'}</p></header>
 <Cancelar servicos={servicos} token={token}/>
 <p className="atendimento-rodape">Prefere trocar de dia? <a href="/agendar">Ver horários livres</a><br/>Outra dúvida? <a href="/atendimento">Falar com a equipe</a></p>
 </main></div>;}
