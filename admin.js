/**
 * ZAVALLA — Controle de Estoque · painel administrativo v2
 *
 * SPA vanilla (sem frameworks) que conversa com a API do servidor:
 *   /api/auth/*          login, sessão e saída
 *   /api/admin/overview  indicadores reais do dashboard
 *   /api/admin/products  cadastro e edição
 *   /api/admin/stock     movimentações (entrada/saída/perda/ajuste)
 *   /api/admin/movements histórico imutável
 *   /api/admin/suppliers fornecedores
 *   /api/admin/alerts    alertas calculados no servidor
 *   /api/admin/reports   relatórios + exportação CSV
 *   /api/admin/inventory inventário físico
 *   /api/admin/settings  configurações
 *
 * A sessão viaja em memória (cabeçalho X-Zavala-Session) e por cookie HttpOnly
 * gravado pelo servidor. Nada de senha ou dado sensível no navegador.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Estado                                                              */
  /* ------------------------------------------------------------------ */
  const state = {
    token: '',
    user: '',
    products: [],
    suppliers: [],
    settings: {},
    movements: [],
    view: 'overview',
    editingProduct: null,
    editingSupplier: null,
    reportRows: [],
  };

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const CATEGORY_LABELS = { perfumes: 'Perfumes', joias: 'Joias', kits: 'Kits', outros: 'Outros' };
  const TYPE_LABELS = { entrada: 'Entrada', saida: 'Saída', perda: 'Perda', ajuste: 'Ajuste', cadastro: 'Cadastro', inventario: 'Inventário' };

  /* ------------------------------------------------------------------ */
  /* Utilitários de interface                                            */
  /* ------------------------------------------------------------------ */
  let toastTimer = null;
  function toast(message, kind) {
    const el = $('#toast');
    el.textContent = message;
    el.className = 'toast' + (kind === 'error' ? ' is-error' : kind === 'ok' ? ' is-ok' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
  }

  function fmtInt(n) { return Number(n || 0).toLocaleString('pt-BR'); }
  function fmtBRL(n) { return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function opToken() {
    const b = new Uint8Array(12);
    crypto.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  }

  /* ------------------------------------------------------------------ */
  /* Camada de rede                                                      */
  /* ------------------------------------------------------------------ */
  async function api(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers['X-Zavala-Session'] = state.token;
    let res;
    try {
      res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    } catch (e) {
      const err = new Error('Sem conexão com o servidor do painel. Verifique a internet e tente novamente.');
      err.network = true;
      throw err;
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (res.status === 401) {
      handleAuthError();
      const err = new Error((data && data.error) || 'Sessão expirada. Entre novamente.');
      err.status = 401;
      throw err;
    }
    if (!res.ok || (data && data.ok === false)) {
      const err = new Error((data && data.error) || 'Não foi possível concluir a operação.');
      err.status = res.status;
      err.code = data && data.code;
      err.fields = data && data.fields;
      throw err;
    }
    return data;
  }

  function handleAuthError() {
    state.token = '';
    showLogin();
  }

  /* ------------------------------------------------------------------ */
  /* Login / sessão                                                      */
  /* ------------------------------------------------------------------ */
  function showLogin() {
    $('#app').hidden = true;
    $('#loginScreen').hidden = false;
  }

  function showApp() {
    $('#loginScreen').hidden = true;
    $('#app').hidden = false;
    $('#topbarUser').textContent = 'Conectado: ' + state.user;
    $('#settingsUser').textContent = state.user;
  }

  async function boot() {
    try {
      const me = await api('GET', '/api/auth/me');
      state.user = me.user;
      showApp();
      await loadAll();
    } catch (e) {
      showLogin();
    }
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#loginBtn');
    const errEl = $('#loginError');
    errEl.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    try {
      const data = await api('POST', '/api/auth/login', {
        user: $('#loginUser').value.trim(),
        password: $('#loginPassword').value,
      });
      state.token = data.token;
      state.user = data.user;
      // revalida a sessão com o servidor antes de abrir o painel
      const me = await api('GET', '/api/auth/me');
      state.user = me.user;
      $('#loginPassword').value = '';
      showApp();
      await loadAll();
    } catch (err) {
      errEl.textContent = err.message || 'Não foi possível entrar.';
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar no painel';
    }
  });

  async function logout() {
    try { await api('POST', '/api/auth/logout', {}); } catch (e) { /* segue mesmo assim */ }
    state.token = '';
    state.user = '';
    showLogin();
  }

  $('#logoutBtn').addEventListener('click', logout);
  $('#settingsLogout').addEventListener('click', logout);

  /* ------------------------------------------------------------------ */
  /* Navegação (views + drawer mobile)                                   */
  /* ------------------------------------------------------------------ */
  const VIEW_LOADERS = {
    overview: loadOverview,
    products: loadProducts,
    stock: loadStock,
    movements: loadMovements,
    categories: loadCategories,
    suppliers: loadSuppliers,
    alerts: loadAlerts,
    reports: null, // carrega sob demanda (botão "Gerar relatório")
    settings: loadSettings,
  };

  function goto(view) {
    if (!VIEW_LOADERS.hasOwnProperty(view)) view = 'overview';
    state.view = view;
    $$('.view').forEach((v) => { v.classList.remove('is-active'); v.hidden = true; });
    const el = $('#view-' + view);
    el.hidden = false;
    el.classList.add('is-active');
    $$('.nav-item').forEach((b) => b.classList.toggle('is-active', b.dataset.view === view));
    $('#topbarSection').textContent = el.dataset.title || '';
    closeDrawer();
    const loader = VIEW_LOADERS[view];
    if (loader) loader().catch((err) => toast(err.message, 'error'));
  }

  $$('.nav-item').forEach((b) => b.addEventListener('click', () => goto(b.dataset.view)));
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-goto]');
    if (go) { goto(go.dataset.goto); return; }
    const act = e.target.closest('[data-action="new-product"]');
    if (act) { openProductModal(null); }
  });

  function openDrawer() {
    $('#side').classList.add('is-open');
    $('#sideOverlay').hidden = false;
    $('#menuBtn').setAttribute('aria-expanded', 'true');
  }
  function closeDrawer() {
    $('#side').classList.remove('is-open');
    $('#sideOverlay').hidden = true;
    $('#menuBtn').setAttribute('aria-expanded', 'false');
  }
  $('#menuBtn').addEventListener('click', () => {
    $('#side').classList.contains('is-open') ? closeDrawer() : openDrawer();
  });
  $('#sideOverlay').addEventListener('click', closeDrawer);

  /* ------------------------------------------------------------------ */
  /* Carregamento geral                                                  */
  /* ------------------------------------------------------------------ */
  async function loadAll() {
    await Promise.all([loadProducts({ silent: true }), loadSuppliers({ silent: true })]).catch(() => {});
    fillFilterOptions();
    goto('overview');
  }

  $('#refreshBtn').addEventListener('click', async () => {
    try {
      await Promise.all([loadProducts({ silent: true }), loadSuppliers({ silent: true })]);
      fillFilterOptions();
      await (VIEW_LOADERS[state.view] || loadOverview)();
      toast('Dados atualizados.', 'ok');
    } catch (err) { toast(err.message, 'error'); }
  });

  /* ------------------------------------------------------------------ */
  /* VISÃO GERAL                                                         */
  /* ------------------------------------------------------------------ */
  async function loadOverview() {
    const data = await api('GET', '/api/admin/overview');
    const k = data.kpis;

    $('#kpiProducts').textContent = fmtInt(k.totalProducts);
    $('#kpiProductsSub').textContent = k.inactive ? k.inactive + ' arquivado(s)' : ' ';
    $('#kpiUnits').textContent = fmtInt(k.totalUnits);
    $('#kpiUnitsSub').textContent = k.controlled + ' com controle de estoque';
    $('#kpiLow').textContent = fmtInt(k.lowStock);
    $('#kpiOut').textContent = fmtInt(k.soldOut);
    $('#kpiCost').textContent = fmtBRL(k.totalCostBRL);
    $('#kpiOrders').textContent = fmtInt(k.pendingOrders);
    $('#overviewSub').textContent = 'Atualizado em ' + fmtDate(data.serverTime) + ' · ' +
      k.suppliers + ' fornecedor(es) ativo(s)';

    // badge de alertas
    const badge = $('#alertsBadge');
    badge.hidden = !data.alertCount;
    badge.textContent = data.alertCount;

    renderChart(data.series || []);
    renderTopSellers(data.topSellers || []);
    renderMiniMovements(data.movements || []);
    renderMiniAlerts(data.alerts || []);
  }

  function renderChart(series) {
    const host = $('#chart');
    if (!series.length) { host.innerHTML = '<p class="chart-empty">Sem dados no período.</p>'; return; }
    const W = 560, H = 190, pad = 26, base = H - pad;
    const max = Math.max(1, ...series.map((d) => Math.max(d.entradas, d.saidas)));
    const bw = (W - pad * 2) / series.length;
    const barW = Math.max(6, bw * 0.32);

    let bars = '';
    series.forEach((d, i) => {
      const x = pad + i * bw + bw / 2;
      const he = (d.entradas / max) * (base - pad);
      const hs = (d.saidas / max) * (base - pad);
      bars += `<rect x="${(x - barW - 2).toFixed(1)}" y="${(base - he).toFixed(1)}" width="${barW}" height="${he.toFixed(1)}" rx="2.5" fill="#C0A062"><title>${d.day}: ${d.entradas} entrada(s)</title></rect>`;
      bars += `<rect x="${(x + 2).toFixed(1)}" y="${(base - hs).toFixed(1)}" width="${barW}" height="${hs.toFixed(1)}" rx="2.5" fill="#DCCFC7"><title>${d.day}: ${d.saidas} saída(s)</title></rect>`;
      if (i % 3 === 0 || series.length <= 7) {
        bars += `<text x="${x.toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9.5" fill="#9C9089">${d.day.slice(8)}/${d.day.slice(5, 7)}</text>`;
      }
    });

    host.innerHTML =
      `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Entradas e saídas por dia">
        <line x1="${pad}" y1="${base}" x2="${W - pad}" y2="${base}" stroke="#EFE4DE"/>
        ${bars}
      </svg>
      <div class="chart-legend">
        <span><i style="background:#C0A062"></i>Entradas</span>
        <span><i style="background:#DCCFC7"></i>Saídas</span>
      </div>`;
  }

  function renderTopSellers(list) {
    const host = $('#topSellers');
    if (!list.length) {
      host.innerHTML = '<p class="mini-empty">Ainda não há vendas registradas. Quando a loja registrar saídas com pedido, o ranking aparece aqui.</p>';
      return;
    }
    const max = Math.max(1, ...list.map((t) => t.units));
    host.innerHTML = list.map((t, i) => `
      <div class="rank-item">
        <span class="rank-pos">${i + 1}º</span>
        <span class="rank-name" title="${esc(t.name)}">${esc(t.name)}</span>
        <span class="rank-bar"><i style="width:${Math.round((t.units / max) * 100)}%"></i></span>
        <span class="rank-units">${fmtInt(t.units)} un.</span>
      </div>`).join('');
  }

  function renderMiniMovements(movements) {
    const host = $('#overviewMovements');
    if (!movements.length) {
      host.innerHTML = '<p class="mini-empty">Nenhuma movimentação ainda. Registre entradas na aba Estoque.</p>';
      return;
    }
    host.innerHTML = movements.slice(0, 8).map((m) => `
      <div class="mini-row">
        ${badgeForMovement(m.type)}
        <span class="mini-main">${esc(m.productName || '—')}</span>
        <span class="mini-meta">${m.delta > 0 ? '+' : ''}${m.delta} un. · ${fmtDate(m.at)}</span>
      </div>`).join('');
  }

  function renderMiniAlerts(alerts) {
    const host = $('#overviewAlerts');
    if (!alerts.length) {
      host.innerHTML = '<p class="mini-empty">Nenhum alerta no momento — tudo em ordem.</p>';
      return;
    }
    host.innerHTML = alerts.slice(0, 8).map((a) => `
      <div class="mini-row">
        ${badgeForLevel(a.level)}
        <span class="mini-main">${esc(a.name)}</span>
        <span class="mini-meta">${esc(a.message)}</span>
      </div>`).join('');
  }

  function badgeForMovement(type) {
    const map = {
      entrada: 'badge-ok', cadastro: 'badge-ok', saida: 'badge-neutral',
      perda: 'badge-danger', ajuste: 'badge-warn', inventario: 'badge-gold',
    };
    return `<span class="badge ${map[type] || 'badge-neutral'}">${esc(TYPE_LABELS[type] || type)}</span>`;
  }

  function badgeForLevel(level) {
    if (level === 'critico') return '<span class="badge badge-danger">Crítico</span>';
    if (level === 'atencao') return '<span class="badge badge-warn">Atenção</span>';
    return '<span class="badge badge-gold">Info</span>';
  }

  /* ------------------------------------------------------------------ */
  /* PRODUTOS                                                            */
  /* ------------------------------------------------------------------ */
  async function loadProducts(opts) {
    const q = new URLSearchParams();
    const search = $('#productSearch').value.trim();
    const cat = $('#productCategory').value;
    const st = $('#productStatus').value;
    if (search) q.set('search', search);
    if (cat) q.set('category', cat);
    if (st) q.set('status', st);
    const data = await api('GET', '/api/admin/products' + (q.toString() ? '?' + q : ''));
    state.products = data.products || [];
    renderProducts();
    if (!opts || !opts.silent) toast('Produtos atualizados.', 'ok');
  }

  function stockClass(p) {
    if (!p.stockControl) return '';
    if (p.stock === 0) return ' is-out';
    if (p.stock <= (p.minStock || 0)) return ' is-low';
    return '';
  }

  function stockBadge(p) {
    if (p.status === 'inativo') return '<span class="badge badge-neutral">Arquivado</span>';
    if (!p.stockControl) return '<span class="badge badge-neutral">Sem controle</span>';
    if (p.stock === 0) return '<span class="badge badge-danger">Esgotado</span>';
    if (p.stock <= (p.minStock || 0)) return '<span class="badge badge-warn">Estoque baixo</span>';
    return '<span class="badge badge-ok">Normal</span>';
  }

  function renderProducts() {
    const body = $('#productsBody');
    const empty = $('#productsEmpty');
    if (!state.products.length) {
      body.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    body.innerHTML = state.products.map((p) => `
      <tr data-id="${esc(p.id)}">
        <td data-label="Produto"><span class="cell-title">${esc(p.name)}</span><span class="cell-sub">${esc(p.brand || CATEGORY_LABELS[p.category] || p.category)}${p.size ? ' · ' + esc(p.size) : ''}</span></td>
        <td data-label="SKU">${esc(p.sku)}</td>
        <td data-label="Categoria">${esc(CATEGORY_LABELS[p.category] || p.category)}</td>
        <td data-label="Saldo" class="num"><span class="stock-num${stockClass(p)}">${p.stockControl ? fmtInt(p.stock) : '—'}</span></td>
        <td data-label="Mínimo" class="num">${fmtInt(p.minStock)}</td>
        <td data-label="Custo" class="num">${fmtBRL(p.costBRL)}</td>
        <td data-label="Preço" class="num">${fmtBRL(p.priceBRL)}</td>
        <td data-label="Status">${stockBadge(p)}</td>
        <td data-label="Ações" class="actions-col">
          <span class="row-actions">
            <button class="btn btn-outline btn-sm" data-act="move" data-id="${esc(p.id)}">Movimentar</button>
            <button class="btn btn-outline btn-sm" data-act="edit" data-id="${esc(p.id)}">Editar</button>
            <button class="btn btn-ghost btn-sm" data-act="archive" data-id="${esc(p.id)}">${p.status === 'inativo' ? 'Reativar' : 'Arquivar'}</button>
          </span>
        </td>
      </tr>`).join('');
  }

  $('#productSearch').addEventListener('input', debounce(() => loadProducts({ silent: true }), 350));
  $('#productCategory').addEventListener('change', () => loadProducts({ silent: true }));
  $('#productStatus').addEventListener('change', () => loadProducts({ silent: true }));
  $('#newProductBtn').addEventListener('click', () => openProductModal(null));
  $('#overviewNewProduct').addEventListener('click', () => openProductModal(null));

  $('#productsBody').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const product = state.products.find((p) => p.id === btn.dataset.id);
    if (!product) return;
    if (btn.dataset.act === 'edit') openProductModal(product);
    if (btn.dataset.act === 'move') { goto('stock'); setTimeout(() => { $('#stockProduct').value = product.id; updateStockPreview(); }, 60); }
    if (btn.dataset.act === 'archive') confirmArchive(product);
  });

  function confirmArchive(product) {
    const toArchive = product.status !== 'inativo';
    openConfirm({
      title: toArchive ? 'Arquivar produto' : 'Reativar produto',
      text: toArchive
        ? `O produto "${product.name}" ficará inativo e sairá da loja. O saldo e todo o histórico de movimentações são preservados.`
        : `O produto "${product.name}" voltará a ficar ativo. Confira o saldo antes de vendê-lo.`,
      onOk: async () => {
        try {
          await api('DELETE', '/api/admin/products/' + product.id);
          toast(toArchive ? 'Produto arquivado. Histórico preservado.' : 'Produto reativado.', 'ok');
          await Promise.all([loadProducts({ silent: true }), loadStock({ silent: true })]);
          fillFilterOptions();
        } catch (err) { toast(err.message, 'error'); }
      },
    });
  }

  /* ------------------------------------------------------------------ */
  /* Modal de produto                                                    */
  /* ------------------------------------------------------------------ */
  function openProductModal(product) {
    state.editingProduct = product;
    $('#modalProductTitle').textContent = product ? 'Editar produto' : 'Novo produto';
    $('#pQtyLabel').textContent = product
      ? 'Quantidade disponível (diferença vira movimentação registrada)'
      : 'Quantidade disponível (estoque inicial)';
    $('#pName').value = product ? product.name : '';
    $('#pSku').value = product ? product.sku : '';
    $('#pBarcode').value = (product && product.barcode) || '';
    $('#pCategory').value = product ? product.category : 'perfumes';
    $('#pType').value = product ? (product.type || 'outro') : 'perfume';
    $('#pBrand').value = (product && product.brand) || '';
    $('#pSize').value = (product && product.size) || '';
    $('#pLocation').value = (product && product.location) || '';
    $('#pImage').value = (product && product.image) || '';
    $('#pCost').value = product ? product.costBRL : '';
    $('#pPrice').value = product ? product.priceBRL : '';
    $('#pQty').value = product ? product.stock : '';
    $('#pMinStock').value = product ? product.minStock : (state.settings.lowStockDefault != null ? state.settings.lowStockDefault : 3);
    $('#pStatus').value = product ? product.status : 'ativo';
    $('#pStoreKey').value = (product && product.storeKey) || '';
    $('#pDescription').value = (product && product.description) || '';
    $('#pSupplier').value = (product && product.supplierId) || '';
    $('#productFormError').hidden = true;
    clearFieldErrors('#productForm');
    openModal('#modalProduct');
    setTimeout(() => $('#pName').focus(), 80);
  }

  $('#productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#productSaveBtn');
    const editing = state.editingProduct;
    const payload = {
      name: $('#pName').value.trim(),
      sku: $('#pSku').value.trim().toUpperCase(),
      barcode: $('#pBarcode').value.trim(),
      category: $('#pCategory').value,
      type: $('#pType').value,
      brand: $('#pBrand').value.trim(),
      size: $('#pSize').value.trim(),
      supplierId: $('#pSupplier').value || null,
      location: $('#pLocation').value.trim(),
      image: $('#pImage').value.trim(),
      costBRL: $('#pCost').value,
      priceBRL: $('#pPrice').value,
      quantity: $('#pQty').value === '' ? undefined : Number($('#pQty').value),
      initialStock: $('#pQty').value === '' ? undefined : Number($('#pQty').value),
      minStock: $('#pMinStock').value === '' ? 0 : Number($('#pMinStock').value),
      status: $('#pStatus').value,
      storeKey: $('#pStoreKey').value.trim(),
      description: $('#pDescription').value.trim(),
    };

    btn.disabled = true;
    clearFieldErrors('#productForm');
    try {
      if (editing) {
        await api('PUT', '/api/admin/products/' + editing.id, payload);
        toast('Produto atualizado. Saldo alterado por movimentação registrada.', 'ok');
      } else {
        await api('POST', '/api/admin/products', payload);
        toast('Produto cadastrado.', 'ok');
      }
      closeModal();
      await Promise.all([loadProducts({ silent: true }), loadStock({ silent: true })]);
      fillFilterOptions();
    } catch (err) {
      showFormError('#productForm', '#productFormError', err);
    } finally {
      btn.disabled = false;
    }
  });

  /* ------------------------------------------------------------------ */
  /* ESTOQUE (movimentação)                                              */
  /* ------------------------------------------------------------------ */
  async function loadStock(opts) {
    if (!state.products.length) {
      const data = await api('GET', '/api/admin/products');
      state.products = data.products || [];
    }
    renderStockSelect();
    renderStockTable();
    if (!opts || !opts.silent) toast('Saldos atualizados.', 'ok');
  }

  function renderStockSelect() {
    const sel = $('#stockProduct');
    const current = sel.value;
    sel.innerHTML = '<option value="">Selecione um produto…</option>' +
      state.products
        .filter((p) => p.status !== 'inativo')
        .map((p) => `<option value="${esc(p.id)}">${esc(p.name)} — ${esc(p.sku)}${p.stockControl ? ' (' + p.stock + ' un.)' : ''}</option>`)
        .join('');
    if (current) sel.value = current;
  }

  function renderStockTable() {
    const body = $('#stockBody');
    const empty = $('#stockEmpty');
    const list = state.products.filter((p) => p.status !== 'inativo');
    if (!list.length) {
      body.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    body.innerHTML = list.map((p) => `
      <tr data-id="${esc(p.id)}">
        <td data-label="Produto"><span class="cell-title">${esc(p.name)}</span></td>
        <td data-label="SKU">${esc(p.sku)}</td>
        <td data-label="Saldo" class="num"><span class="stock-num${stockClass(p)}">${p.stockControl ? fmtInt(p.stock) : '—'}</span></td>
        <td data-label="Mínimo" class="num">${fmtInt(p.minStock)}</td>
        <td data-label="Situação">${stockBadge(p)}</td>
        <td data-label="Ações" class="actions-col">
          <span class="row-actions">
            <button class="btn btn-outline btn-sm" data-move="entrada" data-id="${esc(p.id)}">+ Entrada</button>
            <button class="btn btn-outline btn-sm" data-move="saida" data-id="${esc(p.id)}">− Saída</button>
          </span>
        </td>
      </tr>`).join('');
  }

  $('#stockBody').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-move]');
    if (!btn) return;
    $('#stockProduct').value = btn.dataset.id;
    $('#stockType').value = btn.dataset.move;
    updateStockPreview();
    $('#stockQty').focus();
  });

  $('#stockProduct').addEventListener('change', updateStockPreview);
  $('#stockType').addEventListener('change', updateStockPreview);

  function updateStockPreview() {
    const p = state.products.find((x) => x.id === $('#stockProduct').value);
    const type = $('#stockType').value;
    $('#stockReasonOpt').textContent = type === 'perda' ? '(obrigatório)' : '(opcional)';
    $('#stockQtyLabel').textContent = type === 'ajuste' ? 'Novo saldo (contagem)' : 'Quantidade';
    const el = $('#stockPreview');
    if (!p) { el.innerHTML = 'Selecione um produto para ver o saldo atual.'; return; }
    const saldo = p.stockControl ? p.stock : 'sem controle';
    el.innerHTML = `Saldo atual de <strong>${esc(p.name)}</strong>: <strong>${saldo}</strong>${p.stockControl ? ' un.' : ''}`;
  }

  $('#stockForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const productId = $('#stockProduct').value;
    const type = $('#stockType').value;
    const qty = Number($('#stockQty').value);
    const reason = $('#stockReason').value.trim();
    if (!productId) { toast('Selecione o produto.', 'error'); return; }
    if (!Number.isFinite(qty) || (type !== 'ajuste' && qty <= 0) || (type === 'ajuste' && qty < 0)) {
      toast('Informe uma quantidade válida.', 'error');
      return;
    }
    if (type === 'perda' && !reason) { toast('Descreva o motivo da perda (obrigatório para auditoria).', 'error'); return; }

    const isSet = type === 'ajuste';
    openConfirm({
      title: 'Confirmar movimentação',
      text: `${TYPE_LABELS[type]} de ${isSet ? 'saldo para ' : ''}${qty} unidade(s). ${reason ? 'Motivo: ' + reason : ''}`,
      onOk: async () => {
        try {
          const data = await api('POST', '/api/admin/stock', {
            productId, type, qty, reason: reason || null,
            mode: isSet ? 'set' : 'delta',
            opToken: opToken(), // anti-duplicidade em reenvios de rede
          });
          toast(data.duplicate ? 'Operação já registrada — nada alterado de novo.' : 'Movimentação registrada.', 'ok');
          $('#stockQty').value = '';
          $('#stockReason').value = '';
          await Promise.all([loadProducts({ silent: true })]);
          renderStockSelect();
          renderStockTable();
          updateStockPreview();
        } catch (err) { toast(err.message, 'error'); }
      },
    });
  });

  /* ------------------------------------------------------------------ */
  /* MOVIMENTAÇÕES                                                       */
  /* ------------------------------------------------------------------ */
  async function loadMovements() {
    const q = new URLSearchParams();
    if ($('#movFrom').value) q.set('from', $('#movFrom').value);
    if ($('#movTo').value) q.set('to', $('#movTo').value);
    if ($('#movType').value) q.set('type', $('#movType').value);
    q.set('limit', '300');
    const data = await api('GET', '/api/admin/movements?' + q);
    const search = $('#movProductSearch').value.trim().toLowerCase();
    let list = data.movements || [];
    if (search) list = list.filter((m) => (m.productName || '').toLowerCase().includes(search) || (m.productSku || '').toLowerCase().includes(search));
    state.movements = list;
    renderMovements();
  }

  function renderMovements() {
    const body = $('#movementsBody');
    const empty = $('#movementsEmpty');
    if (!state.movements.length) {
      body.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    body.innerHTML = state.movements.map((m) => `
      <tr>
        <td data-label="Data">${fmtDate(m.at)}</td>
        <td data-label="Produto"><span class="cell-title">${esc(m.productName || '—')}</span><span class="cell-sub">${esc(m.productSku || '')}</span></td>
        <td data-label="Tipo">${badgeForMovement(m.type)}</td>
        <td data-label="Qtd." class="num"><strong>${m.delta > 0 ? '+' : ''}${m.delta}</strong></td>
        <td data-label="Antes" class="num">${m.before == null ? '—' : m.before}</td>
        <td data-label="Depois" class="num">${m.after == null ? '—' : m.after}</td>
        <td data-label="Responsável">${esc(m.user || '—')}</td>
        <td data-label="Motivo">${esc(m.reason || (m.orderId ? 'Pedido ' + m.orderId : '—'))}</td>
      </tr>`).join('');
  }

  ['#movFrom', '#movTo', '#movType'].forEach((sel) => $(sel).addEventListener('change', () => loadMovements().catch((err) => toast(err.message, 'error'))));
  $('#movProductSearch').addEventListener('input', debounce(() => { renderMovements(); }, 250));
  $('#movRefresh').addEventListener('click', () => loadMovements().then(() => toast('Histórico atualizado.', 'ok')).catch((err) => toast(err.message, 'error')));

  /* ------------------------------------------------------------------ */
  /* CATEGORIAS                                                          */
  /* ------------------------------------------------------------------ */
  async function loadCategories() {
    if (!state.products.length) {
      const data = await api('GET', '/api/admin/products');
      state.products = data.products || [];
    }
    const grid = $('#categoriesGrid');
    const map = new Map();
    for (const p of state.products) {
      if (p.status === 'inativo') continue;
      const c = map.get(p.category) || { count: 0, units: 0, value: 0, low: 0 };
      c.count += 1;
      if (p.stockControl) {
        c.units += p.stock;
        c.value += p.stock * (p.costBRL || 0);
        if (p.stock <= (p.minStock || 0)) c.low += 1;
      }
      map.set(p.category, c);
    }
    if (!map.size) {
      grid.innerHTML = '<div class="empty card"><p class="empty-title">Nenhuma categoria com produtos</p><p class="empty-text">Cadastre produtos para ver a distribuição por categoria.</p><button class="btn btn-solid" data-action="new-product">Cadastrar produto</button></div>';
      return;
    }
    grid.innerHTML = Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count).map(([cat, c]) => `
      <button class="cat-card" data-cat="${esc(cat)}" type="button">
        <span class="cat-name">${esc(CATEGORY_LABELS[cat] || cat)}</span>
        <div class="cat-count">${fmtInt(c.count)}</div>
        <div class="cat-meta">
          ${fmtInt(c.units)} unidade(s) · ${fmtBRL(c.value)} em estoque<br>
          ${c.low ? c.low + ' produto(s) no mínimo ou abaixo' : 'Nenhum produto no mínimo'}
        </div>
      </button>`).join('');
  }

  $('#categoriesGrid').addEventListener('click', (e) => {
    const card = e.target.closest('[data-cat]');
    if (!card) return;
    goto('products');
    setTimeout(() => {
      $('#productCategory').value = card.dataset.cat;
      loadProducts({ silent: true }).catch(() => {});
    }, 60);
  });

  /* ------------------------------------------------------------------ */
  /* FORNECEDORES                                                        */
  /* ------------------------------------------------------------------ */
  async function loadSuppliers(opts) {
    const data = await api('GET', '/api/admin/suppliers');
    state.suppliers = data.suppliers || [];
    renderSuppliers();
    if (!opts || !opts.silent) toast('Fornecedores atualizados.', 'ok');
  }

  function renderSuppliers() {
    const grid = $('#suppliersGrid');
    const empty = $('#suppliersEmpty');
    const active = state.suppliers.filter((s) => s.status !== 'inativo');
    if (!state.suppliers.length) {
      grid.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    grid.innerHTML = state.suppliers.map((s) => {
      const linked = state.products.filter((p) => p.supplierId === s.id).length;
      return `
      <article class="sup-card" data-id="${esc(s.id)}">
        <span class="sup-name">${esc(s.name)}</span>
        ${s.contact ? `<span class="sup-line">Contato: ${esc(s.contact)}</span>` : ''}
        ${s.phone ? `<span class="sup-line">Telefone: ${esc(s.phone)}</span>` : ''}
        ${s.email ? `<span class="sup-line">E-mail: <a href="mailto:${esc(s.email)}">${esc(s.email)}</a></span>` : ''}
        ${s.notes ? `<span class="sup-line">${esc(s.notes)}</span>` : ''}
        <div class="sup-foot">
          <span>${linked} produto(s) vinculado(s) · ${s.status === 'inativo' ? '<span class="badge badge-neutral">Inativo</span>' : '<span class="badge badge-ok">Ativo</span>'}</span>
          <span class="row-actions">
            <button class="btn btn-outline btn-sm" data-sup="edit">Editar</button>
            <button class="btn btn-ghost btn-sm" data-sup="toggle">${s.status === 'inativo' ? 'Reativar' : 'Inativar'}</button>
          </span>
        </div>
      </article>`;
    }).join('');
  }

  $('#suppliersGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-sup]');
    if (!btn) return;
    const card = btn.closest('[data-id]');
    const supplier = state.suppliers.find((s) => s.id === card.dataset.id);
    if (!supplier) return;
    if (btn.dataset.sup === 'edit') openSupplierModal(supplier);
    if (btn.dataset.sup === 'toggle') {
      const toDisable = supplier.status !== 'inativo';
      openConfirm({
        title: toDisable ? 'Inativar fornecedor' : 'Reativar fornecedor',
        text: `O fornecedor "${supplier.name}" será ${toDisable ? 'inativado' : 'reativado'}. Os produtos vinculados são preservados.`,
        onOk: async () => {
          try {
            await api('DELETE' , '/api/admin/suppliers/' + supplier.id);
            toast('Fornecedor atualizado.', 'ok');
            await loadSuppliers({ silent: true });
          } catch (err) { toast(err.message, 'error'); }
        },
      });
    }
  });

  ['#newSupplierBtn', '#newSupplierBtn2'].forEach((sel) => $(sel).addEventListener('click', () => openSupplierModal(null)));

  function openSupplierModal(supplier) {
    state.editingSupplier = supplier;
    $('#modalSupplierTitle').textContent = supplier ? 'Editar fornecedor' : 'Novo fornecedor';
    $('#sName').value = supplier ? supplier.name : '';
    $('#sContact').value = (supplier && supplier.contact) || '';
    $('#sPhone').value = (supplier && supplier.phone) || '';
    $('#sEmail').value = (supplier && supplier.email) || '';
    $('#sNotes').value = (supplier && supplier.notes) || '';
    $('#sStatus').value = supplier ? supplier.status : 'ativo';
    $('#supplierFormError').hidden = true;
    clearFieldErrors('#supplierForm');
    openModal('#modalSupplier');
    setTimeout(() => $('#sName').focus(), 80);
  }

  $('#supplierForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editing = state.editingSupplier;
    const payload = {
      name: $('#sName').value.trim(),
      contact: $('#sContact').value.trim(),
      phone: $('#sPhone').value.trim(),
      email: $('#sEmail').value.trim(),
      notes: $('#sNotes').value.trim(),
      status: $('#sStatus').value,
    };
    clearFieldErrors('#supplierForm');
    try {
      if (editing) {
        await api('PUT', '/api/admin/suppliers/' + editing.id, payload);
        toast('Fornecedor atualizado.', 'ok');
      } else {
        await api('POST', '/api/admin/suppliers', payload);
        toast('Fornecedor cadastrado.', 'ok');
      }
      closeModal();
      await loadSuppliers({ silent: true });
      fillFilterOptions();
    } catch (err) {
      showFormError('#supplierForm', '#supplierFormError', err);
    }
  });

  /* ------------------------------------------------------------------ */
  /* ALERTAS                                                             */
  /* ------------------------------------------------------------------ */
  async function loadAlerts() {
    const data = await api('GET', '/api/admin/alerts');
    const list = data.alerts || [];
    const badge = $('#alertsBadge');
    badge.hidden = !list.length;
    badge.textContent = list.length;

    const host = $('#alertsList');
    const empty = $('#alertsEmpty');
    if (!list.length) {
      host.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    const icon = (level) => level === 'critico'
      ? '<svg class="alert-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#B4453E" stroke-width="1.6" stroke-linecap="round"><path d="M12 4l9 16H3l9-16z"/><path d="M12 10v4M12 17.5v.5"/></svg>'
      : level === 'atencao'
      ? '<svg class="alert-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#A9761F" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16v.5"/></svg>'
      : '<svg class="alert-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#C0A062" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>';
    host.innerHTML = list.map((a) => `
      <div class="alert-row level-${esc(a.level)}">
        ${icon(a.level)}
        <div class="alert-main">
          <div class="alert-name">${esc(a.name)} <span style="color:var(--ink-faint);font-weight:400">· ${esc(a.sku || '')}</span></div>
          <div class="alert-msg">${esc(a.message)}</div>
        </div>
        <button class="btn btn-outline btn-sm" data-alert-product="${esc(a.productId)}">Abrir produto</button>
      </div>`).join('');
  }

  $('#alertsList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-alert-product]');
    if (!btn) return;
    const product = state.products.find((p) => p.id === btn.dataset.alertProduct);
    if (product) openProductModal(product);
  });

  /* ------------------------------------------------------------------ */
  /* RELATÓRIOS                                                          */
  /* ------------------------------------------------------------------ */
  $('#reportType').addEventListener('change', () => {
    const isPeriod = $('#reportType').value === 'movimentacoes';
    $('#reportFrom').hidden = !isPeriod;
    $('#reportTo').hidden = !isPeriod;
  });

  $('#reportRun').addEventListener('click', () => runReport().catch((err) => toast(err.message, 'error')));

  async function runReport() {
    const q = new URLSearchParams({ report: $('#reportType').value });
    if ($('#reportFrom').value) q.set('from', $('#reportFrom').value);
    if ($('#reportTo').value) q.set('to', $('#reportTo').value);
    const data = await api('GET', '/api/admin/reports?' + q);
    state.reportRows = data.rows || [];
    $('#reportTitle').textContent = data.title;
    $('#reportMeta').textContent = state.reportRows.length + ' registro(s) · gerado em ' + fmtDate(data.generatedAt);

    const head = $('#reportHead');
    const body = $('#reportBody');
    const empty = $('#reportEmpty');
    if (!state.reportRows.length) {
      head.innerHTML = '';
      body.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    const cols = Object.keys(state.reportRows[0]);
    head.innerHTML = '<tr>' + cols.map((c) => `<th class="${/quantidade|saldo|minimo|valor|custo|preco|unidades|pedidos|antes|depois/i.test(c) ? 'num' : ''}">${esc(c)}</th>`).join('') + '</tr>';
    body.innerHTML = state.reportRows.map((r) =>
      '<tr>' + cols.map((c) => `<td data-label="${esc(c)}" class="${/quantidade|saldo|minimo|valor|custo|preco|unidades|pedidos|antes|depois/i.test(c) ? 'num' : ''}">${esc(r[c])}</td>`).join('') + '</tr>').join('');
  }

  $('#reportCsv').addEventListener('click', () => {
    const url = '/api/admin/reports?' + new URLSearchParams({
      report: $('#reportType').value,
      format: 'csv',
      from: $('#reportFrom').value || '',
      to: $('#reportTo').value || '',
    });
    // o navegador baixa o CSV com o cookie/sessão normais
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  /* ------------------------------------------------------------------ */
  /* CONFIGURAÇÕES                                                       */
  /* ------------------------------------------------------------------ */
  async function loadSettings() {
    const data = await api('GET', '/api/admin/settings');
    state.settings = data.settings || {};
    $('#setLowStock').value = state.settings.lowStockDefault != null ? state.settings.lowStockDefault : 3;
    $('#setStaleHours').value = state.settings.staleOrderHours != null ? state.settings.staleOrderHours : 48;
  }

  $('#settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = await api('PUT', '/api/admin/settings', {
        lowStockDefault: Number($('#setLowStock').value),
        staleOrderHours: Number($('#setStaleHours').value),
      });
      state.settings = data.settings;
      $('#settingsSaved').textContent = 'Configurações salvas em ' + fmtDate(data.settings.updatedAt) + '.';
      toast('Configurações salvas.', 'ok');
    } catch (err) { toast(err.message, 'error'); }
  });

  /* ------------------------------------------------------------------ */
  /* Modais genéricos                                                    */
  /* ------------------------------------------------------------------ */
  function openModal(sel) {
    $('#modalBackdrop').hidden = false;
    $$('#modalBackdrop .modal').forEach((m) => { m.hidden = m.id !== sel.replace('#', ''); });
  }
  function closeModal() {
    $('#modalBackdrop').hidden = true;
    $$('#modalBackdrop .modal').forEach((m) => { m.hidden = true; });
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeModal();
    if (e.target === $('#modalBackdrop')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#modalBackdrop').hidden) closeModal();
  });

  /* Confirmação com motivo opcional */
  let confirmHandler = null;
  function openConfirm({ title, text, requireReason, onOk }) {
    $('#confirmTitle').textContent = title || 'Confirmar ação';
    $('#confirmText').textContent = text || '';
    $('#confirmReasonField').hidden = !requireReason;
    $('#confirmReason').value = '';
    confirmHandler = onOk;
    openModal('#modalConfirm');
  }
  $('#confirmOk').addEventListener('click', async () => {
    const reason = $('#confirmReason').value.trim();
    if (!$('#confirmReasonField').hidden && !reason) {
      toast('Informe o motivo para continuar.', 'error');
      return;
    }
    const handler = confirmHandler;
    closeModal();
    if (handler) await handler(reason);
  });

  /* Erros de formulário (campos vindos do servidor) */
  function clearFieldErrors(formSel) {
    $$(formSel + ' .input').forEach((i) => i.classList.remove('is-error'));
  }
  const FIELD_INPUT_MAP = {
    name: '#pName', sku: '#pSku', barcode: '#pBarcode', category: '#pCategory',
    type: '#pType', costBRL: '#pCost', priceBRL: '#pPrice', minStock: '#pMinStock',
    initialStock: '#pQty', quantity: '#pQty', status: '#pStatus', email: '#sEmail',
    justification: '#confirmReason',
  };
  function showFormError(formSel, errorSel, err) {
    if (err.fields) {
      let first = null;
      for (const [field, message] of Object.entries(err.fields)) {
        const input = $(FIELD_INPUT_MAP[field] || formSel + ' .input');
        if (input) { input.classList.add('is-error'); if (!first) first = input; }
      }
      const messages = Object.values(err.fields).join(' ');
      $(errorSel).textContent = messages || err.message;
      $(errorSel).hidden = false;
      if (first) first.focus();
      return;
    }
    $(errorSel).textContent = err.message;
    $(errorSel).hidden = false;
  }

  /* ------------------------------------------------------------------ */
  /* Filtros dependentes                                                 */
  /* ------------------------------------------------------------------ */
  function fillFilterOptions() {
    // categorias (filtro de produtos)
    const catSel = $('#productCategory');
    const currentCat = catSel.value;
    const cats = Array.from(new Set(state.products.map((p) => p.category))).sort();
    catSel.innerHTML = '<option value="">Todas as categorias</option>' +
      cats.map((c) => `<option value="${esc(c)}">${esc(CATEGORY_LABELS[c] || c)}</option>`).join('');
    catSel.value = currentCat;

    // fornecedores (campo do formulário de produto)
    const supSel = $('#pSupplier');
    const currentSup = supSel.value;
    const actives = state.suppliers.filter((s) => s.status !== 'inativo');
    supSel.innerHTML = '<option value="">Sem fornecedor</option>' +
      actives.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    supSel.value = currentSup;
  }

  /* ------------------------------------------------------------------ */
  /* Extras                                                              */
  /* ------------------------------------------------------------------ */
  function debounce(fn, ms) {
    let t = null;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  // atalho do dashboard: registrar movimentação rápida
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-goto="stock"]');
    if (go) setTimeout(() => updateStockPreview(), 80);
  });

  boot();
})();
