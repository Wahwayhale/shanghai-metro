/* 生成全网线路：官方站序 + 官方站点 x/y + 首末班运行时分 */
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const partsDir = path.join(dir, '..', 'parts');

const colors = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(dir, 'metro_lines.json'), 'utf8')).map(x => [String(x.line_no), x.color]));
const mapLoc = JSON.parse(fs.readFileSync(path.join(dir, 'metro_map.json'), 'utf8')).levels[0].locations;
const xy = new Map();
for (const l of mapLoc) if (!xy.has(l.title)) xy.set(l.title, { x: +l.x, y: +l.y });

/* 现有真实站坐标作为拟合锚点 */
const txt = fs.readFileSync(path.join(partsDir, '10_data.js'), 'utf8');
const re = /\{\s*zh:\s*'((?:\\.|[^'])*)',\s*en:\s*'((?:\\.|[^'])*)',\s*lat:\s*(-?[\d.]+),\s*lon:\s*(-?[\d.]+)/g;
const real = new Map(), enMap = new Map();
let m;
while ((m = re.exec(txt))) {
  const name = m[1].replace(/\\'/g, "'"), en = m[2].replace(/\\'/g, "'");
  const lat = +m[3], lon = +m[4];
  if (!real.has(name)) real.set(name, { lat, lon, n: 1 });
  else { const a = real.get(name); a.lat += lat; a.lon += lon; a.n++; }
  if (!enMap.has(name)) enMap.set(name, en);
}
for (const v of real.values()) { v.lat /= v.n; v.lon /= v.n; }

/* 官方 x/y -> lat/lon 的二次拟合 */
const anchors = [];
for (const [name, r] of real) { const p = xy.get(name); if (p) anchors.push({ x: p.x, y: p.y, lat: r.lat, lon: r.lon }); }
function solve(M, b) {
  const n = b.length, a = M.map((r, i) => r.concat(b[i]));
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    const d = a[c][c]; if (Math.abs(d) < 1e-12) continue;
    for (let j = c; j <= n; j++) a[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c]; if (!f) continue;
      for (let j = c; j <= n; j++) a[r][j] -= f * a[c][j];
    }
  }
  return a.map(r => r[n]);
}
function fit() {
  const feat = (x, y) => [1, x, y, x * x, y * y, x * y];
  const k = 6, M = Array.from({ length: k }, () => Array(k).fill(0)), bl = Array(k).fill(0), bt = Array(k).fill(0);
  for (const p of anchors) {
    const f = feat(p.x, p.y);
    for (let i = 0; i < k; i++) {
      bl[i] += f[i] * p.lon; bt[i] += f[i] * p.lat;
      for (let j = 0; j < k; j++) M[i][j] += f[i] * f[j];
    }
  }
  const lon = solve(M, bl), lat = solve(M, bt);
  return (x, y) => { const f = feat(x, y); return { lon: lon.reduce((s, v, i) => s + v * f[i], 0), lat: lat.reduce((s, v, i) => s + v * f[i], 0) }; };
}
const project = fit();

const sec = t => !t || t === '--' ? null : (([h, mi]) => h * 3600 + mi * 60)(t.split(':').map(Number));
const lineNos = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 41, 51];
const raw = {};
for (const n of lineNos) raw[n] = JSON.parse(fs.readFileSync(path.join(dir, `fltime_${n}.json`), 'utf8'));

function chooseDirection(n) {
  const groups = {};
  for (const x of raw[n]) (groups[x.description] ||= []).push(x);
  let best = null;
  for (const [desc, arr] of Object.entries(groups)) {
    let seq = [], prev = null;
    for (const x of arr) { if (x.name !== prev) { seq.push({ ...x }); prev = x.name; } }
    let loop = false;
    if (seq.length > 1 && seq[0].name === seq[seq.length - 1].name) { seq.pop(); loop = true; }
    if (seq.length < 2) continue;
    const score = t => {
      let inc = 0, valid = 0;
      for (let i = 1; i < t.length; i++) {
        if (t[i] != null && t[i - 1] != null) { valid++; if (t[i] >= t[i - 1]) inc++; }
      }
      return { inc, valid, ratio: valid ? inc / valid : 0 };
    };
    let times = seq.map(x => sec(x.last_time));
    let sc = score(times);
    if (sc.ratio < 0.5) { seq.reverse(); times = seq.map(x => sec(x.last_time)); sc = score(times); }
    const total = seq.length + sc.ratio * 8;
    if (!best || total > best.total) best = { desc, seq, loop, times, total };
  }
  return best;
}

/* 线路元数据 */
const models = { 1: 'AC04', 2: 'AC02', 3: 'AC03', 4: 'AC05', 11: 'AC06', 16: 'AC16', 41: 'AC04' };
const vvvfs = { 1: 'GTO', 16: 'PM' };
const vmaxs = { 16: 120, 17: 100, 51: 120 };
const ys = { 3: 10, 5: 10, 11: 10, 16: 9.5, 17: 10, 41: 10, 51: -14 };
const lineName = n => n === 41 ? '浦江线' : n === 51 ? '市域机场线' : `${n}号线`;
const lineEn = n => n === 41 ? 'Pujiang Line' : n === 51 ? 'Airport Link' : `Line ${n}`;
const dwells = { 16: 26, 41: 26, 51: 24 };
const fullNos = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 41, 51];

