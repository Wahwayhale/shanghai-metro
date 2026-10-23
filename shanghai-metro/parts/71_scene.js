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
  g.name = 'main-ground';
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

  /* 运营日（P2-1）：下一段按「交班时刻」而不是交路首班车时刻排点。
     buildSchedule 会把 st.schArr/schDep 一起重排，HUD 时刻表与运行图口径一致。 */
  const sessionStart = (typeof G.session !== 'undefined' && G.session && G.session.pendingStart != null)
    ? G.session.pendingStart : null;
  if (sessionStart != null) path.buildSchedule(sessionStart);

  /* ---------------- 运行图（P1-1） ----------------
     RoutePath 里已有单趟时刻表（buildSchedule 把 schArr/schDep 写在车站对象上），
     但它本质只能表示「一趟车」。这里用 57_timetable.js 的纯函数生成真正的
     运行图：一个时段内的全部车次，为后续 AI 按图运行、正晚点统计做准备。

     本步不改任何现有行为，只做两件事：
       1) 生成运行图并挂到 path.timetable
       2) 把「本务对应的那一趟车」与现有 schArr/schDep 逐站比对，
          偏差记到 G.ttStats —— 用旧的实现校验新的实现 */
  if (typeof ttBuildTimetable === 'function') {
    const ttStations = path.stations.map(st => ({ stopS: st.stopS, served: st.served !== false }));
    const off = (typeof OFFICIAL_RUN !== 'undefined' && OFFICIAL_RUN[routeDef.id])
      || (typeof OFFICIAL_RUN_NETWORK !== 'undefined' && OFFICIAL_RUN_NETWORK[routeDef.id])
      || null;
    const startSec = path.startSec != null ? path.startSec : 6 * 3600;
    path.timetable = ttBuildTimetable(ttStations, {
      fromSec: startSec - 1800,
      toSec: startSec + 3 * 3600,
      dwell: routeDef.dwell,
      vmax: line.vmax,
      runTimes: off
    });
    /* 找首站发车时刻与本务一致的那趟车 */
    let best = null, bd = 1e9;
    for (const svc of path.timetable.services) {
      const d = Math.abs(svc.startSec - startSec);
      if (d < bd) { bd = d; best = svc; }
    }
    /* 运营日下一段的发车时刻不一定落在发车间隔网格上：
       整张运行图平移，让本务那趟车精确从 pendingStart 发车，
       否则 HUD/ATO/AI 三方会差出半个间隔（最多 150 s）。 */
    if (best && typeof ttShiftTimetable === 'function' && Math.abs(best.startSec - startSec) > 1e-6) {
      ttShiftTimetable(path.timetable, startSec - best.startSec);
    }
    path.playerService = best;

    /* 交叉校验：新运行图 vs 旧的 schArr/schDep */
    let maxArr = 0, maxDep = 0, cmp = 0;
    if (best) {
      for (const sp of best.stops) {
        const st = path.stations[sp.idx];
        if (!st || st.schArr == null) continue;
        maxArr = Math.max(maxArr, Math.abs(sp.arr - st.schArr));
        maxDep = Math.max(maxDep, Math.abs(sp.dep - st.schDep));
        cmp++;
      }
    }
    G.ttStats = {
      services: path.timetable.services.length,
      playerNo: best ? best.no : null,
      compared: cmp,
      maxArrDiff: Math.round(maxArr),
      maxDepDiff: Math.round(maxDep)
    };
  }

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
  /* 阴影贴图尺寸改由 applyQualityEffects() 按档位决定（精细 1536、其余 1024）。
     2048² 相当于每帧多渲染一整遍场景，是 3.69MP 下最大的隐藏开销之一。 */
  sun.shadow.mapSize.set(1536, 1536);
  sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.4;
  s.add(sun); s.add(sun.target);

  stationLights = [];
  for (let i = 0; i < SL_OFF.length; i++) {
    /* 站台用暖白，与隧道的中性冷白形成色温对比 —— 
       原来站台灯和隧道灯几乎同色（都是暖黄），进出隧道没有光线氛围的切换感。 */
    const L = new THREE.PointLight(0xffe6c4, 0, 85, 2);
    s.add(L);
    stationLights.push(L);
  }

  /* 隧道照明：3 盏跟随玩家的 PointLight。
     原来隧道里 0 个真实光源，只有自发光灯条 —— 自发光不会照亮周围，
     所以洞壁永远是均匀暗色，没有「灯下亮斑、灯间暗区」。
     只点亮玩家附近 3 盏（间距 22 m 与灯具布置一致），远处不占预算。 */
  tunnelLights = [];
  for (let i = 0; i < 3; i++) {
    /* 隧道用中性偏冷白：与站台暖白拉开色温差，进出隧道时氛围能明显切换 */
    const L = new THREE.PointLight(0xd6e2f5, 0, 34, 2);
    s.add(L);
    tunnelLights.push(L);
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

  await loadStep('正在铺设地面道路…', 0.56);
  buildRoads(path, root);

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
  /* 给同向 AI 车绑运行图（P1-3）。锚点与 resetService 的开车时钟一致，
     这样进入驾驶时 AI 正好在自己的计划位置上。 */
  G.aiSched = {
    bound: bindAiSchedules(aiTrains, path, (path.startSec != null ? path.startSec : 0) - 30),
    total: aiTrains.length
  };

  await loadStep('完成', 1.0);
  makeComposer(scene);
  G.ready = true;
}


