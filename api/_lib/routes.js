/**
 * ZAVALLA — roteador interno das funções de servidor.
 *
 * O plano Hobby da Vercel permite no máximo 12 funções por deploy, então todos
 * os endpoints moram em uma única função e este roteador decide qual handler
 * atende cada caminho. Os caminhos públicos da loja (/api/catalog, /api/orders,
 * /api/order-cancel) mantêm o mesmo endereço de sempre — a vitrine não muda.
 */
const { HttpError } = require('./http');

const handlers = {
  // ---- loja (público) ----
  'auth/login': require('./handlers/login'),
  'auth/logout': require('./handlers/logout'),
  'auth/me': require('./handlers/me'),
  catalog: require('./handlers/catalog'),
  orders: require('./handlers/orders'),
  'order-cancel': require('./handlers/order-cancel'),

  // ---- painel de estoque (administrador) ----
  'admin/overview': require('./handlers/admin-overview'),
  'admin/products': require('./handlers/admin-products'),
  'admin/product': require('./handlers/admin-product'),
  'admin/stock': require('./handlers/admin-stock'),
  'admin/movements': require('./handlers/admin-movements'),
  'admin/suppliers': require('./handlers/admin-suppliers'),
  'admin/supplier': require('./handlers/admin-supplier'),
  'admin/alerts': require('./handlers/admin-alerts'),
  'admin/reports': require('./handlers/admin-reports'),
  'admin/inventory': require('./handlers/admin-inventory'),
  'admin/settings': require('./handlers/admin-settings'),
  'admin/orders': require('./handlers/admin-orders'),
};

// Rotas com id no caminho: /api/admin/products/<id>, /api/admin/suppliers/<id>
const IDENTIFIER_ROUTES = {
  products: 'admin/product',
  suppliers: 'admin/supplier',
};

async function dispatch(req, res) {
  try {
    let parts = null;

    // O caminho original vem do vercel.json (?path=...). O fallback é o próprio
    // req.url, usado quando a função é chamada direto (testes locais).
    try {
      const url = new URL(req.url || '/', 'http://zavalla.local');
      const fromQuery = url.searchParams.get('path');
      const raw = fromQuery != null ? fromQuery : url.pathname.replace(/^\/api\/?/, '');
      parts = String(raw).split('/').filter(Boolean);
      req.query = req.query || {};
      for (const [k, v] of url.searchParams) if (req.query[k] == null) req.query[k] = v;
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

    // /api/admin/<colecao>/<id> → handler de item com req.query.id
    if (!handler && slug[0] === 'admin' && slug.length === 3 && IDENTIFIER_ROUTES[slug[1]]) {
      key = IDENTIFIER_ROUTES[slug[1]];
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
