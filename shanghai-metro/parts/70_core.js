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
let tunnelLights = [];   // 隧道照明跟随灯（建模提升）
const SL_OFF = [[-8.2, 4.6, -40], [8.2, 4.6, -40], [-8.2, 4.6, 40], [8.2, 4.6, 40]];
let hero = null;
let clock = new THREE.Clock();
let matInited = false;
/* ---------------------------------------------------------------- 初始化 */
/* ---------------- 渲染分辨率与像素预算 ----------------
   性能目标硬件：780M 核显 + 2K 屏（2560×1440），要求 60 fps。
   核显的瓶颈是填充率与内存带宽，不是顶点。所以像素数必须显式控制。

   关键换算（2K 屏）：
     pixelRatio 1.80 → 4608×2592 = 11.9 MP（当前默认，是 1080p 的 5.8 倍）
     pixelRatio 1.00 → 2560×1440 =  3.7 MP
     pixelRatio 0.75 → 1920×1080 =  2.1 MP  ← 「1080p 画质」的等价点

   因此把画质档位改为「目标像素预算」，而不是 pixelRatio 倍数：
   低 = 1.4 MP（约 720p）、中 = 2.1 MP（1080p）、高 = 3.7 MP（原生 2K）。
   这样同一档在不同屏幕上表现一致，换屏不用重调。 */
const PIXEL_BUDGET = {
  low: 1.4e6,
  medium: 2.1e6,
  high: 3.7e6
};

/** 按目标像素预算算 pixelRatio。
 *  three.js 里 setPixelRatio(pr) 的效果是「绘制缓冲 = CSS 尺寸 × pr」，
 *  所以要达到目标像素数，pr = sqrt(预算 / CSS 像素数)。
 *  不做超采样（上限 1.0 之外没有收益），下限 0.5 防止过度模糊。 */
function pixelRatioForBudget(budget) {
  const cssPx = window.innerWidth * window.innerHeight;
  if (cssPx <= 0) return 1;
  const raw = Math.sqrt(budget / cssPx);
  return clamp(raw, 0.5, 1.0);
}

function applyRenderScale() {
  if (!renderer) return;
  const budget = PIXEL_BUDGET[G.quality] || PIXEL_BUDGET.medium;
  const pr = pixelRatioForBudget(budget);
  renderer.setPixelRatio(pr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  G.renderPR = pr;
  const w = Math.floor(window.innerWidth * pr);
  const h = Math.floor(window.innerHeight * pr);
  G.renderPx = w * h;
  if (composer && composer.setSize) {
    composer.setSize(window.innerWidth, window.innerHeight);
    if (bloomPass && bloomPass.resolution) bloomPass.resolution.set(w, h);
  }
}

function initRenderer() {
  const canvas = $('scene');
  /* antialias 关掉：780M 上 4x MSAA 的填充率代价过高，
     而本项目大量是硬边几何与自发光，锯齿可接受。
     抗锯齿改由渲染分辨率 + 后处理的轻微模糊承担。 */
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.06, 5200);
  camera.position.set(0, 3, 10);
  /* 初始按「中」档（1080p 画质）定像素预算，之后 applySettings 会按用户档位覆盖 */
  G.quality = 'medium';
  applyRenderScale();
  window.addEventListener('resize', onResize);
}