/* C 项：主游戏 buildService 的 HSR 分支入口（当前为视觉接线版） */
async function buildHsrService() {
  if (!window.HSR_MAIN || !window.HSR_MAIN.buildTrainScene) {
    throw new Error('HSR_MAIN 未就绪');
  }
  G.mode = 'loading';
  const s = await window.HSR_MAIN.buildTrainScene();
  const skyC = document.createElement('canvas'); skyC.width = 512; skyC.height = 256;
  const skyG = skyC.getContext('2d');
  const grd = skyG.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#4f8fc6'); grd.addColorStop(0.55, '#8db9d8'); grd.addColorStop(1, '#d6e9f5');
  skyG.fillStyle = grd; skyG.fillRect(0, 0, 512, 256);
  for (const [cx, cy, rx, ry] of [[90, 95, 55, 18], [180, 120, 70, 20], [300, 85, 60, 16], [410, 115, 75, 22], [240, 150, 90, 18]]) {
    const rg = skyG.createRadialGradient(cx, cy, 0, cx, cy, rx);
    rg.addColorStop(0, 'rgba(255,255,255,0.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    skyG.fillStyle = rg; skyG.save(); skyG.translate(cx, cy); skyG.scale(1, ry / rx); skyG.beginPath(); skyG.arc(0, 0, rx, 0, Math.PI * 2); skyG.fill(); skyG.restore();
  }
  const skyTex = new THREE.CanvasTexture(skyC); skyTex.colorSpace = THREE.SRGBColorSpace;
  s.background = skyTex;
  s.fog = new THREE.Fog(0xa8c5d8, 450, 2600);
  const hemi = new THREE.HemisphereLight(0xf2f8ff, 0x8a8f88, 1.6);
  s.add(hemi);
  const dir = new THREE.DirectionalLight(0xfff6e8, 2.1);
  dir.position.set(-120, 120, 70);
  s.add(dir);
  scene = s;
  camera.position.set(-24, 5.8, 13);
  camera.lookAt(3, 2.4, 0);
  camera.near = 0.1;
  camera.far = 5000;
  camera.updateProjectionMatrix();
  document.getElementById('menu').classList.add('hidden');
  const train = s.getObjectByName('HSR-MAIN-TRAIN');
  const cabGroup = window.HSR_MAIN.buildCab();
  cabGroup.position.set(0, 0, 0);
  s.add(cabGroup);
  try { if (cabGroup.userData.cabLamp && localStorage.getItem('hsrCabLight') === '0') cabGroup.userData.cabLamp.intensity = 0; } catch (e) {}
  const world = s.getObjectByName('HSR-MAIN-WORLD');
  G.hsr = {
    x: 0, v: 0, stopped: false, stopErr: null,
    stopIdx: 0,
    stops: [
      { name: '南京南', x: 1017900 },
      { name: '上海虹桥', x: 1301900 }
    ],
    train, cabGroup, begin: performance.now(), touchThrottle: 0, touchBrake: 0, touchEb: 0, cab: true, yaw: 0, pitch: 0, panto: true, vcb: true, dir: 1, wipersOn: true, camMode: 0, audio: createHsrAudio(),
    signals: (world && world.userData && world.userData.signals) || [],
    doorNodes: (train && train.userData && train.userData.doorNodes) || [],
    midDoors: (train && train.userData && train.userData.midDoors) || [],
    doorT: 0, dwellStart: 0, doorSide: -1, parked: false, doorWasOpen: false, legs: [], result: false,
    legSched: [11640, 3840], legStart: performance.now(),
    tsr: (() => { const start = 300000 + Math.floor(Math.random() * 650000); const v = [80, 120, 160][Math.floor(Math.random() * 3)]; return { start, end: start + 2000, v }; })()
  };
  try { if (train && train.userData.headlightMat && localStorage.getItem('hsrHeadlight') === '0') train.userData.headlightMat.emissiveIntensity = 0; } catch (e) {}
  const hud = document.getElementById('hsrMainHud');
  if (hud) hud.classList.remove('hidden');
  const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
  const hold = (id, key) => {
    const el = document.getElementById(id); if (!el) return;
    const on = (v) => { if (G.hsr) G.hsr[key] = v; el.classList.toggle('on', !!v); };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); on(1); });
    el.addEventListener('pointerup', () => on(0));
    el.addEventListener('pointerleave', () => on(0));
    el.addEventListener('pointercancel', () => on(0));
  };
  hold('hmThrottle', 'touchThrottle');
  hold('hmBrake', 'touchBrake');
  hold('hmEb', 'touchEb');
  bind('hmDepart', hsrMainDepart);
  bind('hmReset', resetHsrMain);
  bind('hmView', () => { if (G.hsr) { if (G.hsr.cab) { G.hsr.cab = false; G.hsr.camMode = 0; } else if ((G.hsr.camMode || 0) >= 2) { G.hsr.cab = true; G.hsr.camMode = 0; } else G.hsr.camMode = (G.hsr.camMode || 0) + 1; } });
  bind('hmPanto', () => { if (G.hsr) { G.hsr.panto = !G.hsr.panto; if (!G.hsr.panto) G.hsr.vcb = false; } });
  bind('hmLook', () => { if (G.hsr) { G.hsr.yaw = 0; G.hsr.pitch = 0; } });
  bind('hmAudio', () => { if (G.hsr && G.hsr.audio) { const a = G.hsr.audio; a.muted = !a.muted; a.master.gain.value = a.muted ? 0 : 0.10; try { localStorage.setItem('hsrAudioMuted', a.muted ? '1' : '0'); } catch (e) {} } });
  bind('hmHorn', () => { if (G.hsr) playHsrHorn(G.hsr.audio); });
  bind('hmHelp', () => { const h = document.getElementById('hsrHelp'); if (h) h.classList.toggle('hidden'); });
  bind('hsrHelpClose', () => { const h = document.getElementById('hsrHelp'); if (h) h.classList.add('hidden'); });
  bind('hsrResetPrefs', () => { try { ['hsrHudCollapsed','hsrAudioMuted','hsrHeadlight','hsrCabLight'].forEach(k => localStorage.removeItem(k)); } catch (e) {} location.reload(); });
  bind('hmCollapse', () => { const h = document.getElementById('hsrMainHud'); if (!h) return; h.classList.toggle('collapsed'); const b = document.getElementById('hmCollapse'); if (b) b.textContent = h.classList.contains('collapsed') ? '展开' : '收起'; try { localStorage.setItem('hsrHudCollapsed', h.classList.contains('collapsed') ? '1' : '0'); } catch (e) {} });
  try {
    const h0 = document.getElementById('hsrMainHud');
    if (h0 && localStorage.getItem('hsrHudCollapsed') === '1') { h0.classList.add('collapsed'); const b0 = document.getElementById('hmCollapse'); if (b0) b0.textContent = '展开'; }
  } catch (e) {}
  bind('hmVcb', () => { if (G.hsr && G.hsr.panto) G.hsr.vcb = !G.hsr.vcb; });
  bind('hmExit', exitHsrMain);
  const again = document.getElementById('hmAgain');
  if (again) again.addEventListener('click', () => resetHsrMain());
  const exit = document.getElementById('hmExit');
  if (exit) exit.addEventListener('click', () => exitHsrMain());
  G.mode = 'hsr';
  G.ready = true;
  window.__hsrMainScene = s;
  return s;
}
window.buildHsrService = buildHsrService;
window.__hsrMainStart = buildHsrService;




