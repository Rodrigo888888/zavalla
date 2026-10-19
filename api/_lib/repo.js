/**
 * ZAVALLA — repositórios do controle de estoque (v2).
 *
 * Cada coleção tem um caminho estável no Blob. O saldo do estoque vive dentro
 * do documento do produto e SÓ muda pelas operações de stock.js (escrita
 * condicional/CAS), nunca por edição direta.
 *
 * Estrutura de chaves:
 *   zavalla/v2/products/<id>.json        um documento por produto (id estável)
 *   zavalla/v2/products-index.json       índice de SKU/storeKey (unicidade)
 *   zavalla/v2/movements/<mês>/<dia>.json  movimentações imutáveis agrupadas por dia
 *   zavalla/v2/suppliers/<id>.json       fornecedores
 *   zavalla/v2/orders/<id>.json          pedidos da loja
 *   zavalla/v2/sessions/<hash>.json      sessões administrativas
 *   zavalla/v2/ops/<token>.json          registro de idempotência (anti-duplicidade)
 *   zavalla/v2/settings.json             configurações do painel
 *   zavalla/v2/migration.json            marca da migração v1 → v2 (idempotente)
 */
const db = require('./db/blob');
const { SKIP } = db;
const { dayKey, monthKey } = require('./model');

/* ------------------------------------------------------------------ */
/* Produtos                                                            */
/* ------------------------------------------------------------------ */

function productPath(id) { return `products/${id}.json`; }

async function getProduct(id) {
  if (!id) return null;
  const { data } = await db.readJSON(productPath(id));
  return data;
}

async function listProducts({ includeInactive = true } = {}) {
  const paths = await db.listPaths('products/');
  // os paths vêm como 'products/<id>.json' — extrai só o id
  const ids = paths.filter((p) => p.endsWith('.json')).map((p) => p.split('/').pop().replace(/\.json$/, ''));
  const docs = await db.readMany(ids.map(productPath));
  let products = docs.map((d) => d.data);
  if (!includeInactive) products = products.filter((p) => p.status !== 'inativo');
  products.sort((a, b) => String(a.name).localeCompare(b.name, 'pt-BR'));
  return products;
}

/* Índice de unicidade (SKU e vínculo com a vitrine) ----------------- */

async function readIndex() {
  const { data } = await db.readJSON('products-index.json');
  return data && typeof data === 'object' ? data : { skus: {}, storeKeys: {} };
}

async function writeIndex(index) { return db.writeJSON('products-index.json', index); }

/**
 * Reserva um SKU no índice via CAS (transação condicional).
 * Retorna false se o SKU já pertence a outro produto — assim duas criações
 * simultâneas com o mesmo SKU nunca passam ambas.
 */
async function claimSku(sku, id) {
  let taken = false;
  await db.mutateJSON('products-index.json', (idx) => {
    const index = idx && idx.skus ? idx : { skus: {}, storeKeys: {} };
    const owner = index.skus[sku];
    if (owner && owner !== id) { taken = true; return SKIP; }
    index.skus[sku] = id;
    return index;
  });
  return !taken;
}

/** Checa unicidade do SKU para um produto (id pode ser o próprio produto). */
async function isSkuTaken(sku, id) {
  const idx = await readIndex();
  const owner = idx.skus && idx.skus[sku];
  return !!(owner && owner !== id);
}

async function setStoreKey(storeKey, id) {
  return db.mutateJSON('products-index.json', (idx) => {
    const index = idx && idx.skus ? idx : { skus: {}, storeKeys: {} };
    index.storeKeys = index.storeKeys || {};
    const owner = index.storeKeys[storeKey];
    if (owner && owner !== id) return SKIP; // já vinculado a outro produto: mantém
    index.storeKeys[storeKey] = id;
    return index;
  });
}

/** Localiza produto pela chave usada pela vitrine (storeKey ou o próprio id). */
async function getProductByStoreKey(storeKey) {
  const idx = await readIndex();
  const id = idx.storeKeys && idx.storeKeys[storeKey];
  if (id) {
    const byIndex = await getProduct(id);
    if (byIndex) return byIndex;
  }
  // fallback: varre produtos (índice pode estar incompleto após migração)
  const all = await listProducts();
  const byKey = all.find((p) => p.storeKey === storeKey);
  if (byKey) return byKey;
  // por fim, aceita o próprio id (produtos sem vínculo usam o id como chave)
  return getProduct(storeKey);
}

/** Salva produto inteiro (criação/edição de cadastro — NÃO mexe em saldo). */
async function saveProduct(product) {
  const { etag } = await db.writeJSON(productPath(product.id), product);
  return { product, etag };
}

/** Escrita condicional do produto (usada pelas movimentações de saldo). */
async function mutateProduct(id, fn) {
  return db.mutateJSON(productPath(id), fn);
}

/* ------------------------------------------------------------------ */
/* Movimentações (imutáveis, agrupadas por dia)                        */
/* ------------------------------------------------------------------ */

function movementPath(day) { return `movements/${day.slice(0, 7)}/${day}.json`; }

/** Anexa movimentações a um dia via CAS — nunca sobrescreve as anteriores. */
async function appendMovements(day, newMovements) {
  return db.mutateJSON(movementPath(day), (existing) => {
    const arr = Array.isArray(existing) ? existing : (existing && Array.isArray(existing.items) ? existing.items : []);
    return { day, items: arr.concat(newMovements) };
  });
}

/**
 * Lista movimentações de um período (AAAA-MM-DD … AAAA-MM-DD), mais recentes
 * primeiro. Filtra por produto e tipo quando informado.
 */
