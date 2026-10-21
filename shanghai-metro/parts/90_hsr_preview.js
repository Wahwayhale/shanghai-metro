/* ============================================================
   高铁 DLC 资产预览 + 350 km/h 走廊验证（DLC-0/1）
   - build2 内联的 CR400AF-BS GLB 用 GLTFLoader 解析
   - 静态：拖拽旋转 / 滚轮缩放
   - 走廊：5.0 km 高架，350 km/h 自动运行（97.22 m/s）
   - 不进入正式线路，不改现有地铁运营逻辑
   ============================================================ */
(function hsrPreviewModule() {
  const btn = document.getElementById('hsrPreviewBtn');
  const mask = document.getElementById('hsrPreview');
  const canvas = document.getElementById('hsrCanvas');
  if (!btn || !mask || !canvas) return;

  const closeBtn = document.getElementById('hsrClose');
  const resetBtn = document.getElementById('hsrReset');
  const driveBtn = document.getElementById('hsrDrive');
  const hint = document.getElementById('hsrHint');
  const hud = document.getElementById('hsrDriveHud');
  const distEl = document.getElementById('hsrDist');
  const speedEl = document.getElementById('hsrSpeed');
  const modeEl = document.getElementById('hsrMode');
  const atpEl = document.getElementById('hsrAtp');
  const nextEl = document.getElementById('hsrNext');
  const warnEl = document.getElementById('hsrWarn');
  const staEl = document.getElementById('hsrSta');
  const planEl = document.getElementById('hsrPlan');
  const puncEl = document.getElementById('hsrPunc');
  const throttleBtn = document.getElementById('hsrThrottle');
  const brakeBtn = document.getElementById('hsrBrake');
  const resetDriveBtn = document.getElementById('hsrResetDrive');
  const segSel = document.getElementById('hsrSeg');
  const doorEl = document.getElementById('hsrDoor');
  const dwellEl = document.getElementById('hsrDwell');
  const departBtn = document.getElementById('hsrDepart');
  const loadingEl = document.getElementById('hsrLoading');
  const menuEl = document.getElementById('menu');

  let renderer = null, scene = null, camera = null, model = null, grid = null, corridor = null;
  let headModel = null, middleModel = null, headMergedModel = null, trainRoot = null, headBaseX = 0;
  let pendingDrive = false;
  let doorNodes = [], midDoorInsts = [], doorT = 0, doorTarget = 0, labelCount = 0;
  let audioCtx = null;
  let raf = 0, running = false, ready = false;
  let yaw = 0.72, pitch = 0.18, dist = 48;
  let dragging = false, lastX = 0, lastY = 0;
  let drive = false, driveX = 0, baseX = 0, lastT = 0;
  let v = 0, throttle = 0, brake = 0, touchThrottle = 0, touchBrake = 0;
  const keysDown = Object.create(null);
  const RUN = 295000;               // 295 km：南京南—上海虹桥
  const SPEED = 350 / 3.6;          // 97.222 m/s
  const ACC = 0.45;                 // 牵引加速度 m/s²
  const BRK = 0.75;                 // 常用制动 m/s²
  let startWall = 0, stopped = false, stopErr = null, puncSec = null;
  const DWELL = 120;                // 2 min 停站
  const DOOR_CLOSE = 90;
  let dwellStart = 0, doorsOpen = false, departReady = false;

  /* 南京南—上海虹桥 295 km 站序（m） */
  const STATIONS = [
    { name: '南京南', x: 0 },
    { name: '镇江南', x: 65000 },
    { name: '常州北', x: 120000 },
    { name: '无锡东', x: 160000 },
    { name: '苏州北', x: 200000 },
    { name: '昆山南', x: 250000 },
    { name: '上海虹桥', x: 295000 }
  ];

  /* 可驾驶区段：一局 10–20 min；终点站停车标在 end-100 */
  const SEGMENTS = [
    { label: '南京南—镇江南', start: 0, end: 65000, sched: 780, name: '镇江南' },
    { label: '镇江南—常州北', start: 65000, end: 120000, sched: 660, name: '常州北' },
    { label: '常州北—苏州北', start: 120000, end: 200000, sched: 960, name: '苏州北' },
    { label: '苏州北—上海虹桥', start: 200000, end: 295000, sched: 1140, name: '上海虹桥' },
    { label: '南京南—上海虹桥（全程）', start: 0, end: 295000, sched: 3300, name: '上海虹桥' }
  ];
  let seg = SEGMENTS[0];
  let stopX = seg.end - 100;
  let segStart = seg.start;
  let segName = seg.name;
  let sched = seg.sched;

  /* 静态限速剖面（m, km/h）：350 → 300 → 250 → 200 → 160 → 停车 */
  const BASE_LIMITS = [
    { x: 0, v: 350 },
    { x: 30000, v: 160 },
    { x: 32000, v: 350 },
    { x: 250000, v: 300 },
    { x: 285000, v: 250 },
    { x: 290000, v: 200 },
    { x: 293500, v: 160 }
  ];
  const LOOK = 12000;               // 12 km ATP 前瞻
  let atpWarn = 0;                  // 0 正常 / 1 报警 / 2 常用制动 / 3 EB

  function activeLimits() {
    const out = BASE_LIMITS.filter(l => l.x < stopX);
    out.push({ x: stopX, v: 0 });
    return out;
  }

  function limitAt(x) {
    let v = activeLimits()[0].v;
    for (const l of activeLimits()) if (x >= l.x) v = l.v;
    return v / 3.6;
  }

  /* 目标-距离制动曲线：min(当前静态限速, 到下一个限速点的允许速度) */
  function permittedAt(x) {
    let lim = limitAt(x);
    for (const l of activeLimits()) {
      if (l.x <= x) continue;
      const d = l.x - x;
      if (d > LOOK) break;
      const target = l.v / 3.6;
      const allowed = Math.sqrt(target * target + 2 * BRK * Math.max(0, d - 80));
      lim = Math.min(lim, allowed);
    }
    return lim;
  }

  function nextLimitAt(x) {
    for (const l of activeLimits()) if (l.x > x) return l;
    return { x: stopX, v: 0 };
  }

  function nextLabel(nl, x) {
    const d = Math.max(0, (nl.x - x) / 1000).toFixed(1);
    return nl.v > 0 ? `下一限速 ${nl.v} · ${d} km` : `停车标 · ${d} km`;
  }

  function setHint(text) { if (hint) hint.textContent = text; }

  function resize() {
    if (!renderer || !camera) return;
    const w = Math.max(320, canvas.clientWidth || 900);
    const h = Math.max(240, canvas.clientHeight || 480);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function fitModel(obj) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    obj.position.sub(center);
    baseX = obj.position.x;
    headBaseX = obj.position.x;
    dist = Math.max(size.x, size.z) * 1.55 + 4;
  }

  function buildCorridor() {
    if (corridor) return;
    corridor = new THREE.Group();
    corridor.name = 'HSR-5KM';

    const deckMat = new THREE.MeshStandardMaterial({ color: 0x3b4249, roughness: 0.92, metalness: 0.05 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x9aa4ac, roughness: 0.35, metalness: 0.9 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x4d565e, roughness: 0.6, metalness: 0.7 });

    /* 起点向后多铺 600 m：439 m 编组在始发站不会悬空 */
    const CORR = RUN + 600;
    const CORR_C = -(RUN - 600) / 2;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(CORR, 0.55, 11), deckMat);
    deck.position.set(CORR_C, -0.28, 0);
    corridor.add(deck);

    for (const z of [-0.7175, 0.7175]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(CORR, 0.12, 0.12), railMat);
      rail.position.set(CORR_C, 0.06, z);
      corridor.add(rail);
    }

    // sleepers every 4 m
    const sleeperGeo = new THREE.BoxGeometry(0.24, 0.08, 2.6);
    const sleeperMat = new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.95 });
    const count = Math.floor(CORR / 4);
    const sleepers = new THREE.InstancedMesh(sleeperGeo, sleeperMat, count);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      m4.makeTranslation(600 - i * 4, 0.02, 0);
      sleepers.setMatrixAt(i, m4);
    }
    sleepers.instanceMatrix.needsUpdate = true;
    corridor.add(sleepers);

    // catenary masts every 50 m on both sides + one contact wire
    const mastGeo = new THREE.BoxGeometry(0.22, 5.8, 0.22);
    const mastCount = Math.floor(CORR / 50) * 2;
    const masts = new THREE.InstancedMesh(mastGeo, steelMat, mastCount);
    let k = 0;
    for (let i = 0; i < CORR / 50; i++) {
      for (const z of [-5.1, 5.1]) {
        m4.makeTranslation(600 - i * 50 - 25, 2.9, z);
        masts.setMatrixAt(k++, m4);
      }
    }
    masts.instanceMatrix.needsUpdate = true;
    corridor.add(masts);

    const wire = new THREE.Mesh(new THREE.BoxGeometry(CORR, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: 0x5d6a73 }));
    wire.position.set(CORR_C, 5.6, 0);
    corridor.add(wire);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CORR + 600, 500),
      new THREE.MeshStandardMaterial({ color: 0x10161a, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(CORR_C, -18, 0);
    corridor.add(ground);

    /* 7 座车站站台（块模）：450 m 站台 + 雨棚；上海虹桥加停车标 */
    const concrete = new THREE.MeshStandardMaterial({ color: 0x5b6066, roughness: 0.9 });
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0xb9c2c8, roughness: 0.7 });
    for (const st of STATIONS) {
      const sx = -st.x;
      const plat = new THREE.Mesh(new THREE.BoxGeometry(450, 1.2, 12), concrete);
      plat.position.set(sx, 0.6, -6.8);
      corridor.add(plat);
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(450, 0.3, 14), canopyMat);
      canopy.position.set(sx, 5.4, -6.8);
      corridor.add(canopy);
      for (let i = 0; i < 15; i++) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4.2, 0.22), steelMat);
        col.position.set(sx - 210 + i * 30, 2.7, -6.8);
        corridor.add(col);
      }
    }
  function speedSign(v) {
    const g = new THREE.Group();
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f2f4f5'; ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#c8102e'; ctx.lineWidth = 18; ctx.strokeRect(9, 9, 238, 238);
    ctx.fillStyle = '#111416';
    ctx.font = '800 132px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(v), 128, 132);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(3.0, 3.0),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
    );
    board.position.set(0, 4.3, 0);
    board.rotation.y = -Math.PI / 2;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.0, 0.18), new THREE.MeshStandardMaterial({ color: 0x9aa4ac, metalness: 0.8, roughness: 0.4 }));
    post.position.set(0, 2.0, 0);
    g.add(post, board);
    return g;
  }

  function stationSprite(name) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(6,10,14,.86)';
    g.fillRect(0, 0, 512, 128);
    g.strokeStyle = '#c8102e'; g.lineWidth = 6;
    g.strokeRect(3, 3, 506, 122);
    g.font = '700 64px "Microsoft YaHei", "PingFang SC", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f2f7fa';
    g.fillText(name, 256, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(30, 7.5), mat);
    sp.rotation.y = -Math.PI / 2;
    sp.renderOrder = 10;
    sp.frustumCulled = false;
    return sp;
  }

    for (const l of BASE_LIMITS) {
      if (l.v <= 0 || l.v >= 350) continue;
      const sign = speedSign(l.v);
      sign.position.set(-l.x, 0, 5.9);
      corridor.add(sign);
    }
    for (const st of STATIONS) {
      const label = stationSprite(st.name);
      label.position.set(-st.x + 220, 6.5, -5.6);
      corridor.add(label); labelCount++;
    }
    const stopXs = [...new Set(SEGMENTS.map(s => s.end - 100))];
    for (const sx of stopXs) {
      const stopPost = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.2, 0.25), steelMat);
      stopPost.position.set(-sx, 1.6, -4.2);
      corridor.add(stopPost);
      const stopBoard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 1.2), new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.5 }));
      stopBoard.position.set(-sx - 0.2, 2.6, -4.2);
      corridor.add(stopBoard);
    }

    corridor.visible = false;
    scene.add(corridor);
  }

  function init() {
    if (renderer) return;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMappingExposure = 1.25;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080d11);

    scene.add(new THREE.HemisphereLight(0xcfe3f2, 0x1a1410, 1.5));
    const key = new THREE.DirectionalLight(0xfff2df, 2.8);
    key.position.set(40, -55, 60);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8fc4ff, 1.2);
    fill.position.set(-50, 25, 25);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffd0a8, 1.2);
    rim.position.set(0, 40, -55);
    scene.add(rim);

    grid = new THREE.GridHelper(160, 32, 0x2b3d48, 0x15222a);
    grid.position.y = -2.1;
    scene.add(grid);

    buildCorridor();

    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 5000);
    resize();

    if (typeof GLTFLoader === 'undefined' || typeof HSR_TRAIN_GLB_B64 === 'undefined' || !HSR_TRAIN_GLB_B64) {
      setHint('GLB 资产未内联：请先运行 npm run build（需要 dlc/jinghu/assets 下的头车 GLB）');
      return;
    }

    const loader = new GLTFLoader();
    function parseB64(b64, onDone) {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      loader.parse(bytes.buffer, '', onDone, (err) => {
        console.error('[hsr] GLB 解析失败', err);
        setHint('GLB 解析失败：' + (err && err.message ? err.message : err));
      });
    }

    function prep(root) {
      root.traverse((o) => {
        if (o.isMesh && o.material) {
          o.material.envMapIntensity = 0.8;
          o.frustumCulled = false;
        }
      });
      return root;
    }

    try {
      parseB64(HSR_TRAIN_GLB_B64, (gltf) => {
        headModel = prep(gltf.scene);
        addHeadDecals(headModel);
        model = headModel;
        fitModel(headModel);
        scene.add(headModel);
        ready = true;
        setHint('CR400AF-BS 头车 · 25.7 m · 拖拽旋转 / 滚轮缩放 · 可切换 350 km/h 走廊验证');
        if (typeof HSR_HEAD_MERGED_GLB_B64 !== 'undefined' && HSR_HEAD_MERGED_GLB_B64) {
          parseB64(HSR_HEAD_MERGED_GLB_B64, (hm) => { headMergedModel = prep(hm.scene); });
        }
        if (typeof HSR_MIDDLE_GLB_B64 !== 'undefined' && HSR_MIDDLE_GLB_B64) {
          parseB64(HSR_MIDDLE_GLB_B64, (mid) => {
            middleModel = prep(mid.scene);
            setHint('CR400AF-BS 17 辆编组就绪 · 拖拽旋转 / 滚轮缩放 · 可切换 350 km/h 走廊验证');
            maybeAutoDrive();
          });
        }
      });
    } catch (err) {
      console.error('[hsr] GLB 初始化失败', err);
      setHint('GLB 初始化失败：' + (err && err.message ? err.message : err));
    }
  }

  function headDecal() {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 256;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 1024, 256);
    g.fillStyle = '#15181a';
    g.font = '700 92px system-ui, sans-serif';
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('CR400AF-BS-2341', 34, 108);
    g.font = '600 64px "Microsoft YaHei", sans-serif';
    g.fillStyle = '#c8102e';
    g.fillText('复兴号', 34, 196);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  }

  function addHeadDecals(root) {
    const mat = headDecal();
    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), mat);
      mesh.position.set(7.4, 2.02, side * 1.712);
      mesh.rotation.y = side > 0 ? 0 : Math.PI;
      if (side < 0) mesh.scale.x = -1;
      mesh.renderOrder = 2;
      root.add(mesh);
    }
  }

  function ensureAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* 无音频也不影响驾驶 */ }
  }

  function bell(count) {
    try {
      ensureAudio();
      if (!audioCtx) return;
      const t0 = audioCtx.currentTime;
      for (let i = 0; i < count; i++) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = i % 2 ? 660 : 880;
        gain.gain.setValueAtTime(0.0001, t0 + i * 0.16);
        gain.gain.exponentialRampToValueAtTime(0.06, t0 + i * 0.16 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.16 + 0.14);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(t0 + i * 0.16); osc.stop(t0 + i * 0.16 + 0.15);
      }
    } catch (e) { /* ignore */ }
  }

  function buildTrain() {
    if (!headModel || !middleModel) return null;
    const root = new THREE.Group();
    const HEAD = 25.7, MID = 25.5, GAP = 0.35;
    const head = headModel.clone(true);
    head.visible = true;
    head.position.set(HEAD / 2, 0, 0);
    root.add(head);
    doorNodes = []; midDoorInsts = []; doorT = 0; doorTarget = 0;
    head.traverse((o) => {
      if (o.isMesh && o.name && o.name.startsWith('GEO-door_')
          && !o.name.includes('frame') && !o.name.includes('window')) {
        doorNodes.push({ node: o, y0: o.position.y, side: o.position.y >= 0 ? 1 : -1 });
      }
    });
    let x = HEAD + GAP;
    const carXs = [];
    for (let i = 0; i < 15; i++) {
      carXs.push(x + MID / 2);
      x += MID + GAP;
    }
    /* 中间车用 InstancedMesh：15 辆 × 8 材质组 → 8 个 draw call，而不是 120 个 */
    middleModel.updateMatrixWorld(true);
    const midMeshes = [];
    middleModel.traverse((o) => { if (o.isMesh) midMeshes.push(o); });
    const im = new THREE.Matrix4();
    const cm = new THREE.Matrix4();
    for (const mesh of midMeshes) {
      const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, carXs.length);
      for (let i = 0; i < carXs.length; i++) {
        cm.makeTranslation(carXs[i], 0, 0);
        im.multiplyMatrices(cm, mesh.matrixWorld);
        inst.setMatrixAt(i, im);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.frustumCulled = false;
      root.add(inst);
      if (mesh.name && mesh.name.startsWith('M-door_') && !mesh.name.includes('frame') && !mesh.name.includes('win')) {
        midDoorInsts.push({
          inst,
          side: mesh.name.includes('_-1_') ? -1 : 1,
          carXs: carXs.slice(),
          world: mesh.matrixWorld.clone()
        });
      }
    }
    const tailSrc = headMergedModel || headModel;
    const tail = tailSrc.clone(true);
    tail.visible = true;
    tail.position.set(x + HEAD / 2, 0, 0);
    tail.rotation.y = Math.PI;
    root.add(tail);
    return root;
  }

  function applySegment(i) {
    const wasDrive = drive;
    if (wasDrive) exitDrive();
    seg = SEGMENTS[i] || SEGMENTS[0];
    stopX = seg.end - 100;
    segStart = seg.start;
    segName = seg.name;
    sched = seg.sched;
    if (segSel) segSel.value = String(i);
    if (wasDrive) enterDrive();
  }

  function departNext() {
    if (!departReady) return;
    departReady = false;
    if (departBtn) departBtn.classList.add('hidden');
    const idx = SEGMENTS.indexOf(seg);
    const next = SEGMENTS[idx + 1];
    const x = Math.min(RUN, Math.max(0, -driveX));
    if (!next || next.start < seg.start) {
      stopped = true;
      if (dwellEl) dwellEl.textContent = '终点站 · 本段结束';
      setHint('终点站 · 本段结束 · R 重置');
      return;
    }
    /* 物理发车：不切段/不瞬移，从 0 加速到下一站 */
    seg = next;
    segStart = x;
    stopX = next.end - 100;
    segName = next.name;
    sched = next.sched;
    if (segSel) segSel.value = String(idx + 1);
    startWall = performance.now();
    stopped = false; doorsOpen = false; departReady = false;
    doorTarget = 0; doorT = 0; bell(2);
    stopErr = null; puncSec = null;
    v = 0; throttle = 0; brake = 0;
    touchThrottle = 0; touchBrake = 0;
    Object.keys(keysDown).forEach(k => { keysDown[k] = false; });
    if (doorEl) doorEl.textContent = '车门关闭';
    if (dwellEl) dwellEl.textContent = '停站 --';
    if (departBtn) departBtn.classList.add('hidden');
    if (puncEl) puncEl.textContent = '运行 00:00';
    if (staEl) staEl.textContent = `下一站 ${segName} · ${((stopX - x) / 1000).toFixed(1)} km`;
    if (planEl) planEl.textContent = '计划用时 ' + fmtTime(sched);
    if (nextEl) { const nl0 = nextLimitAt(x); nextEl.textContent = nextLabel(nl0, x); }
    if (modeEl) modeEl.textContent = '发车';
    atpWarn = 0;
    setHint(`发车 · ${next.label} · 从 0 加速 · W 牵引`);
  }

  function enterDrive() {
    if (!ready || !model) { setHint('模型还没加载完，稍后再试'); return; }
    if (loadingEl) loadingEl.classList.add('hidden');
    drive = true;
    driveX = -segStart;
    v = SPEED;
    throttle = 0; brake = 0;
    touchThrottle = 0; touchBrake = 0;
    stopped = false; stopErr = null; puncSec = null;
    startWall = performance.now();
    Object.keys(keysDown).forEach(k => { keysDown[k] = false; });
    lastT = performance.now();
    grid.visible = false;
    corridor.visible = true;
    scene.fog = new THREE.Fog(0x0a1116, 350, 1600);
    hud.classList.remove('hidden');
    if (speedEl) speedEl.textContent = '350';
    if (distEl) distEl.textContent = '0.00 km';
    if (modeEl) modeEl.textContent = '惰行';
    if (atpEl) atpEl.textContent = 'ATP 350';
    if (nextEl) { const nl0 = nextLimitAt(segStart); nextEl.textContent = nextLabel(nl0, segStart); }
    if (warnEl) { warnEl.textContent = ''; warnEl.classList.add('hidden'); warnEl.classList.remove('eb'); }
    if (staEl) staEl.textContent = `下一站 ${segName} · ${((stopX - segStart) / 1000).toFixed(1)} km`;
    if (planEl) planEl.textContent = '计划用时 ' + fmtTime(sched);
    if (puncEl) puncEl.textContent = '运行 00:00';
    if (doorEl) doorEl.textContent = '车门关闭';
    if (dwellEl) dwellEl.textContent = '停站 --';
    if (departBtn) departBtn.classList.add('hidden');
    doorsOpen = false; departReady = false; doorTarget = 0; doorT = 0;
    atpWarn = 0;
    if (driveBtn) driveBtn.textContent = '退出 350 km/h 走廊';

    const root = buildTrain();
    if (root) {
      if (trainRoot) scene.remove(trainRoot);
      trainRoot = root;
      scene.add(trainRoot);
      headModel.visible = false;
      model = trainRoot;
      baseX = 0;
    } else {
      if (trainRoot) { scene.remove(trainRoot); trainRoot = null; }
      model = headModel;
      headModel.visible = true;
      baseX = headBaseX;
    }

    model.position.x = baseX;
    model.rotation.y = 0;
    setHint(`${seg.label} · ${((stopX - segStart) / 1000).toFixed(0)} km · ${root ? '17 辆编组' : '单节头车'} · W 牵引 / S 制动 / R 重置`);
  }

  function exitDrive() {
    drive = false;
    v = 0; throttle = 0; brake = 0; touchThrottle = 0; touchBrake = 0;
    stopped = false; stopErr = null; puncSec = null;
    Object.keys(keysDown).forEach(k => { keysDown[k] = false; });
    corridor.visible = false;
    grid.visible = true;
    scene.fog = null;
    hud.classList.add('hidden');
    if (driveBtn) driveBtn.textContent = '350 km/h 走廊验证';
    if (trainRoot) { scene.remove(trainRoot); trainRoot = null; }
    if (headModel) {
      headModel.visible = true;
      model = headModel;
      baseX = headBaseX;
      model.position.x = baseX;
      model.rotation.y = 0;
    }
    yaw = 0.72; pitch = 0.18;
    setHint('CR400AF-BS 头车 · 25.7 m · 拖拽旋转 / 滚轮缩放 · 可切换 350 km/h 走廊验证');
  }

  function fmtTime(sec) {
    const m = Math.floor(Math.max(0, sec) / 60);
    const s = Math.floor(Math.max(0, sec) % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function animate(now) {
    if (!running) return;
    raf = requestAnimationFrame(animate);
    if (!renderer || !scene || !camera) return;

    if (drive && model) {
      const t = now || performance.now();
      const dt = Math.min(0.5, Math.max(0, (t - lastT) / 1000));
      lastT = t;

      throttle = (keysDown.w || keysDown.arrowup || touchThrottle) ? 1 : 0;
      brake = (keysDown.s || keysDown.arrowdown || touchBrake) ? 1 : 0;

      if (stopped && departReady && throttle) { departNext(); return; }

      if (!stopped) {
        /* ATP：静态限速 + 12 km 目标-距离制动曲线 + 超速分级 */
        const x0 = Math.min(RUN, Math.max(0, -driveX));
        const perm = permittedAt(x0);
        const over = v - perm;
        if (over > 15 / 3.6) atpWarn = 3;
        else if (over > 8 / 3.6) atpWarn = 2;
        else if (over > 2 / 3.6) atpWarn = 1;
        else atpWarn = 0;

        /* 简化动力学：牵引 0.45 m/s²、常用制动 0.75 m/s²、高速阻力 */
        const drag = 0.000005 * v * v;
        let a = ACC * throttle - BRK * brake - drag;
        if (atpWarn === 3) a = Math.min(a, -1.2);       // EB
        else if (atpWarn === 2) a = Math.min(a, -BRK);  // ATP 常用制动
        v = Math.max(0, Math.min(SPEED, v + a * dt));
        driveX -= v * dt;
        if (driveX < -RUN) { driveX = -RUN; v = 0; }
      } else {
        v = 0;
        atpWarn = 0;
        const ds = (performance.now() - dwellStart) / 1000;
        if (doorsOpen && ds >= DOOR_CLOSE) {
          doorsOpen = false;
          doorTarget = 0; bell(2);
          if (doorEl) doorEl.textContent = '车门关闭';
          setHint('车门关闭 · 停站完成，按 W 或「发车」进入下一段');
        }
        if (!departReady && ds >= DWELL) {
          departReady = true;
          if (dwellEl) dwellEl.textContent = '停站完成';
          if (departBtn) departBtn.classList.remove('hidden');
          setHint('停站完成 · 按 W 或「发车」进入下一段');
        }
        if (!departReady && dwellEl) dwellEl.textContent = '停站 ' + fmtTime(Math.max(0, DWELL - ds));
      }

      const dstep = Math.min(1, dt / 0.8);
      if (doorT < doorTarget) doorT = Math.min(doorTarget, doorT + dstep);
      else if (doorT > doorTarget) doorT = Math.max(doorTarget, doorT - dstep);
      for (const d of doorNodes) d.node.position.y = d.y0 + d.side * 0.55 * doorT;
      if (midDoorInsts.length) {
        const cm2 = new THREE.Matrix4();
        const im2 = new THREE.Matrix4();
        for (const d of midDoorInsts) {
          for (let i = 0; i < d.carXs.length; i++) {
            cm2.makeTranslation(d.carXs[i], d.side * 0.55 * doorT, 0);
            im2.multiplyMatrices(cm2, d.world);
            d.inst.setMatrixAt(i, im2);
          }
          d.inst.instanceMatrix.needsUpdate = true;
        }
      }

      model.position.x = baseX + driveX;
      model.rotation.y = 0;

      camera.position.set(driveX - 38, 8.0, 22);
      camera.lookAt(driveX + 4, 2.2, 0);

      const x = Math.min(RUN, Math.max(0, -driveX));
      const permNow = permittedAt(x);
      const nl = nextLimitAt(x);

      /* 停站判定：速度 < 0.3，且在停车标 ±500 m */
      if (!stopped && v < 0.3 && Math.abs(x - stopX) < 500) {
        stopped = true;
        stopErr = x - stopX;
        dwellStart = performance.now();
        doorsOpen = true; departReady = false;
        doorTarget = 1; bell(1);
        if (doorEl) doorEl.textContent = '车门开启';
        if (dwellEl) dwellEl.textContent = '停站 2:00';
        if (departBtn) departBtn.classList.add('hidden');
        const elapsed = (performance.now() - startWall) / 1000;
        puncSec = sched - elapsed;
        if (puncEl) {
          const e = stopErr >= 0 ? '+' : '';
          const p = puncSec >= 0 ? '早点' : '晚点';
          puncEl.textContent = `停站 ${e}${stopErr.toFixed(2)} m · ${p} ${Math.abs(puncSec).toFixed(0)} s`;
        }
        if (staEl) staEl.textContent = segName + ' · 已停站';
        if (modeEl) modeEl.textContent = '停车';
        setHint(segName + '停车 · 车门开启 · 2 min 停站 · 关门后按 W 发车');
      } else if (!stopped && puncEl) {
        puncEl.textContent = '运行 ' + fmtTime((performance.now() - startWall) / 1000);
      }

      if (speedEl) speedEl.textContent = String(Math.round(v * 3.6));
      if (distEl) distEl.textContent = ((x - segStart) / 1000).toFixed(2) + ' km';
      if (atpEl) atpEl.textContent = 'ATP ' + Math.max(0, Math.round(permNow * 3.6));
      if (nextEl) {
        const dkm = Math.max(0, (nl.x - x) / 1000);
        nextEl.textContent = nextLabel(nl, x);
      }
      if (staEl && !stopped) staEl.textContent = `下一站 ${segName} · ${(Math.max(0, stopX - x) / 1000).toFixed(1)} km`;
      if (warnEl) {
        warnEl.textContent = atpWarn === 3 ? '超速 EB' : atpWarn === 2 ? '超速' : atpWarn === 1 ? '接近限速' : '';
        warnEl.classList.toggle('hidden', atpWarn === 0);
        warnEl.classList.toggle('eb', atpWarn === 3);
      }
      if (modeEl && !stopped) {
        modeEl.textContent = atpWarn === 3 ? 'EB'
          : atpWarn === 2 ? 'ATP 制动'
            : brake ? '制动'
              : throttle ? '牵引'
                : (v > 0.5 ? '惰行' : '停车');
      }
    } else {
      const cy = Math.cos(pitch) * dist;
      camera.position.set(Math.sin(yaw) * cy, 8 + Math.sin(pitch) * dist, Math.cos(yaw) * cy);
      camera.lookAt(0, 1.6, 0);
      if (model && ready) model.rotation.y += 0.0015;
    }
    renderer.render(scene, camera);
  }

  function maybeAutoDrive() {
    if (pendingDrive && ready && middleModel) {
      pendingDrive = false;
      enterDrive();
    }
  }

  function openDrive() {
    pendingDrive = true;
    if (menuEl) menuEl.classList.add('hidden');
    if (loadingEl) loadingEl.classList.remove('hidden');
    open();
    if (ready && middleModel) {
      pendingDrive = false;
      enterDrive();
      return;
    }
    setTimeout(() => {
      if (pendingDrive) { pendingDrive = false; enterDrive(); }
    }, 1600);
  }

  function open() {
    mask.classList.remove('hidden');
    init();
    running = true;
    cancelAnimationFrame(raf);
    if (renderer && scene && camera) {
      requestAnimationFrame(() => { resize(); lastT = performance.now(); animate(performance.now()); });
    }
  }

  function close() {
    pendingDrive = false;
    if (loadingEl) loadingEl.classList.add('hidden');
    if (menuEl) menuEl.classList.remove('hidden');
    running = false;
    cancelAnimationFrame(raf);
    if (drive) exitDrive();
    mask.classList.add('hidden');
  }

  btn.addEventListener('click', open);
  const dlcCard = document.getElementById('dlcCard');
  if (dlcCard) dlcCard.addEventListener('click', openDrive);
  closeBtn && closeBtn.addEventListener('click', close);
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });

  driveBtn && driveBtn.addEventListener('click', () => {
    if (drive) exitDrive(); else enterDrive();
  });

  segSel && segSel.addEventListener('change', (e) => applySegment(Number(e.target.value)));
  departBtn && departBtn.addEventListener('click', departNext);

  function resetDrive() {
    driveX = -segStart;
    v = SPEED;
    throttle = 0; brake = 0;
    touchThrottle = 0; touchBrake = 0;
    stopped = false; stopErr = null; puncSec = null;
    startWall = performance.now();
    Object.keys(keysDown).forEach(k => { keysDown[k] = false; });
    lastT = performance.now();
    if (speedEl) speedEl.textContent = '350';
    if (distEl) distEl.textContent = '0.00 km';
    if (modeEl) modeEl.textContent = '惰行';
    if (atpEl) atpEl.textContent = 'ATP 350';
    if (nextEl) { const nl0 = nextLimitAt(segStart); nextEl.textContent = nextLabel(nl0, segStart); }
    if (warnEl) { warnEl.textContent = ''; warnEl.classList.add('hidden'); warnEl.classList.remove('eb'); }
    if (staEl) staEl.textContent = `下一站 ${segName} · ${((stopX - segStart) / 1000).toFixed(1)} km`;
    if (planEl) planEl.textContent = '计划用时 ' + fmtTime(sched);
    if (puncEl) puncEl.textContent = '运行 00:00';
    if (doorEl) doorEl.textContent = '车门关闭';
    if (dwellEl) dwellEl.textContent = '停站 --';
    if (departBtn) departBtn.classList.add('hidden');
    doorsOpen = false; departReady = false; doorTarget = 0; doorT = 0;
    atpWarn = 0;
    if (throttleBtn) throttleBtn.classList.remove('on');
    if (brakeBtn) brakeBtn.classList.remove('on');
  }

  resetBtn && resetBtn.addEventListener('click', () => {
    if (drive) {
      resetDrive();
    } else {
      yaw = 0.72; pitch = 0.18;
      if (model) { model.rotation.y = 0; fitModel(model); }
    }
  });
  resetDriveBtn && resetDriveBtn.addEventListener('click', resetDrive);

  window.addEventListener('keydown', (e) => {
    if (!running || !drive) return;
    const k = String(e.key || '').toLowerCase();
    if (k === 'w' || k === 'arrowup' || k === 's' || k === 'arrowdown' || k === 'r') {
      e.preventDefault();
      if (k === 'r') { resetDrive(); return; }
      keysDown[k] = true;
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = String(e.key || '').toLowerCase();
    if (k in keysDown) keysDown[k] = false;
  });
  window.addEventListener('blur', () => {
    Object.keys(keysDown).forEach(k => { keysDown[k] = false; });
    touchThrottle = 0; touchBrake = 0;
  });

  function bindHold(btnEl, key) {
    if (!btnEl) return;
    const set = (on) => {
      if (!drive) return;
      if (key === 'throttle') touchThrottle = on ? 1 : 0;
      else touchBrake = on ? 1 : 0;
      btnEl.classList.toggle('on', on);
    };
    btnEl.addEventListener('pointerdown', (e) => { e.preventDefault(); set(true); });
    btnEl.addEventListener('pointerup', () => set(false));
    btnEl.addEventListener('pointerleave', () => set(false));
    btnEl.addEventListener('pointercancel', () => set(false));
  }
  bindHold(throttleBtn, 'throttle');
  bindHold(brakeBtn, 'brake');

  canvas.addEventListener('pointerdown', (e) => {
    if (drive) return;
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging || drive) return;
    yaw -= (e.clientX - lastX) * 0.006;
    pitch = Math.max(-0.15, Math.min(0.75, pitch + (e.clientY - lastY) * 0.004));
    lastX = e.clientX; lastY = e.clientY;
  });
  canvas.addEventListener('pointerup', () => { dragging = false; });
  canvas.addEventListener('pointercancel', () => { dragging = false; });
  canvas.addEventListener('wheel', (e) => {
    if (drive) return;
    e.preventDefault();
    dist = Math.max(18, Math.min(180, dist * (1 + Math.sign(e.deltaY) * 0.08)));
  }, { passive: false });

  window.addEventListener('resize', () => { if (running) resize(); });

  /* 自动化测试用：只读状态 + 定位（不影响正常 UI） */
  window.__hsr = {
    get state() {
      const x = Math.min(RUN, Math.max(0, -driveX));
      return {
        open: running, drive,
        x, v: v * 3.6, permitted: permittedAt(x) * 3.6,
        warn: atpWarn, atp: atpEl ? atpEl.textContent : '',
        next: nextEl ? nextEl.textContent : '',
        mode: modeEl ? modeEl.textContent : '',
        stopped, stopErr, puncSec,
        punc: puncEl ? puncEl.textContent : '',
        station: staEl ? staEl.textContent : '',
        segment: seg.label, segStart, segEnd: stopX,
        doorsOpen, departReady, doorT, dwell: dwellEl ? dwellEl.textContent : '',
        cars: trainRoot ? 17 : 1, labels: labelCount
      };
    },
    setSegment(i) { applySegment(i); },
    skipDwell() { if (stopped) dwellStart = performance.now() - 121000; },
    setPosition(m, kmh) {
      driveX = -Math.max(0, Math.min(RUN, m));
      v = Math.min(SPEED, Math.max(0, (kmh == null ? 350 : kmh) / 3.6));
      lastT = performance.now();
    }
  };
})();