function hsrMainDepart() {
  const st = G.hsr;
  if (!st || !st.stopped) return;
  if (st.stopIdx < st.stops.length - 1) {
    st.stopIdx++;
    st.stopped = false;
    st.parked = false;
    st.v = 0;
    st.stopErr = null;
    st.legStart = performance.now();
  } else {
    showHsrMainResult();
  }
}

function resetHsrMain() {
  if (!G.hsr) return;
  G.hsr.x = 0; G.hsr.v = 0; G.hsr.stopped = false; G.hsr.stopErr = null;
  G.hsr.stopIdx = 0; G.hsr.doorT = 0; G.hsr.legs = []; G.hsr.result = false;
  const r = document.getElementById('hsrMainResult');
  if (r) r.classList.add('hidden');
}
function showHsrMainResult() {
  const st = G.hsr;
  if (!st || st.result) return;
  st.result = true;
  const rows = document.getElementById('hmResultRows');
  const legs = st.legs.length ? st.legs : [{ name: st.stops[st.stopIdx].name, err: st.stopErr }];
  const avgErr = legs.reduce((a, b) => a + Math.abs(b.err || 0), 0) / legs.length;
  const score = Math.max(0, Math.round(100 - avgErr * 20));
  const grade = score >= 90 ? 'S' : score >= 75 ? 'A' : score >= 60 ? 'B' : 'C';
  if (rows) rows.innerHTML =
    '<span>区段　京沪高铁 G25 全程</span>' +
    '<span>停站 ' + legs.length + ' 段 · 末段 ' + legs[legs.length - 1].name + '</span>' +
    '<span>平均停站误差　' + avgErr.toFixed(2) + ' m</span>' +
    '<span>正晚点　' + (legs[legs.length - 1].punc >= 0 ? '早点' : '晚点') + ' ' + Math.abs(Math.round(legs[legs.length - 1].punc || 0)) + ' s</span>' +
    '<span>得分　<b>' + score + ' · ' + grade + '</b></span>';
  const r = document.getElementById('hsrMainResult');
  if (r) r.classList.remove('hidden');
}

function createHsrAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    const ctx = new AC();
    const master = ctx.createGain(); master.gain.value = 0.10; master.connect(ctx.destination);
    let muted = false; try { muted = localStorage.getItem('hsrAudioMuted') === '1'; } catch (e) {}
    if (muted) master.gain.value = 0;
    const motor = ctx.createOscillator(); motor.type = 'sawtooth'; motor.frequency.value = 40;
    const motorGain = ctx.createGain(); motorGain.gain.value = 0.02;
    motor.connect(motorGain); motorGain.connect(master); motor.start();
    const wind = ctx.createOscillator(); wind.type = 'triangle'; wind.frequency.value = 90;
    const windGain = ctx.createGain(); windGain.gain.value = 0.0;
    wind.connect(windGain); windGain.connect(master); wind.start();
    return { ctx, master, motor, motorGain, wind, windGain, muted };
  } catch (e) { return null; }
}

function playHsrHorn(audio) {
  if (!audio) return;
  const ctx = audio.ctx, now = ctx.currentTime;
  for (const f of [440, 554]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.10, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
    o.connect(g); g.connect(audio.master); o.start(now); o.stop(now + 1.05);
  }
}

function playDoorChime(audio) {
  if (!audio) return;
  const ctx = audio.ctx, now = ctx.currentTime;
  [0, 0.18].forEach((delay, i) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = i ? 660 : 880;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now + delay);
    g.gain.exponentialRampToValueAtTime(0.05, now + delay + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.16);
    o.connect(g); g.connect(audio.master); o.start(now + delay); o.stop(now + delay + 0.18);
  });
}

function hsrMainLimit(x) {
  const t = G.hsr && G.hsr.tsr;
  if (t && x >= t.start && x < t.end) return t.v;
  if (x < 1201000) return 350;
  if (x < 1270000) return 300;
  if (x < 1290000) return 250;
  if (x < 1298000) return 200;
  if (x < 1301900) return 160;
  return 0;
}


function drawHsrScreens(st, limit, stop, kmh, modeD) {
  const now = performance.now();
  if (now - (st._screenT || 0) < 120) return;
  st._screenT = now;
  const list = (st.cabGroup && st.cabGroup.userData.screens) || [];
  for (const item of list) {
    const d = item.m.userData; if (!d || !d.ctx) continue;
    if (d.kind === 'dmi') drawHsrDmi(d.ctx, st, limit, stop, kmh, modeD);
    else if (d.kind === 'tcms') drawHsrTcms(d.ctx, st, kmh);
    else drawHsrBrake(d.ctx, st, kmh);
    item.m.map.needsUpdate = true;
  }
}

