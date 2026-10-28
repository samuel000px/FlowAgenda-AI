// Fixed positional parameters: customer, service, date/time, professional.
export const templateExamples = [
  {kind:'offer',name:'flowagenda_encaixe',title:'Proposta de encaixe',body:'Olá, {{1}}. Temos uma opção para antecipar seu atendimento de {{2}} para {{3}}, com {{4}}. Deseja aceitar? Seu horário atual permanece reservado até a confirmação da equipe.',buttons:['Aceitar horário','Manter meu horário']},
  {kind:'reminder',name:'flowagenda_presenca',title:'Confirmação de presença',body:'Olá, {{1}}. Você confirma seu atendimento de {{2}} em {{3}}, com {{4}}? Se não puder comparecer, toque em Não vou comparecer para cancelar esse atendimento.',buttons:['Confirmar presença','Não vou comparecer']},
];
export function templateText(message) {
  const template=message.whatsapp?.template;
  if(!template)return '';
  const example=templateExamples.find(t=>t.kind===(message.offer_id?'offer':'reminder'));
  return example.body.replace(/\{\{([1-4])\}\}/g,(_,n)=>template.parameters[Number(n)-1]);
}
