/* ================================================================
   世界构建 A：材质初始化、轨道、隧道、高架、地面、城市、地标
   ================================================================ */

/* 材质缓存：initMaterials 唯一依赖的主题参数是 theme.windowGlow（纹理本身
   已有 TEX_CACHE）。同一主题重复加载线路时直接复用整套材质，
   省掉 30+ 次 MeshStandardMaterial 构造与着色器编译。
   实测 4 号线加载中 initMaterials 占 2.1 s，是第二大瓶颈。 */
const MAT_CACHE = new Map();

function initMaterials(renderer, theme) {
  const key = String(theme.windowGlow);
  const cached = MAT_CACHE.get(key);
  if (cached) {
    /* 复用：把缓存的材质灌回 MAT（MAT 是模块级对象，被各构建函数直接引用） */
    for (const k in cached) MAT[k] = cached[k];
    return MAT;
  }

  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const setAniso = t => { t.anisotropy = aniso; return t; };

  MAT.tunnel = new THREE.MeshStandardMaterial({
    map: setAniso(texConcrete('#5d6265', 0.1, 256)), roughness: 0.94, metalness: 0.02,
    color: 0xffffff, side: THREE.DoubleSide, emissive: new THREE.Color('#2b2b29'), emissiveIntensity: 0.6
  });
  MAT.tunnel.map.repeat.set(1, 1);
  /* 隧道壁法线：低频起伏（衬砌不平整）+ 横向拼缝（管片接缝） */
  MAT.tunnel.normalMap = setAniso(texNormalMap('n_tunnel', 256, 256, (x, y) => {
    let h = fbm2(x, y, 11, 3) * 0.8;
    /* 每 64 px 一条管片缝，缝处高度下陷 */
    const seam = Math.abs((y % 64) - 0.5);
    if (seam < 1.2) h -= 0.5;
    return h;
  }, 3.2));
  MAT.tunnel.normalScale = new THREE.Vector2(1.1, 1.1);

  MAT.stationWall = new THREE.MeshStandardMaterial({
    map: setAniso(texConcrete('#93979a', 0.06, 0)), roughness: 0.82, metalness: 0.04,
    color: 0xffffff, side: THREE.DoubleSide, emissive: new THREE.Color('#45453d'), emissiveIntensity: 0.5
  });
  /* 站台墙：细密抹灰起伏 + 竖向板材缝 */
  MAT.stationWall.normalMap = setAniso(texNormalMap('n_stwall', 256, 256, (x, y) => {
    let h = fbm2(x, y, 23, 3) * 0.6;
    if (Math.abs((x % 128) - 0.5) < 1.0) h -= 0.35;
    return h;
  }, 2.4));
  MAT.stationWall.normalScale = new THREE.Vector2(0.8, 0.8);

  MAT.concrete = new THREE.MeshStandardMaterial({
    map: setAniso(texConcrete('#77797b', 0.08, 0)), roughness: 0.9, metalness: 0.03,
    side: THREE.DoubleSide, emissive: new THREE.Color('#111'), emissiveIntensity: 0.35
  });
  MAT.concreteDark = new THREE.MeshStandardMaterial({
    map: setAniso(texConcrete('#4c5053', 0.1, 0)), roughness: 0.95, metalness: 0.02,
    side: THREE.DoubleSide, emissive: new THREE.Color('#232323'), emissiveIntensity: 0.5
  });
  MAT.ballast = new THREE.MeshStandardMaterial({
    map: setAniso(texBallast()), roughness: 0.98, metalness: 0.0, color: 0xbfc2c2, side: THREE.DoubleSide,
    emissive: new THREE.Color('#101010'), emissiveIntensity: 0.4
  });
  MAT.ballast.map.repeat.set(1, 1);
  /* 道砟：碎石颗粒。用高频哈希做颗粒感，凹凸尺度比隧道壁细得多 */
  MAT.ballast.normalMap = setAniso(texNormalMap('n_ballast', 128, 128, (x, y) => {
    return hash2(x >> 1, y >> 1, 7) * 0.7 + fbm2(x, y, 5, 2) * 0.3;
  }, 4.5));
  MAT.ballast.normalScale = new THREE.Vector2(1.4, 1.4);

  MAT.rail = new THREE.MeshStandardMaterial({ color: 0xd7dade, roughness: 0.28, metalness: 0.92, envMapIntensity: 1.2 });
  MAT.sleeper = new THREE.MeshStandardMaterial({ color: 0x9a9d9c, roughness: 0.9, metalness: 0.05 });
  MAT.platform = new THREE.MeshStandardMaterial({ map: setAniso(texPlatformFloor()), roughness: 0.72, metalness: 0.06, color: 0xd7dade, emissive: new THREE.Color('#2e2e2a'), emissiveIntensity: 0.45 });
  MAT.platform.map.repeat.set(2, 24);
  /* 站台地面：地砖网格 + 轻微磨损。砖缝用 32px 周期，与基础色贴图对齐 */
  MAT.platform.normalMap = setAniso(texNormalMap('n_platform', 256, 256, (x, y) => {
    const gx = Math.abs((x % 32) - 0.5), gy = Math.abs((y % 32) - 0.5);
    let h = 0.6;
    if (gx < 1.0 || gy < 1.0) h -= 0.45;      // 砖缝
    h += fbm2(x, y, 41, 2) * 0.25;            // 磨损起伏
    return h;
  }, 2.2));
  MAT.platform.normalScale = new THREE.Vector2(0.9, 0.9);
  MAT.tactile = new THREE.MeshStandardMaterial({ map: setAniso(texTactile()), roughness: 0.8, metalness: 0.02, color: 0xffffff });
  MAT.tactile.map.repeat.set(2, 90);
  MAT.safety = new THREE.MeshStandardMaterial({ color: 0xe8b93a, roughness: 0.7, metalness: 0.05 });
  MAT.darkMetal = new THREE.MeshStandardMaterial({ color: 0x2b3237, roughness: 0.5, metalness: 0.7 });
  MAT.metal = new THREE.MeshStandardMaterial({ color: 0x9aa4aa, roughness: 0.35, metalness: 0.85, envMapIntensity: 1.0 });
  MAT.white = new THREE.MeshStandardMaterial({ color: 0xeef1f1, roughness: 0.5, metalness: 0.05 });
  MAT.psdGlass = new THREE.MeshPhysicalMaterial({
    color: 0xcfe6ee, roughness: 0.04, metalness: 0.12, transparent: true, opacity: 0.13,
    envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false
  });
  MAT.water = new THREE.MeshStandardMaterial({ color: 0x0c2230, roughness: 0.08, metalness: 0.9, envMapIntensity: 1.4 });
  MAT.tree = new THREE.MeshStandardMaterial({ color: 0x1e3320, roughness: 0.95 });
  MAT.trunk = new THREE.MeshStandardMaterial({ color: 0x322a24, roughness: 0.9 });
  MAT.ground = new THREE.MeshStandardMaterial({ map: setAniso(texGround()), roughness: 0.95, metalness: 0.02, color: 0x8a8f90 });
  MAT.ground.map.repeat.set(26, 26);
  MAT.asphalt = new THREE.MeshStandardMaterial({ color: 0x34383a, roughness: 0.96, metalness: 0.02 });
  MAT.sidewalk = new THREE.MeshStandardMaterial({ map: setAniso(texPlatformFloor()), roughness: 0.82, metalness: 0.04, color: 0xb9bfc0 });

  MAT.strip = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 1.08, 0.94), toneMapped: false, fog: false });
  MAT.stripCool = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 1.26, 1.42), toneMapped: false, fog: false });
  MAT.lampWarm = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.6, 1.8), toneMapped: false });
  MAT.lampRed = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 0.25, 0.2), toneMapped: false });
  MAT.lampGreen = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.6, 1.1), toneMapped: false });
  MAT.exitSign = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 1.9, 1.0), toneMapped: false, side: THREE.DoubleSide });

  MAT.bld = [];
  for (let v = 0; v < 3; v++) {
    for (let f = 0; f < 3; f++) {
      const t = texBuilding(v, [10, 20, 34][f]);
      MAT.bld.push(new THREE.MeshStandardMaterial({
        map: setAniso(t.map), emissiveMap: setAniso(t.emissive), emissive: 0xffffff,
        emissiveIntensity: theme.windowGlow, roughness: 0.82, metalness: 0.15, color: 0xffffff
      }));
    }
  }

  /* 存一份快照供下次复用（浅拷贝，材质对象本身共享） */
  const snap = {};
  for (const k in MAT) snap[k] = MAT[k];
  MAT_CACHE.set(key, snap);
  return MAT;
}

