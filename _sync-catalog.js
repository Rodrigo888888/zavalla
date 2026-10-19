/**
 * _sync-catalog.js — gera api/_lib/catalog-seed.js a partir do PRODUCTS do app.js.
 * Uso: node _sync-catalog.js
 * Mantém a base do painel administrativo em sincronia com o catálogo real da loja.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const appPath = path.join(__dirname, 'app.js');
const outPath = path.join(__dirname, 'api', '_lib', 'catalog-seed.js');
const src = fs.readFileSync(appPath, 'utf8');

const startMarker = 'const PRODUCTS = {';
const start = src.indexOf(startMarker);
if (start === -1) throw new Error('PRODUCTS não encontrado em app.js');

// Encontra o fechamento do objeto literal por contagem de chaves.
let i = src.indexOf('{', start);
let depth = 0;
let end = -1;
for (; i < src.length; i++) {
  const ch = src[i];
  if (ch === '{') depth++;
  else if (ch === '}') {
    depth--;
    if (depth === 0) { end = i; break; }
  }
}
if (end === -1) throw new Error('Falha ao localizar o fim do objeto PRODUCTS');

const objectLiteral = src.slice(src.indexOf('{', start), end + 1);
const products = vm.runInNewContext('(' + objectLiteral + ')', Object.create(null), { timeout: 2000 });

const seed = Object.entries(products).map(([key, p]) => ({
  key,
  name: p.name || key,
  category: p.category === 'joias' ? 'joias' : 'perfumes',
  type: p.type || '',
  priceBRL: Number(p.basePriceBRL) || 0,
  image: p.image || '',
  description: p.description || '',
  topNotes: p.topNotes || '',
  heartNotes: p.heartNotes || '',
  baseNotes: p.baseNotes || '',
  volumes: (p.volumeOptions || [{ label: '50 ML', multiplier: 1 }]).map(v => ({
    label: v.label,
    multiplier: Number(v.multiplier) || 1,
  })),
}));

const banner = `/**
 * catalog-seed.js — GERADO automaticamente por _sync-catalog.js (a partir de app.js).
 * NÃO edite à mão: rode "node _sync-catalog.js" para atualizar.
 * Estes são os produtos que a loja já vende; o painel de estoque usa esta mesma base.
 */
module.exports = ${JSON.stringify(seed, null, 2)};
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, banner, 'utf8');
console.log(`OK — ${seed.length} produtos exportados para api/_lib/catalog-seed.js`);
