/* ================================================================
   列车：A 型车 6 辆编组 / 外部模型 / 司机室 / 仪表
   ================================================================ */
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/* 各车型司机室差异 */
const CAB_CFG = {
  AC02: { desk: 0x252c31, wall: 0xa8b0b3, lever: -1, screens: 2, speedo: -1, seat: 0x1d2a3a },
  AC03: { desk: 0x2b2d2e, wall: 0xaab1b2, lever: 1, screens: 2, speedo: -1, seat: 0x2a2422 },
  AC04: { desk: 0x1c2225, wall: 0x9ea6a9, lever: -1, screens: 3, speedo: 1, seat: 0x241f1c },
  AC05: { desk: 0x212832, wall: 0xa6aeb4, lever: -1, screens: 2, speedo: 1, seat: 0x1d2432 },
  AC06: { desk: 0x272b2d, wall: 0xa8b0b3, lever: -1, screens: 2, speedo: -1, seat: 0x20262c },
  AC16: { desk: 0x1f2a2a, wall: 0xaebbb8, lever: 1, screens: 3, speedo: 1, seat: 0x1c2a28 }
};
const INT_MAT = {};
function intMats() {
  if (!INT_MAT.floor) {
    INT_MAT.floor = new THREE.MeshStandardMaterial({ color: 0x4a4f52, roughness: 0.92, metalness: 0.05, emissive: new THREE.Color('#22262a'), emissiveIntensity: 1.0 });
    INT_MAT.ceil = new THREE.MeshStandardMaterial({ color: 0xd6dadb, roughness: 0.86, metalness: 0.02, emissive: new THREE.Color('#6a6f70'), emissiveIntensity: 1.15 });
    INT_MAT.seat = new THREE.MeshStandardMaterial({ color: 0x2f4a63, roughness: 0.9, metalness: 0.03, emissive: new THREE.Color('#2a3d52'), emissiveIntensity: 1.1 });
    INT_MAT.panel = new THREE.MeshStandardMaterial({ color: 0xb9c0c2, roughness: 0.8, metalness: 0.05, emissive: new THREE.Color('#3a3e40'), emissiveIntensity: 0.85 });
    INT_MAT.lcd = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.5, 1.2), toneMapped: false });
    const mkWall = (m, dl) => new THREE.MeshStandardMaterial({
      map: texCarInterior(m, dl), transparent: false, alphaTest: 0.45,
      roughness: 0.78, metalness: 0.04, side: THREE.FrontSide,
      emissive: new THREE.Color('#3c4142'), emissiveIntensity: 0.7
    });
    const dl = doorOffsetsOf(line);
    INT_MAT.wallL = mkWall(true, dl);
    INT_MAT.wallR = mkWall(false, dl);
  }
  return INT_MAT;
}
function mergeLocalBoxes(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  const remove = [];
  for (const o of group.children.slice()) {
    if (!o.isMesh || o.isInstancedMesh) continue;
    if (o.geometry !== UNIT_BOX || !o.material || o.material.transparent) continue;
    const g2 = UNIT_BOX.clone();
    g2.applyMatrix4(o.matrix);
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(g2);
    remove.push(o);
  }
  remove.forEach(o => group.remove(o));
  buckets.forEach((geos, mat) => {
    let merged = null;
    try { merged = BufferGeometryUtils.mergeGeometries(geos, false); } catch (e) { merged = null; }
    if (merged) {
      const m = new THREE.Mesh(merged, mat);
      m.matrixAutoUpdate = false;
      group.add(m);
      geos.forEach(g2 => g2.dispose());
    } else {
      geos.forEach(g2 => group.add(new THREE.Mesh(g2, mat)));
    }
  });
}

function carSideMats(line, open) {
  const key = 'cs' + line.id + open;
  if (!TRAIN_MATS[key]) {
    TRAIN_MATS[key] = {
      right: new THREE.MeshStandardMaterial({ map: texCarSide(line.color, open, false, line.badge, doorOffsetsOf(line), line.color2), roughness: 0.42, metalness: 0.12, envMapIntensity: 0.8, alphaTest: 0.45, transparent: false }),
      left: new THREE.MeshStandardMaterial({ map: texCarSide(line.color, open, true, line.badge, doorOffsetsOf(line), line.color2), roughness: 0.42, metalness: 0.12, envMapIntensity: 0.8, alphaTest: 0.45, transparent: false })
    };
  }
  return TRAIN_MATS[key];
}
const TRAIN_MATS = {};

