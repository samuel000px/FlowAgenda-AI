import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cartoesDaPagina,juntarSalao,linkWhatsapp,servicosPorGrupo} from '../lib/vitrine.mjs';

const exemplo=JSON.parse(readFileSync(new URL('../agente-remarcacao/data/salao.json',import.meta.url),'utf8'));

test('cartão de serviço abre o WhatsApp com o mesmo texto do site antigo',()=>{
  const salao={whatsapp:'5583993782040',mensagem_whatsapp:'Oi!',links:[
    {titulo:'Agendar Horário',mensagem:''},
    {titulo:'Alongamentos',mensagem:'Olá, gostaria de agendar um horário para Alongamento. '},
    {titulo:'Instagram',link:'https://www.instagram.com/santacoresmalteriajp/'},
  ]};
  const [agendar,servico,instagram]=cartoesDaPagina(salao).map(c=>c.endereco);
  assert.equal(agendar,'https://wa.me/5583993782040');
  assert.equal(servico,'https://wa.me/5583993782040?text=Ol%C3%A1%2C%20gostaria%20de%20agendar%20um%20hor%C3%A1rio%20para%20Alongamento.%20');
  assert.equal(instagram,'https://www.instagram.com/santacoresmalteriajp/');
});

test('sem links nos dados, a página tem os cartões básicos',()=>{
  const titulos=cartoesDaPagina(juntarSalao(exemplo)).map(c=>c.titulo);
  assert.equal(titulos[0],'Agendar Horário');
  assert.ok(titulos.includes('Localização')&&titulos.includes('Todos os Serviços'));
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
