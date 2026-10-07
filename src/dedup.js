// Encontra e mescla contatos duplicados.

import {
  nameTokens, normalizeEmail, normalizePhone, normalizeDocument, normalizeCompany, stripAccents,
} from './normalize.js';
import { nameSimilarity } from './similarity.js';

const list = (one, many) => [...(many ?? []), ...(one ? [one] : [])];
const uniq = (arr) => [...new Set(arr.filter(Boolean))];

function prepare(c) {
  const emails = uniq(list(c.email, c.emails).map(normalizeEmail));
  const doc = normalizeDocument(c.document);
  return {
    id: c.id,
    tokens: nameTokens(c.name),
    emails,
    phones: uniq(list(c.phone, c.phones).map(normalizePhone)),
    cpf: doc?.length === 11 ? doc : null,
    cnpj: doc?.length === 14 ? doc : null,
    company: normalizeCompany(c.company),
    city: c.city ? stripAccents(String(c.city)).toLowerCase().trim() : null,
  };
}

const shares = (a, b) => a.some((x) => b.includes(x));

/**
 * Compara dois contatos preparados. Retorna null quando não são a mesma pessoa.
 * Regras (na ordem):
 *  - CPFs diferentes: nunca são a mesma pessoa
 *  - mesmo CPF: certo
 *  - mesmo e-mail: certo, a não ser que os nomes se contradigam (caixa compartilhada)
 *  - mesmo telefone: certo se os nomes batem; telefone sozinho pode ser o PABX da empresa
 *  - nome parecido + mesma empresa, CNPJ ou cidade: provável
 *    (o domínio do e-mail não conta: endereços diferentes no mesmo domínio são caixas diferentes)
 */
function comparePrepared(a, b, { nameThreshold = 0.9 } = {}) {
  if (a.cpf && b.cpf && a.cpf !== b.cpf) return null;
  const hasNames = a.tokens.length > 0 && b.tokens.length > 0;
  const sim = hasNames ? nameSimilarity(a.tokens, b.tokens) : null;
  const namesAgree = sim === null || sim >= 0.85;
  const reasons = [];
  let confidence = null;

  if (a.cpf && a.cpf === b.cpf) { reasons.push('mesmo CPF'); confidence = 'certo'; }
  if (shares(a.emails, b.emails)) {
    reasons.push('mesmo e-mail');
    confidence = confidence ?? (namesAgree ? 'certo' : 'provável');
  }
  if (shares(a.phones, b.phones)) {
    if (sim !== null && sim >= 0.85) { reasons.push('mesmo telefone'); confidence = 'certo'; }
    else if (sim === null) { reasons.push('mesmo telefone'); confidence = confidence ?? 'provável'; }
  }
  if (sim !== null && sim >= nameThreshold) {
    const context = [];
    if (a.cnpj && a.cnpj === b.cnpj) context.push('mesmo CNPJ');
    if (a.company && a.company === b.company) context.push('mesma empresa');
    if (a.city && a.city === b.city) context.push('mesma cidade');
    if (context.length) {
      reasons.push('nome parecido', ...context);
      confidence = confidence ?? 'provável';
    }
  }
  if (!confidence) return null;
  if (sim !== null && sim < 0.85) reasons.push('nomes diferentes');
  const score = confidence === 'certo' ? Math.max(0.95, sim ?? 0.95) : Math.min(0.94, sim ?? 0.8);
  return { confidence, score: Math.round(score * 1000) / 1000, reasons: uniq(reasons) };
}

/** Compara dois contatos. Retorna null quando não parecem a mesma pessoa. */
export const compare = (a, b, options) => comparePrepared(prepare(a), prepare(b), options);

/**
 * Pares candidatos por "blocos": só compara quem compartilha e-mail, telefone, CPF ou nome.
 * O nome entra em dois blocos: início do primeiro + início do último (Ana Souza ~ Ana P. Souza)
 * e último completo + inicial do primeiro (pega erro de digitação no primeiro nome).
 */
function candidatePairs(prepared) {
  const blocks = new Map();
  const add = (key, i) => {
    if (!blocks.has(key)) blocks.set(key, []);
    blocks.get(key).push(i);
  };
  prepared.forEach((p, i) => {
    p.emails.forEach((e) => add(`e:${e}`, i));
    p.phones.forEach((t) => add(`t:${t}`, i));
    if (p.cpf) add(`c:${p.cpf}`, i);
    if (p.tokens.length) {
      const [first, last] = [p.tokens[0], p.tokens.at(-1)];
      add(`n:${first.slice(0, 3)}|${last.slice(0, 3)}`, i);
      add(`s:${last}|${first[0]}`, i);
    }
  });
  const pairs = new Set();
  for (const ids of blocks.values()) {
    for (let x = 0; x < ids.length; x++) {
      for (let y = x + 1; y < ids.length; y++) pairs.add(`${ids[x]},${ids[y]}`);
    }
  }
  return [...pairs].map((s) => s.split(',').map(Number));
}

