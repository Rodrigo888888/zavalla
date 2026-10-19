/**
 * POST /api/admin/products — cadastra um novo produto no mesmo banco da loja.
 * O produto cadastrado aparece automaticamente na vitrine (GET /api/catalog).
 */
const auth = require('../auth');
const store = require('../store');
const inv = require('../inventory');
const { HttpError, send, sendError, readBody, requireMethod } = require('../http');
const { sanitizeProductInput, keyFrom } = require('../product-input');

const nowISO = () => new Date().toISOString();

module.exports = async (req, res) => {
  try {
    // Autentica primeiro: sem sessão a resposta é sempre 401, independentemente
    // do método pedido.
    const admin = await auth.requireAdmin(req);
    requireMethod(req, 'POST');
    const body = await readBody(req);

    const fields = sanitizeProductInput(body, { partial: false });
    const key = keyFrom(fields.name, body.key);

    const exists = await store.getProduct(key);
    if (exists) throw new HttpError(409, `Já existe um produto com a chave "${key}".`, 'CHAVE');

    const doc = Object.assign({ key, active: true, createdAt: nowISO(), updatedAt: nowISO() }, fields);
    await store.saveProduct(doc);

    if (doc.stock > 0) {
      await inv.recordMovement({
        productKey: key,
        productName: doc.name,
        category: doc.category,
        delta: doc.stock,
        before: 0,
        after: doc.stock,
        type: 'cadastro',
        user: admin.user,
        reason: 'estoque inicial do cadastro',
      });
    }

    send(res, 201, { ok: true, product: inv.adminProduct(doc) });
  } catch (err) {
    sendError(res, err);
  }
};
