/**
 * ZAVALLA — modelo de dados do controle de estoque (v2).
 *
 * Define o formato de cada documento, os tipos de movimentação e toda a
 * validação de entrada. A validação acontece NO SERVIDOR: o frontend é apenas
 * uma conveniência; nada entra no banco sem passar por aqui.
 */

const CATEGORIES = ['perfumes', 'joias', 'kits', 'outros'];
const PRODUCT_TYPES = ['perfume', 'joia', 'kit', 'outro'];
const PRODUCT_STATUS = ['ativo', 'inativo'];

/**
 * Tipos de movimentação de estoque.
 *  entrada       — compra/reposição/devolução de cliente que volta ao vendável
 *  saida         — venda confirmada no site ou saída física
 *  perda         — produto danificado, vencido ou extraviado
 *  ajuste        — correção de inventário (com justificativa)
 *  cadastro      — estoque inicial lançado no cadastro do produto
 *  inventario    — ajuste aplicado a partir da contagem física
 */
const MOVEMENT_TYPES = ['entrada', 'saida', 'perda', 'ajuste', 'cadastro', 'inventario'];

const MOVEMENT_TYPE_LABELS = {
  entrada: 'Entrada',
  saida: 'Saída',
  perda: 'Perda',
  ajuste: 'Ajuste',
  cadastro: 'Cadastro',
  inventario: 'Inventário',
};

/* ------------------------------------------------------------------ */
/* Utilitários                                                         */
/* ------------------------------------------------------------------ */

class ValidationError extends Error {
  constructor(fields) {
    super('Confira os campos destacados.');
    this.name = 'ValidationError';
    this.code = 'VALIDACAO';
    this.fields = fields; // { campo: 'mensagem' }
  }
}

function str(v, max = 200) {
  if (v == null) return '';
  return String(v).trim().slice(0, max);
}

function intOr(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function nonNegativeInt(v, fallback = 0) {
  const n = intOr(v, fallback);
  return n < 0 ? 0 : n;
}

function priceOf(v, fallback = 0) {
  const n = Number(String(v == null ? '' : v).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n * 100) / 100;
}

function nowISO() { return new Date().toISOString(); }

function dayKey(date = new Date()) {
  const d = date.toISOString();
  return d.slice(0, 10); // AAAA-MM-DD
}

function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7); // AAAA-MM
}

