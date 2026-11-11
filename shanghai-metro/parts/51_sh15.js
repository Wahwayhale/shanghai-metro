/* ================================================================
   上海地铁 15 号线列车（sh15_pth）—— 由 MTR / Blockbench 模型移植
   数据：parts/51_sh15_data.js（scripts/convert-sh15.js 生成）
   - 把 .bbmodel 的方块按「面 UV」重建为 BufferGeometry，贴图共用一张 2048²
   - 部件布局（门/窗/端墙/车头/车顶/转向架…）沿用 MTR 的 parts 配置
   - 车门叶片可滑动；车门灯随开门状态切换
   坐标：Blockbench 1/16 m，车体先按 SX/SY/SZ 缩放进本项目的 A 型车尺寸
   （宽 3.0、车长 22.8、地板 1.08），再整体绕 Y 转 180°，使车头朝 +Z。
   ================================================================ */
const SH15 = {
  SX: 1.09, SY: 1.12, SZ: 0.95,   // 模型 → 项目尺寸（宽×高×长）
  YF: 1.08,                        // 模型地板（y=0）对应的世界高度
  tex: null, mats: null, geoCache: {}
};
const SH15_FACES = ['north', 'east', 'south', 'west', 'up', 'down'];

function sh15Tex() {
  if (SH15.tex) return SH15.tex;
  const img = new Image();
  const tex = new THREE.Texture(img);
  img.onload = () => { tex.needsUpdate = true; };
  img.src = 'data:image/png;base64,' + SH15_TEX_B64;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  SH15.tex = tex;
  return tex;
}

function sh15Mats() {
  if (SH15.mats) return SH15.mats;
  const map = sh15Tex();
  SH15.mats = {
    ext: new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 0.52, metalness: 0.12, envMapIntensity: 0.85, side: THREE.DoubleSide }),
    /* 车内：与项目其余车厢一致，给一层自发光，隧道里也看得清 */
    int: new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 0.8, metalness: 0.04, side: THREE.DoubleSide,
      emissive: new THREE.Color(0xffffff), emissiveMap: map, emissiveIntensity: 0.5 }),
    light: new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, toneMapped: false })
  };
  return SH15.mats;
}

/* 是否命中 MTR 车号列表（1 起，负数从尾部数起） */
function sh15Match(list, k, n) {
  for (const t of list) if (t === k || t === k - n - 1) return true;
  return false;
}
function sh15PartOn(p, k, n) {
  return p.w.length ? sh15Match(p.w, k, n) : !sh15Match(p.b, k, n);
}

