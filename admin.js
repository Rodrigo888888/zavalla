/**
 * ZAVALLA — Controle de Estoque (painel administrativo)
 * Toda a informação vem do servidor (/api/admin/*). Nada de estoque no navegador:
 * se a sessão expirar, o painel simplesmente volta para a tela de login.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const state = {
    user: null,
    // Token da sessão em memória (nunca gravado no dispositivo). Serve como
    // rede de segurança para navegadores/WebView que descartam cookies.
    token: null,
    products: [],
    movements: [],
    orders: [],
    kpis: null,
    search: '',
    category: 'all',
    movementType: 'all',
    editingKey: null,
    stockKey: null,
  };

  const TYPE_LABEL = {
    entrada: 'Entrada',
    saida: 'Saída',
    ajuste: 'Ajuste',
    devolucao: 'Devolução',
    cadastro: 'Cadastro',
    desativacao: 'Desativação',
  };

  const STATUS_LABEL = {
    pendente: 'Pendente',
    confirmada: 'Confirmada',
    cancelada: 'Cancelada',
  };

  // -------------------------------------------------------------------------
  // Utilidades
  // -------------------------------------------------------------------------
  async function api(path, options) {
    const opts = Object.assign(
      { headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' },
      options || {}
    );
    opts.headers = Object.assign({}, opts.headers);
    if (state.token) opts.headers['X-Zavala-Session'] = state.token;
    let res;
    try {
      res = await fetch(path, opts);
    } catch (e) {
      const err = new Error('Sem conexão com o servidor do painel. Verifique a internet e tente novamente.');
      err.network = true;
      throw err;
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Não foi possível concluir a operação.');
      err.status = res.status;
      err.code = data && data.code;
      throw err;
    }
    return data;
  }

  let toastTimer = null;
  function toast(message, kind) {
    const el = $('toast');
    el.textContent = message;
    el.className = 'toast' + (kind ? ' is-' + kind : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatBRL(value) {
    const n = Number(value) || 0;
    if (!n) return 'A confirmar';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  /**
   * Lê números como o lojista digita no Brasil: "129,90", "1.299,90",
   * "129.90" e "129" são todos aceitos. Retorna null para campo vazio e
   * NaN quando o conteúdo não é um número (para o formulário mostrar o
   * erro em vez de salvar zerado sem avisar).
   */
  function parseBrNumber(raw) {
    let s = String(raw == null ? '' : raw).trim().replace(/^r\$\s*/i, '').replace(/\s+/g, '');
    if (!s) return null;
    if (s.indexOf(',') > -1) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
    return Number(s);
  }

  function formatBr(value, decimals) {
    return (Number(value) || 0).toFixed(decimals == null ? 2 : decimals).replace('.', ',');
  }

  function stockBadge(p) {
    if (p.stockControl === false || p.stock == null) return '<span class="badge badge-free">Estoque livre</span>';
    if (p.stock <= 0) return '<span class="badge badge-out">Esgotado</span>';
    if (p.low) return '<span class="badge badge-low">Estoque baixo</span>';
    return '<span class="badge badge-ok">Disponível</span>';
  }

  function thumbSrc(p) {
    const img = String(p.image || '').trim();
    if (!img) return 'assets/product-o.svg';
    return img;
  }

  function handleAuthError(err) {
    if (err && err.status === 401) {
      state.user = null;
      state.token = null;
      showLogin();
      toast('Sua sessão expirou. Entre novamente.', 'warn');
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Login / sessão
  // -------------------------------------------------------------------------
  function showLogin() {
    $('app').hidden = true;
    $('loginScreen').hidden = false;
    $('loginPassword').value = '';
    $('loginError').hidden = true;
  }

  function showApp() {
    $('loginScreen').hidden = true;
    $('app').hidden = false;
    $('topbarUser').textContent = 'Olá, ' + state.user;
  }

  async function boot() {
    try {
      const me = await api('/api/auth/me');
      state.user = me.user;
      showApp();
      await loadOverview();
    } catch (e) {
      showLogin();
    }
  }

  $('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorBox = $('loginError');
    const button = $('loginBtn');
    errorBox.hidden = true;
    button.disabled = true;
    button.textContent = 'Verificando…';
    try {
      const result = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ user: $('loginUser').value.trim(), password: $('loginPassword').value }),
      });
      state.user = result.user;
      state.token = result.token || null;
      // Confirma que o navegador realmente guardou o cookie da sessão.
      // Sem isso, um bloqueio de cookie pareceria "sessão expirada" sem explicação.
      try {
        const me = await api('/api/auth/me');
        state.user = me.user || state.user;
      } catch (sessionErr) {
        errorBox.textContent = 'Entrada aceita, mas este navegador não guardou a sessão. ' +
          'Verifique se não está no modo anônimo/privativo e se o navegador aceita cookies deste site, e tente novamente.';
        errorBox.hidden = false;
        return;
      }
      showApp();
      await loadOverview();
      toast('Bem-vindo(a) de volta, ' + state.user + '.');
    } catch (err) {
      errorBox.textContent = err.message || 'Usuário ou senha incorretos.';
      errorBox.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = 'Entrar';
    }
  });

  $('logoutBtn').addEventListener('click', async () => {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch (e) { /* ignora */ }
    state.user = null;
    state.token = null;
    showLogin();
  });

  $('refreshBtn').addEventListener('click', () => loadOverview(true));

  // -------------------------------------------------------------------------
  // Carga de dados
  // -------------------------------------------------------------------------
  async function loadOverview(silent) {
    try {
      const data = await api('/api/admin/overview');
      state.user = data.user || state.user;
      state.products = data.products || [];
      state.movements = data.movements || [];
      state.orders = data.orders || [];
      state.kpis = data.kpis;
      $('topbarUser').textContent = 'Olá, ' + state.user;
      renderKpis();
      renderProducts();
      renderOrders();
      renderMovements();
      if (silent) toast('Dados atualizados.');
    } catch (err) {
      if (handleAuthError(err)) return;
      toast(err.message, 'error');
      $('productsHint').textContent = 'Não foi possível carregar os dados. Tente novamente.';
    }
  }

  function renderKpis() {
    const k = state.kpis || {};
    $('kpiProducts').textContent = k.totalProducts != null ? k.totalProducts : '—';
    $('kpiUnits').textContent = k.totalUnits != null ? k.totalUnits : '—';
    $('kpiLow').textContent = k.lowStock != null ? k.lowStock : '—';
    $('kpiOut').textContent = k.soldOut != null ? k.soldOut : '—';
    const pending = state.orders.filter((o) => o.status === 'pendente').length;
    const badge = $('pendingBadge');
    badge.textContent = pending;
    badge.hidden = pending === 0;
  }

  // -------------------------------------------------------------------------
  // Produtos
  // -------------------------------------------------------------------------
  function filteredProducts() {
    const term = state.search.trim().toLowerCase();
    return state.products.filter((p) => {
      if (state.category !== 'all' && p.category !== state.category) return false;
      if (term && String(p.name).toLowerCase().indexOf(term) === -1) return false;
      return true;
    });
  }

  function renderProducts() {
    const list = filteredProducts();
    const body = $('productsBody');
    const cards = $('productsCards');
    const hint = $('productsHint');

    if (!state.products.length) {
      hint.textContent = 'Nenhum produto no banco ainda. Use "Importar produtos da loja" para trazer o catálogo que já está à venda.';
    } else if (!list.length) {
      hint.textContent = 'Nenhum produto encontrado para esse filtro.';
    } else {
      hint.textContent = list.length + ' de ' + state.products.length + ' produto(s) · Use − e + para mexer no estoque; em Editar você muda preço, foto e descrição. Compra na loja baixa sozinha.';
    }

    body.innerHTML = list.map((p) => `
      <tr data-key="${esc(p.key)}">
        <td>
          <div class="prod-cell">
            <img class="prod-thumb" src="${esc(thumbSrc(p))}" alt="" loading="lazy">
            <div>
              <div class="prod-name">${esc(p.name)}</div>
              <div class="prod-type">${esc(p.type || '—')}${p.active === false ? ' · inativo' : ''}</div>
            </div>
          </div>
        </td>
        <td>${p.category === 'joias' ? 'Joias' : 'Perfumes'}</td>
        <td class="num">${formatBRL(p.priceBRL)}</td>
        <td class="num">
          <div class="qty-line">
            <span class="qty-value">${p.stockControl === false || p.stock == null ? '—' : p.stock}</span>
            ${p.stockControl === false || p.stock == null ? '' : '<span class="qty-unit">un.</span>'}
          </div>
          <div style="text-align:right">${stockBadge(p)}</div>
        </td>
        <td>
          <div class="row-actions">
            <button class="btn-mini" type="button" data-act="dec" title="Remover 1 unidade">−</button>
            <button class="btn-mini" type="button" data-act="inc" title="Adicionar 1 unidade">+</button>
            <button class="link-btn" type="button" data-act="adjust">Ajustar</button>
          </div>
        </td>
        <td>
          <div class="row-actions">
            <button class="link-btn" type="button" data-act="edit">Editar</button>
            <button class="link-btn is-danger" type="button" data-act="del">Excluir</button>
          </div>
        </td>
      </tr>`).join('');

    cards.innerHTML = list.map((p) => {
      const controlled = !(p.stockControl === false || p.stock == null);
      const low = controlled ? Math.max(1, Number(p.lowStockThreshold) || 1) : 1;
      const pct = controlled ? Math.max(4, Math.min(100, Math.round((p.stock / (low * 2)) * 100))) : 100;
      const barColor = !controlled ? 'var(--dourado)' : p.stock === 0 ? 'var(--erro)' : p.stock <= low ? 'var(--aviso)' : 'var(--ok)';
      return `
      <article class="card" data-key="${esc(p.key)}">
        <div class="card-photo">
          <img class="card-thumb" src="${esc(thumbSrc(p))}" alt="${esc(p.name)}" loading="lazy">
        </div>
        <div class="card-body">
          <div class="card-meta">${p.category === 'joias' ? 'Joias' : 'Perfumes'}${p.type ? ' · ' + esc(p.type) : ''}${p.active === false ? ' · inativo' : ''}</div>
          <div class="card-name">${esc(p.name)}</div>
          <div class="card-price">${formatBRL(p.priceBRL)}</div>
          <div class="card-stock">
            <div class="card-qty">
              ${controlled ? '<span class="qty-value">' + p.stock + '</span><span class="qty-unit">un. em estoque</span>' : '<span class="qty-unit">estoque livre</span>'}
            </div>
            ${stockBadge(p)}
          </div>
          <div class="stock-bar"><span style="width:${pct}%;background:${barColor}"></span></div>
        </div>
        <div class="card-actions">
          <button class="btn-mini" type="button" data-act="dec" title="Tirar 1 unidade do estoque">−</button>
          <button class="btn-mini" type="button" data-act="inc" title="Adicionar 1 unidade">+</button>
          <button class="link-btn" type="button" data-act="adjust">Ajustar</button>
          <button class="link-btn" type="button" data-act="edit">Editar</button>
          <button class="link-btn is-danger" type="button" data-act="del">Excluir</button>
        </div>
      </article>`;
    }).join('');
  }

  function findProduct(key) {
    return state.products.find((p) => p.key === key) || null;
  }

  async function quickStock(key, mode) {
    const product = findProduct(key);
    if (!product) return;
    // Só bloqueia "−1" quando o controle está ativo e não há unidades.
    if (mode === 'sub' && product.stockControl !== false && product.stock <= 0) {
      toast(product.name + ' já está esgotado.', 'warn');
      return;
    }
    try {
      const result = await api('/api/admin/stock', {
        method: 'POST',
        body: JSON.stringify({ key, mode, qty: 1, note: 'ajuste rápido no painel' }),
      });
      applyProduct(result.product);
      renderKpis();
      renderProducts();
      await refreshMovements();
      toast(mode === 'add'
        ? '1 unidade adicionada a ' + result.product.name + '.'
        : '1 unidade removida de ' + result.product.name + '.');
    } catch (err) {
      if (handleAuthError(err)) return;
      toast(err.message, 'error');
    }
  }

  function applyProduct(product) {
    if (!product) return;
    const idx = state.products.findIndex((p) => p.key === product.key);
    if (idx > -1) state.products[idx] = product;
    else state.products.push(product);
  }

  /**
   * Retira o produto da vitrine (DELETE no backend = desativação, preserva o
   * histórico de movimentações e vendas). Pode ser reativado depois pelo
   * checkbox "Visível na loja" no formulário de edição.
   */
  async function confirmDeleteProduct(key) {
    const product = findProduct(key);
    if (!product) return;
    const confirmed = await askConfirm({
      title: 'Excluir produto',
      text: 'O produto "' + product.name + '" será retirado da vitrine da loja. O histórico de vendas e movimentações fica preservado, e você pode marcá-lo como "Visível na loja" mais tarde para voltar.',
      okLabel: 'Excluir',
    });
    if (!confirmed) return;
    try {
      await api('/api/admin/products/' + encodeURIComponent(key), { method: 'DELETE', body: '{}' });
      toast('Produto "' + product.name + '" excluído da vitrine.');
      await loadOverview();
    } catch (err) {
      if (handleAuthError(err)) return;
      toast(err.message, 'error');
    }
  }

  async function refreshMovements() {
    try {
      const data = await api('/api/admin/movements?limit=200');
      state.movements = data.movements || [];
      renderMovements();
    } catch (e) { /* melhor esforço */ }
  }

  // Delegação de cliques (tabela e cartões)
  function onProductsClick(event) {
    const button = event.target.closest('[data-act]');
    if (!button) return;
    const container = button.closest('[data-key]');
    if (!container) return;
    const key = container.getAttribute('data-key');
    const act = button.getAttribute('data-act');
    if (act === 'inc') return quickStock(key, 'add');
    if (act === 'dec') return quickStock(key, 'sub');
    if (act === 'adjust') return openStockModal(key);
    if (act === 'edit') return openProductModal(key);
    if (act === 'del') return confirmDeleteProduct(key);
  }

  $('productsBody').addEventListener('click', onProductsClick);
  $('productsCards').addEventListener('click', onProductsClick);

  $('searchInput').addEventListener('input', (e) => {
    state.search = e.target.value || '';
    renderProducts();
  });

  $('categoryFilter').addEventListener('change', (e) => {
    state.category = e.target.value;
    renderProducts();
  });

  $('seedBtn').addEventListener('click', async () => {
    const button = $('seedBtn');
    button.disabled = true;
    try {
      const result = await api('/api/admin/seed', { method: 'POST', body: '{}' });
      toast(result.message || 'Catálogo sincronizado.');
      await loadOverview();
    } catch (err) {
      if (!handleAuthError(err)) toast(err.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  // -------------------------------------------------------------------------
  // Pedidos
  // -------------------------------------------------------------------------
  function renderOrders() {
    const body = $('ordersBody');
    const cards = $('ordersCards');
    const empty = $('ordersEmpty');
    const orders = state.orders || [];
    empty.hidden = orders.length > 0;

    body.innerHTML = orders.map((o) => `
      <tr data-id="${esc(o.id)}">
        <td>
          <div class="prod-name">${esc(o.id)}</div>
          <div class="prod-type">${formatDate(o.createdAt)}</div>
        </td>
        <td>
          <div>${esc(o.customer && o.customer.name) || '—'}</div>
          <div class="prod-type">${esc(o.customer && o.customer.phone) || ''}</div>
        </td>
        <td>${(o.items || []).map((i) => esc(i.qty) + '× ' + esc(i.name) + (i.volume ? ' (' + esc(i.volume) + ')' : '')).join('<br>')}</td>
        <td class="num">${formatBRL(o.totalBRL)}</td>
        <td><span class="badge badge-${o.status === 'pendente' ? 'pending' : o.status === 'confirmada' ? 'confirmed' : 'cancelled'}">${STATUS_LABEL[o.status] || esc(o.status)}</span></td>
        <td>
          <div class="row-actions">
            ${o.status === 'pendente' ? `
              <button class="link-btn" type="button" data-act="confirm">Confirmar</button>
              <button class="link-btn is-danger" type="button" data-act="cancel">Cancelar</button>` : '—'}
          </div>
        </td>
      </tr>`).join('');

    cards.innerHTML = orders.map((o) => `
      <article class="card" data-id="${esc(o.id)}">
        <div class="card-info">
          <div class="card-name">${esc(o.id)}</div>
          <div class="card-meta">${formatDate(o.createdAt)} · ${esc(o.customer && o.customer.name) || 'cliente'}</div>
        </div>
        <div class="card-lines">
          ${(o.items || []).map((i) => `<div><strong>${esc(i.qty)}×</strong> ${esc(i.name)}${i.volume ? ' · ' + esc(i.volume) : ''}</div>`).join('')}
        </div>
        <div class="card-stock">
          <span class="card-price">${formatBRL(o.totalBRL)}</span>
          <span class="badge badge-${o.status === 'pendente' ? 'pending' : o.status === 'confirmada' ? 'confirmed' : 'cancelled'}">${STATUS_LABEL[o.status] || esc(o.status)}</span>
        </div>
        ${o.status === 'pendente' ? `
          <div class="card-actions">
            <button class="btn btn-outline" type="button" data-act="confirm">Confirmar</button>
            <button class="btn btn-ghost" type="button" data-act="cancel">Cancelar</button>
          </div>` : ''}
      </article>`).join('');
  }

  async function onOrderAction(id, action) {
    try {
      const result = await api('/api/admin/orders', {
        method: 'POST',
        body: JSON.stringify({ id, action }),
      });
      toast(result.message || 'Pedido atualizado.');
      await loadOverview();
    } catch (err) {
      if (!handleAuthError(err)) toast(err.message, 'error');
    }
  }

  function bindOrderClicks(container) {
    container.addEventListener('click', (event) => {
      const button = event.target.closest('[data-act]');
      if (!button) return;
      const row = button.closest('[data-id]');
      if (!row) return;
      onOrderAction(row.getAttribute('data-id'), button.getAttribute('data-act'));
    });
  }
  bindOrderClicks($('ordersBody'));
  bindOrderClicks($('ordersCards'));

  // -------------------------------------------------------------------------
  // Movimentações
  // -------------------------------------------------------------------------
  function renderMovements() {
    const list = (state.movements || []).filter((m) => state.movementType === 'all' || m.type === state.movementType);
    $('movementsEmpty').hidden = list.length > 0;

    $('movementsBody').innerHTML = list.map((m) => `
      <tr>
        <td>${formatDate(m.at)}</td>
        <td>${esc(m.productName || m.productKey)}</td>
        <td class="num">${m.delta > 0 ? '+' : ''}${m.delta}</td>
        <td class="num">${m.before != null && m.after != null ? esc(m.before) + ' → ' + esc(m.after) : '—'}</td>
        <td><span class="badge">${TYPE_LABEL[m.type] || esc(m.type)}</span></td>
        <td>${esc(m.user || '—')}${m.reason ? '<div class="prod-type">' + esc(m.reason) + '</div>' : ''}</td>
      </tr>`).join('');

    $('movementsCards').innerHTML = list.map((m) => `
      <article class="card">
        <div class="card-info">
          <div class="card-name">${esc(m.productName || m.productKey)}</div>
          <div class="card-meta">${formatDate(m.at)} · ${TYPE_LABEL[m.type] || esc(m.type)}</div>
        </div>
        <div class="card-stock">
          <span class="card-qty"><span class="qty-value">${m.delta > 0 ? '+' : ''}${m.delta}</span></span>
          <span class="badge">${m.before != null && m.after != null ? esc(m.before) + ' → ' + esc(m.after) : '—'}</span>
        </div>
        <div class="card-lines">${esc(m.user || '—')}${m.reason ? ' · ' + esc(m.reason) : ''}</div>
      </article>`).join('');
  }

  $('movementTypeFilter').addEventListener('change', (e) => {
    state.movementType = e.target.value;
    renderMovements();
  });

  // -------------------------------------------------------------------------
  // Abas
  // -------------------------------------------------------------------------
  const TAB_TITLES = {
    products: ['Produtos', 'Preço, foto e quantidade de cada produto — a loja atualiza na hora.'],
    orders: ['Pedidos', 'Compras feitas na loja. Confirme ou cancele; o estoque se ajusta sozinho.'],
    movements: ['Movimentações', 'Histórico de tudo que entrou, saiu ou mudou no estoque.'],
  };

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('is-active'));
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('is-active'));
      tab.classList.add('is-active');
      const target = tab.getAttribute('data-tab');
      const panel = $('panel-' + target);
      if (panel) panel.classList.add('is-active');
      const title = TAB_TITLES[target];
      if (title) {
        $('pageTitle').textContent = title[0];
        $('pageSub').textContent = title[1];
      }
    });
  });

  // -------------------------------------------------------------------------
  // Modais
  // -------------------------------------------------------------------------
  function openModal(id) {
    $('modalBackdrop').hidden = false;
    ['productModal', 'stockModal', 'confirmModal'].forEach((m) => { $(m).hidden = m !== id; });
    document.body.style.overflow = 'hidden';
  }

  function closeModals() {
    $('modalBackdrop').hidden = true;
    $('productModal').hidden = true;
    $('stockModal').hidden = true;
    $('confirmModal').hidden = true;
    document.body.style.overflow = '';
    $('productFormError').hidden = true;
    $('stockFormError').hidden = true;
    settleConfirm(false);
  }

  // ---- Confirmação (usada na exclusão de produto) ---------------------------
  let confirmResolver = null;
  function settleConfirm(value) {
    if (!confirmResolver) return;
    const resolve = confirmResolver;
    confirmResolver = null;
    resolve(value);
  }
  function askConfirm(options) {
    settleConfirm(false);
    return new Promise((resolve) => {
      confirmResolver = resolve;
      $('confirmTitle').textContent = (options && options.title) || 'Confirmar';
      $('confirmText').textContent = (options && options.text) || '';
      $('confirmOkBtn').textContent = (options && options.okLabel) || 'Confirmar';
      $('confirmError').hidden = true;
      openModal('confirmModal');
      setTimeout(() => $('confirmOkBtn').focus(), 60);
    });
  }
  $('confirmOkBtn').addEventListener('click', () => settleConfirm(true));
  $('confirmCancelBtn').addEventListener('click', () => closeModals());

  document.addEventListener('click', (event) => {
    if (event.target.matches('[data-close]') || event.target === $('modalBackdrop')) closeModals();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('modalBackdrop').hidden) closeModals();
  });

  // ---- Cadastro / edição ----------------------------------------------------
  function volumesToText(volumes) {
    return (volumes || []).map((v) => v.label + ':' + v.multiplier).join('; ');
  }

  function textToVolumes(text) {
    return String(text || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const bits = part.split(':');
        const mult = parseBrNumber(bits[1]);
        return {
          label: (bits[0] || '').trim(),
          multiplier: Number.isFinite(mult) && mult > 0 ? mult : 1,
        };
      })
      .filter((v) => v.label);
  }

  function openProductModal(key) {
    const product = key ? findProduct(key) : null;
    state.editingKey = product ? product.key : null;
    $('productModalTitle').textContent = product ? 'Editar ' + product.name : 'Novo produto';
    $('pfKey').value = product ? product.key : '';
    $('pfName').value = product ? product.name : '';
    $('pfCategory').value = product ? product.category : 'perfumes';
    $('pfType').value = product ? product.type || '' : '';
    $('pfPrice').value = product && Number(product.priceBRL) > 0 ? formatBr(product.priceBRL, 2) : '';
    $('pfImage').value = product ? product.image || '' : '';
    $('pfStock').value = product && product.stock != null ? product.stock : 0;
    $('pfLow').value = product ? product.lowThreshold : 3;
    $('pfVolumes').value = product ? volumesToText(product.volumes) : '50 ML:1';
    $('pfDescription').value = product ? product.description || '' : '';
    $('pfTopNotes').value = product ? product.topNotes || '' : '';
    $('pfHeartNotes').value = product ? product.heartNotes || '' : '';
    $('pfBaseNotes').value = product ? product.baseNotes || '' : '';
    $('pfActive').checked = product ? product.active !== false : true;
    $('pfStockControl').checked = product ? product.stockControl === true : false;
    $('pfStockHint').hidden = false;
    $('productFormError').hidden = true;
    openModal('productModal');
    setTimeout(() => $('pfName').focus(), 60);
  }

  $('newProductBtn').addEventListener('click', () => openProductModal(null));

  // Digitar uma quantidade no cadastro ativa o controle de estoque do produto.
  $('pfStock').addEventListener('input', () => {
    if (Number($('pfStock').value) > 0) $('pfStockControl').checked = true;
  });

  $('productForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorBox = $('productFormError');
    errorBox.hidden = true;

    // Lê os campos no formato brasileiro e REJEITA conteúdo inválido com
    // mensagem clara — antes, "129,90" era salvo como R$ 0 sem aviso.
    const priceRaw = parseBrNumber($('pfPrice').value);
    const stockRaw = parseBrNumber($('pfStock').value);
    const lowRaw = parseBrNumber($('pfLow').value);

    if (priceRaw !== null && (!Number.isFinite(priceRaw) || priceRaw < 0)) {
      errorBox.textContent = 'Preço inválido. Use apenas números, ex.: 129,90 ou 1299.90.';
      errorBox.hidden = false;
      $('pfPrice').focus();
      return;
    }
    if (stockRaw !== null && (!Number.isFinite(stockRaw) || stockRaw < 0 || Math.floor(stockRaw) !== stockRaw)) {
      errorBox.textContent = 'Estoque inválido. Use um número inteiro, ex.: 5.';
      errorBox.hidden = false;
      $('pfStock').focus();
      return;
    }
    if (lowRaw !== null && (!Number.isFinite(lowRaw) || lowRaw < 0 || Math.floor(lowRaw) !== lowRaw)) {
      errorBox.textContent = 'Alerta de estoque baixo inválido. Use um número inteiro, ex.: 3.';
      errorBox.hidden = false;
      $('pfLow').focus();
      return;
    }

    const payload = {
      name: $('pfName').value.trim(),
      category: $('pfCategory').value,
      type: $('pfType').value.trim(),
      priceBRL: priceRaw === null ? 0 : priceRaw,
      image: $('pfImage').value.trim(),
      stock: stockRaw === null ? 0 : stockRaw,
      lowThreshold: lowRaw === null ? 3 : lowRaw,
      volumes: textToVolumes($('pfVolumes').value),
      description: $('pfDescription').value.trim(),
      topNotes: $('pfTopNotes').value.trim(),
      heartNotes: $('pfHeartNotes').value.trim(),
      baseNotes: $('pfBaseNotes').value.trim(),
      active: $('pfActive').checked,
      stockControl: $('pfStockControl').checked,
    };

    if (!payload.name) {
      errorBox.textContent = 'Informe o nome do produto.';
      errorBox.hidden = false;
      return;
    }

    const button = $('productSaveBtn');
    button.disabled = true;
    try {
      if (state.editingKey) {
        await api('/api/admin/products/' + encodeURIComponent(state.editingKey), { method: 'PUT', body: JSON.stringify(payload) });
        toast('Produto atualizado.');
      } else {
        await api('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) });
        toast('Produto cadastrado.');
      }
      closeModals();
      await loadOverview();
    } catch (err) {
      if (handleAuthError(err)) return;
      errorBox.textContent = err.message;
      errorBox.hidden = false;
    } finally {
      button.disabled = false;
    }
  });

  // ---- Ajuste de estoque ----------------------------------------------------
  function openStockModal(key) {
    const product = findProduct(key);
    if (!product) return;
    state.stockKey = key;
    $('stockProductName').textContent = product.name;
    $('stockCurrent').textContent = product.stock;
    $('smMode').value = 'set';
    $('smQty').value = product.stock;
    $('smNote').value = '';
    $('stockFormError').hidden = true;
    openModal('stockModal');
  }

  $('stockForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorBox = $('stockFormError');
    errorBox.hidden = true;
    const qtyRaw = parseBrNumber($('smQty').value);
    const qty = qtyRaw === null ? NaN : Math.max(0, Math.floor(qtyRaw));
    if (!Number.isFinite(qty)) {
      errorBox.textContent = 'Informe uma quantidade válida (número inteiro, ex.: 5).';
      errorBox.hidden = false;
      return;
    }
    try {
      const result = await api('/api/admin/stock', {
        method: 'POST',
        body: JSON.stringify({ key: state.stockKey, mode: $('smMode').value, qty, note: $('smNote').value.trim() }),
      });
      closeModals();
      applyProduct(result.product);
      renderKpis();
      renderProducts();
      await refreshMovements();
      toast('Estoque de ' + result.product.name + ' atualizado: ' + result.product.stock + ' unidade(s).');
    } catch (err) {
      if (handleAuthError(err)) return;
      errorBox.textContent = err.message;
      errorBox.hidden = false;
    }
  });

  boot();
})();
