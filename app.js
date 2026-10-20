/**
 * ZAVALLA — Lógica do Aplicativo do Cliente
 * JavaScript Puro estritamente aderente à voz peso 400 e aos quatro cinzas quentes.
 */

// ==========================================================================
// Catálogo de Produtos ZAVALLA
// ==========================================================================
// NOTA: basePriceBRL em 0 = preço ainda não confirmado pelo lojista.
// Descrição e notas também pendentes de confirmação.
const PRODUCTS = {
  'asad': {
    name: 'ASAD',
    category: 'perfumes',
    type: 'EAU DE PARFUM',
    basePriceBRL: 0,
    volumeOptions: [
      { label: '50 ML', multiplier: 1 },
      { label: '100 ML', multiplier: 1.45 }
    ],
    selectedVolume: '50 ML',
    image: 'assets/asad.webp',
    description: 'CONFIRMAR',
    topNotes: 'CONFIRMAR',
    heartNotes: 'CONFIRMAR',
    baseNotes: 'CONFIRMAR'
  },
  'yara': {
    name: 'YARA',
    category: 'perfumes',
    type: 'EAU DE PARFUM',
    basePriceBRL: 0,
    volumeOptions: [
      { label: '50 ML', multiplier: 1 },
      { label: '100 ML', multiplier: 1.45 }
    ],
    selectedVolume: '50 ML',
    image: 'assets/yara.webp',
    description: 'CONFIRMAR',
    topNotes: 'CONFIRMAR',
    heartNotes: 'CONFIRMAR',
    baseNotes: 'CONFIRMAR'
  },
  'asad-elixir': {
    name: 'ASAD ELIXIR',
    category: 'perfumes',
    type: 'EXTRAIT DE PARFUM',
    basePriceBRL: 0,
    volumeOptions: [
      { label: '50 ML', multiplier: 1 },
      { label: '100 ML', multiplier: 1.45 }
    ],
    selectedVolume: '50 ML',
    image: 'assets/asad-elixir.webp',
    description: 'CONFIRMAR',
    topNotes: 'CONFIRMAR',
    heartNotes: 'CONFIRMAR',
    baseNotes: 'CONFIRMAR'
  },
  'asad-bourbon': {
    name: 'ASAD BOURBON',
    category: 'perfumes',
    type: 'EAU DE PARFUM',
    basePriceBRL: 0,
    volumeOptions: [
      { label: '50 ML', multiplier: 1 },
      { label: '100 ML', multiplier: 1.45 }
    ],
    selectedVolume: '50 ML',
    image: 'assets/asad-bourbon.webp',
    description: 'CONFIRMAR',
    topNotes: 'CONFIRMAR',
    heartNotes: 'CONFIRMAR',
    baseNotes: 'CONFIRMAR'
  },
  '1-million': {
    name: '1 MILLION',
    category: 'perfumes',
    type: 'EAU DE PARFUM',
    basePriceBRL: 0,
    volumeOptions: [
      { label: '50 ML', multiplier: 1 },
      { label: '100 ML', multiplier: 1.45 }
    ],
    selectedVolume: '50 ML',
    image: 'assets/1-million.webp',
    description: 'CONFIRMAR',
    topNotes: 'CONFIRMAR',
    heartNotes: 'CONFIRMAR',
    baseNotes: 'CONFIRMAR'
  },
  'toque-de-amor': {
    name: 'TOQUE DE AMOR',
    category: 'perfumes',
    type: 'DEO COLÔNIA',
    basePriceBRL: 0,
    volumeOptions: [
      { label: '50 ML', multiplier: 1 }
    ],
    selectedVolume: '50 ML',
    image: 'assets/toque-de-amor.webp',
    description: 'CONFIRMAR',
    topNotes: 'CONFIRMAR',
    heartNotes: 'CONFIRMAR',
    baseNotes: 'CONFIRMAR'
  },
  'liz': {
    name: 'LIZ',
    category: 'perfumes',
    type: 'DEO PARFUM',
    basePriceBRL: 0,
    volumeOptions: [
      { label: '50 ML', multiplier: 1 },
      { label: '100 ML', multiplier: 1.45 }
    ],
    selectedVolume: '50 ML',
    image: 'assets/liz.webp',
    description: 'CONFIRMAR',
    topNotes: 'CONFIRMAR',
    heartNotes: 'CONFIRMAR',
    baseNotes: 'CONFIRMAR'
  },
  'perfume-a': {
    name: 'PERFUME A — NOME PENDENTE',
    category: 'perfumes',
    type: 'CONFIRMAR',
    basePriceBRL: 0,
    volumeOptions: [
      { label: '50 ML', multiplier: 1 }
    ],
    selectedVolume: '50 ML',
    image: 'assets/perfume-a-confirmar.webp',
    description: 'CONFIRMAR',
    topNotes: 'CONFIRMAR',
    heartNotes: 'CONFIRMAR',
    baseNotes: 'CONFIRMAR'
  },
  'perfume-b': {
    name: 'PERFUME B — NOME PENDENTE',
    category: 'perfumes',
    type: 'CONFIRMAR',
    basePriceBRL: 0,
    volumeOptions: [
      { label: '50 ML', multiplier: 1 }
    ],
    selectedVolume: '50 ML',
    image: 'assets/perfume-b-confirmar.webp',
    description: 'CONFIRMAR',
    topNotes: 'CONFIRMAR',
    heartNotes: 'CONFIRMAR',
    baseNotes: 'CONFIRMAR'
  },
  'bodyman-kit': {
    name: 'BODY MAN KIT',
    category: 'perfumes',
    type: 'KIT 3 FRASCOS · 200ML',
    layout: 'kit',
    basePriceBRL: 0,
    volumeOptions: [
      { label: '200 ML', multiplier: 1 }
    ],
    selectedVolume: '200 ML',
    image: 'assets/bodyman-kit.webp',
    description: 'Kit com três frascos: ENIGMA (Amadeirado Especializado), MIDTOWN (Amadeirado Floral Almíscarado) e BARBARIUS (Aromático Fougère).',
    topNotes: 'CONFIRMAR',
    heartNotes: 'CONFIRMAR',
    baseNotes: 'CONFIRMAR'
  },
  'conjunto-prata-coracao': {
    name: 'CONJUNTO PRATA CORAÇÃO',
    category: 'joias',
    type: 'CONJUNTO EM PRATA',
    basePriceBRL: 0,
    volumeOptions: [
      { label: 'PEÇA ÚNICA', multiplier: 1 }
    ],
    selectedVolume: 'PEÇA ÚNICA',
    image: 'assets/WhatsApp Image 2026-10-03 at 10.01.01.webp',
    description: 'CONFIRMAR',
    topNotes: 'CONFIRMAR',
    heartNotes: 'CONFIRMAR',
    baseNotes: 'CONFIRMAR'
  },
  'colecao-coracao-prata': {
    name: 'COLEÇÃO CORAÇÃO PRATA',
    category: 'joias',
    type: 'JOIA EM PRATA',
    basePriceBRL: 0,
    volumeOptions: [
      { label: 'PEÇA ÚNICA', multiplier: 1 }
    ],
    selectedVolume: 'PEÇA ÚNICA',
    image: 'assets/WhatsApp Image 2026-10-03 at 10.01.01 (1).webp',
    description: 'CONFIRMAR',
    topNotes: 'CONFIRMAR',
    heartNotes: 'CONFIRMAR',
    baseNotes: 'CONFIRMAR'
  },
  'mix-prata-classica': {
    name: 'MIX PRATA CLÁSSICA',
    category: 'joias',
    type: 'JOIA EM PRATA',
    basePriceBRL: 0,
    volumeOptions: [
      { label: 'PEÇA ÚNICA', multiplier: 1 }
    ],
    selectedVolume: 'PEÇA ÚNICA',
    image: 'assets/WhatsApp Image 2026-10-03 at 10.01.01 (2).webp',
    description: 'CONFIRMAR',
    topNotes: 'CONFIRMAR',
    heartNotes: 'CONFIRMAR',
    baseNotes: 'CONFIRMAR'
  },
  'colecao-conchas': {
    name: 'COLEÇÃO CONCHAS',
    category: 'joias',
    type: 'JOIA EM PRATA',
    basePriceBRL: 0,
    volumeOptions: [
      { label: 'PEÇA ÚNICA', multiplier: 1 }
    ],
    selectedVolume: 'PEÇA ÚNICA',
    image: 'assets/WhatsApp Image 2026-10-03 at 10.01.01 (3).webp',
    description: 'CONFIRMAR',
    topNotes: 'CONFIRMAR',
    heartNotes: 'CONFIRMAR',
    baseNotes: 'CONFIRMAR'
  },
  'kit-prata-brilho': {
    name: 'KIT PRATA BRILHO',
    category: 'joias',
    type: 'KIT EM PRATA',
    basePriceBRL: 0,
    volumeOptions: [
      { label: 'PEÇA ÚNICA', multiplier: 1 }
    ],
    selectedVolume: 'PEÇA ÚNICA',
    image: 'assets/WhatsApp Image 2026-10-03 at 10.01.01 (4).webp',
    description: 'CONFIRMAR',
    topNotes: 'CONFIRMAR',
    heartNotes: 'CONFIRMAR',
    baseNotes: 'CONFIRMAR'
  }
};

