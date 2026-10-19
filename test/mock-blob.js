/**
 * Mock local do SDK @vercel/blob para DESENVOLVIMENTO e TESTES.
 *
 * Persiste em disco (test/.blob/) com a mesma semântica usada pelo sistema:
 *   - escrita condicional por etag (ifMatch) → 412 quando outro escritor mexeu;
 *   - createOnly → falha se o arquivo já existe;
 *   - list com prefixo e paginação.
 *
 * NUNCA é usado em produção: o adaptador real (@vercel/blob) só é substituído
 * quando o servidor de teste injeta este módulo no require (test/server.js).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '.blob');
fs.mkdirSync(ROOT, { recursive: true });

function fileOf(pathname) {
  return path.join(ROOT, pathname.replace(/\//g, path.sep));
}

function etagOf(pathname) {
  const f = fileOf(pathname);
  if (!fs.existsSync(f)) return null;
  const body = fs.readFileSync(f);
  return 'W/"' + crypto.createHash('sha1').update(body).digest('hex') + '"';
}

class BlobNotFoundError extends Error {
  constructor(msg) { super(msg || 'Blob not found'); this.name = 'BlobNotFoundError'; }
}
class BlobPreconditionFailedError extends Error {
  constructor(msg) { super(msg || 'Precondition failed'); this.name = 'BlobPreconditionFailedError'; }
}
class BlobAlreadyExistsError extends Error {
  constructor(msg) { super(msg || 'Blob already exists'); this.name = 'BlobAlreadyExistsError'; }
}

async function get(pathname) {
  const f = fileOf(pathname);
  if (!fs.existsSync(f)) throw new BlobNotFoundError(`No such blob: ${pathname}`);
  return { blob: fs.readFileSync(f, 'utf8'), etag: etagOf(pathname), pathname, size: fs.statSync(f).size };
}

async function put(pathname, body, opts = {}) {
  const f = fileOf(pathname);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const exists = fs.existsSync(f);

  if (opts.createOnly && exists) throw new BlobAlreadyExistsError(`Blob already exists: ${pathname}`);
  if (opts.allowOverwrite === false && exists) throw new BlobAlreadyExistsError(`Blob already exists: ${pathname}`);
  if (opts.ifMatch) {
    if (!exists) throw new BlobPreconditionFailedError('Blob disappeared');
    if (etagOf(pathname) !== opts.ifMatch) throw new BlobPreconditionFailedError('ETag mismatch');
  }

  fs.writeFileSync(f, String(body), 'utf8');
  return { url: 'mock://' + pathname, pathname, etag: etagOf(pathname), size: Buffer.byteLength(String(body)) };
}

async function del(pathname) {
  const f = fileOf(pathname);
  if (fs.existsSync(f)) fs.rmSync(f);
  return { url: 'mock://' + pathname, pathname };
}

async function list(opts = {}) {
  const prefix = opts.prefix || '';
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      const rel = path.relative(ROOT, full).split(path.sep).join('/');
      if (rel.startsWith(prefix)) out.push({ pathname: rel, size: fs.statSync(full).size, url: 'mock://' + rel });
    }
  };
  walk(ROOT);
  out.sort((a, b) => a.pathname.localeCompare(b.pathname));
  const limit = Math.min(1000, opts.limit || 1000);
  return { blobs: out.slice(0, limit), cursor: null };
}

function reset() {
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(ROOT, { recursive: true });
}

module.exports = { get, put, del, list, reset, BlobNotFoundError, BlobPreconditionFailedError, BlobAlreadyExistsError };
