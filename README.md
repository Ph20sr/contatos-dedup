# contatos-dedup

[![CI](https://github.com/Ph20sr/contatos-dedup/actions/workflows/ci.yml/badge.svg)](https://github.com/Ph20sr/contatos-dedup/actions/workflows/ci.yml)
![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![license](https://img.shields.io/badge/license-MIT-blue)

**Encontra e mescla contatos duplicados no CRM.** A mesma cliente aparece como "Ana Paula Souza / ana.paula@gmail.com", "Ana P. Souza / +55 11 98765-4321" e "anapaula+site@gmail.com". A biblioteca junta os três, explica por quê e separa o que só *parece* duplicado: o PABX da empresa, a Fernanda e o Fernando, homônimos com CPFs diferentes. Não tem dependências.

## Uso

```js
import { findDuplicates, merge } from 'contatos-dedup';

const grupos = findDuplicates(contatos);
// [
//   { ids: ['c1', 'c2', 'c3'], confidence: 'certo',
//     pairs: [{ a: 'c1', b: 'c2', confidence: 'certo', score: 1, reasons: ['mesmo e-mail'] },
//             { a: 'c1', b: 'c3', confidence: 'certo', score: 0.983, reasons: ['mesmo telefone'] }, ...] },
//   { ids: ['c8', 'c9'], confidence: 'provável',
//     pairs: [{ ..., reasons: ['nome parecido', 'mesma empresa', 'mesma cidade'] }] },
// ]

const { contact, conflicts } = merge(contatos.filter((c) => grupos[0].ids.includes(c.id)));
// contact.id         → o id mais antigo (mantém histórico, negócios e vínculos)
// contact.emails     → todos os e-mails, sem repetir a mesma caixa
// contact.mergedFrom → ['c2', 'c3'] para redirecionar referências
// conflicts          → { city: ['Sao Paulo', 'São Paulo'] } para a tela de revisão
```

Cada contato aceita `name`, `email`/`emails`, `phone`/`phones`, `document` (CPF ou CNPJ), `company`, `city`, `createdAt` e `updatedAt`. Outros campos são preservados no merge.

## Quando dois contatos são a mesma pessoa

| sinal | resultado |
| --- | --- |
| mesmo **CPF** | certo |
| **CPFs diferentes** | nunca, nem por transitividade |
| mesmo **e-mail** (Gmail sem pontos e +tag) | certo; *provável* se os nomes se contradizem (caixa compartilhada, como contato@) |
| mesmo **telefone** e nome compatível | certo |
| mesmo telefone e nomes diferentes | **não**: é o PABX ou o celular da recepção |
| nome parecido + mesma empresa, CNPJ ou cidade | provável (vai para revisão) |
| só o nome | **não**: homônimos são comuns demais |

"Certo" pode ser mesclado automaticamente. "Provável" deve ir para uma tela de revisão.

## Normalização brasileira

- **Telefone:** `+55 (11) 98765-4321`, `0 15 11 98765-4321` (operadora), `011…` e o celular antigo `11 8765-4321` viram `11987654321`. Fixo não ganha o 9.
- **E-mail:** `Joao.Silva+crm@googlemail.com` = `joaosilva@gmail.com`. Pontos só são ignorados no Gmail; em outros domínios, `ana.paula` e `anapaula` são caixas diferentes.
- **Nome:** sem acentos, títulos (Dr., Sra.), partículas (da, dos) e sufixos (Jr., Filho). Aceita iniciais ("Ana P. Souza") e nome do meio omitido.
- **Documento:** CPF e **CNPJ alfanumérico** (2026).

## Nomes parecidos

Comparação **Jaro-Winkler** por partes do nome, com regras para os casos que enganam:

- o **primeiro nome** precisa quase bater (`Marcos` ≠ `Márcio`); o **sobrenome** tolera erro de digitação (`Pereira` ~ `Pereria`)
- `Fernanda` ≠ `Fernando`, `Paula` ≠ `Paulo`: uma letra de diferença, outra pessoa
- iniciais diferentes no meio separam: `Maria A. Souza` ≠ `Maria B. Souza`

## Desempenho

Comparar todos com todos é O(n²). A busca usa **blocos**: só compara contatos que compartilham e-mail, telefone, CPF ou um pedaço do nome. Há um teste com 5.000 contatos, que roda em menos de 100 ms.

## Desenvolvimento

```bash
npm test
```

## Licença

MIT
