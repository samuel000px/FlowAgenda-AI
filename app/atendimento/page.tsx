import type {Metadata} from 'next';
import {env} from 'cloudflare:workers';
import {salao} from '../salao';
import Atendimento from './atendimento';
import '../vitrine.css';
import './atendimento.css';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Fale com a equipe',description:'Peça ajuda à equipe da esmalteria. Retornaremos pelo WhatsApp informado.'};
export default async function Page(){
 let name=salao.nome;
 try{const row=await env.DB?.prepare("SELECT json_extract(state,'$.salon.name') AS name FROM rooms WHERE id='flowagenda'").first<{name:string}>();if(row?.name)name=row.name;}catch{}
 return <div className="vitrine-fundo"><main className="vitrine atendimento-publico">
 <a className="voltar" href="/">← Voltar para o início</a>
 <header className="titulo-pagina"><img src="/logo-sc.png" alt="" className="atendimento-logo"/><p className="rotulo">{name}</p><h1>Como podemos ajudar?</h1><p>Deixe seu pedido. Uma pessoa da nossa equipe vai responder pelo WhatsApp.</p></header>
 <Atendimento/>
 <p className="atendimento-rodape">Quer marcar um horário? <a href="/agendar">Ir para agendamento</a><br/>Precisa cancelar? <a href="/cancelar">Pedir cancelamento</a></p>
 </main></div>;}
