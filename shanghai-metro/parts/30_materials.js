/* ================================================================
   程序化纹理与材质
   ================================================================ */
const TEX_CACHE = new Map();
const MAT = {};

function cv2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function toTex(canvas, rx = 1, ry = 1, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/* ---------------- 程序化法线贴图（建模提升） ----------------
   本项目所有材质原本只有基础色 + 常数粗糙度，normalMap / bumpMap 全为 0，
   这就是画面「像塑料」的根源——表面没有任何微观起伏。

   这里的做法：给一个高度函数 h(x,y)，用中心差分算梯度，直接写出法线贴图的
   RGB。采样时用 RepeatWrapping，与基础色贴图共用 UV（three.js 会按材质里的
   map 的 repeat 自动处理，所以只要两张贴图的 repeat 一致即可对齐）。

   注意：不生成切线属性。three.js 在没有 tangent 时会用屏幕空间导数推 TBN，
   对这种大平面接缝类几何完全够用，省掉每顶点 4 个 float。 */
function texNormalMap(key, W, H, heightFn, strength) {
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const s = strength == null ? 2.0 : strength;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      /* 环绕采样，保证贴图平铺时四边无缝 */
      const hl = heightFn((x - 1 + W) % W, y);
      const hr = heightFn((x + 1) % W, y);
      const hu = heightFn(x, (y - 1 + H) % H);
      const hd = heightFn(x, (y + 1) % H);
      let nx = (hl - hr) * s;
      let ny = (hu - hd) * s;
      let nz = 1;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const i = (y * W + x) * 4;
      d[i] = (nx * inv * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * inv * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  /* 法线贴图是数据贴图，不能当 sRGB 颜色处理 */
  tex.colorSpace = THREE.NoColorSpace;
  TEX_CACHE.set(key, tex);
  return tex;
}

/* 程序化粗糙度贴图：把「哪里光滑、哪里粗糙」写成灰度。
   three.js 的 roughnessMap 取 GREEN 通道，灰度写入即可。
   和法线贴图一样必须 NoColorSpace（它是数据贴图，不是颜色）。
   用途：让表面出现「用旧了」的不均匀感 —— 隧道壁有光滑的水痕、
   站台地砖边角被磨亮、道砟整体粗糙但颗粒间有明暗。 */
function texRoughMap(key, W, H, fn) {
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = Math.max(0, Math.min(1, fn(x, y)));
      const g = Math.round(v * 255);
      const i = (y * W + x) * 4;
      d[i] = g; d[i + 1] = g; d[i + 2] = g; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  TEX_CACHE.set(key, tex);
  return tex;
}

/* 确定性哈希噪声：同一个坐标永远得到同一个值，便于平铺 */
function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + (seed || 0) * 1442695040;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return ((h >>> 0) % 100000) / 100000;
}

/* 平滑值噪声：在格点上插值，得到连续的起伏场 */
function valueNoise(x, y, cells, seed) {
  const fx = x / 256 * cells, fy = y / 256 * cells;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
  const c2 = hash2(x0, y0 + 1, seed), d2 = hash2(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * sx;
  const bot = c2 + (d2 - c2) * sx;
  return top + (bot - top) * sy;
}

/* 多倍频噪声，模拟混凝土/道砟的粗糙表面 */
function fbm2(x, y, seed, octaves) {
  let v = 0, amp = 0.5, cells = 6;
  const n = octaves || 3;
  for (let i = 0; i < n; i++) {
    v += valueNoise(x, y, cells, seed + i * 17) * amp;
    amp *= 0.5; cells *= 2;
  }
  return v;
}

function noiseFill(ctx, w, h, n, col, aMin, aMax) {
  ctx.save();
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    const s = Math.random() * 2.2 + 0.4;
    ctx.globalAlpha = aMin + Math.random() * (aMax - aMin);
    ctx.fillStyle = col;
    ctx.fillRect(x, y, s, s);
  }
  ctx.restore();
}

/* ---------------- 混凝土 ---------------- */
function texConcrete(base = '#6a6d70', dark = 0.1, seams = 0) {
  const key = 'conc' + base + dark + seams;
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const [c, x] = cv2d(512, 512);
  x.fillStyle = base; x.fillRect(0, 0, 512, 512);
  // 大块色斑
  for (let i = 0; i < 26; i++) {
    const g = x.createRadialGradient(Math.random() * 512, Math.random() * 512, 4, Math.random() * 512, Math.random() * 512, 60 + Math.random() * 110);
    g.addColorStop(0, `rgba(0,0,0,${0.02 + Math.random() * 0.05})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  }
  noiseFill(x, 512, 512, 5200, '#000', 0.02, 0.07);
  noiseFill(x, 512, 512, 2600, '#fff', 0.015, 0.05);
  // 模板拼缝
  x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const y = 64 + i * 128;
    x.beginPath(); x.moveTo(0, y); x.lineTo(512, y); x.stroke();
  }
  if (seams) {
    x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 2.5;
    for (let y = 0; y < 512; y += seams) { x.beginPath(); x.moveTo(0, y); x.lineTo(512, y); x.stroke(); }
    x.strokeStyle = 'rgba(255,255,255,.05)'; x.lineWidth = 1;
    for (let y = 2; y < 512; y += seams) { x.beginPath(); x.moveTo(0, y); x.lineTo(512, y); x.stroke(); }
  }
  const t = toTex(c);
  TEX_CACHE.set(key, t);
  return t;
}

/* ---------------- 道砟 / 道床 ---------------- */
function texBallast() {
  if (TEX_CACHE.has('ballast')) return TEX_CACHE.get('ballast');
  const [c, x] = cv2d(256, 256);
  x.fillStyle = '#37393b'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2400; i++) {
    const g = 40 + Math.random() * 55;
    x.fillStyle = `rgba(${g},${g + 2},${g + 3},${0.5 + Math.random() * 0.5})`;
    const s = 1 + Math.random() * 3;
    x.beginPath(); x.ellipse(Math.random() * 256, Math.random() * 256, s, s * 0.8, Math.random() * 3, 0, TAU); x.fill();
  }
  noiseFill(x, 256, 256, 1500, '#000', 0.05, 0.18);
  const t = toTex(c, 1, 1);
  TEX_CACHE.set('ballast', t);
  return t;
}

/* ---------------- 站台地面 ---------------- */
function texPlatformFloor() {
  if (TEX_CACHE.has('pfloor')) return TEX_CACHE.get('pfloor');
  const [c, x] = cv2d(512, 512);
  x.fillStyle = '#adb4b8'; x.fillRect(0, 0, 512, 512);
  /* 8×8 花岗岩地砖网格，与 256² 法线贴图的 32px 周期（8×8）严格对齐 */
  const tw = 64, th = 64;
  for (let gy = 0; gy < 8; gy++) for (let gx = 0; gx < 8; gx++) {
    const v = 186 + ((gx * 7 + gy * 13) % 5) * 3 + Math.random() * 8;
    x.fillStyle = `rgb(${v | 0},${(v + 3) | 0},${(v + 6) | 0})`;
    x.fillRect(gx * tw + 1.5, gy * th + 1.5, tw - 3, th - 3);
    // 砖面微弱高光边与斜向抛光光泽
    x.fillStyle = 'rgba(255,255,255,.10)';
    x.fillRect(gx * tw + 2, gy * th + 2, tw - 4, 3);
    x.fillRect(gx * tw + 2, gy * th + 2, 3, th - 4);
    x.fillStyle = 'rgba(0,0,0,.06)';
    x.fillRect(gx * tw + 2, (gy + 1) * th - 4, tw - 4, 2);
  }
  // 花岗岩矿物细斑点
  noiseFill(x, 512, 512, 5500, '#2b3136', 0.025, 0.075);
  noiseFill(x, 512, 512, 4200, '#ffffff', 0.03, 0.08);
  // 砖缝
  x.strokeStyle = 'rgba(42,48,54,.34)'; x.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    x.beginPath(); x.moveTo(i * tw, 0); x.lineTo(i * tw, 512); x.stroke();
    x.beginPath(); x.moveTo(0, i * th); x.lineTo(512, i * th); x.stroke();
  }
  const t = toTex(c, 1, 1);
  TEX_CACHE.set('pfloor', t);
  return t;
}

/* ---------------- 盲道 ---------------- */
function texTactile() {
  if (TEX_CACHE.has('tactile')) return TEX_CACHE.get('tactile');
  const [c, x] = cv2d(128, 128);
  x.fillStyle = '#e0ab1b'; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(90,62,0,.35)'; x.lineWidth = 3;
  x.strokeRect(1.5, 1.5, 125, 125);
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    const cx = 16 + gx * 32, cy = 16 + gy * 32;
    x.fillStyle = 'rgba(0,0,0,.24)';
    x.beginPath(); x.arc(cx + 1.5, cy + 1.5, 8.5, 0, TAU); x.fill();
    x.fillStyle = '#f2c138';
    x.beginPath(); x.arc(cx, cy, 8, 0, TAU); x.fill();
    x.fillStyle = 'rgba(255,250,210,.45)';
    x.beginPath(); x.arc(cx - 2, cy - 2, 4.2, 0, TAU); x.fill();
  }
  const t = toTex(c, 1, 1);
  TEX_CACHE.set('tactile', t);
  return t;
}

/* ---------------- 楼宇立面 ---------------- */
function texBuilding(variant = 0, floors = 16) {
  const key = 'bld' + variant + '_' + floors;
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const W = 256, H = 512;
  const [c, x] = cv2d(W, H);
  const [ec, ex] = cv2d(W, H);
  const facades = ['#242a31', '#2c3339', '#1f252b'];
  const base = facades[variant % 3];
  x.fillStyle = base; x.fillRect(0, 0, W, H);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);
  // 立面竖向分隔
  x.fillStyle = 'rgba(255,255,255,.035)';
  for (let i = 0; i < 4; i++) x.fillRect(i * 64 + 6, 0, 3, H);
  const cols = 6;
  const rows = floors;
  const cw = W / cols, ch = H / rows;
  const winW = cw * 0.58, winH = ch * 0.56;
  for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
    const px = col * cw + (cw - winW) / 2;
    const py = r * ch + (ch - winH) / 2;
    const lit = Math.random() < (variant === 2 ? 0.42 : 0.3);
    if (lit) {
      const warm = Math.random() < 0.72;
      const g = x.createLinearGradient(px, py, px, py + winH);
      g.addColorStop(0, warm ? '#ffe3ae' : '#dff0ff');
      g.addColorStop(1, warm ? '#c79352' : '#8fb6cc');
      x.fillStyle = g; x.fillRect(px, py, winW, winH);
      ex.fillStyle = warm ? 'rgba(255,214,150,.95)' : 'rgba(200,230,255,.9)';
      ex.fillRect(px, py, winW, winH);
    } else {
      x.fillStyle = 'rgba(9,13,18,.92)'; x.fillRect(px, py, winW, winH);
      x.fillStyle = 'rgba(120,160,190,.08)';
      x.fillRect(px, py, winW, winH * 0.4);
    }
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(px, py + winH, winW, 2);
  }
  // 顶部设备层
  x.fillStyle = 'rgba(255,255,255,.05)'; x.fillRect(0, 0, W, 10);
  const t = toTex(c, 1, 1);
  const e = toTex(ec, 1, 1);
  const out = { map: t, emissive: e };
  TEX_CACHE.set(key, out);
  return out;
}

/* ---------------- 车厢侧面涂装 ---------------- */
function doorOffsetsOf(line) {
  if (line && line.doors === 5) return [-9.5, -4.75, 0, 4.75, 9.5];   // 15 号线 sh15 模型：5 门/侧
  return (line && line.doors === 3) ? [-7.6, 0, 7.6] : [-7.6, -2.6, 2.6, 7.6];
}

/* 车窗沿车长的排布（米，相对车厢中心）：只在「门与门之间」的区段里排窗，
   这样窗洞永远不会被门洞吃掉。内外壁共用同一套位置，视线才对得上。 */
const CAR_WIN_W = 1.30, CAR_WIN_GAP = 0.34, CAR_DOOR_HALF = 0.70;
function carWinSlots(doorList) {
  const doors = doorList || [-7.6, -2.6, 2.6, 7.6];
  const HALF = 11.4;
  const edges = [];
  for (const z of doors) edges.push([z - CAR_DOOR_HALF, z + CAR_DOOR_HALF]);
  /* 车长区段：[起, 止] */
  const gaps = [];
  let cur = -HALF;
  for (const [a, b] of edges) {
    if (a - cur > 1.2) gaps.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (HALF - cur > 1.2) gaps.push([cur, HALF]);
  const out = [];
  for (const [a, b] of gaps) {
    const L = b - a;
    /* 每个区段按 1.3 m 窗 + 0.34 m 间隔尽量均分，两侧留 0.30 m 边距 */
    const usable = L - 0.6;
    let n = Math.max(1, Math.floor((usable + CAR_WIN_GAP) / (CAR_WIN_W + CAR_WIN_GAP)));
    let w = (usable - CAR_WIN_GAP * (n - 1)) / n;
    if (w > 1.5) { n += 1; w = (usable - CAR_WIN_GAP * (n - 1)) / n; }
    if (w < 0.95) { n = Math.max(1, n - 1); w = (usable - CAR_WIN_GAP * (n - 1)) / n; }
    const step = w + CAR_WIN_GAP;
    const x0 = a + (L - (n * w + (n - 1) * CAR_WIN_GAP)) / 2;
    for (let i = 0; i < n; i++) out.push({ z: x0 + w / 2 + i * step, w });
  }
  return out;
}
function texCarSide(color, open = false, mirror = false, lineNo = '02', doorList, color2 = null) {
  const key = `car_${color}_${color2 || ''}_${open}_${mirror}_${lineNo}`;
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const W = 2048, H = 512;
  const [c, x] = cv2d(W, H);
  if (mirror) { x.translate(W, 0); x.scale(-1, 1); }
  // 车体
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#fbfcfb'); g.addColorStop(0.72, '#eef0ef'); g.addColorStop(1, '#d6d9d8');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // 顶部阴影
  x.fillStyle = 'rgba(0,0,0,.16)'; x.fillRect(0, 0, W, 12);
  // 裙板
  x.fillStyle = '#3c4246'; x.fillRect(0, 448, W, 64);
  x.fillStyle = 'rgba(255,255,255,.1)'; x.fillRect(0, 448, W, 3);
  // 色带（共线段使用双色）
  x.fillStyle = color; x.fillRect(0, 402, W, 40);
  if (color2) { x.fillStyle = color2; x.fillRect(0, 442, W, 6); }
  x.fillStyle = 'rgba(255,255,255,.28)'; x.fillRect(0, 402, W, 3);
  // 窗带
  x.fillStyle = '#141a1f'; x.fillRect(20, 128, W - 40, 214);
  // 车窗（按门间区段排布，与内壁窗洞同一套位置）
  const zToPx = (z) => ((z + 11.4) / 22.8) * W;
  const slots = carWinSlots(doorList);
  for (const sl of slots) {
    const pw = (sl.w / 22.8) * W, px = zToPx(sl.z) - pw / 2;
    const wg = x.createLinearGradient(px, 140, px + pw, 330);
    wg.addColorStop(0, '#2b3d4b'); wg.addColorStop(0.45, '#101820'); wg.addColorStop(1, '#1b2a35');
    x.fillStyle = wg;
    x.beginPath(); x.roundRect(px, 140, pw, 190, 12); x.fill();
    x.strokeStyle = 'rgba(255,255,255,.16)'; x.lineWidth = 2;
    x.beginPath(); x.roundRect(px, 140, pw, 190, 12); x.stroke();
    x.fillStyle = 'rgba(180,215,235,.10)';
    x.beginPath(); x.moveTo(px + 8, 330); x.lineTo(px + pw * 0.42, 140); x.lineTo(px + pw * 0.66, 140); x.lineTo(px + pw * 0.30, 330); x.closePath(); x.fill();
  }
  // 车门（门洞 1.15m~3.05m 高）
  const doorCenters = doorList || [-7.6, -2.6, 2.6, 7.6];
  const DW = 126, DH = 341, DY = 143;
  for (const zc of doorCenters) {
    const px = ((zc + 11.4) / 22.8) * W;
    x.fillStyle = '#c9cdcc'; x.fillRect(px - DW / 2 - 5, DY - 5, DW + 10, DH + 6);
    if (open) {
      x.fillStyle = '#0a0d0f'; x.fillRect(px - DW / 2, DY, DW, DH);
    } else {
      const dg = x.createLinearGradient(px - DW / 2, 0, px + DW / 2, 0);
      dg.addColorStop(0, '#e8ebea'); dg.addColorStop(.5, '#f4f6f5'); dg.addColorStop(1, '#dfe2e1');
      x.fillStyle = dg; x.fillRect(px - DW / 2, DY, DW, DH);
      x.fillStyle = '#5b6469'; x.fillRect(px - 1.5, DY, 3, DH);
      x.fillStyle = '#16212a';
      x.beginPath(); x.roundRect(px - DW / 2 + 14, DY + 26, DW / 2 - 20, 120, 8); x.fill();
      x.beginPath(); x.roundRect(px + 6, DY + 26, DW / 2 - 20, 120, 8); x.fill();
      x.fillStyle = 'rgba(0,0,0,.06)'; x.fillRect(px - DW / 2 + 8, DY + 190, DW - 16, 130);
      x.fillStyle = 'rgba(0,0,0,.22)'; x.fillRect(px - DW / 2 + 10, DY + 172, DW - 20, 4);
    }
    x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 1.5;
    x.strokeRect(px - DW / 2 - 5, DY - 5, DW + 10, DH + 6);
  }
  // 开孔：车窗与门洞（仅玩家列车使用 open 版本）
  if (open) {
    /* destination-out 按「源 alpha」擦除：必须先把 fillStyle 设成不透明纯色。
     否则沿用上一段的半透明色（rgba(0,0,0,.10)）只会擦掉一点点，
     窗洞/门洞的 alpha 仍是 229 > alphaTest 0.45，等于根本没开孔 —— 车厢内看不到窗外就是这个原因。 */
  x.fillStyle = '#000';
  x.globalCompositeOperation = 'destination-out';
    for (const sl of slots) {
      const pw = (sl.w / 22.8) * W, px = zToPx(sl.z) - pw / 2;
      x.beginPath(); x.roundRect(px + 2, 142, pw - 4, 186, 10); x.fill();
    }
    for (const zc of doorCenters) {
      const px = ((zc + 11.4) / 22.8) * W;
      x.beginPath(); x.roundRect(px - DW / 2 + 2, DY + 3, DW - 4, DH - 5, 4); x.fill();
    }
    x.globalCompositeOperation = 'source-over';
  }
  // 编号 / 标识
  x.fillStyle = '#2a3034'; x.font = '600 26px "Microsoft YaHei",sans-serif';
  x.fillText('上海地铁', 1520, 96);
  x.fillStyle = color; x.fillRect(1490, 108, 132, 6);
  x.fillStyle = '#4a5257'; x.font = '500 22px ui-monospace,monospace';
  x.fillText(`SHANGHAI METRO  ·  ${lineNo}A014`, 1460, 140);
  x.fillStyle = '#7a8288'; x.font = '500 20px ui-monospace,monospace';
  x.fillText('A型车  定员 310', 150, 476);
  // 车身分色线
  x.strokeStyle = 'rgba(0,0,0,.08)'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(0, 126); x.lineTo(W, 126); x.stroke();
  const t = toTex(c, 1, 1);
  TEX_CACHE.set(key, t);
  return t;
}

/* ---------------- 站台立柱搪瓷板 ---------------- */
function texColumnEnamel() {
  if (TEX_CACHE.has('colenamel')) return TEX_CACHE.get('colenamel');
  const W = 256, H = 256;
  const [c, x] = cv2d(W, H);
  /* 米白搪瓷底 + 极细颗粒 */
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#f2f4f3'); g.addColorStop(0.55, '#e9eceb'); g.addColorStop(1, '#dfe3e2');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  noiseFill(x, W, H, 2200, '#8b9490', 0.02, 0.05);
  /* 4 条竖向分缝（每块搪瓷板一条） */
  for (let i = 1; i < 4; i++) {
    const px = (i / 4) * W;
    x.fillStyle = 'rgba(120,130,128,.42)';
    x.fillRect(px - 1.5, 0, 3, H);
    x.fillStyle = 'rgba(255,255,255,.55)';
    x.fillRect(px + 1.5, 0, 1.5, H);
  }
  /* 上下收边 */
  x.fillStyle = 'rgba(110,120,118,.35)';
  x.fillRect(0, 0, W, 3);
  x.fillRect(0, H - 3, W, 3);
  const t = toTex(c, 1, 1);
  TEX_CACHE.set('colenamel', t);
  return t;
}

/* ---------------- 站名牌 ---------------- */
function texStationSign(station, line, dirTo) {
  const key = 'sign_' + line.id + '_' + station.zh + '_' + (dirTo || '');
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const BASE_W = 1536, BASE_H = 384;
  const W = 1152, H = 288;
  const S = W / BASE_W;                  // 0.75
  const [c, x] = cv2d(W, H);
  x.scale(S, S);
  // 灯箱底板（顶部深灰金属檐 + 柔白灯箱面 + 底部线路色条）
  const bg = x.createLinearGradient(0, 0, 0, BASE_H);
  bg.addColorStop(0, '#f8faf9'); bg.addColorStop(0.88, '#eef1f0'); bg.addColorStop(1, '#dfe4e6');
  x.fillStyle = bg; x.fillRect(0, 0, BASE_W, BASE_H);
  x.fillStyle = '#1c2328'; x.fillRect(0, 0, BASE_W, 18);
  x.fillStyle = line.color; x.fillRect(0, BASE_H - 22, BASE_W, 22);
  if (line.color2) x.fillRect(0, BASE_H - 10, BASE_W, 10);

  // 左侧线路色块与徽标
  x.fillStyle = line.color; x.fillRect(0, 18, 220, BASE_H - 40);
  if (line.color2) { x.fillStyle = line.color2; x.fillRect(110, 18, 110, BASE_H - 40); }
  const isLightLine = ['#fcd600', '#FFD100', '#8cc220', '#8CC63F', '#98d1c0', '#c8b38e', '#cccccc'].includes(line.color);
  x.fillStyle = isLightLine ? '#101619' : '#ffffff';
  x.font = `800 ${line.badge.length > 1 ? 116 : 142}px "Microsoft YaHei",sans-serif`;
  x.textAlign = 'center';
  x.fillText(line.badge, 110, 195);
  x.font = '700 38px "Microsoft YaHei",sans-serif';
  x.fillText(line.name, 110, 272);
  x.font = '600 24px "Segoe UI",sans-serif';
  x.fillText((line.en || ('LINE ' + line.badge)).toUpperCase(), 110, 312);

  // 中部大号站名（中英双语居中对齐）
  x.textAlign = 'left';
  x.fillStyle = '#111619';
  const zhLen = (station.zh || '').length;
  const zhSize = zhLen > 6 ? 92 : zhLen > 4 ? 112 : 132;
  x.font = `800 ${zhSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
  x.fillText(station.zh, 268, 196);
  x.fillStyle = '#4a565d';
  x.font = '600 42px "Segoe UI",Helvetica,sans-serif';
  x.fillText((station.en || station.zh).toUpperCase(), 272, 276);

  // 右侧开往方向 + 指示箭头
  if (dirTo) {
    x.fillStyle = '#eef2f4';
    x.beginPath(); x.roundRect(BASE_W - 470, 56, 430, 256, 18); x.fill();
    x.strokeStyle = '#cfd6da'; x.lineWidth = 3;
    x.beginPath(); x.roundRect(BASE_W - 470, 56, 430, 256, 18); x.stroke();
    x.fillStyle = '#5c6a72'; x.font = '600 34px "Microsoft YaHei",sans-serif';
    x.textAlign = 'right';
    x.fillText('开往 · TO', BASE_W - 148, 126);
    x.fillStyle = '#151b1f'; x.font = '800 54px "Microsoft YaHei",sans-serif';
    x.fillText(dirTo, BASE_W - 148, 198);
    x.fillStyle = line.color;
    x.beginPath(); x.arc(BASE_W - 92, 184, 38, 0, TAU); x.fill();
    x.fillStyle = isLightLine ? '#101619' : '#ffffff';
    x.font = '800 48px sans-serif'; x.textAlign = 'center';
    x.fillText('→', BASE_W - 92, 201);
  }
  x.strokeStyle = '#333b40'; x.lineWidth = 6; x.strokeRect(3, 3, BASE_W - 6, BASE_H - 6);
  const t = toTex(c, 1, 1);
  TEX_CACHE.set(key, t);
  return t;
}

/* ---------------- 线路图 ---------------- */
function texLineDiagram(line, currentIdx) {
  const key = 'diag_' + line.id;
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const W = 2048, H = 320;
  const [c, x] = cv2d(W, H);
  x.fillStyle = '#f4f6f5'; x.fillRect(0, 0, W, H);
  const n = line.stations.length;
  const x0 = 90, x1 = W - 90;
  const y = 150;
  x.strokeStyle = line.color; x.lineWidth = 18; x.lineCap = 'round';
  x.beginPath(); x.moveTo(x0, y); x.lineTo(x1, y); x.stroke();
  if (line.color2) {
    x.strokeStyle = line.color2; x.lineWidth = 6;
    x.beginPath(); x.moveTo(x0, y); x.lineTo(x1, y); x.stroke();
  }
  for (let i = 0; i < n; i++) {
    const px = x0 + (x1 - x0) * (i / (n - 1));
    x.fillStyle = '#fff'; x.beginPath(); x.arc(px, y, 13, 0, TAU); x.fill();
    x.strokeStyle = line.color; x.lineWidth = 7; x.beginPath(); x.arc(px, y, 13, 0, TAU); x.stroke();
    x.save(); x.translate(px, y + 64); x.rotate(-PI / 5.2);
    x.fillStyle = '#2a3236'; x.font = '600 27px "Microsoft YaHei",sans-serif'; x.textAlign = 'left';
    x.fillText(line.stations[i].zh, 0, 0);
    x.fillStyle = '#8c979c'; x.font = '500 17px "Segoe UI",sans-serif';
    x.fillText(line.stations[i].en, 0, 26);
    x.restore();
  }
  x.fillStyle = line.color; x.fillRect(0, 0, 26, H);
  const t = toTex(c, 1, 1);
  TEX_CACHE.set(key, t);
  return t;
}

/* ---------------- 广告 ---------------- */
function texAd(i) {
  const key = 'ad' + i;
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const W = 512, H = 256;
  const [c, x] = cv2d(W, H);
  const pal = [
    ['#12232e', '#2e6f7d', '#9fe8d8'],
    ['#2a1420', '#7b2c46', '#ffb7a8'],
    ['#101a2c', '#2c4b8a', '#a8c8ff'],
    ['#1c2412', '#4c6b25', '#d8f0a0']
  ][i % 4];
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, pal[0]); g.addColorStop(1, pal[1]);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.globalAlpha = 0.25;
  for (let k = 0; k < 5; k++) {
    x.fillStyle = pal[2];
    x.beginPath(); x.arc(Math.random() * W, Math.random() * H, 30 + Math.random() * 80, 0, TAU); x.fill();
  }
  x.globalAlpha = 1;
  x.fillStyle = '#fff'; x.font = '800 44px "Microsoft YaHei",sans-serif';
  x.fillText(['文明乘车', '安全出行', '低碳生活', '城市脉搏'][i % 4], 34, 118);
  x.fillStyle = pal[2]; x.font = '500 22px "Microsoft YaHei",sans-serif';
  x.fillText(['先下后上 · 有序排队', '请勿倚靠车门', '地铁让城市更美好', '每一程 都值得'][i % 4], 36, 160);
  x.fillStyle = 'rgba(255,255,255,.5)'; x.font = '600 14px ui-monospace,monospace';
  x.fillText('SHANGHAI METRO  ·  PUBLIC SERVICE', 36, 214);
  const t = toTex(c, 1, 1);
  TEX_CACHE.set(key, t);
  return t;
}

/* ---------------- 目的地 LED ---------------- */
function texDestination(line, station, arrow = true) {
  const key = 'dest_' + station.zh + line.id;
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  /* 车头目的地屏：从 512×128 提到 768×192。这块是玩家在追车视角、
     站台视角都会看到的文字，原尺寸在 2K 屏上偏糊。 */
  const W = 768, H = 192;
  const [c, x] = cv2d(W, H);
  x.fillStyle = '#080a08'; x.fillRect(0, 0, W, H);
  x.fillStyle = line.color; x.fillRect(0, 0, 12, H);
  x.fillStyle = '#ffb733'; x.font = '700 66px "Microsoft YaHei",sans-serif';
  x.textAlign = 'center'; x.fillText(station.zh, W / 2 + 8, 93);
  x.fillStyle = '#ff8a1f'; x.font = '600 36px "Segoe UI",sans-serif';
  x.fillText(station.en.toUpperCase(), W / 2 + 8, 144);
  if (arrow) { x.fillStyle = '#ffb733'; x.font = '700 51px sans-serif'; x.fillText('→', W - 39, 108); }
  const t = toTex(c, 1, 1);
  TEX_CACHE.set(key, t);
  return t;
}

/* ---------------- 天空 ---------------- */
const THEMES = {
  day: {
    top: new THREE.Color('#3f7fc4'), horizon: new THREE.Color('#cfe3f0'), ground: new THREE.Color('#9fb0bb'),
    sun: new THREE.Color('#fff3d6'), sunDir: new THREE.Vector3(-0.45, 0.72, 0.52), sunSize: 0.9993,
    amb: 1.05, hemi: 0.95, sunI: 2.1, fog: '#bcd3e2', fogD: 0.00028,
    bloom: 0.14, exposure: 0.94, windowGlow: 0.06, headlight: 0.35
  },
  dusk: {
    top: new THREE.Color('#101d33'), horizon: new THREE.Color('#e79a63'), ground: new THREE.Color('#4a4a4e'),
    sun: new THREE.Color('#ffb473'), sunDir: new THREE.Vector3(-0.88, 0.10, 0.46), sunSize: 0.9989,
    amb: 0.68, hemi: 0.80, sunI: 1.35, fog: '#6d6a70', fogD: 0.00042,
    bloom: 0.44, exposure: 0.95, windowGlow: 0.85, headlight: 1.0
  },
  night: {
    top: new THREE.Color('#02050d'), horizon: new THREE.Color('#0e1a28'), ground: new THREE.Color('#05080c'),
    sun: new THREE.Color('#a9c4e0'), sunDir: new THREE.Vector3(0.4, 0.6, -0.5), sunSize: 0.9995,
    amb: 0.13, hemi: 0.15, sunI: 0.26, fog: '#05090f', fogD: 0.0005,
    bloom: 0.70, exposure: 1.0, windowGlow: 1.5, headlight: 1.4
  }
};

function createSky(theme) {
  const geo = new THREE.SphereGeometry(4200, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: theme.top }, horizon: { value: theme.horizon }, ground: { value: theme.ground },
      sunColor: { value: theme.sun }, sunDir: { value: theme.sunDir.clone().normalize() },
      sunSize: { value: theme.sunSize }
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top, horizon, ground, sunColor; uniform vec3 sunDir; uniform float sunSize;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(horizon, top, pow(clamp(h,0.0,1.0), 0.55));
        col = mix(ground, col, smoothstep(-0.12, 0.02, h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * pow(s, 2200.0) * 3.2;
        col += sunColor * pow(s, 22.0) * 0.14;
        float band = exp(-abs(h) * 26.0);
        col += horizon * band * 0.10;
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = -1000;
  return m;
}


/* ---------------- 车门门扇 ---------------- */
function texDoorLeaf() {
  if (TEX_CACHE.has('doorleaf')) return TEX_CACHE.get('doorleaf');
  const W = 256, H = 680;
  const [c, x] = cv2d(W, H);
  // 门板
  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#dfe3e2'); g.addColorStop(0.35, '#f4f6f5'); g.addColorStop(1, '#e6e9e8');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // 边框
  x.strokeStyle = '#9aa4a8'; x.lineWidth = 8; x.strokeRect(4, 4, W - 8, H - 8);
  x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 2; x.strokeRect(12, 12, W - 24, H - 24);
  // 门玻璃
  const wg = x.createLinearGradient(0, 150, W, 470);
  wg.addColorStop(0, '#22323f'); wg.addColorStop(.4, '#0a1117'); wg.addColorStop(1, '#1a2831');
  x.fillStyle = wg;
  x.beginPath(); x.roundRect(38, 154, W - 76, 306, 10); x.fill();
  x.strokeStyle = '#aeb7bb'; x.lineWidth = 7;
  x.beginPath(); x.roundRect(38, 154, W - 76, 306, 10); x.stroke();
  x.strokeStyle = 'rgba(255,255,255,.22)'; x.lineWidth = 2;
  x.beginPath(); x.roundRect(45, 161, W - 90, 292, 8); x.stroke();
  x.fillStyle = 'rgba(190,220,240,.09)';
  x.beginPath(); x.moveTo(52, 452); x.lineTo(106, 160); x.lineTo(144, 160); x.lineTo(90, 452); x.closePath(); x.fill();
  // 中部不锈钢腰带
  x.fillStyle = '#c8cfd2'; x.fillRect(16, 486, W - 32, 16);
  x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(16, 486, W - 32, 4);
  x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(16, 500, W - 32, 3);
  // 下部红色警示
  x.fillStyle = '#a8281f'; x.fillRect(46, 556, W - 92, 52);
  x.fillStyle = '#ffe9e5'; x.font = '700 20px "Microsoft YaHei",sans-serif'; x.textAlign = 'center';
  x.fillText('请勿倚靠', W / 2, 590);
  x.textAlign = 'left';
  // 橡胶边
  x.fillStyle = '#2a2f33'; x.fillRect(0, 0, 8, H); x.fillRect(W - 8, 0, 8, H);
  x.fillStyle = 'rgba(0,0,0,.10)'; x.fillRect(0, H - 26, W, 26);
  const t = toTex(c, 1, 1);
  TEX_CACHE.set('doorleaf', t);
  return t;
}


/* ---------------- 车厢内壁（带窗洞） ---------------- */
function texCarInterior(mirror = false, doorList) {
  const key = 'carint' + mirror + (doorList ? doorList.join('_') : '');
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const W = 2048, H = 512;
  const [c, x] = cv2d(W, H);
  if (mirror) { x.translate(W, 0); x.scale(-1, 1); }
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#d7dcdd'); g.addColorStop(0.55, '#cdd3d4'); g.addColorStop(1, '#b9c0c1');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // 墙板拼缝
  x.strokeStyle = 'rgba(0,0,0,.10)'; x.lineWidth = 2;
  for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(i * 256, 0); x.lineTo(i * 256, H); x.stroke(); }
  x.fillStyle = 'rgba(255,255,255,.30)'; x.fillRect(0, 0, W, 6);
  // 踢脚与扶手带
  x.fillStyle = '#7d878a'; x.fillRect(0, 424, W, 88);
  x.fillStyle = 'rgba(0,0,0,.15)'; x.fillRect(0, 424, W, 4);
  x.fillStyle = '#eef1f1'; x.fillRect(0, 356, W, 10);
  x.fillStyle = 'rgba(0,0,0,.10)'; x.fillRect(0, 366, W, 3);
  // 开窗洞（与外壳同一套窗位，视线才能穿出去）
  /* destination-out 按「源 alpha」擦除：必须先把 fillStyle 设成不透明纯色。
     否则沿用上一段的半透明色（rgba(0,0,0,.10)）只会擦掉一点点，
     窗洞的 alpha 仍是 229 > alphaTest 0.45，等于根本没开孔 —— 车厢内看不到窗外就是这个原因。 */
  x.fillStyle = '#000';
  x.globalCompositeOperation = 'destination-out';
  const zToPxI = (z) => ((z + 11.4) / 22.8) * W;
  for (const sl of carWinSlots(doorList)) {
    const pw = (sl.w / 22.8) * W, px = zToPxI(sl.z) - pw / 2;
    x.beginPath(); x.roundRect(px + 1, 142, pw - 2, 186, 10); x.fill();
  }
  const DW = 126, DH = 341, DY = 143;
  for (const zc of (doorList || [-7.6, -2.6, 2.6, 7.6])) {
    const px = ((zc + 11.4) / 22.8) * W;
    x.beginPath(); x.roundRect(px - DW / 2 + 2, DY + 3, DW - 4, DH - 5, 4); x.fill();
  }
  x.globalCompositeOperation = 'source-over';
  const t = toTex(c, 1, 1);
  TEX_CACHE.set(key, t);
  return t;
}


/* ---------------- 换乘指示牌（透明底） ---------------- */
function texTransferSign(st) {
  const key = 'trsign' + st.zh + (st.tr || []).join('');
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const W = 1024, H = 206;
  const [c, x] = cv2d(W, H);
  x.clearRect(0, 0, W, H);
  // 底板
  x.fillStyle = 'rgba(9,14,18,.94)';
  x.beginPath(); x.roundRect(2, 2, W - 4, H - 4, 14); x.fill();
  x.strokeStyle = 'rgba(255,255,255,.22)'; x.lineWidth = 3;
  x.beginPath(); x.roundRect(8, 8, W - 16, H - 16, 11); x.stroke();
  // 左侧换乘图标
  x.fillStyle = '#f2f7fa';
  x.font = '800 62px "Microsoft YaHei",sans-serif';
  x.textAlign = 'left'; x.textBaseline = 'middle';
  x.fillText('换乘', 34, 100);
  x.font = '600 26px "Microsoft YaHei",sans-serif';
  x.fillStyle = '#9fb6c2';
  x.fillText('TRANSFER', 36, 155);
  // 右侧线路徽标
  const list = (st.tr || []).slice(0, 4);
  const bw = 118, gap = 16;
  const totalW = list.length * bw + (list.length - 1) * gap;
  let bx = W - 40 - totalW;
  const COLORS = { '1号线': '#E4002B', '2号线': '#8CC63F', '3号线': '#FFD100', '4号线': '#5A2D82', '6号线': '#D9027D', '7号线': '#F97F00', '8号线': '#0094D8', '9号线': '#71C5E8', '10号线': '#C6AFD4', '11号线': '#7A1F3D', '12号线': '#007B5F', '13号线': '#E999C0', '14号线': '#827A04', '15号线': '#BBA786', '支线': '#9aa4a8' };
  for (const ln of list) {
    const col = COLORS[ln] || '#7c8b93';
    x.fillStyle = col;
    x.beginPath(); x.roundRect(bx, 52, bw, 100, 12); x.fill();
    const label = ln.replace('号线', '');
    x.fillStyle = '#0b1114';
    x.font = label.length > 2 ? '700 36px "Microsoft YaHei",sans-serif' : '800 58px "Microsoft YaHei",sans-serif';
    x.textAlign = 'center';
    x.fillText(label, bx + bw / 2, 104);
    if (ln.indexOf('号线') > 0) {
      x.fillStyle = 'rgba(11,17,20,.72)';
      x.font = '600 20px "Microsoft YaHei",sans-serif';
      x.fillText('号线', bx + bw / 2, 140);
    }
    bx += bw + gap;
  }
  const t = toTex(c);
  TEX_CACHE.set(key, t);
  return t;
}


/* ---------------- 挡风玻璃雨滴 ---------------- */
function texRainGlass() {
  if (TEX_CACHE.has('rainglass')) return TEX_CACHE.get('rainglass');
  const W = 1024, H = 512;
  const [c, x] = cv2d(W, H);
  x.clearRect(0, 0, W, H);
  const rng = mulberry32(9182);
  // 细密水膜
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 1400; i++) {
    const px = rng() * W, py = rng() * H;
    const r = 1.2 + rng() * 4.6;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(190,225,245,.42)');
    g.addColorStop(0.6, 'rgba(150,195,220,.16)');
    g.addColorStop(1, 'rgba(150,195,220,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
  }
  // 流下的水痕
  for (let i = 0; i < 70; i++) {
    const px = rng() * W, py = rng() * H;
    const len = 26 + rng() * 150;
    const g = x.createLinearGradient(px, py, px, py + len);
    g.addColorStop(0, 'rgba(205,235,250,.26)');
    g.addColorStop(1, 'rgba(205,235,250,0)');
    x.strokeStyle = g; x.lineWidth = 1.4 + rng() * 1.6;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px, py + len); x.stroke();
  }
  x.globalCompositeOperation = 'source-over';
  const t = toTex(c, 1, 1);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  TEX_CACHE.set('rainglass', t);
  return t;
}

/* ---------------- 站台门前地面排队候车标线 ---------------- */
function texQueueDecal(line) {
  const key = 'qdecal_' + (line && line.color || '');
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const W = 512, H = 256;
  const [c, x] = cv2d(W, H);
  x.clearRect(0, 0, W, H);
  // 顶部紧靠安全门黄色警示带
  x.fillStyle = '#f0bc2e';
  x.fillRect(10, 4, W - 20, 18);
  x.fillStyle = '#14181b';
  for (let s = 14; s < W - 20; s += 36) {
    x.beginPath();
    x.moveTo(s, 4); x.lineTo(s + 18, 4);
    x.lineTo(s + 8, 22); x.lineTo(s - 10, 22);
    x.closePath(); x.fill();
  }
  // 中央下车通道（红橙底框 + 双向箭头朝站台内）
  x.fillStyle = 'rgba(205, 52, 42, 0.85)';
  x.beginPath(); x.roundRect(184, 30, 144, 188, 8); x.fill();
  x.strokeStyle = '#ffd8cf'; x.lineWidth = 3;
  x.beginPath(); x.roundRect(188, 34, 136, 180, 6); x.stroke();
  x.fillStyle = '#ffffff';
  x.font = '800 22px "Microsoft YaHei",sans-serif';
  x.textAlign = 'center';
  x.fillText('先下后上', 256, 66);
  x.font = '700 13px "Segoe UI",sans-serif';
  x.fillText('ALIGHT FIRST', 256, 86);
  // 下车大箭头（朝下，即朝站台内侧）
  for (const ax of [226, 286]) {
    x.fillStyle = '#fff5f2';
    x.fillRect(ax - 7, 102, 14, 62);
    x.beginPath();
    x.moveTo(ax - 20, 158); x.lineTo(ax + 20, 158); x.lineTo(ax, 194);
    x.closePath(); x.fill();
  }
  // 两侧排队候车区（绿/黄导流框 + 斜向朝车门箭头）
  for (const side of [-1, 1]) {
    const bx = side < 0 ? 18 : 340;
    x.fillStyle = 'rgba(22, 118, 72, 0.82)';
    x.beginPath(); x.roundRect(bx, 30, 154, 196, 8); x.fill();
    x.strokeStyle = '#f2c138'; x.lineWidth = 4;
    x.beginPath(); x.roundRect(bx + 4, 34, 146, 188, 6); x.stroke();
    const cx = bx + 77;
    x.fillStyle = '#f9d45c';
    x.font = '800 22px "Microsoft YaHei",sans-serif';
    x.fillText('排队候车', cx, 188);
    x.fillStyle = '#d7f5e4';
    x.font = '700 12px "Segoe UI",sans-serif';
    x.fillText('QUEUE HERE', cx, 208);
    // 朝向车门中央的斜箭头
    x.save();
    x.translate(cx, 108);
    x.rotate(side < 0 ? 0.36 : -0.36);
    x.fillStyle = '#ffffff';
    x.fillRect(-8, -24, 16, 62);
    x.beginPath();
    x.moveTo(-24, -18); x.lineTo(24, -18); x.lineTo(0, -54);
    x.closePath(); x.fill();
    x.restore();
  }
  const t = toTex(c, 1, 1);
  TEX_CACHE.set(key, t);
  return t;
}

/* ---------------- 轨行区侧墙大字站名牌 ---------------- */
function texTrackWallSign(station, line, dirTo) {
  const key = 'twall_' + line.id + '_' + station.zh + '_' + (dirTo || '');
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const W = 1024, H = 256;
  const [c, x] = cv2d(W, H);
  // 深灰蓝搪瓷底板 + 线路色上下腰线
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#161d22'); g.addColorStop(0.5, '#1d262d'); g.addColorStop(1, '#12181c');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = line.color;
  x.fillRect(0, 0, W, 18);
  x.fillRect(0, H - 24, W, 24);
  if (line.color2) x.fillRect(0, H - 10, W, 10);
  x.fillStyle = 'rgba(255,255,255,.16)';
  x.fillRect(0, 20, W, 2);
  x.fillRect(0, H - 27, W, 2);

  // 左侧线路徽章
  const isLight = ['#fcd600', '#FFD100', '#8cc220', '#8CC63F', '#98d1c0', '#c8b38e', '#cccccc'].includes(line.color);
  x.fillStyle = line.color;
  x.beginPath(); x.roundRect(36, 48, 128, 152, 16); x.fill();
  x.fillStyle = isLight ? '#101518' : '#ffffff';
  x.textAlign = 'center';
  x.font = `800 ${line.badge.length > 1 ? 66 : 82}px "Microsoft YaHei",sans-serif`;
  x.fillText(line.badge, 100, 134);
  x.font = '700 24px "Microsoft YaHei",sans-serif';
  x.fillText(line.name, 100, 178);

  // 中央大字站名
  x.textAlign = 'center';
  x.fillStyle = '#f5f8fa';
  const zhLen = (station.zh || '').length;
  const fSize = zhLen > 6 ? 68 : zhLen > 4 ? 84 : 98;
  x.font = `800 ${fSize}px "PingFang SC","Microsoft YaHei",sans-serif`;
  x.fillText(station.zh, 520, 134);
  x.fillStyle = '#9bb0bc';
  x.font = '600 30px "Segoe UI",Helvetica,sans-serif';
  x.fillText((station.en || station.zh).toUpperCase(), 520, 188);

  // 右侧前方到站方向
  if (dirTo) {
    x.textAlign = 'right';
    x.fillStyle = '#90a4b0';
    x.font = '600 24px "Microsoft YaHei",sans-serif';
    x.fillText('下一站 · NEXT', W - 42, 96);
    x.fillStyle = '#ffffff';
    x.font = '700 38px "Microsoft YaHei",sans-serif';
    x.fillText(dirTo + ' →', W - 38, 154);
  }
  const t = toTex(c, 1, 1);
  TEX_CACHE.set(key, t);
  return t;
}

/* ---------------- 屏蔽门门楣单元贴图（车门号 + 导向条） ---------------- */
function texPsdDoorCap(line, station, dirTo) {
  const key = 'psdcap_' + line.id + '_' + station.zh + '_' + (dirTo || '');
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const W = 1024, H = 192;
  const [c, x] = cv2d(W, H);
  // 浅灰白铝塑门楣底面
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#eef1f2'); g.addColorStop(0.82, '#e2e7e9'); g.addColorStop(1, '#cfd6d9');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // 顶部深灰压条 + 底部线路色带
  x.fillStyle = '#22282d'; x.fillRect(0, 0, W, 18);
  x.fillStyle = line.color; x.fillRect(0, H - 30, W, 30);
  if (line.color2) x.fillRect(0, H - 12, W, 12);
  // 左侧本站名与线路标
  const isLight = ['#fcd600', '#FFD100', '#8cc220', '#8CC63F', '#98d1c0', '#c8b38e', '#cccccc'].includes(line.color);
  x.fillStyle = line.color;
  x.beginPath(); x.roundRect(24, 34, 86, 86, 12); x.fill();
  x.fillStyle = isLight ? '#101619' : '#ffffff';
  x.textAlign = 'center';
  x.font = '800 48px "Microsoft YaHei",sans-serif';
  x.fillText(line.badge, 67, 92);
  x.textAlign = 'left';
  x.fillStyle = '#182024';
  x.font = '800 46px "Microsoft YaHei",sans-serif';
  x.fillText(station.zh, 128, 84);
  x.fillStyle = '#5a6870';
  x.font = '600 22px "Segoe UI",sans-serif';
  x.fillText((station.en || station.zh).toUpperCase(), 130, 116);
  // 中部安全提示
  x.textAlign = 'center';
  x.fillStyle = '#283238';
  x.font = '700 28px "Microsoft YaHei",sans-serif';
  x.fillText('安全门自动开启 · 请勿倚靠 · 先下后上', 556, 78);
  x.fillStyle = '#68767e';
  x.font = '600 18px "Segoe UI",sans-serif';
  x.fillText('AUTOMATIC PLATFORM DOORS · DO NOT LEAN · ALIGHT FIRST', 556, 110);
  // 右侧开往方向胶囊标
  if (dirTo) {
    x.fillStyle = '#1d252a';
    x.beginPath(); x.roundRect(W - 246, 36, 222, 84, 14); x.fill();
    x.fillStyle = '#9bb0bc';
    x.font = '600 18px "Microsoft YaHei",sans-serif';
    x.textAlign = 'left';
    x.fillText('开往 TO', W - 226, 64);
    x.fillStyle = '#ffffff';
    x.font = '800 30px "Microsoft YaHei",sans-serif';
    x.fillText(dirTo + ' →', W - 226, 102);
  }
  const t = toTex(c, 1, 1);
  TEX_CACHE.set(key, t);
  return t;
}

/* ---------------- 无障碍电梯与站厅导向灯箱 ---------------- */
function texElevatorSign(isConcourse = false) {
  const key = isConcourse ? 'esc_sign_conc' : 'elev_sign_acc';
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const W = 512, H = 128;
  const [c, x] = cv2d(W, H);
  x.fillStyle = '#0e171d'; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#3b4c56'; x.lineWidth = 4; x.strokeRect(2, 2, W - 4, H - 4);
  x.fillStyle = isConcourse ? '#0e6b3a' : '#145da0';
  x.beginPath(); x.roundRect(14, 14, 100, 100, 12); x.fill();
  x.fillStyle = '#ffffff';
  x.textAlign = 'center';
  x.font = '800 54px "Microsoft YaHei",sans-serif';
  x.fillText(isConcourse ? '↑' : '♿', 64, 82);
  x.textAlign = 'left';
  x.fillStyle = '#f0f6fa';
  x.font = '800 42px "Microsoft YaHei",sans-serif';
  x.fillText(isConcourse ? '站厅 · 出入口' : '无障碍电梯', 134, 62);
  x.fillStyle = '#8fa6b5';
  x.font = '600 22px "Segoe UI",sans-serif';
  x.fillText(isConcourse ? 'CONCOURSE & EXITS' : 'ACCESSIBLE LIFT · TO CONCOURSE', 136, 98);
  const t = toTex(c, 1, 1);
  TEX_CACHE.set(key, t);
  return t;
}
