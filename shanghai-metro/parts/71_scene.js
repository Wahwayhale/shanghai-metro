/* ================================================================
   菜单场景与线路世界构建
   （由 70_game.js 拆分而来，逻辑未改动）
   ================================================================ */

/* ---- PMREM 环境贴图缓存（P1-1）----
   PMREMGenerator.fromScene() 会把天空盒渲染成一个立方体再预滤波，
   是整条加载链里最贵的一步（实测挂在「初始化材质」标签下约 2 s）。
   它只依赖 theme，因此按 theme.windowGlow 缓存即可复用。
   注意：缓存的是 texture，不随场景销毁；PMREM 生成器本身用完即弃。 */
const ENV_CACHE = new Map();

function envTextureFor(theme2) {
  const key = String(theme2.windowGlow);
  if (ENV_CACHE.has(key)) return ENV_CACHE.get(key);
  const pm = new THREE.PMREMGenerator(renderer);
  const es = new THREE.Scene(); es.add(createSky(theme2));
  let tex = null;
  try {
    tex = pm.fromScene(es, 0.02).texture;
  } catch (e) {
    console.warn('[PMREM] 降级', e);
  }
  /* 生成器用完释放，只留贴图 */
  try { pm.dispose(); } catch (e) { /* 忽略 */ }
  ENV_CACHE.set(key, tex);
  return tex;
}

/* ---------------------------------------------------------------- 菜单场景 */
function buildHero() {
  const th = THEMES[G.tod];
  const s = new THREE.Scene();
  s.fog = new THREE.FogExp2(th.fog, 0.0022);
  s.add(createSky(th));
  const env = envTextureFor(th);
  if (env) s.environment = env;
  const sunL = new THREE.DirectionalLight(th.sun, th.sunI * 2.4);
  sunL.position.set(-70, 26, 40);
  s.add(sunL);
  const fill = new THREE.DirectionalLight(0xd6e4f0, 2.3);
  fill.position.set(60, 24, 70);
  s.add(fill);
  s.add(new THREE.HemisphereLight(0xb9d3e8, 0x33302a, th.hemi * 1.5));
  renderer.toneMappingExposure = 1.5;

  // 地面
  const g = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: 0x3a3e3f, roughness: 0.92 }));
  g.rotation.x = -PI / 2; g.position.y = -0.1; s.add(g);

  // 轨道
  const bal = new THREE.Mesh(new THREE.BoxGeometry(11, 0.4, 340), new THREE.MeshStandardMaterial({ map: texBallast(), roughness: 0.95, color: 0xbfc4c4 }));
  bal.position.set(0, -0.22, 30); s.add(bal);
  for (const off of [-3.1175, -1.6825, 1.6825, 3.1175]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 340), MAT.rail);
    r.position.set(off, -0.04, 30); s.add(r);
  }
  // 站台
  const plat = new THREE.Mesh(new THREE.BoxGeometry(8, 1.5, 220), new THREE.MeshStandardMaterial({ map: texPlatformFloor(), roughness: 0.7, color: 0xd2d8d8 }));
  plat.position.set(-8, 0.62, 30); s.add(plat);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 220), MAT.safety);
  edge.position.set(-4.02, 0.62, 30); s.add(edge);
  const tactile = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 220), MAT.tactile);
  tactile.position.set(-4.7, 1.08, 30); s.add(tactile);
  const platLight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 218), MAT.stripCool);
  platLight.position.set(-4.0, 1.0, 30); s.add(platLight);
  for (let i = 0; i < 5; i++) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 5.4, 10), MAT.metal);
    col.position.set(-9.2, 3.4, -50 + i * 40); s.add(col);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(15, 0.28, 220), new THREE.MeshStandardMaterial({ color: 0xe4e9e8, roughness: 0.35, metalness: 0.45 }));
  roof.position.set(-8, 6.2, 30); s.add(roof);
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(15.4, 0.7, 220), new THREE.MeshStandardMaterial({
    color: new THREE.Color(line.color), roughness: 0.5, metalness: 0.25, emissive: new THREE.Color(line.color), emissiveIntensity: 0.25
  }));
  fascia.position.set(-8, 6.65, 30); s.add(fascia);
  // 雨棚灯带
  for (let i = 0; i < 26; i++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(6, 0.06, 0.3), MAT.strip);
    l.position.set(-8, 6.0, -70 + i * 8); s.add(l);
  }
  // 站台吊挂站名牌
  const signMat = new THREE.MeshStandardMaterial({
    map: texStationSign(line.stations[0], line, line.stations[1].zh), roughness: 0.5, metalness: 0.05,
    emissive: 0xffffff, emissiveMap: texStationSign(line.stations[0], line, line.stations[1].zh), emissiveIntensity: 0.55
  });
  for (const z of [10, 58]) {
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), signMat);
    sg.position.set(-7.4, 4.3, z); sg.material.side = THREE.DoubleSide;
    s.add(sg);
  }
  // 远景天际线（带亮窗）
  const rng = mulberry32(4242);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 90; i++) {
    const h = 24 + rng() * 150;
    const w = 16 + rng() * 30;
    const b = new THREE.Mesh(boxGeo, MAT.bld[Math.floor(rng() * 9)]);
    b.position.set(-320 + rng() * 760, h / 2, -150 - rng() * 460);
    b.scale.set(w, h, w * (0.7 + rng() * 0.6));
    s.add(b);
  }

  // 列车
  const fakeRoute = {
    frameAt: () => ({ pos: new THREE.Vector3(), tan: new THREE.Vector3(0, 0, 1), right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) }),
    stations: line ? line.stations : []
  };
  const t = new Train(line, fakeRoute, { cars: 3, player: false, dest: line.stations[line.stations.length - 1] });
  t.cars.forEach((c, i) => { c.group.position.set(0, 0, 34 - i * CAR_PITCH); });
  s.add(t.group);
  hero = { scene: s, train: t, t: 0, cam: camera };
  return hero;
}

