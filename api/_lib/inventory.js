/**
 * ZAVALLA — regras de negócio do estoque.
 * Um único lugar para: registrar movimentações, baixar estoque na venda,
 * devolver unidades em caso de cancelamento e calcular os indicadores.
 */
const crypto = require('crypto');
const store = require('./store');
const { HttpError } = require('./http');

const LOW_STOCK_DEFAULT = 3;

const nowISO = () => new Date().toISOString();

function stockOf(p) {
  const n = Number(p && p.stock);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function lowThresholdOf(p) {
  const n = Number(p && p.lowThreshold);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : LOW_STOCK_DEFAULT;
}

/**
 * Forma do produto exposta para a loja pública (sem nada administrativo).
 *
 * `stockControl` decide se o produto participa do controle de estoque. Produtos
 * ainda não configurados pelo lojista não têm controle: a vitrine continua se
 * comportando como antes (sem selo de esgotado e sem bloquear a compra). Assim
 * que o lojista informa uma quantidade no painel, o controle é ativado e vale
 * a regra "zero unidades = produto esgotado".
 */
function publicProduct(p) {
  const controlled = p.stockControl === true;
  const stock = controlled ? stockOf(p) : null;
  return {
    key: p.key,
    name: p.name,
    category: p.category,
    type: p.type || '',
    priceBRL: Number(p.priceBRL) || 0,
    image: p.image || '',
    description: p.description || '',
    topNotes: p.topNotes || '',
    heartNotes: p.heartNotes || '',
    baseNotes: p.baseNotes || '',
    volumes: Array.isArray(p.volumes) && p.volumes.length ? p.volumes : [{ label: '50 ML', multiplier: 1 }],
    controlled,
    stock,
    lowThreshold: lowThresholdOf(p),
    low: controlled && stock > 0 && stock <= lowThresholdOf(p),
    soldOut: controlled && stock <= 0,
  };
}

function adminProduct(p) {
  return Object.assign({}, publicProduct(p), {
    active: p.active !== false,
    stock: p.stockControl === true ? stockOf(p) : null,
    stockControl: p.stockControl === true,
    createdAt: p.createdAt || null,
    updatedAt: p.updatedAt || null,
  });
}

function computeKpis(products) {
  const list = Array.isArray(products) ? products : [];
  const visible = list.filter((p) => p.active !== false);
  const controlled = visible.filter((p) => p.stockControl === true);
  return {
    totalProducts: visible.length,
    totalUnits: controlled.reduce((sum, p) => sum + stockOf(p), 0),
    lowStock: controlled.filter((p) => stockOf(p) > 0 && stockOf(p) <= lowThresholdOf(p)).length,
    soldOut: controlled.filter((p) => stockOf(p) <= 0).length,
    controlled: controlled.length,
    inactive: list.filter((p) => p.active === false).length,
  };
}

/** Grava uma linha no histórico de movimentações. */
async function recordMovement(entry) {
  await store.logMovement({
    id: crypto.randomBytes(8).toString('hex'),
    at: entry.at || nowISO(),
    productKey: entry.productKey,
    productName: entry.productName || entry.productKey,
    category: entry.category || '',
    delta: Number(entry.delta) || 0,
    before: Number.isFinite(entry.before) ? entry.before : null,
    after: Number.isFinite(entry.after) ? entry.after : null,
    type: entry.type,
    user: entry.user || 'sistema',
    reason: entry.reason || '',
    orderId: entry.orderId || null,
  });
}

/**
 * Altera o estoque de um produto com escrita atômica.
 * `setTo` (valor absoluto) tem prioridade sobre `delta`.
 */
async function changeStock({ key, delta = 0, setTo = null, type, user, reason = '', orderId = null }) {
  let snapshot = null;
  const updated = await store.mutateProduct(key, (p) => {
    if (!p) throw new HttpError(404, 'Produto não encontrado.', 'PRODUTO');
    const controlled = p.stockControl === true;
    const before = controlled ? stockOf(p) : 0;
    const after = setTo != null ? Math.max(0, Math.floor(Number(setTo) || 0)) : Math.max(0, before + Number(delta || 0));
    // Gerir a quantidade no painel ativa o controle de estoque daquele
    // produto — a partir daí vale a regra "zero unidades = produto esgotado".
    if (controlled && after === before) return store.SKIP;
    snapshot = { name: p.name, category: p.category, before, after };
    return Object.assign({}, p, { stock: after, stockControl: true, updatedAt: nowISO() });
  });
  if (snapshot) {
    await recordMovement({
      productKey: key,
      productName: snapshot.name,
      category: snapshot.category,
      delta: snapshot.after - snapshot.before,
      before: snapshot.before,
      after: snapshot.after,
      type,
      user,
      reason,
      orderId,
    });
  }
  return updated;
}

/** Baixa estoque (venda). Recusa quando não há unidades suficientes. */
async function decrementStock(key, qty, meta) {
  let snapshot = null;
  const updated = await store.mutateProduct(key, (p) => {
    if (!p) throw new HttpError(404, 'Produto não encontrado.', 'PRODUTO');
    if (p.active === false) throw new HttpError(410, `${p.name} não está mais disponível.`, 'INATIVO');
    // Produto sem controle de estoque (lojista ainda não informou quantidades):
    // a compra segue normalmente, apenas não há baixa para registrar.
    if (p.stockControl !== true) return store.SKIP;
    const available = stockOf(p);
    if (available < qty) {
      throw new HttpError(
        409,
        `Estoque insuficiente para ${p.name}: disponível ${available} unidade(s), você pediu ${qty}.`,
        'SEM_ESTOQUE'
      );
    }
    snapshot = { name: p.name, category: p.category, before: available, after: available - qty };
    return Object.assign({}, p, { stock: available - qty, updatedAt: nowISO() });
  });
  if (!snapshot) return updated; // sem controle de estoque: nada a registrar
  await recordMovement({
    productKey: key,
    productName: snapshot.name,
    category: snapshot.category,
    delta: -qty,
    before: snapshot.before,
    after: snapshot.after,
    type: 'saida',
    user: meta.user || 'cliente',
    reason: meta.reason || '',
    orderId: meta.orderId || null,
  });
  return updated;
}

/** Devolve unidades (cancelamento/estorno/rollback). */
async function returnStock(key, qty, meta) {
  let snapshot = null;
  const updated = await store.mutateProduct(key, (p) => {
    if (!p) return store.SKIP;
    if (p.stockControl !== true) return store.SKIP; // nunca devolve o que não foi baixado
    const before = stockOf(p);
    snapshot = { name: p.name, category: p.category, before, after: before + qty };
    return Object.assign({}, p, { stock: before + qty, updatedAt: nowISO() });
  });
  if (snapshot) {
    await recordMovement({
      productKey: key,
      productName: snapshot.name,
      category: snapshot.category,
      delta: qty,
      before: snapshot.before,
      after: snapshot.after,
      type: meta.type || 'devolucao',
      user: meta.user || 'sistema',
      reason: meta.reason || '',
      orderId: meta.orderId || null,
    });
  }
  return updated;
}

/** Cria um pedido baixando o estoque de todos os itens; se algo falhar, estorna. */
async function createOrder({ items, customer, user = 'cliente' }) {
  const orderId = 'ZV-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const cancelToken = crypto.randomBytes(24).toString('base64url');
  const applied = [];
  const orderItems = [];
  let totalBRL = 0;
  let hasUnconfirmedPrice = false;

  try {
    for (const item of items) {
      const key = item.key;
      const qty = Math.max(1, Math.min(99, Math.floor(Number(item.qty) || 1)));
      const updated = await decrementStock(key, qty, {
        user,
        reason: 'pedido criado pela loja',
        orderId,
      });
      const volumeLabel = item.volume || (updated.volumes && updated.volumes[0] && updated.volumes[0].label) || '';
      const volume = (updated.volumes || []).find((v) => v.label === volumeLabel) || (updated.volumes || [])[0] || { label: '', multiplier: 1 };
      const unitBRL = (Number(updated.priceBRL) || 0) * (Number(volume.multiplier) || 1);
      if (!unitBRL) hasUnconfirmedPrice = true;
      totalBRL += unitBRL * qty;
      applied.push(key);
      orderItems.push({
        key,
        name: updated.name,
        volume: volume.label,
        qty,
        unitPriceBRL: unitBRL,
      });
    }
  } catch (err) {
    // Estorna tudo que já foi baixado — a loja nunca fica com estoque "sumido".
    for (const key of applied) {
      const it = items.find((x) => x.key === key);
      try {
        await returnStock(key, it ? Math.max(1, Math.floor(Number(it.qty) || 1)) : 1, {
          user: 'sistema',
          reason: 'rollback: pedido não concluído',
          orderId,
        });
      } catch (e) { /* segue adiante */ }
    }
    throw err;
  }

  const order = {
    id: orderId,
    cancelToken,
    createdAt: nowISO(),
    status: 'pendente',
    items: orderItems,
    customer: {
      name: String((customer && customer.name) || '').slice(0, 80),
      phone: String((customer && customer.phone) || '').slice(0, 40),
      note: String((customer && customer.note) || '').slice(0, 300),
    },
    totalBRL: Math.round(totalBRL * 100) / 100,
    hasUnconfirmedPrice,
    history: [{ at: nowISO(), event: 'criado', user }],
  };
  await store.saveOrder(order, { createOnly: true });
  return order;
}

/** Cancela um pedido e devolve as unidades. Idempotente. */
async function cancelOrder(order, meta = {}) {
  const user = meta.user || 'cliente';
  const reason = meta.reason || 'cancelamento';
  if (order.status === 'cancelada') return order;
  if (order.status === 'confirmada') {
    throw new HttpError(409, 'Pedido já confirmado. Estorne pelo estoque manualmente.', 'JA_CONFIRMADO');
  }
  for (const item of order.items || []) {
    await returnStock(item.key, item.qty, { user, reason, orderId: order.id, type: 'devolucao' });
  }
  return store.mutateOrder(order.id, (current) => {
    if (!current) return store.SKIP;
    if (current.status === 'cancelada') return store.SKIP;
    current.status = 'cancelada';
    current.updatedAt = nowISO();
    current.history = (current.history || []).concat([{ at: nowISO(), event: 'cancelado', user, reason }]);
    return current;
  });
}

/** Confirma um pedido (já saiu do estoque; muda só o status). */
async function confirmOrder(order, meta = {}) {
  const user = meta.user || 'sistema';
  return store.mutateOrder(order.id, (current) => {
    if (!current) return store.SKIP;
    if (current.status === 'confirmada') return store.SKIP;
    current.status = 'confirmada';
    current.updatedAt = nowISO();
    current.history = (current.history || []).concat([{ at: nowISO(), event: 'confirmado', user }]);
    return current;
  });
}

/** Cancela pedidos pendentes mais velhos que o prazo (devolve as unidades). */
async function expireStaleOrders(maxAgeHours = 48) {
  const orders = await store.listOrders(400);
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  const expired = [];
  for (const order of orders) {
    if (order.status !== 'pendente') continue;
    const created = Date.parse(order.createdAt || '') || 0;
    if (created && created < cutoff) {
      try {
        await cancelOrder(order, { user: 'sistema', reason: `expirado após ${maxAgeHours}h sem confirmação` });
        expired.push(order.id);
      } catch (e) { /* segue adiante */ }
    }
  }
  return expired;
}

module.exports = {
  LOW_STOCK_DEFAULT,
  stockOf,
  lowThresholdOf,
  publicProduct,
  adminProduct,
  computeKpis,
  recordMovement,
  changeStock,
  decrementStock,
  returnStock,
  createOrder,
  cancelOrder,
  confirmOrder,
  expireStaleOrders,
};
