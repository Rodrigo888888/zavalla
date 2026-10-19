/**
 * ZAVALLA — camada de dados (Vercel Blob privado).
 *
 * Persistência real (não é localStorage nem arquivo temporário) com controle
 * otimista de concorrência: cada escrita usa o ETag do blob (compare-and-swap),
 * então duas requisições simultâneas nunca sobrescrevem o estoque uma da outra.
 * Se houver conflito, a operação é relida e refeita — e se o estoque acabou no
 * meio tempo, a venda é recusada em vez de deixar o saldo negativo.
 */
const { get, put, del, list, BlobPreconditionFailedError } = require('@vercel/blob');

const PREFIX = 'zavala/';
const MAX_RETRIES = 10;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const retryDelay = (attempt) => 20 + Math.random() * Math.min(300, 45 * (attempt + 1));

class StoreConflictError extends Error {
  constructor(message = 'Não foi possível concluir: muitas alterações ao mesmo tempo. Tente novamente.') {
    super(message);
    this.name = 'StoreConflictError';
  }
}

class NotFoundError extends Error {
  constructor(message = 'Registro não encontrado.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** Símbolo que a função de mutação usa para dizer "nada a gravar". */
const SKIP = Symbol('skip');

async function streamToString(stream) {
  if (stream == null) return '';
  if (typeof stream === 'string') return stream;
  if (typeof stream.getReader === 'function') return await new Response(stream).text();
  if (typeof stream.pipe === 'function') {
    const { Readable } = require('stream');
    return await new Response(Readable.toWeb(stream)).text();
  }
  return String(stream);
}

/** Lê um documento JSON privado. `useCache:false` garante sempre o valor atual. */
async function readJSON(pathname) {
  let res;
  try {
    res = await get(pathname, { access: 'private', useCache: false });
  } catch (err) {
    if (err && err.name === 'BlobNotFoundError') return { data: null, etag: null };
    throw err;
  }
  if (!res) return { data: null, etag: null };
  const text = await streamToString(res.stream);
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch (err) { data = null; }
  }
  return { data, etag: (res.blob && res.blob.etag) || null };
}

/**
 * Grava um documento.
 * - `etag`  → grava apenas se ninguém mexeu desde a leitura (CAS).
 * - `createOnly` → grava apenas se o documento ainda não existir.
 */
async function writeJSON(pathname, data, opts = {}) {
  const { etag = null, createOnly = false } = opts;
  const options = {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: !createOnly,
    contentType: 'application/json',
    cacheControlMaxAge: 0,
  };
  if (etag) options.ifMatch = etag;
  return put(pathname, JSON.stringify(data), options);
}

function isConflict(err) {
  if (!err) return false;
  const message = String(err.message || '');
  return (
    err instanceof BlobPreconditionFailedError ||
    err instanceof StoreConflictError ||
    err.name === 'BlobPreconditionFailedError' ||
    err.name === 'BlobAccessError' ||
    /already exists/i.test(message) ||
    /precondition failed/i.test(message) ||
    /etag mismatch/i.test(message) ||
    /conflicting operation/i.test(message) ||
    /conditional request cannot succeed/i.test(message)
  );
}

/**
 * Lê → transforma → grava com verificação de versão. Repete em caso de conflito.
 * `fn(dadosAtuais)` devolve o novo documento, `SKIP` para não gravar, ou lança erro.
 */
async function mutateJSON(pathname, fn, retries = MAX_RETRIES) {
  let lastErr = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    const { data, etag } = await readJSON(pathname);
    let next;
    try {
      next = await fn(data);
    } catch (err) {
      if (isConflict(err)) throw err;
      throw err;
    }
    if (next === SKIP) return data;
    try {
      await writeJSON(pathname, next, etag ? { etag } : { createOnly: true });
      return next;
    } catch (err) {
      lastErr = err;
      if (!isConflict(err)) throw err;
      await sleep(retryDelay(attempt));
    }
  }
  throw new StoreConflictError();
}

async function removeJSON(pathname, etag) {
  const opts = {};
  if (etag) opts.ifMatch = etag;
  try {
    await del(pathname, opts);
  } catch (err) {
    if (err && err.name === 'BlobNotFoundError') return;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Produtos — um blob por produto (concorrência baixa, escrita atômica por item)
// ---------------------------------------------------------------------------
const productPath = (key) => `${PREFIX}products/${encodeURIComponent(key)}.json`;

async function getProduct(key) {
  if (!key) return null;
  return (await readJSON(productPath(key))).data;
}

async function listProducts() {
  const { blobs } = await list({ prefix: `${PREFIX}products/`, limit: 1000 });
  const docs = await Promise.all(blobs.map(async (b) => (await readJSON(b.pathname)).data));
  return docs.filter(Boolean).sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));
}