/** id curto, URL-safe e suficientemente único (16 hex = 64 bits). */
function newId() {
  const bytes = new Uint8Array(8);
  (globalThis.crypto || require('crypto').webcrypto).getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Token opaco para sessão / cancelamento. */
function randomToken(bytesLen = 24) {
  const bytes = new Uint8Array(bytesLen);
  (globalThis.crypto || require('crypto').webcrypto).getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}

/* ------------------------------------------------------------------ */
/* Produto                                                             */
/* ------------------------------------------------------------------ */

const PRODUCT_FIELDS_FORBIDDEN = ['createdAt', 'updatedAt', 'createdBy'];

/**
 * Normaliza e valida um produto enviado pelo formulário.
 * Retorna um objeto limpo; lança ValidationError com o mapa de erros.
 */
function validateProduct(input, { existingId = null } = {}) {
  const fields = {};
  const p = input && typeof input === 'object' ? input : {};

  const name = str(p.name, 120);
  if (!name || name.length < 2) fields.name = 'Informe o nome do produto.';

  const sku = str(p.sku, 40).toUpperCase();
  if (!sku) fields.sku = 'Informe o código interno (SKU).';
  else if (!/^[A-Z0-9][A-Z0-9._/-]*$/i.test(sku)) fields.sku = 'Use apenas letras, números, ponto, hífen, barra ou sublinhado.';

  const barcode = str(p.barcode, 64);
  if (barcode && !/^[0-9A-Za-z-]{4,64}$/.test(barcode)) fields.barcode = 'Código de barras inválido.';

  const category = str(p.category, 40).toLowerCase();
  if (!CATEGORIES.includes(category)) fields.category = `Categoria inválida (use: ${CATEGORIES.join(', ')}).`;

  const type = str(p.type, 20).toLowerCase() || 'outro';
  if (!PRODUCT_TYPES.includes(type)) fields.type = `Tipo inválido (use: ${PRODUCT_TYPES.join(', ')}).`;

  const brand = str(p.brand, 80);

  const description = str(p.description, 2000);

  const size = str(p.size, 40); // volume/gramatura: "100ml", "5g"

  const costBRL = priceOf(p.costBRL, NaN);
  if (!Number.isFinite(costBRL)) fields.costBRL = 'Informe o custo de aquisição (use 0 se desconhecido).';

  const priceBRL = priceOf(p.priceBRL, NaN);
  if (!Number.isFinite(priceBRL) || priceBRL <= 0) fields.priceBRL = 'Informe o preço de venda maior que zero.';

  const minStock = nonNegativeInt(p.minStock, 3);
  if (minStock > 100000) fields.minStock = 'Estoque mínimo muito alto.';

  const location = str(p.location, 60); // prateleira/posição física
  const supplierId = str(p.supplierId, 40);
  const image = str(p.image, 500);
  const storeKey = str(p.storeKey, 80); // vínculo com produto da vitrine (opcional)

  const status = str(p.status, 20) || 'ativo';
  if (!PRODUCT_STATUS.includes(status)) fields.status = 'Status inválido (ativo ou inativo).';

  // Quantidade inicial: só aceita na criação ou quando há movimento explícito.
  let initialStock = null;
  if (p.initialStock != null && p.initialStock !== '') {
    initialStock = nonNegativeInt(p.initialStock, NaN);
    if (!Number.isFinite(initialStock)) fields.initialStock = 'Quantidade inicial inválida.';
    else if (initialStock > 100000) fields.initialStock = 'Quantidade inicial muito alta.';
  }

  if (Object.keys(fields).length) throw new ValidationError(fields);

  return {
    id: existingId || newId(),
    name, sku, barcode: barcode || null, category, type, brand: brand || null,
    description: description || null, size: size || null,
    costBRL, priceBRL, minStock, location: location || null,
    supplierId: supplierId || null, image: image || null, storeKey: storeKey || null,
    status,
    stock: 0,          // saldo real: só muda via movimentação (stock.js)
    stockControl: false,
    initialStock,
  };
}

/* ------------------------------------------------------------------ */
/* Fornecedor                                                          */
/* ------------------------------------------------------------------ */

function validateSupplier(input, { existingId = null } = {}) {
  const fields = {};
  const s = input && typeof input === 'object' ? input : {};

  const name = str(s.name, 120);
  if (!name || name.length < 2) fields.name = 'Informe o nome do fornecedor.';

  const contact = str(s.contact, 80);
  const phone = str(s.phone, 40);
  const email = str(s.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fields.email = 'E-mail inválido.';

  const notes = str(s.notes, 1000);

  const status = str(s.status, 20) || 'ativo';
  if (!['ativo', 'inativo'].includes(status)) fields.status = 'Status inválido (ativo ou inativo).';

  if (Object.keys(fields).length) throw new ValidationError(fields);

  return {
    id: existingId || newId(),
    name, contact: contact || null, phone: phone || null,
    email: email || null, notes: notes || null, status,
    createdAt: nowISO(), updatedAt: nowISO(),
  };
}

/* ------------------------------------------------------------------ */
/* Movimentação                                                        */
/* ------------------------------------------------------------------ */

/**
 * Uma movimentação é imutável: gravada uma vez, nunca editada.
 * Guarda antes/depois para auditoria e o responsável pela operação.
 */
function buildMovement({ product, type, qty, user, reason = null, orderId = null, origin = 'painel' }) {
  const delta = Math.trunc(Number(qty));
  return {
    id: newId(),
    at: nowISO(),
    productId: product.id,
    productSku: product.sku,
    productName: product.name,
    category: product.category,
    type,
    delta,
    before: product.__beforeStock,
    after: product.__afterStock,
    user: user || 'sistema',
    reason: reason || null,
    orderId: orderId || null,
    origin, // painel | loja | inventario | sistema
  };
}

/* ------------------------------------------------------------------ */
/* Pedido (integração com a loja virtual)                              */
/* ------------------------------------------------------------------ */

function newOrderId() {
  const d = new Date();
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `ZV-${stamp}-${newId().slice(0, 6).toUpperCase()}`;
}

function validateOrderItems(items) {
  const fields = {};
  if (!Array.isArray(items) || !items.length) fields.items = 'Pedido sem itens.';
  else if (items.length > 30) fields.items = 'Pedido com itens demais.';
  return Object.keys(fields).length ? new ValidationError(fields) : null;
}

/* ------------------------------------------------------------------ */
/* Configurações                                                       */
/* ------------------------------------------------------------------ */

const DEFAULT_SETTINGS = {
  lowStockDefault: 3,        // estoque mínimo padrão para produtos novos
  staleOrderHours: 48,       // pedidos pendentes expirados devolvem unidades
  allowNegative: false,      // nunca: proteção absoluta
  updatedAt: null,
  updatedBy: null,
};

function validateSettings(input, current = {}) {
  const out = { ...DEFAULT_SETTINGS, ...current };
  const s = input && typeof input === 'object' ? input : {};
  if (s.lowStockDefault != null) out.lowStockDefault = Math.max(0, Math.min(100000, nonNegativeInt(s.lowStockDefault, out.lowStockDefault)));
  if (s.staleOrderHours != null) out.staleOrderHours = Math.max(1, Math.min(24 * 30, nonNegativeInt(s.staleOrderHours, out.staleOrderHours)));
  out.updatedAt = nowISO();
  return out;
}

module.exports = {
  CATEGORIES, PRODUCT_TYPES, PRODUCT_STATUS, MOVEMENT_TYPES, MOVEMENT_TYPE_LABELS,
  ValidationError, validateProduct, validateSupplier, validateOrderItems,
  validateSettings, DEFAULT_SETTINGS,
  buildMovement, newOrderId, newId, randomToken,
  nowISO, dayKey, monthKey, priceOf, str,
};
