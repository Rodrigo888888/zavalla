/**
 * GET /api/admin/movements — histórico de movimentações (somente administrador).
 * Filtros: from, to, product, type, limit. O histórico é imutável.
 */
const auth = require('../auth');
const repo = require('../repo');
const migrate = require('../migrate');
const { send, sendError, requireMethod } = require('../http');

module.exports = async (req, res) => {
  try {
    await auth.requireAdmin(req);
    requireMethod(req, 'GET');
    await migrate.ensureMigrated();

    const q = req.query || {};
    const movements = await repo.listMovements({
      from: q.from || null,
      to: q.to || null,
      productId: q.product || null,
      type: q.type || null,
      limit: Math.min(1000, Number(q.limit) || 200),
    });

    send(res, 200, { ok: true, movements, total: movements.length });
  } catch (err) {
    sendError(res, err);
  }
};
