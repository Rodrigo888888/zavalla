/**
 * ZAVALLA — migração dos dados do sistema anterior (v1) para o novo (v2).
 *
 * Regras:
 *   - Idempotente: pode rodar qualquer número de vezes, nunca duplica.
 *   - Não apaga nada: os dados v1 permanecem intactos no banco (leitura
 *     apenas), servindo de histórico e de rede de segurança.
 *   - Trava por SKU: se um produto já existe no índice v2, é pulado — duas
 *     execuções simultâneas não duplicam produtos.
 *   - Preserva saldos, estoque mínimo, vínculo com a vitrine (storeKey) e os
 *     campos extras da loja (notas olfativas, volumes).
 */
const db = require('./db/blob');
const repo = require('./repo');
const { newId, nowISO } = require('./model');

let running = false;

/**
 * Executa a migração se ainda não foi feita. Retorna o estado da migração.
 */
async function ensureMigrated() {
  const state = await repo.getMigrationState();
  if (state && state.done) return state;

  if (running) return { done: false, runningElsewhere: true };
  running = true;
  try {
    const result = await migrate();
    await repo.setMigrationState(result);
    return result;
  } finally {
    running = false;
  }
}

async function migrate() {
  const summary = { done: true, at: nowISO(), products: 0, movements: 0, orders: 0, skipped: 0 };

  // ---------------------------------------------------------------
  // 1) Produtos v1 → v2
  // ---------------------------------------------------------------
  const mapKeyToId = {}; // storeKey v1 -> id v2
  let legacyProducts = [];
  try {
    const paths = await db.listPaths('products/', { legacy: true, limit: 1000 });
    const docs = await db.readMany(paths.filter((p) => p.endsWith('.json')), { legacy: true });
    legacyProducts = docs.map((d) => d.data).filter(Boolean);
  } catch (err) {
    // Banco legado ilegível (ex.: store suspensa): aborta a migração sem
    // marcar como concluída — será tentada de novo na próxima carga.
    console.error('[zavalla-migrate] não foi possível ler produtos v1:', err && err.message);
    return { done: false, error: 'banco-antigo-inacessivel', at: nowISO() };
  }

  for (const old of legacyProducts) {
    const key = String(old.key || '').trim();
    if (!key) { summary.skipped++; continue; }

    const sku = deriveSku(key, old.name);
    const id = newId();

    // Trava anti-duplicidade: se o SKU já está no índice v2, pula.
    const taken = await repo.isSkuTaken(sku, id);
    if (taken) { summary.skipped++; continue; }

    const product = {
      id,
      name: String(old.name || key).slice(0, 120),
      sku,
      barcode: null,
      category: normalizeCategory(old.category),
      type: normalizeType(old),
      brand: null,
      description: old.description && !/confirmar/i.test(String(old.description)) ? String(old.description).slice(0, 2000) : null,
      size: null,
      costBRL: 0, // cadastro antigo não tinha custo — fica para o lojista preencher
      priceBRL: Math.max(0, Number(old.priceBRL) || 0),
      minStock: Number.isFinite(Number(old.lowThreshold)) ? Math.max(0, Math.trunc(Number(old.lowThreshold))) : 3,
      location: null,
      supplierId: null,
      image: old.image ? String(old.image) : null,
      storeKey: key,
      status: old.active === false ? 'inativo' : 'ativo',
      stock: Math.max(0, Math.trunc(Number(old.stock) || 0)),
      stockControl: old.stockControl === true,
      createdAt: old.createdAt || nowISO(),
      updatedAt: nowISO(),
      migratedFrom: 'v1',
      // campos exclusivos da vitrine preservados (notas, volumes)
      store: {
        topNotes: old.topNotes || null,
        heartNotes: old.heartNotes || null,
        baseNotes: old.baseNotes || null,
        volumes: Array.isArray(old.volumes) ? old.volumes : null,
      },
    };

    await repo.saveProduct(product);
    await repo.claimSku(sku, id);
    if (key) await repo.setStoreKey(key, id);
    mapKeyToId[key] = id;
    summary.products++;
  }

  // ---------------------------------------------------------------
  // 2) Movimentações v1 → log v2 (por dia, imutável)
  // ---------------------------------------------------------------
  try {
    const paths = await db.listPaths('movements/', { legacy: true, limit: 2000 });
    const dayFiles = paths.filter((p) => p.endsWith('.json'));
    const docs = await db.readMany(dayFiles, { concurrency: 10, legacy: true });
    const byDay = new Map();

    for (const { rel, data } of docs) {
      const day = String(rel).split('/').pop().replace(/\.json$/, '');
      const items = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []);
      for (const m of items) {
        const productId = m.productId || mapKeyToId[m.productKey] || null;
        byDay.set(day, (byDay.get(day) || []).concat([{
          id: m.id || newId(),
          at: m.at || `${day}T12:00:00.000Z`,
          productId,
          productSku: m.productSku || m.productKey || null,
          productName: m.productName || null,
          category: m.category || null,
          type: m.type || 'ajuste',
          delta: Math.trunc(Number(m.delta) || 0),
          before: Number.isFinite(Number(m.before)) ? Number(m.before) : null,
          after: Number.isFinite(Number(m.after)) ? Number(m.after) : null,
          user: m.user || 'sistema',
          reason: m.reason || null,
          orderId: m.orderId || null,
          origin: 'migracao-v1',
        }]));
      }
    }

    for (const [day, movements] of byDay) {
      if (!movements.length) continue;
      await repo.appendMovements(day, movements);
      summary.movements += movements.length;
    }
  } catch (err) {
    console.error('[zavalla-migrate] movimentações v1 não migradas:', err && err.message);
  }

  // ---------------------------------------------------------------
  // 3) Pedidos v1 → v2
  // ---------------------------------------------------------------
  try {
    const paths = await db.listPaths('orders/', { legacy: true, limit: 1000 });
    const docs = await db.readMany(paths.filter((p) => p.endsWith('.json')), { legacy: true });
    for (const { data } of docs) {
      if (!data || !data.id) continue;
      const existing = await repo.getOrder(data.id);
      if (existing) { summary.skipped++; continue; }
      const order = {
        ...data,
        items: (data.items || []).map((it) => ({
          ...it,
          productId: it.productId || mapKeyToId[it.key] || null,
        })),
        migratedFrom: 'v1',
      };
      await repo.saveOrder(order, { createOnly: true });
      summary.orders++;
    }
  } catch (err) {
    console.error('[zavalla-migrate] pedidos v1 não migrados:', err && err.message);
  }

  return summary;
}

function deriveSku(key, name) {
  const base = String(key || name || 'PRODUTO').toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  return base || 'PRODUTO';
}

function normalizeCategory(cat) {
  const c = String(cat || '').toLowerCase();
  if (/joia|joias/.test(c)) return 'joias';
  if (/perfum|perfume/.test(c)) return 'perfumes';
  if (/kit/.test(c)) return 'kits';
  return 'outros';
}

function normalizeType(old) {
  const c = normalizeCategory(old.category);
  if (c === 'joias') return 'joia';
  if (c === 'perfumes') return 'perfume';
  if (c === 'kits') return 'kit';
  return 'outro';
}

module.exports = { ensureMigrated, migrate };
