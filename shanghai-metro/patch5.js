const fs = require('fs');
const path = require('path');
const dir = __dirname;
function patch(file, pairs) {
  const p = path.join(dir, 'parts', file);
  let s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.error('MISS in ' + file + ': ' + a.slice(0, 70)); process.exit(1); }
    s = s.replace(a, b);
  }
  fs.writeFileSync(p, s, 'utf8');
  console.log('ok', file, pairs.length);
}

/* 路由自带的站表优先；环线里程闭合 */
patch('80_ui.js', [[
`  let d = 0;
  const st = LINES[route.line].stations;
  for (let i = 0; i < st.length - 1; i++) {
    const a = st[i], b = st[i + 1];
    const dx = (b.lon - a.lon) * 111320 * Math.cos(a.lat * D2R);
    const dz = (b.lat - a.lat) * 111132;
    d += Math.hypot(dx, dz);
  }
  return d / 1000;`,
`  let d = 0;
  const st = route.stations || LINES[route.line].stations;
  const seg = (a, b) => {
    const dx = (b.lon - a.lon) * 111320 * Math.cos(a.lat * D2R);
    const dz = (b.lat - a.lat) * 111132;
    return Math.hypot(dx, dz);
  };
  for (let i = 0; i < st.length - 1; i++) d += seg(st[i], st[i + 1]);
  if (route.loop) d += seg(st[st.length - 1], st[0]);
  return d / 1000;`], [
`function routeMapSVG(route) {
  const st = LINES[route.line].stations;`,
`function routeMapSVG(route) {
  const st = route.stations || LINES[route.line].stations;`], [
`  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');`,
`  let d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  if (route.loop) d += ' Z';`]]);

/* 线路列表独立滚动，保证开始按钮始终可见 */
patch('00_head.html', [[
`  .route-list{display:flex;flex-direction:column;gap:10px}`,
`  .route-list{display:flex;flex-direction:column;gap:10px;max-height:min(52vh,470px);overflow-y:auto;
    padding-right:6px;mask-image:linear-gradient(180deg,#000 0,#000 calc(100% - 22px),transparent 100%)}
  .route-list::-webkit-scrollbar{width:5px}
  .route-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,.16);border-radius:3px}`]]);

console.log('done');
