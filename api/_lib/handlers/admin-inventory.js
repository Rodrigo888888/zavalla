/**
 * POST /api/admin/inventory — inventário físico.
 * Recebe a contagem de um produto e aplica a diferença como movimentação
 * do tipo 'inventario', com responsável e justificativa. Nunca muda saldo
 * em silêntio.
 */
const auth = require('../auth');
const stock = require('../stock');
const migrate = require('../migrate');
const { send, sendError, requireMethod, readBody, cleanText } = require('../http');
const { ValidationError } = require('../model');

module.exports = async (req, res) => {
  try {
    const admin = await auth.requireAdmin(req);
    requireMethod(req, 'POST');
    await migrate.ensureMigrated();
    const body = await readBody(req);

    const productId = cleanText(body.productId, 64);
    if (!productId) throw new ValidationError({ productId: 'Produto não informado.' });

    const result = await stock.applyInventory({
      productId,
      counted: body.counted,
      user: admin.user,
      justification: cleanText(body.justification, 300),
    });

    send(res, 200, {
      ok: true,
      ...result,
      message: result.unchanged
        ? 'Contagem confere com o saldo do sistema — nenhuma alteração necessária.'
        : `Diferença registrada: ${result.diff > 0 ? '+' : ''}${result.diff} unidade(s).`,
    });
  } catch (err) {
    sendError(res, err);
  }
};