// ==========================================================================
// Moedas & Internacionalização
// ==========================================================================
const CURRENCIES = {
  BRL: { symbol: 'R$', rate: 1.0, format: val => `R$ ${Math.round(val).toLocaleString('pt-BR')}` },
  EUR: { symbol: '€', rate: 0.16, format: val => `€ ${Math.round(val * 0.16)}` },
  USD: { symbol: '$', rate: 0.18, format: val => `$ ${Math.round(val * 0.18)}` }
};

let currentCurrency = 'BRL';
let currentLanguage = 'PT';
let currentModalProduct = null;
let currentModalMultiplier = 1;
let currentModalVolumeLabel = '';

// ==========================================================================
// Estado da Sacola / Carrinho
// ==========================================================================
let cart = [];

function loadCart() {
  try {
    const saved = localStorage.getItem('zavala_cart_v1');
    if (saved) {
      cart = JSON.parse(saved);
    }
  } catch (e) {
    cart = [];
  }
  updateCartUI();
}

function saveCart() {
  try {
    localStorage.setItem('zavala_cart_v1', JSON.stringify(cart));
  } catch (e) {
    // Fallback silencioso
  }
  updateCartUI();
}

// ==========================================================================
// Formatação de Preço
// ==========================================================================
function formatPrice(brlAmount) {
  const curr = CURRENCIES[currentCurrency] || CURRENCIES.BRL;
  return curr.format(brlAmount);
}

function setCurrency(code) {
  if (!CURRENCIES[code]) return;
  currentCurrency = code;
  const btn = document.getElementById('currencyBtn');
  if (btn) btn.textContent = `${code} ▾`;

  // Atualiza preços na grade de produtos
  document.querySelectorAll('.price-val').forEach(el => {
    const baseBRL = parseFloat(el.getAttribute('data-brl'));
    if (!isNaN(baseBRL)) {
      el.textContent = formatPrice(baseBRL);
    }
  });

  // Atualiza modal se estiver aberto
  if (currentModalProduct) {
    updateModalPriceDisplay();
  }

  // Atualiza sacola
  updateCartUI();
}

// ==========================================================================
// Alternador de Idioma
// ==========================================================================
function setLanguage(lang) {
  currentLanguage = lang;
  const btnPT = document.getElementById('langPT');
  const btnEN = document.getElementById('langEN');
  if (btnPT && btnEN) {
    if (lang === 'PT') {
      btnPT.classList.add('active');
      btnEN.classList.remove('active');
    } else {
      btnEN.classList.add('active');
      btnPT.classList.remove('active');
    }
  }
}

// ==========================================================================
// Filtro por Categoria
// ==========================================================================
function filterCategory(cat) {
  const cards = document.querySelectorAll('.product-card');
  cards.forEach(card => {
    if (cat === 'all') {
      card.style.display = 'flex';
      return;
    }
    // Lê a chave do data-product-key; o nome da chave pode conter qualquer
    // caractere de - e _ e não é mais uma letra solta.
    const key = card.dataset.productKey;
    const prod = key ? PRODUCTS[key] : null;
    card.style.display = prod && prod.category === cat ? 'flex' : 'none';
  });
}

// ==========================================================================
// Modal de Detalhes & Pirâmide Olfativa
// ==========================================================================
function openProductModal(letter) {
  const prod = PRODUCTS[letter];
  if (!prod) return;

  currentModalProduct = prod;
  currentModalMultiplier = 1;
  currentModalVolumeLabel = prod.volumeOptions[0].label;

  document.getElementById('modalImg').src = prod.image;
  document.getElementById('modalImg').alt = `ZAVALLA — ${prod.name}`;
  const modalLetter = document.getElementById('modalLetter');
  if (modalLetter) modalLetter.style.display = 'none';
  document.getElementById('modalName').textContent = prod.name;
  document.getElementById('modalType').textContent = prod.type;
  document.getElementById('modalDesc').textContent = prod.description;
  document.getElementById('modalTopNotes').textContent = prod.topNotes;
  document.getElementById('modalHeartNotes').textContent = prod.heartNotes;
  document.getElementById('modalBaseNotes').textContent = prod.baseNotes;

  // Botões de volume
  const volContainer = document.getElementById('modalVolumeSelector');
  volContainer.innerHTML = '';
  prod.volumeOptions.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = `volume-option ${idx === 0 ? 'active' : ''}`;
    btn.textContent = opt.label;
    btn.onclick = () => {
      document.querySelectorAll('#modalVolumeSelector .volume-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentModalMultiplier = opt.multiplier;
      currentModalVolumeLabel = opt.label;
      updateModalPriceDisplay();
    };
    volContainer.appendChild(btn);
  });

  updateModalPriceDisplay();

  const backdrop = document.getElementById('productModalBackdrop');
  backdrop.classList.toggle('is-kit', prod.layout === 'kit');
  backdrop.classList.add('is-open');

  // Carregar sistema de avaliações para este produto
  loadProductReviews(letter);
}

