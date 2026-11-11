/* ================================================================
   车站附加设施：换乘通道、出入口地面亭、站台 PIS 显示屏
   ================================================================ */

/* ---------------- 换乘通道：站台端部通向另一条线 ---------------- */
function trColorOf(name) {
  const COLORS = {
    '1号线': '#E4002B', '2号线': '#8CC63F', '3号线': '#FFD100', '4号线': '#5A2D82',
    '5号线': '#944D9A', '6号线': '#D9027D', '7号线': '#F97F00', '8号线': '#0094D8',
    '9号线': '#71C5E8', '10号线': '#C6AFD4', '11号线': '#7A1F3D', '12号线': '#007B5F',
    '13号线': '#E999C0', '14号线': '#827A04', '15号线': '#BBA786', '16号线': '#32D2CA',
    '17号线': '#BC796D', '18号线': '#C4984F', '磁浮线': '#008B9A', '市域机场线': '#2A6BB2', '浦江线': '#999999'
  };
  return COLORS[name] || '#36b37e';
}

function texTransferPortalSign(trName, arrow = '↑') {
  const key = 'trportal_' + trName + '_' + arrow;
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const W = 640, H = 148;
  const [c, x] = cv2d(W, H);
  const col = trColorOf(trName);
  x.fillStyle = '#090f14'; x.fillRect(0, 0, W, H);
  x.fillStyle = col; x.fillRect(0, 0, W, 14);
  x.strokeStyle = 'rgba(255,255,255,0.22)'; x.lineWidth = 2;
  x.strokeRect(4, 16, W - 8, H - 20);
  // 方向箭头
  x.fillStyle = '#f2f7fa';
  x.font = '800 58px "Microsoft YaHei",sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(arrow, 58, 84);
  // 线路色块
  x.fillStyle = col;
  x.beginPath(); x.roundRect(108, 36, 156, 88, 10); x.fill();
  x.fillStyle = '#071014';
  x.font = trName.length > 3 ? '800 30px "Microsoft YaHei",sans-serif' : '800 40px "Microsoft YaHei",sans-serif';
  x.fillText(trName, 186, 82);
  // 换乘通道文字
  x.textAlign = 'left';
  x.fillStyle = '#ffffff';
  x.font = '800 38px "Microsoft YaHei",sans-serif';
  x.fillText('换乘通道', 288, 68);
  x.fillStyle = '#9bb2bf';
  x.font = '600 22px "Segoe UI",sans-serif';
  x.fillText('INTERCHANGE PASSAGE · 按提示前往站台', 288, 108);
  const t = toTex(c);
  TEX_CACHE.set(key, t);
  return t;
}

