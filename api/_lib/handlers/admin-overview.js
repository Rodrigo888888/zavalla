/**
 * GET /api/admin/overview — visão geral do painel (somente administrador).
 * Indicadores + produtos + últimas movimentações, tudo do MESMO banco da loja.
 */
const auth = require('../auth');
const store = require('../store');
const inv = require('../inventory');
const { send, sendError, requireMethod } = require('../http');

module.exports = async (req, res) => {
  try {
    // Autentica primeiro: sem sessão a resposta é sempre 401, independentemente
    // do método pedido.
    const admin = await auth.requireAdmin(req);
    requireMethod(req, 'GET');

    const [products, movements, orders] = await Promise.all([
      store.listProducts(),
      store.listMovements(30),
      store.listOrders(150),
    ]);

    send(res, 200, {
      ok: true,
      user: admin.user,
      kpis: inv.computeKpis(products),
      products: products.map(inv.adminProduct),
      movements,
      orders: orders.slice(0, 40),
      pendingOrders: orders.filter((o) => o.status === 'pendente').length,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    sendError(res, err);
  }
};
