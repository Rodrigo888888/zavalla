/**
 * ZAVALLA — utilitários HTTP das funções de servidor.
 * Sem framework: apenas Node puro, como o restante do projeto.
 */

class HttpError extends Error {
  constructor(status, message, code = 'ERRO') {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

const BASE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};

function send(res, status, payload, extraHeaders = {}) {
  res.statusCode = status;
  const headers = Object.assign({}, BASE_HEADERS, extraHeaders);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(payload));
}

// Erros do Vercel Blob que indicam BANCO FORA DO AR (suspenso, bloqueado ou
// com falha de rede) — diferentes de conflito de escrita (CAS), que é outro caso.
const BANCO_FORA_RE =
  /store has been suspended|failed to fetch blob|fetch failed|econnreset|etimedout|econnrefused|socket hang up|network error|too many requests|rate limit/i;

function isBancoFora(err) {
  const name = String((err && err.name) || '');
  if (/Precondition|Conflict/i.test(name)) return false; // disputa de escrita, não indisponibilidade
  return BANCO_FORA_RE.test(String((err && err.message) || ''));
}

function sendError(res, err) {
  // Erros de validação do modelo: 400 com o mapa de campos para o formulário
  // destacar exatamente o que precisa ser corrigido.
  if (err && err.name === 'ValidationError') {
    send(res, 400, { ok: false, error: 'Confira os campos destacados.', code: 'VALIDACAO', fields: err.fields || {} });
    return;
  }

  // Regras de estoque (saldo insuficiente, produto inativo, pedido inválido…):
  // 409 quando é disputa de estado, 400 para requisição inválida.
  if (err && err.name === 'StockError') {
    const status = /SEM_ESTOQUE|JA_CONFIRMADO|CONFLITO|INATIVO/.test(err.code || '') ? 409 : 400;
    send(res, status, { ok: false, error: err.message, code: err.code || 'ESTOQUE' });
    return;
  }

  const status = err instanceof HttpError ? err.status : err.name === 'StoreConflictError' ? 409 : err.name === 'NotFoundStoreError' ? 404 : 500;

  // Banco de dados indisponível: responde 503 com mensagem objetiva, sem
  // misturar com "senha incorreta" (401) nem com erro interno genérico (500).
  if (status === 500 && isBancoFora(err)) {
    console.error('[zavala-api] banco indisponível:', err.name, err.message);
    send(res, 503, {
      ok: false,
      error: 'O banco de dados do site está indisponível no momento. Tente novamente em instantes.',
      code: 'BANCO_INDISPONIVEL',
    });
    return;
  }

  const message =
    err instanceof HttpError
      ? err.message
      : err.name === 'StoreConflictError'
      ? err.message
      : err.name === 'NotFoundError'
      ? err.message
      : 'Erro interno. Tente novamente em instantes.';
  // Erros internos são registrados no servidor SEMPRE (inclusive em produção),
  // sem vazar detalhes ao cliente — assim dá para diagnosticar de verdade.
  if (status >= 500) console.error('[zavala-api] erro interno:', err && err.name, err && err.message, err && err.stack);
  send(res, status, { ok: false, error: message, code: err.code || err.name || 'ERRO' });
}

/** Lê o corpo JSON com limite de tamanho (proteção básica). */
function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'Corpo da requisição muito grande.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new HttpError(400, 'JSON inválido no corpo da requisição.'));
      }
    });
    req.on('error', () => reject(new HttpError(400, 'Falha ao ler a requisição.')));
  });
}

function getCookie(req, name) {
  const header = req.headers && req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

function clientIp(req) {
  const fwd = req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip']);
  if (fwd) return String(fwd).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'desconhecido';
}

/**
 * Proteção anti-CSRF simples para endpoints públicos que alteram estado:
 * se o navegador envia Origin, ele precisa bater com o host do pedido.
 */
function assertSameOrigin(req) {
  const origin = req.headers && req.headers.origin;
  if (!origin) return; // requisições sem Origin (curl, apps nativas) seguem adiante
  const host = (req.headers.host || '').split(':')[0];
  let originHost = '';
  try {
    originHost = new URL(origin).hostname;
  } catch (e) {
    throw new HttpError(403, 'Origem inválida.', 'ORIGEM');
  }
  const same =
    originHost === host ||
    originHost.endsWith('.vercel.app') ||
    originHost === 'localhost' ||
    originHost === '127.0.0.1';
  if (!same) throw new HttpError(403, 'Origem não autorizada.', 'ORIGEM');
}

function requireMethod(req, method) {
  if (req.method !== method) throw new HttpError(405, 'Método não permitido.', 'METODO');
}

/** Sanitiza textos curtos vindos do cliente. */
function cleanText(value, max = 120) {
  if (value == null) return '';
  return String(value).replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
}

/** Chave de produto: letras, números, hífen e underscore. */
function cleanKey(value, max = 48) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, max);
}

function asInt(value, { min = -Infinity, max = Infinity, fallback = null } = {}) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

module.exports = {
  HttpError,
  send,
  sendError,
  readBody,
  getCookie,
  clientIp,
  assertSameOrigin,
  requireMethod,
  cleanText,
  cleanKey,
  asInt,
};
