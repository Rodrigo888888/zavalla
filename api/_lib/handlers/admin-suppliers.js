/**
 * /api/admin/suppliers — fornecedores (listagem e cadastro).
 *   GET  — lista fornecedores
 *   POST — cadastra fornecedor
 */
const auth = require('../auth');
const repo = require('../repo');
const { validateSupplier } = require('../model');
const { send, sendError, requireMethod, readBody } = require('../http');

module.exports = async (req, res) => {
  try {
    const admin = await auth.requireAdmin(req);

    if (req.method === 'GET') {
      const suppliers = await repo.listSuppliers();
      return send(res, 200, { ok: true, suppliers, total: suppliers.length });
    }

    if (req.method === 'POST') {
      requireMethod(req, 'POST');
      const body = await readBody(req);
      const supplier = { ...validateSupplier(body), createdBy: admin.user };
      await repo.saveSupplier(supplier);
      return send(res, 201, { ok: true, supplier });
    }

    const { HttpError } = require('../http');
    throw new HttpError(405, 'Método não permitido.', 'METODO');
  } catch (err) {
    sendError(res, err);
  }
};