function texGround() {
  if (TEX_CACHE.has('ground')) return TEX_CACHE.get('ground');
  const [c, x] = cv2d(512, 512);
  x.fillStyle = '#4e5352'; x.fillRect(0, 0, 512, 512);
  // 街区
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    const v = 62 + Math.random() * 16;
    x.fillStyle = `rgb(${v},${v + 3},${v + 2})`;
    x.fillRect(gx * 128 + 10, gy * 128 + 10, 108, 108);
  }
  // 道路
  x.fillStyle = '#3a3e3f';
  for (let i = 0; i < 4; i++) { x.fillRect(i * 128, 0, 20, 512); x.fillRect(0, i * 128, 512, 20); }
  x.fillStyle = 'rgba(210,200,160,.25)';
  for (let i = 0; i < 4; i++) {
    x.fillRect(i * 128 + 9, 0, 2, 512);
    x.fillRect(0, i * 128 + 9, 512, 2);
  }
  noiseFill(x, 512, 512, 6000, '#000', 0.02, 0.09);
  noiseFill(x, 512, 512, 2000, '#fff', 0.01, 0.04);
  const t = toTex(c, 1, 1);
  TEX_CACHE.set('ground', t);
  return t;
}

/* ---------------- 沿线路挤出截面 ---------------- */
function extrudeAlong(route, i0, i1, profile, mat, opts = {}) {
  const { step = 2, uScale = 6, vScale = 8, closed = true } = opts;
  const prof = profile.slice();
  if (closed) prof.push(prof[0]);
  const cum = [0];
  for (let k = 1; k < prof.length; k++) {
    cum.push(cum[k - 1] + Math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]));
  }
  const rings = Math.max(2, Math.floor((i1 - i0) / step) + 1);
  const vc = prof.length;
  const pos = new Float32Array(rings * vc * 3);
  const uv = new Float32Array(rings * vc * 2);
  const idx = [];
  let vi = 0, ui = 0;
  for (let r = 0; r < rings; r++) {
    const i = Math.min(i1, i0 + r * step);
    const p = route.P[i], right = route.R[i], up = route.U[i];
    const s = route.S[i];
    for (let k = 0; k < vc; k++) {
      pos[vi++] = p.x + right.x * prof[k][0] + up.x * prof[k][1];
      pos[vi++] = p.y + right.y * prof[k][0] + up.y * prof[k][1];
      pos[vi++] = p.z + right.z * prof[k][0] + up.z * prof[k][1];
      uv[ui++] = cum[k] / uScale;
      uv[ui++] = s / vScale;
    }
  }
  for (let r = 0; r < rings - 1; r++) {
    for (let k = 0; k < vc - 1; k++) {
      const a = r * vc + k, b = a + 1, c = a + vc, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return new THREE.Mesh(g, mat);
}

/* ---------------- 轨道 ---------------- */
function buildTrack(route, group, quality) {
  const i0 = 0, i1 = route.N;
  // 道床
  const bedProfile = [[-7.3, -0.98], [-5.9, -0.36], [5.9, -0.36], [7.3, -0.98]];
  const bed = extrudeAlong(route, i0, i1, bedProfile, MAT.ballast, { step: 2, uScale: 4, vScale: 4 });
  group.add(bed);
  // 四条钢轨
  const railProf = [[-0.04, -0.17], [0.04, -0.17], [0.04, -0.015], [0.028, 0], [-0.028, 0], [-0.04, -0.015]];
  for (const off of [-TRACK_LAT - RAIL_HALF, -TRACK_LAT + RAIL_HALF, TRACK_LAT - RAIL_HALF, TRACK_LAT + RAIL_HALF]) {
    const p = railProf.map(([a, b]) => [a + off, b]);
    group.add(extrudeAlong(route, i0, i1, p, MAT.rail, { step: 2, uScale: 1, vScale: 2 }));
  }
  // 轨枕
  const stepM = 1.35;
  const count = Math.floor(route.length / stepM) * 2;
  const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(2.5, 0.16, 0.26), MAT.sleeper, count);
  const dummy = new THREE.Object3D();
  let n = 0;
  for (let tr = 0; tr < 2; tr++) {
    const lat = tr === 0 ? -TRACK_LAT : TRACK_LAT;
    for (let s = 1; s < route.length - 1; s += stepM) {
      const f = route.frameAt(s);
      dummy.position.copy(f.pos).addScaledVector(f.right, lat).addScaledVector(f.up, -0.3);
      dummy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.right, f.up, f.tan));
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      sleepers.setMatrixAt(n++, dummy.matrix);
      if (n >= count) break;
    }
    if (n >= count) break;
  }
  sleepers.count = n;
  sleepers.instanceMatrix.needsUpdate = true;
  sleepers.frustumCulled = false;
  group.add(sleepers);

  // 接触网（明线区段）；第三轨线路不架接触网
  const third = (typeof line !== 'undefined' && line && line.thirdRail);
  if (!third) buildCatenary(route, group);
  else buildThirdRail(route, group);
}

