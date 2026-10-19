/**
 * POST /api/admin/stock — adiciona, remove ou define a quantidade de um produto.
 * body: { key, mode: 'add' | 'sub' | 'set', qty, note }
 * Toda alteração vira uma linha no histórico com o usuário responsável.
 */
const auth = require('../auth');
const inv = require('../inventory');
const store = require('../store');
const { HttpError, send, sendError, readBody, requireMethod, cleanText, asInt } = require('../http');

module.exports = async (req, res) => {
  try {
    // Autentica primeiro: sem sessão a resposta é sempre 401, independentemente
    // do método pedido.
    const admin = await auth.requireAdmin(req);
    requireMethod(req, 'POST');
    const body = await readBody(req);

    const key = cleanText(body.key, 64);
    const mode = cleanText(body.mode, 10);
    const qty = asInt(body.qty, { min: 0, max: 99999, fallback: null });
    const note = cleanText(body.note, 120);

    if (!key) throw new HttpError(400, 'Produto não informado.', 'VALIDACAO');
    if (qty == null) throw new HttpError(400, 'Quantidade inválida.', 'VALIDACAO');
    if (!['add', 'sub', 'set'].includes(mode)) throw new HttpError(400, 'Operação inválida.', 'VALIDACAO');

    const current = await store.getProduct(key);
    if (!current) throw new HttpError(404, 'Produto não encontrado.', 'PRODUTO');

    if (mode === 'sub' && qty > inv.stockOf(current)) {
      throw new HttpError(400, `Não é possível remover ${qty}: há apenas ${inv.stockOf(current)} unidade(s) de ${current.name}.`, 'VALIDACAO');
    }

    const updated =
      mode === 'set'
        ? await inv.changeStock({ key, setTo: qty, type: 'ajuste', user: admin.user, reason: note || 'ajuste manual' })
        : await inv.changeStock({
            key,
            delta: mode === 'add' ? qty : -qty,
            type: mode === 'add' ? 'entrada' : 'saida',
            user: admin.user,
            reason: note || (mode === 'add' ? 'entrada manual' : 'saída manual'),
          });

    send(res, 200, { ok: true, product: inv.adminProduct(updated) });
  } catch (err) {
    sendError(res, err);
  }
};
