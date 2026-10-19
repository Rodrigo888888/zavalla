/**
 * POST /api/order-cancel — cancela um pedido pendente e devolve as unidades.
 * Exige o token do pedido (entregue só a quem criou o pedido), então ninguém
 * consegue cancelar o pedido de outra pessoa.
 */
const crypto = require('crypto');
const store = require('../store');
const inv = require('../inventory');
const { HttpError, send, sendError, readBody, assertSameOrigin, requireMethod, cleanText } = require('../http');

const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
};

module.exports = async (req, res) => {
  try {
    requireMethod(req, 'POST');
    assertSameOrigin(req);
    const body = await readBody(req);
    const orderId = cleanText(body.orderId, 40);
    const token = String(body.cancelToken || '').slice(0, 120);
    if (!orderId || !token) throw new HttpError(400, 'Pedido ou código de cancelamento ausente.', 'VALIDACAO');

    const order = await store.getOrder(orderId);
    if (!order) throw new HttpError(404, 'Pedido não encontrado.', 'PEDIDO');
    if (!safeEqual(order.cancelToken, token)) throw new HttpError(403, 'Código de cancelamento inválido.', 'TOKEN');

    const updated = await inv.cancelOrder(order, { user: 'cliente', reason: 'cancelado pelo cliente' });
    send(res, 200, {
      ok: true,
      order: { id: updated.id, status: updated.status, updatedAt: updated.updatedAt },
      message: 'Pedido cancelado. As unidades voltaram para o estoque.',
    });
  } catch (err) {
    sendError(res, err);
  }
};
