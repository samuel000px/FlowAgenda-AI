// Only explicit replies to the proposal currently displayed may change a booking.
export function replyIntent(text) {
  const value = String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.!?,]/g, '').replace(/\s+/g, ' ').trim();
  if (['sim','sim posso','posso','eu posso','posso sim','sim eu vou','eu vou','vou','confirmo','confirmado','pode confirmar','sim consigo','consigo sim','aceito'].includes(value)) return 'yes';
  if (['nao','nao posso','nao consigo','nao vou','nao vou conseguir','nao vou conseguir ir','nao consigo ir','nao posso ir','nao da','pode liberar meu horario'].includes(value)) return 'no';
  return null;
}
