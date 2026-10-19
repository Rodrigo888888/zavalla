/**
 * POST /api/admin/seed — importa para o banco os produtos que a loja já vende
 * (gerados a partir do PRODUCTS do app.js por _sync-catalog.js).
 * Só cria o que ainda não existe; nunca sobrescreve estoque já lançado.
 */
const auth = require('../auth');
const store = require('../store');
const inv = require('../inventory');
const seed = require('../catalog-seed');
const { send, sendError, requireMethod } = require('../http');

const nowISO = () => new Date().toISOString();

module.exports = async (req, res) => {
  try {
    // Autentica primeiro: sem sessão a resposta é sempre 401, independentemente
    // do método pedido.
    const admin = await auth.requireAdmin(req);
    requireMethod(req, 'POST');

    const created = [];
    const skipped = [];

    for (const item of seed) {
      const exists = await store.getProduct(item.key);
      if (exists) {
        skipped.push(item.key);
        continue;
      }
      const doc = Object.assign({}, item, {
        stock: 0,
        // Importados sem controle de estoque: a vitrine segue funcionando como
        // sempre. O controle (e o selo "esgotado") liga na primeira quantidade
        // lançada pelo lojista.
        stockControl: false,
        lowThreshold: inv.LOW_STOCK_DEFAULT,
        active: true,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
      await store.saveProduct(doc);
      created.push(item.key);
    }

    const products = await store.listProducts();
    send(res, 200, {
      ok: true,
      created,
      skipped,
      message: `${created.length} produto(s) cadastrado(s). Lance as quantidades na aba Produtos para ativar o controle de estoque.`,
      kpis: inv.computeKpis(products),
    });
  } catch (err) {
    sendError(res, err);
  }
};
