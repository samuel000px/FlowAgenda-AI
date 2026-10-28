import type {Metadata} from 'next';
import Servicos from './servicos';
import {salao} from '../salao';
import '../vitrine.css';

export const metadata:Metadata={title:`Serviços · ${salao.nome}`,description:'Preços e duração de cada serviço.'};

export default function Pagina(){
  return <div className="vitrine-fundo"><div className="vitrine">
    <a className="voltar" href="/">← Voltar</a>
    <header className="titulo-pagina"><p className="rotulo">{salao.nome}</p><h1>Todos os serviços</h1><p>Valores e tempo de cada atendimento.</p></header>
    <Servicos/>
  </div></div>;
}
