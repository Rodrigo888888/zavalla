/**
 * GET /api/catalog — catálogo público da loja.
 * É o MESMO banco de dados usado pelo painel administrativo: nome, categoria,
 * preço, imagem e quantidade disponível. Nada administrativo é exposto aqui.
 */
const store = require('../store');
const inv = require('../inventory');
const { send, sendError, requireMethod } = require('../http');

module.exports = async (req, res) => {
  try {
    requireMethod(req, 'GET');
    const products = (await store.listProducts())
      .filter((p) => p.active !== false)
      .map(inv.publicProduct);
    send(res, 200, { ok: true, products, updatedAt: new Date().toISOString() });
  } catch (err) {
    sendError(res, err);
  }
};