/* 第三轨受流：轨旁导电轨 + 防护罩 */
function buildThirdRail(route, group) {
  for (const side of [-1, 1]) {
    const off = side * (TRACK_LAT + RAIL_HALF + 0.34);
    const prof = [[-0.07, 0.14], [0.07, 0.14], [0.07, 0.24], [-0.07, 0.24]];
    const p = prof.map(([a, b]) => [a + off, b]);
    group.add(extrudeAlong(route, 0, route.N, p, MAT.rail, { step: 3, uScale: 1, vScale: 1 }));
    // 防护罩（上方盖板）
    const cover = [[off - 0.18, 0.34], [off + 0.18, 0.34], [off + 0.18, 0.38], [off - 0.18, 0.38]];
    group.add(extrudeAlong(route, 0, route.N, cover, new THREE.MeshStandardMaterial({ color: 0x39433f, roughness: 0.8 }), { step: 4, uScale: 2, vScale: 2 }));
    // 绝缘支架
    const n = Math.floor(route.length / 6);
    const br = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.24, 0.16), new THREE.MeshStandardMaterial({ color: 0x8a7f5e, roughness: 0.7 }), n);
    const d = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const f = route.frameAt(i * 6 + 2);
      d.position.copy(f.pos).addScaledVector(f.right, off).addScaledVector(f.up, 0.16);
      d.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.right, f.up, f.tan));
      d.updateMatrix();
      br.setMatrixAt(i, d.matrix);
    }
    br.instanceMatrix.needsUpdate = true; br.frustumCulled = false;
    group.add(br);
  }
}

