/* ================================================================
   游戏主体：状态机 / 物理 / 停站 / 视角 / HUD
   ================================================================ */
const $ = id => document.getElementById(id);
const G = {
  mode: 'menu',
  routeIdx: 0,
  tod: 'dusk',
  weather: 'clear',
  diff: 'normal',
  voice: 'on',
  paused: false,
  s: 0, v: 0, lever: 0, eb: false,
  doorsOpen: false, doorT: 0,
  clock: 0, targetIdx: 0, stopState: 'run',
  stopErr: 0, stopScore: 0,
  results: [], penalties: 0, atpViol: 0, ebCount: 0,
  energy: 0, trainNo: '02014',
  lastSoundDoor: -1,
  camMode: 0, yaw: 0, pitch: -0.02,
  orbit: { az: 0.7, el: 0.26, dist: 34 },
  dragging: false, lastX: 0, lastY: 0,
  finishTimer: -1,
  announced: {},
  ready: false,
  ato: false, atoState: 'run', atoTimer: 0,
  shakeOn: true, shakeAmp: 0.0022,
  fault: null, faultCount: 0, speedLog: [],
  sigMode: 'cbtc', exam: false, examTasks: [], examDone: 0, doorAt: {},
  stopPlan: null, walk: null, turnback: null
};

let renderer, camera, scene, composer, bloomPass, sun, skyMesh, hemi;
let path = null, line = null, routeDef = null, theme = THEMES.dusk;
let train = null, aiTrains = [], stationObjs = [], worldGroup = null, stationLights = [];
const SL_OFF = [[-8.2, 4.6, -40], [8.2, 4.6, -40], [-8.2, 4.6, 40], [8.2, 4.6, 40]];
let hero = null;
let clock = new THREE.Clock();
let matInited = false;

/* ---------------------------------------------------------------- 初始化 */
function initRenderer() {
  const canvas = $('scene');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.06, 5200);
  camera.position.set(0, 3, 10);
  window.addEventListener('resize', onResize);
}

function onResize() {
  if (!renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) {
    composer.setSize(window.innerWidth, window.innerHeight);
    if (bloomPass) bloomPass.resolution.set(window.innerWidth, window.innerHeight);
  }
}