/* 方块 → 面（带变换）追加到 acc */
const _sh15M = new THREE.Matrix4(), _sh15T = new THREE.Matrix4(), _sh15R = new THREE.Matrix4(), _sh15E = new THREE.Euler();
function sh15Rot(o, rx, ry, rz) {
  _sh15E.set(rx * D2R, ry * D2R, rz * D2R, 'ZYX');
  const m = new THREE.Matrix4().makeTranslation(o[0], o[1], o[2]);
  m.multiply(_sh15R.makeRotationFromEuler(_sh15E));
  m.multiply(_sh15T.makeTranslation(-o[0], -o[1], -o[2]));
  return m;
}
function sh15Cube(c, place, acc) {
  const M = new THREE.Matrix4();
  // 外层分组在前：total = G0 * G1 * … * Cube
  if (c.g) for (const g of c.g) M.multiply(sh15Rot([g[0], g[1], g[2]], g[3], g[4], g[5]));
  if (c.r) M.multiply(sh15Rot(c.o, c.r[0], c.r[1], c.r[2]));
  const T = place.clone().multiply(M);
  const NM = new THREE.Matrix3().getNormalMatrix(T);
  const [x0, y0, z0] = c.f, [x1, y1, z1] = c.t;
  const R = SH15.res;
  const corners = {
    north: [[x1, y1, z0], [x0, y1, z0], [x1, y0, z0], [x0, y0, z0]],
    south: [[x0, y1, z1], [x1, y1, z1], [x0, y0, z1], [x1, y0, z1]],
    east: [[x1, y1, z1], [x1, y1, z0], [x1, y0, z1], [x1, y0, z0]],
    west: [[x0, y1, z0], [x0, y1, z1], [x0, y0, z0], [x0, y0, z1]],
    up: [[x0, y1, z0], [x1, y1, z0], [x0, y1, z1], [x1, y1, z1]],
    down: [[x0, y0, z1], [x1, y0, z1], [x0, y0, z0], [x1, y0, z0]]
  };
  const normals = { north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0], up: [0, 1, 0], down: [0, -1, 0] };
  const v = new THREE.Vector3(), nv = new THREE.Vector3();
  for (let fi = 0; fi < 6; fi++) {
    const uv = c.u[fi];
    if (!uv) continue;
    const name = SH15_FACES[fi];
    const [TL, TR, BL, BR] = corners[name];
    /* 退化面（零厚度方块的侧面）面积为 0，直接跳过 */
    const ex = [TR[0] - TL[0], TR[1] - TL[1], TR[2] - TL[2]], ey = [BL[0] - TL[0], BL[1] - TL[1], BL[2] - TL[2]];
    const cx = ex[1] * ey[2] - ex[2] * ey[1], cy = ex[2] * ey[0] - ex[0] * ey[2], cz = ex[0] * ey[1] - ex[1] * ey[0];
    if (cx * cx + cy * cy + cz * cz < 1e-6) continue;
    nv.set(...normals[name]).applyMatrix3(NM).normalize();
    const [u1, v1, u2, v2] = uv;
    const quad = [[TL, u1, v1], [BL, u1, v2], [TR, u2, v1], [BR, u2, v2]];
    const base = acc.pos.length / 3;
    for (const [P, u, vv] of quad) {
      v.set(P[0], P[1], P[2]).applyMatrix4(T);
      acc.pos.push(v.x, v.y, v.z);
      acc.nrm.push(nv.x, nv.y, nv.z);
      acc.uv.push(u / R, 1 - vv / R);
    }
    acc.idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }
}
function sh15Geo(acc) {
  if (!acc.pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(acc.nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uv, 2));
  g.setIndex(acc.idx);
  g.computeBoundingSphere();
  return g;
}
const sh15Acc = () => ({ pos: [], nrm: [], uv: [], idx: [] });

/* 一节车（MTR 车号 k / 共 n 节）的几何集合。结果按车型缓存复用 */
function sh15CarGeos(k, n, cab) {
  const key = Math.min(k, 3) + '|' + Math.min(n - k + 1, 3) + (cab ? '|cab' : '');
  if (SH15.geoCache[key]) return SH15.geoCache[key];
  SH15.res = SH15_DATA.res;
  /* 全局：缩放 → 抬到地板高度 → 绕 Y 转 180° */
  const G = new THREE.Matrix4().makeRotationY(PI)
    .multiply(new THREE.Matrix4().makeTranslation(0, SH15.YF, 0))
    .multiply(new THREE.Matrix4().makeScale(SH15.SX / 16, SH15.SY / 16, SH15.SZ / 16));
  const out = {
    ext: sh15Acc(), int: sh15Acc(), light: sh15Acc(),
    nose: sh15Acc(), noseLight: sh15Acc(),
    leaves: {},          // 'ext|int' + side + dir → acc
    dlights: []          // 门灯：{ side, on, int, acc }
  };
  const slide = SH15_DATA.doorMax * SH15.SZ / 16;
  const leafAcc = (stageInt, side, dir) => {
    const id = (stageInt ? 'i' : 'e') + side + ':' + dir;
    return out.leaves[id] || (out.leaves[id] = { acc: sh15Acc(), int: stageInt, side, dir });
  };
  for (const p of SH15_DATA.parts) {
    if (!sh15PartOn(p, k, n)) continue;
    const cubes = SH15_DATA.models[p.n];
    if (!cubes) continue;
    const isLeaf = p.n === 'dol' || p.n === 'dor' || p.n === 'dil' || p.n === 'dir';
    const isLight = p.s === 'LIGHTS' || p.s === 'ALWAYS_ON_LIGHTS';
    const isInt = p.s === 'INTERIOR';
    const isNose = (p.n === 'head_out' || p.n === 'head_light' || p.n === 'screen_head' || p.n === 'headlights' || p.n === 'taillights');
    /* 灯光部件：车头灯只在车头（本项目前进方向），尾灯只在车尾 */
    if (p.n === 'headlights' || p.n === 'taillights') {
      /* MTR 车 1 的朝向在 -Z：MOVING_FORWARDS 的 headlights / MOVING_BACKWARDS 的 taillights 才是「前进时」可见 */
      const fwd = p.c === 'MOVING_FORWARDS';
      const isHead = p.n === 'headlights';
      if ((isHead && !fwd) || (!isHead && fwd)) continue;
    }
    const side = p.m ? -1 : 1;
    const doorCond = /^DOOR_(LEFT|RIGHT)_(OPEN|CLOSED)$/.exec(p.c || '');
    const isDoorLight = /doorlight|out_light/.test(p.n);
    for (const [px, pz] of p.p) {
      /* 玩家车头：车头 ~9 m 以内的车内部分由项目自带司机室接管，避免两套内饰重叠 */
      if (cab && k === 1 && pz <= -150 && (isInt || (isLight && p.n !== 'headlights' && p.n !== 'taillights' && p.n !== 'stablization_light' && !/^out_light/.test(p.n)))) continue;
      const place = G.clone().multiply(new THREE.Matrix4().makeTranslation(px, 0, pz));
      if (p.m) place.multiply(new THREE.Matrix4().makeRotationY(PI));
      let acc;
      if (isLeaf) {
        const d = /NEGATIVE/.test(p.d) ? -1 : 1;
        const worldDir = d * (p.m ? -1 : 1) * -1;
        acc = leafAcc(isInt, side, worldDir).acc;
      } else if (isDoorLight && doorCond) {
        const on = doorCond[2] === 'OPEN';
        let dl = out.dlights.find(o => o.side === side && o.on === on && o.light === isLight && o.int === isInt);
        if (!dl) out.dlights.push(dl = { side, on, light: isLight, int: isInt, acc: sh15Acc() });
        acc = dl.acc;
      } else if (isNose) {
        acc = isLight ? out.noseLight : out.nose;
      } else if (isLight) acc = out.light;
      else acc = isInt ? out.int : out.ext;
      for (const c of cubes) sh15Cube(c, place, acc);
    }
  }
  const res = {
    slide,
    ext: sh15Geo(out.ext), int: sh15Geo(out.int), light: sh15Geo(out.light),
    nose: sh15Geo(out.nose), noseLight: sh15Geo(out.noseLight),
    leaves: Object.values(out.leaves).map(l => ({ side: l.side, dir: l.dir, int: l.int, geo: sh15Geo(l.acc) })).filter(l => l.geo),
    dlights: out.dlights.map(d => ({ side: d.side, on: d.on, light: d.light, int: d.int, geo: sh15Geo(d.acc) })).filter(d => d.geo)
  };
  SH15.geoCache[key] = res;
  return res;
}