function drawHsrDmi(ctx, st, limit, stop, kmh, modeD) {
  const W = 512, H = 320;
  ctx.fillStyle = '#03101a'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#1f5a73'; ctx.lineWidth = 3; ctx.strokeRect(2, 2, W - 4, H - 4);
  const cx = 190, cy = 148, r = 96;
  const start = Math.PI * 0.75, end = Math.PI * 2.25;
  const ang = v => start + Math.max(0, Math.min(450, v)) / 450 * (end - start);
  ctx.strokeStyle = '#173542'; ctx.lineWidth = 16;
  ctx.beginPath(); ctx.arc(cx, cy, r, start, end); ctx.stroke();
  const dist = Math.max(0, stop - st.x);
  const vStop = Math.sqrt(2 * 0.75 * dist) * 3.6;
  const perm = Math.min(450, limit, vStop);
  ctx.strokeStyle = '#e8c84a'; ctx.lineWidth = 14;
  ctx.beginPath(); ctx.arc(cx, cy, r, start, ang(perm)); ctx.stroke();
  ctx.strokeStyle = '#d85a2a'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(cx, cy, r + 13, ang(perm), ang(Math.min(450, perm + 10))); ctx.stroke();
  ctx.strokeStyle = '#9fc4d4'; ctx.lineWidth = 2; ctx.font = '600 14px ui-monospace, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let v = 0; v <= 450; v += 50) {
    const a = ang(v), c = Math.cos(a), s2 = Math.sin(a);
    ctx.beginPath(); ctx.moveTo(cx + c * (r - 8), cy + s2 * (r - 8)); ctx.lineTo(cx + c * (r + 4), cy + s2 * (r + 4)); ctx.stroke();
    ctx.fillText(String(v), cx + c * (r - 24), cy + s2 * (r - 24));
  }
  const na = ang(kmh);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(na) * (r - 14), cy + Math.sin(na) * (r - 14)); ctx.stroke();
  ctx.fillStyle = '#dff2fb'; ctx.font = '800 58px ui-monospace, monospace'; ctx.fillText(String(Math.round(kmh)), cx, cy - 4);
  ctx.font = '600 16px ui-monospace, monospace'; ctx.fillStyle = '#8fa3b0'; ctx.fillText('km/h', cx, cy + 36);
  ctx.fillStyle = '#8fe06a'; ctx.font = '700 14px ui-monospace, monospace'; ctx.fillText('CTCS-3  ' + modeD, cx, cy + 72);

  ctx.fillStyle = '#071a24'; ctx.fillRect(8, 28, 46, 260);
  ctx.strokeStyle = '#2a5a73'; ctx.strokeRect(8, 28, 46, 260);
  ctx.fillStyle = '#0e2430'; ctx.fillRect(14, 36, 34, 210);
  const frac = Math.max(0, Math.min(1, dist / 16000));
  ctx.fillStyle = dist < 2000 ? '#c8102e' : '#e8c84a';
  ctx.fillRect(14, 246 - 210 * frac, 34, 210 * frac);
  ctx.fillStyle = '#e8f1f6'; ctx.font = '600 12px ui-monospace, monospace';
  ctx.fillText((dist / 1000).toFixed(1) + 'km', 31, 270);
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = k === 0 ? '#e8c84a' : '#2a5a73';
    ctx.fillRect(14, 34 + k * 14, 34, 9);
  }

  ctx.fillStyle = '#071a24'; ctx.fillRect(302, 34, 202, 202);
  ctx.strokeStyle = '#2a5a73'; ctx.strokeRect(302, 34, 202, 202);
  const yFor = d => 236 - Math.log10(1 + Math.max(0, d)) / Math.log10(16001) * 196;
  const xFor = v => 322 + Math.max(0, Math.min(400, v)) / 400 * 168;
  ctx.fillStyle = '#8fa3b0'; ctx.font = '600 10px ui-monospace, monospace'; ctx.textAlign = 'left';
  const distMarks = [0, 500, 1000, 2000, 4000, 8000, 16000];
  for (const dm of distMarks) {
    const yy = yFor(dm);
    ctx.strokeStyle = '#173542'; ctx.beginPath(); ctx.moveTo(312, yy); ctx.lineTo(500, yy); ctx.stroke();
    ctx.fillText(dm === 0 ? '0' : (dm >= 1000 ? (dm / 1000) + 'k' : String(dm)), 304, yy + 3);
  }
  for (const sv of [0, 100, 200, 300, 400]) {
    const xx = xFor(sv);
    ctx.strokeStyle = '#12303c'; ctx.beginPath(); ctx.moveTo(xx, 38); ctx.lineTo(xx, 236); ctx.stroke();
  }
  ctx.strokeStyle = '#e8c84a'; ctx.lineWidth = 3; ctx.beginPath();
  const stopD = Math.min(16000, Math.max(1, dist));
  ctx.moveTo(xFor(perm), 236);
  ctx.lineTo(xFor(perm), yFor(stopD * 0.55));
  ctx.lineTo(xFor(80), yFor(stopD * 0.80));
  ctx.lineTo(xFor(0), yFor(stopD));
  ctx.stroke();
  ctx.fillStyle = '#8fa3b0'; ctx.font = '600 12px ui-monospace, monospace'; ctx.textAlign = 'center';
  ctx.fillText((st.stops[st.stopIdx] && st.stops[st.stopIdx].name) || '', 402, 50);
  ctx.fillStyle = '#8fe06a'; ctx.textAlign = 'left'; ctx.fillText('+2‰', 312, 66);
  ctx.fillStyle = '#e8f1f6'; ctx.font = '700 14px ui-monospace, monospace'; ctx.textAlign = 'center';
  ctx.fillText('G25  ·  RBC 连接  ·  司机 001', 256, 305);
}

function drawHsrTcms(ctx, st, kmh) {
  const W = 512, H = 320;
  ctx.fillStyle = '#04121a'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#2a7a96'; ctx.lineWidth = 3; ctx.strokeRect(2, 2, W - 4, H - 4);
  ctx.fillStyle = '#e8f1f6'; ctx.font = '700 20px ui-monospace, monospace'; ctx.textAlign = 'left';
  ctx.fillText('TCMS  车辆信息 / 牵引监控', 16, 28);
  for (let i = 0; i < 17; i++) {
    const x = 14 + i * 29, y = 46, w = 25, h = 34;
    ctx.fillStyle = st.stopped && st.doorT > 0.2 ? '#7a1a1a' : '#123a2a';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#2a7a96'; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#cfe0ea'; ctx.font = '600 11px ui-monospace, monospace'; ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), x + w / 2, y + 21);
  }
  ctx.textAlign = 'left'; ctx.font = '600 18px ui-monospace, monospace';
  ctx.fillStyle = st.panto ? '#8fe06a' : '#c8102e';
  ctx.fillText('受电弓  ' + (st.panto ? '升' : '降'), 20, 116);
  ctx.fillStyle = st.vcb ? '#8fe06a' : '#c8102e';
  ctx.fillText('VCB     ' + (st.vcb ? '合' : '分'), 20, 144);
  ctx.fillStyle = '#e8f1f6';
  ctx.fillText('网压     ' + (st.panto && st.vcb ? '25.0 kV' : '0.0 kV'), 20, 172);
  ctx.fillText('速度     ' + Math.round(kmh) + ' km/h', 20, 200);
  ctx.fillStyle = '#102a35'; ctx.fillRect(250, 100, 240, 14);
  ctx.fillStyle = '#2fa7d6'; ctx.fillRect(250, 100, 240 * Math.min(1, kmh / 350), 14);
  ctx.fillStyle = '#e8c84a'; ctx.fillRect(250, 130, 240 * Math.min(1, st.v / 100), 14);
  ctx.fillStyle = '#cfe0ea'; ctx.font = '600 14px ui-monospace, monospace';
  ctx.fillText('牵引', 250, 94); ctx.fillText('制动', 250, 124);
  ctx.fillStyle = st.stopped && st.doorT > 0.2 ? '#ff6b6b' : '#8fe06a';
  ctx.fillText('车门  ' + (st.stopped && st.doorT > 0.2 ? '开启（' + (st.doorSide < 0 ? '左' : '右') + '）' : '关闭'), 20, 250);
  ctx.fillStyle = '#8fa3b0'; ctx.fillText('CR400AF-BS-2344  ·  17 辆编组', 20, 295);
}

