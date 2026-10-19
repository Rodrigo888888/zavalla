/**
 * ZAVALLA — regras de negócio de estoque (v2).
 *
 * Princípios:
 *   - O saldo só muda por applyMovement(), com escrita condicional (CAS):
 *     duas operações simultâneas nunca se sobrescrevem.
 *   - Saldo nunca fica negativo — a operação é rejeitada com erro claro.
 *   - Cada movimentação é imutável e registra antes/depois, autor e motivo.
 *   - Nenhuma operação roda duas vezes: tokens de idempotência (claimOperation).
 *   - O histórico não se perde: movimentos pendentes ficam anexados ao produto
 *     até serem confirmados no log do dia (recuperação automática).
 */
const repo = require('./repo');
const db = require('./db/blob');
const { SKIP } = db;
const {
  MOVEMENT_TYPES, MOVEMENT_TYPE_LABELS, ValidationError,
  buildMovement, dayKey, nowISO, newOrderId, randomToken,
} = require('./model');

/* ------------------------------------------------------------------ */
/* Aplicação de uma movimentação (transação por produto)               */
/* ------------------------------------------------------------------ */

class StockError extends Error {
  constructor(message, code = 'ESTOQUE') {
    super(message);
    this.name = 'StockError';
    this.code = code;
  }
}

/**
 * Aplica uma movimentação de estoque de um produto.
 *
 * mode: 'delta' (soma/subtrai) ou 'set' (define o saldo — inventário/ajuste).
 * Retorna { product, movement } ou lança StockError/ValidationError.
 */
async function applyMovement(productOrId, {
  type, qty = 0, mode = 'delta', user, reason = null, orderId = null,
  origin = 'painel', opToken = null,
}) {
  if (!MOVEMENT_TYPES.includes(type)) throw new ValidationError({ type: 'Tipo de movimentação inválido.' });

  // Proteção anti-duplicidade: a mesma operação enviada duas vezes não conta 2x.
  if (opToken) {
    const claim = await repo.claimOperation(opToken, { productId: typeof productOrId === 'string' ? productOrId : productOrId.id, type });
    if (!claim.first) {
      const p = typeof productOrId === 'string' ? await repo.getProduct(productOrId) : productOrId;
      return { product: p, movement: null, duplicate: true };
    }
  }

  const id = typeof productOrId === 'string' ? productOrId : productOrId.id;
  if (!id) throw new ValidationError({ productId: 'Produto não informado.' });

  const qtyInt = Math.trunc(Number(qty));
  if (!Number.isFinite(qtyInt)) throw new ValidationError({ qty: 'Quantidade inválida.' });
  if (mode === 'delta' && qtyInt === 0) throw new ValidationError({ qty: 'Quantidade deve ser diferente de zero.' });
  if (mode === 'delta' && type === 'saida' && qtyInt < 0) throw new ValidationError({ qty: 'Quantidade de saída deve ser positiva.' });
  if (mode === 'delta' && type === 'entrada' && qtyInt < 0) throw new ValidationError({ qty: 'Quantidade de entrada deve ser positiva.' });

  let movement = null;
  let failure = null;

  const result = await repo.mutateProduct(id, (doc) => {
    if (!doc) { failure = new StockError('Produto não encontrado.', 'PRODUTO_NAO_ENCONTRADO'); return SKIP; }
    if (doc.status === 'inativo' && type !== 'ajuste') {
      failure = new StockError('Produto inativo: movimentação permitida apenas por ajuste.', 'INATIVO');
      return SKIP;
    }

    const before = Math.max(0, Math.trunc(Number(doc.stock) || 0));
    const rawAfter = mode === 'set'
      ? Math.max(0, qtyInt)
      : before + (type === 'saida' || type === 'perda' ? -Math.abs(qtyInt) : Math.abs(qtyInt));

    // saldo nunca fica negativo: rejeita ANTES de qualquer clamp
    if (mode !== 'set' && rawAfter < 0) {
      failure = new StockError(`Estoque insuficiente para "${doc.name}": disponível ${before}, solicitado ${Math.abs(qtyInt)}.`, 'SEM_ESTOQUE');
      return SKIP;
    }
    const after = Math.max(0, rawAfter);

    if (mode !== 'set' && type === 'saida' && before === 0) {
      failure = new StockError(`Sem estoque para "${doc.name}": saldo atual 0.`, 'SEM_ESTOQUE');
      return SKIP;
    }
    if (mode === 'set' && after === before) {
      // nada mudou: considera sem efeito
      failure = new StockError('O saldo informado já é o saldo atual do produto.', 'SEM_ALTERACAO');
      return SKIP;
    }

    const next = { ...doc, stock: after, stockControl: true, updatedAt: nowISO() };
    movement = buildMovement({
      product: { ...doc, __beforeStock: before, __afterStock: after },
      type,
      qty: mode === 'set' ? after - before : (type === 'saida' || type === 'perda' ? -Math.abs(qtyInt) : Math.abs(qtyInt)),
      user, reason, orderId, origin,
    });
    // histórico pendente: garante registro mesmo se o log do dia falhar
    next.pendingMovements = (Array.isArray(doc.pendingMovements) ? doc.pendingMovements : []).concat([movement]);
    return next;
  });

  if (failure) throw failure;
  if (result === SKIP && !movement) throw new StockError('Operação não concluída.', 'FALHA');

  // confirma o movimento no log do dia e limpa a pendência
  const flushed = await flushPending(id);
  const product = (flushed && flushed.product) || (await repo.getProduct(id));
  return { product, movement };
}

