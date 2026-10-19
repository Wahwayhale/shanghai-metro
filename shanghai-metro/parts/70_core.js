/* ================================================================
   核心状态 / 渲染基础设施 / 主循环
   （由 70_game.js 拆分而来，逻辑未改动）
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
      coupler: G.coupler || null,
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
const keys = {};
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