function buildTransferPassage(g, st, line, underground, pt, H) {
  if (!st.tr || !st.tr.length) return null;
  const zA = 70, zM = 91, zB = 103;  // 70..91 双向换乘长廊，91..103 换乘分流大厅
  const W = 6.8, W2 = 11.4, HH = 3.4, HH2 = 3.7;
  const wallMat = underground ? MAT.stationWall : MAT.concrete;
  const lineBandMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(line.color), roughness: 0.45, metalness: 0.15,
    emissive: new THREE.Color(line.color), emissiveIntensity: 0.35
  });
  const trPrimaryCol = trColorOf(st.tr[0]);
  const trBandMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(trPrimaryCol), roughness: 0.42, metalness: 0.15,
    emissive: new THREE.Color(trPrimaryCol), emissiveIntensity: 0.42
  });

  // 1. 双向换乘长廊（z = 70..91）：地面 / 顶板 / 门洞过渡门套
  const corrLen = zM - zA, corrMid = (zA + zM) / 2;
  pbox(g, W, 0.16, corrLen, MAT.platform, 0, pt - 0.08, corrMid);
  pbox(g, W + 0.4, 0.24, corrLen, wallMat, 0, pt + HH + 0.12, corrMid);
  pbox(g, W + 0.5, 0.36, 0.45, MAT.darkMetal, 0, pt + HH - 0.08, zA + 0.2);

  // 两侧墙、不锈钢护壁、双线路色腰带与广告灯箱
  for (const side of [-1, 1]) {
    pbox(g, 0.20, HH, corrLen, wallMat, side * (W / 2), pt + HH / 2, corrMid);
    pbox(g, 0.06, 0.22, corrLen, MAT.darkMetal, side * (W / 2 - 0.10), pt + 0.11, corrMid);
    pbox(g, 0.05, 0.14, corrLen, lineBandMat, side * (W / 2 - 0.10), pt + 1.12, corrMid);
    pbox(g, 0.05, 0.12, corrLen, trBandMat, side * (W / 2 - 0.10), pt + 1.28, corrMid);
    pbox(g, 0.16, 1.04, corrLen, MAT.metal, side * (W / 2 - 0.08), pt + 0.52, corrMid);
    for (const az of [zA + 5.8, zA + 15.0]) {
      pbox(g, 0.12, 1.46, 4.56, MAT.darkMetal, side * (W / 2 - 0.11), pt + 1.98, az);
      pplane(g, 4.4, 1.3, new THREE.MeshStandardMaterial({
        map: texAd(3), roughness: 0.5, emissive: 0xffffff,
        emissiveMap: texAd(3), emissiveIntensity: 0.42
      }), side * (W / 2 - 0.18), pt + 1.98, az, side > 0 ? -PI / 2 : PI / 2);
    }
  }
  // 顶部连续嵌入式灯带与横向格栅
  for (const side of [-1, 1]) {
    pbox(g, 0.28, 0.06, corrLen - 0.8, MAT.strip, side * 1.85, pt + HH - 0.05, corrMid);
  }
  for (let z = zA + 1.5; z < zM - 0.5; z += 1.8) {
    pbox(g, W - 0.6, 0.06, 0.10, MAT.darkMetal, 0, pt + HH - 0.08, z);
  }

  // 中央双向客流分流不锈钢护栏（右侧进换乘厅、左侧出至站台）
  const railSpan = 16.0, railMid = zA + 10.5;
  pbox(g, 0.06, 0.05, railSpan, MAT.metal, 0, pt + 0.92, railMid);
  pbox(g, 0.05, 0.04, railSpan, MAT.metal, 0, pt + 0.52, railMid);
  for (let rz = zA + 2.5; rz <= zA + 18.5; rz += 2.66) {
    pbox(g, 0.07, 0.94, 0.07, MAT.darkMetal, 0, pt + 0.47, rz);
  }
  // 左右分流车道地面换乘导向色带
  for (const gz of [zA + 2.0, zA + 6.5, zA + 11.0, zA + 15.5, zA + 19.5]) {
    pbox(g, 1.15, 0.018, 0.24, trBandMat, 1.65, pt + 0.012, gz);
    pbox(g, 1.15, 0.018, 0.24, MAT.safety, -1.65, pt + 0.012, gz);
  }

  // 2. 换乘分流大厅（z = 91..103，宽 11.4m）：多线换乘门洞与导向立柱
  const hallLen = zB - zM, hallMid = (zM + zB) / 2;
  pbox(g, W2, 0.16, hallLen + 0.4, MAT.platform, 0, pt - 0.08, hallMid);
  pbox(g, W2 + 0.5, 0.26, hallLen + 0.4, wallMat, 0, pt + HH2 + 0.13, hallMid);
  // 扩宽段侧向连接肩墙（z = 91）
  const shW = (W2 - W) / 2;
  for (const side of [-1, 1]) {
    const sx = side * (W / 2 + shW / 2);
    pbox(g, shW + 0.2, HH2, 0.22, wallMat, sx, pt + HH2 / 2, zM);
    pbox(g, shW + 0.2, 1.04, 0.26, MAT.metal, sx, pt + 0.52, zM + 0.02);
    pbox(g, 0.22, HH2, hallLen, wallMat, side * (W2 / 2), pt + HH2 / 2, hallMid);
    pbox(g, 0.06, 0.16, hallLen, trBandMat, side * (W2 / 2 - 0.12), pt + 1.22, hallMid);
    pbox(g, 0.34, 0.06, hallLen - 1.2, MAT.strip, side * 3.4, pt + HH2 - 0.05, hallMid);
  }
  pbox(g, 0.34, 0.06, hallLen - 1.2, MAT.strip, 0, pt + HH2 - 0.05, hallMid);
  pbox(g, W2 + 0.4, HH2 + 0.2, 0.25, wallMat, 0, pt + HH2 / 2, zB);

  // 大厅中央四面换乘导向立柱（z = 96.6）
  const pz = 96.6;
  pbox(g, 0.92, HH2, 0.92, MAT.metal, 0, pt + HH2 / 2, pz);
  pbox(g, 0.98, 0.24, 0.98, MAT.darkMetal, 0, pt + 0.12, pz);
  pbox(g, 0.98, 0.22, 0.98, trBandMat, 0, pt + 2.35, pz);
  pbox(g, 0.98, 0.16, 0.98, lineBandMat, 0, pt + 2.12, pz);

  // 各换乘线路分流门洞（正端与左右两侧发光换乘门廊 + 阶梯延伸感）
  const trList = st.tr.slice(0, 3);
  const buildPortal = (trName, px, pz0, ry, arrow) => {
    const pCol = trColorOf(trName);
    const pMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(pCol), roughness: 0.38, metalness: 0.18,
      emissive: new THREE.Color(pCol), emissiveIntensity: 0.45
    });
    const pGrp = new THREE.Group();
    pGrp.position.set(px, pt, pz0);
    pGrp.rotation.y = ry;
    // 门廊侧框与顶梁
    pbox(pGrp, 0.24, 2.86, 0.36, pMat, -1.78, 1.43, 0);
    pbox(pGrp, 0.24, 2.86, 0.36, pMat, 1.78, 1.43, 0);
    pbox(pGrp, 3.84, 0.72, 0.38, MAT.darkMetal, 0, 2.96, 0);
    const sTex = texTransferPortalSign(trName, arrow);
    const sMat = new THREE.MeshStandardMaterial({
      map: sTex, roughness: 0.35, emissive: 0xffffff, emissiveMap: sTex, emissiveIntensity: 0.62
    });
    pplane(pGrp, 3.56, 0.66, sMat, 0, 2.96, -0.20, PI);
    // 门洞深处缓冲走道、上行台阶与暖光灯带
    pbox(pGrp, 3.32, 2.65, 0.18, new THREE.MeshBasicMaterial({ color: 0x16222c }), 0, 1.38, 1.35);
    pbox(pGrp, 3.10, 0.06, 0.28, MAT.strip, 0, 2.68, 0.65);
    for (let k = 0; k < 4; k++) {
      pbox(pGrp, 3.28, 0.14, 0.34, MAT.concrete, 0, 0.07 + k * 0.12, 0.28 + k * 0.28);
    }
    pbox(pGrp, 0.05, 0.85, 1.2, MAT.metal, 0, 0.65, 0.65);
    g.add(pGrp);
  };
  // 正面双换乘门洞（z = 102.7）
  buildPortal(trList[0], -2.6, zB - 0.32, 0, '↑');
  buildPortal(trList[1] || trList[0], 2.6, zB - 0.32, 0, '↗');
  // 两侧支通道门洞（x = ±5.5, z = 97.0）
  buildPortal(trList[0], -W2 / 2 + 0.28, 97.0, PI / 2, '←');
  buildPortal(trList[2] || trList[1] || trList[0], W2 / 2 - 0.28, 97.0, -PI / 2, '→');

  // 3. 悬挂式双面换乘指示灯箱（洞口 z=70.35、中段 z=81.0、分流厅入口 z=91.2）
  const tex = texTransferSign(st);
  const mat = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.4, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.58
  });
  for (const sz of [zA + 0.35, zA + 11.0, zM + 0.25]) {
    pbox(g, 4.76, 1.04, 0.16, MAT.darkMetal, 0, pt + 2.62, sz);
    pplane(g, 4.6, 0.92, mat, 0, pt + 2.62, sz - 0.09, PI);
    pplane(g, 4.6, 0.92, mat, 0, pt + 2.62, sz + 0.09, 0);
    pbox(g, 0.06, 0.55, 0.06, MAT.darkMetal, -2.1, pt + 3.22, sz);
    pbox(g, 0.06, 0.55, 0.06, MAT.darkMetal, 2.1, pt + 3.22, sz);
  }

  return { zA, zB };
}