/* 在 Train 的一节车组里装配 SH15 车体。返回 { nose, leaves, dlights }。 */
function sh15BuildCar(g, i, n, withInterior, cab) {
  const geos = sh15CarGeos(i + 1, n, cab);
  const M = sh15Mats();
  const add = (geo, mat, parent) => {
    if (!geo) return null;
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = false; m.receiveShadow = false;
    (parent || g).add(m);
    return m;
  };
  const extMesh = add(geos.ext, M.ext);
  if (extMesh) extMesh.userData.carShell = true;   // 车壳：需要投影
  if (withInterior) add(geos.int, M.int);
  add(geos.light, M.light);
  let nose = null;
  if (geos.nose || geos.noseLight) {
    nose = new THREE.Group();
    const noseMesh = add(geos.nose, M.ext, nose);
    if (noseMesh) noseMesh.userData.carShell = true;
    add(geos.noseLight, M.light, nose);
    g.add(nose);
  }
  const leaves = [];
  for (const L of geos.leaves) {
    if (L.int && !withInterior) continue;
    const m = add(L.geo, L.int ? M.int : M.ext);
    leaves.push({ mesh: m, side: L.side, dir: L.dir, slide: geos.slide });
  }
  const dlights = [];
  for (const D of geos.dlights) {
    if (D.int && !withInterior) continue;
    const m = add(D.geo, D.light ? M.light : (D.int ? M.int : M.ext));
    m.visible = !D.on;
    dlights.push({ mesh: m, side: D.side, on: D.on });
  }
  return { nose, leaves, dlights };
}

/* 车门动画：t∈[0,1]，doorSide 为站台侧（本地 +1 / -1） */
function sh15UpdateDoors(set, t, doorSide) {
  for (const L of set.leaves) {
    const open = L.side === doorSide ? t : 0;
    L.mesh.position.z = L.dir * L.slide * open;
  }
  for (const D of set.dlights) {
    const lit = D.side === doorSide && t > 0.02;
    D.mesh.visible = D.on ? lit : !lit;
  }
}
