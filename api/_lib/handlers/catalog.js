/**
 * GET /api/catalog — catálogo público da loja.
 * Serve os produtos do NOVO modelo de estoque (v2), convertidos para o formato
 * que a vitrine já conhece. Nada administrativo é exposto aqui.
 */
const repo = require('../repo');
const migrate = require('../migrate');
const { send, sendError, requireMethod } = require('../http');

/** Converte um produto do estoque para o formato público da vitrine. */
function toPublic(p) {
  const controlled = p.stockControl === true;
  const stock = controlled ? Math.max(0, Math.trunc(Number(p.stock) || 0)) : null;
  const min = Math.max(0, Math.trunc(Number(p.minStock) || 0));
  const store = p.store || {};
  return {
    key: p.storeKey || p.id,
    name: p.name,
    category: p.category,
    type: p.type || '',
    priceBRL: Number(p.priceBRL) || 0,
    image: p.image || '',
    description: p.description || '',
    topNotes: store.topNotes || '',
    heartNotes: store.heartNotes || '',
    baseNotes: store.baseNotes || '',
    volumes: Array.isArray(store.volumes) && store.volumes.length
      ? store.volumes
      : [{ label: '50 ML', multiplier: 1 }],
    controlled,
    stock,
    lowThreshold: min,
    low: controlled && stock > 0 && stock <= min,
    soldOut: controlled && stock <= 0,
  };
}

module.exports = async (req, res) => {
  try {
    requireMethod(req, 'GET');
    await migrate.ensureMigrated();

    const products = (await repo.listProducts({ includeInactive: false }))
      .filter((p) => p.status !== 'inativo')
      .map(toPublic);

    send(res, 200, { ok: true, products, updatedAt: new Date().toISOString() });
  } catch (err) {
    sendError(res, err);
  }
};

module.exports.toPublic = toPublic;
