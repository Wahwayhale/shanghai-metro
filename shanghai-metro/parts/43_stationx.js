/* ================================================================
   车站附加设施：换乘通道、出入口地面亭、站台 PIS 显示屏
   ================================================================ */

/* ---------------- 换乘通道：站台端部通向另一条线 ---------------- */
function buildTransferPassage(g, st, line, underground, pt, H) {
  if (!st.tr || !st.tr.length) return null;
  const zA = 71, zB = 96;            // 通道范围
  const W = 6.4, HH = 3.3;
  const wallMat = underground ? MAT.stationWall : MAT.concrete;

  // 地面 / 顶板
  pbox(g, W, 0.14, zB - zA, MAT.platform, 0, pt - 0.07, (zA + zB) / 2);
  pbox(g, W, 0.16, zB - zA, wallMat, 0, pt + HH + 0.08, (zA + zB) / 2);
  // 两侧墙
  for (const side of [-1, 1]) {
    pbox(g, 0.18, HH, zB - zA, wallMat, side * (W / 2), pt + HH / 2, (zA + zB) / 2);
    // 墙面灯箱
    pplane(g, 4.4, 1.3, new THREE.MeshStandardMaterial({
      map: texAd(3), roughness: 0.6, emissive: 0xffffff,
      emissiveMap: texAd(3), emissiveIntensity: 0.34
    }), side * (W / 2 - 0.1), pt + 1.85, (zA + zB) / 2, side > 0 ? -PI / 2 : PI / 2);
  }
  // 顶部灯带
  for (const side of [-1, 1]) {
    pbox(g, 0.22, 0.06, zB - zA - 2, MAT.strip, side * 1.7, pt + HH - 0.05, (zA + zB) / 2);
  }
  // 尽端：转弯的暗示（深色开口 + 一道亮面）
  pbox(g, W, HH, 0.2, wallMat, 0, pt + HH / 2, zB);
  pbox(g, 2.4, 2.3, 0.3, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.10, 0.14, 0.16) }),
    -1.1, pt + 1.16, zB - 0.12);
  pbox(g, 0.9, 2.3, 0.3, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.5, 0.38) }),
    1.3, pt + 1.16, zB - 0.12);

  // 洞口上方的换乘指示牌
  const tex = texTransferSign(st);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });
  pplane(g, 4.6, 0.92, mat, 0, pt + 2.55, zA + 0.4, PI);
  pbox(g, 4.8, 0.06, 0.06, MAT.darkMetal, 0, pt + 3.06, zA + 0.4);
  // 指示牌两侧吊杆
  pbox(g, 0.05, 0.5, 0.05, MAT.darkMetal, -2.2, pt + 3.3, zA + 0.4);
  pbox(g, 0.05, 0.5, 0.05, MAT.darkMetal, 2.2, pt + 3.3, zA + 0.4);

  // 地面导向箭头
  pbox(g, 1.5, 0.02, 0.16, MAT.safety, 0, pt + 0.012, zA + 1.2);
  pbox(g, 1.5, 0.02, 0.16, MAT.safety, 0, pt + 0.012, zA + 5.0);

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
  x.fillStyle = '#05090c'; x.fillRect(0, 0, W, H);
  // 顶部线路色条
  x.fillStyle = info.color; x.fillRect(0, 0, W, 10);
  x.fillStyle = '#e8f2f7';
  x.font = '700 30px "Microsoft YaHei",sans-serif';
  x.textAlign = 'left';
  x.fillText(info.line, 20, 52);
  x.fillStyle = '#8fa8b6';
  x.font = '500 22px "Microsoft YaHei",sans-serif';
  x.fillText(info.dir, 20, 84);
  // 右侧大号倒计时
  x.textAlign = 'right';
  x.fillStyle = info.soon ? '#ffcf5c' : '#8ee06a';
  x.font = '800 62px ui-monospace,monospace';
  x.fillText(info.eta, W - 22, 96);
  x.fillStyle = '#7f9aa8';
  x.font = '500 18px "Microsoft YaHei",sans-serif';
  x.fillText(info.etaLabel, W - 22, 126);
  // 底部滚动条
  x.fillStyle = 'rgba(255,255,255,.05)'; x.fillRect(0, 140, W, 36);
  x.textAlign = 'left';
  x.fillStyle = '#9fb6c2';
  x.font = '500 19px "Microsoft YaHei",sans-serif';
  x.fillText(info.tip, 20, 165);
  if (pis.tex) pis.tex.needsUpdate = true;
}

function buildPis(g, st, line, underground, pt) {
  const pis = makePisCanvas();
  pis.tex = toTex(pis.c);
  const mat = new THREE.MeshBasicMaterial({ map: pis.tex, toneMapped: false });
  const y = underground ? 3.35 : 2.9;
  const grp = new THREE.Group();
  grp.position.set(0, y, 34);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.7, 0.1), new THREE.MeshStandardMaterial({ color: 0x14191c, roughness: 0.6 }));
  grp.add(body);
  for (const ry of [0, PI]) {
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(2.34, 0.62), mat);
    scr.position.set(0, 0, ry === 0 ? 0.055 : -0.055);
    scr.rotation.y = ry;
    grp.add(scr);
  }
  for (const sx of [-1, 1]) {
    pbox(grp, 0.04, 0.5, 0.04, MAT.darkMetal, sx * 0.9, 0.55, 0);
  }
  pbox(grp, 2.0, 0.05, 0.05, MAT.darkMetal, 0, 0.78, 0);
  g.add(grp);
  pis.group = grp;
  drawPis(pis, {
    color: line.color, line: line.name, dir: `开往 ${st.__dest || ''}`,
    eta: '—', etaLabel: '', tip: '请站在安全线内候车'
  });
  return pis;
}
