/* ================================================================
   世界构建 B：车站（站台 / 屏蔽门 / 导向 / 乘客）
   ================================================================ */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);

function pbox(parent, w, h, d, mat, x, y, z, cast = false) {
  const m = new THREE.Mesh(UNIT_BOX, mat);
  m.scale.set(w, h, d); m.position.set(x, y, z);
  m.castShadow = cast; m.receiveShadow = false;
  parent.add(m);
  return m;
}
function pplane(parent, w, h, mat, x, y, z, ry = 0, rx = 0) {
  const m = new THREE.Mesh(UNIT_PLANE, mat);
  m.scale.set(w, h, 1); m.position.set(x, y, z);
  m.rotation.set(rx, ry, 0);
  parent.add(m);
  return m;
}

function texStopBoard() {
  if (TEX_CACHE.has('stopboard')) return TEX_CACHE.get('stopboard');
  const [c, x] = cv2d(256, 256);
  x.fillStyle = '#f2f4f2'; x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#1d7a44'; x.fillRect(0, 0, 256, 62);
  x.fillStyle = '#fff'; x.font = '700 30px "Microsoft YaHei",sans-serif'; x.textAlign = 'center';
  x.fillText('停 车 标', 128, 43);
  x.strokeStyle = '#1d7a44'; x.lineWidth = 12;
  x.beginPath(); x.moveTo(128, 78); x.lineTo(128, 190); x.stroke();
  x.lineWidth = 8; x.beginPath(); x.moveTo(90, 160); x.lineTo(128, 200); x.lineTo(166, 160); x.stroke();
  x.fillStyle = '#3b4448'; x.font = '600 20px "Segoe UI",sans-serif';
  x.fillText('STOP MARK', 128, 232);
  const t = toTex(c);
  TEX_CACHE.set('stopboard', t);
  return t;
}
function texExitSign() {
  if (TEX_CACHE.has('exitsign')) return TEX_CACHE.get('exitsign');
  const [c, x] = cv2d(256, 96);
  x.fillStyle = '#0e6b3a'; x.fillRect(0, 0, 256, 96);
  x.fillStyle = '#eafff2'; x.font = '700 34px "Microsoft YaHei",sans-serif'; x.textAlign = 'center';
  x.fillText('出 口', 128, 45);
  x.font = '600 18px "Segoe UI",sans-serif'; x.fillText('EXIT', 128, 74);
  const t = toTex(c);
  TEX_CACHE.set('exitsign', t);
  return t;
}