/* ---------------- 高架站出入口地面亭 ---------------- */
function buildEntrancePavilion(g, st, line, pt) {
  const gy = -st.y;                  // 站台组内地面标高
  if (!(gy < -3)) return null;
  const sideX = 15.0;
  const grp = new THREE.Group();
  grp.position.set(sideX, gy, 8);
  // 基座
  pbox(grp, 6.2, 0.24, 9.4, MAT.concrete, 0, 0.12, 0);
  // 玻璃幕墙
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xbcd4dc, roughness: 0.08, metalness: 0.16, transparent: true, opacity: 0.26, envMapIntensity: 1.0
  });
  for (const sx of [-1, 1]) pbox(grp, 0.09, 3.0, 8.6, glass, sx * 2.6, 1.74, 0);
  pbox(grp, 5.2, 3.0, 0.09, glass, 0, 1.74, -4.3);
  pbox(grp, 5.2, 3.0, 0.09, glass, 0, 1.74, 4.3);
  // 角柱
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    pbox(grp, 0.16, 3.2, 0.16, MAT.metal, sx * 2.6, 1.84, sz * 4.3);
  }
  // 屋顶
  pbox(grp, 6.4, 0.22, 9.6, MAT.white, 0, 3.55, 0);
  pbox(grp, 6.6, 0.1, 9.8, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.35, 1.1), toneMapped: false }), 0, 3.42, 0);
  // 站名灯箱
  const mat = new THREE.MeshBasicMaterial({ map: texStationSign(st, line, ''), toneMapped: false });
  pplane(grp, 3.4, 1.0, mat, 0, 3.02, 4.36, PI);
  // 通道（通向车站的连廊）
  const len = sideX - 6.2;
  pbox(grp, len, 0.18, 3.6, MAT.concrete, -len / 2 - 3.1, 2.5, 0);
  for (const sz of [-1, 1]) {
    pbox(grp, len, 2.4, 0.12, glass, -len / 2 - 3.1, 3.8, sz * 1.8);
  }
  pbox(grp, len, 0.14, 3.6, MAT.metal, -len / 2 - 3.1, 5.02, 0);
  // 连廊灯光
  for (let k = 0; k < 4; k++) {
    pbox(grp, 1.4, 0.05, 0.24, MAT.strip, -4.6 - k * 2.2, 4.94, 0);
  }
  // 连接车站的楼梯柱
  pbox(grp, 3.6, 6.4, 3.4, MAT.concrete, -7.6, 6.6, 0);
  g.add(grp);
  return grp;
}

