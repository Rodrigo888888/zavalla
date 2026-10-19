/**
 * /api/admin/products — listagem e cadastro (somente administrador).
 *   GET  — lista produtos (filtros: search, category, status)
 *   POST — cadastra produto novo (SKU único validado no servidor)
 */
const auth = require('../auth');
const repo = require('../repo');
const stock = require('../stock');
const migrate = require('../migrate');
const { validateProduct, ValidationError } = require('../model');
const { send, sendError, requireMethod, readBody, HttpError } = require('../http');

module.exports = async (req, res) => {
  try {
    const admin = await auth.requireAdmin(req);

    if (req.method === 'GET') {
      await migrate.ensureMigrated();
      const q = req.query || {};
      let products = await repo.listProducts({ includeInactive: true });

      const search = String(q.search || '').trim().toLowerCase();
      if (search) {
        products = products.filter((p) =>
          [p.name, p.sku, p.brand, p.storeKey].some((v) => v && String(v).toLowerCase().includes(search)));
      }
      if (q.category) products = products.filter((p) => p.category === q.category);
      if (q.status) products = products.filter((p) => p.status === q.status);
      if (q.supplier) products = products.filter((p) => p.supplierId === q.supplier);

      return send(res, 200, { ok: true, products, total: products.length });
    }

    if (req.method === 'POST') {
      requireMethod(req, 'POST');
      await migrate.ensureMigrated();
      const body = await readBody(req);

      const draft = validateProduct(body);
      const initialStock = draft.initialStock;
      delete draft.initialStock;

      // Unicidade de SKU: checagem + trava no índice (duas criações
      // simultâneas com o mesmo SKU nunca passam ambas).
      if (await repo.isSkuTaken(draft.sku, draft.id)) {
        throw new ValidationError({ sku: `Já existe um produto com o SKU "${draft.sku}".` });
      }
      const claimed = await repo.claimSku(draft.sku, draft.id);
      if (!claimed) throw new ValidationError({ sku: `Já existe um produto com o SKU "${draft.sku}".` });

      const product = {
        ...draft,
        stock: 0,
        stockControl: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: admin.user,
      };
      await repo.saveProduct(product);
      if (product.storeKey) await repo.setStoreKey(product.storeKey, product.id);

      // Estoque inicial vira movimentação registrada (nunca saldo silencioso).
      let movement = null;
      if (initialStock && initialStock > 0) {
        const applied = await stock.applyMovement(product.id, {
          type: 'cadastro', qty: initialStock, user: admin.user,
          reason: 'Estoque inicial lançado no cadastro', origin: 'painel',
        });
        movement = applied.movement;
      }

      const fresh = await repo.getProduct(product.id);
      return send(res, 201, { ok: true, product: fresh, movement });
    }

    throw new HttpError(405, 'Método não permitido.', 'METODO');
  } catch (err) {
    sendError(res, err);
  }
};