function updateModalPriceDisplay() {
  if (!currentModalProduct) return;
  const currentTotal = currentModalProduct.basePriceBRL * currentModalMultiplier;
  const priceText = formatPrice(currentTotal);

  // Preço no topo do modal…
  const mainPrice = document.getElementById('modalPrice');
  if (mainPrice) mainPrice.textContent = priceText;

  // …e o mesmo valor dentro da barra de compra fixa (celular).
  const stickyPrice = document.getElementById('modalPriceSticky');
  if (stickyPrice) stickyPrice.textContent = priceText;
}

function closeProductModal() {
  const backdrop = document.getElementById('productModalBackdrop');
  backdrop.classList.remove('is-open');
  currentModalProduct = null;
  _currentProductKey = null;
  _reviewsPanelOpen = false;
}

function addCurrentModalToCart() {
  if (!currentModalProduct) return;

  const itemPriceBRL = currentModalProduct.basePriceBRL * currentModalMultiplier;
  const itemKey = `${_currentProductKey}-${currentModalVolumeLabel}`;

  const existingIndex = cart.findIndex(item => item.key === itemKey);
  if (existingIndex > -1) {
    cart[existingIndex].qty += 1;
  } else {
    cart.push({
      key: itemKey,
      letter: _currentProductKey,
      name: currentModalProduct.name,
      volume: currentModalVolumeLabel,
      image: currentModalProduct.image,
      priceBRL: itemPriceBRL,
      qty: 1
    });
  }

  saveCart();
  closeProductModal();
  openCart();
}

// ==========================================================================
// Gaveta Deslizante da Sacola
// ==========================================================================
function openCart() {
  const drawer = document.getElementById('cartDrawer');
  const backdrop = document.getElementById('cartBackdrop');
  if (drawer && backdrop) {
    drawer.classList.add('is-open');
    backdrop.classList.add('is-open');
  }
}

function closeCart() {
  const drawer = document.getElementById('cartDrawer');
  const backdrop = document.getElementById('cartBackdrop');
  if (drawer && backdrop) {
    drawer.classList.remove('is-open');
    backdrop.classList.remove('is-open');
  }
}

function changeItemQty(key, delta) {
  const index = cart.findIndex(item => item.key === key);
  if (index === -1) return;

  cart[index].qty += delta;
  if (cart[index].qty <= 0) {
    cart.splice(index, 1);
  }
  saveCart();
}

function removeItemFromCart(key) {
  cart = cart.filter(item => item.key !== key);
  saveCart();
}

// ==========================================================================
// Totais da Sacola — subtotal, descontos, frete e total
// ==========================================================================
function computeCartTotals() {
  let count = 0;
  let subtotalBRL = 0;
  let hasUnconfirmedPrice = false;

  cart.forEach(item => {
    const unitPrice = Number(item.priceBRL) || 0;
    count += item.qty;
    subtotalBRL += unitPrice * item.qty;
    if (unitPrice <= 0) hasUnconfirmedPrice = true;
  });

  // Desconto: exibido apenas quando existir campanha ativa (hoje, nenhuma).
  const discountBRL = 0;
  // Entrega com cortesia para o DF — frete zero sempre que há itens.
  const shippingBRL = 0;

  return {
    count,
    subtotalBRL,
    discountBRL,
    shippingBRL,
    shippingLabel: cart.length > 0 ? 'CORTESIA' : '—',
    totalBRL: Math.max(subtotalBRL - discountBRL + shippingBRL, 0),
    hasUnconfirmedPrice
  };
}

// Preço ainda não confirmado pelo lojista aparece como "CONFIRMAR",
// exatamente como na vitrine — sem inventar valores.
function formatCartValue(brlAmount, hasUnconfirmedPrice) {
  if (hasUnconfirmedPrice) return 'CONFIRMAR';
  return formatPrice(brlAmount);
}