/** Anexa movimentações pendentes ao log do dia e as remove do produto. */
async function flushPending(id) {
  const doc = await repo.getProduct(id);
  if (!doc || !Array.isArray(doc.pendingMovements) || !doc.pendingMovements.length) return { product: doc };
  const pending = doc.pendingMovements.slice();
  await repo.appendMovements(dayKey(), pending); // imutável: só acrescenta
  const updated = await repo.mutateProduct(id, (cur) => {
    if (!cur) return SKIP;
    const rest = (cur.pendingMovements || []).filter((m) => !pending.some((p) => p.id === m.id));
    return { ...cur, pendingMovements: rest.length ? rest : undefined };
  });
  return { product: (updated && updated.product) || (await repo.getProduct(id)) };
}

/* ------------------------------------------------------------------ */
/* Pedidos da loja virtual                                             */
/* ------------------------------------------------------------------ */

/**
 * Registra um pedido: cria o documento (createOnly — nunca duplica) e baixa o
 * estoque item a item. Se qualquer baixa falhar, devolve tudo (rollback).
 */
async function createOrder({ items, customer = {} }) {
  const errors = [];
  const resolved = [];

  for (const item of items) {
    const product = await repo.getProductByStoreKey(String(item.key || ''));
    if (!product) { errors.push(`Produto "${item.key}" não encontrado na loja.`); continue; }
    if (product.status === 'inativo') { errors.push(`"${product.name}" está indisponível.`); continue; }
    const qty = Math.trunc(Number(item.qty) || 0);
    if (qty < 1 || qty > 99) { errors.push(`Quantidade inválida para "${product.name}".`); continue; }
    const available = Math.max(0, Math.trunc(Number(product.stock) || 0));
    if (product.stockControl && available < qty) {
      errors.push(`Estoque insuficiente para ${product.name}: disponível ${available} unidade(s), você pediu ${qty}.`);
      continue;
    }
    resolved.push({ product, qty, volume: item.volume || null });
  }

  if (errors.length) throw new StockError(errors.join(' '), 'PEDIDO_INVALIDO');
  if (!resolved.length) throw new StockError('Pedido sem itens válidos.', 'PEDIDO_INVALIDO');

  const order = {
    id: newOrderId(),
    cancelToken: randomToken(24),
    createdAt: nowISO(),
    status: 'pendente',
    items: resolved.map(({ product, qty, volume }) => ({
      key: product.storeKey || product.id, productId: product.id, name: product.name,
      volume, qty, unitPriceBRL: product.priceBRL, costBRL: product.costBRL,
    })),
    customer: {
      name: str(customer.name, 120), phone: str(customer.phone, 40), note: str(customer.note, 500),
    },
    totalBRL: Math.round(resolved.reduce((s, { product, qty }) => s + (Number(product.priceBRL) || 0) * qty, 0) * 100) / 100,
    history: [{ at: nowISO(), event: 'criado', user: 'loja' }],
  };

  // documento do pedido primeiro (createOnly): identidade única garantida
  await repo.saveOrder(order, { createOnly: true });

  const applied = [];
  try {
    for (const { product, qty } of resolved) {
      if (!product.stockControl) continue; // produto sem controle: compra segue sem baixa
      const { movement } = await applyMovement(product.id, {
        type: 'saida', qty, user: 'loja', orderId: order.id,
        origin: 'loja', reason: `Pedido ${order.id}`,
      });
      if (movement) applied.push({ productId: product.id, qty });
    }
  } catch (err) {
    // rollback total: devolve o que já foi baixado
    for (const { productId, qty } of applied) {
      try {
        await applyMovement(productId, {
          type: 'entrada', qty, user: 'loja', orderId: order.id, origin: 'loja',
          reason: `rollback: pedido ${order.id} não concluído`,
        });
      } catch (e) { console.error('[zavalla-stock] rollback falhou:', e && e.message); }
    }
    try {
      await repo.mutateOrder(order.id, (o) => (o ? { ...o, status: 'cancelada', rollback: true, history: (o.history || []).concat([{ at: nowISO(), event: 'rollback', user: 'sistema', reason: err.message }]) } : SKIP));
    } catch (e) { /* best effort */ }
    throw err;
  }

  // expira pedidos pendentes velhos (manutenção embutida)
  expireStaleOrders().catch(() => {});

  return order;
}