class CabDisplay {
  constructor() {
    const [c1, x1] = cv2d(560, 350);
    const [c2, x2] = cv2d(560, 350);
    this.c1 = c1; this.x1 = x1; this.c2 = c2; this.x2 = x2;
    this.t1 = toTex(c1); this.t2 = toTex(c2);
    this.t1.anisotropy = 4; this.t2.anisotropy = 4;
    this.speedCanvas = document.createElement('canvas');
    this.speedCanvas.width = 320; this.speedCanvas.height = 320;
    this.sx = this.speedCanvas.getContext('2d');
    this.speedTex = toTex(this.speedCanvas);
    this.last = 0;
  }
  update(dt, st) {
    const now = performance.now();
    if (now - this.last < 100) return;
    this.last = now;
    this.drawATP(st);
    this.drawHMI(st);
    this.drawSpeedo(st);
  }
  drawATP(st) {
    const x = this.x1, W = 560, H = 350;
    x.fillStyle = '#06110c'; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#1d3a2e'; x.lineWidth = 4; x.strokeRect(2, 2, W - 4, H - 4);
    x.fillStyle = '#0c1f17'; x.fillRect(0, 0, W, 46);
    x.fillStyle = '#5ef2a8'; x.font = '700 24px "Microsoft YaHei",sans-serif';
    x.fillText('ATP  列车自动防护', 16, 31);
    const modeTxt = st.sigMode === 'fixed' ? 'FIXED' : st.ato ? 'ATO' : 'CM';
    x.fillStyle = st.sigMode === 'fixed' ? '#ffb020' : st.ato ? '#7dffc0' : '#2b6f52';
    x.font = '600 16px ui-monospace,monospace';
    x.fillText('MODE  ' + modeTxt, W - 178, 30);
    if (st.ato) {
      x.fillStyle = '#0f3a26'; x.fillRect(W - 150, 12, 62, 24);
      x.fillStyle = '#5ef2a8'; x.font = '700 15px ui-monospace,monospace';
      x.fillText('AUTO', W - 141, 30);
    }
    // 速度
    x.fillStyle = '#7dffc0'; x.font = '700 96px ui-monospace,monospace';
    x.fillText(String(Math.round(st.speedKmh)).padStart(3, '0'), 26, 152);
    x.fillStyle = '#3f8f6c'; x.font = '600 18px "Microsoft YaHei",sans-serif';
    x.fillText('km/h', 226, 150);
    // 限速
    x.fillStyle = '#0f2a1e'; x.fillRect(300, 66, 240, 90);
    x.strokeStyle = '#2f7c58'; x.lineWidth = 2; x.strokeRect(300, 66, 240, 90);
    x.fillStyle = '#8fa8a0'; x.font = '600 15px "Microsoft YaHei",sans-serif';
    x.fillText('允许速度', 314, 88);
    x.fillStyle = st.overSpeed ? '#ff6b5a' : '#ffe083';
    x.font = '700 52px ui-monospace,monospace';
    x.fillText(String(Math.round(st.limit)).padStart(2, '0'), 316, 140);
    // 前方信号机
    if (st.signal !== undefined) {
      const sc = ['#ff5a4a', '#ffb020', '#3ddc97'][st.signal] || '#3ddc97';
      x.fillStyle = '#0f2a1e'; x.fillRect(300, 162, 240, 52);
      x.strokeStyle = '#2f7c58'; x.lineWidth = 1.5; x.strokeRect(300, 162, 240, 52);
      x.fillStyle = sc;
      x.beginPath(); x.arc(320, 188, 8, 0, TAU); x.fill();
      x.fillStyle = '#8fa8a0'; x.font = '600 15px "Microsoft YaHei",sans-serif';
      x.fillText('前方信号', 336, 194);
      x.fillStyle = sc; x.font = '700 17px ui-monospace,monospace';
      x.fillText(['红', '黄', '绿'][st.signal] || '', 412, 194);
      x.fillStyle = '#7f9a90'; x.font = '600 14px ui-monospace,monospace';
      x.fillText(Math.round(st.signalDist) + 'm', 444, 194);
    }
    // 停车点
    x.fillStyle = '#8fa8a0'; x.font = '600 15px "Microsoft YaHei",sans-serif';
    x.fillText('距停车点', 26, 200);
    x.fillStyle = '#e8fff4'; x.font = '700 40px ui-monospace,monospace';
    x.fillText(Math.max(0, Math.round(st.distToStop)) + ' m', 116, 204);
    // 目标条
    const bw = 320;
    x.fillStyle = '#132b20'; x.fillRect(26, 222, bw, 10);
    const p = clamp(1 - st.distToStop / 420, 0, 1);
    x.fillStyle = '#3ddc97'; x.fillRect(26, 222, bw * p, 10);
    x.fillStyle = '#5ef2a8'; x.fillRect(26 + bw - 3, 218, 3, 18);
    // 状态
    x.fillStyle = '#0c1f17'; x.fillRect(0, 250, W, 100);
    x.font = '600 17px "Microsoft YaHei",sans-serif';
    x.fillStyle = st.doorOpen ? '#ffb020' : '#5ef2a8';
    x.fillText(st.doorOpen ? '● 车门开启' : '● 车门关闭', 20, 282);
    x.fillStyle = st.eb ? '#ff5a4a' : '#3f8f6c';
    x.fillText(st.eb ? '● 紧急制动' : '● 制动正常', 20, 312);
    x.fillStyle = st.traction > 0.01 ? '#5ef2a8' : '#3f8f6c';
    x.fillText(st.traction > 0.01 ? '● 牵引输出' : '● 牵引切除', 300, 282);
    x.fillStyle = st.atpWarn ? '#ffb020' : '#3f8f6c';
    x.fillText(st.atpWarn ? '● ATP 警告' : '● ATP 正常', 300, 312);
    x.fillStyle = '#1a3a2c'; x.fillRect(16, 330, W - 32, 2);
    x.fillStyle = '#3f8f6c'; x.font = '500 12px ui-monospace,monospace';
    x.fillText('SHANGHAI METRO  ATP-2000', 18, 344);
    this.t1.needsUpdate = true;
  }
  drawHMI(st) {
    const x = this.x2, W = 560, H = 350;
    x.fillStyle = '#080d14'; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#1a2c40'; x.lineWidth = 4; x.strokeRect(2, 2, W - 4, H - 4);
    // 线路徽标
    x.fillStyle = st.lineColor; x.fillRect(0, 0, 74, H);
    x.fillStyle = '#08110a'; x.font = '800 52px "Microsoft YaHei",sans-serif'; x.textAlign = 'center';
    x.fillText(st.lineBadge, 37, 88);
    x.save(); x.translate(37, 110); x.rotate(PI / 2);
    x.fillStyle = '#08110a'; x.font = '700 18px "Microsoft YaHei",sans-serif'; x.textAlign = 'left';
    x.fillText(st.lineName, 0, 0); x.restore();
    x.textAlign = 'left';
    // 下一站
    x.fillStyle = '#7f95a8'; x.font = '600 14px "Microsoft YaHei",sans-serif';
    x.fillText('下一站  NEXT STATION', 98, 40);
    x.fillStyle = '#ffffff'; x.font = '800 46px "PingFang SC","Microsoft YaHei",sans-serif';
    x.fillText(st.nextZh, 96, 92);
    x.fillStyle = '#7f95a8'; x.font = '500 19px "Segoe UI",sans-serif';
    x.fillText(st.nextEn, 98, 118);
    // 时刻
    x.strokeStyle = '#1c2f42'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(96, 136); x.lineTo(540, 136); x.stroke();
    const rows = [
      ['计划到达', fmtClock(st.schArr)],
      ['计划发车', fmtClock(st.schDep)],
      ['当前时间', fmtClock(st.clock)],
      ['偏差', (st.delay > 0 ? '+' : '') + Math.round(st.delay) + ' s']
    ];
    rows.forEach((r, i) => {
      const yy = 164 + i * 34;
      x.fillStyle = '#7f95a8'; x.font = '500 17px "Microsoft YaHei",sans-serif';
      x.fillText(r[0], 98, yy);
      x.fillStyle = i === 3 ? (Math.abs(st.delay) > 30 ? '#ffb020' : '#6ef0b0') : '#dfeefb';
      x.font = '600 21px ui-monospace,monospace';
      x.fillText(r[1], 250, yy);
    });
    // 线路条
    x.fillStyle = '#0f1a26'; x.fillRect(96, 292, 444, 6);
    x.fillStyle = st.lineColor; x.fillRect(96, 292, 444 * st.progress, 6);
    x.fillStyle = st.lineColor;
    x.beginPath(); x.arc(96 + 444 * st.progress, 295, 7, 0, TAU); x.fill();
    x.fillStyle = '#5c7386'; x.font = '500 12px "Microsoft YaHei",sans-serif';
    x.fillText(st.fromZh, 96, 318);
    x.textAlign = 'right'; x.fillText(st.toZh, 540, 318);
    x.textAlign = 'left';

    /* ---- 车钩力仪表（多质点动力学的可视化） ----
       放在线路条上方独立一行，避免压住站名。
       横轴以 0 为中心：向右为拉伸（起动时后车拖曳），向左为压缩（制动时后车顶上）。
       量程 ±160 kN，超过 120 kN 转红。这是驾驶室里唯一能「看见」车钩的地方。 */
    const cp = st.coupler || { tension: 0, compression: 0 };
    const cpVal = Math.abs(cp.compression) > Math.abs(cp.tension) ? cp.compression : cp.tension;
    const cpMax = 160;
    const barX = 300, barY = 330, barW = 240, barH = 10;
    x.fillStyle = '#0d1720'; x.fillRect(barX, barY, barW, barH);
    x.strokeStyle = '#1c2f42'; x.lineWidth = 1; x.strokeRect(barX, barY, barW, barH);

    const mid = barX + barW / 2;
    const norm = clamp(cpVal / cpMax, -1, 1);
    const fillW = Math.abs(norm) * (barW / 2);
    const cc = Math.abs(cpVal) > 120 ? '#ff6b5a' : Math.abs(cpVal) > 60 ? '#ffb020' : '#6ec7ff';
    x.fillStyle = cc;
    if (norm >= 0) x.fillRect(mid, barY, fillW, barH);
    else x.fillRect(mid - fillW, barY, fillW, barH);
    /* 零位与 ±50% 刻度 */
    x.fillStyle = '#3a5570'; x.fillRect(mid - 1, barY - 2, 2, barH + 4);
    x.fillStyle = '#1c2f42';
    for (const f of [-0.5, 0.5]) x.fillRect(mid + (barW / 2) * f, barY, 1, barH);

    /* 标签与读数：都放左侧（右侧会被 560px 画布裁掉） */
    x.font = '500 12px "Microsoft YaHei",sans-serif';
    x.fillStyle = '#5c7386';
    x.fillText('车钩', 96, barY + 9);
    x.fillStyle = cc;
    x.font = '700 13px ui-monospace,monospace';
    x.textAlign = 'right';
    x.fillText(Math.abs(cpVal) < 2 ? '—' : (cpVal > 0 ? '+' : '') + Math.round(cpVal) + ' kN', barX - 6, barY + 9);
    x.textAlign = 'left';

    this.t2.needsUpdate = true;
  }
  drawSpeedo(st) {
    const x = this.sx, W = 320, H = 320;
    x.clearRect(0, 0, W, H);
    x.fillStyle = '#0b0f12'; x.beginPath(); x.arc(160, 160, 156, 0, TAU); x.fill();
    const a0 = PI * 0.75, a1 = PI * 2.25;
    for (let v = 0; v <= 120; v += 5) {
      const a = lerp(a0, a1, v / 120);
      const big = v % 10 === 0;
      const r1 = big ? 118 : 128;
      x.strokeStyle = v >= 100 ? '#ff6b5a' : '#8fa8a0';
      x.lineWidth = big ? 3 : 1.5;
      x.beginPath();
      x.moveTo(160 + Math.cos(a) * r1, 160 + Math.sin(a) * r1);
      x.lineTo(160 + Math.cos(a) * 140, 160 + Math.sin(a) * 140);
      x.stroke();
      if (big) {
        x.fillStyle = v >= 100 ? '#ff8f80' : '#cfe6dd';
        x.font = '600 20px ui-monospace,monospace';
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(String(v), 160 + Math.cos(a) * 96, 160 + Math.sin(a) * 96);
      }
    }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#5c7386'; x.font = '600 13px "Segoe UI",sans-serif';
    x.fillText('km/h', 160, 220);
    const a = lerp(a0, a1, clamp(st.speedKmh / 120, 0, 1));
    x.strokeStyle = '#6ef0b0'; x.lineWidth = 5; x.lineCap = 'round';
    x.beginPath(); x.moveTo(160, 160);
    x.lineTo(160 + Math.cos(a) * 112, 160 + Math.sin(a) * 112); x.stroke();
    x.fillStyle = '#0b0f12'; x.beginPath(); x.arc(160, 160, 13, 0, TAU); x.fill();
    x.strokeStyle = '#6ef0b0'; x.lineWidth = 2; x.beginPath(); x.arc(160, 160, 13, 0, TAU); x.stroke();
    this.speedTex.needsUpdate = true;
  }
}

