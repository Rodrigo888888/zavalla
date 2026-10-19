/**
 * ZAVALLA — Otimizador de imagens para mobile
 * Gera versões .webp redimensionadas e comprimidas ao lado dos originais
 * (os originais são mantidos como backup/fallback).
 *
 * FLUXO PARA IMAGENS NOVAS:
 *   1) npm install sharp       (uma única vez)
 *   2) node _optimize-images.js
 *   3) node _check-refs.js     (confirma que nada ficou quebrado)
 */
const sharp = require(process.env.SHARP_PATH || 'sharp');
const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, 'assets');

// Regras por largura máxima (px) e qualidade WebP
function ruleFor(file) {
  const name = file.toLowerCase();
  if (name.startsWith('hero-yara') || name.includes('4k')) {
    return { width: 1600, quality: 78 };
  }
  if (name.startsWith('whatsapp image')) {
    // Fotos de joias e editorial
    return { width: 1200, quality: 78 };
  }
  if (name === 'perfume-sauvage.png' || name.startsWith('download') || name.startsWith('ramana-hero')) {
    return { width: 1200, quality: 80 };
  }
  // Frascos de produto nos cards (5 colunas no desktop, 3 no mobile)
  return { width: 900, quality: 80 };
}

// Imagem editorial recebe o brilho que antes era feito via CSS filter
const BRIGHTEN = 'whatsapp image 2026-10-01 at 19.25.15.jpeg';

async function main() {
  const files = fs.readdirSync(ASSETS).filter(f => /\.(png|jpe?g)$/i.test(f));
  let before = 0;
  let after = 0;
  const rows = [];

  for (const file of files) {
    const src = path.join(ASSETS, file);
    const out = path.join(ASSETS, file.replace(/\.(png|jpe?g)$/i, '.webp'));
    const rule = ruleFor(file);
    const srcSize = fs.statSync(src).size;

    try {
      let img = sharp(src).rotate(); // respeita EXIF
      const meta = await img.metadata();

      // Só redimensiona se for maior que o alvo
      if (!meta.width || meta.width > rule.width) {
        img = img.resize({ width: rule.width, withoutEnlargement: true });
      }
      if (file.toLowerCase() === BRIGHTEN) {
        img = img.modulate({ brightness: 1.3 });
      }

      await img.webp({ quality: rule.quality, effort: 5 }).toFile(out);

      const outSize = fs.statSync(out).size;
      before += srcSize;
      after += outSize;
      rows.push({
        file,
        kbBefore: Math.round(srcSize / 1024),
        kbAfter: Math.round(outSize / 1024),
        pct: Math.round((1 - outSize / srcSize) * 100)
      });
    } catch (e) {
      console.error('ERRO em ' + file + ': ' + e.message);
    }
  }

  rows.sort((a, b) => b.kbBefore - a.kbBefore);
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('ARQUIVO', 52) + pad('ANTES', 10) + pad('DEPOIS', 10) + 'ECONOMIA');
  rows.forEach(r => {
    console.log(pad(r.file, 52) + pad(r.kbBefore + ' KB', 10) + pad(r.kbAfter + ' KB', 10) + r.pct + '%');
  });
  console.log('---');
  console.log('TOTAL: ' + Math.round(before / 1024) + ' KB -> ' + Math.round(after / 1024) +
    ' KB (economia de ' + Math.round((before - after) / 1024) + ' KB, ' +
    Math.round((1 - after / before) * 100) + '%)');
}

main().catch(e => { console.error(e); process.exit(1); });