function buildCatenary(route, group) {
  const wireMat = new THREE.LineBasicMaterial({ color: 0x3d4448, transparent: true, opacity: 0.9 });
  const pts = [[], []];
  for (let s = 0; s <= route.length; s += 10) {
    const f = route.frameAt(s);
    for (let tr = 0; tr < 2; tr++) {
      const lat = tr === 0 ? -TRACK_LAT : TRACK_LAT;
      const p = f.pos.clone().addScaledVector(f.right, lat).addScaledVector(f.up, 4.85);
      pts[tr].push(p);
    }
  }
  for (let tr = 0; tr < 2; tr++) {
    const g = new THREE.BufferGeometry().setFromPoints(pts[tr]);
    group.add(new THREE.Line(g, wireMat));
  }
  // 吊弦
  const drop = [];
  for (let s = 0; s <= route.length; s += 24) {
    const f = route.frameAt(s);
    for (let tr = 0; tr < 2; tr++) {
      const lat = tr === 0 ? -TRACK_LAT : TRACK_LAT;
      const a = f.pos.clone().addScaledVector(f.right, lat).addScaledVector(f.up, 4.85);
      const b = a.clone().add(new THREE.Vector3(0, 1.15, 0));
      drop.push(a, b);
    }
  }
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(drop), wireMat));

  // 支柱（仅在无隧道区段）
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7.4, 8);
  const armGeo = new THREE.BoxGeometry(4.4, 0.09, 0.09);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x565b5d, roughness: 0.6, metalness: 0.5 });
  const positions = [];
  for (let s = 30; s < route.length; s += 26) {
    const i = Math.round(s / route.ds);
    if (route.P[i].y < -2.2) continue;
    for (const side of [-1, 1]) {
      positions.push({ s, side });
    }
  }
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, positions.length);
  const arms = new THREE.InstancedMesh(armGeo, poleMat, positions.length);
  const d = new THREE.Object3D();
  positions.forEach((p, k) => {
    const f = route.frameAt(p.s);
    const base = f.pos.clone().addScaledVector(f.right, p.side * (TRACK_LAT + 3.4));
    base.y = Math.max(0, base.y - 0.5);
    d.position.copy(base).add(new THREE.Vector3(0, 3.7, 0));
    d.rotation.set(0, 0, 0);
    d.updateMatrix();
    poles.setMatrixAt(k, d.matrix);
    const armPos = f.pos.clone().addScaledVector(f.right, p.side * (TRACK_LAT + 2.1)).addScaledVector(f.up, 5.55);
    d.position.copy(armPos);
    d.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.right, f.up, f.tan));
    d.scale.set(p.side * 1, 1, 1);
    d.updateMatrix();
    arms.setMatrixAt(k, d.matrix);
  });
  poles.instanceMatrix.needsUpdate = true; arms.instanceMatrix.needsUpdate = true;
  poles.frustumCulled = false; arms.frustumCulled = false;
  group.add(poles, arms);
}

/* ---------------- 隧道 ---------------- */
function tunnelRanges(route) {
  const runs = [];
  let cur = null;
  const skip = route.stations.filter(s => s.y < -2).map(s => [s.s - 74, s.s + 74]);
  for (let i = 0; i <= route.N; i += 1) {
    const s = route.S[i];
    const inSkip = skip.some(([a, b]) => s > a && s < b);
    const isT = route.P[i].y < -1.7 && !inSkip;
    if (isT && !cur) cur = { a: i, b: i };
    else if (isT && cur) cur.b = i;
    else if (!isT && cur) { if (cur.b - cur.a > 3) runs.push(cur); cur = null; }
  }
  if (cur && cur.b - cur.a > 3) runs.push(cur);
  return runs;
}

/* 沿线路生成一条「面向下」的发光带（隧道灯带）。
   原来是 THREE.Line（1 像素线宽），在 1080p 以上会细到看不见，
   而且在弯道里会因线段角度变化而闪烁。改成实心带状几何：
   每个采样点向左右各扩展 width/2，相邻两点之间连成两个三角形。 */
