// Verifica se todos os recursos referenciados nos HTML/JS/CSS existem
const fs = require('fs');
const path = require('path');
const root = __dirname;
let missing = 0;
let ok = 0;

function check(ref, from) {
  const clean = ref.split('?')[0].split('#')[0];
  if (!clean || /^(https?:|data:|mailto:|tel:|#|\/\/)/i.test(clean)) return;
  const p = path.join(root, decodeURIComponent(clean));
  if (fs.existsSync(p)) ok++;
  else { console.log('FALTANDO (' + from + '): ' + ref); missing++; }
}

for (const file of ['index.html', 'joias.html', 'mobile.html']) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) check(m[1], file);
  for (const m of html.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)) check(m[1], file);
}

const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
for (const m of js.matchAll(/['"](assets\/[^'"]+)['"]/g)) check(m[1], 'app.js');

const css = fs.readFileSync(path.join(root, 'index.css'), 'utf8');
for (const m of css.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)) check(m[1], 'index.css');

console.log('---');
console.log('Recursos OK: ' + ok + ' | Faltando: ' + missing);
process.exit(missing ? 1 : 0);