function drawHsrBrake(ctx, st, kmh) {
  const W = 512, H = 320;
  ctx.fillStyle = '#04121a'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#2a7a96'; ctx.lineWidth = 3; ctx.strokeRect(2, 2, W - 4, H - 4);
  ctx.fillStyle = '#e8f1f6'; ctx.font = '700 20px ui-monospace, monospace'; ctx.textAlign = 'left';
  ctx.fillText('制动监控 / CIR 无线调度', 16, 28);
  const rows = [['BP 总风管', '600', 'kPa'], ['MR 主风缸', '780', 'kPa'], ['BC 制动缸', String(Math.round(Math.min(1, st.v / 100) * 300)), 'kPa']];
  rows.forEach((r, i) => {
    const y = 80 + i * 58;
    ctx.fillStyle = '#8fa3b0'; ctx.font = '600 16px ui-monospace, monospace'; ctx.fillText(r[0], 20, y);
    ctx.fillStyle = '#e8f1f6'; ctx.font = '800 40px ui-monospace, monospace'; ctx.fillText(r[1], 200, y + 8);
    ctx.fillStyle = '#8fa3b0'; ctx.font = '600 14px ui-monospace, monospace'; ctx.fillText(r[2], 340, y + 8);
  });
  ctx.fillStyle = '#0e2430'; ctx.fillRect(20, 246, 470, 2);
  ctx.fillStyle = '#8fe06a'; ctx.font = '600 16px ui-monospace, monospace';
  ctx.fillText('GSM-R  G25  ·  北京局调度台  ·  已连接', 20, 276);
  ctx.fillStyle = '#8fa3b0'; ctx.font = '600 14px ui-monospace, monospace';
  ctx.fillText('停车制动  ' + (st.parked ? '施加' : '缓解') + '   ·   速度 ' + Math.round(kmh) + ' km/h', 20, 302);
}