const defs = [];
for (const n of fullNos) {
  const pick = chooseDirection(n);
  const seq = pick.seq;
  const dwell = dwells[n] || 28;
  const stations = seq.map(x => {
    const p = xy.get(x.name) || { x: 0.5, y: 0.5 };
    const ll = project(p.x, p.y);
    return {
      zh: x.name, en: enMap.get(x.name) || x.name,
      lat: +ll.lat.toFixed(6), lon: +ll.lon.toFixed(6),
      y: ys[n] ?? -14, tr: [], near: ''
    };
  });
  const runs = [];
  for (let i = 1; i < seq.length; i++) {
    const a = sec(seq[i - 1].last_time), b = sec(seq[i].last_time);
    let d = a != null && b != null ? b - a : null;
    if (d != null && d < 0) d += 86400;
    const run = d == null ? null : d - dwell;
    runs.push(run >= 30 && run <= 600 ? run : null);
  }
  defs.push({ n, seq, stations, runs, dwell, pick });
}

/* 4 号线已有完整环线；它的站名纳入换乘表 */
const line4Order = chooseDirection(4);
const nameToLines = new Map();
for (const d of defs) {
  for (const s of d.stations) {
    if (!nameToLines.has(s.zh)) nameToLines.set(s.zh, new Set());
    nameToLines.get(s.zh).add(lineName(d.n));
  }
}
for (const x of line4Order.seq) {
  if (!nameToLines.has(x.name)) nameToLines.set(x.name, new Set());
  nameToLines.get(x.name).add('4号线');
}
for (const name of ['龙阳路', '浦东1号2号航站楼']) {
  if (!nameToLines.has(name)) nameToLines.set(name, new Set());
  nameToLines.get(name).add('磁浮线');
}
for (const d of defs) {
  for (const s of d.stations) {
    s.tr = [...nameToLines.get(s.zh)].filter(n => n !== lineName(d.n));
  }
}

const baseLine = 7; // parts/10_data.js 中现有 LINES 的数量
const NETWORK_LINES = [], NETWORK_ROUTES = [], OFFICIAL_RUN_NETWORK = {};
const lineIdxByNo = {};
for (let i = 0; i < defs.length; i++) {
  const d = defs[i], n = d.n, ln = lineName(n);
  lineIdxByNo[n] = baseLine + i;
  NETWORK_LINES.push({
    id: 'F' + n, badge: String(n), name: ln, en: lineEn(n), color: colors[n] || '#888888',
    depot: `${ln}车辆段`, stock: models[n] || 'AC-05', cars: 6,
    model: models[n] || 'AC05', vvvf: vvvfs[n] || 'IGBT',
    vmax: vmaxs[n] || 80, thirdRail: n === 16, doors: n === 16 ? 3 : 4,
    stations: d.stations
  });
  const id = 'full' + n;
  const first = d.seq[0], last = d.seq[d.seq.length - 1];
  NETWORK_ROUTES.push({
    id, line: baseLine + i, seg: '全线', segEn: 'FULL LINE',
    title: `${first.name} → ${last.name}`,
    sub: `${d.seq.length} 站 · 官方站序 · ${vmaxs[n] || 80} km/h`,
    desc: `${ln}全线交路，站序与站名取自上海轨道交通网络示意图；运行时分由官方首末班车时刻表推导。`,
    tags: [ln, '全线', `${d.seq.length} 站`],
    start: first.first_time && first.first_time !== '--' ? first.first_time : '08:00:00',
    dwell: d.dwell, highlights: `${first.name} · ${last.name}`
  });
  OFFICIAL_RUN_NETWORK[id] = d.runs;
}

/* 4 号线完整环线放在全线卡序列中；复用现有 L4 站表，不重复建线 */
NETWORK_ROUTES.splice(3, 0, {
  id: 'full4', line: 3, seg: '全线', segEn: 'FULL LINE',
  title: '世纪大道 → 世纪大道', sub: '26 站 · 完整环线',
  desc: '4 号线完整环线，复用现有 26 站环线站表与官方运行时分。',
  tags: ['4号线', '全线', '26 站'], start: '08:40:00', dwell: 28,
  highlights: '世纪大道 · 上海火车站 · 上海体育馆', loop: true
});

