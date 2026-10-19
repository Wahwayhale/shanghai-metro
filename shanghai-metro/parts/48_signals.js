/* =====================================================================
   地面信号机：三显示（上绿 / 中黄 / 下红），按前方闭塞占用变化
   —— 沿正线每 330 m 一组，立于轨道外侧（岛式站台区间即隧道壁侧）
   ===================================================================== */
const SIG_SPACING = 330;
const SIG_RED = 0, SIG_YELLOW = 1, SIG_GREEN = 2;
const SIG_LAMP_Y = [0.42, 0, -0.42];        // 上 / 中 / 下
const SIG_LAMP_OF = { 0: 2, 1: 1, 2: 0 };   // 状态 → 灯位

let signals = [];            // { s, dir, state, pos, up, fwd }
let sigLampMeshes = null;    // [红, 黄, 绿] 三组 InstancedMesh
let sigDummy = null;
let sigT = 0;

function buildSignals(route, group) {
  signals = [];
  const list = [];
  for (let s = 160; s < route.length - 90; s += SIG_SPACING) {
    list.push({ s, dir: 1 });
    list.push({ s, dir: -1 });
  }
  const n = list.length;
  if (!n) return;

  const poleGeo = new THREE.CylinderGeometry(0.075, 0.095, 2.55, 8);
  const boxGeo = new THREE.BoxGeometry(0.52, 1.42, 0.24);
  const lampGeo = new THREE.SphereGeometry(0.155, 12, 9);
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 0.82, metalness: 0.28 });

  // 三组灯各自固定颜色，靠缩放控制亮灭（比 instanceColor 稳）
  const lampMats = [
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 1.55, 0.42), toneMapped: false }),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.75, 0.92, 0.06), toneMapped: false }),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.95, 0.06, 0.05), toneMapped: false })
  ];
  const lampMeshes = lampMats.map(m => {
    const im = new THREE.InstancedMesh(lampGeo, m, n);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    return im;
  });

  const poles = new THREE.InstancedMesh(poleGeo, MAT.darkMetal, n);
  const boxes = new THREE.InstancedMesh(boxGeo, boxMat, n);
  poles.frustumCulled = false; boxes.frustumCulled = false;

  const d = new THREE.Object3D();
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();

  list.forEach((item, i) => {
    const f = route.frameAt(item.s);
    const lat = item.dir > 0 ? -(TRACK_LAT + 1.55) : (TRACK_LAT + 1.55);
    const base = f.pos.clone().addScaledVector(f.right, lat);
    const fwd = item.dir > 0 ? f.tan.clone().negate() : f.tan.clone();   // 朝向来车
    q.setFromRotationMatrix(m.makeBasis(f.right, f.up, fwd));

    // 立柱
    d.position.copy(base).addScaledVector(f.up, 1.27);
    d.quaternion.copy(q); d.scale.set(1, 1, 1);
    d.updateMatrix();
    poles.setMatrixAt(i, d.matrix);

    // 灯箱
    d.position.copy(base).addScaledVector(f.up, 2.62);
    d.updateMatrix();
    boxes.setMatrixAt(i, d.matrix);

    // 三灯初始全灭
    for (let c = 0; c < 3; c++) {
      d.position.copy(base)
        .addScaledVector(f.up, 2.62 + SIG_LAMP_Y[c])
        .addScaledVector(fwd, 0.17);
      d.scale.set(0.0001, 0.0001, 0.0001);
      d.updateMatrix();
      lampMeshes[c].setMatrixAt(i, d.matrix);
    }

    signals.push({
      s: item.s, dir: item.dir, state: -1,
      pos: base.clone(), up: f.up.clone(), fwd: fwd.clone(), q: q.clone()
    });
  });

  poles.instanceMatrix.needsUpdate = true;
  boxes.instanceMatrix.needsUpdate = true;
  lampMeshes.forEach(im => { im.instanceMatrix.needsUpdate = true; });

  group.add(poles, boxes, ...lampMeshes);
  sigLampMeshes = lampMeshes;
  sigDummy = new THREE.Object3D();
  sigT = 1;
  updateSignals(0.016);
}

/* 前方同向列车的最小距离 */
function headwayAhead(s, dir) {
  let best = Infinity;
  for (const ai of aiTrains) {
    if (ai.dead || ai.dir !== dir) continue;
    const gap = dir > 0 ? ai.s - s : s - ai.s;
    if (gap > -1 && gap < best) best = gap;
  }
  if (dir === 1 && typeof G !== 'undefined' && G.mode === 'driving' && train) {
    const gap = G.s - s;
    if (gap > -1 && gap < best) best = gap;
  }
  return best;
}

/* 三显示：<380 m 红，<900 m 黄，其余绿 */
function signalStateFor(s, dir) {
  const d = headwayAhead(s, dir);
  if (d < 380) return SIG_RED;
  if (d < 900) return SIG_YELLOW;
  return SIG_GREEN;
}

function updateSignals(dt) {
  if (!sigLampMeshes || !signals.length) return;
  if (dt > 0) {
    sigT += dt;
    if (sigT < 0.15) return;
    sigT = 0;
  }
  const d = sigDummy || (sigDummy = new THREE.Object3D());
  let dirty = false;
  for (let i = 0; i < signals.length; i++) {
    const sg = signals[i];
    let st = signalStateFor(sg.s, sg.dir);
    if (typeof IX !== 'undefined') { const fx = IX.aspectFor(sg); if (fx !== null) st = Math.min(st, fx); }
    if (st === sg.state) continue;
    sg.state = st;
    const lit = SIG_LAMP_OF[st];
    for (let c = 0; c < 3; c++) {
      d.position.copy(sg.pos)
        .addScaledVector(sg.up, 2.62 + SIG_LAMP_Y[c])
        .addScaledVector(sg.fwd, 0.17);
      d.quaternion.copy(sg.q);
      const on = c === lit;
      const sc = on ? 1 : 0.0001;
      d.scale.set(sc, sc, sc);
      d.updateMatrix();
      sigLampMeshes[c].setMatrixAt(i, d.matrix);
    }
    dirty = true;
  }
  if (dirty) sigLampMeshes.forEach(im => { im.instanceMatrix.needsUpdate = true; });
}

/* 本务前方最近信号机（供 ATP 屏显示） */
function nextSignalAhead() {
  let best = null, bd = Infinity;
  for (const sg of signals) {
    if (sg.dir !== 1) continue;
    const gap = sg.s - G.s;
    if (gap > -6 && gap < bd) { bd = gap; best = { gap, state: sg.state, s: sg.s }; }
  }
  return best;
}
