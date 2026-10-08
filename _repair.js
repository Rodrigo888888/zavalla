const fs = require('fs');
const path = 'joias.html';
let s = fs.readFileSync(path, 'utf8');
const dec = new TextDecoder('windows-1252');
const map = {};
for (let b = 0; b < 256; b++) {
  const ch = dec.decode(new Uint8Array([b]));
  if (!(ch in map)) map[ch] = b;
}
const bytes = [];
let bad = 0;
for (const ch of s) {
  if (ch in map) bytes.push(map[ch]);
  else { bad++; bytes.push(ch.codePointAt(0) & 0xFF); }
}
console.log('chars sem mapa:', bad);
const out = Buffer.from(bytes).toString('utf8');
fs.writeFileSync(path, out, 'utf8');
console.log('tem Coração:', out.includes('Coração'));
console.log('tem em-dash:', out.includes('—'));
console.log('tem ©:', out.includes('©'));
console.log('tem ×:', out.includes('×'));
