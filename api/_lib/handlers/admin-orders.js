/**
 * GET  /api/admin/orders — lista de pedidos (pendentes, confirmados, cancelados).
 * POST /api/admin/orders — { id, action: 'confirmar' | 'cancelar' }.
 *   confirmar → pedido fechado (as unidades já saíram no momento da criação).
 *   cancelar  → devolve as unidades para o estoque.
 */
const auth = require('../auth');
const store = require('../store');
const inv = require('../inventory');
const { HttpError, send, sendError, readBody, requireMethod, cleanText } = require('../http');

module.exports = async (req, res) => {
  try {
    const admin = await auth.requireAdmin(req);

    if (req.method === 'GET') {
      const orders = await store.listOrders(150);
      return send(res, 200, {
        ok: true,
        orders,
        pending: orders.filter((o) => o.status === 'pendente').length,
      });
    }

    if (req.method === 'POST') {
      requireMethod(req, 'POST');
      const body = await readBody(req);
      const id = cleanText(body.id, 40);
      const action = cleanText(body.action, 20);
      if (!id) throw new HttpError(400, 'Pedido não informado.', 'VALIDACAO');

      const order = await store.getOrder(id);
      if (!order) throw new HttpError(404, 'Pedido não encontrado.', 'PEDIDO');

      const updated =
        action === 'confirmar'
          ? await inv.confirmOrder(order, { user: admin.user })
          : action === 'cancelar'
          ? await inv.cancelOrder(order, { user: admin.user, reason: 'cancelado pelo administrador' })
          : null;

      if (!updated) throw new HttpError(400, 'Ação inválida. Use "confirmar" ou "cancelar".', 'VALIDACAO');

      const products = await store.listProducts();
      return send(res, 200, {
        ok: true,
        order: updated,
        kpis: inv.computeKpis(products),
        message: action === 'confirmar' ? 'Pedido confirmado.' : 'Pedido cancelado e estoque devolvido.',
      });
    }

    throw new HttpError(405, 'Método não permitido.', 'METODO');
  } catch (err) {
    sendError(res, err);
  }
};
