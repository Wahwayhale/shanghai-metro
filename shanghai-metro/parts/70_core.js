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
  /* 后期管线的构造会触发大量着色器编译（实测形成一个 4 s 长任务），
     但它是「进入驾驶后第一帧」才需要的东西。
     因此先填一张最简管线（只有 RenderPass），让玩家立刻能动；
     Bloom 延迟到首个真实帧之后异步补装（见 updateGame 里的 _bloomPending）。
     代价：开局头一两帧没有泛光，肉眼几乎看不出。 */
  const pr = Math.min(window.devicePixelRatio || 1, 1.6);
  const rt = new THREE.WebGLRenderTarget(Math.floor(window.innerWidth * pr), Math.floor(window.innerHeight * pr), {
    type: THREE.HalfFloatType, samples: 4
  });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(targetScene, camera));
  G._bloomPending = targetScene;      // 交给主循环延后补装
}

/* 真正把 Bloom + 暗角 + 输出 装上去。由 updateGame 在首帧后调用一次。 */
function installBloomChain() {
  const targetScene = G._bloomPending;
  G._bloomPending = null;
  if (!targetScene || G.quality === 'low') return;
  if (!composer) { makeComposer(targetScene); return; }
  /* 移除除 RenderPass 之外的旧 pass（重复调用时保持幂等） */
  if (composer.passes.length > 1) composer.passes.length = 1;
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
  /* 延后补装后期管线：首帧先让玩家能动，之后再把 Bloom 装上。
     放在这里而不是 buildService 末尾，是因为那时玩家还在看加载条，
     现在至少画面已经在动了。
     按「时间」而不是「帧数」判定：软件渲染下帧率可能只有 1–2 fps，
     按帧数会让 Bloom 迟迟不出现；500 ms 后必然装上。 */
  if (G._bloomPending) {
    if (!G._bloomAt) G._bloomAt = performance.now();
    if (performance.now() - G._bloomAt > 500) installBloomChain();
  }
  G._frames = (G._frames || 0) + 1;
  /* 手柄轮询（P3-2）：无手柄时立即返回，开销可忽略 */
  if (typeof window !== 'undefined' && window.__pollGamepad) window.__pollGamepad(dt);
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

  /* ---- 车站距离剔除（P1-2）----
     实测 4 号线 1638 draw calls、3521 个普通 mesh，其中绝大部分是沿线车站。
     按里程把远处车站整组隐藏，能砍掉一半以上 draw call，且玩家完全看不出
     （隧道里与雾里的远处站台本来就看不见）。

     阈值 260/420 m：上海地铁平均站距约 1.2 km，取 600 m 只能剔掉很少的站；
     260 m 约等于两个站台的可见范围，既能省 draw call，又不会看到「站台凭空出现」。

     不按时间节流：每帧遍历 30 个站只是 30 次减法，比维护计时器更简单可靠
     （之前按 0.25 s 节流，在低帧率环境下会长期不触发）。 */
  {
    const NEAR = 260, FAR = 420;
    let hidden = 0;
    for (let i = 0; i < stationObjs.length; i++) {
      const so = stationObjs[i];
      if (!so || !so.group) continue;
      const d = Math.abs((so.s || 0) - G.s);
      /* 本务所在站与下一站永远显示（停站、开门、PIS 需要） */
      const mustShow = i === G.targetIdx || i === G.targetIdx + 1;
      const vis = mustShow || d < NEAR ? true : d > FAR ? false : so.group.visible;
      if (so.group.visible !== vis) so.group.visible = vis;
      if (!so.group.visible) hidden++;
    }
    G.culledCount = hidden;
  }

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