async function listMovements({ from = null, to = null, productId = null, type = null, limit = 200 } = {}) {
  const today = new Date();
  const toDate = to ? new Date(to + 'T23:59:59Z') : today;
  const fromDate = from ? new Date(from + 'T00:00:00Z') : new Date(today.getTime() - 90 * 864e5);

  // gera a lista de dias do intervalo (limitado a 400 dias)
  const days = [];
  const cur = new Date(fromDate);
  let guard = 0;
  while (cur <= toDate && guard++ < 400) {
    days.push(dayKey(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  days.reverse(); // mais recentes primeiro

  const out = [];
  for (const day of days) {
    if (out.length >= limit) break;
    let doc;
    try {
      const r = await db.readJSON(movementPath(day));
      doc = r.data;
    } catch (e) { continue; }
    if (!doc) continue;
    const items = Array.isArray(doc) ? doc : (Array.isArray(doc.items) ? doc.items : []);
    for (const m of items.reverse()) { // mais recentes primeiro dentro do dia
      if (productId && m.productId !== productId) continue;
      if (type && m.type !== type) continue;
      out.push(m);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Fornecedores                                                        */
/* ------------------------------------------------------------------ */

function supplierPath(id) { return `suppliers/${id}.json`; }

async function getSupplier(id) {
  const { data } = await db.readJSON(supplierPath(id));
  return data;
}

async function listSuppliers() {
  const paths = await db.listPaths('suppliers/');
  const docs = await db.readMany(paths.filter((p) => p.endsWith('.json')));
  const list = docs.map((d) => d.data);
  list.sort((a, b) => String(a.name).localeCompare(b.name, 'pt-BR'));
  return list;
}

async function saveSupplier(supplier) {
  return db.writeJSON(supplierPath(supplier.id), supplier);
}

async function deleteSupplier(id) {
  return db.removeJSON(supplierPath(id));
}

/* ------------------------------------------------------------------ */
/* Pedidos (integração com a loja virtual)                             */
/* ------------------------------------------------------------------ */

function orderPath(id) { return `orders/${id}.json`; }

async function getOrder(id) {
  const { data } = await db.readJSON(orderPath(id));
  return data;
}

async function saveOrder(order, { createOnly = false, etag = null } = {}) {
  return db.writeJSON(orderPath(order.id), order, { createOnly, etag: etag || undefined });
}

async function mutateOrder(id, fn) {
  return db.mutateJSON(orderPath(id), fn);
}

async function listOrders({ limit = 200 } = {}) {
  const paths = await db.listPaths('orders/');
  // os paths vêm como 'orders/<id>.json' — extrai só o id
  const ids = paths.filter((p) => p.endsWith('.json')).map((p) => p.split('/').pop().replace(/\.json$/, ''));
  const docs = await db.readMany(ids.map(orderPath));
  const orders = docs.map((d) => d.data).filter(Boolean);
  orders.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return orders.slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Sessões administrativas                                             */
/* ------------------------------------------------------------------ */
/* Mantidas no prefixo LEGADO (zavala/sessions/) de propósito: sessões
 * válidas do sistema anterior continuam funcionando após a migração —
 * ninguém é deslogado sem necessidade. O formato é idêntico. */

async function getSession(hash) {
  const { data } = await db.legacyReadJSON(`sessions/${hash}.json`);
  return data;
}

async function saveSession(hash, session) {
  return db.legacyWriteJSON(`sessions/${hash}.json`, session);
}

async function deleteSession(hash) {
  return db.removeJSON(`sessions/${hash}.json`, { legacy: true });
}

/* ------------------------------------------------------------------ */
/* Idempotência (anti-duplicidade de operações)                        */
/* ------------------------------------------------------------------ */

/**
 * Registra uma operação pelo token do cliente. Retorna { first:true } se esta
 * é a primeira execução; { first:false } se já foi executada antes — assim um
 * duplo clique ou reenvio de rede NÃO baixa/ soma duas vezes.
 */
async function claimOperation(token, meta = {}) {
  if (!token) return { first: true }; // sem token: segue sem proteção explícita
  try {
    await db.writeJSON(`ops/${token}.json`, { token, at: new Date().toISOString(), ...meta }, { createOnly: true });
    return { first: true };
  } catch (err) {
    if (err instanceof db.StoreConflictError || /already exists|precondition/i.test(String(err && err.message))) {
      return { first: false };
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Configurações                                                       */
/* ------------------------------------------------------------------ */

async function getSettings() {
  const { data } = await db.readJSON('settings.json');
  return data;
}

async function mutateSettings(fn) {
  return db.mutateJSON('settings.json', fn);
}

/* ------------------------------------------------------------------ */
/* Migração v1 → v2 (idempotente)                                      */
/* ------------------------------------------------------------------ */

async function getMigrationState() {
  const { data } = await db.readJSON('migration.json');
  return data;
}

async function setMigrationState(state) {
  return db.writeJSON('migration.json', state);
}

module.exports = {
  getProduct, listProducts, saveProduct, mutateProduct,
  readIndex, writeIndex, claimSku, isSkuTaken, setStoreKey, getProductByStoreKey,
  appendMovements, listMovements,
  getSupplier, listSuppliers, saveSupplier, deleteSupplier,
  getOrder, saveOrder, mutateOrder, listOrders,
  getSession, saveSession, deleteSession,
  claimOperation,
  getSettings, mutateSettings,
  getMigrationState, setMigrationState,
  SKIP,
};
