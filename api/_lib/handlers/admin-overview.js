/**
 * GET /api/admin/overview — visão geral do painel (somente administrador).
 * Indicadores reais calculados no servidor: produtos, unidades, valor
 * estimado, alertas, gráfico de entradas/saídas e produtos mais vendidos.
 */
const auth = require('../auth');
const repo = require('../repo');
const stock = require('../stock');
const migrate = require('../migrate');
const { send, sendError, requireMethod } = require('../http');

module.exports = async (req, res) => {
  try {
    const admin = await auth.requireAdmin(req);
    requireMethod(req, 'GET');

    await migrate.ensureMigrated();

    const [kpis, alerts, series, top, movements, orders, settings] = await Promise.all([
      stock.computeKpis(),
      stock.computeAlerts(),
      stock.movementSeries(14),
      stock.topSellers(5),
      repo.listMovements({ limit: 12 }),
      repo.listOrders({ limit: 40 }),
      repo.getSettings(),
    ]);

    send(res, 200, {
      ok: true,
      user: admin.user,
      kpis,
      alerts: alerts.slice(0, 8),
      alertCount: alerts.length,
      series,
      topSellers: top,
      movements,
      orders: orders.filter((o) => o.status === 'pendente').slice(0, 10),
      pendingOrders: orders.filter((o) => o.status === 'pendente').length,
      settings,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    sendError(res, err);
  }
};