function ceilingRibbon(route, a, b, width, yOff, mat, step) {
  const pos = [];
  const idx = [];
  const st = step || 2;
  let n = 0;
  for (let i = a; i <= b; i += st) {
    const p = route.P[i], u = route.U[i], r = route.R[i];
    const cx = p.x + u.x * yOff, cy = p.y + u.y * yOff, cz = p.z + u.z * yOff;
    const hw = width / 2;
    pos.push(cx - r.x * hw, cy - r.y * hw, cz - r.z * hw);
    pos.push(cx + r.x * hw, cy + r.y * hw, cz + r.z * hw);
    if (n > 0) {
      const k = (n - 1) * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
    n++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

function buildTunnels(route, group) {
  const R = TUNNEL_R, spring = 3.1, rise = 2.35;
  const prof = [[-R, -0.42], [-R, spring]];
  const steps = 14;
  for (let k = 1; k < steps; k++) {
    const a = PI - PI * (k / steps);
    prof.push([R * Math.cos(a), spring + rise * Math.sin(a)]);
  }
  prof.push([R, spring], [R, -0.42]);

  const runs = tunnelRanges(route);
  for (const run of runs) {
    const m = extrudeAlong(route, run.a, run.b, prof, MAT.tunnel, { step: 2, uScale: 7, vScale: 7 });
    group.add(m);

    // 顶部灯带：实心带状（原来是 1px 的 Line，高分屏下会消失）
    const stripMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.2, 2.1, 1.7), toneMapped: false, fog: false, side: THREE.DoubleSide
    });
    const strip = ceilingRibbon(route, run.a, run.b, 0.22, TUNNEL_R - 0.55, stripMat, 2);
    strip.frustumCulled = false;
    group.add(strip);

    // 环向灯（每 22m）
    const lampGeo = new THREE.BoxGeometry(0.6, 0.1, 0.32);
    const cnt = Math.floor((route.S[run.b] - route.S[run.a]) / 22);
    const lamps = new THREE.InstancedMesh(lampGeo, MAT.lampWarm, Math.max(1, cnt));
    const d = new THREE.Object3D();
    for (let k = 0; k < cnt; k++) {
      const s = route.S[run.a] + k * 22 + 6;
      const f = route.frameAt(s);
      d.position.copy(f.pos).addScaledVector(f.up, TUNNEL_R - 0.5);
      d.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.right, f.up, f.tan));
      d.updateMatrix();
      lamps.setMatrixAt(k, d.matrix);
    }
    lamps.count = cnt;
    lamps.instanceMatrix.needsUpdate = true;
    lamps.frustumCulled = false;
    group.add(lamps);

    // 疏散指示
    for (let s = route.S[run.a] + 40; s < route.S[run.b] - 20; s += 120) {
      const f = route.frameAt(s);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), MAT.exitSign);
      sign.position.copy(f.pos).addScaledVector(f.right, R - 0.3).addScaledVector(f.up, 2.35);
      sign.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.tan.clone().negate(), f.up, f.right.clone().negate()));
      group.add(sign);
    }

    // 洞口门框
    for (const [idx, dir] of [[run.a, -1], [run.b, 1]]) {
      const f = route.frameAt(route.S[idx]);
      const frame = new THREE.Group();
      frame.position.copy(f.pos);
      frame.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.right, f.up, f.tan));
      const wallMat = MAT.concrete;
      const mk = (w, h, d2, x, y, z) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d2), wallMat);
        b.position.set(x, y, z); frame.add(b);
      };
      mk(3.2, 9.4, 1.4, -R - 1.5, 3.2, 0);
      mk(3.2, 9.4, 1.4, R + 1.5, 3.2, 0);
      mk(2 * R + 6.4, 3.0, 1.4, 0, 7.6, 0);
      group.add(frame);
    }
  }
}

