// Only day/month is needed. Keep a year-free value for future imports and forms.
export function normalizeBirthday(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const match = /^(\d{2})\/(\d{2})$/.exec(text);
  const normalized = match ? `${match[2]}-${match[1]}` : text;
  if (!/^\d{2}-\d{2}$/.test(normalized)) throw Error('Informe o aniversário como dia/mês, por exemplo 25/10.');
  const date = new Date(`2000-${normalized}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(5, 10) !== normalized) {
    throw Error('Confira o dia e o mês do aniversário.');
  }
  return normalized;
}

export function birthdayLabel(value) {
  if (!value) return '';
  return normalizeBirthday(value).split('-').reverse().join('/');
}
