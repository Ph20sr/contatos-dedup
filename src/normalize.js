// Normalização de dados de contato brasileiros para comparação.

const STOPWORDS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
const TITLES = new Set(['sr', 'sra', 'srta', 'dr', 'dra', 'prof', 'profa', 'eng']);
const SUFFIXES = new Set(['jr', 'junior', 'filho', 'neto', 'sobrinho']);

export const stripAccents = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** "Dr. José  da Silva Jr." → ['jose', 'silva'] */
export function nameTokens(name) {
  if (!name) return [];
  return stripAccents(String(name)).toLowerCase()
    .replace(/[^a-z\s.]/g, ' ')
    .split(/[\s.]+/)
    .filter((t) => t && !STOPWORDS.has(t) && !TITLES.has(t) && !SUFFIXES.has(t));
}

/**
 * E-mail canônico. No Gmail, pontos e "+tag" são ignorados pelo provedor:
 * Joao.Silva+crm@gmail.com e joaosilva@googlemail.com são a mesma caixa.
 */
export function normalizeEmail(email) {
  if (!email) return null;
  const e = String(email).trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1 || at === e.length - 1) return null;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.split('+')[0].replace(/\./g, '');
  else if (['outlook.com', 'hotmail.com', 'live.com'].includes(domain)) local = local.split('+')[0];
  return `${local}@${domain}`;
}

/**
 * Telefone brasileiro como DDD + número (10 ou 11 dígitos).
 * Remove +55, o 0 de longa distância e o código da operadora (0 15 11 …),
 * e acrescenta o 9 em celulares antigos de 8 dígitos (11 8765-4321 → 11 98765-4321).
 */
export function normalizePhone(phone) {
  if (!phone) return null;
  let d = String(phone).replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length >= 13 && d.startsWith('0')) d = d.slice(3);   // 0 + operadora (2) + DDD + número
  else if (d.length >= 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10 && /[6-9]/.test(d[2])) d = `${d.slice(0, 2)}9${d.slice(2)}`;
  if (d.length !== 10 && d.length !== 11) return null;
  if (d[0] === '0') return null;
  return d;
}

/** CPF/CNPJ só com dígitos e letras (CNPJ alfanumérico a partir de 2026). */
export function normalizeDocument(doc) {
  if (!doc) return null;
  const d = String(doc).toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (d.length !== 11 && d.length !== 14) return null;
  if (/^(.)\1+$/.test(d)) return null;   // 000.000.000-00 e afins
  return d;
}

/** Nome de empresa comparável: sem acentos, pontuação e sufixos societários. */
export function normalizeCompany(company) {
  if (!company) return null;
  const c = stripAccents(String(company)).toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !['ltda', 'me', 'epp', 'eireli', 'sa', 's', 'a', 'cia', 'mei'].includes(t))
    .join(' ');
  return c || null;
}