function updateHero(dt) {
  if (!hero) return;
  hero.t += dt;
  const a = 0.62 + Math.sin(hero.t * 0.06) * 0.3;
  const R = 33;
  const cx = Math.sin(a) * R, cz = 26 + Math.cos(a) * R;
  const cy = 6.2 + Math.sin(hero.t * 0.1) * 0.7;
  const target = new THREE.Vector3(0, 2.4, 10);
  const dir = target.clone().sub(new THREE.Vector3(cx, cy, cz)).normalize();
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  target.addScaledVector(right, -8.5);
  if (hero.t < 0.05) camera.position.set(cx, cy, cz);
  else camera.position.lerp(new THREE.Vector3(cx, cy, cz), 0.05);
  camera.lookAt(target);
  camera.fov = 46; camera.updateProjectionMatrix();
}
/* ---------------------------------------------------------------- 世界构建 */
/* 分帧让出：原来只有 rAF + setTimeout(0)，浏览器拿到的是「立即执行」，
   长任务仍是 2 s 级。现在按预算让出：每片最多占用 12 ms，
   超过就让出一帧，让加载条能刷新、浏览器不判定为卡死。
   frameBudget 可用 ?fast=1 关闭（自动化测试不需要可视反馈）。 */
const FRAME_BUDGET = (typeof location !== 'undefined' && /[?&]fast=1/.test(location.search)) ? 1e9 : 12;

async function loadStep(label, pct) {
  $('loadStep').textContent = label;
  $('loadFill').style.width = Math.round(pct * 100) + '%';
  $('loadPct').textContent = Math.round(pct * 100) + '%';
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
}

/* 把一个长循环切成若干片，每片结束让出一次。
   items 可以是数组或数字（次数）；fn 收到 (index, item)。 */
async function chunked(items, fn, label, pctFrom, pctTo) {
  const n = typeof items === 'number' ? items : items.length;
  if (!n) return;
  let sliceStart = performance.now();
  for (let i = 0; i < n; i++) {
    fn(i, typeof items === 'number' ? i : items[i]);
    if (performance.now() - sliceStart > FRAME_BUDGET) {
      sliceStart = performance.now();
      if (label) {
        const p = pctFrom + (pctTo - pctFrom) * (i / n);
        $('loadFill').style.width = Math.round(p * 100) + '%';
        $('loadPct').textContent = Math.round(p * 100) + '%';
      }
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
    }
  }
}