/* ---------------- 地下站地面出入口 ---------------- */
function buildUndergroundExit(g, st, line, pt, H) {
  const surface = -st.y;
  const hallY = H + 3.6;
  const depth = surface - hallY;
  if (depth < 0.6 || depth > 8) return null;
  const grp = new THREE.Group();
  grp.position.set(14, surface, 47);

  // 人行铺装与街道（中间留出楼梯井）
  pbox(grp, 13, 0.08, 3.0, MAT.sidewalk, 0, 0.04, -6.8);
  pbox(grp, 13, 0.08, 3.0, MAT.sidewalk, 0, 0.04, 12.8);
  pbox(grp, 3.5, 0.08, 16, MAT.sidewalk, -4.75, 0.04, 3);
  pbox(grp, 3.5, 0.08, 16, MAT.sidewalk, 4.75, 0.04, 3);
  pbox(grp, 6, 0.04, 42, MAT.asphalt, 8, 0.02, 0);
  for (let z = -16; z <= 16; z += 8) {
    pbox(grp, 0.12, 0.025, 3.2, MAT.safety, 8, 0.045, z);
  }
  pbox(grp, 0.1, 4.2, 0.1, MAT.darkMetal, 3.6, 2.1, 9);
  pbox(grp, 0.7, 0.08, 0.3, MAT.strip, 3.2, 4.15, 9);
  for (let z = -8; z <= 14; z += 11) {
    pbox(grp, 0.08, 0.6, 0.08, MAT.darkMetal, 4.6, 0.35, z);
  }
  // 临街建筑体量（出口周边）
  const bmat1 = MAT.bld ? MAT.bld[1] : MAT.concrete;
  const bmat2 = MAT.bld ? MAT.bld[2] : MAT.concrete;
  pbox(grp, 14, 22, 18, bmat1, 24, 11, -14);
  pbox(grp, 12, 34, 16, bmat2, 30, 17, 18);
  pbox(grp, 10, 14, 12, bmat1, 20, 7, 28);

  // 地面铺装：中间留出楼梯井
  const paving = MAT.concrete;
  pbox(grp, 6.4, 0.2, 1.4, paving, 0, 0.1, -3.8);
  pbox(grp, 6.4, 0.2, 1.4, paving, 0, 0.1, 3.8);
  pbox(grp, 1.1, 0.2, 6.4, paving, -2.65, 0.1, 0);
  pbox(grp, 1.1, 0.2, 6.4, paving, 2.65, 0.1, 0);

  // 玻璃幕墙与角柱
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xbcd4dc, roughness: 0.08, metalness: 0.16, transparent: true, opacity: 0.26, envMapIntensity: 1.0
  });
  for (const sx of [-1, 1]) pbox(grp, 0.09, 3.0, 7.0, glass, sx * 2.65, 1.65, 0);
  pbox(grp, 5.2, 3.0, 0.09, glass, 0, 1.65, -3.55);
  pbox(grp, 5.2, 3.0, 0.09, glass, 0, 1.65, 3.55);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    pbox(grp, 0.16, 3.2, 0.16, MAT.metal, sx * 2.65, 1.75, sz * 3.55);
  }
  pbox(grp, 6.0, 0.22, 7.8, MAT.white, 0, 3.5, 0);
  pbox(grp, 5.4, 0.05, 0.24, MAT.strip, 0, 3.37, 0);
  pbox(grp, 5.4, 0.05, 0.24, MAT.strip, 0, 3.37, -2.6);
  pbox(grp, 5.4, 0.05, 0.24, MAT.strip, 0, 3.37, 2.6);

  // 站名灯箱与出口牌
  const signMat = new THREE.MeshBasicMaterial({ map: texStationSign(st, line, ''), toneMapped: false });
  pplane(grp, 3.6, 1.0, signMat, 0, 3.0, 3.62, PI);
  const exitMat = new THREE.MeshBasicMaterial({ map: texExitSign(), toneMapped: false });
  pplane(grp, 1.1, 0.42, exitMat, 2.15, 2.55, 3.62, PI);

  // 下行楼梯与井壁
  const stairN = 12, run = 0.33, rise = depth / stairN;
  for (let k = 0; k < stairN; k++) {
    pbox(grp, 3.4, rise + 0.05, run + 0.05, MAT.concrete,
      0, -rise * (k + 0.5), 2.8 - k * run);
  }
  pbox(grp, 0.2, depth, 6.4, MAT.concreteDark, 1.95, -depth / 2, 0);
  pbox(grp, 4.0, depth, 0.2, MAT.concreteDark, 0, -depth / 2, -3.15);
  pbox(grp, 4.0, depth, 0.2, MAT.concreteDark, 0, -depth / 2, 3.15);

  // 井底站厅连接短廊（朝站台一侧）
  pbox(grp, 4.6, 0.14, 3.8, MAT.concrete, -2.5, -depth + 0.07, 0);
  pbox(grp, 4.6, 0.12, 0.18, MAT.concreteDark, -2.5, -depth + 2.2, -1.85);
  pbox(grp, 4.6, 0.12, 0.18, MAT.concreteDark, -2.5, -depth + 2.2, 1.85);
  for (const sz of [-1, 1]) pbox(grp, 4.6, 1.9, 0.14, glass, -2.5, -depth + 1.05, sz * 1.9);
  for (const z of [-1.2, 0, 1.2]) pbox(grp, 0.9, 0.04, 0.16, MAT.strip, -1.0, -depth + 2.35, z);

  g.add(grp);
  return grp;
}

