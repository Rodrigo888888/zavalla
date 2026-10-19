/**
 * ZAVALLA — autenticação do painel administrativo (lado servidor).
 *
 * - Usuário e senha vêm SEMPRE de variáveis de ambiente do Vercel
 *   (ZAVALA_ADMIN_USER / ZAVALA_ADMIN_PASSWORD). Nada disso está no frontend.
 * - A senha nunca é comparada com == : usamos scrypt + comparação em tempo constante.
 * - A sessão é um token aleatório de 32 bytes; no servidor guardamos apenas o
 *   SHA-256 dele. Se o arquivo for vazado, o token não serve para nada.
 * - O cookie é HttpOnly (inacessível para JavaScript), Secure quando em HTTPS
 *   e SameSite=Lax.
 * - Há limite de tentativas de login por IP, com bloqueio temporário.
 */
const crypto = require('crypto');
const store = require('./repo'); // repositório v2 (sessões no mesmo formato)
const { HttpError, getCookie, clientIp } = require('./http');

const COOKIE_NAME = 'zavala_sess';
// Sessão longa (14 dias) por conveniência do lojista: continua HttpOnly,
// Secure e SameSite=Lax, e pode ser revogada no servidor a qualquer momento.
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const SESSION_TOUCH_MS = 30 * 60 * 1000; // renova no máximo a cada 30 min
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

// Contador de tentativas por instância da função (melhor esforço; a senha longa
// e a comparação em tempo constante são a proteção principal).
const attempts = new Map();

function rateKey(req) {
  return clientIp(req) || 'local';
}

function checkRate(req) {
  const key = rateKey(req);
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry) return;
  if (entry.lockUntil && entry.lockUntil > now) {
    const seconds = Math.ceil((entry.lockUntil - now) / 1000);
    throw new HttpError(429, `Muitas tentativas de acesso. Tente novamente em ${seconds}s.`, 'BLOQUEADO');
  }
  if (now - entry.first > WINDOW_MS) attempts.delete(key);
}

function registerFailure(req) {
  const key = rateKey(req);
  const now = Date.now();
  const entry = attempts.get(key) || { count: 0, first: now, lockUntil: 0 };
  if (now - entry.first > WINDOW_MS) {
    entry.count = 0;
    entry.first = now;
  }
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockUntil = now + LOCK_MS;
    entry.count = 0;
    entry.first = now;
  }
  attempts.set(key, entry);
}

function clearAttempts(req) {
  attempts.delete(rateKey(req));
}

function envCredentials() {
  const user = process.env.ZAVALA_ADMIN_USER;
  const pass = process.env.ZAVALA_ADMIN_PASSWORD;
  if (!user || !pass) {
    throw new HttpError(503, 'Área administrativa não configurada no servidor.', 'SEM_CONFIG');
  }
  return { user, pass };
}

const SALT = Buffer.from('zavala-admin-salt-v1');
function derive(password) {
  return crypto.scryptSync(String(password), SALT, 32, { N: 16384, r: 8, p: 1 });
}

/** Compara em tempo constante, sem vazar tamanho nem conteúdo. */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    // comparação dummy para manter o tempo constante
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

function verifyCredentials(user, password) {
  const expected = envCredentials();
  const userOk = safeEqual(
    crypto.createHash('sha256').update(String(user)).digest('hex'),
    crypto.createHash('sha256').update(expected.user).digest('hex')
  );
  const derivedUser = derive(String(password));
  const derivedExpected = derive(expected.pass);
  const passOk = safeEqual(derivedUser, derivedExpected);
  return userOk && passOk;
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function createSession(user) {
  const token = crypto.randomBytes(32).toString('base64url');
  const hash = sha256(token);
  const now = Date.now();
  await store.saveSession(hash, {
    user,
    createdAt: new Date(now).toISOString(),
    expiresAt: now + SESSION_TTL_MS,
    lastSeen: now,
  });
  return token;
}

async function destroySession(token) {
  if (!token) return;
  await store.deleteSession(sha256(token));
}

function sessionCookie(token, secure, maxAgeSeconds = SESSION_TTL_MS / 1000) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function clearCookie(secure) {
  return sessionCookie('', secure, 0);
}

function isHttps(req) {
  return (req.headers && req.headers['x-forwarded-proto']) === 'https';
}

/** Token da sessão atual: cookie (caminho normal) ou cabeçalho em memória. */
function sessionToken(req) {
  const cookieToken = getCookie(req, COOKIE_NAME);
  if (cookieToken) return cookieToken;
  // Rede de segurança para navegadores/WebView que descartam cookie: o painel
  // envia o token em memória no cabeçalho. Cabeçalho customizado só é possível
  // same-origin (sem risco de CSRF) e não fica gravado no dispositivo.
  const headerToken = String((req.headers && req.headers['x-zavala-session']) || '').trim();
  return /^[A-Za-z0-9_-]{20,200}$/.test(headerToken) ? headerToken : '';
}

/** Valida a sessão atual; lança 401 quando não há sessão válida. */
async function requireAdmin(req) {
  const token = sessionToken(req);
  if (!token) throw new HttpError(401, 'Sessão expirada. Entre novamente.', 'SEM_SESSAO');
  const hash = sha256(token);
  let session = await store.getSession(hash);
  if (!session) {
    // Uma repetição curta absorve eventual atraso de leitura logo após a
    // gravação da sessão — evita "sessão expirada" imediato pós-login.
    await new Promise((resolve) => setTimeout(resolve, 200));
    session = await store.getSession(hash);
  }
  if (!session) throw new HttpError(401, 'Sessão expirada. Entre novamente.', 'SEM_SESSAO');
  const now = Date.now();
  if (!session.expiresAt || session.expiresAt < now) {
    await store.deleteSession(hash);
    throw new HttpError(401, 'Sessão expirada. Entre novamente.', 'SEM_SESSAO');
  }
  // Renovação deslizante (evita gravar a cada requisição)
  if (!session.lastSeen || now - session.lastSeen > SESSION_TOUCH_MS) {
    session.lastSeen = now;
    session.expiresAt = now + SESSION_TTL_MS;
    try {
      await store.saveSession(hash, session);
    } catch (e) { /* melhor esforço */ }
  }
  return { user: session.user, tokenHash: hash };
}

async function login(req, user, password) {
  checkRate(req);
  let ok = false;
  try {
    ok = verifyCredentials(user, password);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    ok = false;
  }
  if (!ok) {
    registerFailure(req);
    throw new HttpError(401, 'Usuário ou senha incorretos.', 'CREDENCIAIS');
  }
  clearAttempts(req);
  return createSession(user);
}

module.exports = {
  COOKIE_NAME,
  login,
  requireAdmin,
  createSession,
  destroySession,
  sessionCookie,
  clearCookie,
  isHttps,
};
