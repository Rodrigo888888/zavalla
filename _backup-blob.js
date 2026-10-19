// Dump completo dos dados da store Blob antiga para backup local (execução local apenas)
const fs = require('fs');
const path = require('path');
const { list, get } = require('@vercel/blob');

const OUT = path.join(__dirname, '_backup-blob-2026-10-19');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let cursor = undefined;
  let total = 0, ok = 0, falhas = 0;
  const resumo = [];
  do {
    const page = await list({ prefix: 'zavala/', limit: 1000, cursor, mode: 'expanded' });
    for (const b of page.blobs) {
      total++;
      try {
        const { blob } = await get(b.pathname, { access: 'private', useCache: false, token: process.env.BLOB_READ_WRITE_TOKEN });
        const destino = path.join(OUT, b.pathname.replace(/\//g, path.sep));
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.writeFileSync(destino, blob, 'utf8');
        ok++;
      } catch (e) {
        falhas++;
        resumo.push({ pathname: b.pathname, erro: e.message });
        console.log('FALHA get:', b.pathname, '—', e.message);
      }
    }
    cursor = page.cursor;
  } while (cursor);

  fs.writeFileSync(path.join(OUT, '_manifest.json'), JSON.stringify({ at: new Date().toISOString(), total, ok, falhas, falhasDetalhe: resumo }, null, 2));
  console.log(`DUMP: total=${total} baixados=${ok} falhas=${falhas} -> ${OUT}`);
})();