/* ---------------- 屏蔽门 ---------------- */
class PSDGroup {
  constructor(parent, x, openings, height, opts = {}) {
    this.x = x;
    this.height = height;
    this.baseY = opts.baseY ?? 0;
    this.openings = openings;
    this.leaves = [];
    this.t = -1;
    const glass = MAT.psdGlass;
    const frameMat = MAT.darkMetal;
    const y0 = this.baseY;
    const zMin = opts.zMin ?? -70, zMax = opts.zMax ?? 70;
    const full = height > 1.6;

    // 固定玻璃板
    const segs = [];
    let cur = zMin;
    const halfOpen = 0.86;
    const sorted = openings.slice().sort((a, b) => a - b);
    for (const o of sorted) {
      const a = o - halfOpen, b = o + halfOpen;
      if (a - cur > 0.25) segs.push({ c: (cur + a) / 2, w: a - cur });
      cur = b;
    }
    if (zMax - cur > 0.25) segs.push({ c: (cur + zMax) / 2, w: zMax - cur });

    const fixed = new THREE.InstancedMesh(UNIT_BOX, glass, segs.length);
    const d = new THREE.Object3D();
    segs.forEach((sg, i) => {
      d.position.set(x, y0 + height / 2, sg.c);
      d.scale.set(0.06, height, sg.w);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      fixed.setMatrixAt(i, d.matrix);
    });
    fixed.instanceMatrix.needsUpdate = true;
    fixed.frustumCulled = false;
    parent.add(fixed);

    // 门扇（左右两片）
    const leafW = 0.84;
    const leafCount = sorted.length * 2;
    const leaves = new THREE.InstancedMesh(UNIT_BOX, glass, leafCount);
    let li = 0;
    for (const o of sorted) {
      for (const dir of [-1, 1]) {
        this.leaves.push({ z: o + dir * leafW / 2, dir });
        d.position.set(x, y0 + height / 2, o + dir * leafW / 2);
        d.scale.set(0.075, height - 0.06, leafW);
        d.updateMatrix();
        leaves.setMatrixAt(li++, d.matrix);
      }
    }
    this.leafMesh = leaves;
    leaves.instanceMatrix.needsUpdate = true;
    leaves.frustumCulled = false;
    parent.add(leaves);

    // 门扇边框
    const frames = new THREE.InstancedMesh(UNIT_BOX, frameMat, leafCount * 4);
    this.frameMesh = frames;
    frames.frustumCulled = false;
    parent.add(frames);

    // 立柱
    const posts = [];
    for (let z = zMin; z <= zMax; z += 2.5) posts.push(z);
    for (const o of sorted) { posts.push(o - halfOpen, o + halfOpen); }
    const pm = new THREE.InstancedMesh(UNIT_BOX, frameMat, posts.length);
    posts.forEach((z, i) => {
      d.position.set(x, y0 + height / 2, z);
      d.scale.set(0.14, height, 0.1);
      d.updateMatrix(); pm.setMatrixAt(i, d.matrix);
    });
    pm.instanceMatrix.needsUpdate = true; pm.frustumCulled = false;
    parent.add(pm);

    // 上下横梁
    pbox(parent, 0.18, 0.16, zMax - zMin, frameMat, x, y0 + height, (zMin + zMax) / 2);
    pbox(parent, 0.18, 0.2, zMax - zMin, frameMat, x, y0 + 0.1, (zMin + zMax) / 2);
    // 门楣：站台面以上固定板，做到顶
    if (full) {
      const headH = 1.35;
      pbox(parent, 0.16, headH, zMax - zMin, MAT.metal, x, y0 + height + headH / 2, (zMin + zMax) / 2);
      pbox(parent, 0.2, 0.07, zMax - zMin, frameMat, x, y0 + height + headH, (zMin + zMax) / 2);
      // 线路色带（共线段加第二色）
      pbox(parent, 0.02, 0.12, zMax - zMin, new THREE.MeshStandardMaterial({
        color: new THREE.Color(line.color), roughness: 0.5, metalness: 0.2,
        emissive: new THREE.Color(line.color), emissiveIntensity: 0.25
      }), x - 0.09, y0 + height + 0.42, (zMin + zMax) / 2);
      if (line.color2) {
        pbox(parent, 0.02, 0.06, zMax - zMin, new THREE.MeshStandardMaterial({
          color: new THREE.Color(line.color2), roughness: 0.5, metalness: 0.2,
          emissive: new THREE.Color(line.color2), emissiveIntensity: 0.25
        }), x - 0.09, y0 + height + 0.31, (zMin + zMax) / 2);
      }
    }
    // 状态灯带
    this.statusMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 0.16, 0.10), toneMapped: false });
    pbox(parent, 0.09, 0.05, zMax - zMin, this.statusMat, x - 0.1, y0 + height + 0.06, (zMin + zMax) / 2);

    this.d = d;
    this.setOpen(0);
  }
  setOpen(t) {
    if (Math.abs(t - this.t) < 0.0015) return;
    this.t = t;
    const d = this.d;
    const h = this.height, y0 = this.baseY;
    const openDist = 0.72 * t;
    this.leaves.forEach((leaf, i) => {
      const z = leaf.z + leaf.dir * openDist;
      d.position.set(this.x, y0 + h / 2, z);
      d.scale.set(0.075, h - 0.06, 0.84);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      this.leafMesh.setMatrixAt(i, d.matrix);
      const fr = [
        [z - 0.4, y0 + h / 2, 0.05, h - 0.04, 0.05],
        [z + 0.4, y0 + h / 2, 0.05, h - 0.04, 0.05],
        [z, y0 + h - 0.035, 0.86, 0.06, 0.06],
        [z, y0 + 0.035, 0.86, 0.06, 0.06]
      ];
      for (let k = 0; k < 4; k++) {
        const f = fr[k];
        d.position.set(this.x, f[1], f[0]);
        d.scale.set(0.09, f[3], f[4]);
        d.updateMatrix();
        this.frameMesh.setMatrixAt(i * 4 + k, d.matrix);
      }
    });
    this.leafMesh.instanceMatrix.needsUpdate = true;
    this.frameMesh.instanceMatrix.needsUpdate = true;
    const col = this.statusMat.color;
    if (t > 0.97) col.setRGB(0.28, 1.7, 0.72);
    else if (t > 0.02) col.setRGB(1.5, 0.85, 0.15);
    else col.setRGB(0.06, 0.16, 0.10);
  }
}

