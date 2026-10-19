/**
 * /api/admin/products/<id> — edição de um produto (somente administrador).
 *   GET   — produto completo
 *   PUT   — atualiza cadastro (SKU trocado é revalidado; saldo NÃO muda por aqui)
 *   DELETE — arquiva (inativar), preservando histórico e saldo
 */
const auth = require('../auth');
const repo = require('../repo');
const stock = require('../stock');
const { validateProduct, ValidationError } = require('../model');
const { send, sendError, requireMethod, readBody, HttpError } = require('../http');

module.exports = async (req, res) => {
  try {
    const admin = await auth.requireAdmin(req);
    const id = (req.query && req.query.id) || '';
    if (!id) throw new HttpError(400, 'Produto não informado.', 'VALIDACAO');

    const existing = await repo.getProduct(id);
    if (!existing) throw new HttpError(404, 'Produto não encontrado.', 'NAO_ENCONTRADO');

    if (req.method === 'GET') {
      return send(res, 200, { ok: true, product: existing });
    }

    if (req.method === 'PUT') {
      requireMethod(req, 'PUT');
      const body = await readBody(req);

      // Mantém campos não enviados (formulário parcial)
      const merged = { ...existing, ...body, initialStock: undefined };
      const draft = validateProduct(merged, { existingId: id });

      // SKU novo precisa ser único
      if (draft.sku !== existing.sku && (await repo.isSkuTaken(draft.sku, id))) {
        throw new ValidationError({ sku: `Já existe um produto com o SKU "${draft.sku}".` });
      }
      if (draft.sku !== existing.sku) {
        // troca o dono do SKU no índice (CAS)
        const idx = await repo.readIndex();
        delete idx.skus[existing.sku];
        await repo.writeIndex(idx);
        const claimed = await repo.claimSku(draft.sku, id);
        if (!claimed) throw new ValidationError({ sku: `Já existe um produto com o SKU "${draft.sku}".` });
      }

      const product = {
        ...existing,
        ...draft,
        stock: existing.stock,          // saldo só muda por movimentação
        stockControl: existing.stockControl,
        createdAt: existing.createdAt,
        createdBy: existing.createdBy,
        updatedAt: new Date().toISOString(),
        updatedBy: admin.user,
      };
      await repo.saveProduct(product);
      if (product.storeKey) await repo.setStoreKey(product.storeKey, product.id);

      // Quantidade enviada pelo formulário de edição: vira movimentação
      // registrada (auditoria completa), nunca uma alteração silenciosa.
      let movement = null;
      const sentQty = body.quantity != null && body.quantity !== '' ? Math.max(0, Math.trunc(Number(body.quantity))) : null;
      if (sentQty != null && Number.isFinite(sentQty) && sentQty !== existing.stock) {
        const applied = await stock.applyMovement(id, {
          type: 'ajuste', mode: 'set', qty: sentQty, user: admin.user,
          reason: 'Ajuste pela edição do cadastro', origin: 'painel',
        });
        movement = applied.movement;
      }

      return send(res, 200, { ok: true, product: await repo.getProduct(id), movement });
    }

    if (req.method === 'DELETE') {
      requireMethod(req, 'DELETE');
      // Arquivamento: inativa preservando saldo e histórico.
      const product = await repo.mutateProduct(id, (doc) => {
        if (!doc) return repo.SKIP;
        return { ...doc, status: 'inativo', updatedAt: new Date().toISOString(), updatedBy: admin.user };
      });
      const fresh = await repo.getProduct(id);
      return send(res, 200, { ok: true, product: fresh || existing, archived: true });
    }

    throw new HttpError(405, 'Método não permitido.', 'METODO');
  } catch (err) {
    sendError(res, err);
  }
};