function texButtonPanel() {
  if (TEX_CACHE.has('btnpanel')) return TEX_CACHE.get('btnpanel');
  const [c, x] = cv2d(512, 256);
  x.fillStyle = '#20262a'; x.fillRect(0, 0, 512, 256);
  x.strokeStyle = '#3a444a'; x.lineWidth = 3; x.strokeRect(4, 4, 504, 248);
  const btns = [['开门', 40, 40], ['关门', 190, 40], ['鸣笛', 340, 40], ['头灯', 40, 140], ['广播', 190, 140], ['对讲', 340, 140]];
  btns.forEach(([t, bx, by]) => {
    x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(bx, by + 34, 130, 40);
    x.strokeStyle = '#4a565d'; x.lineWidth = 2; x.strokeRect(bx, by + 34, 130, 40);
    x.fillStyle = '#c9d6dd'; x.font = '600 22px "Microsoft YaHei",sans-serif'; x.textAlign = 'center';
    x.fillText(t, bx + 65, by + 62);
    x.fillStyle = '#0d1114'; x.beginPath(); x.arc(bx + 65, by + 12, 11, 0, TAU); x.fill();
    x.strokeStyle = '#4a565d'; x.beginPath(); x.arc(bx + 65, by + 12, 11, 0, TAU); x.stroke();
  });
  x.textAlign = 'left';
  const t = toTex(c);
  TEX_CACHE.set('btnpanel', t);
  return t;
}

function texClipboard(st) {
  const key = 'clip' + st.zh;
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const [c, x] = cv2d(256, 340);
  x.fillStyle = '#e8e4d8'; x.fillRect(0, 0, 256, 340);
  x.fillStyle = '#2b3236'; x.font = '700 19px "Microsoft YaHei",sans-serif';
  x.fillText('本次乘务', 16, 34);
  x.strokeStyle = '#b9b3a4'; x.lineWidth = 1;
  for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(16, 56 + i * 30); x.lineTo(240, 56 + i * 30); x.stroke(); }
  x.fillStyle = '#3b444a'; x.font = '500 13px ui-monospace,monospace';
  x.fillText(st.zh, 18, 76);
  x.fillText('6 辆编组  A 型车', 18, 106);
  const t = toTex(c);
  TEX_CACHE.set(key, t);
  return t;
}