/* ---------------- 车站 ---------------- */
function buildStation(route, line, st, idx, theme) {
  const g = new THREE.Group();
  g.position.copy(st.frame.pos);
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(st.frame.right, st.frame.up, st.frame.tan));
  const pt = 1.06;                       // 站台面标高
  const underground = st.y < -2;
  const dirTo = idx >= route.stations.length - 1
    ? route.stations[route.stations.length - 2].zh
    : route.stations[idx + 1].zh;

  const wallMat = underground ? MAT.stationWall : MAT.concrete;
  const H = underground ? 7.4 : 5.8;
  const SIDE = 9.9;                      // 结构侧墙（轨道外侧）

  /* ---------------- 岛式站台板 ---------------- */
  pbox(g, PLAT_HALF * 2, 1.52, 140, MAT.platform, 0, pt - 0.76, 0);
  for (const side of [-1, 1]) {
    // 站台边缘立面
    pbox(g, 0.18, 1.52, 140, MAT.concreteDark, side * (PLAT_HALF - 0.05), pt - 0.76, 0);
    // 黄色安全线 + 盲道
    pbox(g, 0.62, 0.02, 138, MAT.safety, side * (PLAT_HALF - 1.05), pt + 0.012, 0);
    pbox(g, 0.1, 0.02, 138, MAT.safety, side * (PLAT_HALF - 0.42), pt + 0.012, 0);
    // 站台边缘灯带
    pbox(g, 0.05, 0.05, 138, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 2.4, 2.0), toneMapped: false }),
      side * (PLAT_HALF - 0.16), pt - 0.1, 0);
  }

  /* ---------------- 两侧轨道区 ---------------- */
  for (const side of [-1, 1]) {
    pbox(g, 3.7, 0.3, 148, MAT.concreteDark, side * TRACK_LAT, -0.45, 0);
  }

  if (underground) {
    /* 侧墙 / 顶板 */
    for (const side of [-1, 1]) {
      pplane(g, 148, H + 1.2, wallMat, side * SIDE, (H - 1.2) / 2 + 0.5, 0, side > 0 ? -PI / 2 : PI / 2);
      pbox(g, 0.06, 0.34, 148, new THREE.MeshStandardMaterial({
        color: new THREE.Color(line.color), roughness: 0.5, metalness: 0.1,
        emissive: new THREE.Color(line.color), emissiveIntensity: 0.35
      }), side * (SIDE - 0.06), 3.1, 0);
      pbox(g, 0.06, 0.06, 148, MAT.darkMetal, side * (SIDE - 0.06), 2.88, 0);
    }
    // 顶板分三段，在两个楼扶梯位置开洞通向站厅
    const HOLE = [[-53, -41], [41, 53]];
    const segs = [[-74, HOLE[0][0]], [HOLE[0][1], HOLE[1][0]], [HOLE[1][1], 74]];
    for (const [a, b] of segs) {
      pbox(g, SIDE * 2 + 0.4, 0.36, b - a, MAT.concreteDark, 0, H + 0.18, (a + b) / 2);
    }
    // 站厅层（洞口上方的一层，用暖光暗示）
    for (const [a, b] of HOLE) {
      pbox(g, SIDE * 2 + 0.4, 0.14, b - a, new THREE.MeshStandardMaterial({ color: 0x9aa2a4, roughness: 0.9 }), 0, H + 3.6, (a + b) / 2);
      pbox(g, SIDE * 2 + 0.4, 0.05, b - a, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.42, 1.2), toneMapped: false }), 0, H + 3.5, (a + b) / 2);
      // 洞口四周挡墙（防止看穿）
      for (const zz of [a, b]) {
        pbox(g, SIDE * 2 + 0.4, 3.5, 0.2, MAT.concreteDark, 0, H + 1.9, zz);
      }
      for (const side of [-1, 1]) {
        pbox(g, 0.2, 3.5, b - a, MAT.concreteDark, side * (SIDE + 0.1), H + 1.9, (a + b) / 2);
      }
      // 闸机（站厅层，从洞口能看到一排）
      for (let k = 0; k < 4; k++) {
        pbox(g, 0.34, 1.0, 0.62, new THREE.MeshStandardMaterial({ color: 0xc8cdcd, roughness: 0.5, metalness: 0.4 }),
          -2.4 + k * 1.6, H + 0.57, (a + b) / 2);
      }
      // 客服中心
      pbox(g, 2.2, 1.2, 1.6, new THREE.MeshStandardMaterial({ color: 0x8fa3ad, roughness: 0.6, metalness: 0.2 }),
        2.6, H + 0.6, (a + b) / 2 + 2.4);
    }
    // 端墙（两条轨道各一个洞口）
    for (const dir of [-1, 1]) {
      pbox(g, SIDE - TRACK_LAT - 1.4, H + 1.4, 0.6, wallMat,
        -(TRACK_LAT + (SIDE - TRACK_LAT) / 2 + 0.7) / 1, (H - 1.4) / 2 + 0.2, dir * 74);
      pbox(g, SIDE - TRACK_LAT - 1.4, H + 1.4, 0.6, wallMat,
        (TRACK_LAT + (SIDE - TRACK_LAT) / 2 + 0.7), (H - 1.4) / 2 + 0.2, dir * 74);
      pbox(g, SIDE * 2 + 0.4, 2.0, 0.6, wallMat, 0, H - 1.0, dir * 74);
      // 洞口轮廓
      for (const side of [-1, 1]) {
        pbox(g, 0.5, 6.6, 0.7, MAT.concreteDark, side * (TRACK_LAT + 2.1), 3.0, dir * 74);
        pbox(g, 0.5, 6.6, 0.7, MAT.concreteDark, side * (TRACK_LAT - 2.1), 3.0, dir * 74);
        pbox(g, 4.7, 0.5, 0.7, MAT.concreteDark, side * TRACK_LAT, 5.7, dir * 74);
      }
    }
    /* 站台立柱：岛式站台中央一排 */
    const colCount = 13;
    const cols = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.46, H - pt, 14), MAT.white, colCount);
    const d = new THREE.Object3D();
    for (let i = 0; i < colCount; i++) {
      const z = -60 + i * 10;
      d.position.set(0, (H + pt) / 2 - 0.1, z);
      d.updateMatrix(); cols.setMatrixAt(i, d.matrix);
    }
    cols.instanceMatrix.needsUpdate = true; cols.frustumCulled = false;
    g.add(cols);
    /* 顶部灯带（站台正上方两条） */
    const lightN = 46;
    const lights = new THREE.InstancedMesh(UNIT_BOX, MAT.strip, lightN * 2);
    let li2 = 0;
    for (let i = 0; i < lightN; i++) {
      const z = -69 + i * 3;
      for (const side of [-1, 1]) {
        d.position.set(side * 2.3, H - 0.15, z);
        d.scale.set(0.34, 0.09, 2.4);
        d.updateMatrix(); lights.setMatrixAt(li2++, d.matrix);
      }
    }
    lights.instanceMatrix.needsUpdate = true; lights.frustumCulled = false;
    g.add(lights);
  } else {
    /* 高架：雨棚覆盖岛式站台 + 两侧轨道 */
    const roofW = 20.0;
    pbox(g, roofW, 0.26, 148, MAT.white, 0, H, 0, true);
    const fasciaMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(line.color).multiplyScalar(0.55), roughness: 0.55, metalness: 0.25,
      emissive: new THREE.Color(line.color), emissiveIntensity: 0.05
    });
    pbox(g, roofW + 0.4, 0.52, 0.36, fasciaMat, 0, H + 0.3, 74);
    pbox(g, roofW + 0.4, 0.52, 0.36, fasciaMat, 0, H + 0.3, -74);
    pbox(g, 0.36, 0.52, 148, fasciaMat, -roofW / 2, H + 0.3, 0);
    pbox(g, 0.36, 0.52, 148, fasciaMat, roofW / 2, H + 0.3, 0);
    pbox(g, roofW, 0.1, 148, MAT.metal, 0, H - 0.2, 0);
    // 雨棚柱：站台中央一排
    const colN = 13;
    const cols = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.32, H - pt, 10), MAT.metal, colN);
    const d = new THREE.Object3D();
    for (let i = 0; i < colN; i++) {
      d.position.set(0, (H + pt) / 2, -60 + i * 10);
      d.updateMatrix(); cols.setMatrixAt(i, d.matrix);
    }
    cols.instanceMatrix.needsUpdate = true; cols.frustumCulled = false;
    g.add(cols);
    // 顶棚灯
    const lights = new THREE.InstancedMesh(UNIT_BOX, MAT.stripCool, 30);
    for (let i = 0; i < 30; i++) {
      d.position.set(0, H - 0.28, -69 + i * 4.7);
      d.scale.set(6.4, 0.08, 0.5);
      d.updateMatrix(); lights.setMatrixAt(i, d.matrix);
    }
    lights.instanceMatrix.needsUpdate = true; lights.frustumCulled = false;
    g.add(lights);
  }

  /* ---------------- 屏蔽门：两侧站台边缘 ---------------- */
  const doors = [];
  for (let car = 0; car < 6; car++) {
    for (const off of doorOffsetsOf(line)) {
      doors.push(PLATFORM_HALF - 11.4 - car * CAR_PITCH + off);
    }
  }
  const psdH = underground ? 2.0 : 1.15;
  const psdL = new PSDGroup(g, -PSD_X, doors, psdH, { baseY: pt });
  const psdR = new PSDGroup(g, PSD_X, doors, psdH, { baseY: pt });

  /* ---------------- 站名牌 / 导向 / 广告 ---------------- */
  const signMat = new THREE.MeshStandardMaterial({
    map: texStationSign(st, line, dirTo), roughness: 0.55, metalness: 0.05,
    emissive: 0xffffff, emissiveMap: texStationSign(st, line, dirTo), emissiveIntensity: 0.28
  });
  const diagMat = new THREE.MeshStandardMaterial({
    map: texLineDiagram(line, idx), roughness: 0.6, metalness: 0.05,
    emissive: 0xffffff, emissiveMap: texLineDiagram(line, idx), emissiveIntensity: 0.22
  });

  // 吊挂站名牌（站台正上方，双面）
  for (const z of [-52, -14, 24, 60]) {
    for (const ry of [0, PI]) {
      pplane(g, 4.0, 1.0, signMat, 0, underground ? 4.75 : 3.6, z, ry);
    }
    pbox(g, 0.05, 0.55, 0.05, MAT.darkMetal, -1.35, (underground ? 4.75 : 3.6) + 0.78, z);
    pbox(g, 0.05, 0.55, 0.05, MAT.darkMetal, 1.35, (underground ? 4.75 : 3.6) + 0.78, z);
    pbox(g, 2.9, 0.06, 0.06, MAT.darkMetal, 0, (underground ? 4.75 : 3.6) + 1.02, z);
  }
  // 线路图（吊挂，双面）
  pplane(g, 5.4, 0.85, diagMat, 0, underground ? 3.85 : 2.95, 4, 0);
  pplane(g, 5.4, 0.85, diagMat, 0, underground ? 3.85 : 2.95, 4, PI);
  // 侧墙广告（乘客在站台上可见）
  for (const side of [-1, 1]) {
    for (const z of [-62, -30, 30, 62]) {
      const ad = new THREE.MeshStandardMaterial({
        map: texAd((idx + Math.abs(z)) % 4), roughness: 0.6,
        emissive: 0xffffff, emissiveMap: texAd((idx + Math.abs(z)) % 4), emissiveIntensity: 0.62
      });
      pplane(g, 4.2, 2.1, ad, side * (SIDE - 0.08), 3.0, z, side > 0 ? -PI / 2 : PI / 2);
    }
  }
  // 高架站：雨棚檐口站名
  if (!underground) {
    for (const z of [-52, 0, 52]) {
      pplane(g, 7.2, 1.8, signMat, 0, H + 0.52, z, 0);
      pplane(g, 7.2, 1.8, signMat, 0, H + 0.52, z, PI);
    }
  }
  // 出口牌
  const exitMat = new THREE.MeshStandardMaterial({
    map: texExitSign(), roughness: 0.5, emissive: 0xffffff, emissiveMap: texExitSign(), emissiveIntensity: 0.9
  });
  for (const side of [-1, 1]) {
    for (const z of [-18, 20]) {
      pplane(g, 1.5, 0.56, exitMat, side * (SIDE - 0.08), 2.9, z, side > 0 ? -PI / 2 : PI / 2);
    }
  }

  /* ---------------- 楼扶梯：站台两端向上通往站厅 ---------------- */
  const escMetal = new THREE.MeshStandardMaterial({ color: 0x9aa6ab, roughness: 0.32, metalness: 0.72 });
  const stepMat = new THREE.MeshStandardMaterial({ color: 0xb6bcbd, roughness: 0.72, metalness: 0.12 });
  for (const dir of [-1, 1]) {
    const z0 = dir * 47;
    const steps = 14, rise = (H - pt) / steps, run = 0.78;
    for (let k = 0; k < steps; k++) {
      pbox(g, 2.7, rise + 0.06, run + 0.04, stepMat,
        0, pt + rise * (k + 0.5), z0 - dir * (steps / 2) * run + dir * (k + 0.5) * run);
    }
    // 两侧斜梁
    for (const side of [-1, 1]) {
      const beam = pbox(g, 0.14, 0.34, steps * run + 0.6, escMetal, side * 1.45, pt + (H - pt) / 2, z0);
      beam.rotation.x = dir * Math.atan2(H - pt, steps * run);
      // 扶手
      const rail = pbox(g, 0.08, 0.1, steps * run + 0.5, escMetal, side * 1.45, pt + (H - pt) / 2 + 1.0, z0);
      rail.rotation.x = dir * Math.atan2(H - pt, steps * run);
      for (let k = 0; k <= 5; k++) {
        const t = k / 5;
        pbox(g, 0.055, 1.0, 0.055, escMetal, side * 1.45,
          pt + (H - pt) * t + 0.5, z0 + dir * (steps * run) * (0.5 - t));
      }
    }
  }
  // 无障碍电梯
  pbox(g, 1.9, 3.0, 2.2, new THREE.MeshStandardMaterial({ color: 0xa8b2b5, roughness: 0.35, metalness: 0.6 }), 0, pt + 1.5, 40);

  /* ---------------- 座椅 / 垃圾桶 ---------------- */
  for (const side of [-1, 1]) {
    for (const z of [-32, 16, 56]) {
      pbox(g, 0.5, 0.08, 3.0, MAT.metal, side * 3.1, pt + 0.46, z);
      pbox(g, 0.12, 0.46, 3.0, MAT.metal, side * 3.32, pt + 0.24, z);
      pbox(g, 0.5, 0.6, 0.5, MAT.darkMetal, side * 3.1, pt + 0.3, z - 1.8);
    }
    pbox(g, 0.6, 0.8, 0.6, MAT.darkMetal, side * 1.2, pt + 0.4, -58);
  }

  /* ---------------- 停车标（两侧各一） ---------------- */
  const sbMat = new THREE.MeshStandardMaterial({
    map: texStopBoard(), roughness: 0.6, emissive: 0xffffff,
    emissiveMap: texStopBoard(), emissiveIntensity: 0.25, side: THREE.DoubleSide
  });
  for (const side of [-1, 1]) {
    pplane(g, 0.7, 0.7, sbMat, side * 3.5, pt + 1.5, 70);
    pbox(g, 0.06, 1.5, 0.06, MAT.darkMetal, side * 3.5, pt + 0.75, 70);
  }

  /* ---------------- 站台端部护栏（换乘端留出通道口） ---------------- */
  const trGap = (st.tr && st.tr.length) ? 3.4 : 0;
  for (const dir of [-1, 1]) {
    const gap = dir > 0 ? trGap : 0;
    if (gap) {
      for (const side of [-1, 1]) {
        const w = PLAT_HALF - gap;
        const cx = side * (gap + w / 2);
        pbox(g, w, 0.08, 0.08, MAT.safety, cx, pt + 1.05, dir * 70.2);
        pbox(g, w, 0.08, 0.08, MAT.safety, cx, pt + 0.55, dir * 70.2);
        for (let i = 0; i < 2; i++) {
          pbox(g, 0.07, 1.1, 0.07, MAT.darkMetal, side * (gap + 0.3 + i * (w - 0.6)), pt + 0.55, dir * 70.2);
        }
      }
    } else {
      pbox(g, PLAT_HALF * 2 - 0.4, 0.08, 0.08, MAT.safety, 0, pt + 1.05, dir * 70.2);
      pbox(g, PLAT_HALF * 2 - 0.4, 0.08, 0.08, MAT.safety, 0, pt + 0.55, dir * 70.2);
      for (let i = 0; i < 5; i++) {
        pbox(g, 0.07, 1.1, 0.07, MAT.darkMetal, -3.4 + i * 1.7, pt + 0.55, dir * 70.2);
      }
    }
  }

  /* ---------------- 换乘通道 / 出入口 / PIS ---------------- */
  const trPass = buildTransferPassage(g, st, line, underground, pt, H);
  const pavilion = underground
    ? buildUndergroundExit(g, st, line, pt, H)
    : buildEntrancePavilion(g, st, line, pt);
  st.__dest = dirTo;
  const pis = buildPis(g, st, line, underground, pt);

  /* ---------------- 站端道岔与转辙机 ---------------- */
  const pointMat = new THREE.MeshStandardMaterial({ color: 0x8e9598, roughness: 0.42, metalness: 0.72 });
  const machineMat = new THREE.MeshStandardMaterial({ color: 0x2a2f33, roughness: 0.7, metalness: 0.3 });
  for (const dir of [-1, 1]) {
    // 渡线：两条正线之间的斜向连接轨
    for (const side of [-1, 1]) {
      const link = pbox(g, 0.12, 0.14, 13.5, pointMat, 0, -0.02, dir * (71 + 3));
      link.position.x = 0;
      link.rotation.z = 0;
      // 斜置
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 14.4), pointMat);
      a.position.set(0, -0.02, dir * 72);
      a.rotation.y = side * 0.42;
      g.add(a);
    }
    // 转辙机
    for (const side of [-1, 1]) {
      pbox(g, 0.62, 0.42, 0.9, machineMat, side * (TRACK_LAT + 0.95), pt - 0.5, dir * 66);
      pbox(g, 0.1, 0.1, 1.6, pointMat, side * (TRACK_LAT + 0.95), pt - 0.32, dir * 66);
    }
  }

  /* 候车乘客 */
  const crowd = new StationCrowd(g, st, underground, pt, doors);
  mergeStationBoxes(g);
  return { group: g, psdL, psdR, stopZ: 70, crowd, s: st.s, pis, trPass, pavilion };
}

/* 合并车站内的盒状构件，显著降低 draw call */
function mergeStationBoxes(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  const remove = [];
  group.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh) return;
    if (o.geometry !== UNIT_BOX) return;
    if (!o.material || o.material.transparent) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const g2 = UNIT_BOX.clone();
    g2.applyMatrix4(m);
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(g2);
    remove.push(o);
  });
  remove.forEach(o => o.parent && o.parent.remove(o));
  buckets.forEach((geos, mat) => {
    let merged;
    try { merged = BufferGeometryUtils.mergeGeometries(geos, false); } catch (e) { merged = null; }
    if (merged) {
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      geos.forEach(g2 => g2.dispose());
    } else {
      geos.forEach(g2 => {
        const mesh = new THREE.Mesh(g2, mat);
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
      });
    }
  });
}
