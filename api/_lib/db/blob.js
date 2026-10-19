/**
 * ZAVALLA — adaptador de persistência (Vercel Blob privado).
 *
 * Camada nova da reconstrução do controle de estoque.
 * Responsabilidades:
 *   - leitura/escrita de documentos JSON com controle otimista de concorrência
 *     (compare-and-swap por ETag), para que duas operações simultâneas nunca
 *     sobrescrevam o saldo uma da outra;
 *   - retry com backoff aleatório em caso de conflito;
 *   - erros tipados para que a camada HTTP consiga responder com mensagens
 *     claras (conflito × banco indisponível × registro inexistente).
 *
 * Nada de localStorage/sessionStorage: persistência real no servidor.
 */
const { list, get, put, del } = require('@vercel/blob');

const PREFIX = 'zavalla/v2/';
const MAX_RETRIES = 10;

/** Falha de concorrência: outra operação gravou primeiro. */
class StoreConflictError extends Error {
  constructor(message) {
    super(message || 'Não foi possível concluir: o registro foi alterado por outra operação. Tente novamente.');
    this.name = 'StoreConflictError';
    this.code = 'CONFLITO';
  }
}

/** Registro inexistente. */
class NotFoundStoreError extends Error {
  constructor(message) {
    super(message || 'Registro não encontrado.');
    this.name = 'NotFoundStoreError';
    this.code = 'NAO_ENCONTRADO';
  }
}

/** Símbolo interno: a mutação não produziu nenhuma alteração (nada a gravar). */
const SKIP = Symbol('skip');

// Prefixo do sistema anterior (v1) — usado apenas pela migração e pela
// autenticação (sessões continuam no mesmo lugar para não deslogar ninguém).
const LEGACY_PREFIX = 'zavala/';

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * Detecta se o erro é de conflito de escrita (precondição/etag/já existente)
 * — diferente de falha de rede/banco.
 */
function isConflict(err) {
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  const status = err.statusCode || err.status || 0;
  return (
    status === 412 || status === 409 ||
    /precondition|if-match|etag|already exists|no overwrite|version mismatch/.test(msg)
  );
}

function pathnameOf(rel) { return PREFIX + rel.replace(/^\/+/, ''); }
function legacyPathnameOf(rel) { return LEGACY_PREFIX + rel.replace(/^\/+/, ''); }

/**
 * Lê um documento JSON.
 * Retorna { data, etag } — { data: null, etag: null } quando não existe.
 */
async function readJSON(rel) {
  let res;
  try {
    res = await get(pathnameOf(rel), { access: 'private', useCache: false });
  } catch (err) {
    const msg = String(err && err.message || '').toLowerCase();
    if (/not found|no such blob|404/.test(msg)) return { data: null, etag: null };
    throw err;
  }
  return parseDoc(res, rel);
}

/** Lê um documento do prefixo legado (v1) — usado pela migração/sessões. */
async function legacyReadJSON(rel) {
  let res;
  try {
    res = await get(legacyPathnameOf(rel), { access: 'private', useCache: false });
  } catch (err) {
    const msg = String(err && err.message || '').toLowerCase();
    if (/not found|no such blob|404/.test(msg)) return { data: null, etag: null };
    throw err;
  }
  return parseDoc(res, rel);
}

function parseDoc(res, rel) {
  const raw = res && (res.blob || res);
  if (raw == null) return { data: null, etag: (res && res.etag) || null };
  try {
    return { data: JSON.parse(String(raw)), etag: (res && res.etag) || null };
  } catch (e) {
    // Documento corrompido não pode derrubar o painel inteiro.
    console.error('[zavalla-db] documento inválido em', rel, e.message);
    return { data: null, etag: (res && res.etag) || null, corrupt: true };
  }
}

/**
 * Grava um documento JSON.
 *  - etag: gravação condicional (compare-and-swap). Se outro escritor mexeu, lança StoreConflictError.
 *  - createOnly: só grava se o registro ainda não existir (proteção contra duplicidade).
 */
async function writeJSON(rel, data, { etag = null, createOnly = false } = {}) {
  const body = JSON.stringify(data);
  const opts = {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: !createOnly,
    contentType: 'application/json',
    cacheControlMaxAge: 0,
  };
  if (etag) opts.ifMatch = etag;
  try {
    const res = await put(pathnameOf(rel), body, opts);
    return { etag: (res && res.etag) || null };
  } catch (err) {
    if (isConflict(err)) throw new StoreConflictError();
    throw err;
  }
}

/**
 * Lê → transforma → grava atomicamente (CAS). Repete com backoff até dar
 * certo ou estourar retries — assim duas baixas de estoque simultâneas
 * nunca se sobrescrevem.
 * A transformação pode retornar SKIP para sinalizar "nada a alterar".
 */
async function mutateJSON(rel, fn, retries = MAX_RETRIES) {
  let lastErr = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    const { data, etag } = await readJSON(rel);
    let next;
    try {
      next = await fn(data, etag);
    } catch (err) {
      if (err === SKIP) return SKIP;
      throw err;
    }
    if (next === SKIP) return SKIP;
    try {
      return await writeJSON(rel, next, { etag: etag || undefined });
    } catch (err) {
      if (err instanceof StoreConflictError) {
        lastErr = err;
        await delay(25 + Math.floor(Math.random() * 75) * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new StoreConflictError();
}

/** Remove um documento (ignora silenciosamente se já não existe). */
async function removeJSON(rel, { legacy = false } = {}) {
  try {
    await del(legacy ? legacyPathnameOf(rel) : pathnameOf(rel));
  } catch (err) {
    const msg = String(err && err.message || '').toLowerCase();
    if (!/not found|404|no such blob/.test(msg)) throw err;
  }
}

/** Grava um documento no prefixo legado (v1) — usado só por sessões. */
async function legacyWriteJSON(rel, data) {
  const res = await put(legacyPathnameOf(rel), JSON.stringify(data), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 0,
  });
  return { etag: (res && res.etag) || null };
}

/**
 * Lista documentos de um subcaminho (ex.: 'products/').
 * Retorna apenas os pathnames relativos (sem o PREFIX).
 */
async function listPaths(sub, { limit = 1000, legacy = false } = {}) {
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix: legacy ? legacyPathnameOf(sub) : pathnameOf(sub), limit: Math.min(limit, 1000), cursor, mode: 'expanded' });
    for (const b of page.blobs) out.push(b.pathname.slice(legacy ? LEGACY_PREFIX.length : PREFIX.length));
    cursor = page.cursor;
    if (out.length >= limit) break;
  } while (cursor);
  return out;
}

/** Lê vários documentos em paralelo (limitado), ignorando os que falharem. */
async function readMany(rels, { concurrency = 20, legacy = false } = {}) {
  const results = [];
  for (let i = 0; i < rels.length; i += concurrency) {
    const slice = rels.slice(i, i + concurrency);
    const got = await Promise.all(slice.map(async (rel) => {
      try {
        const r = legacy ? await legacyReadJSON(rel) : await readJSON(rel);
        return r.data ? { rel, data: r.data } : null;
      } catch (err) {
        console.error('[zavalla-db] falha ao ler', rel, err && err.message);
        return null;
      }
    }));
    for (const g of got) if (g) results.push(g);
  }
  return results;
}

module.exports = {
  PREFIX,
  LEGACY_PREFIX,
  SKIP,
  StoreConflictError,
  NotFoundStoreError,
  readJSON,
  writeJSON,
  mutateJSON,
  removeJSON,
  listPaths,
  readMany,
  isConflict,
  legacyReadJSON,
  legacyWriteJSON,
};