function updateHsrMain(dt) {
  const st = G.hsr;
  if (!st) return;
  window.__hsrMainCamera = camera;
  const stop = st.stops[st.stopIdx].x;
  const limit = hsrMainLimit(st.x);
  const throttle = (st.panto && st.vcb && st.dir && (keys['KeyW'] || keys['ArrowUp'] || st.touchThrottle)) ? 1 : 0;
  if (st.audio) {
    const a = st.audio;
    a.motor.frequency.setTargetAtTime(32 + st.v * 1.4, a.ctx.currentTime, 0.15);
    a.motorGain.gain.setTargetAtTime(0.008 + throttle * 0.03 + st.v * 0.00008, a.ctx.currentTime, 0.2);
    a.wind.frequency.setTargetAtTime(70 + st.v * 2.4, a.ctx.currentTime, 0.2);
    a.windGain.gain.setTargetAtTime(st.v * 0.00006, a.ctx.currentTime, 0.25);
  }
  if (!st.stopped) {
    const stopV = Math.sqrt(Math.max(0, 2 * 0.75 * Math.max(0, stop - st.x - 20)));
    const perm = Math.min(limit / 3.6, stopV);
    const brake = (keys['KeyS'] || keys['ArrowDown'] || st.touchBrake) ? 1 : 0;
    const drag = 0.000005 * st.v * st.v;
    const eb = (keys['Space'] || st.touchEb) ? 1 : 0;
    let a = 0.45 * throttle - 0.8 * brake - drag;
    if (eb) a = -2.5;
    const overLimit = st.v - limit / 3.6;
    if (overLimit > 2 / 3.6) a = Math.min(a, -2.5);
    else if (overLimit > 0.5) a = Math.min(a, -1.2);
    if (st.v > perm + 0.3) a = Math.min(a, -0.8);
    st.v = Math.max(0, Math.min(350 / 3.6, st.v + a * dt));
    st.x = Math.min(1301900, st.x + st.v * dt);
    if (st.v < 0.3 && Math.abs(st.x - stop) < 500) {
      st.stopped = true;
      st.dwellStart = performance.now();
      st.parked = true;
      st.stopErr = st.x - stop;
      st.v = 0;
      const punc = st.legSched[st.stopIdx] - (performance.now() - st.legStart) / 1000;
      st.legs.push({ name: st.stops[st.stopIdx].name, err: st.stopErr, punc });
      if (st.stopIdx >= st.stops.length - 1) showHsrMainResult();
    }
  } else {
    st.v = 0;
  }
  if (st.stopped !== st.doorWasOpen) { st.doorWasOpen = st.stopped; playDoorChime(st.audio); }
  const doorTarget = st.stopped ? 1 : 0;
  const dstep = Math.min(1, dt / 0.8);
  if (st.doorT < doorTarget) st.doorT = Math.min(doorTarget, st.doorT + dstep);
  else if (st.doorT > doorTarget) st.doorT = Math.max(doorTarget, st.doorT - dstep);
  for (const d of st.doorNodes) d.node.position.y = d.y0 + (d.side === st.doorSide ? d.side * 0.55 * st.doorT : 0);
  if (st.midDoors && st.midDoors.length) {
    const cm = new THREE.Matrix4(), im = new THREE.Matrix4();
    for (const d of st.midDoors) {
      for (let i = 0; i < d.carXs.length; i++) {
        cm.makeTranslation(d.carXs[i], d.side === st.doorSide ? d.side * 0.55 * st.doorT : 0, 0);
        im.multiplyMatrices(cm, d.world);
        d.inst.setMatrixAt(i, im);
      }
      d.inst.instanceMatrix.needsUpdate = true;
    }
  }
  if (st.signals && st.signals.length) {
    let nearest = null;
    for (const sg of st.signals) { if (sg.x > st.x && (!nearest || sg.x < nearest.x)) nearest = sg; }
    for (const sg of st.signals) {
      const ahead = sg.x - st.x;
      let color = 0x1f8a4c;
      if (sg === nearest && st.stopped && ahead < 2000) color = 0xc8102e;
      else if (sg === nearest && ahead < 10000) color = 0xd8a21f;
      sg.lamp.material.color.setHex(color);
      sg.lamp.material.emissive.setHex(color);
    }
  }
  if (st.train) { st.train.position.x = -st.x; st.train.visible = !st.cab; if (st.train.userData.pantograph) st.train.userData.pantograph.scale.y = st.panto ? 1 : 0.25; if (!st.cab) st.train.rotation.z = Math.sin(performance.now() / 900) * 0.0015 * Math.min(1, st.v / 100); }
  if (st.cabGroup) {
    st.cabGroup.position.x = -st.x;
    st.cabGroup.visible = st.cab;
    if (st.cab) {
      const now = performance.now();
      if (!st.lastDmi || now - st.lastDmi > 220) {
        st.lastDmi = now;
        const kmhD = Math.round(st.v * 3.6);
        const modeD = (keys['Space'] || st.touchEb) ? '紧急制动'
          : ((!st.panto || !st.vcb) ? '无电'
          : ((st.v - limit / 3.6) > 5 / 3.6 ? 'ATP制动'
          : (st.stopped ? '停车'
          : (kmhD < 1 ? '待发'
          : ((keys['KeyW'] || keys['ArrowUp'] || st.touchThrottle) ? '牵引'
          : ((keys['KeyS'] || keys['ArrowDown'] || st.touchBrake) ? '制动' : '惰行'))))));
        const vals = [
          ['DMI-1', String(kmhD), 'ATP ' + Math.round(hsrMainLimit(st.x))],
          ['DMI-2', st.stops[st.stopIdx].name, Math.max(0, (stop - st.x) / 1000).toFixed(1) + ' km'],
          ['G25', modeD, st.stopped ? '车门开启' : '车门关闭'],
          ['仪表', st.panto && st.vcb ? '25.0' : '0.0', st.panto && st.vcb ? 'kV · 正常' : 'kV · 无电']
        ];
        drawHsrScreens(st, limit, stop, kmhD, modeD);
        const lamp = st.cabGroup.userData.warnLamp;
        const over = kmhD > hsrMainLimit(st.x) + 0.5;
        if (lamp) {
          const blink = (Math.floor(performance.now() / 250) % 2) === 0;
          lamp.emissive.setHex(over && blink ? 0xff1a1a : 0x400000);
          lamp.emissiveIntensity = over && blink ? 2.2 : 0.3;
        }
        const doorOpen = !!(st.stopped && st.doorT > 0.2);
        for (const lm of (st.cabGroup.userData.doorLeds || [])) lm.emissive.setHex(doorOpen ? 0xc8102e : 0x2f9e5a);
        const wipers = st.cabGroup.userData.wipers || [];
        const wt = performance.now() / 1000;
        for (let wi = 0; wi < wipers.length; wi++) {
          const wp = wipers[wi];
          wp.m.rotation.z = wp.b + (st.wipersOn && st.v > 1 ? Math.sin(wt * 3.2 + wi * 1.3) * 0.32 : 0);
        }
        const lev = st.cabGroup.userData.levers || [];
        if (lev[0]) lev[0].rotation.z = 0.2 + 0.35 * throttle;
        if (lev[1]) lev[1].rotation.z = -0.2 - 0.35 * ((keys['KeyS'] || keys['ArrowDown'] || st.touchBrake) ? 1 : 0);
      }
    }
  }
  const cabEl = document.getElementById('hsrMainCab');
  if (cabEl) cabEl.classList.add('hidden');
  if (st.cab) {
    const yaw = st.yaw || 0, pitch = st.pitch || 0;
    const dx = -Math.cos(yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = Math.sin(yaw) * Math.cos(pitch);
    const shake = Math.min(1, st.v / 80) * 0.006;
    const tShake = performance.now() / 1000;
    camera.position.set(-st.x + 6.5, 3.05 + Math.sin(tShake * 18) * shake, Math.cos(tShake * 13) * shake);
    camera.lookAt(camera.position.x + dx * 40, camera.position.y + dy * 40, camera.position.z + dz * 40);
  } else if (st.camMode === 1) {
    camera.position.set(-st.x + 458, 7.5, 18);
    camera.lookAt(-st.x + 425, 2.4, 0);
  } else if (st.camMode === 2) {
    const px = (st.train && st.train.userData.passengerX) || 0;
    camera.position.set(-st.x + px - 8.0, 2.55, 0.55);
    camera.lookAt(-st.x + px + 8, 2.30, 0.25);
  } else {
    camera.position.set(-st.x - 24, 5.8, 13);
    camera.lookAt(-st.x + 3, 2.4, 0);
  }
  const kmh = st.v * 3.6;
  const el = (id) => document.getElementById(id);
  if (el('hmView')) el('hmView').textContent = st.cab ? '驾驶室' : ['前左', '车尾', '车厢'][st.camMode || 0];
  if (el('hmSpeed')) el('hmSpeed').textContent = Math.round(kmh);
  if (el('hmAtp')) el('hmAtp').textContent = 'ATP ' + (st.stopped ? 0 : Math.round(limit));
  if (el('hmMode')) el('hmMode').textContent = st.stopped ? '停车' : (kmh < 1 ? '待发' : (throttle ? '牵引' : '惰行'));
  if (el('hmNext')) el('hmNext').textContent = '下一站 ' + st.stops[st.stopIdx].name + ' · ' + Math.max(0, (stop - st.x) / 1000).toFixed(1) + ' km';
  if (el('hmDist')) el('hmDist').textContent = (st.x / 1000).toFixed(1) + ' km';
  if (el('hmErr')) el('hmErr').textContent = st.stopped ? '停站 ' + (st.stopErr >= 0 ? '+' : '') + st.stopErr.toFixed(2) + ' m' : '';
  if (el('hmSched')) {
    let cum = 0;
    for (let i = 0; i <= st.stopIdx && i < st.legSched.length; i++) cum += st.legSched[i];
    const plan = new Date(); plan.setHours(17, 0, 0, 0); plan.setMinutes(plan.getMinutes() + cum / 60);
    const fmt = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    let actual = '--:--';
    let actualDate = null;
    if (st.stopped) { actualDate = new Date(); actual = fmt(actualDate); }
    else if (st.v > 1) { actualDate = new Date(Date.now() + ((stop - st.x) / st.v / 60) * 60000); actual = fmt(actualDate); }
    el('hmSched').textContent = '计划 ' + fmt(plan) + ' · 实际 ' + actual;
    if (el('hmPunc')) {
      if (!actualDate) { el('hmPunc').textContent = '正晚点 --'; el('hmPunc').style.color = '#c7d6df'; }
      else {
        const dm = Math.round((actualDate - plan) / 60000);
        const t = dm === 0 ? '正点' : (dm > 0 ? '晚点 +' : '早点 ') + (dm > 0 ? dm : -dm) + ' 分';
        el('hmPunc').textContent = t;
        el('hmPunc').style.color = dm > 0 ? '#ff6b6b' : (dm < 0 ? '#ffd479' : '#8fe06a');
      }
    }
  }
  if (el('hmEta')) {
    if (st.stopped || st.v < 1) el('hmEta').textContent = '预计 --:--';
    else {
      const mins = Math.max(0, (stop - st.x) / st.v / 60);
      const eta = new Date(Date.now() + mins * 60000);
      el('hmEta').textContent = '预计 ' + eta.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
    }
  }
  if (el('hmSys')) el('hmSys').textContent = '受电弓 ' + (st.panto ? '升' : '降') + ' · VCB ' + (st.vcb ? '合' : '分') + ' · 方向 ' + (st.dir ? '前' : '0');
  if (st.cabGroup && st.cabGroup.userData.dirKnob) st.cabGroup.userData.dirKnob.rotation.z = st.dir ? 0 : 0.7;
  if (el('hmSignal')) {
    let ns = null;
    for (const sg of (st.signals || [])) { if (sg.x > st.x && (!ns || sg.x < ns.x)) ns = sg; }
    if (ns) {
      const d = ns.x - st.x;
      const aspect = (st.stopped && d < 2000) ? '红灯' : (d < 10000 ? '黄灯' : '绿灯');
      el('hmSignal').textContent = '信号 ' + aspect;
      el('hmSignal').style.color = aspect === '红灯' ? '#ff6b6b' : (aspect === '黄灯' ? '#ffd479' : '#8fe06a');
      if (el('hmSigDist')) el('hmSigDist').textContent = (d / 1000).toFixed(1) + ' km';
    } else {
      el('hmSignal').textContent = '信号 --';
      if (el('hmSigDist')) el('hmSigDist').textContent = '';
    }
  }
  if (el('hmTsr')) el('hmTsr').textContent = st.tsr ? 'TSR ' + st.tsr.v + ' · ' + (st.tsr.start / 1000).toFixed(0) + ' km' : '';
  if (el('mcSpeed')) el('mcSpeed').textContent = Math.round(kmh);
  if (el('mcAtp')) el('mcAtp').textContent = 'ATP ' + (st.stopped ? 0 : Math.round(limit));
  if (el('mcNext')) el('mcNext').textContent = '下一站 ' + st.stops[st.stopIdx].name + ' · ' + Math.max(0, (stop - st.x) / 1000).toFixed(1) + ' km';
  if (el('hmPark')) el('hmPark').textContent = st.parked ? '停放制动 施加' : '停放制动 缓解';
  if (el('hmDoor')) el('hmDoor').textContent = st.stopped ? (st.doorT > 0.25 ? '车门开启（' + (st.doorSide < 0 ? '左' : '右') + '）' : '车门关闭') : '车门关闭';
  if (el('hmDwell')) {
    if (st.stopped) {
      const left = Math.max(0, 120 - (performance.now() - (st.dwellStart || performance.now())) / 1000);
      const mm = Math.floor(left / 60), ss = Math.floor(left % 60);
      el('hmDwell').textContent = left > 0 ? '停站 ' + mm + ':' + String(ss).padStart(2, '0') : '可发车';
      el('hmDwell').style.color = left > 0 ? '#ffd479' : '#8fe06a';
    } else el('hmDwell').textContent = '';
  }
  if (el('hmState')) {
    const needV = Math.sqrt(Math.max(0, 2 * 0.75 * Math.max(0, stop - st.x - 20)));
    if ((keys['Space'] || st.touchEb)) { el('hmState').textContent = '紧急制动'; el('hmState').style.color = '#ff4d4d'; }
    else if (!st.stopped && st.v > limit / 3.6 + 5 / 3.6) { el('hmState').textContent = 'ATP制动'; el('hmState').style.color = '#ff4d4d'; }
    else if (!st.stopped && st.v > needV + 2) { el('hmState').textContent = '制动'; el('hmState').style.color = '#ff6b6b'; }
    else if (!st.stopped && stop - st.x < 300) { el('hmState').textContent = '进站'; el('hmState').style.color = '#ffd479'; }
    else { el('hmState').textContent = ''; }
  }
}
function exitHsrMain() {
  if (G.mode !== 'hsr') return;
  if (G.hsr && G.hsr.audio) { try { G.hsr.audio.ctx.close(); } catch (e) {} G.hsr.audio = null; }
  G.mode = 'menu';
  G.hsr = null;
  const mg = s.getObjectByName('main-ground'); if (mg) mg.visible = true;
  const hud = document.getElementById('hsrMainHud');
  if (hud) hud.classList.add('hidden');
  const menu = document.getElementById('menu');
  if (menu) menu.classList.remove('hidden');
  const r = document.getElementById('hsrMainResult');
  if (r) r.classList.add('hidden');
}
window.addEventListener('keydown', (e) => {
  if (G.mode !== 'hsr') return;
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyM') { if (G.hsr && G.hsr.audio) { const a = G.hsr.audio; a.muted = !a.muted; a.master.gain.value = a.muted ? 0 : 0.10; try { localStorage.setItem('hsrAudioMuted', a.muted ? '1' : '0'); } catch (err) {} } }
  if (e.code === 'KeyL') { if (G.hsr && G.hsr.cabGroup && G.hsr.cabGroup.userData.cabLamp) { const l = G.hsr.cabGroup.userData.cabLamp; l.intensity = l.intensity > 0.1 ? 0 : 0.9; try { localStorage.setItem('hsrCabLight', l.intensity > 0.1 ? '1' : '0'); } catch (err) {} } }
  if (e.code === 'KeyK') { if (G.hsr && G.hsr.train && G.hsr.train.userData.headlightMat) { const h = G.hsr.train.userData.headlightMat; h.emissiveIntensity = h.emissiveIntensity > 0.1 ? 0 : 2.2; try { localStorage.setItem('hsrHeadlight', h.emissiveIntensity > 0.1 ? '1' : '0'); } catch (err) {} } }
  if (e.code === 'F1') { e.preventDefault(); const h = document.getElementById('hsrHelp'); if (h) h.classList.toggle('hidden'); }
  if (e.code === 'Escape') { const h = document.getElementById('hsrHelp'); if (h && !h.classList.contains('hidden')) { h.classList.add('hidden'); return; } }
  if (e.code === 'KeyR') {
    resetHsrMain();
  } else if (e.code === 'KeyH') {
    if (G.hsr) playHsrHorn(G.hsr.audio);
  } else if (e.code === 'KeyP') {
    if (G.hsr) { G.hsr.panto = !G.hsr.panto; if (!G.hsr.panto) G.hsr.vcb = false; }
  } else if (e.code === 'KeyV') {
    if (G.hsr && G.hsr.panto) G.hsr.vcb = !G.hsr.vcb;
  } else if (e.code === 'Escape') {
    exitHsrMain();
  }
});

window.__hsrMain = {
  get state() { return G.hsr ? { x: G.hsr.x, v: G.hsr.v, stopped: G.hsr.stopped, stopErr: G.hsr.stopErr, stopIdx: G.hsr.stopIdx, doorT: G.hsr.doorT, doors: G.hsr.doorNodes.length, midDoors: G.hsr.midDoors.length } : null; },
  setX(x) { if (G.hsr) { G.hsr.x = x; G.hsr.v = 0; G.hsr.stopped = false; } },
  setStop(i) { if (G.hsr) { G.hsr.stopIdx = i; G.hsr.stopped = false; G.hsr.stopErr = null; } },
  exit: exitHsrMain
};


// cab look-around (main HSR mode)
(function () {
  let lookDrag = false, lookX = 0, lookY = 0;
  window.addEventListener('pointerdown', (e) => {
    if (G.mode !== 'hsr' || !G.hsr || !G.hsr.cab) return;
    if (e.target && e.target.closest && e.target.closest('button')) return;
    const T = window.__HSR_THREE, cam = window.__hsrMainCamera, btn = G.hsr.cabGroup && G.hsr.cabGroup.userData.ebButton;
    if (T && cam && btn) {
      const ray = new T.Raycaster();
      ray.setFromCamera(new T.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1), cam);
      if (ray.intersectObject(btn, false).length) { G.hsr.touchEb = 1; lookDrag = false; return; }
      const hs = G.hsr.cabGroup.userData.headlightSwitch;
      if (hs && ray.intersectObject(hs, false).length) { const hm = G.hsr.train && G.hsr.train.userData.headlightMat; if (hm) { hm.emissiveIntensity = hm.emissiveIntensity > 0.1 ? 0 : 2.2; try { localStorage.setItem('hsrHeadlight', hm.emissiveIntensity > 0.1 ? '1' : '0'); } catch (e) {} } lookDrag = false; return; }
      const ls = G.hsr.cabGroup.userData.lightSwitch;
      if (ls && ray.intersectObject(ls, false).length) { const lamp = G.hsr.cabGroup.userData.cabLamp; if (lamp) { lamp.intensity = lamp.intensity > 0.1 ? 0 : 0.9; try { localStorage.setItem('hsrCabLight', lamp.intensity > 0.1 ? '1' : '0'); } catch (e) {} } lookDrag = false; return; }
      const ws = G.hsr.cabGroup.userData.wiperSwitch;
      if (ws && ray.intersectObject(ws, false).length) { G.hsr.wipersOn = !G.hsr.wipersOn; lookDrag = false; return; }
      const dk = G.hsr.cabGroup.userData.dirKnob;
      if (dk && ray.intersectObject(dk, false).length) { G.hsr.dir = G.hsr.dir ? 0 : 1; lookDrag = false; return; }
      const dbs = G.hsr.cabGroup.userData.doorButtons || [];
      for (const b of dbs) {
        if (ray.intersectObject(b.m, false).length) { G.hsr.doorSide = b.side; lookDrag = false; return; }
      }
      const levs = G.hsr.cabGroup.userData.levers || [];
      for (let li = 0; li < levs.length; li++) {
        if (ray.intersectObject(levs[li], false).length) {
          if (li === 0) G.hsr.touchThrottle = 1; else G.hsr.touchBrake = 1;
          lookDrag = false; return;
        }
      }
    }
    lookDrag = true; lookX = e.clientX; lookY = e.clientY;
  });
  window.addEventListener('pointermove', (e) => {
    if (!lookDrag || G.mode !== 'hsr' || !G.hsr) return;
    const dx = e.clientX - lookX, dy = e.clientY - lookY;
    lookX = e.clientX; lookY = e.clientY;
    G.hsr.yaw = Math.max(-1.6, Math.min(1.6, (G.hsr.yaw || 0) - dx * 0.0028));
    G.hsr.pitch = Math.max(-0.45, Math.min(0.45, (G.hsr.pitch || 0) + dy * 0.0022));
  });
  window.addEventListener('pointerup', () => { lookDrag = false; if (G.hsr) { G.hsr.touchEb = 0; G.hsr.touchThrottle = 0; G.hsr.touchBrake = 0; } });
  window.addEventListener('pointercancel', () => { lookDrag = false; });
})();
