// Similaridade entre nomes: Jaro-Winkler por token, tolerante a iniciais e nomes do meio.

/** Jaro-Winkler clássico (0 a 1). Favorece strings com o mesmo começo, ideal para nomes. */
export function jaroWinkler(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const ma = new Array(a.length).fill(false);
  const mb = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (mb[j] || a[i] !== b[j]) continue;
      ma[i] = mb[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < a.length; i++) {
    if (!ma[i]) continue;
    while (!mb[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const m = matches;
  const jaro = (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

// Fernanda/Fernando, Paula/Paulo, Mario/Maria: uma letra de diferença, outra pessoa.
const genderPair = (x, y) => x.length === y.length && x.length > 2 && x.slice(0, -1) === y.slice(0, -1)
  && new Set([x.at(-1), y.at(-1)]).size === 2 && ['a', 'o'].includes(x.at(-1)) && ['a', 'o'].includes(y.at(-1));

const tokenScore = (x, y) => {
  if (x.length === 1 || y.length === 1) return x[0] === y[0] ? 0.95 : 0;   // inicial: "A." ~ "Aparecida"
  if (genderPair(x, y)) return 0;
  return jaroWinkler(x, y);
};

/**
 * Similaridade entre dois nomes já tokenizados.
 * Primeiro e último nome precisam bater; nomes do meio só contam se ambos tiverem
 * ("Maria Souza" ~ "Maria Aparecida Souza", mas "Maria A. Souza" ≠ "Maria B. Souza").
 */
export function nameSimilarity(ta, tb) {
  if (!ta.length || !tb.length) return 0;
  if (ta.length === 1 || tb.length === 1) {
    // só um nome: compara o primeiro, mas nunca é suficiente para afirmar duplicidade
    return Math.min(0.85, tokenScore(ta[0], tb[0]));
  }
  const first = tokenScore(ta[0], tb[0]);
  const last = tokenScore(ta.at(-1), tb.at(-1));
  let score = (first + last) / 2;
  const ma = ta.slice(1, -1);
  const mb = tb.slice(1, -1);
  if (ma.length && mb.length) {
    // cada nome do meio do menor precisa ter um par no outro
    const [small, big] = ma.length <= mb.length ? [ma, mb] : [mb, ma];
    const middle = small.reduce((s, t) => s + Math.max(...big.map((u) => tokenScore(t, u))), 0) / small.length;
    score = (score * 2 + middle) / 3;
  }
  // primeiro nome é mais exigente (Marcos ≠ Márcio); o sobrenome tolera erro de digitação
  return first < 0.94 || last < 0.85 ? Math.min(score, 0.8) : score;
}
