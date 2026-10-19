// Diagnóstico da conectividade com o Vercel Blob (execução local apenas)
const { list, get, put, del, head } = require('@vercel/blob');

(async () => {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  console.log('token presente:', !!token, '| store id:', (process.env.BLOB_STORE_ID || '').slice(0, 14));

  // 1) listagem no prefixo do sistema antigo
  try {
    const r = await list({ prefix: 'zavala/', limit: 10, mode: 'expanded' }, { token });
    console.log('LIST zavala/: OK —', r.blobs.length, 'blobs de', r.cursor ? 'primeira página' : 'única página');
    for (const b of r.blobs.slice(0, 5)) console.log('   -', b.pathname, b.size + 'B');
  } catch (e) { console.log('LIST zavala/: FALHOU —', e.name, '|', e.message); }

  // 2) escrita de teste
  try {
    const r = await put('zavala/_diagnostico.json', JSON.stringify({ ok: true, at: new Date().toISOString() }), {
      access: 'private', token, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 0,
    });
    console.log('PUT teste: OK —', r.url ? 'escrito' : 'sem url');
    try { await del('zavala/_diagnostico.json', { token }); console.log('DEL teste: OK'); } catch (e) { console.log('DEL teste: falhou —', e.message); }
  } catch (e) { console.log('PUT teste: FALHOU —', e.name, '|', e.message); }
})();