/* ---------------- 高架 ---------------- */
function buildViaduct(route, group) {
  const deckProf = [[-7.4, -0.34], [-7.35, -1.15], [-6.2, -1.55], [6.2, -1.55], [7.35, -1.15], [7.4, -0.34]];
  const runs = [];
  let cur = null;
  for (let i = 0; i <= route.N; i++) {
    const on = route.P[i].y > 3.2;
    if (on && !cur) cur = { a: i, b: i };
    else if (on && cur) cur.b = i;
    else if (!on && cur) { if (cur.b - cur.a > 4) runs.push(cur); cur = null; }
  }
  if (cur && cur.b - cur.a > 4) runs.push(cur);

  for (const run of runs) {
    group.add(extrudeAlong(route, run.a, run.b, deckProf, MAT.concrete, { step: 2, uScale: 5, vScale: 5 }));
    // 护栏
    for (const side of [-1, 1]) {
      const p = [[side * 5.45, -0.34], [side * 5.45, 0.86], [side * 5.2, 0.96], [side * 5.2, -0.34]];
      group.add(extrudeAlong(route, run.a, run.b, p, MAT.concreteDark, { step: 3, uScale: 4, vScale: 4 }));
    }
    // 桥墩
    const spanStep = 26;
    const s0 = route.S[run.a], s1 = route.S[run.b];
    const cnt = Math.max(1, Math.floor((s1 - s0) / spanStep));
    const pierGeo = new THREE.CylinderGeometry(0.95, 1.08, 1, 16);   // 圆台桥墩
    const capGeo = new RoundedBoxGeometry(9.6, 1.1, 1.6, 2, 0.16);   // 盖梁倒圆
    const pierMat = MAT.concrete;
    const piers = new THREE.InstancedMesh(pierGeo, pierMat, cnt);
    const caps = new THREE.InstancedMesh(capGeo, pierMat, cnt);
    const d = new THREE.Object3D();
    for (let k = 0; k < cnt; k++) {
      const s = s0 + k * spanStep + 8;
      const f = route.frameAt(s);
      const h = Math.max(2.5, f.pos.y - 1.6);
      d.position.copy(f.pos); d.position.y = h / 2;
      d.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.right, f.up, f.tan));
      d.scale.set(1, h, 1);
      d.updateMatrix(); piers.setMatrixAt(k, d.matrix);
      d.position.copy(f.pos); d.position.y = f.pos.y - 1.9;
      d.scale.set(1, 1, 1); d.updateMatrix(); caps.setMatrixAt(k, d.matrix);
    }
    piers.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true;
    piers.frustumCulled = false; caps.frustumCulled = false;
    group.add(piers, caps);
  }
}

/* ---------------- 地面 / 河流 ---------------- */
function buildGround(route, group) {
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000, 1, 1), MAT.ground);
  plane.rotation.x = -PI / 2;
  plane.position.y = -0.05;
  plane.receiveShadow = true;
  group.add(plane);

  // 黄浦江
  const cps = RIVER_PATH.map(([la, lo]) => {
    const p = route.projectLL(la, lo);
    return new THREE.Vector3(p.x, 0, p.z);
  });
  const curve = new THREE.CatmullRomCurve3(cps, false, 'catmullrom', 0.5);
  const N = 160;
  const pts = curve.getSpacedPoints(N);
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const p = pts[i];
    const t = (i < N ? pts[i + 1].clone().sub(p) : p.clone().sub(pts[i - 1])).normalize();
    const n = new THREE.Vector3(-t.z, 0, t.x);
    const a = p.clone().addScaledVector(n, RIVER_WIDTH / 2);
    const b = p.clone().addScaledVector(n, -RIVER_WIDTH / 2);
    pos.push(a.x, 0.04, a.z, b.x, 0.04, b.z);
    uv.push(0, i / 8, 1, i / 8);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const water = new THREE.Mesh(g, MAT.water);
  water.receiveShadow = false;
  group.add(water);

  // 河岸
  const bankMat = new THREE.MeshStandardMaterial({ color: 0x5c605f, roughness: 0.9 });
  for (const side of [1, -1]) {
    const bp = [], bi = [];
    for (let i = 0; i <= N; i++) {
      const p = pts[i];
      const t = (i < N ? pts[i + 1].clone().sub(p) : p.clone().sub(pts[i - 1])).normalize();
      const n = new THREE.Vector3(-t.z, 0, t.x).multiplyScalar(side * RIVER_WIDTH / 2);
      const a = p.clone().add(n);
      bp.push(a.x, -0.1, a.z, a.x, 0.9, a.z);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      if (side > 0) bi.push(a, c, b, b, c, d); else bi.push(a, b, c, b, d, c);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    bg.setIndex(bi); bg.computeVertexNormals();
    group.add(new THREE.Mesh(bg, bankMat));
  }
  return { riverPts: pts };
}

function distToRiver(x, z, pts) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i += 2) {
    const ax = pts[i].x, az = pts[i].z, bx = pts[i + 1].x, bz = pts[i + 1].z;
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    const px = ax + dx * t, pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) best = d;
  }
  return best;
}