/* ---------------- 站台 PIS 显示屏 ---------------- */
function makePisCanvas() {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 176;
  return { c, x: c.getContext('2d') };
}

function drawPis(pis, info) {
  const { x } = pis;
  const W = 640, H = 176;
  x.fillStyle = '#070c10'; x.fillRect(0, 0, W, H);
  // 顶部线路色条与深色信息栏
  x.fillStyle = info.color; x.fillRect(0, 0, W, 12);
  x.fillStyle = '#111a22'; x.fillRect(0, 12, W, 94);
  // 左侧线路徽章与开往方向
  x.fillStyle = info.color;
  x.beginPath(); x.roundRect(18, 22, 118, 38, 6); x.fill();
  x.fillStyle = '#ffffff';
  x.font = '800 24px "Microsoft YaHei",sans-serif';
  x.textAlign = 'center';
  x.fillText(info.line, 77, 49);
  x.fillStyle = '#e8f2f7';
  x.font = '700 26px "Microsoft YaHei",sans-serif';
  x.textAlign = 'left';
  x.fillText(info.dir, 148, 50);
  // 6节车厢舒适度示意条
  x.fillStyle = '#7f9aa8';
  x.font = '600 15px "Microsoft YaHei",sans-serif';
  x.fillText('车厢拥挤度', 18, 88);
  const carCols = ['#36c268', '#36c268', '#e6b832', '#e6b832', '#36c268', '#36c268'];
  for (let c = 0; c < 6; c++) {
    x.fillStyle = carCols[c];
    x.beginPath(); x.roundRect(104 + c * 42, 73, 36, 18, 3); x.fill();
    x.fillStyle = '#071014';
    x.font = '800 13px "Segoe UI",sans-serif';
    x.textAlign = 'center';
    x.fillText(String(c + 1), 122 + c * 42, 87);
  }
  // 右侧大号倒计时
  x.textAlign = 'right';
  x.fillStyle = info.soon ? '#ffcf5c' : '#65e678';
  x.font = '800 56px ui-monospace,monospace';
  x.fillText(info.eta, W - 20, 74);
  x.fillStyle = '#92aebd';
  x.font = '600 17px "Microsoft YaHei",sans-serif';
  x.fillText(info.etaLabel, W - 20, 98);
  // 底部滚动服务提示条
  x.fillStyle = '#0c141b'; x.fillRect(0, 110, W, 66);
  x.strokeStyle = 'rgba(255,255,255,0.12)'; x.lineWidth = 1;
  x.beginPath(); x.moveTo(0, 110); x.lineTo(W, 110); x.stroke();
  x.textAlign = 'left';
  x.fillStyle = '#ffd15c';
  x.font = '700 19px "Microsoft YaHei",sans-serif';
  x.fillText('● 站台提示', 18, 148);
  x.fillStyle = '#d0e2ec';
  x.font = '600 20px "Microsoft YaHei",sans-serif';
  x.fillText(info.tip, 132, 148);
  if (pis.tex) pis.tex.needsUpdate = true;
}