/** Cancela um pedido (idempotente) e devolve as unidades. */
async function cancelOrder(orderId, { by = 'cliente', reason = null } = {}) {
  const order = await repo.getOrder(orderId);
  if (!order) throw new StockError('Pedido não encontrado.', 'PEDIDO_NAO_ENCONTRADO');
  if (order.status === 'cancelada') return { order, alreadyDone: true };
  if (order.status === 'confirmada') {
    throw new StockError('Pedido já confirmado. Estorne pelo estoque manualmente, com justificativa.', 'JA_CONFIRMADO');
  }

  for (const item of order.items || []) {
    if (!item.productId) continue;
    const product = await repo.getProduct(item.productId);
    if (!product || !product.stockControl) continue; // nunca devolve o que não foi baixado
    await applyMovement(product.id, {
      type: 'entrada', qty: item.qty, user: by, orderId: order.id,
      origin: 'loja', reason: reason || `Cancelamento do pedido ${order.id}`,
    });
  }

  const updated = await repo.mutateOrder(order.id, (o) => {
    if (!o) return SKIP;
    if (o.status === 'cancelada') return SKIP;
    return { ...o, status: 'cancelada', history: (o.history || []).concat([{ at: nowISO(), event: 'cancelado', user: by, reason }]) };
  });

  const fresh = await repo.getOrder(orderId);
  return { order: fresh || (updated && updated.data) || order };
}

/** Confirma um pedido (a baixa já ocorreu na criação). */
async function confirmOrder(orderId, { by = 'painel' } = {}) {
  const order = await repo.getOrder(orderId);
  if (!order) throw new StockError('Pedido não encontrado.', 'PEDIDO_NAO_ENCONTRADO');
  if (order.status === 'confirmada') return { order, alreadyDone: true };
  if (order.status === 'cancelada') throw new StockError('Pedido cancelado: não é possível confirmar.', 'CANCELADO');

  await repo.mutateOrder(orderId, (o) => {
    if (!o || o.status === 'confirmada') return SKIP;
    return { ...o, status: 'confirmada', history: (o.history || []).concat([{ at: nowISO(), event: 'confirmado', user: by }]) };
  });
  return { order: await repo.getOrder(orderId) };
}