/* 支线交路：官方 fltime 的分支方向，单独成卡 */
const branchSpecs = [
  { n: 5, desc: '往闵行开发区', id: 'br5' },
  { n: 7, desc: '往祁华路', id: 'br7' },
  { n: 9, desc: '往佘山', id: 'br9' },
  { n: 10, desc: '航中路始发 往基隆路', id: 'br10a' },
  { n: 10, desc: '航中路始发 往新江湾城', id: 'br10b' },
  { n: 11, desc: '往安亭', id: 'br11' },
  { n: 13, desc: '往华鹏路', id: 'br13' },
  { n: 18, desc: '往航头方向', id: 'br18' }
];
for (const spec of branchSpecs) {
  const n = spec.n, ln = lineName(n), dwell = dwells[n] || 28;
  let seq = [], prev = null;
  for (const x of raw[n].filter(x => x.description === spec.desc)) {
    if (x.name !== prev) { seq.push({ ...x }); prev = x.name; }
  }
  if (seq.length < 2) continue;
  let times = seq.map(x => sec(x.last_time));
  let inc = 0, valid = 0;
  for (let i = 1; i < times.length; i++) if (times[i] != null && times[i - 1] != null) { valid++; if (times[i] >= times[i - 1]) inc++; }
  if (valid && inc / valid < 0.5) { seq.reverse(); times = seq.map(x => sec(x.last_time)); }
  const stations = seq.map(x => {
    const p = xy.get(x.name) || { x: 0.5, y: 0.5 };
    const ll = project(p.x, p.y);
    return {
      zh: x.name, en: enMap.get(x.name) || x.name,
      lat: +ll.lat.toFixed(6), lon: +ll.lon.toFixed(6),
      y: ys[n] ?? -14, tr: [], near: ''
    };
  });
  for (const s of stations) {
    if (!nameToLines.has(s.zh)) nameToLines.set(s.zh, new Set());
    nameToLines.get(s.zh).add(ln);
  }
  for (const s of stations) s.tr = [...nameToLines.get(s.zh)].filter(x => x !== ln);
  const runs = [];
  for (let i = 1; i < seq.length; i++) {
    const a = sec(seq[i - 1].last_time), b2 = sec(seq[i].last_time);
    let d = a != null && b2 != null ? b2 - a : null;
    if (d != null && d < 0) d += 86400;
    const run = d == null ? null : d - dwell;
    runs.push(run >= 30 && run <= 600 ? run : null);
  }
  const first = seq[0], last = seq[seq.length - 1];
  NETWORK_ROUTES.push({
    id: spec.id, line: lineIdxByNo[n], seg: '支线', segEn: 'BRANCH',
    title: `${first.name} → ${last.name}`,
    sub: `${seq.length} 站 · 支线 · ${vmaxs[n] || 80} km/h`,
    desc: `${ln}${spec.desc}方向支线交路，站序和运行时分取自官方首末班车数据。`,
    tags: [ln, '支线', `${seq.length} 站`],
    start: first.first_time && first.first_time !== '--' ? first.first_time : '08:00:00',
    dwell, highlights: `${first.name} · ${last.name}`, stations
  });
  OFFICIAL_RUN_NETWORK[spec.id] = runs;
}

/* 磁浮线（官方 fltime 无数据，按示意图两站，运行时分回退物理曲线） */
const cfStations = ['龙阳路', '浦东1号2号航站楼'].map(name => {
  const p = xy.get(name) || { x: 0.55, y: 0.55 };
  const ll = project(p.x, p.y);
  return { zh: name, en: enMap.get(name) || name, lat: +ll.lat.toFixed(6), lon: +ll.lon.toFixed(6), y: 10, tr: ['2号线', '7号线', '16号线'], near: '磁浮' };
});
NETWORK_LINES.push({
  id: 'FCF', badge: '磁浮', name: '磁浮线', en: 'Maglev', color: '#00a0e9',
  depot: '磁浮维修基地', stock: 'Maglev', cars: 3, model: 'AC05', vvvf: 'IGBT',
  vmax: 120, thirdRail: false, doors: 4, stations: cfStations
});
NETWORK_ROUTES.push({
  id: 'fullCF', line: baseLine + NETWORK_LINES.length - 1, seg: '全线', segEn: 'FULL LINE',
  title: '龙阳路 → 浦东1号2号航站楼', sub: '2 站 · 磁浮 · 120 km/h',
  desc: '上海磁浮示范运营线，按示意图还原龙阳路至浦东机场两站。',
  tags: ['磁浮线', '全线', '2 站'], start: '06:45:00', dwell: 20, highlights: '龙阳路 · 浦东机场'
});

fs.writeFileSync(path.join(partsDir, '12_network.js'), `/* =====================================================================
   全网线路：1–18 号线、浦江线、市域机场线、磁浮线
   站序、站名来自官方 fltime；坐标来自官方站点 x/y 拟合
   ===================================================================== */
const NETWORK_LINES = ${JSON.stringify(NETWORK_LINES)};
const NETWORK_ROUTES = ${JSON.stringify(NETWORK_ROUTES)};
const OFFICIAL_RUN_NETWORK = ${JSON.stringify(OFFICIAL_RUN_NETWORK)};
LINES.push(...NETWORK_LINES);
ROUTES.unshift(...NETWORK_ROUTES);
`, 'utf8');

console.log('lines', NETWORK_LINES.length, 'routes', NETWORK_ROUTES.length, 'anchors', anchors.length);
for (const d of defs) console.log('L' + d.n, d.seq.length, d.seq[0].name, '->', d.seq[d.seq.length - 1].name, 'runs', d.runs.filter(x => x == null).length + ' null');
