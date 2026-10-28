// Regras da página pública do salão, as mesmas de agente-remarcacao/src/salao.py.
// Os dados vêm de agente-remarcacao/data/salao.json (exemplo) com salao.local.json por cima.

export function juntarSalao(exemplo, ...porCima) {
  const salao = Object.assign({}, exemplo, ...porCima.filter(Boolean));
  if (!/^\d{12,13}$/.test(salao.whatsapp || '')) throw new Error('whatsapp do salão precisa ter só números, com país e DDD.');
  return salao;
}

export function linkWhatsapp(numero, texto = '') {
  return `https://wa.me/${String(numero).replace(/\D/g, '')}` + (texto ? `?text=${encodeURIComponent(texto)}` : '');
}

export function linkMapa(salao) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${salao.endereco}, ${salao.bairro_cidade}`);
}

/** {"Unhas": [...], "Beleza": [...]}, na ordem em que aparecem. Sem grupo, vai para "Serviços". */
export function servicosPorGrupo(salao) {
  const grupos = {};
  for (const s of salao.servicos || []) (grupos[s.grupo || 'Serviços'] ??= []).push(s);
  return grupos;
}

/**
 * Os cartões em pilha, cada um com o "endereco" pronto. Vêm de "links" nos dados; sem eles,
 * agendar, localização, Instagram e a lista de serviços. Cartão sem "link" abre o WhatsApp com
 * a "mensagem" dele (vazia: sem texto).
 */
export function cartoesDaPagina(salao) {
  const itens = salao.links?.length ? salao.links : [
    { icone: 'calendar', titulo: 'Agendar Horário', subtitulo: 'Reserve seu momento especial' },
    { icone: 'map-pin', titulo: 'Localização', subtitulo: 'Como chegar', link: linkMapa(salao) },
    ...(salao.instagram ? [{ icone: 'instagram', titulo: 'Instagram', subtitulo: `@${salao.instagram}`, link: `https://www.instagram.com/${salao.instagram}/` }] : []),
    { icone: 'list-checks', titulo: 'Todos os Serviços', subtitulo: 'Veja nossa lista completa', link: '#servicos' },
  ];
  return itens.map((item) => ({ ...item, endereco: item.link || linkWhatsapp(salao.whatsapp, item.mensagem ?? salao.mensagem_whatsapp) }));
}