/** Devolve unidades de um pedido já cancelado/parcial (devolução de cliente). */
async function returnOrderItem(orderId, itemIndex, { by = 'painel', qty = null, reason = null } = {}) {
  const order = await repo.getOrder(orderId);
  if (!order) throw new StockError('Pedido não encontrado.', 'PEDIDO_NAO_ENCONTRADO');
  const item = (order.items || [])[itemIndex];
  if (!item) throw new ValidationError({ item: 'Item do pedido inexistente.' });
  const q = qty == null ? item.qty : Math.max(1, Math.min(item.qty, Math.trunc(Number(qty) || 0)));
  const product = await repo.getProduct(item.productId);
  if (!product) throw new StockError('Produto do pedido não existe mais.', 'PRODUTO_NAO_ENCONTRADO');

  const { movement } = await applyMovement(product.id, {
    type: 'entrada', qty: q, user: by, orderId, origin: 'loja',
    reason: reason || `Devolução do pedido ${orderId}`,
  });
  return { movement, product: await repo.getProduct(product.id) };
}

/** Pedidos pendentes mais velhos que a configuração voltam ao estoque. */
async function expireStaleOrders() {
  const settings = (await repo.getSettings()) || {};
  const hours = Number(settings.staleOrderHours) || 48;
  const cutoff = Date.now() - hours * 3600e3;
  const orders = await repo.listOrders({ limit: 300 });
  const expired = [];
  for (const o of orders) {
    if (o.status !== 'pendente') continue;
    if (new Date(o.createdAt || 0).getTime() > cutoff) continue;
    try {
      await cancelOrder(o.id, { by: 'sistema', reason: `Pedido pendente expirado após ${hours}h` });
      expired.push(o.id);
    } catch (e) { console.error('[zavalla-stock] expiração falhou para', o.id, e && e.message); }
  }
  return expired;
}

/* ------------------------------------------------------------------ */
/* Indicadores, alertas e relatórios                                   */
/* ------------------------------------------------------------------ */

async function computeKpis() {
  const products = await repo.listProducts({ includeInactive: true });
  const active = products.filter((p) => p.status !== 'inativo');
  const controlled = active.filter((p) => p.stockControl);
  const totalUnits = controlled.reduce((s, p) => s + (Math.max(0, Math.trunc(Number(p.stock) || 0))), 0);
  const totalCost = controlled.reduce((s, p) => s + (Math.max(0, Math.trunc(Number(p.stock) || 0)) * (Number(p.costBRL) || 0)), 0);
  const totalRetail = controlled.reduce((s, p) => s + (Math.max(0, Math.trunc(Number(p.stock) || 0)) * (Number(p.priceBRL) || 0)), 0);
  const low = controlled.filter((p) => p.stock > 0 && p.stock <= (Number(p.minStock) || 0));
  const out = controlled.filter((p) => p.stock === 0);

  const orders = await repo.listOrders({ limit: 300 });
  const pending = orders.filter((o) => o.status === 'pendente').length;
  const confirmed = orders.filter((o) => o.status === 'confirmada').length;

  return {
    totalProducts: active.length,
    totalUnits,
    lowStock: low.length,
    soldOut: out.length,
    controlled: controlled.length,
    inactive: products.length - active.length,
    totalCostBRL: Math.round(totalCost * 100) / 100,
    totalRetailBRL: Math.round(totalRetail * 100) / 100,
    pendingOrders: pending,
    confirmedOrders: confirmed,
    suppliers: (await repo.listSuppliers()).filter((s) => s.status !== 'inativo').length,
  };
}

