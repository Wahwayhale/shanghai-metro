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
  s.background = new THREE.Color(0x0a1116);
  s.fog = new THREE.Fog(0x0a1116, 350, 1600);
  const hemi = new THREE.HemisphereLight(0xbfd7e8, 0x1a2228, 1.3);
  s.add(hemi);
  const dir = new THREE.DirectionalLight(0xfff2dd, 2.0);
  dir.position.set(-60, 80, 40);
  s.add(dir);
  scene = s;
  camera.position.set(-80, 10, 28);
  camera.lookAt(0, 2.4, 0);
  camera.near = 0.1;
  camera.far = 5000;
  camera.updateProjectionMatrix();
  document.getElementById('menu').classList.add('hidden');
  const train = s.getObjectByName('HSR-MAIN-TRAIN');
  G.hsr = {
    x: 1017900, v: 350 / 3.6, stopped: false, stopErr: null,
    stopIdx: 0,
    stops: [
      { name: '镇江南', x: 1086900 },
      { name: '常州北', x: 1143900 },
      { name: '无锡东', x: 1200900 },
      { name: '苏州北', x: 1226900 },
      { name: '昆山南', x: 1258900 },
      { name: '上海虹桥', x: 1301900 }
    ],
    train, begin: performance.now(),
    doorNodes: (train && train.userData && train.userData.doorNodes) || [],
    doorT: 0, legs: [], result: false,
    legSched: [720, 600, 540, 540, 450, 450], legStart: performance.now(),
    tsr: (() => { const start = 1040000 + Math.floor(Math.random() * 240000); const v = [80, 120, 160][Math.floor(Math.random() * 3)]; return { start, end: start + 2000, v }; })()
  };
  const hud = document.getElementById('hsrMainHud');
  if (hud) hud.classList.remove('hidden');
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




