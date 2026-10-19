/**
 * POST /api/orders — cria um pedido e baixa o estoque UMA vez, no momento certo.
 *
 * Regras do fluxo (mantidas da loja):
 * - Colocar na sacola NÃO mexe no estoque (a sacola fica só no navegador).
 * - A baixa acontece aqui, quando o cliente confirma o pedido.
 * - A escrita é condicional (CAS): se duas pessoas comprarem a última unidade
 *   ao mesmo tempo, apenas uma consegue; a outra recebe erro com saldo atual.
 * - Se qualquer item falhar, tudo que já foi baixado é devolvido (rollback).
 * - Sem pagamento simulado: o pedido nasce "pendente" e o cliente segue para
 *   o WhatsApp. Se cancelado, as unidades voltam ao estoque.
 */
const stock = require('../stock');
const migrate = require('../migrate');
const { HttpError, send, sendError, readBody, assertSameOrigin, requireMethod, cleanText } = require('../http');
const { ValidationError } = require('../model');

module.exports = async (req, res) => {
  try {
    requireMethod(req, 'POST');
    assertSameOrigin(req);
    await migrate.ensureMigrated();
    const body = await readBody(req);

    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!rawItems.length) throw new ValidationError({ items: 'Pedido sem itens.' });
    if (rawItems.length > 15) throw new ValidationError({ items: 'Pedido com itens demais.' });

    const items = rawItems.map((item) => {
      const key = cleanText(item && item.key, 64);
      const qty = Math.floor(Number(item && item.qty));
      if (!key) throw new ValidationError({ items: 'Item sem produto.' });
      if (!Number.isFinite(qty) || qty < 1 || qty > 99) throw new ValidationError({ items: 'Quantidade inválida.' });
      return { key, qty, volume: cleanText(item && item.volume, 24) };
    });

    const order = await stock.createOrder({
      items,
      customer: {
        name: cleanText(body.customer && body.customer.name, 80),
        phone: cleanText(body.customer && body.customer.phone, 40),
        note: cleanText(body.customer && body.customer.note, 300),
      },
    });

    send(res, 201, {
      ok: true,
      order: {
        id: order.id,
        status: order.status,
        createdAt: order.createdAt,
        items: order.items,
        totalBRL: order.totalBRL,
      },
      cancelToken: order.cancelToken,
      message: 'Pedido registrado. As unidades foram reservadas e saem do estoque da loja.',
    });
  } catch (err) {
    sendError(res, err);
  }
};
