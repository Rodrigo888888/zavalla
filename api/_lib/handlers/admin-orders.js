/**
 * /api/admin/orders — pedidos (painel).
 *   GET  — lista pedidos (filtro ?status=)
 *   POST — ações: confirmar | cancelar | devolver
 */
const auth = require('../auth');
const repo = require('../repo');
const stock = require('../stock');
const migrate = require('../migrate');
const { send, sendError, requireMethod, readBody, cleanText, HttpError } = require('../http');
const { ValidationError } = require('../model');

module.exports = async (req, res) => {
  try {
    const admin = await auth.requireAdmin(req);

    if (req.method === 'GET') {
      await migrate.ensureMigrated();
      const q = req.query || {};
      let orders = await repo.listOrders({ limit: 300 });
      if (q.status) orders = orders.filter((o) => o.status === q.status);
      return send(res, 200, { ok: true, orders, total: orders.length });
    }

    requireMethod(req, 'POST');
    const body = await readBody(req);
    const action = cleanText(body.action, 30);
    const orderId = cleanText(body.orderId, 40);
    if (!orderId) throw new ValidationError({ orderId: 'Pedido não informado.' });

    if (action === 'confirmar') {
      const { order } = await stock.confirmOrder(orderId, { by: admin.user });
      return send(res, 200, { ok: true, order, message: 'Pedido confirmado.' });
    }

    if (action === 'cancelar') {
      const reason = cleanText(body.reason, 240) || `Cancelado pelo painel (${admin.user})`;
      const { order } = await stock.cancelOrder(orderId, { by: admin.user, reason });
      return send(res, 200, { ok: true, order, message: 'Pedido cancelado — as unidades voltaram ao estoque.' });
    }

    if (action === 'devolver') {
      const { movement, product } = await stock.returnOrderItem(orderId, Number(body.itemIndex) || 0, {
        by: admin.user,
        qty: body.qty != null ? Number(body.qty) : null,
        reason: cleanText(body.reason, 240) || null,
      });
      return send(res, 200, { ok: true, movement, product, message: 'Devolução registrada — unidades de volta ao estoque.' });
    }

    throw new HttpError(400, 'Ação desconhecida.', 'ACAO');
  } catch (err) {
    sendError(res, err);
  }
};
