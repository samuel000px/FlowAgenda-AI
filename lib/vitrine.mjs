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
 * Os seis cartões da página, sempre nesta ordem: agendar, serviços e atendimento ficam no próprio site;
 * Instagram, localização e avaliações saem para fora. "mapa" e "avaliacoes" nos dados trocam os
 * links do Google; sem eles, vai a busca pelo endereço.
 */
export function cartoesDaPagina(salao) {
  const mapa = salao.mapa || linkMapa(salao);
  return [
    { icone: 'calendar', titulo: 'Agendar', subtitulo: 'Escolha o serviço, a profissional e o horário', endereco: '/agendar' },
    { icone: 'list-checks', titulo: 'Todos os serviços', subtitulo: 'Preços e duração de cada um', endereco: '/servicos' },
    { icone: 'message-circle', titulo: 'Falar com a equipe', subtitulo: 'Peça ajuda e receba uma resposta pelo WhatsApp', endereco: '/atendimento' },
    ...(salao.instagram ? [{ icone: 'instagram', titulo: 'Instagram', subtitulo: `@${salao.instagram}`, endereco: `https://www.instagram.com/${salao.instagram}/` }] : []),
    { icone: 'map-pin', titulo: 'Localização', subtitulo: [salao.endereco, salao.bairro_cidade].filter(Boolean).join(' · ') || 'Como chegar', endereco: mapa },
    { icone: 'star', titulo: 'Avaliações', subtitulo: 'O que nossas clientes dizem', endereco: salao.avaliacoes || mapa },
  ];
}
