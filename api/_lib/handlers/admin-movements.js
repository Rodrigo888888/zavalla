/**
 * GET /api/admin/movements?limit=&product=&type= — histórico de movimentações.
 * Cada linha registra data, produto, quantidade alterada, tipo e responsável.
 */
const auth = require('../auth');
const store = require('../store');
const { send, sendError, requireMethod, asInt, cleanText } = require('../http');

module.exports = async (req, res) => {
  try {
    // Autentica primeiro: sem sessão a resposta é sempre 401, independentemente
    // do método pedido.
    await auth.requireAdmin(req);
    requireMethod(req, 'GET');

    const url = new URL(req.url, 'http://localhost');
    const limit = asInt(url.searchParams.get('limit'), { min: 1, max: 500, fallback: 200 });
    const productKey = cleanText(url.searchParams.get('product'), 64);
    const type = cleanText(url.searchParams.get('type'), 24);

    const movements = await store.listMovements(limit, {
      productKey: productKey || undefined,
      type: type || undefined,
    });
    send(res, 200, { ok: true, movements });
  } catch (err) {
    sendError(res, err);
  }
};