function updateCartUI() {
  const container = document.getElementById('cartItemsContainer');
  const badge = document.getElementById('cartBadge');
  const summaryEl = document.getElementById('cartSummary');
  const itemCountEl = document.getElementById('cartItemCount');
  const subtotalEl = document.getElementById('cartSubtotal');
  const discountRow = document.getElementById('cartDiscountRow');
  const discountEl = document.getElementById('cartDiscount');
  const shippingEl = document.getElementById('cartShipping');
  const totalEl = document.getElementById('cartTotal');
  if (!container) return;

  const totals = computeCartTotals();

  if (badge) {
    badge.textContent = `(${totals.count})`;
  }

  if (itemCountEl) {
    itemCountEl.textContent = totals.count === 1 ? '1 ITEM' : `${totals.count} ITENS`;
  }

  // Sacola vazia — mensagem elegante + convite para continuar comprando
  if (cart.length === 0) {
    if (summaryEl) summaryEl.hidden = true;
    container.innerHTML = `
      <div class="cart-empty">
        <span class="cart-empty-rule" aria-hidden="true"></span>
        <p class="cart-empty-title">SUA SACOLA ESTÁ VAZIA NO MOMENTO.</p>
        <p class="cart-empty-sub">EXPLORE A COLEÇÃO MONÁSTICA PERMANENTE.</p>
        <button type="button" class="btn-outline cart-empty-cta" onclick="closeCart()">CONTINUAR COMPRANDO</button>
      </div>
    `;
    return;
  }

  if (summaryEl) summaryEl.hidden = false;

  if (subtotalEl) {
    subtotalEl.textContent = formatCartValue(totals.subtotalBRL, totals.hasUnconfirmedPrice);
  }
  if (discountRow) {
    discountRow.hidden = !(totals.discountBRL > 0);
  }
  if (discountEl) {
    discountEl.textContent = `− ${formatPrice(totals.discountBRL)}`;
  }
  if (shippingEl) {
    shippingEl.textContent = totals.shippingLabel;
  }
  if (totalEl) {
    totalEl.textContent = formatCartValue(totals.totalBRL, totals.hasUnconfirmedPrice);
  }

  container.innerHTML = cart.map(item => {
    const unitPrice = Number(item.priceBRL) || 0;
    const lineTotalBRL = unitPrice * item.qty;
    const unitLabel = unitPrice > 0 ? `${formatPrice(unitPrice)} · UN.` : 'PREÇO A CONFIRMAR';
    const lineLabel = unitPrice > 0 ? formatPrice(lineTotalBRL) : 'CONFIRMAR';
    const product = PRODUCTS[item.letter];
    const formatLabel = product && product.type
      ? `${item.volume} · ${product.type}`
      : item.volume;

    return `
      <article class="cart-item">
        <img src="${item.image}" alt="${item.name}" class="cart-item-img" loading="lazy">
        <div class="cart-item-info">
          <div class="cart-item-head">
            <div class="cart-item-titles">
              <span class="cart-item-name">${item.name}</span>
              <span class="cart-item-format">${formatLabel}</span>
            </div>
            <button type="button" class="cart-item-remove" onclick="removeItemFromCart('${item.key}')" aria-label="Remover ${item.name} da sacola">REMOVER</button>
          </div>
          <div class="cart-item-foot">
            <div class="cart-qty-controls" role="group" aria-label="Quantidade de ${item.name}">
              <button type="button" class="cart-qty-btn" onclick="changeItemQty('${item.key}', -1)" aria-label="Diminuir quantidade de ${item.name}">−</button>
              <span class="cart-qty-value" aria-live="polite">${item.qty}</span>
              <button type="button" class="cart-qty-btn" onclick="changeItemQty('${item.key}', 1)" aria-label="Aumentar quantidade de ${item.name}">+</button>
            </div>
            <div class="cart-item-prices">
              <span class="cart-item-unit">${unitLabel}</span>
              <span class="cart-item-subtotal">${lineLabel}</span>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

async function handleCheckout() {
  if (cart.length === 0) {
    openModalMessage('SACOLA VAZIA', 'Por favor, selecione uma criação da coleção monástica antes de prosseguir.');
    return;
  }

  const phone = '556192356967';
  const totals = computeCartTotals();
  const totalLabel = formatCartValue(totals.totalBRL, totals.hasUnconfirmedPrice);

  // Formata os itens do pedido para o WhatsApp
  const itemsList = cart.map(item => {
    const unitPrice = Number(item.priceBRL) || 0;
    const lineLabel = unitPrice > 0 ? formatPrice(unitPrice * item.qty) : 'A confirmar';
    return `• ${item.qty}x ${item.name} (${item.volume}) — ${lineLabel}`;
  }).join('\n');

  const message = 
`Olá, ZAVALLA! Gostaria de finalizar meu pedido pelo site:

*RESUMO DO PEDIDO:*
${itemsList}

*Valor Total:* ${totalLabel}
*Entrega:* Cortesia para o DF

Gostaria de combinar os detalhes de pagamento e envio.`;

  const whatsappUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;

  // Abre o WhatsApp com o pedido pronto
  window.open(whatsappUrl, '_blank');

  // Notificação no site
  const infoText = totals.hasUnconfirmedPrice
    ? `Seu pedido foi formatado com sucesso. Abrimos o WhatsApp do ateliê ZAVALLA (61 9235-6967) com a sua solicitação pronta para envio — valores e entrega são confirmados diretamente com o ateliê.`
    : `Seu pedido no valor de ${formatPrice(totals.totalBRL)} foi formatado com sucesso. Abrimos o WhatsApp do ateliê ZAVALLA (61 9235-6967) com a sua solicitação pronta para envio.`;

  openModalMessage('PEDIDO ENVIADO AO WHATSAPP', infoText);

  cart = [];
  saveCart();
  closeCart();
}

// ==========================================================================
// Modal Informativo de Políticas e Concierge
// ==========================================================================
function openModalMessage(title, text, action) {
  const backdrop = document.getElementById('infoModalBackdrop');
  document.getElementById('infoModalTitle').textContent = title;
  document.getElementById('infoModalBody').textContent = text;

  // Botão extra opcional (ex.: cancelar o pedido recém-criado no servidor).
  const modal = backdrop ? backdrop.querySelector('.product-modal') : null;
  if (modal) {
    const previousExtra = modal.querySelector('#infoModalExtraAction');
    if (previousExtra) previousExtra.remove();
    if (action && typeof action.onClick === 'function') {
      const extraBtn = document.createElement('button');
      extraBtn.id = 'infoModalExtraAction';
      extraBtn.className = 'btn-graphite';
      extraBtn.style.cssText = 'margin-top: var(--spacing-22); margin-right: 10px; background: transparent; color: currentColor; border: 1px solid currentColor;';
      extraBtn.textContent = action.label || 'CANCELAR';
      extraBtn.onclick = () => { closeInfoModal(); action.onClick(); };
      const mainBtn = modal.querySelector('button.btn-graphite');
      if (mainBtn) modal.insertBefore(extraBtn, mainBtn);
      else modal.appendChild(extraBtn);
    }
  }

  if (backdrop) backdrop.classList.add('is-open');
}

function closeInfoModal() {
  const backdrop = document.getElementById('infoModalBackdrop');
  if (backdrop) backdrop.classList.remove('is-open');
}

// ==========================================================================
// Formulário de Newsletter
// ==========================================================================
function handleNewsletter(event) {
  event.preventDefault();
  const input = document.getElementById('newsletterEmail');
  const status = document.getElementById('newsletterStatus');
  if (!input || !status) return;

  const email = input.value.trim();
  if (!email || !email.includes('@')) {
    status.textContent = 'POR FAVOR, INSIRA UM ENDEREÇO DE E-MAIL VÁLIDO.';
    status.style.color = 'var(--color-soot)';
    return;
  }

  status.textContent = 'INSCRIÇÃO REGISTRADA NO ARQUIVO. COMUNICADOS EM BREVE.';
  status.style.color = 'var(--color-soot)';
  input.value = '';

  setTimeout(() => {
    status.textContent = '';
  }, 6000);
}

// ==========================================================================
// Sistema de Avaliações ZAVALLA
// ==========================================================================

const REVIEWS_DB_KEY = 'zavala_reviews_db_v1';
const HELPFUL_VOTES_KEY = 'zavala_helpful_votes_v1';
const USER_ORDERS_KEY = 'zavala_user_orders_v1';

let _currentProductKey = null;  // chave do produto cujo modal está aberto
let _selectedStarValue = 0;
let _reviewPhotoBase64 = null;
let _editStarValue = 0;
let _reviewsPanelOpen = false;

/* ---------- Storage Helpers ---------- */
function getReviewsDB() {
  try { return JSON.parse(localStorage.getItem(REVIEWS_DB_KEY) || '{}'); } catch { return {}; }
}
function saveReviewsDB(db) {
  try { localStorage.setItem(REVIEWS_DB_KEY, JSON.stringify(db)); } catch(e) { console.warn(e); }
}
function getHelpfulVotes() {
  try { return JSON.parse(localStorage.getItem(HELPFUL_VOTES_KEY) || '{}'); } catch { return {}; }
}
function saveHelpfulVotes(v) {
  try { localStorage.setItem(HELPFUL_VOTES_KEY, JSON.stringify(v)); } catch(e) { console.warn(e); }
}
function getUserOrders() {
  try { return JSON.parse(localStorage.getItem(USER_ORDERS_KEY) || '[]'); } catch { return []; }
}

/* ---------- Moderation ---------- */
const BLOCKED_WORDS = ['merda','porra','caralho','viado','puta','lixo','fraude','golpe','estupro'];
const SPAM_PATTERNS = [/(.)\1{8,}/, /\b(spam|scam|free money|click here)\b/i];

function moderateText(text) {
  const t = text.trim().toLowerCase();
  for (const w of BLOCKED_WORDS) {
    if (t.includes(w)) return { ok: false, reason: `O texto contém linguagem inadequada. Por favor, reformule sua avaliação.` };
  }
  for (const p of SPAM_PATTERNS) {
    if (p.test(text)) return { ok: false, reason: `O texto parece conter spam. Por favor, escreva uma resenha genuína.` };
  }
  // Check for links
  if (/https?:\/\/|www\./i.test(text)) return { ok: false, reason: `Não é permitido incluir links na avaliação.` };
  // Check for phone/email in text
  if (/\b\d{8,11}\b/.test(text)) return { ok: false, reason: `Por favor, não inclua números de telefone no texto da avaliação.` };
  if (/@[\w.-]+\.\w{2,}/.test(text)) return { ok: false, reason: `Por favor, não inclua e-mails no texto da avaliação.` };
  if (text.length < 10) return { ok: false, reason: `A avaliação deve ter pelo menos 10 caracteres.` };
  return { ok: true };
}

/* ---------- Stars Helpers ---------- */
function starsString(n, filled = '★', empty = '☆') {
  const r = Math.round(n);
  return filled.repeat(r) + empty.repeat(5 - r);
}
function starsHtml(n) {
  const rounded = Math.round(n * 2) / 2;
  let html = '';
  for (let i = 1; i <= 5; i++) {
    if (i <= rounded) html += `<span style="color:#B88A72">★</span>`;
    else html += `<span style="color:rgba(217,167,178,0.3)">★</span>`;
  }
  return html;
}
function formatDatePT(iso) {
  const d = new Date(iso);
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
}
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------- Layout do modal: 2 colunas no desktop, 1 coluna no celular ----------
   No celular o modal é empilhado: o perfume em cima e a compra embaixo.
   O grid NUNCA é forçado por JS em tela pequena — era esse estilo inline
   ('1fr 1fr' / '1fr 1.1fr 1fr') que espremia o modal em colunas achatadas
   de ~120-180px e vencia o CSS do mobile. */
function applyModalGrid(reviewsOpen) {
  const modal = document.querySelector('.product-modal--reviews');
  if (!modal) return;
  if (window.matchMedia('(max-width: 768px)').matches) {
    // Sem estilo inline: deixa o CSS mobile governar (1 coluna)
    modal.style.gridTemplateColumns = '';
  } else {
    modal.style.gridTemplateColumns = reviewsOpen ? '1fr 1.1fr 1fr' : '1fr 1fr';
  }
}

/* ---------- Panel Toggle ---------- */
function toggleReviewsPanel() {
  const panel = document.getElementById('reviewsPanel');
  const chevron = document.getElementById('reviewsChevron');
  if (!panel) return;
  _reviewsPanelOpen = !_reviewsPanelOpen;
  panel.classList.toggle('open', _reviewsPanelOpen);
  if (chevron) chevron.classList.toggle('open', _reviewsPanelOpen);

  // Expand modal grid
  applyModalGrid(_reviewsPanelOpen);

  if (_reviewsPanelOpen && _currentProductKey) {
    renderReviewsSummary(_currentProductKey);
    renderReviews();
  }
}

/* ---------- Load Reviews for Product ---------- */
function loadProductReviews(productKey) {
  _currentProductKey = productKey;
  _reviewsPanelOpen = false;
  _selectedStarValue = 0;
  _reviewPhotoBase64 = null;

  // Reset panel
  const panel = document.getElementById('reviewsPanel');
  if (panel) panel.classList.remove('open');
  const chevron = document.getElementById('reviewsChevron');
  if (chevron) chevron.classList.remove('open');
  applyModalGrid(false);

  // Reset form
  hideReviewForm();
  const err = document.getElementById('reviewsFormError');
  if (err) err.style.display = 'none';
  const succ = document.getElementById('reviewsSuccess');
  if (succ) succ.style.display = 'none';

  // Update star picker
  updateStarPicker(0);
  const authorEl = document.getElementById('reviewAuthorName');
  if (authorEl) authorEl.value = '';
  const textEl = document.getElementById('reviewText');
  if (textEl) textEl.value = '';
  removeReviewPhoto();

  // Update toggle button summary
  updateToggleButtonSummary(productKey);

  // Update badge
  updateRatingBadge(productKey);
}

function updateToggleButtonSummary(productKey) {
  const db = getReviewsDB();
  const reviews = (db[productKey] || []).filter(r => r.approved);
  const summary = document.getElementById('reviewsToggleSummary');
  if (!summary) return;
  if (reviews.length === 0) {
    summary.textContent = 'VER AVALIAÇÕES';
  } else {
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    summary.textContent = `★ ${avg.toFixed(1)}  —  VER ${reviews.length} AVALIAÇÃO${reviews.length > 1 ? 'ÕES' : ''}`;
  }
}

function updateRatingBadge(productKey) {
  const db = getReviewsDB();
  const reviews = (db[productKey] || []).filter(r => r.approved);
  const badge = document.getElementById('modalRatingBadge');
  if (!badge) return;
  if (reviews.length === 0) { badge.style.display = 'none'; return; }
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  badge.style.display = 'flex';
  const starsEl = document.getElementById('modalRatingBadgeStars');
  const countEl = document.getElementById('modalRatingBadgeCount');
  if (starsEl) starsEl.textContent = starsString(avg);
  if (countEl) countEl.textContent = reviews.length;
}

/* ---------- Summary Render ---------- */
function renderReviewsSummary(productKey) {
  const db = getReviewsDB();
  const reviews = (db[productKey] || []).filter(r => r.approved);
  const avgEl = document.getElementById('reviewsAvgBig');
  const starsEl = document.getElementById('reviewsAvgStars');
  const totalEl = document.getElementById('reviewsTotalCount');
  const barsEl = document.getElementById('reviewsBars');
  if (!avgEl) return;

  if (reviews.length === 0) {
    avgEl.textContent = '—';
    starsEl.textContent = '☆☆☆☆☆';
    starsEl.style.color = 'rgba(217,167,178,0.3)';
    totalEl.textContent = '0 AVALIAÇÕES';
    barsEl.innerHTML = '';
    return;
  }

  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  avgEl.textContent = avg.toFixed(1);
  starsEl.innerHTML = starsHtml(avg);
  starsEl.style.color = '';
  totalEl.textContent = `${reviews.length} AVALIAÇÃO${reviews.length > 1 ? 'ÕES' : ''}`;

  // Distribution bars
  let html = '';
  const filterSelect = document.getElementById('reviewsFilterSelect');
  const currentFilter = filterSelect ? filterSelect.value : 'all';
  for (let star = 5; star >= 1; star--) {
    const count = reviews.filter(r => r.rating === star).length;
    const pct = reviews.length > 0 ? (count / reviews.length * 100).toFixed(1) : 0;
    const isActive = currentFilter === String(star);
    html += `<div class="reviews-bar-row${isActive ? ' active' : ''}" onclick="filterByStar(${star})">
      <span>${star}★</span>
      <div class="reviews-bar-track"><div class="reviews-bar-fill" style="width:${pct}%"></div></div>
      <span>${count}</span>
    </div>`;
  }
  barsEl.innerHTML = html;
}

function filterByStar(star) {
  const select = document.getElementById('reviewsFilterSelect');
  if (!select) return;
  const current = select.value;
  select.value = (current === String(star)) ? 'all' : String(star);
  renderReviewsSummary(_currentProductKey);
  renderReviews();
}

/* ---------- Reviews List Render ---------- */
function renderReviews() {
  if (!_currentProductKey) return;
  renderReviewsSummary(_currentProductKey);

  const db = getReviewsDB();
  let reviews = (db[_currentProductKey] || []).filter(r => r.approved);

  const sortSelect = document.getElementById('reviewsSortSelect');
  const filterSelect = document.getElementById('reviewsFilterSelect');
  const sortVal = sortSelect ? sortSelect.value : 'recent';
  const filterVal = filterSelect ? filterSelect.value : 'all';

  if (filterVal !== 'all') reviews = reviews.filter(r => r.rating === parseInt(filterVal));

  if (sortVal === 'recent') reviews.sort((a, b) => new Date(b.date) - new Date(a.date));
  else if (sortVal === 'best') reviews.sort((a, b) => b.rating - a.rating);
  else if (sortVal === 'worst') reviews.sort((a, b) => a.rating - b.rating);

  const list = document.getElementById('reviewsList');
  const emptyEl = document.getElementById('reviewsEmpty');
  if (!list) return;

  // Clear existing cards
  Array.from(list.children).forEach(c => { if (!c.id || c.id !== 'reviewsEmpty') c.remove(); });

  if (reviews.length === 0) {
    if (emptyEl) emptyEl.style.display = '';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  const votes = getHelpfulVotes();
  const orders = getUserOrders();

  reviews.forEach(r => {
    const isVerified = orders.some(o => o.productKey === _currentProductKey);
    const voteKey = `${r.id}`;
    const myVote = votes[voteKey];
    const card = buildReviewCard(r, isVerified, myVote, false);
    list.appendChild(card);
  });
}

function buildReviewCard(r, isVerified, myVote, isDemo) {
  const card = document.createElement('div');
  card.className = 'review-card';
  card.dataset.id = r.id;

  const helpfulYesActive = myVote === 'yes' ? 'voted' : '';
  const helpfulNoActive = myVote === 'no' ? 'voted' : '';

  let photoPart = '';
  if (r.photo) {
    photoPart = `<img src="${r.photo}" alt="Foto do produto" class="review-card-photo" onclick="openReviewImageModal('${r.id}')">`;
  }

  let badgePart = '';
  if (isDemo) badgePart = `<span class="review-demo-badge">DEMO DE CURADORIA</span>`;
  else if (isVerified) badgePart = `<span class="review-verified-badge">✓ COMPRA VERIFICADA</span>`;

  card.innerHTML = `
    <div class="review-card-header">
      <span class="review-card-author">${escHtml(r.author)}</span>
      <span class="review-card-stars">${starsString(r.rating)}</span>
    </div>
    <div class="review-card-meta">
      <span class="review-card-date">${formatDatePT(r.date)}</span>
      ${badgePart}
    </div>
    ${photoPart}
    <p class="review-card-text">${escHtml(r.text)}</p>
    <div class="review-helpful-row">
      <span class="review-helpful-label">Esta avaliação foi útil?</span>
      <button class="review-helpful-btn ${helpfulYesActive}" onclick="voteHelpful('${r.id}', 'yes', this)">
        👍 Sim ${r.helpfulYes > 0 ? '(' + r.helpfulYes + ')' : ''}
      </button>
      <button class="review-helpful-btn ${helpfulNoActive}" onclick="voteHelpful('${r.id}', 'no', this)">
        Não ${r.helpfulNo > 0 ? '(' + r.helpfulNo + ')' : ''}
      </button>
    </div>
  `;
  return card;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ---------- Photo Modal ---------- */
function openReviewImageModal(reviewId) {
  const db = getReviewsDB();
  for (const key of Object.keys(db)) {
    const r = (db[key] || []).find(x => x.id === reviewId);
    if (r && r.photo) {
      const img = document.getElementById('reviewImageModalImg');
      if (img) img.src = r.photo;
      const backdrop = document.getElementById('reviewImageModalBackdrop');
      if (backdrop) backdrop.classList.add('active');
      return;
    }
  }
}
function closeReviewImageModal() {
  const backdrop = document.getElementById('reviewImageModalBackdrop');
  if (backdrop) backdrop.classList.remove('active');
}

/* ---------- Helpful Votes ---------- */
function voteHelpful(reviewId, vote, btn) {
  const votes = getHelpfulVotes();
  const db = getReviewsDB();
  const key = reviewId;
  const prevVote = votes[key];

  // Find review
  let targetReview = null;
  let targetProductKey = null;
  for (const pk of Object.keys(db)) {
    const r = (db[pk] || []).find(x => x.id === reviewId);
    if (r) { targetReview = r; targetProductKey = pk; break; }
  }
  if (!targetReview) return;

  // Toggle logic
  if (prevVote === vote) {
    // Remove vote
    delete votes[key];
    if (vote === 'yes') targetReview.helpfulYes = Math.max(0, (targetReview.helpfulYes || 0) - 1);
    else targetReview.helpfulNo = Math.max(0, (targetReview.helpfulNo || 0) - 1);
  } else {
    // Remove opposite if any
    if (prevVote === 'yes') targetReview.helpfulYes = Math.max(0, (targetReview.helpfulYes || 0) - 1);
    if (prevVote === 'no') targetReview.helpfulNo = Math.max(0, (targetReview.helpfulNo || 0) - 1);
    votes[key] = vote;
    if (vote === 'yes') targetReview.helpfulYes = (targetReview.helpfulYes || 0) + 1;
    else targetReview.helpfulNo = (targetReview.helpfulNo || 0) + 1;
  }

  saveReviewsDB(db);
  saveHelpfulVotes(votes);
  renderReviews(); // Re-render
}

/* ---------- Star Picker ---------- */
function selectStar(val) {
  _selectedStarValue = val;
  updateStarPicker(val);
  const hints = ['', 'Muito ruim', 'Ruim', 'Regular', 'Bom', 'Excelente'];
  const hint = document.getElementById('starPickerHint');
  if (hint) hint.textContent = hints[val] || 'Selecione uma nota';
}

function updateStarPicker(val, pickerId = 'starPicker') {
  const picker = document.getElementById(pickerId);
  if (!picker) return;
  picker.querySelectorAll('.star-btn').forEach(btn => {
    const v = parseInt(btn.dataset.value);
    btn.classList.toggle('active', v <= val);
  });
}

function selectEditStar(val) {
  _editStarValue = val;
  updateStarPicker(val, 'editStarPicker');
}

/* ---------- Photo Preview ---------- */
function previewReviewPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    alert('A foto deve ter no máximo 5 MB.');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    _reviewPhotoBase64 = e.target.result;
    const preview = document.getElementById('reviewPhotoPreview');
    const wrapper = document.getElementById('reviewPhotoPreviewWrapper');
    const area = document.getElementById('reviewPhotoUploadArea');
    if (preview) preview.src = _reviewPhotoBase64;
    if (wrapper) wrapper.style.display = 'inline-block';
    if (area) area.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function removeReviewPhoto() {
  _reviewPhotoBase64 = null;
  const preview = document.getElementById('reviewPhotoPreview');
  const wrapper = document.getElementById('reviewPhotoPreviewWrapper');
  const area = document.getElementById('reviewPhotoUploadArea');
  const input = document.getElementById('reviewPhoto');
  if (preview) preview.src = '';
  if (wrapper) wrapper.style.display = 'none';
  if (area) area.style.display = 'flex';
  if (input) input.value = '';
}

/* ---------- Review Form Toggle ---------- */
function toggleReviewForm() {
  const wrapper = document.getElementById('reviewsFormWrapper');
  const success = document.getElementById('reviewsSuccess');
  if (!wrapper) return;
  const isVisible = wrapper.style.display !== 'none';
  if (isVisible) {
    hideReviewForm();
  } else {
    if (success) success.style.display = 'none';
    wrapper.style.display = 'block';
    wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function hideReviewForm() {
  const wrapper = document.getElementById('reviewsFormWrapper');
  if (wrapper) wrapper.style.display = 'none';
}

/* ---------- Submit Review ---------- */
function submitReview() {
  if (!_currentProductKey) return;

  const authorEl = document.getElementById('reviewAuthorName');
  const textEl = document.getElementById('reviewText');
  const errEl = document.getElementById('reviewsFormError');

  const author = authorEl ? authorEl.value.trim() : '';
  const text = textEl ? textEl.value.trim() : '';

  function showError(msg) {
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
  }
  if (errEl) errEl.style.display = 'none';

  if (!author) { showError('Por favor, informe seu nome.'); return; }
  if (_selectedStarValue === 0) { showError('Por favor, selecione uma nota de 1 a 5 estrelas.'); return; }
  if (!text) { showError('Por favor, escreva sua resenha do produto.'); return; }

  const mod = moderateText(text);
  if (!mod.ok) { showError(mod.reason); return; }
  const modAuthor = moderateText(author);
  if (!modAuthor.ok) { showError('O nome informado não é permitido.'); return; }

  const db = getReviewsDB();
  if (!db[_currentProductKey]) db[_currentProductKey] = [];

  const review = {
    id: genId(),
    productKey: _currentProductKey,
    author,
    rating: _selectedStarValue,
    text,
    photo: _reviewPhotoBase64 || null,
    date: new Date().toISOString(),
    approved: true,  // moderação passou, aprovação imediata
    helpfulYes: 0,
    helpfulNo: 0,
    demo: false,
  };

  db[_currentProductKey].unshift(review);
  saveReviewsDB(db);

  // Show success
  hideReviewForm();
  const succ = document.getElementById('reviewsSuccess');
  if (succ) succ.style.display = 'block';
  succ.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Reset
  if (authorEl) authorEl.value = '';
  if (textEl) textEl.value = '';
  _selectedStarValue = 0;
  updateStarPicker(0);
  removeReviewPhoto();

  // Refresh
  renderReviews();
  updateToggleButtonSummary(_currentProductKey);
  updateRatingBadge(_currentProductKey);
  refreshProductCardMiniRatings();
}

/* ---------- Product Card Mini Ratings ---------- */
function refreshProductCardMiniRatings() {
  const db = getReviewsDB();
  document.querySelectorAll('.product-card').forEach(card => {
    const productKey = card.dataset.productKey;
    if (!productKey) return;
    const reviews = (db[productKey] || []).filter(r => r.approved);
    let miniRating = card.querySelector('.product-mini-rating');
    if (reviews.length === 0) {
      if (miniRating) miniRating.remove();
      return;
    }
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    if (!miniRating) {
      miniRating = document.createElement('div');
      miniRating.className = 'product-mini-rating';
      const meta = card.querySelector('.product-meta');
      if (meta) meta.insertBefore(miniRating, meta.querySelector('.product-card-action'));
    }
    miniRating.innerHTML = `<span class="product-mini-stars">${starsString(avg, '★', '☆')}</span><span>${avg.toFixed(1)} (${reviews.length})</span>`;
  });
}

/* ---------- Account Modal ---------- */
function openAccountModal() {
  const backdrop = document.getElementById('accountModalBackdrop');
  if (backdrop) backdrop.classList.add('active');
  document.body.style.overflow = 'hidden';
  switchAccountTab('myReviews');
}
function closeAccountModal() {
  const backdrop = document.getElementById('accountModalBackdrop');
  if (backdrop) backdrop.classList.remove('active');
  document.body.style.overflow = '';
}

function switchAccountTab(tab) {
  const tabs = ['myReviews', 'pending'];
  tabs.forEach(t => {
    const btn = document.getElementById(t === 'myReviews' ? 'tabMyReviews' : 'tabPending');
    const content = document.getElementById(t === 'myReviews' ? 'tabContentMyReviews' : 'tabContentPending');
    if (btn) btn.classList.toggle('active', t === tab);
    if (content) content.style.display = t === tab ? 'flex' : 'none';
  });
  if (tab === 'myReviews') renderAccountMyReviews();
  else renderAccountPending();
}

function renderAccountMyReviews() {
  const db = getReviewsDB();
  const list = document.getElementById('accountReviewsList');
  if (!list) return;

  const allReviews = [];
  for (const [pk, reviews] of Object.entries(db)) {
    for (const r of reviews) {
      if (!r.demo) allReviews.push({ ...r, productKey: pk });
    }
  }

  if (allReviews.length === 0) {
    list.innerHTML = '<p class="reviews-empty-msg">Você ainda não fez nenhuma avaliação.</p>';
    return;
  }

  allReviews.sort((a, b) => new Date(b.date) - new Date(a.date));
  list.innerHTML = '';
  allReviews.forEach(r => {
    const product = PRODUCTS[r.productKey];
    const productName = product ? product.name : r.productKey;
    const card = document.createElement('div');
    card.className = 'account-review-card';
    card.innerHTML = `
      <div class="account-review-card-header">
        <span class="account-review-product-name">${escHtml(productName)}</span>
        <span class="account-review-stars">${starsString(r.rating)}</span>
      </div>
      <p class="account-review-text">${escHtml(r.text)}</p>
      <div class="account-review-actions">
        <button class="account-review-edit-btn" onclick="startEditReview('${r.id}', '${r.productKey}')">EDITAR</button>
        <button class="account-review-delete-btn" onclick="deleteReview('${r.id}', '${r.productKey}')">EXCLUIR</button>
      </div>
    `;
    list.appendChild(card);
  });
}

function renderAccountPending() {
  const orders = getUserOrders();
  const db = getReviewsDB();
  const list = document.getElementById('accountPendingList');
  if (!list) return;

  // Products from orders that have not been reviewed yet
  const pending = orders.filter(o => {
    const productReviews = db[o.productKey] || [];
    return !productReviews.some(r => !r.demo);
  });

  if (pending.length === 0) {
    list.innerHTML = '<p class="reviews-empty-msg">Nenhum produto pendente de avaliação. 🎉</p>';
    return;
  }

  list.innerHTML = '';
  pending.forEach(o => {
    const product = PRODUCTS[o.productKey];
    if (!product) return;
    const card = document.createElement('div');
    card.className = 'pending-product-card';
    card.innerHTML = `
      <div>
        <div class="pending-product-name">${escHtml(product.name)}</div>
        <div class="pending-product-type">${escHtml(product.type)}</div>
      </div>
      <button class="btn-graphite" onclick="closeAccountModal(); openProductModal('${o.productKey}'); setTimeout(()=>{ if(!_reviewsPanelOpen) toggleReviewsPanel(); setTimeout(toggleReviewForm,300); }, 400);" style="font-size:10px;padding:8px 14px;letter-spacing:0.08em;">AVALIAR</button>
    `;
    list.appendChild(card);
  });
}

/* ---------- Edit & Delete Review ---------- */
function startEditReview(reviewId, productKey) {
  const db = getReviewsDB();
  const r = (db[productKey] || []).find(x => x.id === reviewId);
  if (!r) return;
  _editStarValue = r.rating;
  updateStarPicker(r.rating, 'editStarPicker');

  const editText = document.getElementById('editReviewText');
  if (editText) editText.value = r.text;
  const editId = document.getElementById('editReviewId');
  if (editId) editId.value = reviewId + '|' + productKey;

  const editWrapper = document.getElementById('accountEditWrapper');
  if (editWrapper) {
    editWrapper.style.display = 'block';
    editWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function saveEditReview() {
  const idEl = document.getElementById('editReviewId');
  const textEl = document.getElementById('editReviewText');
  if (!idEl || !textEl) return;

  const [reviewId, productKey] = idEl.value.split('|');
  const newText = textEl.value.trim();

  if (!newText) { alert('O texto da avaliação não pode estar vazio.'); return; }
  const mod = moderateText(newText);
  if (!mod.ok) { alert(mod.reason); return; }
  if (_editStarValue === 0) { alert('Por favor selecione uma nota.'); return; }

  const db = getReviewsDB();
  const review = (db[productKey] || []).find(r => r.id === reviewId);
  if (!review) return;

  review.text = newText;
  review.rating = _editStarValue;
  review.editedAt = new Date().toISOString();
  saveReviewsDB(db);

  cancelEditReview();
  renderAccountMyReviews();
  if (_currentProductKey === productKey) renderReviews();
  updateToggleButtonSummary(productKey);
  updateRatingBadge(productKey);
  refreshProductCardMiniRatings();
}

function cancelEditReview() {
  const editWrapper = document.getElementById('accountEditWrapper');
  if (editWrapper) editWrapper.style.display = 'none';
}

function deleteReview(reviewId, productKey) {
  if (!confirm('Deseja realmente excluir esta avaliação?')) return;
  const db = getReviewsDB();
  if (db[productKey]) {
    db[productKey] = db[productKey].filter(r => r.id !== reviewId);
    saveReviewsDB(db);
  }
  renderAccountMyReviews();
  if (_currentProductKey === productKey) renderReviews();
  updateToggleButtonSummary(productKey);
  updateRatingBadge(productKey);
  refreshProductCardMiniRatings();
}

// ==========================================================================
// Teclado e Inicialização
// ==========================================================================
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeCart();
    closeProductModal();
    closeInfoModal();
    closeAccountModal();
    closeReviewImageModal();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  loadCart();

  const cartBtn = document.getElementById('cartOpenBtn');
  if (cartBtn) {
    cartBtn.addEventListener('click', openCart);
  }

  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      openModalMessage('CONTA ZAVALLA', 'Portal exclusivo para clientes particulares e ordens de arquivo. Insira suas credenciais ou contate seu concierge pessoal.');
    });
  }

  const accountBtn = document.getElementById('accountBtn');
  if (accountBtn) {
    accountBtn.addEventListener('click', () => {
      openAccountModal();
    });
  }

  // Inicializar mini-ratings dos cartões de produto
  refreshProductCardMiniRatings();

  // Girar o celular com o modal aberto: reaplica o layout (1 coluna no
  // retrato, 2 colunas se virar para o modo paisagem/wide)
  let _gridResizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(_gridResizeTimer);
    _gridResizeTimer = setTimeout(() => {
      const backdrop = document.getElementById('productModalBackdrop');
      if (backdrop && backdrop.classList.contains('is-open')) {
        applyModalGrid(_reviewsPanelOpen);
      }
    }, 150);
  });

  // Inicializar modo escuro (Dark Mode)
  initTheme();
});

// ==========================================================================
// Tema / Modo Escuro (Dark Mode)
// ==========================================================================
function getSavedTheme() {
  try {
    return localStorage.getItem('zavala_theme');
  } catch (e) {
    return null;
  }
}

function applyTheme(theme) {
  const isDark = theme === 'dark';
  if (isDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
    if (document.body) document.body.classList.add('dark-mode');
  } else {
    document.documentElement.removeAttribute('data-theme');
    if (document.body) document.body.classList.remove('dark-mode');
  }

  try {
    localStorage.setItem('zavala_theme', theme);
  } catch (e) {}

  const textEls = document.querySelectorAll('#themeToggleText, .theme-toggle-text');
  textEls.forEach(el => {
    el.textContent = isDark ? 'MODO CLARO' : 'MODO ESCURO';
  });

  const toggleBtns = document.querySelectorAll('#themeToggleBtn, .theme-toggle-btn');
  toggleBtns.forEach(btn => {
    btn.setAttribute('aria-label', isDark ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro');
    btn.setAttribute('title', isDark ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro');
  });
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
}

function initTheme() {
  const saved = getSavedTheme();
  if (saved) {
    applyTheme(saved);
  } else {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      applyTheme('dark');
    } else {
      applyTheme('light');
    }
  }

  const toggleBtns = document.querySelectorAll('#themeToggleBtn, .theme-toggle-btn');
  toggleBtns.forEach(btn => {
    btn.removeEventListener('click', toggleTheme);
    btn.addEventListener('click', toggleTheme);
  });
}
