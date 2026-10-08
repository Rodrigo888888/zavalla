const fs = require('fs');
let s = fs.readFileSync('joias.html', 'utf8');
const start = s.indexOf('        <!-- Espaço reservado para joia 6 -->');
const closeAfter10 = s.indexOf('</div>\n\n      </div>', start);
if (start < 0 || closeAfter10 < 0) { console.log('markers not found'); process.exit(1); }
s = s.slice(0, start) + s.slice(closeAfter10 + 6);
fs.writeFileSync('joias.html', s, 'utf8');
console.log('cards restantes:', (s.match(/class="product-card"/g) || []).length);
console.log('placeholder 6:', s.includes('joia 6'));
console.log('placeholder 10:', s.includes('joia 10'));