/* ---------------- 城市 ---------------- */
function buildCity(route, group, riverPts) {
  const cbd = [{ x: 0, z: 0, r: 0, p: 0 }];
  const lujiazui = route.projectLL(31.2365, 121.5055);
  const peopleSq = route.projectLL(31.2329, 121.4696);
  const xujiahui = route.projectLL(31.1936, 121.4363);
  const hongkou = route.projectLL(31.2689, 121.4793);
  const centers = [
    { x: lujiazui.x, z: lujiazui.z, r: 900, h: 250 },
    { x: peopleSq.x, z: peopleSq.z, r: 1600, h: 95 },
    { x: xujiahui.x, z: xujiahui.z, r: 1200, h: 80 },
    { x: hongkou.x, z: hongkou.z, r: 1200, h: 60 }
  ];
  const heightAt = (x, z) => {
    let h = 14 + RNG() * 16;
    for (const c of centers) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r) h = Math.max(h, c.h * Math.pow(1 - d / c.r, 1.8) + 12);
    }
    return h;
  };
  const buckets = [[], [], []];
  const rng = mulberry32(77123);
  for (let s = 240; s < route.length - 200; s += 44) {
    const f = route.frameAt(s);
    for (const side of [-1, 1]) {
      const n = 2 + Math.floor(rng() * 2);
      for (let k = 0; k < n; k++) {
        const lat = side * (40 + rng() * 300);
        const along = (rng() - 0.5) * 40;
        const p = f.pos.clone().addScaledVector(f.right, lat).addScaledVector(f.tan, along);
        if (distToRiver(p.x, p.z, riverPts) < RIVER_WIDTH / 2 + 26) continue;
        let nearStation = false;
        for (const st of route.stations) {
          if (Math.hypot(p.x - st.frame.pos.x, p.z - st.frame.pos.z) < 34) { nearStation = true; break; }
          if (st.y < -2) {
            const ex = st.frame.pos.clone().addScaledVector(st.frame.right, 14).addScaledVector(st.frame.tan, 47);
            if (Math.hypot(p.x - ex.x, p.z - ex.z) < 45) { nearStation = true; break; }
          }
        }
        if (nearStation) continue;
        const h = heightAt(p.x, p.z) * (0.55 + rng() * 0.9);
        const w = 22 + rng() * 30, dp = 22 + rng() * 32;
        const cls = h < 30 ? 0 : h < 85 ? 1 : 2;
        buckets[cls].push({ x: p.x, y: 0, z: p.z, w, h, d: dp, rot: Math.atan2(f.tan.x, f.tan.z) + (rng() - 0.5) * 0.18, c: rng() });
      }
    }
  }
  for (let c = 0; c < 3; c++) {
    const arr = buckets[c];
    if (!arr.length) continue;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = MAT.bld[c * 3 + Math.floor(RNG() * 3)] || MAT.bld[0];
    const im = new THREE.InstancedMesh(geo, mat, arr.length);
    const d = new THREE.Object3D();
    arr.forEach((b, i) => {
      d.position.set(b.x, b.h / 2, b.z);
      d.rotation.set(0, b.rot, 0);
      d.scale.set(b.w, b.h, b.d);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = false; im.receiveShadow = false;
    im.frustumCulled = false;
    group.add(im);
  }

  // 树木
  const treeN = 320;
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.22, 2.2, 5);
  const crownGeo = new THREE.IcosahedronGeometry(1.7, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, MAT.trunk, treeN);
  const crowns = new THREE.InstancedMesh(crownGeo, MAT.tree, treeN);
  const dt = new THREE.Object3D();
  let tn = 0;
  for (let i = 0; i < treeN * 3 && tn < treeN; i++) {
    const s = 200 + RNG() * (route.length - 400);
    const f = route.frameAt(s);
    const side = RNG() < 0.5 ? -1 : 1;
    const p = f.pos.clone().addScaledVector(f.right, side * (14 + RNG() * 24));
    if (distToRiver(p.x, p.z, riverPts) < RIVER_WIDTH / 2 + 8) continue;
    const h = 1 + RNG() * 0.8;
    dt.position.set(p.x, 1.1 * h, p.z); dt.rotation.set(0, RNG() * TAU, 0); dt.scale.set(h, h, h);
    dt.updateMatrix(); trunks.setMatrixAt(tn, dt.matrix);
    dt.position.y = 2.6 * h; dt.scale.set(h * (0.8 + RNG() * 0.5), h, h * (0.8 + RNG() * 0.5));
    dt.updateMatrix(); crowns.setMatrixAt(tn, dt.matrix);
    tn++;
  }
  trunks.count = tn; crowns.count = tn;
  trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true;
  trunks.frustumCulled = false; crowns.frustumCulled = false;
  group.add(trunks, crowns);
}