function onResize() {
  if (!renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  applyRenderScale();
}

function makeComposer(targetScene) {
  if (composer) { composer.dispose(); composer = null; }
  if (G.quality === 'low') return;
  /* 后期管线的构造会触发大量着色器编译（实测形成一个 4 s 长任务），
     但它是「进入驾驶后第一帧」才需要的东西。
     因此先填一张最简管线（只有 RenderPass），让玩家立刻能动；
     Bloom 延迟到首个真实帧之后异步补装（见 updateGame 里的 _bloomPending）。
     代价：开局头一两帧没有泛光，肉眼几乎看不出。

     RT 必须是 HalfFloat：实测换成 UnsignedByte 会让自发光材质（站台灯带
     color 1.6/2.4/3.2）在 ToneMapping 之前就被裁到 1.0，画面整体过曝发白。
     HDR 缓冲是泛光与 ACES 的前提，不能为省带宽牺牲它。

     MSAA：P0 阶段为了压帧时间关掉了（samples: 0），代价是几何边缘锯齿
     明显（钢轨、接触网、建筑轮廓尤其严重）。现在实测 110 fps / 9 ms，
     距 60 fps 预算还有 7 ms 余量，按档位重新开启：
       精细 = 4x、标准 = 2x、流畅 = 0（且不建 composer，直接出屏）
     注意这是**渲染目标**的 MSAA，与 canvas 的 antialias 无关 ——
     走后处理时画面先进 RT，所以真正决定抗锯齿的是这里的 samples。 */
  const MSAA = { high: 4, medium: 2, low: 0 };
  const samples = MSAA[G.quality] != null ? MSAA[G.quality] : 2;
  const pr = G.renderPR || 1;
  const w = Math.max(1, Math.floor(window.innerWidth * pr));
  const h = Math.max(1, Math.floor(window.innerHeight * pr));
  const rt = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, samples
  });
  G.msaa = samples;
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
  /* Bloom 只在「中/高」档启用。
     中档把 bloom 分辨率再降一半：UnrealBloomPass 内部 5 级 mip 都是
     从这张基准分辨率继续减半，所以基准减半等于整条链路的像素成本降到 1/4，
     而泛光本身是低频效果，减半肉眼几乎看不出。
     低档直接跳过整个 composer。 */
  if (G.quality === 'medium' || G.quality === 'high') {
    const pr = G.renderPR || 1;
    const w = Math.max(1, Math.floor(window.innerWidth * pr));
    const h = Math.max(1, Math.floor(window.innerHeight * pr));
    const bScale = G.quality === 'medium' ? 0.5 : 1.0;
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.floor(w * bScale), Math.floor(h * bScale)),
      theme.bloom * 0.34, 0.55, 1.08
    );
    composer.addPass(bloomPass);
  } else {
    bloomPass = null;
  }
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

/* 切换画质档位后重建后期链路。
   低档要彻底拆掉 composer（走 renderer.render 直出），
   中/高档重新建 RT 并把 bloom 挂上。 */
