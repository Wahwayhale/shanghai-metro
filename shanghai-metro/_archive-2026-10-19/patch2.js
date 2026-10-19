const fs = require('fs');
const path = require('path');
const dir = __dirname;
function patch(file, pairs) {
  const p = path.join(dir, 'parts', file);
  let s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  for (const [a, b, all] of pairs) {
    if (!s.includes(a)) { console.error('MISS in ' + file + ': ' + a.slice(0, 70)); process.exit(1); }
    s = all ? s.split(a).join(b) : s.replace(a, b);
  }
  fs.writeFileSync(p, s, 'utf8');
  console.log('ok', file, pairs.length);
}

/* ---------------- 10_data: 16 号线路由 ---------------- */
patch('10_data.js', [[
`    highlights: '赛车场 · 汽车城 · 安亭'
  }
];`,
`    highlights: '赛车场 · 汽车城 · 安亭'
  },
  {
    id: 'l16s', line: 6, seg: '南段', segEn: 'SOUTH',
    title: '龙阳路 → 野生动物园',
    sub: '三开门列车 · 第三轨 · 100 km/h',
    desc: '16 号线是上海地铁里最特别的一条：A 型车每节车厢只有三对车门，采用第三轨受流，最高运行速度 100 km/h。这条交路从龙阳路出发，沿浦东腹地向南，穿过周浦、康桥与新场古镇，终到野生动物园，站间距普遍在 3 公里以上。',
    tags: ['三开门', '第三轨', '100 km/h', '长站距'],
    start: '07:10:00', dwell: 26, highlights: '周浦 · 新场古镇 · 野生动物园'
  }
];`]]);

/* ---------------- 20_route: 线路最高速度 ---------------- */
patch('20_route.js', [[
`    this.loop = !!def.loop;`,
`    this.loop = !!def.loop;
    this.vmax = line.vmax || VMAX;`], [
`    this.LIM = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) {
      let lim = VMAX;`,
`    this.LIM = new Float32Array(N + 1);
    const vk = this.vmax / VMAX;
    for (let i = 0; i <= N; i++) {
      let lim = this.vmax;`], [
`        lim = R > 760 ? 80 : R > 560 ? 72 : R > 420 ? 62 : R > 300 ? 52 : 45;`,
`        lim = (R > 760 ? 80 : R > 560 ? 72 : R > 420 ? 62 : R > 300 ? 52 : 45) * vk;`]]);

/* ---------------- 30_materials: 车门数可配 ---------------- */
patch('30_materials.js', [[
`function texCarSide(color, open, mirror, badge) {`,
`function doorOffsetsOf(line) {
  return (line && line.doors === 3) ? [-7.6, 0, 7.6] : [-7.6, -2.6, 2.6, 7.6];
}

function texCarSide(color, open, mirror, badge, doorList) {`], [
`  const doorCenters = [-7.6, -2.6, 2.6, 7.6];`,
`  const doorCenters = doorList || [-7.6, -2.6, 2.6, 7.6];`], [
`function texCarInterior(mirror = false) {
  const key = 'carint' + mirror;`,
`function texCarInterior(mirror = false, doorList) {
  const key = 'carint' + mirror + (doorList ? doorList.join('_') : '');`], [
`  for (const zc of [-7.6, -2.6, 2.6, 7.6]) {
    const px = ((zc + 11.4) / 22.8) * W;
    x.beginPath(); x.roundRect(px - DW / 2 + 2, DY + 3, DW - 4, DH - 5, 4); x.fill();
  }`,
`  for (const zc of (doorList || [-7.6, -2.6, 2.6, 7.6])) {
    const px = ((zc + 11.4) / 22.8) * W;
    x.beginPath(); x.roundRect(px - DW / 2 + 2, DY + 3, DW - 4, DH - 5, 4); x.fill();
  }`]]);

