/**
 * Servidor local de DESENVOLVIMENTO e TESTES do controle de estoque ZAVALLA.
 *
 * - Rota /api/* executa a MESMA função de produção (api/handler.js) com o
 *   mesmo roteador e as mesmas regras de negócio;
 * - o SDK @vercel/blob é substituído pelo mock em disco (test/mock-blob.js),
 *   porque a store real da Vercel está suspensa por faturamento (diagnóstico
 *   em chamado-vercel.txt). Em produção usa-se o SDK real — nada muda no código.
 *
 * Uso:  node test/server.js  →  http://localhost:8090
 */
const Module = require('module');
const path = require('path');
const fs = require('fs');
const http = require('http');

// injeta o mock do blob antes de qualquer require da API
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === '@vercel/blob') return path.join(__dirname, 'mock-blob.js');
  return origResolve.call(this, request, ...args);
};

// credenciais locais de teste (NUNCA em produção: lá vêm das env vars do Vercel)
if (!process.env.ZAVALA_ADMIN_USER) process.env.ZAVALA_ADMIN_USER = 'admin';
if (!process.env.ZAVALA_ADMIN_PASSWORD) process.env.ZAVALA_ADMIN_PASSWORD = 'teste-12345';

const ROOT = path.join(__dirname, '..');
const apiHandler = require(path.join(ROOT, 'api', 'handler.js'));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) {
      // mesma função de produção
      return await apiHandler(req, res);
    }

    let pathname = decodeURIComponent(req.url.split('?')[0]);
    if (pathname === '/') pathname = '/index.html';
    const file = path.join(ROOT, pathname);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('404');
      return;
    }
    res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch (err) {
    console.error('[test-server]', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'erro interno do servidor de teste' }));
  }
});

const PORT = Number(process.env.PORT) || 8090;
server.listen(PORT, () => {
  console.log(`Servidor de teste ZAVALLA: http://localhost:${PORT}`);
  console.log(`Painel: http://localhost:${PORT}/admin.html  (admin / teste-12345)`);
});
