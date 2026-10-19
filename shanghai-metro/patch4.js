const fs = require('fs');
const path = require('path');
const dir = __dirname;
const p = path.join(dir, 'parts', '70_game.js');
let s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const pairs = [
  [`  const vLim = Math.min(79, path.atpLimit(G.s, v) - 2.0) * KMH;`,
   `  const vLim = Math.min(path.vmax - 1, path.atpLimit(G.s, v) - 2.0) * KMH;`],
  [`  ctx.fillText('80', 8, y0 + 5);`,
   `  const vTop = (typeof path !== 'undefined' && path && path.vmax) ? path.vmax : 80;
  ctx.fillText(String(Math.round(vTop)), 8, y0 + 5);`],
  [`    const y = y1 - clamp(v / 80, 0, 1) * (y1 - y0);`,
   `    const y = y1 - clamp(v / vTop, 0, 1) * (y1 - y0);`]
];
for (const [a, b] of pairs) {
  if (!s.includes(a)) { console.error('MISS', a.slice(0, 50)); process.exit(1); }
  s = s.replace(a, b);
}
fs.writeFileSync(p, s, 'utf8');
console.log('ok 70_game');