/** Produtos que pedem atenção (estoque baixo/zerado/cadastro incompleto). */
async function computeAlerts() {
  const products = await repo.listProducts({ includeInactive: true });
  const alerts = [];
  for (const p of products) {
    if (p.status === 'inativo') continue;
    const stock = Math.max(0, Math.trunc(Number(p.stock) || 0));
    if (p.stockControl && stock === 0) {
      alerts.push({ level: 'critico', kind: 'sem-estoque', productId: p.id, sku: p.sku, name: p.name, message: 'Sem estoque disponível.' });
    } else if (p.stockControl && stock <= (Number(p.minStock) || 0)) {
      alerts.push({ level: 'atencao', kind: 'estoque-baixo', productId: p.id, sku: p.sku, name: p.name, message: `Estoque baixo: ${stock} unidade(s), mínimo ${p.minStock}.` });
    }
    const faltas = [];
    if (!p.costBRL && p.costBRL !== 0) faltas.push('custo');
    if (!p.priceBRL) faltas.push('preço');
    if (!p.sku) faltas.push('SKU');
    if (!p.category) faltas.push('categoria');
    if (!p.image) faltas.push('foto');
    if (faltas.length) {
      alerts.push({ level: 'info', kind: 'cadastro-incompleto', productId: p.id, sku: p.sku, name: p.name, message: `Cadastro incompleto: ${faltas.join(', ')}.` });
    }
    if (p.pendingMovements && p.pendingMovements.length) {
      alerts.push({ level: 'atencao', kind: 'movimentacao-pendente', productId: p.id, sku: p.sku, name: p.name, message: `${p.pendingMovements.length} movimentação(ões) aguardando confirmação no histórico.` });
    }
  }
  const order = { critico: 0, atencao: 1, info: 2 };
  alerts.sort((a, b) => order[a.level] - order[b.level]);
  return alerts;
}

/** Série de entradas/saídas por dia para o gráfico do dashboard. */
async function movementSeries(days = 14) {
  const from = new Date(Date.now() - (days - 1) * 864e5);
  const movements = await repo.listMovements({ from: dayKey(from), limit: 1000 });
  const map = new Map();
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getTime() + i * 864e5);
    map.set(dayKey(d), { day: dayKey(d), entradas: 0, saidas: 0 });
  }
  for (const m of movements) {
    const bucket = map.get(String(m.at || '').slice(0, 10));
    if (!bucket) continue;
    if (m.delta > 0) bucket.entradas += m.delta;
    else if (m.delta < 0) bucket.saidas += Math.abs(m.delta);
  }
  return Array.from(map.values());
}

/** Produtos mais vendidos (a partir das saídas com pedido associado). */
async function topSellers(limit = 5) {
  const movements = await repo.listMovements({ type: 'saida', limit: 1000 });
  const map = new Map();
  for (const m of movements) {
    const key = m.productId || m.productSku;
    const cur = map.get(key) || { name: m.productName, sku: m.productSku, units: 0, revenueBRL: 0 };
    cur.units += Math.abs(m.delta || 0);
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.units - a.units).slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Inventário físico                                                   */
/* ------------------------------------------------------------------ */

/**
 * Aplica a contagem física: registra a diferença como movimentação do tipo
 * 'inventario', com responsável e justificativa — nunca muda saldo em silêncio.
 */
async function applyInventory({ productId, counted, user, justification }) {
  const product = await repo.getProduct(productId);
  if (!product) throw new StockError('Produto não encontrado.', 'PRODUTO_NAO_ENCONTRADO');
  const countedInt = Math.max(0, Math.trunc(Number(counted)));
  if (!Number.isFinite(countedInt)) throw new ValidationError({ counted: 'Quantidade contada inválida.' });
  if (!justification || !String(justification).trim()) throw new ValidationError({ justification: 'Informe a justificativa da contagem.' });

  const system = Math.max(0, Math.trunc(Number(product.stock) || 0));
  if (countedInt === system) return { unchanged: true, product, system, counted: countedInt, diff: 0 };

  const { movement } = await applyMovement(product.id, {
    type: 'inventario', mode: 'set', qty: countedInt,
    user, justification: String(justification).trim(),
    origin: 'inventario',
    reason: `Contagem física: sistema ${system}, contado ${countedInt} (${countedInt - system > 0 ? '+' : ''}${countedInt - system}) — ${String(justification).trim()}`,
  });
  return { movement, product: await repo.getProduct(product.id), system, counted: countedInt, diff: countedInt - system };
}

module.exports = {
  applyMovement, flushPending,
  createOrder, cancelOrder, confirmOrder, returnOrderItem, expireStaleOrders,
  computeKpis, computeAlerts, movementSeries, topSellers,
  applyInventory,
  StockError, MOVEMENT_TYPE_LABELS,
};

function str(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