/**
 * Agrupa os contatos duplicados.
 * Os pares mais fortes são unidos primeiro, e um grupo nunca junta dois CPFs diferentes,
 * mesmo por transitividade (A tem o telefone de B, B tem o e-mail de C, mas A e C têm CPFs distintos).
 */
export function findDuplicates(contacts, options = {}) {
  const prepared = contacts.map(prepare);
  const edges = [];
  for (const [i, j] of candidatePairs(prepared)) {
    const r = comparePrepared(prepared[i], prepared[j], options);
    if (r) edges.push({ i, j, ...r });
  }
  edges.sort((x, y) => (x.confidence === y.confidence ? y.score - x.score : x.confidence === 'certo' ? -1 : 1));

  const parent = prepared.map((_, i) => i);
  const cpfs = prepared.map((p) => new Set(p.cpf ? [p.cpf] : []));
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const accepted = [];
  for (const e of edges) {
    const a = find(e.i);
    const b = find(e.j);
    if (a !== b) {
      const merged = new Set([...cpfs[a], ...cpfs[b]]);
      if (merged.size > 1) continue;
      parent[b] = a;
      cpfs[a] = merged;
    }
    accepted.push(e);
  }

  const groups = new Map();
  for (const e of accepted) {
    const root = find(e.i);
    if (!groups.has(root)) groups.set(root, { members: new Set(), pairs: [] });
    const g = groups.get(root);
    g.members.add(e.i).add(e.j);
    g.pairs.push(e);
  }

  return [...groups.values()].map((g) => {
    const members = [...g.members].sort((x, y) => x - y);
    // "certo" só quando todos estão ligados por pares certos
    const p2 = Object.fromEntries(members.map((m) => [m, m]));
    const f2 = (x) => (p2[x] === x ? x : (p2[x] = f2(p2[x])));
    for (const e of g.pairs) if (e.confidence === 'certo') p2[f2(e.j)] = f2(e.i);
    const certain = new Set(members.map(f2)).size === 1;
    return {
      ids: members.map((m) => contacts[m].id),
      confidence: certain ? 'certo' : 'provável',
      pairs: g.pairs.map((e) => ({
        a: contacts[e.i].id, b: contacts[e.j].id, confidence: e.confidence, score: e.score, reasons: e.reasons,
      })),
    };
  }).sort((x, y) => (x.confidence === y.confidence ? 0 : x.confidence === 'certo' ? -1 : 1));
}

const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
const time = (c, key) => Date.parse(c[key] ?? '') || 0;

/**
 * Mescla um grupo em um registro só.
 * - mantém o id do contato mais antigo (preserva histórico e vínculos)
 * - cada campo vem do contato atualizado mais recentemente que o preencheu
 * - e-mails e telefones são unidos sem repetição; valores divergentes vão para `conflicts`
 */
export function merge(group) {
  if (!group?.length) throw new TypeError('merge precisa de pelo menos um contato');
  const byCreated = [...group].sort((a, b) => time(a, 'createdAt') - time(b, 'createdAt'));
  const byUpdated = [...group].sort((a, b) => time(b, 'updatedAt') - time(a, 'updatedAt'));
  const result = { id: byCreated[0].id };
  const conflicts = {};
  const skip = new Set(['id', 'email', 'emails', 'phone', 'phones', 'createdAt', 'updatedAt']);

  const keys = uniq(group.flatMap(Object.keys)).filter((k) => !skip.has(k));
  for (const key of keys) {
    const values = byUpdated.map((c) => c[key]).filter((v) => !isEmpty(v));
    if (!values.length) continue;
    result[key] = values[0];
    const distinct = uniq(values.map((v) => JSON.stringify(v)));
    if (distinct.length > 1) conflicts[key] = distinct.map((v) => JSON.parse(v));
  }

  const collect = (one, many, norm) => {
    const seen = new Map();
    for (const c of byUpdated) {
      for (const v of list(c[one], c[many])) {
        const n = norm(v);
        if (n && !seen.has(n)) seen.set(n, v);
      }
    }
    return [...seen.values()];
  };
  const emails = collect('email', 'emails', normalizeEmail);
  const phones = collect('phone', 'phones', normalizePhone);
  if (emails.length) { result.email = emails[0]; result.emails = emails; }
  if (phones.length) { result.phone = phones[0]; result.phones = phones; }
  result.createdAt = byCreated[0].createdAt;
  result.updatedAt = byUpdated[0].updatedAt;
  result.mergedFrom = group.map((c) => c.id).filter((id) => id !== result.id);
  return { contact: result, conflicts };
}