/* ---------------- 50_train: 车门数量 / 内饰 ---------------- */
patch('50_train.js', [[
`      right: new THREE.MeshStandardMaterial({ map: texCarSide(line.color, open, false, line.badge), roughness: 0.42, metalness: 0.12, envMapIntensity: 0.8, alphaTest: 0.45, transparent: false }),
      left: new THREE.MeshStandardMaterial({ map: texCarSide(line.color, open, true, line.badge), roughness: 0.42, metalness: 0.12, envMapIntensity: 0.8, alphaTest: 0.45, transparent: false })`,
`      right: new THREE.MeshStandardMaterial({ map: texCarSide(line.color, open, false, line.badge, doorOffsetsOf(line)), roughness: 0.42, metalness: 0.12, envMapIntensity: 0.8, alphaTest: 0.45, transparent: false }),
      left: new THREE.MeshStandardMaterial({ map: texCarSide(line.color, open, true, line.badge, doorOffsetsOf(line)), roughness: 0.42, metalness: 0.12, envMapIntensity: 0.8, alphaTest: 0.45, transparent: false })`], [
`    const list = [];
    for (const side of [-1, 1]) for (const off of [-7.6, -2.6, 2.6, 7.6]) for (const k of [-1, 1]) list.push({ side, off, k });`,
`    const list = [];
    for (const side of [-1, 1]) for (const off of doorOffsetsOf(this.line)) for (const k of [-1, 1]) list.push({ side, off, k });`], [
`    for (const z of [-7.6, -2.6, 2.6, 7.6]) {
      if (z > z1 - 0.6 || z < z0 + 0.6) continue;`,
`    for (const z of doorOffsetsOf(this.line)) {
      if (z > z1 - 0.6 || z < z0 + 0.6) continue;`], [
`    INT_MAT.wallL = mkWall(true);
    INT_MAT.wallR = mkWall(false);`,
`    const dl = doorOffsetsOf(line);
    INT_MAT.wallL = mkWall(true, dl);
    INT_MAT.wallR = mkWall(false, dl);`], [
`    const mkWall = m => new THREE.MeshStandardMaterial({
      map: texCarInterior(m),`,
`    const mkWall = (m, dl) => new THREE.MeshStandardMaterial({
      map: texCarInterior(m, dl),`], [
`  AC06: { desk: 0x272b2d, wall: 0xa8b0b3, lever: -1, screens: 2, speedo: -1, seat: 0x20262c }`,
`  AC06: { desk: 0x272b2d, wall: 0xa8b0b3, lever: -1, screens: 2, speedo: -1, seat: 0x20262c },
  AC16: { desk: 0x1f2a2a, wall: 0xaebbb8, lever: 1, screens: 3, speedo: 1, seat: 0x1c2a28 }`]]);

/* ---------------- 42_stations: 屏蔽门开孔数量 ---------------- */
patch('42_stations.js', [[
`  const doors = [];
  for (let car = 0; car < 6; car++) {
    for (const off of [-7.6, -2.6, 2.6, 7.6]) {
      doors.push(PLATFORM_HALF - 11.4 - car * CAR_PITCH + off);
    }
  }`,
`  const doors = [];
  for (let car = 0; car < 6; car++) {
    for (const off of doorOffsetsOf(line)) {
      doors.push(PLATFORM_HALF - 11.4 - car * CAR_PITCH + off);
    }
  }`]]);

/* ---------------- 70_game: 高速线路 ---------------- */
patch('70_game.js', [[
`    const vLim = Math.min(79, path.atpLimit(G.s, v) - 2.0) * KMH;`,
`    const vLim = Math.min(path.vmax - 1, path.atpLimit(G.s, v) - 2.0) * KMH;`], [
`  ctx.fillText('80', 8, y0 + 5);`,
`  const vTop = (typeof path !== 'undefined' && path && path.vmax) ? path.vmax : 80;
  ctx.fillText(String(Math.round(vTop)), 8, y0 + 5);`], [
`    const y = y1 - clamp(v / 80, 0, 1) * (y1 - y0);`,
`    const y = y1 - clamp(v / vTop, 0, 1) * (y1 - y0);`]]);

console.log('all patched');
