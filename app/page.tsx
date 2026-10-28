// Página pública do salão, no estilo "link na bio". Não lê nada das clientes; o único caminho para
// o painel é a linha "Acesso da equipe" no rodapé, e o painel pede senha.
import type {Metadata} from 'next';
import {Award,ArrowLeftRight,Calendar,Clock,Droplets,Eye,Flower2,Gem,Heart,Images,ListChecks,MapPin,MessageCircle,Scissors,Sparkles,Star,WandSparkles,type LucideIcon} from 'lucide-react';
import {cartoesDaPagina,linkWhatsapp,servicosPorGrupo} from '../lib/vitrine.mjs';
import {salao,type Cartao as DadosCartao,type Servico} from './salao';
import './vitrine.css';

export const metadata:Metadata={title:`${salao.nome} ${salao.subtitulo||''} — Beleza em cada detalhe`.replace('  ',' '),description:salao.frase};

const ICONES:Record<string,LucideIcon>={calendar:Calendar,gem:Gem,droplets:Droplets,'flower-2':Flower2,'wand-sparkles':WandSparkles,eye:Eye,scissors:Scissors,images:Images,'arrow-left-right':ArrowLeftRight,star:Star,'map-pin':MapPin,'list-checks':ListChecks,'message-circle':MessageCircle,sparkles:Sparkles,heart:Heart,award:Award,clock:Clock};

function Icone({nome}:{nome:string}){
  // O lucide-react não traz mais as marcas; o do Instagram vai desenhado aqui.
  if(nome==='instagram')return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>;
  const Desenho=ICONES[nome];
  return Desenho?<Desenho strokeWidth={1.75} aria-hidden="true"/>:<>{nome}</>;
}

function Cartao({endereco,icone,titulo,subtitulo}:Pick<DadosCartao,'endereco'|'icone'|'titulo'|'subtitulo'>){
  const fora=endereco.startsWith('http');
  return <a className="cartao" href={endereco} {...(fora?{target:'_blank',rel:'noopener'}:{})}>
    <span className="icone"><Icone nome={icone}/></span>
    <span className="textos"><strong>{titulo}</strong><small>{subtitulo}</small></span>
    <span className="seta">→</span>
  </a>;
}

export default function Vitrine(){
  const cartoes:DadosCartao[]=cartoesDaPagina(salao);
  const grupos=Object.entries(servicosPorGrupo(salao)) as [string,Servico[]][];
  const {espaco,para_voce,sobre,depoimento}=salao;
  return <div className="vitrine-fundo"><div className="vitrine">
    <header className="topo">
      <div className="logo" aria-hidden="true"><span className="mono">{salao.monograma}</span><span className="logo-nome">{salao.nome}</span></div>
      {salao.selo&&<p className="selo">{salao.selo}</p>}
      <h1>{salao.nome}<em>{salao.subtitulo}</em></h1>
      {salao.especialidade&&<p className="especialidade">{salao.especialidade}</p>}
      <p className="frase">{salao.frase}</p>
      <div className="selos">{(salao.destaques||[]).map(d=><span key={d}>{d}</span>)}</div>
    </header>

    <nav className="cartoes">{cartoes.map(c=><Cartao key={c.titulo} {...c}/>)}</nav>

    {!!salao.diferenciais?.length&&<section>
      <p className="rotulo">Nossos diferenciais</p>
      <h2>Feito com <em>carinho</em></h2>
      <div className="grade">{salao.diferenciais.map(d=><div className="caixa" key={d.texto}><Icone nome={d.icone}/><p>{d.texto}</p></div>)}</div>
    </section>}

    {espaco&&<div className="bloco"><p className="rotulo">Nosso espaço</p><h2>{espaco.titulo}</h2><p>{espaco.texto}</p></div>}
    {para_voce&&<div className="bloco"><p className="rotulo">Para você</p><h2>{para_voce.titulo} <em>{para_voce.destaque}</em></h2><p>{para_voce.texto}</p></div>}
    {sobre&&<div className="bloco escuro"><p className="rotulo">{salao.nome}</p><h2>{sobre.titulo} <em>{sobre.destaque}</em></h2><p>{sobre.texto}</p></div>}
    {depoimento&&<div className="bloco depoimento"><p className="estrelas" aria-label="5 estrelas">★★★★★</p><blockquote>“{depoimento}”</blockquote><p className="assinatura">{salao.nome} {salao.subtitulo}</p></div>}

    {cartoes.some(c=>c.endereco==='#servicos')&&grupos.length>0&&<section id="servicos" className="bloco">
      <p className="rotulo">Todos os serviços</p>
      {grupos.map(([grupo,itens])=><div key={grupo}><h3>{grupo}</h3><ul>{itens.map(s=><li key={s.nome}>
        <span className="nome">{s.nome}</span>{!!s.duracao_min&&<span className="dur">{s.duracao_min} min</span>}{!!s.preco&&<span className="preco">R$ {s.preco}</span>}
      </li>)}</ul></div>)}
    </section>}

    <div className="whats"><Cartao endereco={linkWhatsapp(salao.whatsapp)} icone="message-circle" titulo="Agende pelo WhatsApp" subtitulo="Resposta rápida & atendimento exclusivo"/></div>
    <footer className="rodape">
      <div className="logo pequeno" aria-hidden="true"><span className="mono">{salao.monograma}</span></div>
      <p className="rodape-nome">{salao.nome} {salao.subtitulo}</p>
      {salao.rodape&&<p>{salao.rodape}</p>}
      <div className="hora"><Icone nome="clock"/><div>{salao.horarios?.length?salao.horarios.map(h=><p key={h.dias}>{h.dias}: {h.horas}</p>):<p>Atendimento com hora marcada</p>}</div></div>
      <p className="miudo">© 2026 · Todos os direitos reservados</p>
      <a className="equipe" href="/painel">Acesso da equipe</a>
    </footer>
  </div></div>;
}
