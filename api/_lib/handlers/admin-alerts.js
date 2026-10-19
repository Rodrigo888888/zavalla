/**
 * GET /api/admin/alerts — alertas calculados no servidor (não do navegador).
 */
const auth = require('../auth');
const stock = require('../stock');
const migrate = require('../migrate');
const { send, sendError, requireMethod } = require('../http');

module.exports = async (req, res) => {
  try {
    await auth.requireAdmin(req);
    requireMethod(req, 'GET');
    await migrate.ensureMigrated();

    const alerts = await stock.computeAlerts();
    const counts = alerts.reduce((acc, a) => { acc[a.level] = (acc[a.level] || 0) + 1; return acc; }, {});

    send(res, 200, { ok: true, alerts, counts, total: alerts.length });
  } catch (err) {
    sendError(res, err);
  }
};