async function buildService(routeIdx, reverse) {
  routeDef = ROUTES[routeIdx];
  const baseLine = LINES[routeDef.line];
  // 路由可覆盖站表（支线 / 共线段），环线和停站计划交路不支持反向
  if (routeDef.loop || routeDef.stopPlan) reverse = false;
  G.stopPlan = routeDef.stopPlan ? new Set(routeDef.stopPlan) : null;
  const srcStations = routeDef.stations || baseLine.stations;
  // 反向值乘：站点倒序，终点变起点
  line = Object.assign({}, baseLine, {
    stations: reverse ? srcStations.slice().reverse().map((st) => Object.assign({}, st, { tr: st.tr })) : srcStations
  });
  G.reverse = !!reverse;
  theme = THEMES[G.tod];
  G.routeIdx = routeIdx;
  renderer.toneMappingExposure = theme.exposure;

  await loadStep('正在解算线路中心线…', 0.04);
  path = new RoutePath(routeDef, line);

  await loadStep('正在初始化材质…', 0.1);
  initMaterials(renderer, theme);
  matInited = true;

  const s = new THREE.Scene();
  scene = s;
  s.fog = new THREE.FogExp2(theme.fog, theme.fogD);
  skyMesh = createSky(theme);
  s.add(skyMesh);
  /* 同一主题的环境贴图在菜单 hero 场景里已经生成过，这里直接复用。
     之前每次进线路都重跑一次 fromScene，是「初始化材质」耗时 2 s 的主因。 */
  const env = envTextureFor(theme);
  if (env) s.environment = env;

  hemi = new THREE.HemisphereLight(0xc2d8e8, 0x2c2a22, theme.hemi);
  s.add(hemi);
  s.add(new THREE.AmbientLight(0xffffff, theme.amb * 0.35));
  sun = new THREE.DirectionalLight(theme.sun, theme.sunI);
  sun.position.copy(theme.sunDir).multiplyScalar(200);
  sun.castShadow = G.quality !== 'low';
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.4;
  s.add(sun); s.add(sun.target);

  stationLights = [];
  for (let i = 0; i < SL_OFF.length; i++) {
    const L = new THREE.PointLight(0xffeccf, 0, 85, 2);
    s.add(L);
    stationLights.push(L);
  }

  const root = new THREE.Group();
  worldGroup = root;
  s.add(root);

  await loadStep('正在铺设轨道与道床…', 0.2);
  buildTrack(path, root, G.quality);

  await loadStep('正在开挖隧道…', 0.33);
  buildTunnels(path, root);

  await loadStep('正在架设高架桥…', 0.42);
  buildViaduct(path, root);

  await loadStep('正在还原黄浦江与地面…', 0.5);
  const river = buildGround(path, root);

  await loadStep('正在生成沿线城市…', 0.6);
  buildCity(path, root, river.riverPts);

  await loadStep('正在布置地标建筑…', 0.7);
  buildLandmarks(path, root, theme);

  /* 逐站建造：用 chunked 分帧，避免 27 站连续同步执行形成 2 s 长任务。
     每站自身仍是原子的（buildStation 内部不能中断），但站与站之间会让出。 */
  stationObjs = [];
  $('loadStep').textContent = '正在建造车站…';
  await chunked(path.stations.length, (i) => {
    const st = path.stations[i];
    if (st.synthetic) { stationObjs.push(null); return; }
    $('loadStep').textContent = `正在建造车站  ${st.zh}…`;
    const so = buildStation(path, line, st, i, theme);
    root.add(so.group);
    stationObjs.push(so);
  }, '正在建造车站', 0.72, 0.9);

  await loadStep('列车整备中…', 0.94);
  AUDIO.vType = line.vvvf || 'IGBT';
  train = new Train(line, path, { player: true, lateral: -TRACK_LAT, dest: path.stations[path.stations.length - 1] });
  root.add(train.group);
  train.group.traverse(o => {
    if (o.isMesh && o.material && o.material.transparent !== true) { o.castShadow = true; o.receiveShadow = true; }
  });

  buildSignals(path, root);
  IX.build(path, root);
  buildWeather(scene);
  applyWeather(G.weather, scene);
  spawnAiTrains(path, line, root);

  await loadStep('完成', 1.0);
  makeComposer(scene);
  G.ready = true;
}
