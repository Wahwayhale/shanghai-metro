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
  x.fillStyle = '#a3a8ab'; x.fillRect(0, 0, 512, 512);
  const tw = 128, th = 128;
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    const v = 138 + Math.random() * 22;
    x.fillStyle = `rgb(${v},${v + 3},${v + 6})`;
    x.fillRect(gx * tw + 2, gy * th + 2, tw - 4, th - 4);
    x.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.04})`;
    x.fillRect(gx * tw + 2, gy * th + 2, tw - 4, 6);
  }
  x.strokeStyle = 'rgba(0,0,0,.22)'; x.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    x.beginPath(); x.moveTo(i * tw, 0); x.lineTo(i * tw, 512); x.stroke();
    x.beginPath(); x.moveTo(0, i * th); x.lineTo(512, i * th); x.stroke();
  }
  noiseFill(x, 512, 512, 3000, '#000', 0.02, 0.06);
  const t = toTex(c, 1, 1);
  TEX_CACHE.set('pfloor', t);
  return t;
}

/* ---------------- 盲道 ---------------- */
function texTactile() {
  if (TEX_CACHE.has('tactile')) return TEX_CACHE.get('tactile');
  const [c, x] = cv2d(128, 128);
  x.fillStyle = '#d8a520'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = 'rgba(0,0,0,.18)';
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    x.beginPath(); x.arc(16 + gx * 32, 16 + gy * 32, 8, 0, TAU); x.fill();
  }
  x.fillStyle = 'rgba(255,255,255,.22)';
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    x.beginPath(); x.arc(15 + gx * 32, 15 + gy * 32, 6, 0, TAU); x.fill();
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
  return (line && line.doors === 3) ? [-7.6, 0, 7.6] : [-7.6, -2.6, 2.6, 7.6];
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
  // 窗
  const winW = 138, gap = 46;
  for (let i = 0; i < 12; i++) {
    const px = 34 + i * (winW + gap);
    if (px + winW > W - 20) break;
    const wg = x.createLinearGradient(px, 140, px + winW, 330);
    wg.addColorStop(0, '#2b3d4b'); wg.addColorStop(0.45, '#101820'); wg.addColorStop(1, '#1b2a35');
    x.fillStyle = wg;
    x.beginPath(); x.roundRect(px, 140, winW, 190, 12); x.fill();
    x.strokeStyle = 'rgba(255,255,255,.16)'; x.lineWidth = 2;
    x.beginPath(); x.roundRect(px, 140, winW, 190, 12); x.stroke();
    x.fillStyle = 'rgba(180,215,235,.10)';
    x.beginPath(); x.moveTo(px + 10, 330); x.lineTo(px + 62, 140); x.lineTo(px + 96, 140); x.lineTo(px + 44, 330); x.closePath(); x.fill();
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
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 12; i++) {
      const px = 34 + i * (winW + gap);
      if (px + winW > W - 20) break;
      x.beginPath(); x.roundRect(px + 2, 142, winW - 4, 186, 10); x.fill();
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

/* ---------------- 站名牌 ---------------- */
function texStationSign(station, line, dirTo) {
  const key = 'sign_' + line.id + '_' + station.zh;
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  /* 1536×384 对一块吊挂站名牌是过度采样：它在场景里约 4.4 m 宽，
     按 1080p 屏幕与 45° 视角折算 768×192 已足够清晰。
     每站省 4 倍像素 = 27 站累计省下大量 canvas 光栅化时间（P1-1）。 */
  const W = 768, H = 192;
  const S = W / 1536;                    // 统一缩放系数，保持排版比例
  const [c, x] = cv2d(W, H);
  x.fillStyle = '#f6f7f6'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#e9ebe9'; x.fillRect(0, H - 13, W, 13);
  // 线路色块（共线段用双色）
  x.fillStyle = line.color; x.fillRect(0, 0, 105, H);
  if (line.color2) { x.fillStyle = line.color2; x.fillRect(52, 0, 53, H); }
  x.fillStyle = '#fff'; x.font = `800 ${Math.round(132 * S)}px "Microsoft YaHei",sans-serif`;
  x.textAlign = 'center'; x.fillText(line.badge, 52, 104);
  x.font = `600 ${Math.round(34 * S)}px "Microsoft YaHei",sans-serif`;
  x.fillText(line.name, 52, 141);
  // 站名
  x.textAlign = 'left';
  x.fillStyle = '#15181a';
  x.font = `800 ${Math.round(132 * S)}px "PingFang SC","Microsoft YaHei",sans-serif`;
  x.fillText(station.zh, 130, 95);
  x.fillStyle = '#586468';
  x.font = `500 ${Math.round(40 * S)}px "Segoe UI",Helvetica,sans-serif`;
  x.fillText(station.en.toUpperCase(), 132, 129);
  // 方向
  x.fillStyle = '#2b3236'; x.font = `600 ${Math.round(40 * S)}px "Microsoft YaHei",sans-serif`;
  x.textAlign = 'right';
  x.fillText(`往 ${dirTo}`, W - 35, 75);
  x.fillStyle = '#7a868b'; x.font = `500 ${Math.round(32 * S)}px "Microsoft YaHei",sans-serif`;
  x.fillText('TO ' + dirTo, W - 35, 105);
  x.strokeStyle = '#c9cfd1'; x.lineWidth = 2; x.strokeRect(1, 1, W - 2, H - 2);
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
  const W = 512, H = 128;
  const [c, x] = cv2d(W, H);
  x.fillStyle = '#080a08'; x.fillRect(0, 0, W, H);
  x.fillStyle = line.color; x.fillRect(0, 0, 8, H);
  x.fillStyle = '#ffb733'; x.font = '700 44px "Microsoft YaHei",sans-serif';
  x.textAlign = 'center'; x.fillText(station.zh, W / 2 + 8, 62);
  x.fillStyle = '#ff8a1f'; x.font = '600 24px "Segoe UI",sans-serif';
  x.fillText(station.en.toUpperCase(), W / 2 + 8, 96);
  if (arrow) { x.fillStyle = '#ffb733'; x.font = '700 34px sans-serif'; x.fillText('→', W - 26, 72); }
  const t = toTex(c, 1, 1);
  TEX_CACHE.set(key, t);
  return t;
}

/* ---------------- 天空 ---------------- */
const THEMES = {
  day: {
    top: new THREE.Color('#3f7fc4'), horizon: new THREE.Color('#cfe3f0'), ground: new THREE.Color('#9fb0bb'),
    sun: new THREE.Color('#fff3d6'), sunDir: new THREE.Vector3(-0.45, 0.72, 0.52), sunSize: 0.9993,
    amb: 1.15, hemi: 1.0, sunI: 2.3, fog: '#bcd3e2', fogD: 0.00028,
    bloom: 0.18, exposure: 1.0, windowGlow: 0.06, headlight: 0.35
  },
  dusk: {
    top: new THREE.Color('#101d33'), horizon: new THREE.Color('#e79a63'), ground: new THREE.Color('#4a4a4e'),
    sun: new THREE.Color('#ffb473'), sunDir: new THREE.Vector3(-0.88, 0.10, 0.46), sunSize: 0.9989,
    amb: 0.72, hemi: 0.85, sunI: 1.45, fog: '#6d6a70', fogD: 0.00042,
    bloom: 0.62, exposure: 1.02, windowGlow: 0.85, headlight: 1.0
  },
  night: {
    top: new THREE.Color('#02050d'), horizon: new THREE.Color('#0e1a28'), ground: new THREE.Color('#05080c'),
    sun: new THREE.Color('#a9c4e0'), sunDir: new THREE.Vector3(0.4, 0.6, -0.5), sunSize: 0.9995,
    amb: 0.16, hemi: 0.18, sunI: 0.28, fog: '#05090f', fogD: 0.0005,
    bloom: 0.95, exposure: 1.1, windowGlow: 1.5, headlight: 1.4
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
  // 开窗洞
  const winW = 138, gap = 46;
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 12; i++) {
    const px = 34 + i * (winW + gap);
    if (px + winW > W - 20) break;
    x.beginPath(); x.roundRect(px + 2, 142, winW - 4, 186, 10); x.fill();
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
