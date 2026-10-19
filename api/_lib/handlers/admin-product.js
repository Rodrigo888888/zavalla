/**
 * PUT    /api/admin/products/:key — edita um produto (mesmos campos da loja).
 * DELETE /api/admin/products/:key — desativa o produto (some da vitrine,
 *         mas mantém o histórico de movimentações intacto).
 */
const auth = require('../auth');
const store = require('../store');
const inv = require('../inventory');
const { HttpError, send, sendError, readBody, requireMethod, cleanText } = require('../http');
const { sanitizeProductInput } = require('../product-input');

const nowISO = () => new Date().toISOString();

module.exports = async (req, res) => {
  try {
    const admin = await auth.requireAdmin(req);
    const key = cleanText(req.query && req.query.id, 64);
    if (!key) throw new HttpError(400, 'Produto não informado.', 'VALIDACAO');

    const existing = await store.getProduct(key);
    if (!existing) throw new HttpError(404, 'Produto não encontrado.', 'PRODUTO');

    if (req.method === 'PUT') {
      const body = await readBody(req);
      const fields = sanitizeProductInput(body, { partial: true, existing });

      const next = Object.assign({}, existing, fields, { updatedAt: nowISO() });
      const before = inv.stockOf(existing);
      const after = inv.stockOf(next);

      if (after !== before) {
        // Mudança de quantidade pela edição: registra como ajuste para o
        // histórico nunca ficar sem explicação.
        await store.saveProduct(next);
        await inv.recordMovement({
          productKey: key,
          productName: next.name,
          category: next.category,
          delta: after - before,
          before,
          after,
          type: 'ajuste',
          user: admin.user,
          reason: 'ajuste pela edição do produto',
        });
      } else {
        await store.saveProduct(next);
      }

      return send(res, 200, { ok: true, product: inv.adminProduct(next) });
    }

    if (req.method === 'DELETE') {
      const next = Object.assign({}, existing, { active: false, updatedAt: nowISO() });
      await store.saveProduct(next);
      await inv.recordMovement({
        productKey: key,
        productName: next.name,
        category: next.category,
        delta: 0,
        before: inv.stockOf(existing),
        after: inv.stockOf(existing),
        type: 'desativacao',
        user: admin.user,
        reason: 'produto retirado da vitrine',
      });
      return send(res, 200, { ok: true, product: inv.adminProduct(next) });
    }

    throw new HttpError(405, 'Método não permitido.', 'METODO');
  } catch (err) {
    sendError(res, err);
  }
};
