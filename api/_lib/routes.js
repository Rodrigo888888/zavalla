/**
 * ZAVALLA — roteador interno das funções de servidor.
 *
 * O plano Hobby da Vercel permite no máximo 12 funções por deploy, então todos
 * os endpoints moram em uma única função (api/[...slug].js) e este roteador
 * decide qual handler atende cada caminho. O comportamento para o site é
 * idêntico: /api/catalog, /api/orders, /api/admin/* continuam funcionando.
 */
const { HttpError } = require('./http');

const handlers = {
  'auth/login': require('./handlers/login'),
  'auth/logout': require('./handlers/logout'),
  'auth/me': require('./handlers/me'),
  catalog: require('./handlers/catalog'),
  orders: require('./handlers/orders'),
  'order-cancel': require('./handlers/order-cancel'),
  'admin/overview': require('./handlers/admin-overview'),
  'admin/movements': require('./handlers/admin-movements'),
  'admin/stock': require('./handlers/admin-stock'),
  'admin/products': require('./handlers/admin-products'),
  'admin/product': require('./handlers/admin-product'),
  'admin/orders': require('./handlers/admin-orders'),
  'admin/seed': require('./handlers/admin-seed'),
};

async function dispatch(req, res) {
  try {
    let parts = null;

    // O caminho original vem do vercel.json (?path=...). O fallback é o próprio
    // req.url, usado quando a função é chamada direto (testes locais).
    try {
      const url = new URL(req.url || '/', 'http://zavala.local');
      const fromQuery = url.searchParams.get('path');
      const raw = fromQuery != null ? fromQuery : url.pathname.replace(/^\/api\/?/, '');
      parts = String(raw).split('/').filter(Boolean);
    } catch (e) {
      parts = null;
    }

    if (!Array.isArray(parts) || !parts.length) {
      throw new HttpError(404, 'Rota não encontrada.', 'ROTA');
    }

    const slug = parts.filter(Boolean).map((part) => {
      try { return decodeURIComponent(part); } catch (e) { return part; }
    });

    let key = slug.join('/');
    let handler = handlers[key];

    // /api/admin/products/<chave> → handler com req.query.id
    if (!handler && slug[0] === 'admin' && slug[1] === 'products' && slug.length === 3) {
      key = 'admin/product';
      handler = handlers[key];
      req.query = req.query || {};
      req.query.id = slug[2];
    }

    if (!handler) throw new HttpError(404, 'Rota não encontrada.', 'ROTA');
    return await handler(req, res);
  } catch (err) {
    const { sendError } = require('./http');
    return sendError(res, err);
  }
}

module.exports = { dispatch, handlers };
