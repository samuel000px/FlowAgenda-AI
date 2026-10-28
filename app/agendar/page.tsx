import type {Metadata} from 'next';
import Agendar from './agendar';
import {salao} from '../salao';
import '../vitrine.css';

export const metadata:Metadata={title:`Agendar · ${salao.nome}`,description:'Escolha o serviço, a profissional e o horário.'};

export default function Pagina(){
  return <div className="vitrine-fundo"><div className="vitrine">
    <a className="voltar" href="/">← Voltar</a>
    <header className="titulo-pagina"><p className="rotulo">{salao.nome}</p><h1>Agendar horário</h1><p>Escolha o serviço, a profissional e o melhor horário para você.</p></header>
    <Agendar/>
  </div></div>;
}