function rebuildPostChain() {
  const targetScene = (G.mode === 'menu' && hero) ? hero.scene : scene;
  if (!targetScene) return;
  if (G.quality === 'low') {
    if (composer) { composer.dispose(); composer = null; }
    bloomPass = null;
    G._bloomPending = null;
    return;
  }
  makeComposer(targetScene);
  installBloomChain();
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
  /* 城市 LOD：只遍历约 25 个块，不做矩阵运算，开销可忽略 */
  if (typeof updateCityLOD === 'function') updateCityLOD(camera.position);

  /* ---- 隧道照明跟随（建模提升）----
     3 盏灯放在玩家前/中/后各一盏（间隔 22 m，与 buildTunnels 的灯具间距一致），
     沿隧道拱顶布置。出隧道后立刻熄灭，不占无谓预算。
     位置按里程取 frameAt，所以弯道里灯也会沿着洞顶走。 */
  if (tunnelLights.length) {
    const inTunnel = path.frameAt(G.s).pos.y < -2;
    for (let i = 0; i < tunnelLights.length; i++) {
      const L = tunnelLights[i];
      if (!inTunnel) { L.intensity = 0; continue; }
      const off = (i - 1) * 22;                 // 前 / 当前位置 / 后
      const ss = clamp(G.s + off, 0, path.length - 1);
      const f = path.frameAt(ss);
      L.position.copy(f.pos).addScaledVector(f.up, TUNNEL_R - 0.7);
      /* three.js r155+ 的 PointLight 用物理单位（坎德拉），衰减为 1/d²。
         站台补光用的是 620，这里按洞顶到洞壁约 6–8 m 换算，
         取 420 才能让洞壁出现明显亮斑。距离越远越暗，避免照亮洞口外的空气。 */
      L.intensity = 420 * clamp(1 - Math.abs(off) / 60, 0, 1);
    }
  }

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
/* ---------------- 帧率探针与自适应降档 ----------------
   目标硬件 780M + 2K 屏要求 60 fps（16.67 ms/帧）。
   没有真实帧率数据时，所有画质取舍都是盲猜，所以这个必须做。

   实现要点：
   - 用性能计数器环形缓冲统计最近 N 帧的平均帧时间，避免瞬时抖动误判
   - 只在 driving 模式下计入（菜单/加载的帧意义不同）
   - 自适应只降不升：自动升档容易在临界点来回抖，体验更差 */
const FPS_SAMPLE = 60;                 // 取 60 帧窗口
const FPS_TARGET_MS = 1000 / 60;       // 60 fps

function sampleFrame(dt) {
  if (G.mode !== 'driving') { G._fpsBuf = null; return; }
  if (!G._fpsBuf) { G._fpsBuf = []; G._fpsSum = 0; }
  const ms = dt * 1000;
  G._fpsBuf.push(ms);
  G._fpsSum += ms;
  if (G._fpsBuf.length > FPS_SAMPLE) G._fpsSum -= G._fpsBuf.shift();
  /* 12 帧就开始估算：低帧率设备（或软件渲染）等不到 60 帧，
     那样探针会永远显示 0，起不到诊断作用。 */
  const MIN_SAMPLE = 12;
  if (G._fpsBuf.length < MIN_SAMPLE) { updatePerfBadge(); return; }
  const avg = G._fpsSum / G._fpsBuf.length;
  G.frameMs = avg;
  G.fps = 1000 / avg;
  G.fpsProvisional = G._fpsBuf.length < FPS_SAMPLE;
  updatePerfBadge();
  /* 自适应：连续 2 个窗口超过 60fps 预算 1.3 倍才降档，避免误判 */
  if (G.autoQuality !== false && avg > FPS_TARGET_MS * 1.3) {
    G._slowStreak = (G._slowStreak || 0) + 1;
    if (G._slowStreak >= 2) {
      G._slowStreak = 0;
      const order = ['high', 'medium', 'low'];
      const i = order.indexOf(G.quality);
      if (i >= 0 && i < order.length - 1) {
        G.quality = order[i + 1];
        saveSettings({ quality: G.quality });
        if (typeof applyRenderScale === 'function') applyRenderScale();
        if (typeof rebuildPostChain === 'function') rebuildPostChain();
        const names = { high: '精细', medium: '标准', low: '流畅' };
        toast(`帧率偏低（${G.fps.toFixed(0)} fps）· 已自动降到「${names[G.quality]}」`, 'warn', 4200);
      }
    }
  } else {
    G._slowStreak = 0;
  }
}

/* 性能徽章：F3 开关。显示 fps / 帧时间 / 渲染分辨率 / 档位，
   让玩家（和我）能直接判断当前设备是否达到 60 fps 目标。 */
function updatePerfBadge() {
  const el = $('perfBadge');
  if (!el || !el.classList.contains('on')) return;
  const n = G._fpsBuf ? G._fpsBuf.length : 0;
  const w = Math.round(window.innerWidth * (G.renderPR || 1));
  const h = Math.round(window.innerHeight * (G.renderPR || 1));
  const names = { high: '精细', medium: '标准', low: '流畅' };
  const res = `${w}×${h}  ${names[G.quality] || G.quality}`;
  if (!G.fps || n < 12) {
    el.innerHTML = `<b style="color:#7f939f">采样中…</b>  ${n}/12\n${res}`;
    return;
  }
  const fps = G.fps;
  const ms = G.frameMs;
  const color = fps >= 55 ? '#c9f07a' : fps >= 40 ? '#ffb020' : '#ff6b5a';
  const mark = G.fpsProvisional ? '~' : '';
  el.innerHTML =
    `<b style="color:${color}">${mark}${fps.toFixed(0)} fps</b>  ${ms.toFixed(1)} ms\n${res}`;
}

function togglePerfBadge() {
  const el = $('perfBadge');
  if (!el) return;
  el.classList.toggle('on');
  if (el.classList.contains('on')) updatePerfBadge();
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.06, clock.getDelta());
  sampleFrame(dt);
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
