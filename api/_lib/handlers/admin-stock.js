/**
 * POST /api/admin/stock — registra uma movimentação manual de estoque.
 * Tipos aceitos: entrada, saida, perda, ajuste.
 * Tudo vira movimentação imutável com antes/depois, autor e motivo.
 */
const auth = require('../auth');
const repo = require('../repo');
const stock = require('../stock');
const { send, sendError, requireMethod, readBody, cleanText } = require('../http');
const { ValidationError } = require('../model');

const ALLOWED = ['entrada', 'saida', 'perda', 'ajuste'];

module.exports = async (req, res) => {
  try {
    const admin = await auth.requireAdmin(req);
    requireMethod(req, 'POST');
    const body = await readBody(req);

    const productId = cleanText(body.productId, 64);
    const type = cleanText(body.type, 20);
    if (!productId) throw new ValidationError({ productId: 'Produto não informado.' });
    if (!ALLOWED.includes(type)) throw new ValidationError({ type: 'Tipo de movimentação inválido.' });

    const reason = cleanText(body.reason, 240) || null;
    if (type === 'perda' && !reason) {
      throw new ValidationError({ reason: 'Descreva o motivo da perda (obrigatório para auditoria).' });
    }

    const isSet = type === 'ajuste' && body.mode === 'set';
    const qty = Math.trunc(Number(body.qty));
    if (!Number.isFinite(qty)) throw new ValidationError({ qty: 'Quantidade inválida.' });
    if (!isSet && qty === 0) throw new ValidationError({ qty: 'Quantidade deve ser diferente de zero.' });
    if (isSet && qty < 0) throw new ValidationError({ qty: 'O saldo ajustado não pode ser negativo.' });

    const { product, movement, duplicate } = await stock.applyMovement(productId, {
      type, qty, mode: isSet ? 'set' : 'delta',
      user: admin.user, reason, origin: 'painel',
      opToken: cleanText(body.opToken, 64) || null, // anti-duplicidade (reenvio por rede)
    });

    send(res, duplicate ? 200 : 201, {
      ok: true,
      duplicate: !!duplicate,
      product,
      movement,
      message: duplicate ? 'Operação já registrada anteriormente — nada foi alterado de novo.' : 'Movimentação registrada.',
    });
  } catch (err) {
    sendError(res, err);
  }
};
