import type {Metadata} from 'next';
import MeuAgendamento from './meu-agendamento';
import {salao} from '../../salao';
import '../../vitrine.css';

export const metadata:Metadata={title:`Meu agendamento · ${salao.nome}`,robots:{index:false}};

export default async function Pagina({params}:{params:Promise<{token:string}>}){
  const {token}=await params;
  return <div className="vitrine-fundo"><div className="vitrine">
    <a className="voltar" href="/">← {salao.nome}</a>
    <header className="titulo-pagina"><h1>Meu agendamento</h1></header>
    <MeuAgendamento token={token}/>
  </div></div>;
}