function makeComposer(targetScene) {
  if (composer) { composer.dispose(); composer = null; }
  if (G.quality === 'low') return;
  const pr = Math.min(window.devicePixelRatio || 1, 1.6);
  const rt = new THREE.WebGLRenderTarget(Math.floor(window.innerWidth * pr), Math.floor(window.innerHeight * pr), {
    type: THREE.HalfFloatType, samples: 4
  });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(targetScene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), theme.bloom * 0.34, 0.55, 1.08);
  composer.addPass(bloomPass);
  const vig = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, strength: { value: 0.55 }, time: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
      void main(){ vec4 c=texture2D(tDiffuse,vUv); vec2 p=vUv-0.5; float v=smoothstep(0.85,0.18,length(p)*1.25);
      c.rgb*=mix(1.0-strength*0.55,1.0,v); gl_FragColor=c; }`
  });
  composer.addPass(vig);
  composer.addPass(new OutputPass());
}

/* ---------------------------------------------------------------- 菜单场景 */
function buildHero() {
  const th = THEMES[G.tod];
  const s = new THREE.Scene();
  s.fog = new THREE.FogExp2(th.fog, 0.0022);
  s.add(createSky(th));
  const pm = new THREE.PMREMGenerator(renderer);
  const es = new THREE.Scene(); es.add(createSky(th));
  try { s.environment = pm.fromScene(es, 0.02).texture; } catch (e) { console.warn("[PMREM] 降级", e); }
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
async function loadStep(label, pct) {
  $('loadStep').textContent = label;
  $('loadFill').style.width = Math.round(pct * 100) + '%';
  $('loadPct').textContent = Math.round(pct * 100) + '%';
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
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
  const pm = new THREE.PMREMGenerator(renderer);
  const es = new THREE.Scene(); es.add(createSky(theme));
  try { s.environment = pm.fromScene(es, 0.02).texture; } catch (e) { console.warn("[PMREM] 降级", e); }

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

  stationObjs = [];
  for (let i = 0; i < path.stations.length; i++) {
    const st = path.stations[i];
    if (st.synthetic) { stationObjs.push(null); continue; }
    await loadStep(`正在建造车站  ${st.zh}…`, 0.72 + 0.18 * (i / path.stations.length));
    const so = buildStation(path, line, st, i, theme);
    root.add(so.group);
    stationObjs.push(so);
  }

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

/* ---------------------------------------------------------------- 开始 / 重置 */
function resetService() {
  const st = path.stations;
  G.s = st[0].stopS;
  G.v = 0; G.lever = 0; G.eb = false;
  G.doorsOpen = true; G.doorT = 1;
  G.clock = path.startSec - 30;
  G.targetIdx = 0;
  G.stopState = 'dwell';
  G.stopErr = 0; G.stopScore = 0;
  G.results = []; G.penalties = 0; G.atpViol = 0; G.ebCount = 0;
  G.energy = 0; G.finishTimer = -1;
  G.announced = {};
  G.camMode = 0; G.yaw = 0; G.pitch = -0.02;
  G.ato = false; G.atoState = 'run'; G.atoTimer = 0; G.atpBrake = false; G.doorWarned = false;
  if (typeof IX !== 'undefined' && IX.routes.length) IX.applyRoute('main', true);
  G.fault = null; G.faultCount = 0; G.speedLog = [];
  G.sigMode = 'cbtc'; G.examTasks = []; G.examDone = 0; G.doorAt = {};
  G.walk = null; G.turnback = null;
  hideTransferPanel();
  if (G.exam) examInit();

  train.carLag.fill(0);
  train._lastV = 0;
  train.update(G.s, 0, 0);
  train.setDoorT(1);
  stationObjs.forEach((so, i) => {
    if (!so) return;
    so.psdL.setOpen(i === 0 ? 1 : 0);
    so.psdR.setOpen(0);
    if (so.crowd) so.crowd.reset();
  });
  for (const ai of aiTrains) { ai.reset(); ai._psd = null; }
  G.leaderGap = null; G.leaderNo = '';
  buildTimetable();
  updateHUD(true);
  showBanner(st[0].zh, st[0].en);
  toast(`值乘开始 · ${st[0].zh} 站，请关闭车门`, 'good', 5200);
  AUDIO.announce(`欢迎乘坐上海地铁${line.name}，本次列车开往${st[st.length - 1].zh}方向。请关闭车门，准备发车。`);
}

function beginDriving() {
  $('briefing').classList.add('hidden');
  $('hud').classList.add('on');
  G.mode = 'driving';
  G.paused = false;
  clock.getDelta();
  resetService();
  updateCamera(0, true);
}

/* ---------------------------------------------------------------- 物理 */
function stationDist() {
  const st = path.stations[G.targetIdx];
  return st ? st.stopS - G.s : 0;
}

/* 环线终到站是合成站，没有独立站台对象，复用起点站台 */
function stationObjFor(idx) {
  const so = stationObjs[idx];
  if (so) return so;
  const st = path.stations[idx];
  return (st && st.synthetic) ? stationObjs[0] : null;
}

/* ---------------- 站内步行 ---------------- */
function enterWalk(idx) {
  const st = path.stations[idx], f = st.frame;
  const pos = f.pos.clone()
    .addScaledVector(f.right, -3.0)
    .addScaledVector(f.up, 1.06 + 1.7)
    .addScaledVector(f.tan, 60);
  G.walk = {
    active: true, station: idx, pos,
    yaw: Math.atan2(-f.tan.x, -f.tan.z), pitch: 0, tip: false, tpHidden: false
  };
  hideTransferPanel();
}

function toggleWalk() {
  if (G.mode !== 'driving' || G.paused) return;
  if (G.walk && G.walk.active) {
    G.walk.active = false;
    hideTransferPanel();
    updateCamera(0, true);
    toast('已返回司机室', 'info', 2600);
    return;
  }
  if (G.stopState !== 'dwell' || !G.doorsOpen) { toast('停稳并开门后才能下车', 'warn', 3000); return; }
  if (isLastServed(G.targetIdx)) { toast('终到站请结束值乘', 'warn', 3000); return; }
  if (G.ato) toggleATO(false);
  enterWalk(G.targetIdx);
  toast('步行模式 · WASD 移动，鼠标环视，F 返回司机室；换乘通道尽头可换乘', 'info', 5200);
}

function clampWalk() {
  if (!G.walk || !G.walk.active) return;
  const w = G.walk, st = path.stations[w.station], f = st.frame;
  const inv = new THREE.Matrix4().makeBasis(f.right, f.up, f.tan).invert();
  const local = w.pos.clone().sub(f.pos).applyMatrix4(inv);
  local.x = clamp(local.x, -3.75, 3.75);
  local.z = Math.max(local.z, -69);
  const hasTr = st.tr && st.tr.length;
  if (hasTr) {
    if (local.z > 69) {
      local.x = clamp(local.x, -3.0, 3.0);
      local.z = Math.min(local.z, 94);
      if (!w.tip) {
        w.tip = true;
        toast('换乘通道 · 走到尽头选择要换乘的线路', 'info', 4200);
      }
    }
    if (local.z < 82) w.tpHidden = false;
    if (local.z > 88 && !w.tpHidden) showTransferPanel();
    else hideTransferPanel();
  } else {
    local.z = Math.min(local.z, 69);
    hideTransferPanel();
  }
  local.y = 1.06 + 1.7;
  w.pos.copy(f.pos)
    .addScaledVector(f.right, local.x)
    .addScaledVector(f.up, local.y)
    .addScaledVector(f.tan, local.z);
}

function transferRouteFor(name) {
  let fallback = -1;
  for (let i = 0; i < ROUTES.length; i++) {
    const r = ROUTES[i], l = LINES[r.line];
    if (!l || l.name !== name) continue;
    if (r.id.startsWith('full')) return i;
    if (fallback < 0) fallback = i;
  }
  return fallback;
}

function showTransferPanel() {
  if (!G.walk || !G.walk.active) return;
  const st = path.stations[G.walk.station];
  const box = $('transferPanel'), list = $('transferList');
  if (!st || !st.tr || !st.tr.length) { hideTransferPanel(); return; }
  const names = [...new Set(st.tr)].filter(n => n !== line.name && transferRouteFor(n) >= 0);
  if (!names.length) { hideTransferPanel(); return; }
  const key = G.walk.station + '|' + line.name + '|' + names.join(',');
  if (box.dataset.key !== key) {
    box.dataset.key = key;
    list.innerHTML = names.map(n => {
      const ri = transferRouteFor(n), l = LINES[ROUTES[ri].line];
      return `<button class="tp-line" data-line="${n}" style="--c:${l.color}"><b>${l.badge}</b><span>${l.name}</span><i>换乘</i></button>`;
    }).join('');
  }
  box.classList.remove('hidden');
}

function hideTransferPanel() {
  const box = $('transferPanel');
  if (box) box.classList.add('hidden');
}

async function performTransfer(lineName) {
  if (!G.walk || !G.walk.active) return;
  const from = path.stations[G.walk.station];
  const ri = transferRouteFor(lineName);
  if (ri < 0) { toast(`${lineName} 暂无可用交路`, 'warn', 3000); return; }
  hideTransferPanel();
  G.walk.active = false;
  G.mode = 'loading';
  $('hud').classList.remove('on');
  $('loading').classList.remove('hidden');
  $('loadStep').textContent = `正在换乘至 ${lineName}…`;
  $('loadPct').textContent = '';
  $('loadFill').style.width = '0%';
  try {
    await buildService(ri);
    let ti = path.stations.findIndex(s => s.zh === from.zh);
    if (ti < 0) ti = 0;
    const st = path.stations[ti];
    G.targetIdx = ti;
    G.s = st.stopS;
    G.v = 0; G.lever = 0; G.eb = false;
    G.doorsOpen = true; G.doorT = 1;
    G.stopState = 'dwell';
    G.clock = st.schArr;
    G.doorAt = {}; G.announced = {};
    G.results = []; G.penalties = 0; G.atpViol = 0; G.ebCount = 0;
    G.energy = 0; G.speedLog = [];
    G.finishTimer = -1; G.ato = false; G.atoState = 'run';
    G.exam = false; G.examTasks = []; G.fault = null; G.faultCount = 0;
    G.sigMode = 'cbtc'; G.walk = null; G.turnback = null;
    train.carLag.fill(0); train._lastV = 0;
    train.update(G.s, 0, 0);
    train.setDoorT(1);
    const so = stationObjFor(ti);
    if (so) so.psdL.setOpen(1);
    buildTimetable();
    updateTimetable();
    updateHUD(true);
    $('loading').classList.add('hidden');
    $('results').classList.add('hidden');
    $('examPanel').classList.remove('on');
    $('hud').classList.add('on');
    G.mode = 'driving';
    clock.getDelta();
    enterWalk(ti);
    toast(`换乘成功 · ${line.name} ${st.zh} 站台`, 'good', 4600);
    AUDIO.announce(`已换乘至上海地铁${line.name}${st.zh}站。`);
    updateCamera(0, true);
  } catch (err) {
    console.error(err);
    $('loadStep').textContent = '换乘失败：' + (err && err.message ? err.message : err);
    $('loadPct').textContent = '请刷新页面重试';
  }
}

/* 终端折返：先锁闭 B 进路，列车动车至折返线，再重建反向交路 */
function startTurnback() {
  if (!path || !train || G.mode !== 'results') return;
  if (routeDef.loop || routeDef.stopPlan || G.reverse) return;
  const last = path.stations[path.stations.length - 1];
  if (G.targetIdx !== last.index) { toast('只能在终到站折返', 'warn', 3000); return; }
  if (typeof IX !== 'undefined' && IX.occupied()) {
    toast('折返进路区段有车占用 · 进路锁闭', 'warn', 3600);
    return;
  }
  if (typeof IX !== 'undefined') IX.applyRoute('revB');
  G.doorsOpen = false; G.doorT = 0;
  train.setDoorT(0);
  const so = stationObjFor(G.targetIdx);
  if (so) so.psdL.setOpen(0);
  $('results').classList.add('hidden');
  $('hud').classList.add('on');
  G.mode = 'turnback';
  G.finishTimer = -1;
  G.ato = false; G.lever = 0; G.eb = false;
  G.turnback = {
    phase: 'move', t: 0, v: 0, s: G.s,
    target: Math.min(path.length - 20, last.stopS + 80)
  };
  toast('终端折返 · B 进路已锁闭，列车动车至折返线', 'info', 4600);
  AUDIO.announce('终点站折返，列车动车至折返线，请注意安全。');
  updateHUD(true);
}

function updateTurnback(dt) {
  const tb = G.turnback;
  if (!tb) return;
  if (typeof IX !== 'undefined') IX.update(dt);
  if (typeof updateSignals === 'function') updateSignals(dt);
  for (const ai of aiTrains) ai.update(dt);
  if (tb.phase === 'move') {
    tb.t += dt;
    const d = tb.target - tb.s;
    const vT = d > 16 ? 6 : Math.max(0, d * 0.6);
    tb.v += clamp(vT - tb.v, -1.1 * dt, 0.9 * dt);
    tb.s = Math.min(tb.target, tb.s + tb.v * dt);
    G.s = tb.s; G.v = tb.v;
    train.setDoorT(0);
    train.update(G.s, G.v, dt);
    updateCamera(dt);
    if (tb.target - tb.s < 0.15 && tb.v < 0.08) {
      tb.s = tb.target; tb.v = 0; tb.phase = 'wait'; tb.t = 0;
    }
  } else if (tb.phase === 'wait') {
    tb.t += dt;
    if (tb.t > 2.4) {
      tb.phase = 'reload';
      finishTurnback();
    }
  }
}

async function finishTurnback() {
  G.mode = 'loading';
  $('hud').classList.remove('on');
  $('loading').classList.remove('hidden');
  $('loadStep').textContent = '折返完成，正在准备反向交路…';
  $('loadPct').textContent = '';
  $('loadFill').style.width = '0%';
  try {
    await buildService(G.routeIdx, true);
    $('loading').classList.add('hidden');
    G.turnback = null;
    beginDriving();
    toast('折返完成 · 反向值乘开始', 'good', 4200);
  } catch (err) {
    console.error(err);
    $('loadStep').textContent = '折返失败：' + (err && err.message ? err.message : err);
    $('loadPct').textContent = '请刷新页面重试';
  }
}

function nextServedIdx(idx) {
  if (!G.stopPlan) return idx + 1;
  for (let i = idx + 1; i < path.stations.length; i++) {
    if (G.stopPlan.has(i)) return i;
  }
  return path.stations.length;
}

function isLastServed(idx) {
  return nextServedIdx(idx) >= path.stations.length;
}

function physics(dt) {
  const st = path.stations[G.targetIdx];
  const v = G.v;
  const speedKmh = v * 3.6;
  const indoor = path.frameAt(G.s).pos.y < -2;

  // ATP 限速
  let limit = path.atpLimit(G.s, v);
  const ldr = playerLeader();
  G.leaderGap = ldr ? ldr.gap : null;
  G.leaderNo = ldr ? ldr.carNo : '';
  if (ldr && ldr.gap < 700) {
    const track = Math.sqrt(2 * 0.85 * Math.max(0, ldr.gap - 24)) * 3.6;
    limit = Math.min(limit, track);
  }
  if (G.sigMode === 'fixed') limit = Math.min(limit, fixedBlockLimit());
  // 牵引故障限速必须先于超速判定生效
  if (G.fault && G.fault.type === 'traction') limit = Math.min(limit, 40);
  if (typeof interlockSpeedLimit === 'function') limit = interlockSpeedLimit(G.s, limit);
  G.limit = limit;
  const overBy = speedKmh - limit;
  G.atpWarn = overBy > 3.0;
  if (overBy > 12 && !G.eb) {
    triggerEB('ATP 超速防护动作');
  } else if (overBy > 6.5) {
    if (!G.atpBrake) {
      toast('ATP 实施常用制动 · 请注意限速', 'warn', 3200);
      if (G.exam) examEvent('atp', false);
    }
    G.atpBrake = true;
  }
  if (G.atpBrake && overBy < 1.2) G.atpBrake = false;

  if (G.ato) { atoStep(dt); G.lever = atoCommand(); }

  // 新手模式：停站制动辅助
  if (!G.ato && G.diff === 'easy' && !G.eb && G.stopState === 'run' && st) {
    const d = st.stopS - G.s;
    if (d > 3 && G.v > 0.5) {
      const need = (G.v * G.v) / (2 * d) / BRK_SRV;
      if (need > 0.1 && -G.lever < need * 0.94) G.lever = -clamp(need, 0, 1);
    }
  }

  // 手柄 → 牵引/制动
  let traction = 0, brake = 0;
  if (G.eb) brake = 1;
  else if (G.atpBrake) { brake = 1; traction = 0; }
  else if (G.lever > 0.005) traction = G.lever;
  else if (G.lever < -0.005) brake = -G.lever;

  // 受电弓 / 牵引故障：牵引封锁或减半
  if (G.fault && G.fault.type === 'pantograph' && traction > 0) {
    traction = 0;
    if (!G.fault.warned) {
      G.fault.warned = true;
      toast('受电弓无电流 · 牵引封锁，按 L 重启', 'bad', 5200);
      AUDIO.beep(true);
    }
  }
  if (G.fault && G.fault.type === 'traction') {
    traction *= 0.5;
  }
  if (G.fault && G.fault.type === 'brake') brake *= 0.7;

  // 车门故障：未隔离则牵引封锁
  if (G.fault && G.fault.type === 'door' && traction > 0) {
    traction = 0;
    if (!G.fault.warned) {
      G.fault.warned = true;
      toast(`${G.fault.name}未关闭 · 牵引被封锁，按 L 隔离`, 'bad', 5200);
      AUDIO.beep(true);
    }
  }

  // 车门联锁
  if ((G.doorsOpen || G.doorT > 0.02) && traction > 0) {
    traction = 0;
    if (!G.doorWarned) { toast('车门未关闭，牵引被封锁', 'warn'); AUDIO.beep(); G.doorWarned = true; }
  } else if (!G.doorsOpen && G.doorT < 0.02) G.doorWarned = false;

  let a = 0;
  let force = 0;
  if (traction > 0) {
    let aT = ACC_MAX * traction;
    if (v > POWER_V) aT *= POWER_V / v;
    // 载荷修正
    aT *= 0.94;
    a += aT;
    force = aT * 230000;
  }
  if (brake > 0) {
    const aB = (G.eb ? BRK_EMG : BRK_SRV) * brake * (indoor ? 1 : weatherGrip());
    a -= aB;
  }
  // 基本阻力 + 坡道
  const res = 0.018 + 0.00045 * v + 0.00007 * v * v;
  a -= Math.sign(v || 0) * res;
  a -= 9.81 * path.gradeAt(G.s);

  const nv = v + a * dt;
  if (nv < 0 && brake > 0.01) { G.v = 0; }
  else if (nv < 0) { G.v = Math.max(0, nv); }
  else G.v = nv;
  if (G.v < 0.02 && brake > 0.02) G.v = 0;

  // 停车保持（坡道防溜）
  if (G.v < 0.06 && traction < 0.01 && brake < 0.01) G.v = 0;

  G.s += G.v * dt;
  G.s = clamp(G.s, 0, path.length - 12);

  // 能耗
  if (force > 0) G.energy += force * Math.max(0, G.v) * dt / 3.6e6;

  // 停站判定
  if (st) {
    const dist = st.stopS - G.s;
    if (G.stopState === 'run') {
      if (G.v < 0.05 && Math.abs(dist) < 8) {
        onStopped(st, dist);
      } else if (dist < -8 && G.v > 1) {
        missedStation(st);
      }
    }
    if (G.stopState === 'stop' && G.v > 0.5) {
      onDeparture(st);
    }
    if (G.stopState === 'dwell' && G.v > 0.5) {
      // 门未关强行牵引（已被联锁阻止，这里兜底）
      G.v = 0;
    }
    // 活塞风：高速通过或进入隧道时
    if (G.v > 9 && G.targetIdx >= 0 && !G.announced['w' + G.targetIdx] && dist < 260 && dist > 200) {
      G.announced['w' + G.targetIdx] = true;
      const tunnel = path.frameAt(G.s).pos.y < -2;
      AUDIO.windGust(tunnel ? 1.15 : 0.7);
    }
    // 到达预告
    if (G.stopState === 'run' && dist < 420 && dist > 380 && !G.announced['a' + G.targetIdx]) {
      G.announced['a' + G.targetIdx] = true;
      AUDIO.chime('info');
      AUDIO.announce(`下一站，${st.zh}，请从左侧车门下车，请注意站台间隙。`);
      toast(`下一站  ${st.zh}  ·  请准备停车`, 'info', 4200);
    }
  }

  // 车门动画
  const target = G.doorsOpen ? 1 : 0;
  if (G.doorT !== target) {
    G.doorT += Math.sign(target - G.doorT) * dt * 0.33;
    G.doorT = clamp(G.doorT, 0, 1);
    train.setDoorT(G.doorT);
    const so = stationObjFor(G.targetIdx);
    if (so) { so.psdL.setOpen(G.doorT); }
  }
}

function triggerEB(reason) {
  if (G.eb) return;
  G.eb = true;
  G.ebCount++;
  G.penalties += 15;
  G.lever = 0;
  if (G.exam) {
    examEvent('eb', false);
    if (/ATP/i.test(reason)) examEvent('atp', false);
  }
  AUDIO.beep(true);
  toast('紧急制动 · ' + reason, 'bad', 4200);
}

function releaseEB() {
  if (!G.eb) return false;
  if (G.v > 0.3) {
    toast('列车尚未停稳，不能缓解紧急制动', 'warn', 2600);
    AUDIO.beep();
    return false;
  }
  G.eb = false;
  G.lever = 0;
  AUDIO.hiss(0.45, 0.05);
  toast('紧急制动已缓解 · 可重新牵引（W）', 'good', 3600);
  updateHUD(true);
  return true;
}

/* ---------------- ATO 自动运行 ---------------- */
function toggleATO(force) {
  if (G.mode !== 'driving') return;
  const on = force === undefined ? !G.ato : !!force;
  if (on === G.ato) return;
  G.ato = on;
  if (on) {
    G.atoState = G.doorsOpen ? 'dwell' : (G.stopState === 'run' ? 'run' : 'stopped');
    G.atoTimer = G.doorsOpen ? Math.max(0, (routeDef.dwell || 30) - 7) : 0;
    if (G.stopState === 'stop') G.atoState = 'stopped';
    toast('ATO 自动运行已启用 · 按 A 或 W/S 接管', 'good', 4200);
    AUDIO.beep();
    AUDIO.announce('自动驾驶已启用，列车将自动运行。');
  } else {
    toast('ATO 已退出 · 手动驾驶', 'info', 2600);
  }
  updateHUD(true);
}

function atoStep(dt) {
  const st = path.stations[G.targetIdx];
  switch (G.atoState) {
    case 'run':
      if (G.eb) {
        G.atoTimer += dt;
        if (G.v < 0.1 && G.atoTimer > 2.2) { releaseEB(); G.atoTimer = 0; }
      } else if (G.stopState === 'stop' && G.v < 0.05) {
        G.atoState = 'stopped'; G.atoTimer = 0;
      }
      break;
    case 'stopped':
      G.atoTimer += dt;
      if (G.atoTimer > 1.2) {
        openDoors();
        if (G.doorsOpen) { G.atoState = 'dwell'; G.atoTimer = 0; }
        else if (G.atoTimer > 7) {
          G.ato = false;
          toast('ATO 未能对准站台，已切换人工驾驶', 'bad', 4200);
        }
      }
      break;
    case 'dwell':
      G.atoTimer += dt;
      if (!G.doorsOpen && G.doorT < 0.02) { G.atoState = 'waitdepart'; G.atoTimer = 0; }
      else if (G.atoTimer > (routeDef.dwell || 30)) { closeDoors(); G.atoTimer = 0; }
      break;
    case 'waitdepart':
      G.atoTimer += dt;
      if (G.atoTimer > 1.5) { G.atoState = 'depart'; G.atoTimer = 0; }
      break;
    case 'depart':
      if (G.stopState === 'run') { G.atoState = 'run'; G.atoTimer = 0; }
      break;
  }
}

function atoCommand() {
  const st = path.stations[G.targetIdx];
  if (!st || G.eb) return 0;
  if (G.doorsOpen || G.doorT > 0.03) return 0;
  const v = G.v;
  if (G.atoState === 'depart') return v < 3.2 ? 0.55 : 0;
  if (G.atoState !== 'run') return 0;

  const d = st.stopS - G.s;
  if (d <= 0.3) return v > 0.08 ? -0.7 : 0;

  const vLim = Math.min(path.vmax - 1, path.atpLimit(G.s, v) - 2.0) * KMH;
  const req = (v * v) / (2 * Math.max(0.35, d - 1.1));

  // 低速精确对位
  if (d < 13) {
    const vCrawl = clamp(d * 0.42, 0, 3.0);
    return clamp((vCrawl - v) * 0.9, -0.75, 0.6);
  }

  let brakeCmd = 0;
  if (v > vLim + 0.25) brakeCmd = Math.max(brakeCmd, clamp(0.18 + (v - vLim) * 0.62, 0.12, 1));
  if (req > 0.42) brakeCmd = Math.max(brakeCmd, clamp(req / 0.95, 0.1, 1));
  if (brakeCmd > 0.02) return -brakeCmd;

  const vT = Math.min(vLim, Math.sqrt(2 * 0.95 * Math.max(0, d - 2.0)));
  if (v < vT - 0.12) return clamp(0.22 + (vT - v) * 0.5, 0, 0.85);
  return 0;
}

function onStopped(st, dist) {
  if (G.exam) examEvent('stop', Math.abs(dist));
  G.stopState = 'stop';
  G.stopErr = G.s - st.stopS;
  const e = Math.abs(G.stopErr);
  let base = clamp(100 - 26 * e, 0, 100);
  if (e <= 0.35) base = 100;
  G.stopScore = base;
  if (e <= 0.35) {
    toast(`停车精准 · 偏差 ${(G.stopErr >= 0 ? '+' : '')}${G.stopErr.toFixed(2)} m  ·  +100`, 'good', 5000);
    AUDIO.chime('info');
  } else if (e <= 1.2) {
    toast(`停车良好 · 偏差 ${(G.stopErr >= 0 ? '+' : '')}${G.stopErr.toFixed(2)} m  ·  +${Math.round(base)}`, 'good', 4600);
  } else {
    toast(`停车偏差 ${(G.stopErr >= 0 ? '+' : '')}${G.stopErr.toFixed(2)} m  ·  +${Math.round(base)}`, 'warn', 4600);
  }
  if (G.targetIdx > 0) {
    G.results.push({
      idx: G.targetIdx, zh: st.zh, err: G.stopErr, stopScore: base,
      arrClock: G.clock, schArr: st.schArr, depDelay: 0, punc: 0
    });
  }
  AUDIO.announce(`${st.zh}站，到了。`);
}

function onDeparture(st) {
  if (G.exam && st.index === 0) examEvent('depart', G.clock - st.schDep);
  if (G.exam && st.index > 0 && !G.doorAt[st.index]) examEvent('door', false);
  G.stopState = 'run';
  const rec = G.results.find(r => r.idx === G.targetIdx);
  const delay = G.clock - st.schDep;
  if (rec) {
    rec.depClock = G.clock; rec.depDelay = delay;
    rec.punc = clamp(100 - 1.5 * Math.abs(delay), 0, 100);
  }
  const prevIdx = G.targetIdx;
  G.announced['a' + prevIdx] = false;
  const nxIdx = nextServedIdx(prevIdx);
  if (nxIdx < path.stations.length) {
    G.targetIdx = nxIdx;
    const nx = path.stations[nxIdx];
    AUDIO.announce(`车门关闭，列车启动，下一站，${nx.zh}。`);
    toast(`发车 · 下一站 ${nx.zh}`, 'info', 4000);
    // 关闭已离开车站的屏蔽门
    const prev = stationObjFor(prevIdx);
    if (prev) { prev.psdL.setOpen(0); }
  }
  updateTimetable();
}

function missedStation(st) {
  toast(`越过 ${st.zh} 停车位置 · 本站未办理乘降`, 'bad', 5000);
  if (G.exam) { examEvent('door', false); examEvent('stop', 99); }
  G.penalties += 30;
  const prevIdx = G.targetIdx;
  G.results.push({ idx: prevIdx, zh: st.zh, err: 99, stopScore: 0, arrClock: G.clock, schArr: st.schArr, punc: 0 });
  G.stopState = 'run';
  const prev = stationObjFor(prevIdx);
  if (prev) { prev.psdL.setOpen(0); }
  const nxIdx = nextServedIdx(prevIdx);
  if (nxIdx < path.stations.length) {
    G.targetIdx = nxIdx;
    updateTimetable();
  } else {
    finishService();
  }
}

/* ---------------------------------------------------------------- 门控 */
function openDoors() {
  if (G.mode !== 'driving' || G.paused) return;
  if (G.doorsOpen) return;
  const st = path.stations[G.targetIdx];
  if (G.v > 0.2) { toast('列车未停稳，车门不能开启', 'warn'); AUDIO.beep(); return; }
  const dist = Math.abs(G.s - st.stopS);
  if (dist > 8) { toast('未对准站台，车门不能开启', 'bad'); AUDIO.beep(); return; }
  if (G.stopState !== 'stop' && G.stopState !== 'dwell') { toast('当前不在停站状态', 'warn'); return; }
  G.doorsOpen = true;
  G.stopState = 'dwell';
  G.doorAt[G.targetIdx] = true;
  AUDIO.hiss(1.1, 0.05);
  setTimeout(() => AUDIO.thud(), 340);
  AUDIO.chime('open');
  toast('车门开启 · 请确认站台安全', 'good', 3000);
  maybeFault();
  AUDIO.announce('车门已开启，请先下后上，注意站台间隙。');
  const rec = G.results.find(r => r.idx === G.targetIdx);
  if (rec) {
    rec.arrDelay = G.clock - st.schArr;
  }
  if (isLastServed(G.targetIdx)) {
    G.finishTimer = 6;
    const rec = G.results.find(r => r.idx === G.targetIdx);
    if (rec) {
      rec.punc = clamp(100 - 1.5 * Math.abs(G.clock - st.schArr), 0, 100);
      rec.depDelay = G.clock - st.schArr;
    }
    toast('终到站 · 本次值乘即将结束', 'good', 5000);
  }
}
/* ---------------- 故障演练 ---------------- */
const FAULT_TYPES = [
  { type: 'door', w: 0.34, make: () => {
      const car = 2 + Math.floor(Math.random() * 4);
      return { name: `${car} 号车门`, brief: `${car} 号车门未关闭`, hint: '按 L 隔离该车门' };
    } },
  { type: 'traction', w: 0.24, make: () => ({ name: '牵引逆变器', brief: '牵引逆变器故障', hint: '限速 40 km/h，按 L 复位' }) },
  { type: 'signal', w: 0.2, make: () => ({ name: '车载 ATP', brief: '车载 ATP 故障', hint: '已转入固定闭塞，按 L 复位' }) },
  { type: 'pantograph', w: 0.12, make: () => ({ name: '受电弓', brief: '受电弓检测异常', hint: '牵引封锁，按 L 重启' }) },
  { type: 'brake', w: 0.1, make: () => ({ name: '制动系统', brief: '制动缓解不良', hint: '制动力下降，按 L 复位' }) }
];

function maybeFault() {
  const chance = G.diff === 'hard' ? 0.24 : G.diff === 'easy' ? 0.05 : 0.13;
  if (G.fault || G.targetIdx === 0) return;
  if (Math.random() > chance) return;
  let r = Math.random(), pick = FAULT_TYPES[0];
  for (const f of FAULT_TYPES) { r -= f.w; if (r <= 0) { pick = f; break; } }
  const info = pick.make();
  G.fault = { type: pick.type, name: info.name, warned: false };
  G.faultCount++;
  toast(`⚠ ${info.brief} · ${info.hint}`, 'bad', 6800);
  AUDIO.beep(true);
  AUDIO.announce(`${info.brief}，请司机处理。`);
  if (pick.type === 'signal') G.sigMode = 'fixed';
  updateHUD(true);
}

function clearFault() {
  if (!G.fault) return;
  const n = G.fault.name, ty = G.fault.type;
  G.fault = null;
  G.penalties += 6;
  AUDIO.beep();
  AUDIO.hiss(0.3, 0.04);
  if (ty === 'signal') G.sigMode = 'cbtc';
  const msg = ty === 'door' ? `${n}已隔离 · 牵引封锁解除`
    : ty === 'traction' ? '牵引逆变器已复位 · 限速解除'
      : ty === 'signal' ? 'ATP 已重启 · 恢复移动闭塞'
        : ty === 'pantograph' ? '受电弓已重启 · 牵引恢复'
          : '制动系统已复位';
  toast(msg, 'good', 3800);
  if (G.exam) examEvent('faultFixed');
  updateHUD(true);
}

function closeDoors() {
  if (G.mode !== 'driving' || G.paused) return;
  if (!G.doorsOpen) return;
  G.doorsOpen = false;
  G.stopState = 'stop';
  AUDIO.chime('close');
  AUDIO.hiss(0.9, 0.042);
  setTimeout(() => AUDIO.thud(), 2750);
  toast('车门关闭 · 可以发车', 'good', 3000);
}

/* ---------------------------------------------------------------- 结算 */
function finishService() {
  if (G.mode === 'results') return;
  G.mode = 'results';
  const stops = G.results.filter(r => r.idx > 0);
  const avgStop = stops.length ? stops.reduce((a, r) => a + r.stopScore, 0) / stops.length : 0;
  const avgPunc = stops.length ? stops.reduce((a, r) => a + r.punc, 0) / stops.length : 0;
  const examOK = G.exam && G.examTasks.length > 0 && examPassed();
  const base = 0.62 * avgStop + 0.38 * avgPunc - (examOK ? 0 : G.penalties);
  const score = clamp(Math.round(base), 0, 100);
  const grade = score >= 93 ? 'S' : score >= 84 ? 'A' : score >= 72 ? 'B' : score >= 58 ? 'C' : 'D';
  $('resGrade').textContent = grade;
  $('resScore').textContent = score;
  $('resStop').innerHTML = (stops.length ? (stops.reduce((a, r) => a + Math.abs(r.err), 0) / stops.length).toFixed(2) : '—') + '<small>m</small>';
  $('resPunc').innerHTML = Math.round(avgPunc) + '<small>%</small>';
  $('resKwh').innerHTML = Math.round(G.energy) + '<small>kWh</small>';
  const pen = $('resPenalty');
  if (pen) pen.innerHTML = (G.penalties > 0 ? '-' + G.penalties : '0') + '<small>分</small>';
  let rows = `<div class="stop-line head"><span>车站</span><span>停车偏差</span><span>发车偏差</span><span>得分</span></div>`;
  for (const r of stops) {
    const s = clamp(Math.round(0.62 * r.stopScore + 0.38 * r.punc), 0, 100);
    rows += `<div class="stop-line"><b>${r.zh}</b><span>${r.err === 99 ? '越站' : ((r.err >= 0 ? '+' : '') + r.err.toFixed(2) + ' m')}</span>
      <span>${r.depDelay === undefined ? '—' : ((r.depDelay >= 0 ? '+' : '') + Math.round(r.depDelay) + ' s')}</span><b>${s}</b></div>`;
  }
  $('resTable').innerHTML = rows;
  const exBox = $('resExam');
  if (exBox) {
    if (G.exam && G.examTasks.length) {
      const pass = examPassed();
      exBox.style.display = '';
      exBox.innerHTML = `<div class="er-head"><span>执照考试</span><span class="${pass ? 'pass' : 'fail'}">${pass ? '通过' : '未通过'}</span></div>` +
        G.examTasks.map(t => `<div class="er-item ${t.ok === true ? 'ok' : 'bad'}"><b>${t.ok === true ? '✓' : '✕'}</b>${t.label}</div>`).join('');
      if (pass) {
        G.penalties = 0;
        $('resTitle').textContent = '执照考试通过';
      } else {
        $('resTitle').textContent = '执照考试未通过';
      }
    } else {
      exBox.style.display = 'none';
      $('resTitle').textContent = '值乘结束';
    }
  }
  drawSpeedChart();
  if (typeof routeDef !== 'undefined' && routeDef) saveCareer(routeDef.id + (G.reverse ? ':rev' : ''), score, grade);
  const rvBtn = $('resReverse');
  if (rvBtn) rvBtn.style.display = (G.reverse || (routeDef && (routeDef.loop || routeDef.stopPlan))) ? 'none' : '';
  $('results').classList.remove('hidden');
  $('hud').classList.remove('on');
  AUDIO.announce(`本次值乘结束，综合评分${score}分，${grade}级。感谢您的驾驶。`);
}

/* ---------------------------------------------------------------- 结算曲线 */
function drawSpeedChart() {
  const cv = $('resChart');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const log = G.speedLog || [];
  const x0 = 44, x1 = W - 14, y0 = 14, y1 = H - 22;
  // 网格
  ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1;
  for (let k = 0; k <= 4; k++) {
    const y = y0 + (y1 - y0) * k / 4;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  }
  ctx.fillStyle = '#6b8290'; ctx.font = '500 13px ui-monospace,monospace';
  const vTop = (typeof path !== 'undefined' && path && path.vmax) ? path.vmax : 80;
  ctx.fillText(String(Math.round(vTop)), 8, y0 + 5);
  ctx.fillText('0', 20, y1 + 4);
  ctx.fillText('速度 km/h', 8, H - 4);
  if (log.length < 2) return;
  const sMin = log[0][0], sMax = log[log.length - 1][0];
  const span = Math.max(1, sMax - sMin);
  ctx.beginPath();
  log.forEach(([s, v], i) => {
    const x = x0 + (s - sMin) / span * (x1 - x0);
    const y = y1 - clamp(v / vTop, 0, 1) * (y1 - y0);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  const grd = ctx.createLinearGradient(0, y0, 0, y1);
  grd.addColorStop(0, 'rgba(140,198,63,.85)');
  grd.addColorStop(1, 'rgba(140,198,63,.12)');
  ctx.strokeStyle = grd; ctx.lineWidth = 2.4; ctx.stroke();
  ctx.lineTo(x1, y1); ctx.lineTo(x0, y1); ctx.closePath();
  ctx.fillStyle = 'rgba(140,198,63,.10)'; ctx.fill();
  ctx.fillStyle = '#7f939f'; ctx.font = '500 12px "Microsoft YaHei",sans-serif';
  ctx.fillText('全程速度曲线', x0 + 4, y0 + 14);
}

/* ---------------------------------------------------------------- 相机 */
const qFlip = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, PI, 0));

function updateCamera(dt, snap = false) {
  if (!train) return;
  if (G.walk && G.walk.active) {
    camera.position.copy(G.walk.pos);
    camera.quaternion.setFromEuler(new THREE.Euler(G.walk.pitch, G.walk.yaw, 0, 'YXZ'));
    camera.fov = 60;
    camera.updateProjectionMatrix();
    return;
  }
  if (G.freeCam) {
    camera.position.copy(G.freeCam.pos);
    camera.lookAt(G.freeCam.look);
    camera.fov = G.freeCam.fov || 55;
    camera.updateProjectionMatrix();
    if (train.noseGlass) train.noseGlass.visible = true;
    return;
  }
  const car = train.cars[0];
  if (G.camMode === 0) {
    const eye = car.group.localToWorld(train.eyePos.clone());
    if (G.shakeOn) {
      // 极轻微的走行震动（毫米级）
      const amp = G.shakeAmp * clamp(G.v / 14, 0, 1);
      const t = performance.now() * 0.001;
      eye.y += Math.sin(t * 41) * amp + Math.sin(t * 17.3) * amp * 0.6;
      eye.x += Math.sin(t * 33.7 + 1.1) * amp * 0.5;
    }
    camera.position.copy(eye);
    const look = new THREE.Quaternion().setFromEuler(new THREE.Euler(G.pitch, G.yaw, 0, 'YXZ'));
    camera.quaternion.copy(car.group.quaternion).multiply(qFlip).multiply(look);
    const speedRatio = clamp(G.v / Math.max(1, path.vmax * KMH), 0, 1);
    camera.fov = 58 + speedRatio * 7;
    if (train.noseGlass) train.noseGlass.visible = false;
  } else {
    const k = snap ? 1 : 1 - Math.exp(-7 * Math.max(0.001, dt));
    if (train.noseGlass) train.noseGlass.visible = true;
    const nose = path.frameAt(G.s);
    const underground = nose.pos.y < -2;
    if (G.camMode === 1) {
      let p;
      if (underground) {
        p = nose.pos.clone().addScaledVector(nose.tan, 13).add(new THREE.Vector3(0, 2.0, 0));
      } else {
        p = nose.pos.clone().addScaledVector(nose.tan, 13).addScaledVector(nose.right, 11).add(new THREE.Vector3(0, 5.2, 0));
      }
      camera.position.lerp(p, k);
      camera.lookAt(nose.pos.clone().add(new THREE.Vector3(0, 2.0, 0)));
      camera.fov = underground ? 66 : 50;
    } else if (G.camMode === 2) {
      const o = G.orbit;
      let p;
      if (underground) {
        p = nose.pos.clone().addScaledVector(nose.tan, 9).addScaledVector(nose.right, 3.6).add(new THREE.Vector3(0, 3.4, 0));
        camera.position.lerp(p, k);
        camera.lookAt(nose.pos.clone().add(new THREE.Vector3(0, 1.9, 0)));
        camera.fov = 68;
      } else {
        p = nose.pos.clone()
          .addScaledVector(nose.tan, Math.cos(o.az) * o.dist)
          .addScaledVector(nose.right, Math.sin(o.az) * o.dist)
          .add(new THREE.Vector3(0, o.el * o.dist, 0));
        camera.position.lerp(p, k);
        camera.lookAt(nose.pos.clone().add(new THREE.Vector3(0, 2.2, 0)));
        camera.fov = 45;
      }
    } else {
      const so = stationObjs[Math.min(G.targetIdx, stationObjs.length - 1)];
      const st = path.stations[Math.min(G.targetIdx, path.stations.length - 1)];
      const base = st.frame.pos.clone()
        .addScaledVector(st.frame.right, -2.0)
        .addScaledVector(st.frame.up, 2.72)
        .addScaledVector(st.frame.tan, -36);
      camera.position.lerp(base, k);
      camera.lookAt(nose.pos.clone().add(new THREE.Vector3(0, 2.0, 0)));
      camera.fov = 50;
    }
    camera.updateProjectionMatrix();
  }
  if (G.camMode === 0 && !snap) camera.updateProjectionMatrix();
}

/* ---------------------------------------------------------------- HUD */
function toast(text, kind = 'info', ms = 3400) {
  const area = $('toastArea');
  const d = document.createElement('div');
  d.className = 'toast ' + (kind === 'info' ? '' : kind);
  d.textContent = text;
  area.appendChild(d);
  while (area.children.length > 3) area.removeChild(area.firstChild);
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, ms);
}
function showBanner(zh, en) {
  const b = $('stationBanner');
  b.querySelector('.zh').textContent = zh;
  b.querySelector('.en').textContent = en;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}

let ttRows = [];
function buildTimetable() {
  const box = $('hudTT');
  box.innerHTML = '';
  ttRows = [];
  path.stations.forEach((st, i) => {
    if (G.stopPlan && !G.stopPlan.has(i)) return;
    const row = document.createElement('div');
    row.className = 'tt-row' + (i === G.targetIdx ? ' now' : '');
    row.innerHTML = `<span class="st"></span><span>${st.zh}</span><span class="t1">${fmtClockShort(st.schArr)}</span><span class="t2">${fmtClockShort(st.schDep)}</span>`;
    box.appendChild(row);
    ttRows.push({ row, idx: i });
  });
  $('hudLine').textContent = line.name;
  $('hudSeg').textContent = routeDef.seg;
  $('hudService').textContent = routeDef.seg;
  document.documentElement.style.setProperty('--line', line.color);
  document.documentElement.style.setProperty('--line-glow', line.color + '59');
}
function updateTimetable() {
  ttRows.forEach((item, k) => {
    item.row.classList.toggle('now', item.idx === G.targetIdx);
    item.row.classList.toggle('done', item.idx < G.targetIdx);
  });
}

/* ---------------- 执照考试 ---------------- */
function examInit() {
  G.examTasks = [
    { id: 'depart', label: '首站正点发车（±20 秒）', ok: null },
    { id: 'stop', label: '连续 3 站停车误差 ≤ 0.3 m', ok: null, prog: 0 },
    { id: 'eb', label: '全程未施加紧急制动', ok: true },
    { id: 'atp', label: '全程未触发 ATP 制动', ok: true },
    { id: 'door', label: '站站开门办理乘降', ok: true }
  ];
  G.examDone = 0;
  examRender();
}

function examEvent(id, val) {
  if (!G.exam || !G.examTasks.length) return;
  const t = G.examTasks.find(x => x.id === id);
  if (!t) return;
  if (id === 'stop') {
    if (val <= 0.3) {
      t.prog = (t.prog || 0) + 1;
      if (t.prog >= 3) t.ok = true;
    } else {
      t.prog = 0;
    }
  } else if (id === 'depart') {
    t.ok = Math.abs(val) <= 20;
  } else {
    t.ok = !!val;
  }
  examRender();
}

function examRender() {
  const box = $('examPanel');
  if (!box) return;
  const on = G.exam && G.mode === 'driving';
  box.classList.toggle('on', !!on);
  if (!on) return;
  const done = G.examTasks.filter(t => t.ok === true).length;
  box.innerHTML = `<h6>执照考试 · ${done}/${G.examTasks.length}</h6>` +
    G.examTasks.map(t => {
      const cls = t.ok === true ? 'ok' : t.ok === false ? 'bad' : '';
      const mark = t.ok === true ? '✓' : t.ok === false ? '✕' : '·';
      const extra = t.id === 'stop' && t.ok !== true ? `（${t.prog || 0}/3）` : '';
      return `<div class="exam-item ${cls}"><i>${mark}</i><span>${t.label}${extra}</span></div>`;
    }).join('');
}

function examPassed() {
  return G.examTasks.length > 0 && G.examTasks.every(t => t.ok === true);
}

/* 站台 PIS：显示下一列车到站时间 */
function updatePisDisplays() {
  const term = path.stations[path.stations.length - 1];
  const show = (idx, so) => {
    if (!so || !so.pis) return;
    const st = path.stations[idx];
    if (!st) return;
    const d = st.stopS - G.s;
    let eta = '—', label = '暂无列车', soon = false;
    if (G.targetIdx === idx) {
      if (d < 0) { eta = '已到站'; label = ''; }
      else if (d < 30) { eta = '即将'; label = '进站'; soon = true; }
      else {
        const tt = estimateRunTime(Math.max(30, d), 60);
        eta = Math.ceil(tt / 60) + "'";
        label = `${Math.round(d)} m`;
        soon = tt < 100;
      }
    } else if (G.targetIdx > idx) {
      eta = '已过'; label = '';
    } else {
      const gap = path.stations[G.targetIdx].stopS - G.s;
      const tt = estimateRunTime(gap + (st.stopS - path.stations[G.targetIdx].stopS), 60) + 60;
      eta = Math.ceil(tt / 60) + "'";
      label = '预计';
    }
    drawPis(so.pis, {
      color: line.color, line: line.name,
      dir: `开往 ${term.zh}`,
      eta, etaLabel: label, soon,
      tip: st.tr && st.tr.length ? `可换乘 ${st.tr.join('、')}` : '请站在安全线内候车'
    });
  };
  if (G.targetIdx > 0) show(G.targetIdx - 1, stationObjFor(G.targetIdx - 1));
  show(G.targetIdx, stationObjFor(G.targetIdx));
  const nx = nextServedIdx(G.targetIdx);
  if (nx < stationObjs.length) show(nx, stationObjFor(nx));
}

/* AI 停站时联动对应侧屏蔽门 */
function updateAiPsd() {
  for (const ai of aiTrains) {
    if (ai.dead) continue;
    if (ai.state === 'dwell') {
      let so = null, bd = 1e9;
      for (const s of stationObjs) {
        if (!s) continue;
        const d = Math.abs(ai.s - ((s.s || 0) + (s.stopZ || 70)));
        if (d < bd) { bd = d; so = s; }
      }
      if (so && bd < 40) {
        const psd = ai.lateral > 0 ? so.psdR : so.psdL;
        if (psd) { psd.setOpen(ai.doorT); ai._psd = { psd, so }; }
      }
    } else if (ai._psd) {
      const pso = stationObjFor(G.targetIdx);
      const playerAt = pso === ai._psd.so && (G.stopState === 'stop' || G.stopState === 'dwell');
      if (!playerAt) ai._psd.psd.setOpen(0);
      ai._psd = null;
    }
  }
}

function updateHUD(force = false) {
  if (!path || !train) return;
  const st = path.stations[G.targetIdx];
  const dist = Math.max(0, st.stopS - G.s);
  $('hudNextZh').textContent = st.zh;
  $('hudNextEn').textContent = st.en;
  $('hudDist').textContent = Math.round(dist);
  $('hudTime').textContent = fmtClock(G.clock);
  $('hudSpeed').textContent = Math.round(G.v * 3.6);
  const lim = Math.round(G.limit || 80);
  $('hudLimit').textContent = lim;
  $('hudLimit').className = G.eb ? 'eb' : (lim < 70 ? 'warn' : '');
  const lv = G.lever;
  $('hudTraction').style.width = (lv > 0 ? lv * 50 : 0) + '%';
  $('hudBrake').style.width = (lv < 0 ? -lv * 50 : 0) + '%';
  $('hudLeverTxt').textContent = G.eb ? '紧急制动' : lv > 0.005 ? `牵引 ${Math.round(lv * 100)}%` : lv < -0.005 ? `制动 ${Math.round(-lv * 100)}%` : '0%';
  const ldEl = $('hudLeader');
  if (ldEl) {
    if (G.leaderGap != null && G.leaderGap < 1200) {
      ldEl.textContent = `${G.leaderNo}  ${Math.round(Math.max(0, G.leaderGap))} m`;
      ldEl.style.color = G.leaderGap < 220 ? '#ff9f43' : '';
    } else {
      ldEl.textContent = '—';
      ldEl.style.color = '';
    }
  }
  $('hudDoorL').classList.toggle('open', G.doorT > 0.1);
  $('hudDoorR').classList.toggle('open', false);
  const ebB = $('ebBanner'); if (ebB) ebB.classList.toggle('on', G.eb);
  const ab = $('atoBtn'); if (ab) ab.classList.toggle('on', G.ato);
  const progress = clamp(1 - dist / Math.max(1, st.stopS - (G.targetIdx > 0 ? path.stations[G.targetIdx - 1].stopS : 0)), 0, 1);
  $('hudStopFill').style.width = (G.stopState === 'dwell' || G.stopState === 'stop' ? 100 : progress * 100) + '%';
  let status = '区间运行';
  if (G.sigMode === 'fixed') status = '固定闭塞 · 按地面信号行车';
  if (G.fault) {
    status = G.fault.type === 'door' ? '车门故障 · 按 L 隔离'
      : G.fault.type === 'traction' ? '牵引故障 · 限速 40'
        : G.fault.type === 'signal' ? 'ATP 故障 · 固定闭塞'
          : G.fault.type === 'pantograph' ? '受电弓故障 · 牵引封锁'
            : '制动故障 · 制动力下降';
  }
  else if (G.eb) status = '紧急制动';
  else if (G.ato) status = G.atoState === 'dwell' ? 'ATO 停站' : 'ATO 自动运行';
  else if (G.stopState === 'dwell') status = '停站作业';
  else if (G.stopState === 'stop') status = '停稳';
  else if (G.atpWarn) status = '超速警告';
  else if (isLastServed(G.targetIdx) && G.stopState === 'dwell') status = '终到';
  if (G.walk && G.walk.active) status = '站内步行 · F 返回';
  $('hudStatus').textContent = status;
  $('hudStatus').className = (G.eb || G.atpWarn) ? 'late' : '';
  // 停车误差
  if (G.stopState === 'stop' || G.stopState === 'dwell') {
    const e = G.s - st.stopS;
    $('hudStopDelta').textContent = (e >= 0 ? '+' : '') + e.toFixed(2) + ' m';
    $('hudStopDelta').style.color = Math.abs(e) < 0.35 ? '#3ddc97' : Math.abs(e) < 1.5 ? '#ffb020' : '#ff6b5a';
  } else {
    $('hudStopDelta').textContent = dist > 0 ? `${Math.round(dist)} m` : '—';
    $('hudStopDelta').style.color = '';
  }
  // 停站倒计时
  if (G.stopState === 'dwell') {
    const dwell = G.clock - st.schArr;
    $('hudDwell').textContent = `停站 ${Math.max(0, Math.round(dwell))}s`;
  } else if (G.doorsOpen) {
    $('hudDwell').textContent = '开门';
  } else if (G.stopState === 'run' && G.v > 0.5 && !G.ato) {
    const d = st.stopS - G.s;
    const need = d > 1 ? (G.v * G.v) / (2 * d) / BRK_SRV : 0;
    if (need > 0.12) {
      $('hudDwell').textContent = `建议制动 ${Math.min(100, Math.round(need * 100))}%`;
      $('hudDwell').style.color = need > 0.85 ? '#ff6b5a' : need > 0.5 ? '#ffb020' : '#8b9daa';
    } else {
      $('hudDwell').textContent = '区间运行';
      $('hudDwell').style.color = '';
    }
  } else {
    $('hudDwell').textContent = G.v > 0.1 ? '运行中' : '待发车';
    $('hudDwell').style.color = '';
  }
}

/* ---------------------------------------------------------------- 主循环 */
function updateGame(dt) {
  if (!G.ready || G.mode !== 'driving') return;
  if (G.paused) return;
  let remain = Math.min(dt, 0.1);
  while (remain > 0.0001) {
    const h = Math.min(1 / 120, remain);
    physics(h);
    remain -= h;
  }
  G.clock += dt;
  if (G.finishTimer > 0) {
    G.finishTimer -= dt;
    if (G.finishTimer <= 0) finishService();
  }
  // 手柄速率控制 / 站内步行
  if (G.walk && G.walk.active) {
    G.lever = 0;
    const fwd = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0);
    const str = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0);
    if (fwd || str) {
      const spd = (keys['ShiftLeft'] || keys['ShiftRight'] ? 4.2 : 2.4) * dt;
      const sy = Math.sin(G.walk.yaw), cy = Math.cos(G.walk.yaw);
      const dx = -sy * fwd + cy * str;
      const dz = -cy * fwd - sy * str;
      const len = Math.hypot(dx, dz) || 1;
      G.walk.pos.x += dx / len * spd;
      G.walk.pos.z += dz / len * spd;
    }
    clampWalk();
  } else {
    const up = keys['KeyW'] || keys['ArrowUp'];
    const dn = keys['KeyS'] || keys['ArrowDown'];
    if (G.ato && (up || dn)) { G.ato = false; G.atoState = 'run'; toast('司机接管 · ATO 已退出', 'info', 3000); updateHUD(true); }
    if (up && !dn) G.lever = clamp(G.lever + dt * 1.15, -1, 1);
    if (dn && !up) G.lever = clamp(G.lever - dt * 1.15, -1, 1);
    if (!up && !dn && Math.abs(G.lever) < 0.02) G.lever = 0;
  }

  train.setLever(G.lever);
  train.update(G.s, G.v, dt);
  G.aiT = (G.aiT || 0) + dt;
  for (const ai of aiTrains) ai.update(dt);
  updateAiPsd();
  updateCamera(dt);
  updateHUD();
  if (train && train.cabDisplay) {
    const st = path.stations[G.targetIdx];
    const sig = nextSignalAhead();
    train.cabDisplay.update(dt, {
      signal: sig ? sig.state : 2,
      signalDist: sig ? Math.max(0, sig.gap) : 0,
      speedKmh: G.v * 3.6,
      limit: G.limit || 80,
      distToStop: Math.max(0, st.stopS - G.s),
      doorOpen: G.doorT > 0.1,
      eb: G.eb,
      traction: G.eb ? 0 : Math.max(0, G.lever),
      atpWarn: !!G.atpWarn,
      overSpeed: !!G.atpWarn,
      ato: G.ato,
      sigMode: G.sigMode,
      lineColor: line.color,
      lineBadge: line.badge,
      lineName: line.name,
      nextZh: st.zh, nextEn: st.en,
      schArr: st.schArr, schDep: st.schDep,
      clock: G.clock,
      delay: (() => {
        const dd = Math.max(0, st.stopS - G.s);
        const eta = G.clock + (G.v > 1 ? estimateRunTime(dd, Math.max(25, G.v * 3.6)) : 0);
        return eta - st.schArr;
      })(),
      progress: clamp((G.s - path.stations[0].stopS) / Math.max(1, path.stations[path.stations.length - 1].stopS - path.stations[0].stopS), 0, 1),
      fromZh: path.stations[0].zh, toZh: path.stations[path.stations.length - 1].zh
    });
  }
  if (AUDIO.ready) {
    AUDIO.update(dt, {
      speed: G.v,
      traction: G.eb ? 0 : Math.max(0, G.lever),
      brake: G.eb ? 1 : Math.max(0, -G.lever),
      inTunnel: path.frameAt(G.s).pos.y < -2,
      nearStation: path.stations.some(s => Math.abs(s.s - G.s) < 130)
    });
    if (G.atpWarn && !G.atpBeepT) { AUDIO.beep(); G.atpBeepT = setTimeout(() => { G.atpBeepT = null; }, 1800); }
  }
  // 阳光跟随 + 地下/地上光照过渡
  if (sun) {
    const f = path.frameAt(G.s);
    sun.target.position.copy(f.pos);
    sun.position.copy(f.pos).addScaledVector(theme.sunDir.clone().normalize(), 220);
    sun.target.updateMatrixWorld();
    const indoor = f.pos.y < -2.4;
    const k = Math.min(1, dt * 1.6);
    sun.intensity = lerp(sun.intensity, indoor ? 0.03 : theme.sunI, k);
    hemi.intensity = lerp(hemi.intensity, indoor ? theme.hemi * 0.55 : theme.hemi, k);
    // 站台补光
    let ns = null, nd = 1e9;
    for (const st of path.stations) {
      const d = Math.abs(st.s - G.s);
      if (d < nd) { nd = d; ns = st; }
    }
    const near = ns ? clamp(1 - (nd - 30) / 70, 0, 1) : 0;
    stationLights.forEach((L, i) => {
      if (!ns) { L.intensity = 0; return; }
      const off = SL_OFF[i];
      L.position.copy(ns.frame.pos)
        .addScaledVector(ns.frame.right, off[0])
        .addScaledVector(ns.frame.tan, off[2])
        .addScaledVector(ns.frame.up, off[1]);
      L.intensity = 620 * near;
    });
  }
  if (skyMesh) skyMesh.position.copy(camera.position);
  // 乘客乘降
  G._crowdT = (G._crowdT || 0) + dt;
  if (G._crowdT > 1 / 30) {
    const h = Math.min(0.12, G._crowdT);
    G._crowdT = 0;
    let best = null, bd = 210;
    for (const so of stationObjs) {
      if (!so) continue;
      const dd = Math.abs((so.s || 0) - G.s);
      if (dd < bd) { bd = dd; best = so; }
    }
    const tgtSt = path.stations[G.targetIdx];
    if (tgtSt && tgtSt.synthetic) best = stationObjFor(G.targetIdx) || best;
    if (best && best.crowd) best.crowd.update(h, G.doorT);
  }
  // 速度曲线采样（每 1.5 秒）
  G._logT = (G._logT || 0) + dt;
  if (G._logT > 1.5) {
    G._logT = 0;
    (G.speedLog || (G.speedLog = [])).push([G.s, G.v * 3.6]);
    if (G.speedLog.length > 900) G.speedLog.shift();
  }
  // 每秒刷新时刻表
  G._ttT = (G._ttT || 0) + dt;
  if (G._ttT > 0.5) { G._ttT = 0; updateTimetable(); }
  updateSignals(dt);
  IX.update(dt);
  updateWeather(dt);
  if (typeof ATS !== 'undefined') ATS.update(dt);
  // PIS 屏：每秒刷新当前与下一站
  G._pisT = (G._pisT || 0) + dt;
  if (G._pisT > 1.0) { G._pisT = 0; updatePisDisplays(); }
}

let lastFrame = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.06, clock.getDelta());
  if (G.mode === 'menu') {
    if (hero) {
      updateHero(dt);
      if (composer && G.quality !== 'low') composer.render(); else renderer.render(hero.scene, camera);
    }
    return;
  }
  if (G.mode === 'loading') {
    if (hero) renderer.render(hero.scene, camera);
    return;
  }
  if (G.mode === 'turnback') {
    updateTurnback(dt);
    if (composer && G.quality !== 'low') composer.render(); else renderer.render(scene, camera);
    return;
  }
  if (G.mode === 'driving' || G.mode === 'paused' || G.mode === 'results') {
    updateGame(dt);
    if (composer && G.quality !== 'low') composer.render(); else renderer.render(scene, camera);
  }
}

/* ---------------------------------------------------------------- 输入 */
const keys = {};
function bindInput() {
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    keys[e.code] = true;
    if (G.mode === 'driving') {
      if (G.walk && G.walk.active) {
        if (e.code === 'KeyF') toggleWalk();
        if (e.code === 'Escape') togglePause(true);
        return;
      }
      if (e.code === 'KeyF') toggleWalk();
      if (e.code === 'KeyO') { if (G.ato) toggleATO(false); openDoors(); }
      if (e.code === 'KeyP') { if (G.ato) toggleATO(false); closeDoors(); }
      if (e.code === 'KeyA') toggleATO();
      if (e.code === 'KeyH') AUDIO.horn();
      if (e.code === 'KeyL') clearFault();
      if (e.code === 'KeyK') toggleSignalMode();
      if (e.code === 'Space') {
        e.preventDefault();
        if (G.eb) releaseEB(); else triggerEB('司机手动施加');
      }
      if (e.code === 'KeyR') {
        if (G.eb) releaseEB();
        else { G.yaw = 0; G.pitch = -0.02; }
      }
      if (e.code === 'KeyC') { G.camMode = (G.camMode + 1) % 4; toast(['司机室视角', '追车视角', '自由环绕', '站台视角'][G.camMode], 'info', 1600); updateCamera(0, true); }
      if (e.code === 'Tab') {
        e.preventDefault();
        ATS.toggle();
      }
      if (e.code === 'F1') {
        e.preventDefault();
        $('hud').classList.toggle('on');
      }
      if (e.code === 'Escape') togglePause(true);
    } else if (G.mode === 'paused') {
      if (e.code === 'Escape') togglePause(false);
    }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  const transferList = $('transferList');
  if (transferList) transferList.addEventListener('click', e => {
    const b = e.target.closest('button[data-line]');
    if (b) performTransfer(b.dataset.line);
  });
  const transferBack = $('transferBack');
  if (transferBack) transferBack.addEventListener('click', () => {
    if (G.walk) G.walk.tpHidden = true;
    hideTransferPanel();
  });

  const canvas = $('scene');
  canvas.addEventListener('pointerdown', e => {
    G.dragging = true; G.lastX = e.clientX; G.lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!G.dragging || G.mode !== 'driving') return;
    const dx = e.clientX - G.lastX, dy = e.clientY - G.lastY;
    G.lastX = e.clientX; G.lastY = e.clientY;
    if (G.walk && G.walk.active) {
      G.walk.yaw -= dx * 0.0032;
      G.walk.pitch = clamp(G.walk.pitch - dy * 0.0028, -1.1, 1.1);
      return;
    }
    if (G.camMode === 0) {
      G.yaw = clamp(G.yaw - dx * 0.0032, -1.25, 1.25);
      G.pitch = clamp(G.pitch - dy * 0.0028, -0.55, 0.35);
    } else if (G.camMode === 2) {
      G.orbit.az -= dx * 0.006;
      G.orbit.el = clamp(G.orbit.el + dy * 0.004, 0.02, 1.1);
    }
  });
  canvas.addEventListener('pointerup', e => { G.dragging = false; });
  canvas.addEventListener('wheel', e => {
    if (G.mode !== 'driving') return;
    if (G.camMode === 2) G.orbit.dist = clamp(G.orbit.dist + e.deltaY * 0.03, 12, 140);
  }, { passive: true });
  canvas.addEventListener('contextmenu', e => { e.preventDefault(); G.yaw = 0; G.pitch = -0.02; });

  window.addEventListener('blur', () => { if (G.mode === 'driving') togglePause(true); });
}

function togglePause(on) {
  if (G.mode === 'driving' && on) {
    G.mode = 'paused';
    $('pause').classList.remove('hidden');
    $('pauseSub').textContent = `${line.name} · ${routeDef.seg} · ${path.stations[G.targetIdx].zh}`;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  } else if (G.mode === 'paused' && !on) {
    G.mode = 'driving';
    $('pause').classList.add('hidden');
    clock.getDelta();
  }
}