async function saveProduct(doc) {
  await writeJSON(productPath(doc.key), doc);
}

async function deleteProduct(key) {
  await removeJSON(productPath(key));
}

/** Mutação atômica sobre um produto (usada para baixar/estornar estoque). */
async function mutateProduct(key, fn) {
  return mutateJSON(productPath(key), fn);
}

// ---------------------------------------------------------------------------
// Movimentações — um blob POR MOVIMENTAÇÃO (não um arquivo por dia).
// Registrar entrada/saída nunca disputa escrita com outra requisição, então
// compras simultâneas não geram conflito nem perdem histórico.
// ---------------------------------------------------------------------------
const movementsPath = (day, id) => `${PREFIX}movements/${day}/${id}.json`;

async function logMovement(entry) {
  const day = new Date().toISOString().slice(0, 10);
  let id = String(entry.id || (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)));
  for (let attempt = 0; attempt < 8; attempt++) {
    const doc = Object.assign({}, entry, { id });
    try {
      await writeJSON(movementsPath(day, id), doc, { createOnly: true });
      return doc;
    } catch (err) {
      if (/already exists/i.test(String((err && err.message) || ''))) {
        // Colisão de id (raríssimo): sorteia outro e tenta de novo.
        id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
        continue;
      }
      if (isConflict(err)) {
        await sleep(retryDelay(attempt));
        continue;
      }
      // O histórico nunca pode derrubar uma venda já concluída.
      console.error('[zavala-store] falha ao registrar movimentação:', err);
      return null;
    }
  }
  return null;
}

async function listMovements(limit = 200, filter = {}) {
  const { blobs } = await list({ prefix: `${PREFIX}movements/`, limit: 1000 });
  const paths = blobs
    .map((b) => b.pathname)
    .filter((p) => p.endsWith('.json'))
    .sort()
    .reverse();

  // Lê em paralelo apenas os registros mais recentes.
  const recent = paths.slice(0, Math.max(limit * 3, 300));
  const docs = await Promise.all(recent.map(async (p) => (await readJSON(p)).data));

  let out = [];
  for (const doc of docs) {
    if (Array.isArray(doc)) out = out.concat(doc); // formato antigo: arquivo por dia
    else if (doc && doc.at) out.push(doc); // formato atual: um blob por movimento
  }
  out.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  if (filter.productKey) out = out.filter((m) => m.productKey === filter.productKey);
  if (filter.type) out = out.filter((m) => m.type === filter.type);
  return out.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Pedidos — um blob por pedido
// ---------------------------------------------------------------------------
const orderPath = (id) => `${PREFIX}orders/${encodeURIComponent(id)}.json`;

async function getOrder(id) {
  if (!id) return null;
  return (await readJSON(orderPath(id))).data;
}

async function saveOrder(doc, opts = {}) {
  await writeJSON(orderPath(doc.id), doc, opts);
}

async function mutateOrder(id, fn) {
  return mutateJSON(orderPath(id), fn);
}

async function listOrders(limit = 200) {
  const { blobs } = await list({ prefix: `${PREFIX}orders/`, limit: 1000 });
  const docs = await Promise.all(blobs.map(async (b) => (await readJSON(b.pathname)).data));
  return docs
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Sessões do administrador — um blob por sessão (token guardado só como hash)
// ---------------------------------------------------------------------------
const sessionPath = (hash) => `${PREFIX}sessions/${hash}.json`;

async function getSession(hash) {
  if (!hash) return null;
  return (await readJSON(sessionPath(hash))).data;
}

async function saveSession(hash, doc) {
  await writeJSON(sessionPath(hash), doc);
}

async function deleteSession(hash) {
  await removeJSON(sessionPath(hash));
}

module.exports = {
  PREFIX,
  SKIP,
  StoreConflictError,
  NotFoundError,
  readJSON,
  writeJSON,
  mutateJSON,
  removeJSON,
  getProduct,
  listProducts,
  saveProduct,
  deleteProduct,
  mutateProduct,
  logMovement,
  listMovements,
  getOrder,
  saveOrder,
  mutateOrder,
  listOrders,
  getSession,
  saveSession,
  deleteSession,
};
