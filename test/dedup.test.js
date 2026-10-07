import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findDuplicates, merge, compare, normalizeEmail, normalizePhone, normalizeDocument, normalizeCompany, nameTokens,
  jaroWinkler, nameSimilarity,
} from '../src/index.js';

const sim = (a, b) => nameSimilarity(nameTokens(a), nameTokens(b));

test('e-mail: Gmail ignora pontos e +tag; outros domínios só o +tag da Microsoft', () => {
  assert.equal(normalizeEmail(' Joao.Silva+crm@GoogleMail.com '), 'joaosilva@gmail.com');
  assert.equal(normalizeEmail('ana+site@outlook.com'), 'ana@outlook.com');
  assert.equal(normalizeEmail('ana.paula+x@empresa.com.br'), 'ana.paula+x@empresa.com.br');
  assert.equal(normalizeEmail('sem-arroba'), null);
  assert.equal(normalizeEmail('x@'), null);
});

test('telefone: +55, operadora, 0 de longa distância e o 9 do celular', () => {
  for (const p of ['+55 (11) 98765-4321', '(11) 8765-4321', '0 15 11 98765-4321', '5511987654321', '11987654321']) {
    assert.equal(normalizePhone(p), '11987654321', p);
  }
  assert.equal(normalizePhone('011 3456-7890'), '1134567890', 'fixo não ganha o 9');
  assert.equal(normalizePhone('98765-4321'), null, 'sem DDD não dá para comparar');
});

test('documento e empresa', () => {
  assert.equal(normalizeDocument('123.456.789-09'), '12345678909');
  assert.equal(normalizeDocument('12.ABC.345/01DE-35'), '12ABC34501DE35', 'CNPJ alfanumérico');
  assert.equal(normalizeDocument('000.000.000-00'), null);
  assert.equal(normalizeCompany('Padaria São João Ltda - ME'), 'padaria sao joao');
  assert.deepEqual(nameTokens('Dr. José  da Silva Jr.'), ['jose', 'silva']);
});

test('Jaro-Winkler com os valores de referência', () => {
  assert.equal(jaroWinkler('martha', 'marhta').toFixed(4), '0.9611');
  assert.equal(jaroWinkler('dixon', 'dicksonx').toFixed(4), '0.8133');
  assert.equal(jaroWinkler('abc', 'abc'), 1);
  assert.equal(jaroWinkler('abc', 'xyz'), 0);
});

test('nomes: iniciais e nomes do meio sim, outra pessoa não', () => {
  assert.equal(sim('Maria Souza', 'Maria Aparecida Souza'), 1);
  assert.equal(sim('Jose da Silva', 'José Silva'), 1);
  assert.ok(sim('Ana P. Souza', 'Ana Paula Souza') >= 0.95);
  assert.ok(sim('João Pereira', 'Joao Pereria') >= 0.95, 'erro de digitação no sobrenome');
  assert.ok(sim('Maria A. Souza', 'Maria B. Souza') < 0.85, 'iniciais diferentes');
  assert.ok(sim('Fernanda Costa', 'Fernando Costa') < 0.85, 'Fernanda ≠ Fernando');
  assert.ok(sim('Marcos Lima', 'Márcio Lima') < 0.85, 'Marcos ≠ Márcio');
  assert.ok(sim('Ana', 'Ana Paula') < 0.9, 'só o primeiro nome nunca basta');
});

const PADARIA = 'Padaria Pão Quente Ltda';
const contacts = [
  { id: 'c1', name: 'Ana Paula Souza', email: 'ana.paula@gmail.com', phone: '11 98765-4321', document: '123.456.789-09', company: PADARIA, city: 'São Paulo', createdAt: '2025-01-10', updatedAt: '2026-01-01' },
  { id: 'c2', name: 'Ana Paula Souza', email: 'anapaula+site@gmail.com', city: 'Sao Paulo', role: 'Gerente', createdAt: '2025-06-01', updatedAt: '2026-05-01' },
  { id: 'c3', name: 'Ana P. Souza', phone: '+55 11 98765-4321', company: 'Padaria Pão Quente', createdAt: '2026-02-01', updatedAt: '2026-02-01' },
  // PABX da padaria: mesmo telefone, pessoas diferentes
  { id: 'c4', name: 'Carlos Lima', phone: '11 3333-4444', company: PADARIA },
  { id: 'c5', name: 'Beatriz Lima', phone: '(11) 3333-4444', company: PADARIA },
  // Fernanda e Fernando na mesma empresa
  { id: 'c6', name: 'Fernando Costa', email: 'fernando@transcosta.com.br', company: 'TransCosta' },
  { id: 'c7', name: 'Fernanda Costa', email: 'fernanda@transcosta.com.br', company: 'TransCosta' },
  // erro de digitação + mesma empresa (só "provável": precisa de alguém confirmar)
  { id: 'c8', name: 'Marcos Oliveira', company: 'Oliveira Transportes ME', city: 'Campinas' },
  { id: 'c9', name: 'Marcos Oliveria', company: 'Oliveira Transportes', city: 'Campinas' },
  // homônimos com CPFs diferentes e o mesmo telefone: nunca são a mesma pessoa
  { id: 'c10', name: 'João Silva', document: '111.444.777-35', phone: '21 99999-0000' },
  { id: 'c11', name: 'Joao Silva', document: '529.982.247-25', phone: '21 99999-0000' },
  // caixa compartilhada da clínica
  { id: 'c12', name: 'Clínica Bem Estar', email: 'contato@clinicabem.com.br' },
  { id: 'c13', name: 'Juliana Prado', email: 'contato@clinicabem.com.br' },
];

