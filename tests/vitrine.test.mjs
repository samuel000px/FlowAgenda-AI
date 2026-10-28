import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cartoesDaPagina,juntarSalao,linkWhatsapp,servicosPorGrupo} from '../lib/vitrine.mjs';

const exemplo=JSON.parse(readFileSync(new URL('../agente-remarcacao/data/salao.json',import.meta.url),'utf8'));

test('a página tem os seis cartões, com agendar e serviços dentro do site',()=>{
  const cartoes=cartoesDaPagina(juntarSalao(exemplo,{instagram:'santacor',avaliacoes:'https://g.page/r/santacor/review'}));
  assert.deepEqual(cartoes.map(c=>c.titulo),['Agendar','Todos os serviços','Falar com a equipe','Instagram','Localização','Avaliações']);
  assert.equal(cartoes[0].endereco,'/agendar');
  assert.equal(cartoes[1].endereco,'/servicos');
  assert.equal(cartoes[2].endereco,'/atendimento');
  assert.equal(cartoes[5].endereco,'https://g.page/r/santacor/review');
});

test('sem link de avaliações, o cartão leva ao endereço no Google Maps',()=>{
  const cartoes=cartoesDaPagina(juntarSalao(exemplo));
  assert.equal(cartoes.at(-1).endereco,cartoes.at(-2).endereco);
  assert.match(cartoes.at(-1).endereco,/^https:\/\/www\.google\.com\/maps\/search\//);
});

test('dados reais ficam por cima do exemplo e número mal escrito é recusado',()=>{
  assert.equal(juntarSalao(exemplo,{nome:'Santa Cor'}).nome,'Santa Cor');
  assert.throws(()=>juntarSalao(exemplo,{whatsapp:'(83) 99378-2040'}),/só números/);
  assert.equal(linkWhatsapp('+55 (83) 99378-2040'),'https://wa.me/5583993782040');
});

test('serviços agrupados na ordem em que aparecem',()=>{
  const grupos=servicosPorGrupo({servicos:[{grupo:'Unhas',nome:'Manicure'},{grupo:'Beleza',nome:'Corte'},{nome:'Sem grupo'}]});
  assert.deepEqual(Object.keys(grupos),['Unhas','Beleza','Serviços']);
});