class Train {
  constructor(line, route, opts = {}) {
    this.line = line;
    this.route = route;
    this.cars = [];
    this.carCount = opts.cars || 6;
    this.isPlayer = !!opts.player;
    this.group = new THREE.Group();
    this.doorOpen = false;
    this.wheels = [];
    this.cab = null;
    this.lateral = opts.lateral || 0;
    this.dir = opts.dir || 1;
    this.sideMats = carSideMats(line, true);
    this.doorSets = [];
    this.doorT = 0;
    this.doorSide = 1;          // 岛式站台在本地 +X 侧，即司机视角左侧
    this.carLag = new Array(this.carCount).fill(0);  // 车钩间隙视觉量（旧的正弦近似）
    this._lastV = 0;
    /* 多质点车链：玩家列车才跑真实车钩动力学，AI 车仍用轻量视觉近似 */
    this.chain = (this.isPlayer && typeof BodyChain === 'function')
      ? new BodyChain(Object.assign({}, BODY, { n: this.carCount }))
      : null;
    this.chainOffsets = null;

    for (let i = 0; i < this.carCount; i++) {
      const car = this.buildCar(i, i === 0, opts);
      this.cars.push(car);
      this.group.add(car.group);
    }
    if (this.isPlayer) {
      this.cabDisplay = new CabDisplay();
      this.cab = this.buildCab(this.cars[0]);
      this.cars[0].group.add(this.cab.group);
      this.headlight = this.buildHeadlight(this.cars[0]);
    }
  }
  buildCar(i, isLead, opts) {
    const g = new THREE.Group();
    const line = this.line;
    const mats = this.sideMats;
    // 侧墙：鼓形断面（不再是平板）
    /* 真实地铁车体是「中间最宽、上下收窄」的鼓形。原来两片 PlaneGeometry
       完全平直，从 3/4 视角看侧面像一块板。
       这里用网格重建曲面，但 **保持 UV 与原来完全一致**：
       右侧 u=0 对应 z=+CAR_LEN/2（原 PlaneGeometry 绕 Y 转 +90° 的结果），
       左侧相反。否则车门的贴图会左右镜像。 */
    const sideMesh = (sign) => {
      const NX = 24, NY = 12;                 // 沿车长 / 沿高度分段
      /* 侧壁只做到车顶「赤道」高度 3.72：RoundedBoxGeometry 的车顶在 y=3.72
         处最宽（x=±CAR_W/2），再往上开始收圆。如果侧壁继续延伸到 3.85，
         就会在接缝处比车顶更外侧，形成一圈外翻的小檐。 */
      const H = 2.72, Y0 = 1.0;
      const pos = [], uv = [], idx = [];
      for (let iz = 0; iz <= NX; iz++) {
        const zt = iz / NX;                   // 0..1
        /* 右侧 u=0 在 z=+len/2；左侧 u=0 在 z=-len/2 */
        const z = (sign > 0 ? 0.5 - zt : zt - 0.5) * CAR_LEN;
        for (let iy = 0; iy <= NY; iy++) {
          const v = iy / NY;
          const y = Y0 + v * H;
          /* 鼓形：中段最宽，上下各收 0.055 / 0.075 */
          const k = Math.abs(2 * v - 1);
          /* 上段不再内收（0），让侧壁与车顶赤道相切；下段保留裙边收分 */
          const inset = v < 0.5 ? 0.055 * Math.pow(k, 1.7) : 0;
          pos.push(sign * (CAR_W / 2 - inset), y, z);
          uv.push(zt, v);
        }
      }
      for (let iz = 0; iz < NX; iz++) {
        for (let iy = 0; iy < NY; iy++) {
          const a = iz * (NY + 1) + iy;
          const b = a + NY + 1;
          /* 左右两侧绕序相反，保证法线都朝外 */
          if (sign > 0) idx.push(a, b, a + 1, a + 1, b, b + 1);
          else idx.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, sign > 0 ? mats.right : mats.left);
    };
    const right = sideMesh(1);
    const left = sideMesh(-1);
    g.add(right, left);

    // 车顶
    const roof = new THREE.Mesh(new RoundedBoxGeometry(CAR_W, 0.42, CAR_LEN, 3, 0.14), new THREE.MeshStandardMaterial({ color: 0xb9bfc1, roughness: 0.62, metalness: 0.3 }));
    roof.position.y = 3.72;
    g.add(roof);
    // 车顶设备
    const ac = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.34, 5.6), new THREE.MeshStandardMaterial({ color: 0x8f979a, roughness: 0.7, metalness: 0.2 }));
    ac.position.set(0, 3.98, i % 2 ? 3.4 : -3.4);
    g.add(ac);
    // 端部
    const endMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e2, roughness: 0.5, metalness: 0.1 });
    const gang = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.6, 0.5), new THREE.MeshStandardMaterial({ color: 0x2e3438, roughness: 0.85 }));
    gang.position.set(0, 2.3, -CAR_LEN / 2 - 0.16);
    g.add(gang);
    const endFace = new THREE.Mesh(new THREE.PlaneGeometry(CAR_W - 0.1, 2.85), endMat);
    endFace.position.set(0, 2.42, -CAR_LEN / 2 - 0.02);
    endFace.rotation.y = PI;
    g.add(endFace);
    // 底部
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(CAR_W - 0.12, 0.55, CAR_LEN - 0.3), new THREE.MeshStandardMaterial({ color: 0x33393d, roughness: 0.8, metalness: 0.2 }));
    skirt.position.y = 0.92; g.add(skirt);
    const under = new THREE.Mesh(new THREE.BoxGeometry(CAR_W - 0.5, 0.5, CAR_LEN - 1.4), new THREE.MeshStandardMaterial({ color: 0x1c2124, roughness: 0.9 }));
    under.position.y = 0.55; g.add(under);
    // 转向架
    for (const z of [-7.4, 7.4]) {
      const bogie = new THREE.Group();
      bogie.position.set(0, 0, z);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.42, 3.0), new THREE.MeshStandardMaterial({ color: 0x23282b, roughness: 0.8, metalness: 0.4 }));
      frame.position.y = 0.62; bogie.add(frame);
      const wg = [];
      for (const wx of [-0.78, 0.78]) for (const wz of [-0.95, 0.95]) {
        const g = new THREE.CylinderGeometry(0.43, 0.43, 0.14, 16);
        g.rotateZ(PI / 2); g.translate(wx, 0.43, wz);
        wg.push(g);
      }
      const wm = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(wg, false), MAT.rail);
      bogie.add(wm);
      wg.forEach(g => g.dispose());
      g.add(bogie);
    }
    // 受电弓 / 第三轨集电靴
    if (i === 1 || i === 3) {
      if (line.thirdRail) {
        for (const sx of [-1, 1]) {
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.07, 0.16), MAT.darkMetal);
          arm.position.set(sx * 1.95, 0.55, 0);
          g.add(arm);
          const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.55), MAT.metal);
          shoe.position.set(sx * 2.4, 0.46, 0);
          g.add(shoe);
        }
      } else {
        const p = new THREE.Group();
        p.position.set(0, 4.05, 0);
        const armMat = MAT.darkMetal;
        const baseBar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.1), armMat); p.add(baseBar);
        const a1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.5, 0.07), armMat);
        a1.position.set(0.3, 0.75, 0.25); a1.rotation.x = 0.42; p.add(a1);
        const a2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.5, 0.07), armMat);
        a2.position.set(-0.25, 1.45, -0.15); a2.rotation.x = -0.4; p.add(a2);
        const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.16), new THREE.MeshStandardMaterial({ color: 0x2a2f31, roughness: 0.5, metalness: 0.8 }));
        head.position.y = 2.2; p.add(head);
        const horn = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.2), MAT.metal);
        horn.position.y = 2.26; p.add(horn);
        g.add(p);
      }
    }
    if (isLead) this.buildNose(g, line, opts);
    if (this.isPlayer) this.buildInterior(g, isLead);
    else this.buildSimpleInterior(g);
    this.buildDoors(g);
    mergeLocalBoxes(g);
    const car = { group: g, right, left, index: i, length: CAR_LEN };
    return car;
  }
  buildNose(g, line, opts) {
    const model = line.model || 'AC02';
    const sq = model === 'AC04';        // 方正车头（1 号线）
    const mid = model === 'AC03';       // 3 号线
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xf1f3f2, roughness: sq ? 0.32 : 0.38, metalness: 0.18, envMapIntensity: 0.9 });
    const zF = CAR_LEN / 2;
    // 车型参数：下半脸高 / 上半脸高 / 玻璃宽高
    const loH = sq ? 0.56 : 0.62;
    const upH = sq ? 0.54 : 0.75;
    const upY = sq ? 3.52 : 3.425;
    const gw = sq ? 2.52 : 2.34;
    const gh = sq ? 1.58 : 1.4;
    // 前脸：下部 / 顶部 / 两侧立柱，中间为挡风玻璃开口
    const lower = new THREE.Mesh(new THREE.BoxGeometry(CAR_W - 0.06, loH, 0.22), noseMat);
    lower.position.set(0, 1.05 + loH / 2, zF - 0.06);
    g.add(lower);
    /* 上脸板：方正车型保持垂直；圆润车型改为向后上方倾斜的斜面，
       这样侧视轮廓是一条曲线而不是一堵直墙。
       关键：这一块只覆盖挡风玻璃「上方」，玻璃开口完全不受影响。 */
    const RAKE = sq ? 0 : 0.58;            // 后掠角（弧度）
    if (sq) {
      const upper = new THREE.Mesh(new THREE.BoxGeometry(CAR_W - 0.06, upH, 0.22), noseMat);
      upper.position.set(0, upY, zF - 0.06);
      g.add(upper);
    } else {
      const plateLen = 1.02;               // 斜面板长度
      const upper = new THREE.Mesh(new THREE.BoxGeometry(CAR_W - 0.06, plateLen, 0.20), noseMat);
      /* 斜面板下沿对齐玻璃上沿（约 y=3.02, z=zF-0.02），
         上沿后掠到 (y≈3.87, z≈zF-0.56) */
      upper.position.set(0, 3.45, zF - 0.29);
      upper.rotation.x = -RAKE;
      g.add(upper);
    }
    for (const sx of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(sq ? 0.26 : 0.34, 1.48, 0.22), noseMat);
      pillar.position.set(sx * (sq ? 1.37 : 1.33), 2.32, zF - 0.06);
      g.add(pillar);
    }
    // 黑色窗框面
    const mask = new THREE.Mesh(new THREE.PlaneGeometry(sq ? 2.76 : 2.62, 1.66), new THREE.MeshStandardMaterial({ color: 0x0a0d0f, roughness: 0.5, metalness: 0.4 }));
    mask.position.set(0, 2.32, zF + 0.005);
    g.add(mask);
    // 挡风玻璃
    /* 挡风玻璃：与屏蔽门玻璃同源做法 —— 清漆层 + 微弱波纹法线。
       注意：司机视角下这块玻璃会被隐藏（noseGlass.visible=false），
       所以只影响外部/追车视角观感，不影响驾驶视野。 */
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), new THREE.MeshPhysicalMaterial({
      color: 0x0d1a22, roughness: 0.045, metalness: 0.86, transparent: true, opacity: 0.60,
      envMapIntensity: 2.3, clearcoat: 1.0, clearcoatRoughness: 0.035, reflectivity: 0.6
    }));
    if (typeof MAT !== 'undefined' && MAT.psdGlass && MAT.psdGlass.normalMap) {
      glass.material.normalMap = MAT.psdGlass.normalMap;
      glass.material.normalScale = new THREE.Vector2(0.5, 0.5);
    }
    glass.position.set(0, 2.32, zF + 0.02);
    glass.rotation.x = sq ? -0.015 : -0.04;
    g.add(glass);
    this.noseGlass = glass;
    // 方正车头：顶部一整条黑色面罩（LED 目的地屏嵌在里面）
    if (sq) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(CAR_W - 0.10, 0.46, 0.16), new THREE.MeshStandardMaterial({ color: 0x0d0f11, roughness: 0.55, metalness: 0.35 }));
      band.position.set(0, 3.52, zF + 0.02);
      g.add(band);
    }
    // 3 号线：眉线装饰
    if (mid) {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(CAR_W - 0.14, 0.1, 0.06), new THREE.MeshStandardMaterial({ color: 0x20262a, roughness: 0.5 }));
      brow.position.set(0, 3.08, zF + 0.1);
      g.add(brow);
    }
    // 前脸色带
    const stripeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(line.color), roughness: 0.45, metalness: 0.2, emissive: new THREE.Color(line.color), emissiveIntensity: 0.15 });
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(CAR_W - 0.08, mid ? 0.26 : 0.17, 0.02), stripeMat);
    stripe.position.set(0, sq ? 1.02 : 1.16, zF + 0.02);
    g.add(stripe);
    if (line.color2) {
      const stripe2 = new THREE.Mesh(new THREE.BoxGeometry(CAR_W - 0.08, 0.06, 0.02),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(line.color2), roughness: 0.45, metalness: 0.2, emissive: new THREE.Color(line.color2), emissiveIntensity: 0.15 }));
      stripe2.position.set(0, (sq ? 1.02 : 1.16) - 0.12, zF + 0.021);
      g.add(stripe2);
    }
    // 雨刷
    this.noseWipers = this.noseWipers || [];
    for (const x of [-0.62, 0.62]) {
      const wiper = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.78, 0.04), MAT.darkMetal);
      wiper.position.set(x, 2.24, zF + 0.1); wiper.rotation.z = x > 0 ? -0.55 : 0.55;
      g.add(wiper);
      this.noseWipers.push(wiper);
    }
    // 头灯
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.0, 2.4), toneMapped: false });
    const lampY = sq ? 1.6 : 1.32;
    for (const x of [-0.98, 0.98]) {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(sq ? 0.74 : 0.62, sq ? 0.2 : 0.34, 0.14), new THREE.MeshStandardMaterial({ color: 0x1d2326, roughness: 0.4, metalness: 0.6 }));
      housing.position.set(x, lampY, zF + 0.04); g.add(housing);
      if (sq) {
        const lamp = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.13), lampMat);
        lamp.position.set(x, lampY, zF + 0.12);
        g.add(lamp);
        this.headLamps = this.headLamps || [];
        this.headLamps.push(lamp);
      } else {
        for (const dx of [-0.13, 0.13]) {
          const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.075, 12), lampMat);
          lamp.position.set(x + dx, lampY, zF + 0.12);
          g.add(lamp);
          this.headLamps = this.headLamps || [];
          this.headLamps.push(lamp);
        }
      }
    }
    // 目的地屏
    const destMat = new THREE.MeshBasicMaterial({ map: texDestination(line, opts.dest || line.stations[line.stations.length - 1], true), toneMapped: false });
    const dest = new THREE.Mesh(new THREE.PlaneGeometry(sq ? 2.05 : 1.55, sq ? 0.34 : 0.39), destMat);
    /* 贴在斜面板表面上：y=3.42 处斜面 z ≈ zF-0.25，再沿法线外推一点 */
    dest.position.set(0, sq ? 3.52 : 3.42, sq ? zF + 0.11 : zF - 0.21);
    if (!sq) dest.rotation.x = -0.58;
    g.add(dest);
    // 线路号
    const bc = document.createElement('canvas'); bc.width = 128; bc.height = 128;
    const bx = bc.getContext('2d');
    bx.fillStyle = line.color; bx.fillRect(0, 0, 128, 128);
    bx.fillStyle = '#0a1206'; bx.font = '800 84px "Microsoft YaHei",sans-serif'; bx.textAlign = 'center'; bx.textBaseline = 'middle';
    bx.fillText(line.badge, 64, 68);
    const badgeTex = toTex(bc);
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), new THREE.MeshBasicMaterial({ map: badgeTex, transparent: false }));
    badge.position.set(-1.2, sq ? 3.4 : 3.40, sq ? zF + 0.12 : zF - 0.19);
    if (!sq) badge.rotation.x = -0.58;
    g.add(badge);
    // 车钩
    const coupler = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.7), new THREE.MeshStandardMaterial({ color: 0x363c40, roughness: 0.7, metalness: 0.6 }));
    coupler.position.set(0, 0.86, zF + 0.28); g.add(coupler);
    // 排障器
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x2c3235, roughness: 0.8 }));
    skirt.position.set(0, 0.5, zF + 0.12); g.add(skirt);
    // 侧面过渡
    /* 前脸两侧竖棱：原来是两块带旋转的方盒（近看是斜切面），
       改成圆角盒，让前脸到车侧的过渡是一条圆弧。 */
    for (const s of [-1, 1]) {
      const corner = new THREE.Mesh(new RoundedBoxGeometry(0.30, 2.62, 0.46, 3, 0.13), noseMat);
      corner.position.set(s * (CAR_W / 2 - 0.15), 2.36, zF - 0.20);
      g.add(corner);
    }
  }
  buildHeadlight(car) {
    const spot = new THREE.SpotLight(0xfff2d8, 950, 160, 0.38, 0.55, 1.1);
    spot.position.set(0, 1.7, CAR_LEN / 2 + 0.2);
    const target = new THREE.Object3D();
    target.position.set(0, 0.4, 60);
    car.group.add(spot, target);
    spot.target = target;
    return spot;
  }
  buildCab(car) {
    const g = new THREE.Group();
    const model = (this.line && this.line.model) || 'AC02';
    const cfg = CAB_CFG[model] || CAB_CFG.AC02;
    this.cabCfg = cfg;
    const wallMat = new THREE.MeshStandardMaterial({ color: cfg.wall, roughness: 0.74, metalness: 0.04 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2c3438, roughness: 0.62, metalness: 0.15 });
    const deskMat = new THREE.MeshStandardMaterial({ color: cfg.desk, roughness: 0.55, metalness: 0.1 });
    const zBack = 7.05, zFront = 10.36;
    // 地板 / 顶板
    pbox(g, 2.86, 0.1, 3.7, new THREE.MeshStandardMaterial({ color: 0x3a4145, roughness: 0.9 }), 0, 1.17, (zBack + zFront) / 2);
    pbox(g, 2.86, 0.08, 3.7, wallMat, 0, 3.52, (zBack + zFront) / 2);
    // 侧墙（司机身侧的侧窗）
    pplane(g, 3.4, 0.9, wallMat, -1.43, 1.63, 8.7, PI / 2);
    pplane(g, 3.4, 0.56, wallMat, -1.43, 3.26, 8.7, PI / 2);
    pplane(g, 0.24, 0.98, wallMat, -1.43, 2.44, 7.17, PI / 2);
    pplane(g, 1.56, 0.98, wallMat, -1.43, 2.44, 9.58, PI / 2);
    const sideGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.52, 0.86), new THREE.MeshPhysicalMaterial({
      color: 0x8fb4c4, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.10,
      envMapIntensity: 1.2, side: THREE.DoubleSide
    }));
    sideGlass.position.set(-1.435, 2.47, 8.0);
    sideGlass.rotation.y = PI / 2;
    g.add(sideGlass);
    pbox(g, 0.07, 0.07, 1.6, MAT.darkMetal, -1.44, 2.92, 8.0);
    pbox(g, 0.07, 0.07, 1.6, MAT.darkMetal, -1.44, 2.03, 8.0);
    // 右侧墙
    pplane(g, 3.7, 2.36, wallMat, 1.43, 2.36, (zBack + zFront) / 2, -PI / 2);
    // 封住前脸与司机室之间的侧向缝隙
    pbox(g, 0.06, 2.42, 1.04, wallMat, -1.43, 2.36, 10.88);
    pbox(g, 0.06, 2.42, 1.04, wallMat, 1.43, 2.36, 10.88);
    // 后墙 + 门洞
    pbox(g, 0.55, 2.36, 0.14, wallMat, -1.14, 2.36, zBack);
    pbox(g, 0.55, 2.36, 0.14, wallMat, 1.14, 2.36, zBack);
    pbox(g, 2.86, 0.45, 0.14, wallMat, 0, 3.3, zBack);
    const cabDoor = pbox(g, 1.72, 1.9, 0.08, new THREE.MeshStandardMaterial({ color: 0x9aa5a9, roughness: 0.6, metalness: 0.2 }), 0, 2.22, zBack + 0.02);
    pbox(g, 0.6, 0.72, 0.04, new THREE.MeshPhysicalMaterial({ color: 0x223038, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.5 }), 0, 2.62, zBack + 0.07);
    // 前墙（挡风窗框）
    pbox(g, 2.86, 0.62, 0.14, wallMat, 0, 1.46, zFront);
    pbox(g, 2.86, 0.72, 0.14, wallMat, 0, 3.2, zFront);
    pbox(g, 0.2, 2.3, 0.14, wallMat, -1.33, 2.35, zFront);
    pbox(g, 0.2, 2.3, 0.14, wallMat, 1.33, 2.35, zFront);
    // 玻璃
    const wglass = new THREE.Mesh(new THREE.PlaneGeometry(2.46, 1.26), new THREE.MeshPhysicalMaterial({
      color: 0x8fb4c4, roughness: 0.03, metalness: 0.2, transparent: true, opacity: 0.075, envMapIntensity: 1.1, side: THREE.DoubleSide
    }));
    wglass.position.set(0, 2.33, zFront + 0.08);
    wglass.rotation.x = -0.04;
    g.add(wglass);
    // 遮阳板
    pbox(g, 2.4, 0.12, 0.05, new THREE.MeshStandardMaterial({ color: 0x1f2629, roughness: 0.8 }), 0, 3.06, zFront - 0.06);
    // 雨刷（可摆动）
    this.wipers = [];
    for (const x of [-0.62, 0.62]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 1.76, zFront - 0.03);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.74, 0.026), MAT.darkMetal);
      arm.position.y = 0.37; pivot.add(arm);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.6, 0.05), new THREE.MeshStandardMaterial({ color: 0x14181a, roughness: 0.8 }));
      blade.position.y = 0.42; pivot.add(blade);
      const base = x > 0 ? -0.66 : 0.66;
      pivot.rotation.z = base;
      g.add(pivot);
      this.wipers.push({ pivot, base, sign: x > 0 ? 1 : -1 });
    }
    // 挡风玻璃雨滴层
    const rainTex = texRainGlass();
    this.rainTex = rainTex;
    this.rainGlass = new THREE.Mesh(new THREE.PlaneGeometry(2.42, 1.2), new THREE.MeshBasicMaterial({
      map: rainTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide
    }));
    this.rainGlass.position.set(0, 2.33, zFront + 0.055);
    this.rainGlass.rotation.x = -0.04;
    this.rainGlass.visible = false;
    g.add(this.rainGlass);
    // 动态水珠层：重力下坠 + 雨刷扫除
    const [dc, dx] = cv2d(256, 128);
    this.rainDropCtx = dx;
    this.rainDropTex = toTex(dc);
    this.rainDrops = [];
    for (let i = 0; i < 42; i++) {
      this.rainDrops.push({
        x: Math.random() * 256, y: Math.random() * 128,
        r: 0.8 + Math.random() * 2.4, v: 0.5 + Math.random(),
        drift: (Math.random() - 0.5) * 3
      });
    }
    this.rainDropPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.42, 1.2), new THREE.MeshBasicMaterial({
      map: this.rainDropTex, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide
    }));
    this.rainDropPlane.position.set(0, 2.33, zFront + 0.06);
    this.rainDropPlane.rotation.x = -0.04;
    this.rainDropPlane.visible = false;
    g.add(this.rainDropPlane);
    // 驾驶台
    const desk = pbox(g, 2.58, 0.16, 0.82, deskMat, 0, 1.68, 9.62);
    desk.rotation.x = -0.08;
    pbox(g, 2.58, 0.5, 0.12, deskMat, 0, 1.4, 9.24);
    // 台面装饰条
    pbox(g, 2.5, 0.02, 0.03, MAT.metal, 0, 1.77, 9.2);
    // 屏幕 1 / 2
    const scrMat1 = new THREE.MeshBasicMaterial({ map: this.cabDisplay.t1, toneMapped: false });
    const scrMat2 = new THREE.MeshBasicMaterial({ map: this.cabDisplay.t2, toneMapped: false });
    // 屏幕组：AC-04 三屏，其余两屏
    const scrXs = cfg.screens === 3 ? [-0.78, -0.24, 0.3] : [-0.62, 0.02];
    const scrW = cfg.screens === 3 ? 0.46 : 0.55;
    const scrH = cfg.screens === 3 ? 0.3 : 0.35;
    const binW = cfg.screens === 3 ? 1.9 : 1.34;
    const bin = pbox(g, binW, 0.5, 0.16, darkMat, cfg.screens === 3 ? -0.24 : -0.3, 2.0, 9.63);
    bin.rotation.x = 0.5;
    const bezel = new THREE.MeshStandardMaterial({ color: 0x11161a, roughness: 0.6 });
    const scrMats = [scrMat1, scrMat2, scrMat2];
    scrXs.forEach((bx, i) => {
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(scrW, scrH), scrMats[i] || scrMat2);
      scr.position.set(bx, 2.04 - (cfg.screens === 3 ? 0.005 : 0), 9.52);
      scr.rotation.set(0.5, PI, 0); g.add(scr);
      pbox(g, scrW + 0.05, scrH + 0.05, 0.02, bezel, bx, 2.045, 9.54).rotation.x = 0.5;
    });
    // 速度表
    const speedoMat = new THREE.MeshBasicMaterial({ map: this.cabDisplay.speedTex, toneMapped: false });
    const speedo = new THREE.Mesh(new THREE.CircleGeometry(0.17, 32), speedoMat);
    speedo.position.set(cfg.speedo * 1.13, 1.9, 9.46); speedo.rotation.set(-PI / 2 + 0.62, 0, 0);
    g.add(speedo);
    // 主控手柄
    const leverBase = pbox(g, 0.26, 0.12, 0.44, darkMat, cfg.lever * 1.12, 1.78, 9.3);
    const leverPivot = new THREE.Group();
    leverPivot.position.set(cfg.lever * 1.12, 1.84, 9.3);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.3, 8), MAT.metal);
    shaft.position.y = 0.15; leverPivot.add(shaft);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.24, 14), new THREE.MeshStandardMaterial({ color: 0x15191c, roughness: 0.55, metalness: 0.25 }));
    knob.position.y = 0.31; leverPivot.add(knob);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 8), new THREE.MeshStandardMaterial({ color: 0x2a3034, roughness: 0.45 }));
    cap.position.y = 0.42; leverPivot.add(cap);
    g.add(leverPivot);
    this.leverPivot = leverPivot;
    // 按钮面板
    const bpMat = new THREE.MeshBasicMaterial({ map: texButtonPanel(), toneMapped: false });
    const bp = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), bpMat);
    bp.position.set(0.86, 1.78, 9.3); bp.rotation.x = -PI / 2 + 0.18;
    g.add(bp);
    // 紧急制动按钮
    const ebBase = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0x14181a, roughness: 0.7 }));
    ebBase.position.set(1.14, 1.8, 9.55); ebBase.rotation.x = -PI / 2 + 0.2; g.add(ebBase);
    this.ebButton = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.062, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0xc4231f, roughness: 0.35, metalness: 0.2, emissive: 0x5a0d0b, emissiveIntensity: 0.7 }));
    this.ebButton.position.set(1.14, 1.83, 9.55); this.ebButton.rotation.x = -PI / 2 + 0.2; g.add(this.ebButton);
    // 对讲机
    const radio = pbox(g, 0.1, 0.3, 0.18, MAT.darkMetal, 1.4, 2.5, 8.4);
    const handset = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.26, 0.06), new THREE.MeshStandardMaterial({ color: 0x1b2024, roughness: 0.8 }));
    handset.position.set(1.33, 2.32, 8.4); handset.rotation.z = 0.16; g.add(handset);
    // 司机椅
    const seatMat = new THREE.MeshStandardMaterial({ color: cfg.seat, roughness: 0.9 });
    pbox(g, 0.58, 0.14, 0.56, seatMat, -0.55, 1.6, 8.02);
    pbox(g, 0.58, 0.72, 0.12, seatMat, -0.55, 1.98, 7.76);
    pbox(g, 0.1, 0.4, 0.1, MAT.darkMetal, -0.55, 1.35, 8.02);
    // 顶灯
    pbox(g, 0.7, 0.03, 0.18, MAT.lampWarm, 0, 3.46, 8.6);
    // 时刻表夹板
    const clip = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3), new THREE.MeshBasicMaterial({ map: texClipboard(this.line.stations[0]) }));
    clip.position.set(0.62, 1.78, 9.02); clip.rotation.x = -PI / 2 + 0.1;
    g.add(clip);
    // 内部补光
    const lamp = new THREE.PointLight(0xffe6c8, 12, 4.6, 2);
    lamp.position.set(-0.2, 3.3, 8.7);
    g.add(lamp);
    // 相机安装点
    this.eyePos = new THREE.Vector3(-0.55, 2.36, 8.42);
    return { group: g };
  }
  setDoorT(t) {
    t = clamp(t, 0, 1);
    if (Math.abs(t - this.doorT) < 0.003) return;
    this.doorT = t;
    for (const set of this.doorSets) this.updateDoorSet(set, t);
  }
  updateDoorSet(set, t) {
    const d = this._doorDummy || (this._doorDummy = new THREE.Object3D());
    for (let i = 0; i < set.list.length; i++) {
      const L = set.list[i];
      const openT = L.side === this.doorSide ? t : 0;
      const z = L.off + L.k * (0.36 + 0.705 * openT);
      d.position.set(L.side * 1.518, 2.105, z);
      d.rotation.set(0, 0, 0);
      d.scale.set(1, 1, 1);
      d.updateMatrix();
      set.mesh.setMatrixAt(i, d.matrix);
      d.position.set(L.side * 1.489, 2.105, z);
      d.updateMatrix();
      set.panel.setMatrixAt(i, d.matrix);
    }
    set.mesh.instanceMatrix.needsUpdate = true;
    set.panel.instanceMatrix.needsUpdate = true;
  }
  buildDoors(g) {
    const list = [];
    for (const side of [-1, 1]) for (const off of doorOffsetsOf(this.line)) for (const k of [-1, 1]) list.push({ side, off, k });
    const mat = new THREE.MeshStandardMaterial({ map: texDoorLeaf(), roughness: 0.42, metalness: 0.16, envMapIntensity: 0.9 });
    const geo = new THREE.BoxGeometry(0.048, 1.91, 0.715);
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    g.add(mesh);
    // 内侧饰板（避免车内侧看到外部门贴）
    const panelMat = new THREE.MeshStandardMaterial({ color: 0xd8dddd, roughness: 0.72, metalness: 0.05, emissive: new THREE.Color('#3a3f40'), emissiveIntensity: 0.6 });
    const panel = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 1.89, 0.7), panelMat, list.length);
    panel.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    panel.frustumCulled = false;
    g.add(panel);
    const set = { mesh, list, panel };
    this.doorSets.push(set);
    this.updateDoorSet(set, 0);
  }
  buildInterior(g, isLead) {
    const M = intMats();
    const z0 = -11.15, z1 = isLead ? 6.85 : 11.15;
    const len = z1 - z0, zc = (z0 + z1) / 2;
    const yF = 1.15;
    // 内壁（带窗洞）
    for (const side of [-1, 1]) {
      const wmat = side < 0 ? M.wallL : M.wallR;
      const wg = new THREE.Mesh(new THREE.PlaneGeometry(CAR_LEN, 2.85), wmat);
      wg.position.set(side * 1.468, 2.42, 0);
      wg.rotation.y = side > 0 ? -PI / 2 : PI / 2;
      g.add(wg);
    }
    // 地板 / 顶板
    pbox(g, 2.7, 0.06, len, M.floor, 0, yF, zc);
    pbox(g, 2.7, 0.05, len, M.ceil, 0, 3.44, zc);
    // 顶灯带
    pbox(g, 0.16, 0.035, len - 0.8, MAT.strip, -0.62, 3.405, zc);
    pbox(g, 0.16, 0.035, len - 0.8, MAT.strip, 0.62, 3.405, zc);
    // 长条座椅（两侧，门区断开）
    const seats = [[3.45, 6.85], [-6.85, -3.45], [8.3, 10.95], [-10.95, -8.3]];
    for (const side of [-1, 1]) {
      for (const [a, b] of seats) {
        if (b > z1 - 0.1 || a < z0 + 0.1) continue;
        const L = b - a, c = (a + b) / 2;
        pbox(g, 0.44, 0.1, L, M.seat, side * 1.12, yF + 0.42, c);
        pbox(g, 0.12, 0.58, L, M.seat, side * 1.32, yF + 0.66, c);
      }
      // 座椅下部裙板
      pbox(g, 0.1, 0.34, len - 3.6, M.panel, side * 1.36, yF + 0.17, zc);
      // 扶手（顶棚纵向）
      pbox(g, 0.035, 0.035, len - 2.2, MAT.metal, side * 0.52, 2.86, zc);
    }
    // 立柱
    for (const z of [-4.9, 4.9, -9.7, 9.7]) {
      if (z > z1 - 0.5 || z < z0 + 0.5) continue;
      for (const side of [-1, 1]) {
        pbox(g, 0.05, 2.28, 0.05, MAT.metal, side * 0.92, yF + 1.14, z);
      }
    }
    // 车门上方到站显示屏
    for (const z of doorOffsetsOf(this.line)) {
      if (z > z1 - 0.6 || z < z0 + 0.6) continue;
      pbox(g, 0.9, 0.22, 0.03, M.lcd, 0, 3.05, z);
    }
  }
  updateRainDrops(dt, tw, rainAmt) {
    if (!this.rainDropCtx) return;
    this._rainAcc = (this._rainAcc || 0) + dt;
    if (this._rainAcc < 1 / 24) return;
    const step = this._rainAcc;
    this._rainAcc = 0;
    const ctx = this.rainDropCtx, W = 256, H = 128;
    ctx.clearRect(0, 0, W, H);
    // 雨刷扫过的竖直区域清除水珠
    for (const wp of (this.wipers || [])) {
      const angle = wp.base + Math.sin(tw * 3.1) * wp.sign * 0.62;
      const cx = W * (wp.base < 0 ? 0.75 : 0.25);
      const tipX = cx + Math.sin(angle) * W * 0.30;
      for (const d of this.rainDrops) {
        if (Math.abs(d.x - tipX) < 14 && d.y > 4) {
          d.y = -4; d.x = Math.random() * W;
          d.r = 0.8 + Math.random() * 2.4;
        }
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const d of this.rainDrops) {
      d.y += (10 + d.r * 5) * step * d.v;
      d.x += d.drift * step;
      if (d.x < 0) d.x += W; else if (d.x > W) d.x -= W;
      if (d.y > H + 6) {
        d.y = -4; d.x = Math.random() * W;
        d.r = 0.8 + Math.random() * 2.4;
      }
      const trail = ctx.createLinearGradient(d.x, d.y - 12, d.x, d.y + 2);
      trail.addColorStop(0, 'rgba(190,225,245,0)');
      trail.addColorStop(0.7, `rgba(190,225,245,${0.16 * rainAmt})`);
      trail.addColorStop(1, `rgba(220,245,255,${0.4 * rainAmt})`);
      ctx.strokeStyle = trail; ctx.lineWidth = Math.max(0.6, d.r * 0.8);
      ctx.beginPath(); ctx.moveTo(d.x, d.y - 12); ctx.lineTo(d.x, d.y); ctx.stroke();
      ctx.fillStyle = `rgba(220,245,255,${0.5 * rainAmt})`;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    this.rainDropTex.needsUpdate = true;
  }
  buildSimpleInterior(g) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x242a2e, roughness: 0.92, metalness: 0.02 });
    const inner = new THREE.Mesh(new THREE.BoxGeometry(2.82, 2.45, CAR_LEN - 0.5), mat);
    inner.position.set(0, 2.28, 0);
    g.add(inner);
  }
  setLever(v) {
    if (this.leverPivot) {
      this.leverPivot.rotation.x = lerp(-0.5, 0.5, (v + 1) / 2);
    }
  }
  update(s, v, dt) {
    // 雨刷与挡风玻璃雨滴（隧道内关闭）
    const underground = this.route.frameAt(s).pos.y < -2;
    const wcfg = (typeof WEATHER !== 'undefined' && typeof weatherNow !== 'undefined') ? (WEATHER[weatherNow] || WEATHER.clear) : null;
    const rainAmt = (!underground && wcfg) ? wcfg.rain : 0;
    const tw = performance.now() * 0.001;
    if (this.wipers) {
      for (const wp of this.wipers) {
        wp.pivot.rotation.z = rainAmt > 0 ? wp.base + Math.sin(tw * 3.1) * wp.sign * 0.62 : wp.base;
      }
      if (this.rainGlass) {
        const on = rainAmt > 0;
        if (this.rainGlass.visible !== on) this.rainGlass.visible = on;
        if (on) {
          this.rainGlass.material.opacity = rainAmt * 0.9;
          if (this.rainTex) {
            this.rainTex.offset.y = (this.rainTex.offset.y - dt * 0.06) % 1;
            this.rainTex.offset.x = (this.rainTex.offset.x + dt * 0.004) % 1;
          }
        }
      }
    }
    if (this.noseWipers) {
      this.noseWipers.forEach((mesh, i) => {
        mesh.rotation.z = (i ? -0.55 : 0.55) + (rainAmt > 0 ? Math.sin(tw * 2.7 + i * PI) * 0.5 : 0);
      });
    }
    if (this.rainDropPlane) {
      const on = rainAmt > 0;
      if (this.rainDropPlane.visible !== on) this.rainDropPlane.visible = on;
      if (on) this.updateRainDrops(dt, tw, rainAmt);
    }
    if (dt > 0) {
      const acc = (v - this._lastV) / dt;
      this._lastV = v;
      /* 有真实车链时不再用正弦近似；偏移由 BodyChain 解出 */
      if (!this.chain) {
        for (let i = 1; i < this.carCount; i++) {
          const target = clamp(acc * 0.025 * i, -0.08, 0.08);
          this.carLag[i] += (target - this.carLag[i]) * Math.min(1, dt * 5);
        }
      }
    } else {
      this._lastV = v;
    }
    const offs = this.chainOffsets;
    for (let i = 0; i < this.cars.length; i++) {
      const dir = this.dir;
      /* 车链偏移（m）折算成里程差；无车链时退回旧的正弦 carLag */
      const lag = offs && offs[i] != null ? offs[i] : (this.carLag[i] || 0);
      const cs = dir > 0
        ? s - 11.4 - i * CAR_PITCH - lag
        : s + 11.4 + i * CAR_PITCH + lag;
      const usePose = typeof this.route.poseAt === 'function';
      const f = usePose ? this.route.poseAt(cs, this.lateral) : this.route.frameAt(cs);
      const tan = dir > 0 ? f.tan.clone() : f.tan.clone().negate();
      // 用水平基准重建正交基，避免插值基向量带来的滚转抖动
      const right = new THREE.Vector3().crossVectors(WORLD_UP, tan).normalize();
      const up = new THREE.Vector3().crossVectors(tan, right).normalize();
      const car = this.cars[i];
      // poseAt 已把横向偏移算进 pos；未实现时退化为旧算法
      if (usePose) car.group.position.copy(f.pos);
      else car.group.position.copy(f.pos).addScaledVector(f.right, this.lateral);
      car.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, tan));
      car.group.updateMatrixWorld();
    }
    for (const w of this.wheels) w.rotation.x -= v * dt / 0.43;
  }
  getCabWorld() {
    const car = this.cars[0];
    const p = car.group.localToWorld(this.eyePos.clone());
    return p;
  }
}