test('cenário de CRM: agrupa o que é duplicado e separa o que não é', () => {
  const groups = findDuplicates(contacts);
  const byIds = Object.fromEntries(groups.map((g) => [g.ids.join(','), g]));
  assert.deepEqual(Object.keys(byIds).sort(), ['c1,c2,c3', 'c12,c13', 'c8,c9']);

  const ana = byIds['c1,c2,c3'];
  assert.equal(ana.confidence, 'certo');
  const reasons = Object.fromEntries(ana.pairs.map((p) => [`${p.a}-${p.b}`, p.reasons]));
  assert.ok(reasons['c1-c2'].includes('mesmo e-mail'), 'Gmail com ponto e +tag');
  assert.ok(reasons['c1-c3'].includes('mesmo telefone'));

  assert.equal(byIds['c8,c9'].confidence, 'provável');
  assert.deepEqual(byIds['c8,c9'].pairs[0].reasons, ['nome parecido', 'mesma empresa', 'mesma cidade']);

  assert.equal(byIds['c12,c13'].confidence, 'provável');
  assert.ok(byIds['c12,c13'].pairs[0].reasons.includes('nomes diferentes'));

  assert.equal(groups[0].confidence, 'certo', 'os certos vêm primeiro');
});

test('transitividade nunca junta dois CPFs diferentes', () => {
  const people = [
    { id: 'a', name: 'Pedro Alves', document: '111.444.777-35', email: 'pedro@alves.com.br' },
    { id: 'b', name: 'Pedro Alves', email: 'pedro@alves.com.br', phone: '31 98888-7777' },
    { id: 'c', name: 'Pedro Alves', document: '529.982.247-25', phone: '31 98888-7777' },
  ];
  const groups = findDuplicates(people);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].ids.length, 2);
  assert.ok(!(groups[0].ids.includes('a') && groups[0].ids.includes('c')));
  assert.equal(compare(people[0], people[2]), null);
});

test('mesclar: id mais antigo, campo mais recente, e-mails e telefones unidos', () => {
  const { contact, conflicts } = merge(contacts.slice(0, 3));
  assert.equal(contact.id, 'c1', 'o mais antigo, para manter histórico e vínculos');
  assert.deepEqual(contact.mergedFrom, ['c2', 'c3']);
  assert.equal(contact.name, 'Ana Paula Souza', 'c2 é o mais recente com nome');
  assert.equal(contact.role, 'Gerente');
  assert.equal(contact.document, '123.456.789-09');
  assert.equal(contact.city, 'Sao Paulo');
  assert.deepEqual(contact.emails, ['anapaula+site@gmail.com'], 'mesma caixa do Gmail, guardada uma vez');
  assert.deepEqual(contact.phones, ['+55 11 98765-4321'], 'mesmo número em formatos diferentes');
  assert.equal(contact.createdAt, '2025-01-10');
  assert.equal(contact.updatedAt, '2026-05-01');
  assert.deepEqual(conflicts.city, ['Sao Paulo', 'São Paulo']);
  assert.deepEqual(conflicts.name, ['Ana Paula Souza', 'Ana P. Souza']);
  assert.throws(() => merge([]), TypeError);
});

test('escala: 5.000 contatos sem comparar todos com todos', () => {
  const first = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Felipe', 'Gabriela', 'Hugo', 'Isabela', 'Jorge',
    'Karen', 'Lucas', 'Mariana', 'Nicolas', 'Olivia', 'Paulo', 'Rafaela', 'Sergio', 'Tatiana', 'Vitor'];
  const middle = ['Alves', 'Barbosa', 'Cardoso', 'Dias', 'Esteves'];
  const last = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Almeida', 'Pereira', 'Lima', 'Gomes',
    'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Rocha', 'Araujo', 'Melo', 'Barros', 'Freitas', 'Moreira',
    'Teixeira', 'Mendes', 'Nunes', 'Vieira', 'Monteiro', 'Cavalcanti', 'Ramos', 'Batista', 'Campos', 'Pinto',
    'Correia', 'Moura', 'Castro', 'Lopes', 'Fernandes', 'Machado', 'Azevedo', 'Duarte', 'Farias', 'Reis',
    'Nascimento', 'Andrade', 'Coelho', 'Borges', 'Pires', 'Sales', 'Brito', 'Peixoto', 'Assis', 'Macedo'];
  const big = Array.from({ length: 5000 }, (_, i) => ({
    id: `x${i}`,
    name: `${first[i % 20]} ${middle[Math.floor(i / 20) % 5]} ${last[Math.floor(i / 100)]}`,
    email: `pessoa${i}@exemplo.com.br`,
    phone: `11 9${10000000 + i}`,
  }));
  big.push({ id: 'dup', name: big[2].name.replace('Carla', 'Karla'), email: 'PESSOA2@exemplo.com.br' });
  const start = performance.now();
  const groups = findDuplicates(big);
  assert.deepEqual(groups.map((g) => g.ids), [['x2', 'dup']]);
  assert.ok(performance.now() - start < 15000);
});
