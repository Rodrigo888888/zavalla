/**
 * Validação/limpeza dos campos de produto usados pelo site
 * (mesmos campos do PRODUCTS do app.js).
 */
const { HttpError, cleanText, cleanKey } = require('./http');
const { LOW_STOCK_DEFAULT } = require('./inventory');

const CATEGORIES = ['perfumes', 'joias'];

function parseVolumes(raw, fallbackLabel = '50 ML') {
  if (!Array.isArray(raw) || !raw.length) return [{ label: fallbackLabel, multiplier: 1 }];
  const volumes = raw
    .slice(0, 6)
    .map((v) => {
      const mult = parseMoney(v && v.multiplier);
      return {
        label: cleanText(v && v.label, 24).toUpperCase() || fallbackLabel,
        multiplier: Math.min(10, Math.max(0.1, Number.isFinite(mult) && mult > 0 ? mult : 1)),
      };
    });
  return volumes.length ? volumes : [{ label: fallbackLabel, multiplier: 1 }];
}

/**
 * Lê preços aceitando o formato brasileiro ("129,90", "1.299,90") e o ponto
 * decimal ("129.90"). Retorna 0 para vazio e NaN quando o conteúdo não é
 * numérico — o chamador decide entre erro e valor padrão.
 */
function parseMoney(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  let s = String(value).trim().replace(/^r\$\s*/i, '').replace(/\s+/g, '');
  if (!s) return 0;
  if (s.indexOf(',') > -1) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

function sanitizeProductInput(body, { partial = false, existing = null } = {}) {
  const source = Object.assign({}, existing || {}, body || {});
  const out = {};

  if (source.name !== undefined || !partial) {
    const name = cleanText(source.name, 60);
    if (!name) throw new HttpError(400, 'Informe o nome do produto.', 'VALIDACAO');
    out.name = name;
  }

  if (source.category !== undefined || !partial) {
    const category = cleanText(source.category, 20).toLowerCase();
    if (!CATEGORIES.includes(category)) throw new HttpError(400, 'Categoria deve ser "perfumes" ou "joias".', 'VALIDACAO');
    out.category = category;
  }

  if (source.type !== undefined || !partial) out.type = cleanText(source.type, 40);
  if (source.image !== undefined || !partial) out.image = cleanText(source.image, 240);
  if (source.description !== undefined || !partial) out.description = cleanText(source.description, 400);
  if (source.topNotes !== undefined || !partial) out.topNotes = cleanText(source.topNotes, 160);
  if (source.heartNotes !== undefined || !partial) out.heartNotes = cleanText(source.heartNotes, 160);
  if (source.baseNotes !== undefined || !partial) out.baseNotes = cleanText(source.baseNotes, 160);

  if (source.priceBRL !== undefined || !partial) {
    const price = parseMoney(source.priceBRL);
    if (!Number.isFinite(price) || price < 0) {
      throw new HttpError(400, 'Preço inválido. Informe um valor como 129,90.', 'VALIDACAO');
    }
    out.priceBRL = Math.round(price * 100) / 100;
  }

  if (source.volumes !== undefined || !partial) out.volumes = parseVolumes(source.volumes);

  if (source.lowThreshold !== undefined || !partial) {
    const t = Number.parseInt(source.lowThreshold, 10);
    out.lowThreshold = Number.isFinite(t) && t >= 0 ? Math.min(9999, t) : LOW_STOCK_DEFAULT;
  }

  if (source.stock !== undefined || !partial) {
    const s = Number(source.stock);
    if (!Number.isFinite(s) || s < 0 || Math.floor(s) !== s) {
      throw new HttpError(400, 'Estoque inicial inválido. Use um número inteiro, ex.: 5.', 'VALIDACAO');
    }
    out.stock = Math.min(999999, s);
  }

  // Controle de estoque: liga quando o lojista marca a opção ou informa uma
  // quantidade. Produto sem controle vende livremente (sem selo de esgotado e
  // sem bloqueio na vitrine) — assim nada quebra antes do cadastro inicial.
  const incoming = body || {};
  if (incoming.stockControl !== undefined) {
    out.stockControl = incoming.stockControl !== false && incoming.stockControl !== 'false' && Number(incoming.stockControl) !== 0;
  } else if (incoming.stock !== undefined) {
    out.stockControl = true;
  } else if (!partial) {
    out.stockControl = false;
  }

  if (source.active !== undefined) out.active = source.active !== false && source.active !== 'false';

  return out;
}

function keyFrom(name, explicitKey) {
  const key = cleanKey(explicitKey || name);
  if (!key) throw new HttpError(400, 'Não foi possível gerar a chave do produto.', 'VALIDACAO');
  return key;
}

module.exports = { CATEGORIES, parseVolumes, sanitizeProductInput, keyFrom };
