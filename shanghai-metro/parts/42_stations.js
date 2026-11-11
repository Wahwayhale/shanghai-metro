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
    const inward = x > 0 ? -1 : 1;
    const stLine = opts.line || (typeof line !== 'undefined' ? line : { id: '1', name: '1号线', color: '#E4002B' });
    const stObj = opts.station || null;
    const dirTo = opts.dirTo || '';
    const ceilY = opts.ceilY || (y0 + height + 1.35);
    const headH0 = opts.headH ?? 1.28;

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
    const waistMat = new THREE.MeshStandardMaterial({
      color: 0xe2b024, roughness: 0.42, metalness: 0.18,
      emissive: 0x3b2a04, emissiveIntensity: 0.35
    });
    const fixedWaist = new THREE.InstancedMesh(UNIT_BOX, waistMat, segs.length);
    const waistY = y0 + Math.min(1.02, height * 0.58);
    const d = new THREE.Object3D();
    segs.forEach((sg, i) => {
      d.position.set(x, y0 + height / 2, sg.c);
      d.scale.set(0.06, height - 0.08, sg.w);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      fixed.setMatrixAt(i, d.matrix);

      d.position.set(x, waistY, sg.c);
      d.scale.set(0.072, 0.045, sg.w - 0.04);
      d.updateMatrix();
      fixedWaist.setMatrixAt(i, d.matrix);
    });
    fixed.instanceMatrix.needsUpdate = true;
    fixed.frustumCulled = false;
    fixedWaist.instanceMatrix.needsUpdate = true;
    fixedWaist.frustumCulled = false;
    parent.add(fixed, fixedWaist);

    // 门扇（左右两片）：使用更不透明的淡青色玻璃 + 浅色粗边框，关门时一眼可见门体，
    // 开门时门扇滑到固定玻璃站台侧，露出明显的黑色门洞
    this.inward = inward;
    this.leafX = x + inward * 0.085;
    const leafW = 0.84;
    const leafCount = sorted.length * 2;
    if (!PSDGroup._leafGlass) {
      /* 门扇玻璃：关门时给到 0.62 的不透明度（一眼能看出「这里有两片门」），
         开门过程中 lerp 到 0.16，让门洞彻底透亮 —— 开/关状态靠本体就能分辨，
         不必只依赖灯色。 */
      PSDGroup._leafGlass = new THREE.MeshStandardMaterial({
        color: 0xa9cfdd, roughness: 0.2, metalness: 0.18, transparent: true, opacity: 0.62,
        envMapIntensity: 1.3, side: THREE.DoubleSide, depthWrite: false,
        emissive: 0x1d3f53, emissiveIntensity: 0.12
      });
      PSDGroup._leafGlassBase = { opacity: 0.62, color: new THREE.Color(0xa9cfdd) };
      PSDGroup._leafGlassOpen = { opacity: 0.16, color: new THREE.Color(0xdfeef3) };
      PSDGroup._leafFrame = new THREE.MeshStandardMaterial({
        color: 0xe4e9eb, roughness: 0.38, metalness: 0.45,
        emissive: 0x4a5558, emissiveIntensity: 0.5
      });
    }
    const leaves = new THREE.InstancedMesh(UNIT_BOX, PSDGroup._leafGlass, leafCount);
    let li = 0;
    for (const o of sorted) {
      for (const dir of [-1, 1]) {
        this.leaves.push({ z: o + dir * leafW / 2, dir });
        d.position.set(this.leafX, y0 + height / 2, o + dir * leafW / 2);
        d.scale.set(0.075, height - 0.06, leafW);
        d.updateMatrix();
        leaves.setMatrixAt(li++, d.matrix);
      }
    }
    this.leafMesh = leaves;
    leaves.instanceMatrix.needsUpdate = true;
    leaves.frustumCulled = false;
    parent.add(leaves);

    // 门扇边框（4 边 + 1 条防撞腰线）
    const frames = new THREE.InstancedMesh(UNIT_BOX, PSDGroup._leafFrame, leafCount * 5);
    this.frameMesh = frames;
    frames.frustumCulled = false;
    parent.add(frames);

    // 立柱与站台侧不锈钢护板
    const posts = [];
    for (let z = zMin; z <= zMax; z += 2.5) posts.push(z);
    for (const o of sorted) { posts.push(o - halfOpen, o + halfOpen); }
    const pm = new THREE.InstancedMesh(UNIT_BOX, frameMat, posts.length);
    const pmTrim = new THREE.InstancedMesh(UNIT_BOX, MAT.metal, posts.length);
    posts.forEach((z, i) => {
      d.position.set(x, y0 + height / 2, z);
      d.scale.set(0.15, height, 0.11);
      d.updateMatrix(); pm.setMatrixAt(i, d.matrix);

      d.position.set(x + inward * 0.065, y0 + height / 2, z);
      d.scale.set(0.035, height - 0.04, 0.08);
      d.updateMatrix(); pmTrim.setMatrixAt(i, d.matrix);
    });
    pm.instanceMatrix.needsUpdate = true; pm.frustumCulled = false;
    pmTrim.instanceMatrix.needsUpdate = true; pmTrim.frustumCulled = false;
    parent.add(pm, pmTrim);

    // 上下横梁与不锈钢门槛踏步条
    pbox(parent, 0.22, 0.18, zMax - zMin, frameMat, x, y0 + height + 0.04, (zMin + zMax) / 2);
    pbox(parent, 0.18, 0.16, zMax - zMin, frameMat, x, y0 + 0.08, (zMin + zMax) / 2);
    pbox(parent, 0.22, 0.04, zMax - zMin, MAT.metal, x, y0 + 0.02, (zMin + zMax) / 2);
    if (!full) {
      // 半高安全门顶部圆润扶手盖板
      pbox(parent, 0.25, 0.06, zMax - zMin, MAT.metal, x, y0 + height + 0.14, (zMin + zMax) / 2);
    }

    // 门楣：地下全高屏蔽门与顶棚无缝衔接
    if (full) {
      const headH = opts.headH ?? 1.28;
      pbox(parent, 0.18, headH, zMax - zMin, MAT.white, x, y0 + height + headH / 2, (zMin + zMax) / 2);
      pbox(parent, 0.22, 0.08, zMax - zMin, frameMat, x, y0 + height + headH, (zMin + zMax) / 2);
      // 线路色带（面向站台内侧）
      pbox(parent, 0.02, 0.13, zMax - zMin, new THREE.MeshStandardMaterial({
        color: new THREE.Color(stLine.color), roughness: 0.45, metalness: 0.15,
        emissive: new THREE.Color(stLine.color), emissiveIntensity: 0.35
      }), x + inward * 0.095, y0 + height + (headH < 0.8 ? 0.2 : 0.34), (zMin + zMax) / 2);
      if (stLine.color2 && headH >= 0.8) {
        pbox(parent, 0.02, 0.06, zMax - zMin, new THREE.MeshStandardMaterial({
          color: new THREE.Color(stLine.color2), roughness: 0.45, metalness: 0.15,
          emissive: new THREE.Color(stLine.color2), emissiveIntensity: 0.35
        }), x + inward * 0.095, y0 + height + 0.23, (zMin + zMax) / 2);
      }
      // 门楣上方防火挡烟垂壁与暗色钢梁（一直延伸到车站顶板，消除悬空断层）
      const topBase = y0 + height + headH;
      const topH = ceilY - topBase;
      if (topH > 0.2) {
        pbox(parent, 0.14, topH, zMax - zMin, MAT.concreteDark, x - inward * 0.02, topBase + topH / 2, (zMin + zMax) / 2);
        pbox(parent, 0.22, 0.14, zMax - zMin, frameMat, x, ceilY - 0.07, (zMin + zMax) / 2);
        for (let z = -66; z <= 66; z += 6) {
          pbox(parent, 0.20, topH, 0.14, frameMat, x, topBase + topH / 2, z);
        }
      }
      // 门楣导向盖板灯箱（站名 + 下一站 + 安全提示）
      if (stObj && headH >= 0.8) {
        const capTex = texPsdDoorCap(stLine, stObj, dirTo);
        const capMat = new THREE.MeshStandardMaterial({
          map: capTex, roughness: 0.45, metalness: 0.05,
          emissive: 0xffffff, emissiveMap: capTex, emissiveIntensity: 0.32
        });
        const capRy = inward > 0 ? PI / 2 : -PI / 2;
        for (let i = 0; i < sorted.length; i += 2) {
          pplane(parent, 1.72, 0.34, capMat, x + inward * 0.098, y0 + height + 0.78, sorted[i], capRy);
        }
      }
    }

    // 门顶状态灯：每扇门正上方一条大号灯带（两侧都能看到）
    //   关门 = 红色常亮，开/关门过程 = 琥珀色，门全开 = 绿色
    this.statusMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.08, 0.06), toneMapped: false });
    /* 每扇门 3 条指示：门顶一条大灯带（远看）+ 门洞两侧各一根竖条（站台侧齐眼高，
       走近、坐在车厢里都能看清开门还是关门）。全部共用一个材质，改色即可整站同步。 */
    const lampMesh = new THREE.InstancedMesh(UNIT_BOX, this.statusMat, sorted.length * 3);
    const lampY = y0 + height + (full ? (headH0 < 0.8 ? headH0 + 0.07 : 0.2) : 0.1);
    const jambY = y0 + 1.52, jambH = 1.5, jambZ = halfOpen + 0.16;
    sorted.forEach((o, i) => {
      d.position.set(x, lampY, o);
      d.scale.set(0.28, 0.16, 1.9);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      lampMesh.setMatrixAt(i * 3, d.matrix);
      for (let k = 0; k < 2; k++) {
        d.position.set(x + inward * 0.135, jambY, o + (k ? jambZ : -jambZ));
        d.scale.set(0.075, jambH, 0.14);
        d.updateMatrix();
        lampMesh.setMatrixAt(i * 3 + 1 + k, d.matrix);
      }
    });
    lampMesh.instanceMatrix.needsUpdate = true;
    lampMesh.frustumCulled = false;
    parent.add(lampMesh);

    this.d = d;
    this.setOpen(0);
  }
  setOpen(t) {
    if (Math.abs(t - this.t) < 0.0015) return;
    this.t = t;
    const d = this.d;
    const h = this.height, y0 = this.baseY;
    const waistY = y0 + Math.min(1.02, h * 0.58);
    const openDist = 0.72 * t;
    this.leaves.forEach((leaf, i) => {
      const z = leaf.z + leaf.dir * openDist;
      d.position.set(this.leafX, y0 + h / 2, z);
      d.scale.set(0.075, h - 0.06, 0.84);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      this.leafMesh.setMatrixAt(i, d.matrix);
      const fr = [
        [z - 0.4, y0 + h / 2, 0.07, h - 0.04, 0.07],
        [z + 0.4, y0 + h / 2, 0.07, h - 0.04, 0.07],
        [z, y0 + h - 0.045, 0.86, 0.09, 0.09],
        [z, y0 + 0.045, 0.86, 0.09, 0.09],
        [z, waistY, 0.82, 0.05, 0.80]
      ];
      for (let k = 0; k < 5; k++) {
        const f = fr[k];
        d.position.set(this.leafX, f[1], f[0]);
        d.scale.set(0.11, f[3], f[4]);
        d.updateMatrix();
        this.frameMesh.setMatrixAt(i * 5 + k, d.matrix);
      }
    });
    this.leafMesh.instanceMatrix.needsUpdate = true;
    this.frameMesh.instanceMatrix.needsUpdate = true;
    /* 门扇本身也随状态变化：关门不透明度 0.62（看得见门体），全开 0.16（门洞透亮） */
    const lm = PSDGroup._leafGlass;
    if (lm) {
      const k = t * t * (3 - 2 * t);
      lm.opacity = PSDGroup._leafGlassBase.opacity * (1 - k) + PSDGroup._leafGlassOpen.opacity * k;
      lm.color.copy(PSDGroup._leafGlassBase.color).lerp(PSDGroup._leafGlassOpen.color, k);
    }
    /* 门顶灯带 + 门柱竖条同步变色：关=红 / 动作中=琥珀 / 全开=绿 */
    const col = this.statusMat.color;
    if (t > 0.97) col.setRGB(0.16, 1.15, 0.42);
    else if (t > 0.02) col.setRGB(1.25, 0.72, 0.05);
    else col.setRGB(1.30, 0.06, 0.04);
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
    // 站台边缘立面与深色花岗岩帽石压边
    pbox(g, 0.18, 1.52, 140, MAT.concreteDark, side * (PLAT_HALF - 0.05), pt - 0.76, 0);
    pbox(g, 0.36, 0.016, 139.6, MAT.concreteDark, side * (PLAT_HALF - 0.19), pt + 0.008, 0);
    // 凹凸颗粒盲道条 + 黄色安全警戒线
    pbox(g, 0.42, 0.018, 138, MAT.tactile, side * (PLAT_HALF - 0.74), pt + 0.011, 0);
    pbox(g, 0.10, 0.018, 138, MAT.safety, side * (PLAT_HALF - 0.44), pt + 0.011, 0);
    // 站台边缘防踏空斜面与安全诱导灯带
    pbox(g, 0.10, 0.10, 138, MAT.concreteDark, side * (PLAT_HALF - 0.24), pt - 0.24, 0);
    pbox(g, 0.05, 0.05, 138, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.72, 1.02, 0.86), toneMapped: false }),
      side * (PLAT_HALF - 0.15), pt - 0.08, 0);
  }

  /* ---------------- 站台踢脚线（贴地 12 cm 不锈钢，真实站台一定有） ---------------- */
  for (const side of [-1, 1]) {
    /* 面向轨道侧已经有不锈钢护板，这里补「站台中央走向」的踢脚：
       站台板下沿与地面交界处一圈深色收边，避免地砖直接悬空切进混凝土。 */
    pbox(g, PLAT_HALF * 2 - 0.6, 0.10, 0.05, MAT.darkMetal, 0, pt - 0.05, -69.95);
    pbox(g, PLAT_HALF * 2 - 0.6, 0.10, 0.05, MAT.darkMetal, 0, pt - 0.05, 69.95);
  }

  /* ---------------- 站台端头检修门与防护栏（两端各一处） ---------------- */
  for (const dir of [-1, 1]) {
    const ez = dir * 69.4;
    /* 端头防护栏：两根立柱 + 两道横杆，挡住乘客走向轨道 */
    for (const sx of [-1, 1]) {
      pbox(g, 0.06, 1.05, 0.06, MAT.metal, sx * 1.5, pt + 0.52, ez);
    }
    pbox(g, 3.06, 0.05, 0.05, MAT.metal, 0, pt + 1.02, ez);
    pbox(g, 3.06, 0.045, 0.045, MAT.metal, 0, pt + 0.55, ez);
    /* 中间检修门（深灰金属门扇 + 门把手） */
    pbox(g, 1.1, 2.05, 0.07, MAT.darkMetal, 0, pt + 1.03, ez - dir * 0.04);
    pbox(g, 0.05, 0.22, 0.10, MAT.metal, 0.38, pt + 1.02, ez - dir * 0.10);
    /* 门上方「禁止入内」小牌 */
    pbox(g, 0.62, 0.26, 0.03, MAT.darkMetal, 0, pt + 2.28, ez - dir * 0.06);
  }

  /* ---------------- 两侧轨道区 ---------------- */
  for (const side of [-1, 1]) {
    pbox(g, 3.7, 0.3, 148, MAT.concreteDark, side * TRACK_LAT, -0.45, 0);
  }

  if (underground) {
    /* 侧墙 / 轨行区搪瓷钢板墙裙 / 电缆桥架 / 顶板 */
    const lineBandMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(line.color), roughness: 0.45, metalness: 0.12,
      emissive: new THREE.Color(line.color), emissiveIntensity: 0.38
    });
    const wallBannerTex = texTrackWallSign(st, line, dirTo);
    const wallBannerMat = new THREE.MeshStandardMaterial({
      map: wallBannerTex, roughness: 0.45, metalness: 0.08,
      emissive: 0xffffff, emissiveMap: wallBannerTex, emissiveIntensity: 0.34
    });
    for (const side of [-1, 1]) {
      const inward = -side;
      pplane(g, 148, H + 1.2, wallMat, side * SIDE, (H - 1.2) / 2 + 0.5, 0, side > 0 ? -PI / 2 : PI / 2);
      // 下部轨行区深色防污踢脚与搪瓷腰带
      pbox(g, 0.08, 1.35, 148, MAT.concreteDark, side * (SIDE - 0.04), 0.45, 0);
      pbox(g, 0.06, 0.36, 148, lineBandMat, side * (SIDE - 0.05), 2.55, 0);
      pbox(g, 0.07, 0.06, 148, MAT.darkMetal, side * (SIDE - 0.055), 2.34, 0);
      pbox(g, 0.07, 0.06, 148, MAT.darkMetal, side * (SIDE - 0.055), 2.76, 0);
      // 上部轨行区综合管线桥架（3道）
      for (const cy of [4.8, 5.35, 5.9]) {
        pbox(g, 0.18, 0.10, 148, MAT.darkMetal, side * (SIDE - 0.09), cy, 0);
      }
      // 轨行区侧墙大号搪瓷站名牌（透过屏蔽门玻璃清晰可见）
      const ry = inward > 0 ? PI / 2 : -PI / 2;
      for (const zz of [-54, -38, -22, -6, 10, 26, 42, 58]) {
        pplane(g, 3.8, 0.72, wallBannerMat, side * (SIDE - 0.075), 2.55, zz, ry);
      }
    }
    // 顶板分三段，在两个楼扶梯位置开洞通向站厅
    const HOLE = [[-53, -41], [41, 53]];
    const segs = [[-74, HOLE[0][0]], [HOLE[0][1], HOLE[1][0]], [HOLE[1][1], 74]];
    for (const [a, b] of segs) {
      pbox(g, SIDE * 2 + 0.4, 0.36, b - a, MAT.concreteDark, 0, H + 0.18, (a + b) / 2);
      // 站台主吊顶两侧灯槽折边
      for (const side of [-1, 1]) {
        pbox(g, 0.45, 0.28, b - a, MAT.darkMetal, side * 3.35, H - 0.14, (a + b) / 2);
      }
    }
    // 站厅层（洞口上方的一层，用暖光暗示）
    for (const [a, b] of HOLE) {
      /* 站厅层楼板：透过扶梯天井能看到，原来 0x9aa2a4 被上方灯条照成一片白，
         压到 0x6e7679 并去掉镜面反射，看起来才像「上面还有一层」而不是发光天花板。 */
      pbox(g, SIDE * 2 + 0.4, 0.14, b - a, new THREE.MeshStandardMaterial({ color: 0x6e7679, roughness: 0.95, metalness: 0.0 }), 0, H + 3.6, (a + b) / 2);
      /* 站厅灯：只做窄条（0.9 m），不再横跨整个洞口 —— 原来 12 m 长的发光面是「天井一片白」的主因。 */
      pbox(g, 0.9, 0.05, b - a, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.62, 0.58, 0.48), toneMapped: false }), 0, H + 3.5, (a + b) / 2);
      for (const zz of [a, b]) {
        pbox(g, SIDE * 2 + 0.4, 3.5, 0.2, MAT.concreteDark, 0, H + 1.9, zz);
      }
      for (const side of [-1, 1]) {
        pbox(g, 0.2, 3.5, b - a, MAT.concreteDark, side * (SIDE + 0.1), H + 1.9, (a + b) / 2);
      }
      for (let k = 0; k < 4; k++) {
        pbox(g, 0.34, 1.0, 0.62, new THREE.MeshStandardMaterial({ color: 0xc8cdcd, roughness: 0.5, metalness: 0.4 }),
          -2.4 + k * 1.6, H + 0.57, (a + b) / 2);
      }
      pbox(g, 2.2, 1.2, 1.6, new THREE.MeshStandardMaterial({ color: 0x8fa3ad, roughness: 0.6, metalness: 0.2 }),
        2.6, H + 0.6, (a + b) / 2 + 2.4);
    }
    // 端墙（两条轨道各一个洞口，彻底封堵换乘通道上方的漏空隙）
    const hasTr = !!(st.tr && st.tr.length);
    for (const dir of [-1, 1]) {
      pbox(g, SIDE - TRACK_LAT - 1.4, H + 1.4, 0.6, wallMat,
        -(TRACK_LAT + (SIDE - TRACK_LAT) / 2 + 0.7), (H - 1.4) / 2 + 0.2, dir * 74);
      pbox(g, SIDE - TRACK_LAT - 1.4, H + 1.4, 0.6, wallMat,
        (TRACK_LAT + (SIDE - TRACK_LAT) / 2 + 0.7), (H - 1.4) / 2 + 0.2, dir * 74);
      pbox(g, SIDE * 2 + 0.4, 2.2, 0.6, wallMat, 0, H - 0.9, dir * 74);
      // 站台中央端墙封板（非换乘端全封，换乘端封堵通道顶部至车站顶板）
      if (dir < 0 || !hasTr) {
        pbox(g, PLAT_HALF * 2 + 0.4, H - pt + 0.4, 0.5, wallMat, 0, (H + pt) / 2, dir * 73.8);
      } else {
        pbox(g, PLAT_HALF * 2 + 0.4, H - (pt + 3.2) + 0.4, 0.5, wallMat, 0, (H + pt + 3.2) / 2, dir * 70.3);
      }
      for (const side of [-1, 1]) {
        pbox(g, 0.5, 6.6, 0.7, MAT.concreteDark, side * (TRACK_LAT + 2.1), 3.0, dir * 74);
        pbox(g, 0.5, 6.6, 0.7, MAT.concreteDark, side * (TRACK_LAT - 2.1), 3.0, dir * 74);
        pbox(g, 4.7, 0.5, 0.7, MAT.concreteDark, side * TRACK_LAT, 5.7, dir * 74);
      }
    }
    /* 站台立柱：避开两处扶梯洞口([-53,-41],[41,53])与中部观光电梯(z=0) */
    const colZs = [-64, -56, -34, -22, -10, 10, 22, 34, 56, 64];
    const colCount = colZs.length;
    const cols = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.45, H - pt, 16), MAT.column, colCount);
    const colBase = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.50, 0.56, 0.55, 16), MAT.concreteDark, colCount);
    const colCap = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.58, 0.46, 0.28, 16), MAT.metal, colCount);
    const colRing = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.455, 0.455, 0.18, 16), lineBandMat, colCount);
    const colHalo = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.64, 0.64, 0.08, 16), MAT.strip, colCount);
    const d = new THREE.Object3D();
    for (let i = 0; i < colCount; i++) {
      const z = colZs[i];
      d.position.set(0, (H + pt) / 2 - 0.05, z); d.updateMatrix(); cols.setMatrixAt(i, d.matrix);
      d.position.set(0, pt + 0.275, z); d.updateMatrix(); colBase.setMatrixAt(i, d.matrix);
      d.position.set(0, H - 0.18, z); d.updateMatrix(); colCap.setMatrixAt(i, d.matrix);
      d.position.set(0, pt + 2.15, z); d.updateMatrix(); colRing.setMatrixAt(i, d.matrix);
      d.position.set(0, H - 0.06, z); d.updateMatrix(); colHalo.setMatrixAt(i, d.matrix);
    }
    [cols, colBase, colCap, colRing, colHalo].forEach(m => {
      m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; g.add(m);
    });
    // 立柱嵌入式红银消防栓箱
    const fireMat = new THREE.MeshStandardMaterial({ color: 0xb82424, roughness: 0.4, metalness: 0.3, emissive: 0x300505 });
    for (const fz of [-34, -10, 10, 34]) {
      pbox(g, 0.52, 0.78, 0.14, MAT.metal, 0, pt + 1.15, fz + 0.43);
      pbox(g, 0.44, 0.68, 0.16, fireMat, 0, pt + 1.15, fz + 0.43);
    }

    /* 顶部嵌入式灯带与吊顶横向格栅（自动跳过扶梯天井洞口） */
    const inHole = z => (z > -53.5 && z < -40.5) || (z > 40.5 && z < 53.5);
    const lightZs = [];
    for (let z = -69; z <= 69; z += 3) {
      if (!inHole(z)) lightZs.push(z);
    }
    const lights = new THREE.InstancedMesh(UNIT_BOX, MAT.strip, lightZs.length * 2);
    let li2 = 0;
    for (const z of lightZs) {
      for (const side of [-1, 1]) {
        /* 灯带做窄一点、短一点：原来 2.45 m 长 × 0.42 m 宽的连续面在泛光下会糊成一片白块。
           缩到 1.5 m × 0.26 m，视觉上仍是连续灯槽（间隔 3 m 排布），但高光面积小很多。 */
        d.position.set(side * 2.45, H - 0.16, z);
        d.scale.set(0.26, 0.06, 1.5);
        d.updateMatrix(); lights.setMatrixAt(li2++, d.matrix);
      }
    }
    lights.instanceMatrix.needsUpdate = true; lights.frustumCulled = false;
    g.add(lights);

    const grilleZs = [];
    for (let z = -70; z <= 70; z += 1.2) {
      if (!inHole(z)) grilleZs.push(z);
    }
    const grille = new THREE.InstancedMesh(UNIT_BOX, MAT.darkMetal, grilleZs.length);
    const dg = new THREE.Object3D();
    grilleZs.forEach((z, i) => {
      dg.position.set(0, H - 0.34, z);
      dg.scale.set(PLAT_HALF * 1.92, 0.07, 0.09);
      dg.updateMatrix(); grille.setMatrixAt(i, dg.matrix);
    });
    grille.instanceMatrix.needsUpdate = true; grille.frustumCulled = false;
    g.add(grille);

    /* 地下站台补光：不再给每座车站放 3 盏点光源。
       three.js 前向渲染里「每盏可见灯」都要在每个像素的着色器里循环一遍，
       相邻两站同时可见就是 +6 盏灯，而且灯数变化会触发着色器重编译（站点显隐时的卡顿尖峰）。
       站台亮度改由「跟随列车的 4 盏站台补光灯」（70_core.js stationLights）+ 灯带自发光承担。 */
  } else {
    /* 高架站：现代拱形钢结构雨棚 + 两侧半封闭防风幕墙（消除外侧悬浮广告牌） */
    const roofW = 20.2;
    pbox(g, roofW, 0.24, 148, MAT.white, 0, H + 0.08, 0, true);
    pbox(g, roofW - 0.6, 0.08, 148, MAT.white, 0, H - 0.08, 0);
    const fasciaMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(line.color).multiplyScalar(0.65), roughness: 0.45, metalness: 0.25,
      emissive: new THREE.Color(line.color), emissiveIntensity: 0.18
    });
    pbox(g, roofW + 0.4, 0.56, 0.36, fasciaMat, 0, H + 0.28, 74);
    pbox(g, roofW + 0.4, 0.56, 0.36, fasciaMat, 0, H + 0.28, -74);
    pbox(g, 0.36, 0.56, 148, fasciaMat, -roofW / 2, H + 0.28, 0);
    pbox(g, 0.36, 0.56, 148, fasciaMat, roofW / 2, H + 0.28, 0);

    // 横向钢结构雨棚拱梁（每 10m 一榀）
    for (let z = -70; z <= 70; z += 10) {
      pbox(g, roofW - 0.4, 0.26, 0.28, MAT.darkMetal, 0, H - 0.22, z);
    }

    // 轨道外侧混凝土声屏障胸墙 + 钢化玻璃防风屏（承载侧墙广告与出口牌，彻底告别悬空）
    for (const side of [-1, 1]) {
      pbox(g, 0.22, 1.7, 148, MAT.concrete, side * SIDE, 0.55, 0);
      pbox(g, 0.14, 0.22, 148, fasciaMat, side * (SIDE - side * 0.04), 1.48, 0);
      pbox(g, 0.08, 2.7, 148, MAT.psdGlass, side * SIDE, 2.95, 0);
      pbox(g, 0.24, 0.24, 148, MAT.darkMetal, side * SIDE, 4.35, 0);
      for (let z = -72; z <= 72; z += 6) {
        pbox(g, 0.26, H + 0.3, 0.22, MAT.darkMetal, side * SIDE, (H - 0.3) / 2, z);
      }
    }

    // 雨棚柱：避开中心电梯与楼梯井
    const colZs = [-64, -56, -34, -22, -10, 10, 22, 34, 56, 64];
    const cols = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.30, 0.35, H - pt, 12), MAT.metal, colZs.length);
    const colBase = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.46, 0.36, 12), MAT.concreteDark, colZs.length);
    const d = new THREE.Object3D();
    colZs.forEach((z, i) => {
      d.position.set(0, (H + pt) / 2, z); d.updateMatrix(); cols.setMatrixAt(i, d.matrix);
      d.position.set(0, pt + 0.18, z); d.updateMatrix(); colBase.setMatrixAt(i, d.matrix);
    });
    cols.instanceMatrix.needsUpdate = true; cols.frustumCulled = false;
    colBase.instanceMatrix.needsUpdate = true; colBase.frustumCulled = false;
    g.add(cols, colBase);

    // 顶棚双列条形灯带
    const lights = new THREE.InstancedMesh(UNIT_BOX, MAT.stripCool, 60);
    let li3 = 0;
    for (let i = 0; i < 30; i++) {
      const z = -69 + i * 4.7;
      for (const side of [-1, 1]) {
        d.position.set(side * 2.4, H - 0.18, z);
        d.scale.set(0.38, 0.08, 3.2);
        d.updateMatrix(); lights.setMatrixAt(li3++, d.matrix);
      }
    }
    lights.instanceMatrix.needsUpdate = true; lights.frustumCulled = false;
    g.add(lights);
  }

  /* ---------------- 屏蔽门与地面排队候车标线 ---------------- */
  const doors = [];
  for (let car = 0; car < 6; car++) {
    for (const off of doorOffsetsOf(line)) {
      doors.push(PLATFORM_HALF - 11.4 - car * CAR_PITCH + off);
    }
  }
  /* 地下站：全高屏蔽门 + 1.28 m 门楣直通顶板；
     高架/地面站：同样做到 2.2 m 的「全高」屏蔽门，只配 0.5 m 薄门楣，不封顶（站台敞开通风） */
  const psdH = underground ? 2.05 : 2.2;
  const psdOpts = underground
    ? { baseY: pt, line, station: st, dirTo, ceilY: H }
    : { baseY: pt, line, station: st, dirTo, ceilY: pt + psdH + 0.5, headH: 0.5 };
  const psdL = new PSDGroup(g, -PSD_X, doors, psdH, psdOpts);
  const psdR = new PSDGroup(g, PSD_X, doors, psdH, psdOpts);

  // 每扇车门前的地面排队候车箭头地贴（先下后上 / 排队候车）
  const qTex = texQueueDecal(line);
  const qMat = new THREE.MeshStandardMaterial({
    map: qTex, roughness: 0.55, metalness: 0.05,
    emissive: 0xffffff, emissiveMap: qTex, emissiveIntensity: 0.22,
    polygonOffset: true, polygonOffsetFactor: -1
  });
  const qGeo = new THREE.PlaneGeometry(1.76, 0.92);
  const qMesh = new THREE.InstancedMesh(qGeo, qMat, doors.length * 2);
  const qDummy = new THREE.Object3D();
  let qi = 0;
  for (const side of [-1, 1]) {
    for (const dz of doors) {
      qDummy.position.set(side * (PLAT_HALF - 1.12), pt + 0.015, dz);
      qDummy.rotation.set(-PI / 2, 0, side > 0 ? -PI / 2 : PI / 2);
      qDummy.updateMatrix();
      qMesh.setMatrixAt(qi++, qDummy.matrix);
    }
  }
  qMesh.instanceMatrix.needsUpdate = true;
  qMesh.frustumCulled = false;
  g.add(qMesh);

  /* ---------------- 站名牌 / 导向 / 广告 ---------------- */
  const signMat = new THREE.MeshStandardMaterial({
    map: texStationSign(st, line, dirTo), roughness: 0.45, metalness: 0.08,
    emissive: 0xffffff, emissiveMap: texStationSign(st, line, dirTo), emissiveIntensity: 0.42
  });
  const diagMat = new THREE.MeshStandardMaterial({
    map: texLineDiagram(line, idx), roughness: 0.5, metalness: 0.06,
    emissive: 0xffffff, emissiveMap: texLineDiagram(line, idx), emissiveIntensity: 0.35
  });

  // 吊挂站名导向灯箱（双面带金属灯箱壳体与吊杆，避开扶梯天井）
  const signY = underground ? 4.65 : 3.72;
  for (const z of [-60, -28, 16, 60]) {
    pbox(g, 4.12, 1.06, 0.14, MAT.darkMetal, 0, signY, z);
    for (const ry of [0, PI]) {
      pplane(g, 4.0, 0.96, signMat, 0, signY, z + (ry === 0 ? 0.075 : -0.075), ry);
    }
    const rodH = H - (signY + 0.53);
    pbox(g, 0.05, rodH, 0.05, MAT.darkMetal, -1.45, signY + 0.53 + rodH / 2, z);
    pbox(g, 0.05, rodH, 0.05, MAT.darkMetal, 1.45, signY + 0.53 + rodH / 2, z);
  }
  // 线路图灯箱（吊挂，双面带深色铝合金外框）
  const diagY = underground ? 3.88 : 3.12;
  pbox(g, 5.54, 0.94, 0.14, MAT.darkMetal, 0, diagY, -6);
  pplane(g, 5.4, 0.84, diagMat, 0, diagY, -6 + 0.075, 0);
  pplane(g, 5.4, 0.84, diagMat, 0, diagY, -6 - 0.075, PI);
  pbox(g, 0.05, H - diagY, 0.05, MAT.darkMetal, -2.1, (H + diagY) / 2, -6);
  pbox(g, 0.05, H - diagY, 0.05, MAT.darkMetal, 2.1, (H + diagY) / 2, -6);

  // 侧墙广告灯箱（带金属外框与内发光画面）
  for (const side of [-1, 1]) {
    for (const z of [-62, -30, 30, 62]) {
      const ad = new THREE.MeshStandardMaterial({
        map: texAd((idx + Math.abs(z)) % 4), roughness: 0.5,
        emissive: 0xffffff, emissiveMap: texAd((idx + Math.abs(z)) % 4), emissiveIntensity: 0.58
      });
      pbox(g, 0.16, 2.34, 4.44, MAT.darkMetal, side * (SIDE - 0.16), 3.05, z);
      pplane(g, 4.2, 2.1, ad, side * (SIDE - 0.075), 3.05, z, side > 0 ? -PI / 2 : PI / 2);
    }
  }
  // 高架站：雨棚檐口外侧站名大牌
  if (!underground) {
    for (const z of [-48, 0, 48]) {
      pbox(g, 0.12, 1.15, 4.6, MAT.darkMetal, -SIDE - 0.08, H + 0.28, z);
      pplane(g, 4.4, 1.05, signMat, -SIDE - 0.15, H + 0.28, z, -PI / 2);
      pbox(g, 0.12, 1.15, 4.6, MAT.darkMetal, SIDE + 0.08, H + 0.28, z);
      pplane(g, 4.4, 1.05, signMat, SIDE + 0.15, H + 0.28, z, PI / 2);
    }
  }
  // 出口牌
  const exitMat = new THREE.MeshStandardMaterial({
    map: texExitSign(), roughness: 0.45, emissive: 0xffffff, emissiveMap: texExitSign(), emissiveIntensity: 0.85
  });
  for (const side of [-1, 1]) {
    for (const z of [-18, 20]) {
      pbox(g, 0.10, 0.62, 1.56, MAT.darkMetal, side * (SIDE - 0.11), 3.15, z);
      pplane(g, 1.5, 0.56, exitMat, side * (SIDE - 0.055), 3.15, z, side > 0 ? -PI / 2 : PI / 2);
    }
  }

  /* ---------------- 楼扶梯与无障碍观光电梯 ---------------- */
  const escMetal = new THREE.MeshStandardMaterial({
    color: 0xb9c1c6, roughness: 0.34, metalness: 0.45,
    emissive: 0x32383c, emissiveIntensity: 0.10
  });
  const stepMat = new THREE.MeshStandardMaterial({
    color: 0x3b4247, roughness: 0.62, metalness: 0.35,
    emissive: 0x0d1012, emissiveIntensity: 0.10
  });
  const handrailMat = new THREE.MeshStandardMaterial({
    color: 0x16191c, roughness: 0.28, metalness: 0.2,
    emissive: 0x060809, emissiveIntensity: 0.08
  });
  const hallSignTex = texElevatorSign(true);
  const hallSignMat = new THREE.MeshStandardMaterial({
    map: hallSignTex, roughness: 0.45, emissive: 0xffffff, emissiveMap: hallSignTex, emissiveIntensity: 0.48
  });

  if (underground) {
    // 地下站：全包覆不锈钢桁架 + 钢化玻璃护栏双联自动扶梯（通向站厅层天井）
    for (const dir of [-1, 1]) {
      const z0 = dir * 47;
      const steps = 16, rise = (H - pt) / steps, run = 0.68;
      const spanZ = steps * run;
      const len = Math.hypot(H - pt, spanZ);
      const ang = -dir * Math.atan2(H - pt, spanZ);

      // 不锈钢底壳斜向包板 + 梯底三角区设备间支座（彻底消除悬空感与暗面）
      const truss = pbox(g, 2.86, 0.56, len + 0.5, escMetal, 0, pt + (H - pt) / 2 - 0.22, z0);
      truss.rotation.x = ang;
      const supH = (H - pt) * 0.52;
      pbox(g, 2.68, supH, 3.8, MAT.stationWall, 0, pt + supH / 2, z0 + dir * (spanZ * 0.26));
      pbox(g, 2.74, 0.18, 3.9, MAT.darkMetal, 0, pt + 0.09, z0 + dir * (spanZ * 0.26));
      // 上下两端梳齿踏板与地坑机箱座
      pbox(g, 2.94, 0.26, 1.45, escMetal, 0, pt - 0.08, z0 - dir * (spanZ / 2 + 0.55));
      pbox(g, 2.60, 0.03, 0.55, MAT.safety, 0, pt + 0.015, z0 - dir * (spanZ / 2 + 0.35));
      pbox(g, 2.94, 0.32, 1.45, escMetal, 0, H - 0.12, z0 + dir * (spanZ / 2 + 0.55));

      // 深灰防滑齿槽梯级 + 黄边警示线 + 中央分隔护板
      for (let k = 0; k < steps; k++) {
        const sy = pt + rise * (k + 0.5);
        const sz = z0 - dir * (spanZ / 2) + dir * (k + 0.5) * run;
        pbox(g, 2.56, 0.22, run + 0.03, stepMat, 0, sy + rise * 0.22, sz);
        pbox(g, 2.58, 0.025, 0.04, MAT.safety, 0, sy + rise * 0.50, sz - dir * run * 0.44);
      }
      // 中央双梯分隔扶手栏板
      const midBal = pbox(g, 0.14, 0.86, len + 0.4, MAT.psdGlass, 0, pt + (H - pt) / 2 + 0.48, z0);
      midBal.rotation.x = ang;
      const midRail = pbox(g, 0.16, 0.09, len + 0.55, handrailMat, 0, pt + (H - pt) / 2 + 0.92, z0);
      midRail.rotation.x = ang;

      // 两侧钢化玻璃栏板、不锈钢围裙板与黑色橡胶扶手带
      for (const side of [-1, 1]) {
        const skirt = pbox(g, 0.16, 0.42, len + 0.5, escMetal, side * 1.38, pt + (H - pt) / 2 + 0.02, z0);
        skirt.rotation.x = ang;
        const glassBal = pbox(g, 0.06, 0.86, len + 0.35, MAT.psdGlass, side * 1.38, pt + (H - pt) / 2 + 0.48, z0);
        glassBal.rotation.x = ang;
        const rail = pbox(g, 0.12, 0.09, len + 0.55, handrailMat, side * 1.38, pt + (H - pt) / 2 + 0.92, z0);
        rail.rotation.x = ang;
        // 上下扶手鹅颈回转头
        pbox(g, 0.12, 0.88, 0.48, handrailMat, side * 1.38, pt + 0.46, z0 - dir * (spanZ / 2 + 0.38));
        pbox(g, 0.12, 0.88, 0.48, handrailMat, side * 1.38, H + 0.44, z0 + dir * (spanZ / 2 + 0.38));
      }
      // 天井洞口四周挡烟垂壁与“站厅·出入口”门楣灯箱
      const entryZ = z0 - dir * (spanZ / 2 + 0.8);
      pbox(g, 3.04, 0.56, 0.14, MAT.darkMetal, 0, pt + 3.05, entryZ);
      pplane(g, 2.92, 0.48, hallSignMat, 0, pt + 3.05, entryZ - dir * 0.08, dir > 0 ? PI : 0);
      pbox(g, 0.06, H - (pt + 3.05), 0.06, MAT.darkMetal, -1.42, (H + pt + 3.05) / 2, entryZ);
      pbox(g, 0.06, H - (pt + 3.05), 0.06, MAT.darkMetal, 1.42, (H + pt + 3.05) / 2, entryZ);
    }
  } else {
    // 高架站：下行通往地面站厅的半封闭玻璃护栏楼梯井（不再向上顶穿高架雨棚）
    for (const dir of [-1, 1]) {
      const z0 = dir * 47;
      const wellL = 7.6, wellW = 2.6;
      // 三面钢化玻璃安全围栏与不锈钢扶手
      for (const side of [-1, 1]) {
        pbox(g, 0.10, 1.12, wellL, MAT.psdGlass, side * (wellW / 2), pt + 0.56, z0);
        pbox(g, 0.14, 0.07, wellL + 0.2, escMetal, side * (wellW / 2), pt + 1.14, z0);
        pbox(g, 0.16, 0.16, wellL + 0.2, MAT.concreteDark, side * (wellW / 2), pt + 0.08, z0);
      }
      const backZ = z0 + dir * (wellL / 2);
      const openZ = z0 - dir * (wellL / 2);
      pbox(g, wellW + 0.1, 1.12, 0.10, MAT.psdGlass, 0, pt + 0.56, backZ);
      pbox(g, wellW + 0.2, 0.07, 0.14, escMetal, 0, pt + 1.14, backZ);
      // 楼梯口门架与下行站厅导向牌
      pbox(g, 0.12, 2.75, 0.12, MAT.darkMetal, -wellW / 2, pt + 1.38, openZ);
      pbox(g, 0.12, 2.75, 0.12, MAT.darkMetal, wellW / 2, pt + 1.38, openZ);
      pbox(g, wellW + 0.28, 0.52, 0.16, MAT.darkMetal, 0, pt + 2.58, openZ);
      pplane(g, wellW + 0.12, 0.44, hallSignMat, 0, pt + 2.58, openZ - dir * 0.09, dir > 0 ? PI : 0);
      // 下行阶梯暗示
      for (let k = 0; k < 7; k++) {
        pbox(g, wellW - 0.16, 0.16, 0.85, stepMat, 0, pt - 0.08 - k * 0.16, openZ + dir * (0.6 + k * 0.92));
      }
    }
  }

  // 中央无障碍透明玻璃观光电梯（置于 z=0 站台中央，避开所有立柱与扶梯，地下直通站厅顶板）
  const liftZ = 0, liftW = 2.08, liftD = 2.36;
  const liftH = underground ? (H - pt + 2.6) : 3.45;
  const liftTopY = pt + liftH;
  // 四角深灰钢结构立柱与水平环梁
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      pbox(g, 0.14, liftH, 0.14, MAT.darkMetal, sx * (liftW / 2), pt + liftH / 2, liftZ + sz * (liftD / 2));
    }
  }
  for (let hOff = 0.08; hOff <= liftH; hOff += 2.2) {
    pbox(g, liftW + 0.16, 0.12, liftD + 0.16, MAT.darkMetal, 0, pt + Math.min(hOff, liftH - 0.06), liftZ);
  }
  pbox(g, liftW + 0.24, 0.22, liftD + 0.24, MAT.darkMetal, 0, liftTopY, liftZ);
  // 四周钢化玻璃井道幕墙
  for (const sx of [-1, 1]) {
    pbox(g, 0.06, liftH - 0.2, liftD - 0.16, MAT.psdGlass, sx * (liftW / 2), pt + liftH / 2, liftZ);
  }
  for (const sz of [-1, 1]) {
    pbox(g, liftW - 0.16, liftH - 0.2, 0.06, MAT.psdGlass, 0, pt + liftH / 2, liftZ + sz * (liftD / 2));
  }
  // 井道内不锈钢轿厢、轿顶暖白照明与双开层门
  pbox(g, liftW - 0.24, 0.14, liftD - 0.24, MAT.metal, 0, pt + 0.07, liftZ);
  pbox(g, liftW - 0.24, 0.12, liftD - 0.24, MAT.metal, 0, pt + 2.42, liftZ);
  pbox(g, liftW - 0.48, 0.05, liftD - 0.48, MAT.strip, 0, pt + 2.34, liftZ);
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      pbox(g, 0.46, 2.15, 0.08, MAT.metal, sx * 0.25, pt + 1.12, liftZ + sz * (liftD / 2 + 0.02));
    }
  }
  // 无障碍电梯蓝底灯箱标识（前后双面）
  const liftSignTex = texElevatorSign(false);
  const liftSignMat = new THREE.MeshStandardMaterial({
    map: liftSignTex, roughness: 0.4, emissive: 0xffffff, emissiveMap: liftSignTex, emissiveIntensity: 0.55
  });
  for (const sz of [-1, 1]) {
    pplane(g, 1.88, 0.38, liftSignMat, 0, pt + 2.48, liftZ + sz * (liftD / 2 + 0.09), sz > 0 ? 0 : PI);
  }

  /* ---------------- 现代不锈钢候车排椅与双色分类垃圾桶 ---------------- */
  const seatGreenMat = new THREE.MeshStandardMaterial({ color: 0x1d6b48, roughness: 0.5, metalness: 0.2, emissive: 0x061f14 });
  const binBlueMat = new THREE.MeshStandardMaterial({ color: 0x225a96, roughness: 0.5, metalness: 0.2, emissive: 0x071a30 });
  for (const z of [-28, -16, 16, 28, 60]) {
    // 置于站台中轴线两侧背靠背候车排椅（4座分体弧面 + 扶手 + 支腿）
    for (const side of [-1, 1]) {
      const bx = side * 0.52;
      pbox(g, 0.08, 0.08, 2.56, MAT.darkMetal, bx, pt + 0.38, z);
      pbox(g, 0.08, 0.38, 0.08, MAT.darkMetal, bx, pt + 0.19, z - 1.05);
      pbox(g, 0.08, 0.38, 0.08, MAT.darkMetal, bx, pt + 0.19, z + 1.05);
      for (let s = 0; s < 4; s++) {
        const sz = z - 0.9 + s * 0.6;
        pbox(g, 0.46, 0.05, 0.52, MAT.metal, side * 0.62, pt + 0.44, sz);
        pbox(g, 0.06, 0.42, 0.50, MAT.metal, side * 0.40, pt + 0.66, sz);
        pbox(g, 0.48, 0.12, 0.04, MAT.darkMetal, side * 0.62, pt + 0.50, sz - 0.26);
      }
      pbox(g, 0.48, 0.12, 0.04, MAT.darkMetal, side * 0.62, pt + 0.50, z + 1.16);
    }
  }
  // 双桶分类不锈钢垃圾箱（可回收物 / 其他垃圾）
  for (const z of [-33, 11, 33, -55]) {
    pbox(g, 0.44, 0.82, 0.88, MAT.metal, 0, pt + 0.41, z);
    pbox(g, 0.48, 0.08, 0.94, MAT.darkMetal, 0, pt + 0.84, z);
    pbox(g, 0.46, 0.22, 0.36, binBlueMat, 0, pt + 0.52, z - 0.21);
    pbox(g, 0.46, 0.22, 0.36, seatGreenMat, 0, pt + 0.52, z + 0.21);
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
  /* s 必须取 stopS：车站数据里没有 st.s 字段，取错了会让 70_core 的距离剔除
     永远算出 NaN，结果 28 座车站全部常驻可见（4992 个网格、近 2000 个 draw call）。 */
  return { group: g, psdL, psdR, stopZ: 70, crowd, s: st.stopS != null ? st.stopS : (st.s || 0), pis, trPass, pavilion };
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
