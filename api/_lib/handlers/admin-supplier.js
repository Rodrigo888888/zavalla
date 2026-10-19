/**
 * /api/admin/suppliers/<id> — edição de fornecedor.
 *   PUT    — atualiza cadastro
 *   DELETE — inativa (nunca apaga: produtos podem referenciá-lo)
 */
const auth = require('../auth');
const repo = require('../repo');
const { validateSupplier } = require('../model');
const { send, sendError, requireMethod, readBody, HttpError } = require('../http');

module.exports = async (req, res) => {
  try {
    const admin = await auth.requireAdmin(req);
    const id = (req.query && req.query.id) || '';
    if (!id) throw new HttpError(400, 'Fornecedor não informado.', 'VALIDACAO');

    const existing = await repo.getSupplier(id);
    if (!existing) throw new HttpError(404, 'Fornecedor não encontrado.', 'NAO_ENCONTRADO');

    if (req.method === 'DELETE') {
      requireMethod(req, 'DELETE');
      const supplier = { ...existing, status: 'inativo', updatedAt: new Date().toISOString(), updatedBy: admin.user };
      await repo.saveSupplier(supplier);
      return send(res, 200, { ok: true, supplier, archived: true });
    }

    requireMethod(req, 'PUT');
    const body = await readBody(req);
    const supplier = {
      ...validateSupplier({ ...existing, ...body }, { existingId: id }),
      createdAt: existing.createdAt,
      createdBy: existing.createdBy,
      updatedAt: new Date().toISOString(),
      updatedBy: admin.user,
    };
    await repo.saveSupplier(supplier);
    send(res, 200, { ok: true, supplier });
  } catch (err) {
    sendError(res, err);
  }
};
