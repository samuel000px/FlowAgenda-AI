/// <reference types="vite/client" />
// Dados da página pública: o exemplo do repositório e, se existir no computador que publica,
// o salao.local.json com os dados reais (fora do git). Entram no app na hora do build.
import exemplo from '../agente-remarcacao/data/salao.json';
import {juntarSalao} from '../lib/vitrine.mjs';

type Texto={titulo:string,texto:string,destaque?:string};
export type Cartao={icone:string,titulo:string,subtitulo?:string,link?:string,mensagem?:string,endereco:string};
export type Servico={grupo?:string,nome:string,duracao_min?:number,preco?:number};
export type Salao={
  nome:string,subtitulo?:string,monograma?:string,logo?:string,logo_pequeno?:string,selo?:string,especialidade?:string,frase:string,
  destaques?:string[],whatsapp:string,mensagem_whatsapp:string,endereco:string,bairro_cidade:string,instagram?:string,
  horarios?:{dias:string,horas:string}[],diferenciais?:{icone:string,texto:string}[],
  espaco?:Texto,para_voce?:Texto,sobre?:Texto,depoimento?:string,rodape?:string,servicos?:Servico[],
};

const locais=import.meta.glob('../agente-remarcacao/data/salao.local.json',{eager:true,import:'default'});

export const salao:Salao=juntarSalao(exemplo,...Object.values(locais));