function buildPis(g, st, line, underground, pt) {
  const pis = makePisCanvas();
  pis.tex = toTex(pis.c);
  const mat = new THREE.MeshBasicMaterial({ map: pis.tex, toneMapped: false });
  const y = underground ? 3.42 : 2.95;
  const ceilY = underground ? 7.4 : 5.8;
  const grp = new THREE.Group();
  const bodyGeo = new THREE.BoxGeometry(2.58, 0.76, 0.14);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x161b20, roughness: 0.45, metalness: 0.4 });
  const scrGeo = new THREE.PlaneGeometry(2.40, 0.64);
  // 站台前后两处双面悬挂式 PIDS 显示屏（共享实时纹理）
  for (const pz of [-20, 32]) {
    const unit = new THREE.Group();
    unit.position.set(0, y, pz);
    unit.add(new THREE.Mesh(bodyGeo, bodyMat));
    for (const ry of [0, PI]) {
      const scr = new THREE.Mesh(scrGeo, mat);
      scr.position.set(0, 0, ry === 0 ? 0.075 : -0.075);
      scr.rotation.y = ry;
      unit.add(scr);
    }
    const rodH = ceilY - (y + 0.38);
    for (const sx of [-1, 1]) {
      pbox(unit, 0.045, rodH, 0.045, MAT.darkMetal, sx * 0.95, 0.38 + rodH / 2, 0);
    }
    grp.add(unit);
  }
  g.add(grp);
  pis.group = grp;
  drawPis(pis, {
    color: line.color, line: line.name, dir: `开往 ${st.__dest || ''}`,
    eta: '—', etaLabel: '', tip: '请先下后上，站在安全线内排队候车'
  });
  return pis;
}