function resetHsrMain() {
  if (!G.hsr) return;
  G.hsr.x = 1017900; G.hsr.v = 350 / 3.6; G.hsr.stopped = false; G.hsr.stopErr = null;
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
    '<span>区段　京沪高铁 284 km 六站</span>' +
    '<span>停站 ' + legs.length + ' 段 · 末段 ' + legs[legs.length - 1].name + '</span>' +
    '<span>平均停站误差　' + avgErr.toFixed(2) + ' m</span>' +
    '<span>正晚点　' + (legs[legs.length - 1].punc >= 0 ? '早点' : '晚点') + ' ' + Math.abs(Math.round(legs[legs.length - 1].punc || 0)) + ' s</span>' +
    '<span>得分　<b>' + score + ' · ' + grade + '</b></span>';
  const r = document.getElementById('hsrMainResult');
  if (r) r.classList.remove('hidden');
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

function updateHsrMain(dt) {
  const st = G.hsr;
  if (!st) return;
  const stop = st.stops[st.stopIdx].x;
  const limit = hsrMainLimit(st.x);
  const throttle = (keys['KeyW'] || keys['ArrowUp']) ? 1 : 0;
  if (!st.stopped) {
    const stopV = Math.sqrt(Math.max(0, 2 * 0.75 * Math.max(0, stop - st.x - 20)));
    const perm = Math.min(limit / 3.6, stopV);
    const brake = (keys['KeyS'] || keys['ArrowDown']) ? 1 : 0;
    const drag = 0.000005 * st.v * st.v;
    let a = 0.45 * throttle - 0.8 * brake - drag;
    if (st.v > perm + 0.3) a = Math.min(a, -0.8);
    st.v = Math.max(0, Math.min(350 / 3.6, st.v + a * dt));
    st.x = Math.min(1301900, st.x + st.v * dt);
    if (st.v < 0.3 && Math.abs(st.x - stop) < 500) {
      st.stopped = true;
      st.stopErr = st.x - stop;
      st.v = 0;
      const punc = st.legSched[st.stopIdx] - (performance.now() - st.legStart) / 1000;
      st.legs.push({ name: st.stops[st.stopIdx].name, err: st.stopErr, punc });
      if (st.stopIdx >= st.stops.length - 1) showHsrMainResult();
    }
  } else {
    st.v = 0;
    if (!st.result && st.doorT > 0.4 && (keys['KeyW'] || keys['ArrowUp'])) {
      if (st.stopIdx < st.stops.length - 1) {
        st.stopIdx++;
        st.stopped = false;
        st.v = 0;
        st.stopErr = null;
        st.legStart = performance.now();
        st.begin = performance.now();
      } else {
        showHsrMainResult();
      }
    }
  }
  const doorTarget = st.stopped ? 1 : 0;
  const dstep = Math.min(1, dt / 0.8);
  if (st.doorT < doorTarget) st.doorT = Math.min(doorTarget, st.doorT + dstep);
  else if (st.doorT > doorTarget) st.doorT = Math.max(doorTarget, st.doorT - dstep);
  for (const d of st.doorNodes) d.node.position.y = d.y0 + d.side * 0.55 * st.doorT;
  if (st.train) st.train.position.x = -st.x;
  camera.position.set(-st.x - 38, 8.0, 22);
  camera.lookAt(-st.x + 4, 2.2, 0);

  const kmh = st.v * 3.6;
  const el = (id) => document.getElementById(id);
  if (el('hmSpeed')) el('hmSpeed').textContent = Math.round(kmh);
  if (el('hmAtp')) el('hmAtp').textContent = 'ATP ' + (st.stopped ? 0 : Math.round(limit));
  if (el('hmMode')) el('hmMode').textContent = st.stopped ? '停车' : (kmh < 1 ? '待发' : (throttle ? '牵引' : '惰行'));
  if (el('hmNext')) el('hmNext').textContent = '下一站 ' + st.stops[st.stopIdx].name + ' · ' + Math.max(0, (stop - st.x) / 1000).toFixed(1) + ' km';
  if (el('hmDist')) el('hmDist').textContent = (st.x / 1000).toFixed(1) + ' km';
  if (el('hmErr')) el('hmErr').textContent = st.stopped ? '停站 ' + (st.stopErr >= 0 ? '+' : '') + st.stopErr.toFixed(2) + ' m' : '';
  if (el('hmTsr')) el('hmTsr').textContent = st.tsr ? 'TSR ' + st.tsr.v + ' · ' + (st.tsr.start / 1000).toFixed(0) + ' km' : '';
  if (el('hmDoor')) el('hmDoor').textContent = st.stopped ? (st.doorT > 0.25 ? '车门开启' : '车门关闭') : '车门关闭';
}
function exitHsrMain() {
  if (G.mode !== 'hsr') return;
  G.mode = 'menu';
  G.hsr = null;
  const hud = document.getElementById('hsrMainHud');
  if (hud) hud.classList.add('hidden');
  const menu = document.getElementById('menu');
  if (menu) menu.classList.remove('hidden');
  const r = document.getElementById('hsrMainResult');
  if (r) r.classList.add('hidden');
}
window.addEventListener('keydown', (e) => {
  if (G.mode !== 'hsr') return;
  if (e.code === 'KeyR') {
    resetHsrMain();
  } else if (e.code === 'Escape') {
    exitHsrMain();
  }
});

window.__hsrMain = {
  get state() { return G.hsr ? { x: G.hsr.x, v: G.hsr.v, stopped: G.hsr.stopped, stopErr: G.hsr.stopErr, stopIdx: G.hsr.stopIdx, doorT: G.hsr.doorT, doors: G.hsr.doorNodes.length } : null; },
  setX(x) { if (G.hsr) { G.hsr.x = x; G.hsr.v = 0; G.hsr.stopped = false; } },
  setStop(i) { if (G.hsr) { G.hsr.stopIdx = i; G.hsr.stopped = false; G.hsr.stopErr = null; } },
  exit: exitHsrMain
};
