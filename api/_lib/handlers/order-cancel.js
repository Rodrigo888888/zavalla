/**
 * POST /api/order-cancel — cancela um pedido pendente e devolve as unidades.
 * Exige o cancelToken entregue na criação (comparação em tempo constante).
 */
const crypto = require('crypto');
const repo = require('../repo');
const stock = require('../stock');
const { HttpError, send, sendError, readBody, assertSameOrigin, requireMethod, cleanText } = require('../http');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) { crypto.timingSafeEqual(ba, ba); return false; }
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = async (req, res) => {
  try {
    requireMethod(req, 'POST');
    assertSameOrigin(req);
    const body = await readBody(req);

    const orderId = cleanText(body.orderId, 40);
    const token = cleanText(body.cancelToken, 120);
    if (!orderId || !token) throw new HttpError(400, 'Pedido ou código de cancelamento ausente.', 'VALIDACAO');

    const order = await repo.getOrder(orderId);
    if (!order) throw new HttpError(404, 'Pedido não encontrado.', 'NAO_ENCONTRADO');
    if (!order.cancelToken || !safeEqual(order.cancelToken, token)) {
      throw new HttpError(403, 'Código de cancelamento inválido.', 'TOKEN');
    }

    const { order: cancelled, alreadyDone } = await stock.cancelOrder(orderId, { by: 'cliente' });

    send(res, 200, {
      ok: true,
      order: { id: cancelled.id, status: cancelled.status },
      alreadyDone: !!alreadyDone,
      message: alreadyDone
        ? 'Este pedido já estava cancelado.'
        : 'Pedido cancelado — as unidades voltaram ao estoque da loja.',
    });
  } catch (err) {
    sendError(res, err);
  }
};