/* ---------------- 地标 ---------------- */
function buildLandmarks(route, group, theme) {
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.5, 1.1), toneMapped: false });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x2b4050, roughness: 0.12, metalness: 0.85, envMapIntensity: 1.3,
    emissive: new THREE.Color(0x1a2a3a), emissiveIntensity: 0.5
  });
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0xb9b3a8, roughness: 0.8, metalness: 0.1 });

  for (const lm of LANDMARKS) {
    const p = route.projectLL(lm.lat, lm.lon);
    let nearest = 1e9;
    for (const st of route.stations) nearest = Math.min(nearest, Math.hypot(p.x - st.frame.pos.x, p.z - st.frame.pos.z));
    if (nearest > 3600) continue;
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);

    if (lm.kind === 'pearl') {
      // 三根斜撑
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 5.2, 150, 10), concreteMat);
        leg.position.set(Math.cos(a) * 26, 75, Math.sin(a) * 26);
        leg.rotation.z = Math.cos(a) * 0.17; leg.rotation.x = -Math.sin(a) * 0.17;
        g.add(leg);
      }
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(7, 11, 300, 16), concreteMat);
      shaft.position.y = 150; g.add(shaft);
      for (const [y, r] of [[112, 28], [263, 23], [350, 14]]) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshStandardMaterial({
          color: 0xd94a63, roughness: 0.25, metalness: 0.5, emissive: 0xb01f3a, emissiveIntensity: 0.9
        }));
        s.position.y = y; g.add(s);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.008, 0.7, 6, 32), glow);
        ring.position.y = y; ring.rotation.x = PI / 2; g.add(ring);
      }
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.2, 110, 8), concreteMat);
      ant.position.y = 405; g.add(ant);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8), MAT.lampRed);
      tip.position.y = 462; g.add(tip);
    } else if (lm.kind === 'twist') {
      const seg = 26, total = lm.h;
      for (let i = 0; i < seg; i++) {
        const t = i / seg;
        const w = lerp(62, 34, t), d = lerp(58, 30, t);
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, total / seg * 1.02, d), glassMat);
        b.position.y = total * (i + 0.5) / seg;
        b.rotation.y = t * 0.9;
        g.add(b);
      }
      const crown = new THREE.Mesh(new THREE.BoxGeometry(36, 8, 32), glow);
      crown.position.y = total; g.add(crown);
    } else if (lm.kind === 'swfc') {
      const b = new THREE.Mesh(new THREE.BoxGeometry(58, 430, 58), glassMat);
      b.position.y = 215; b.scale.set(1, 1, 1); g.add(b);
      const top = new THREE.Mesh(new THREE.BoxGeometry(56, 62, 56), glassMat);
      top.position.y = 461; g.add(top);
      // 顶部风洞
      const hole = new THREE.Mesh(new THREE.BoxGeometry(24, 30, 60), new THREE.MeshBasicMaterial({ color: 0x05080c }));
      hole.position.y = 452; g.add(hole);
    } else if (lm.kind === 'jinmao') {
      const tiers = [[54, 52, 190], [44, 42, 80], [36, 34, 60], [28, 26, 42], [20, 18, 30]];
      let y = 0;
      for (const [w, d, h] of tiers) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({
          color: 0x8b8172, roughness: 0.35, metalness: 0.75, envMapIntensity: 1.2
        }));
        b.position.y = y + h / 2; g.add(b);
        const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 1.2, d + 0.6), glow);
        band.position.y = y + h; g.add(band);
        y += h;
      }
      const spire = new THREE.Mesh(new THREE.ConeGeometry(8, 42, 8), MAT.metal);
      spire.position.y = y + 21; g.add(spire);
    } else if (lm.kind === 'bund') {
      const warmMat = new THREE.MeshStandardMaterial({
        color: 0x6b5f4c, roughness: 0.75, metalness: 0.15,
        emissive: new THREE.Color(0xffc07a), emissiveIntensity: 0.55
      });
      for (let i = 0; i < 9; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(30 + RNG() * 14, 26 + RNG() * 16, 22), warmMat);
        b.position.set(0, b.geometry.parameters.height / 2, -180 + i * 44);
        b.rotation.y = PI / 2;
        g.add(b);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 8), new THREE.MeshStandardMaterial({ color: 0x5b6158, roughness: 0.5, metalness: 0.5 }));
        dome.position.set(0, b.geometry.parameters.height + 5, -180 + i * 44);
        g.add(dome);
      }
    } else if (lm.kind === 'stadium') {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(95, 88, 34, 36, 1, true), new THREE.MeshStandardMaterial({
        color: 0x9aa3a6, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide
      }));
      ring.position.y = 17; g.add(ring);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(98, 98, 5, 36), new THREE.MeshStandardMaterial({ color: 0xc9d3d6, roughness: 0.4, metalness: 0.4 }));
      roof.position.y = 36; g.add(roof);
      const field = new THREE.Mesh(new THREE.CylinderGeometry(70, 70, 1.4, 36), new THREE.MeshStandardMaterial({ color: 0x22451f, roughness: 0.95 }));
      field.position.y = 1.5; g.add(field);
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * TAU;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 40, 6), MAT.metal);
        post.position.set(Math.cos(a) * 96, 20, Math.sin(a) * 96); g.add(post);
      }
    } else if (lm.kind === 'museum') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(120, 22, 90), new THREE.MeshStandardMaterial({ color: 0xb9bdbd, roughness: 0.5, metalness: 0.4 }));
      base.position.y = 11; g.add(base);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(38, 24, 16, 0, TAU, 0, PI / 2), new THREE.MeshPhysicalMaterial({
        color: 0x9fc6d8, roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.55, envMapIntensity: 1.3
      }));
      dome.position.y = 22; g.add(dome);
    }
    group.add(g);
  }
}
