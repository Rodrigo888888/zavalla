/**
 * Suíte de testes do controle de estoque ZAVALLA (v2).
 * Roda contra o servidor local de teste (test/server.js) com o banco em disco.
 *
 *   node --test test/api.test.js
 *
 * Cobre os cenários obrigatórios: login, cadastro/edição, SKU duplicado,
 * entradas/saídas, saldo negativo bloqueado, idempotência, alertas,
 * persistência, pedido da loja com baixa única, cancelamento/devolução,
 * inventário, relatórios CSV, fornecedores e configurações.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = 8099;
const BASE = `http://localhost:${PORT}`;
let proc = null;
let cookie = '';
let token = '';

async function api(method, urlPath, body, { auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers['X-Zavala-Session'] = token;
  if (auth && cookie) headers['Cookie'] = cookie;
  const res = await fetch(BASE + urlPath, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

before(async () => {
  // limpa o "banco" local e o estado de login
  const mock = require('./mock-blob');
  mock.reset();
  proc = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(PORT), ZAVALA_ADMIN_USER: 'admin', ZAVALA_ADMIN_PASSWORD: 'teste-12345' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
  // aguarda o servidor subir
  for (let i = 0; i < 60; i++) {
    try { await fetch(BASE + '/api/catalog'); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
});

after(() => { if (proc) proc.kill(); });

/* ------------------------------------------------------------------ */
test('1. autenticação: bloqueia acesso não autorizado e permite login', async () => {
  const semSessao = await api('GET', '/api/admin/overview', null, { auth: false });
  assert.equal(semSessao.status, 401);

  const errado = await api('POST', '/api/auth/login', { user: 'admin', password: 'errada' }, { auth: false });
  assert.equal(errado.status, 401);

  const ok = await api('POST', '/api/auth/login', { user: 'admin', password: 'teste-12345' }, { auth: false });
  assert.equal(ok.status, 200);
  assert.ok(ok.data.token, 'login devolve token');
  token = ok.data.token;

  const me = await api('GET', '/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user, 'admin');
});

/* ------------------------------------------------------------------ */
let produtoId = null;
let produtoSku = null;

test('2. cadastro de produto com validação e SKU único', async () => {
  const novo = await api('POST', '/api/admin/products', {
    name: 'Yara Eau de Parfum', sku: 'YARA-100', category: 'perfumes', type: 'perfume',
    brand: 'Lattafa', size: '100ml', costBRL: 89.9, priceBRL: 199.9,
    minStock: 3, location: 'A-01', initialStock: 10,
  });
  assert.equal(novo.status, 201, JSON.stringify(novo.data));
  assert.equal(novo.data.product.stock, 10, 'estoque inicial lançado');
  assert.equal(novo.data.product.stockControl, true, 'controle ativado pelo estoque inicial');
  produtoId = novo.data.product.id;
  produtoSku = novo.data.product.sku;

  // movimentação de cadastro registrada
  assert.ok(novo.data.movement, 'cadastro gera movimentação');
  assert.equal(novo.data.movement.type, 'cadastro');
  assert.equal(novo.data.movement.before, 0);
  assert.equal(novo.data.movement.after, 10);

  // SKU duplicado é recusado
  const dup = await api('POST', '/api/admin/products', {
    name: 'Outro produto', sku: 'YARA-100', category: 'perfumes',
    costBRL: 10, priceBRL: 20,
  });
  assert.equal(dup.status, 400);
  assert.ok(dup.data.fields && dup.data.fields.sku, 'erro aponta o campo SKU');

  // validação de campos obrigatórios
  const invalido = await api('POST', '/api/admin/products', { name: '', sku: '', category: 'xxx', priceBRL: 0, costBRL: -5 });
  assert.equal(invalido.status, 400);
  assert.ok(invalido.data.fields.name && invalido.data.fields.priceBRL, 'erros por campo');
});

/* ------------------------------------------------------------------ */
test('3. edição de produto preserva saldo e registra ajuste', async () => {
  const antes = await api('GET', `/api/admin/products/${produtoId}`);
  assert.equal(antes.data.product.stock, 10);

  const edit = await api('PUT', `/api/admin/products/${produtoId}`, {
    name: 'Yara Eau de Parfum 100ml', priceBRL: 219.9, quantity: 12,
  });
  assert.equal(edit.status, 200, JSON.stringify(edit.data));
  assert.equal(edit.data.product.name, 'Yara Eau de Parfum 100ml');
  assert.equal(edit.data.product.stock, 12, 'quantidade editada vira movimentação');
  assert.equal(edit.data.movement.type, 'ajuste');
  assert.equal(edit.data.movement.before, 10);
  assert.equal(edit.data.movement.after, 12);
});

/* ------------------------------------------------------------------ */
test('4. entrada e saída de mercadoria com histórico', async () => {
  const entrada = await api('POST', '/api/admin/stock', {
    productId: produtoId, type: 'entrada', qty: 5, reason: 'Compra do fornecedor X', opToken: 'op-entrada-1',
  });
  assert.equal(entrada.status, 201, JSON.stringify(entrada.data));
  assert.equal(entrada.data.product.stock, 17);
  assert.equal(entrada.data.movement.before, 12);
  assert.equal(entrada.data.movement.after, 17);
  assert.equal(entrada.data.movement.user, 'admin');

  const saida = await api('POST', '/api/admin/stock', {
    productId: produtoId, type: 'saida', qty: 2, reason: 'Venda balcão', opToken: 'op-saida-1',
  });
  assert.equal(saida.status, 201);
  assert.equal(saida.data.product.stock, 15);

  // histórico consultável e imutável
  const movs = await api('GET', `/api/admin/movements?product=${produtoId}`);
  assert.ok(movs.data.movements.length >= 3, 'histórico acumula movimentações');
});

/* ------------------------------------------------------------------ */
test('5. bloqueia saldo negativo e operação duplicada', async () => {
  const negativo = await api('POST', '/api/admin/stock', {
    productId: produtoId, type: 'saida', qty: 9999,
  });
  assert.equal(negativo.status, 409);
  assert.equal(negativo.data.code, 'SEM_ESTOQUE');

  // reenvio da MESMA operação (token repetido) não conta duas vezes
  const repetida = await api('POST', '/api/admin/stock', {
    productId: produtoId, type: 'entrada', qty: 5, opToken: 'op-entrada-1',
  });
  assert.equal(repetida.status, 200);
  assert.equal(repetida.data.duplicate, true, 'duplicata detectada');
  assert.equal(repetida.data.product.stock, 15, 'saldo inalterado pela duplicata');
});

/* ------------------------------------------------------------------ */
test('6. persistência: dados sobrevivem a nova consulta', async () => {
  const lista = await api('GET', '/api/admin/products?search=yara');
  assert.equal(lista.status, 200);
  assert.ok(lista.data.products.some((p) => p.id === produtoId), 'produto encontrado por busca');

  const filtro = await api('GET', '/api/admin/products?category=perfumes');
  assert.ok(filtro.data.products.every((p) => p.category === 'perfumes'));

  const overview = await api('GET', '/api/admin/overview');
  assert.equal(overview.status, 200);
  assert.ok(overview.data.kpis.totalProducts >= 1);
  assert.equal(typeof overview.data.kpis.totalCostBRL, 'number', 'valor estimado calculado com custo');
});

/* ------------------------------------------------------------------ */
test('7. alertas de estoque baixo e sem estoque', async () => {
  // zera outro produto para forçar alerta
  const p2 = await api('POST', '/api/admin/products', {
    name: 'Anel Prata Coração', sku: 'ANEL-CORACAO', category: 'joias', type: 'joia',
    costBRL: 40, priceBRL: 120, minStock: 2, initialStock: 2,
  });
  assert.equal(p2.status, 201);

  const alerts = await api('GET', '/api/admin/alerts');
  assert.equal(alerts.status, 200);
  const baixo = alerts.data.alerts.find((a) => a.sku === 'ANEL-CORACAO' && a.kind === 'estoque-baixo');
  assert.ok(baixo, 'alerta de estoque baixo aparece');

  const zera = await api('POST', '/api/admin/stock', { productId: p2.data.product.id, type: 'saida', qty: 2 });
  assert.equal(zera.status, 201);
  const alerts2 = await api('GET', '/api/admin/alerts');
  const semEstoque = alerts2.data.alerts.find((a) => a.sku === 'ANEL-CORACAO' && a.kind === 'sem-estoque');
  assert.ok(semEstoque, 'alerta de sem estoque aparece');
});

/* ------------------------------------------------------------------ */
test('8. loja: catálogo, pedido com baixa única e cancelamento', async () => {
  const cat = await api('GET', '/api/catalog', null, { auth: false });
  assert.equal(cat.status, 200);
  const pub = cat.data.products.find((p) => p.key === 'yara-100' || p.name.includes('Yara'));
  assert.ok(pub, 'produto aparece no catálogo público');
  assert.equal(pub.controlled, true);
  assert.equal(pub.stock, 15);

  const saldoAntes = pub.stock;
  const pedido = await api('POST', '/api/orders', {
    items: [{ key: pub.key, qty: 3 }], customer: { name: 'Maria', phone: '61900000000' },
  }, { auth: false });
  assert.equal(pedido.status, 201, JSON.stringify(pedido.data));
  assert.ok(pedido.data.order.id.startsWith('ZV-'));
  assert.ok(pedido.data.cancelToken);

  const catDepois = await api('GET', '/api/catalog', null, { auth: false });
  const pubDepois = catDepois.data.products.find((p) => p.key === pub.key);
  assert.equal(pubDepois.stock, saldoAntes - 3, 'pedido baixou o estoque UMA vez');

  // token errado é recusado
  const cancelErrado = await api('POST', '/api/order-cancel', { orderId: pedido.data.order.id, cancelToken: 'errado' }, { auth: false });
  assert.equal(cancelErrado.status, 403);

  // cancelamento devolve as unidades (idempotente)
  const cancel = await api('POST', '/api/order-cancel', { orderId: pedido.data.order.id, cancelToken: pedido.data.cancelToken }, { auth: false });
  assert.equal(cancel.status, 200);
  const catVolta = await api('GET', '/api/catalog', null, { auth: false });
  assert.equal(catVolta.data.products.find((p) => p.key === pub.key).stock, saldoAntes, 'cancelamento devolveu as unidades');

  const cancel2 = await api('POST', '/api/order-cancel', { orderId: pedido.data.order.id, cancelToken: pedido.data.cancelToken }, { auth: false });
  assert.equal(cancel2.status, 200);
  assert.equal(cancel2.data.alreadyDone, true, 'cancelamento é idempotente');
  const catFinal = await api('GET', '/api/catalog', null, { auth: false });
  assert.equal(catFinal.data.products.find((p) => p.key === pub.key).stock, saldoAntes, 'segundo cancelamento não devolve de novo');
});

/* ------------------------------------------------------------------ */
test('9. pedido do painel: confirmar e devolver item', async () => {
  const pub = (await api('GET', '/api/catalog', null, { auth: false })).data.products.find((p) => p.name.includes('Yara'));
  const saldoAntes = pub.stock;
  const pedido = await api('POST', '/api/orders', { items: [{ key: pub.key, qty: 2 }], customer: { name: 'João' } }, { auth: false });
  assert.equal(pedido.status, 201);

  const confirmar = await api('POST', '/api/admin/orders', { action: 'confirmar', orderId: pedido.data.order.id });
  assert.equal(confirmar.status, 200);
  assert.equal(confirmar.data.order.status, 'confirmada');

  // pedido confirmado não pode ser cancelado (estorno manual)
  const cancelar = await api('POST', '/api/admin/orders', { action: 'cancelar', orderId: pedido.data.order.id });
  assert.equal(cancelar.status, 409);

  // devolução parcial de um pedido confirmado
  const devolver = await api('POST', '/api/admin/orders', { action: 'devolver', orderId: pedido.data.order.id, itemIndex: 0, qty: 1 });
  assert.equal(devolver.status, 200, JSON.stringify(devolver.data));
  const cat = await api('GET', '/api/catalog', null, { auth: false });
  const agora = cat.data.products.find((p) => p.name.includes('Yara')).stock;
  assert.equal(agora, saldoAntes - 2 + 1, 'devolução parcial devolveu 1 unidade');
});

/* ------------------------------------------------------------------ */
test('10. inventário físico registra diferença com justificativa', async () => {
  const produto = (await api('GET', `/api/admin/products/${produtoId}`)).data.product;

  const semJustificativa = await api('POST', '/api/admin/inventory', { productId: produtoId, counted: produto.stock - 1, justification: '' });
  assert.equal(semJustificativa.status, 400, 'exige justificativa');

  const ajuste = await api('POST', '/api/admin/inventory', { productId: produtoId, counted: produto.stock - 1, justification: 'Contagem cíclica -1 não localizado' });
  assert.equal(ajuste.status, 200, JSON.stringify(ajuste.data));
  assert.equal(ajuste.data.diff, -1);
  assert.equal(ajuste.data.movement.type, 'inventario');

  // após o ajuste, o saldo do sistema passa a ser produto.stock - 1:
  // contar esse valor não gera nova movimentação
  const confere = await api('POST', '/api/admin/inventory', { productId: produtoId, counted: produto.stock - 1, justification: 'Conferido' });
  assert.equal(confere.data.unchanged, true, 'contagem igual não gera movimentação');
});

/* ------------------------------------------------------------------ */
test('11. fornecedores e vínculo com produto', async () => {
  const forn = await api('POST', '/api/admin/suppliers', { name: 'Distribuidora DF', contact: 'Carlos', phone: '61911112222', email: 'carlos@distdf.com.br' });
  assert.equal(forn.status, 201);

  const invalido = await api('POST', '/api/admin/suppliers', { name: 'X', email: 'nao-e-email' });
  assert.equal(invalido.status, 400);

  const vinculo = await api('PUT', `/api/admin/products/${produtoId}`, { supplierId: forn.data.supplier.id });
  assert.equal(vinculo.status, 200);
  assert.equal(vinculo.data.product.supplierId, forn.data.supplier.id);

  const inativar = await api('DELETE', `/api/admin/suppliers/${forn.data.supplier.id}`);
  assert.equal(inativar.status, 200);
  assert.equal(inativar.data.supplier.status, 'inativo');
});

/* ------------------------------------------------------------------ */
test('12. relatórios e configurações', async () => {
  const posicao = await api('GET', '/api/admin/reports?report=posicao');
  assert.equal(posicao.status, 200);
  assert.ok(posicao.data.rows.length >= 2);

  const csvRes = await fetch(`${BASE}/api/admin/reports?report=movimentacoes&format=csv`, { headers: { 'X-Zavala-Session': token } });
  assert.equal(csvRes.status, 200);
  assert.match(csvRes.headers.get('content-type'), /text\/csv/);
  const csv = await csvRes.text();
  assert.ok(csv.includes('Produto') && csv.includes('Tipo'), 'CSV com cabeçalho');

  const settings = await api('PUT', '/api/admin/settings', { lowStockDefault: 5, staleOrderHours: 24 });
  assert.equal(settings.status, 200);
  assert.equal(settings.data.settings.lowStockDefault, 5);
  const lido = await api('GET', '/api/admin/settings');
  assert.equal(lido.data.settings.lowStockDefault, 5, 'configuração persiste');
});

/* ------------------------------------------------------------------ */
test('13. arquivamento de produto preserva histórico', async () => {
  const p = await api('POST', '/api/admin/products', {
    name: 'Produto Teste Arquivo', sku: 'ARQ-1', category: 'outros', costBRL: 1, priceBRL: 2, initialStock: 1,
  });
  assert.equal(p.status, 201);

  const del = await api('DELETE', `/api/admin/products/${p.data.product.id}`);
  assert.equal(del.status, 200);
  assert.equal(del.data.product.status, 'inativo');

  // continua consultável com histórico intacto
  const movs = await api('GET', `/api/admin/movements?product=${p.data.product.id}`);
  assert.ok(movs.data.movements.length >= 1, 'movimentações preservadas após arquivar');

  // inativo não pode receber entradas (só ajuste)
  const entrada = await api('POST', '/api/admin/stock', { productId: p.data.product.id, type: 'entrada', qty: 5 });
  assert.equal(entrada.status, 409);
});
