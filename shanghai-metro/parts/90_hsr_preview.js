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

  let renderer = null, scene = null, camera = null, model = null, grid = null, corridor = null;
  let raf = 0, running = false, ready = false;
  let yaw = 0.72, pitch = 0.18, dist = 48;
  let dragging = false, lastX = 0, lastY = 0;
  let drive = false, driveX = 0, baseX = 0, lastT = 0;
  let v = 0, throttle = 0, brake = 0, touchThrottle = 0, touchBrake = 0;
  const keysDown = Object.create(null);
  const RUN = 295000;               // 295 km：南京南—上海虹桥切片
  const STOP_X = 294900;            // 上海虹桥停车标
  const SPEED = 350 / 3.6;          // 97.222 m/s
  const ACC = 0.45;                 // 牵引加速度 m/s²
  const BRK = 0.75;                 // 常用制动 m/s²
  const SCHED = 3300;               // 计划 08:55:00（3300 s）
  let startWall = 0, stopped = false, stopErr = null, puncSec = null;

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

  /* 静态限速剖面（m, km/h）：350 → 300 → 250 → 200 → 160 → 停车 */
  const LIMITS = [
    { x: 0, v: 350 },
    { x: 250000, v: 300 },
    { x: 285000, v: 250 },
    { x: 290000, v: 200 },
    { x: 293500, v: 160 },
    { x: STOP_X, v: 0 }
  ];
  const LOOK = 12000;               // 12 km ATP 前瞻
  let atpWarn = 0;                  // 0 正常 / 1 报警 / 2 常用制动 / 3 EB

  function limitAt(x) {
    let v = LIMITS[0].v;
    for (const l of LIMITS) if (x >= l.x) v = l.v;
    return v / 3.6;
  }

  /* 目标-距离制动曲线：min(当前静态限速, 到下一个限速点的允许速度) */
  function permittedAt(x) {
    let lim = limitAt(x);
    for (const l of LIMITS) {
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
    for (const l of LIMITS) if (l.x > x) return l;
    return { x: RUN, v: 0 };
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
    dist = Math.max(size.x, size.z) * 1.55 + 4;
  }

  function buildCorridor() {
    if (corridor) return;
    corridor = new THREE.Group();
    corridor.name = 'HSR-5KM';

    const deckMat = new THREE.MeshStandardMaterial({ color: 0x3b4249, roughness: 0.92, metalness: 0.05 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x9aa4ac, roughness: 0.35, metalness: 0.9 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x4d565e, roughness: 0.6, metalness: 0.7 });

    const deck = new THREE.Mesh(new THREE.BoxGeometry(RUN, 0.55, 11), deckMat);
    deck.position.set(-RUN / 2, -0.28, 0);
    corridor.add(deck);

    for (const z of [-0.7175, 0.7175]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(RUN, 0.12, 0.12), railMat);
      rail.position.set(-RUN / 2, 0.06, z);
      corridor.add(rail);
    }

    // sleepers every 2 m
    const sleeperGeo = new THREE.BoxGeometry(0.24, 0.08, 2.6);
    const sleeperMat = new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.95 });
    const count = Math.floor(RUN / 4);
    const sleepers = new THREE.InstancedMesh(sleeperGeo, sleeperMat, count);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      m4.makeTranslation(-i * 4, 0.02, 0);
      sleepers.setMatrixAt(i, m4);
    }
    sleepers.instanceMatrix.needsUpdate = true;
    corridor.add(sleepers);

    // catenary masts every 50 m on both sides + one contact wire
    const mastGeo = new THREE.BoxGeometry(0.22, 5.8, 0.22);
    const mastCount = Math.floor(RUN / 50) * 2;
    const masts = new THREE.InstancedMesh(mastGeo, steelMat, mastCount);
    let k = 0;
    for (let i = 0; i < RUN / 50; i++) {
      for (const z of [-5.1, 5.1]) {
        m4.makeTranslation(-i * 50 - 25, 2.9, z);
        masts.setMatrixAt(k++, m4);
      }
    }
    masts.instanceMatrix.needsUpdate = true;
    corridor.add(masts);

    const wire = new THREE.Mesh(new THREE.BoxGeometry(RUN, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: 0x5d6a73 }));
    wire.position.set(-RUN / 2, 5.6, 0);
    corridor.add(wire);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(RUN + 600, 500),
      new THREE.MeshStandardMaterial({ color: 0x10161a, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(-RUN / 2, -18, 0);
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
    const stopPost = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.2, 0.25), steelMat);
    stopPost.position.set(-STOP_X, 1.6, -4.2);
    corridor.add(stopPost);
    const stopBoard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 1.2), new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.5 }));
    stopBoard.position.set(-STOP_X - 0.2, 2.6, -4.2);
    corridor.add(stopBoard);

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

    try {
      const bin = atob(HSR_TRAIN_GLB_B64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const loader = new GLTFLoader();
      loader.parse(bytes.buffer, '', (gltf) => {
        model = gltf.scene;
        model.traverse((o) => {
          if (o.isMesh && o.material) {
            o.material.envMapIntensity = 0.8;
            o.frustumCulled = false;
          }
        });
        fitModel(model);
        scene.add(model);
        ready = true;
        setHint('CR400AF-BS 头车 · 25.7 m · 拖拽旋转 / 滚轮缩放 · 可切换 350 km/h 走廊验证');
      }, (err) => {
        console.error('[hsr] GLB 解析失败', err);
        setHint('GLB 解析失败：' + (err && err.message ? err.message : err));
      });
    } catch (err) {
      console.error('[hsr] GLB 初始化失败', err);
      setHint('GLB 初始化失败：' + (err && err.message ? err.message : err));
    }
  }

  function enterDrive() {
    if (!ready || !model) { setHint('模型还没加载完，稍后再试'); return; }
    drive = true;
    driveX = 0;
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
    if (nextEl) nextEl.textContent = '下一限速 300 · 250.0 km';
    if (warnEl) { warnEl.textContent = ''; warnEl.classList.add('hidden'); warnEl.classList.remove('eb'); }
    if (staEl) staEl.textContent = '下一站 上海虹桥 · 294.9 km';
    if (planEl) planEl.textContent = '计划 08:55:00';
    if (puncEl) puncEl.textContent = '运行 00:00';
    atpWarn = 0;
    if (driveBtn) driveBtn.textContent = '退出 350 km/h 走廊';
    model.position.x = baseX;
    model.rotation.y = 0;
    setHint('295 km 南京南—上海虹桥 · 350 km/h（97.22 m/s）· W 牵引 / S 制动 / R 重置');
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
    if (model) {
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
      }

      model.position.x = baseX + driveX;
      model.rotation.y = 0;

      camera.position.set(driveX - 38, 8.0, 22);
      camera.lookAt(driveX + 4, 2.2, 0);

      const x = Math.min(RUN, Math.max(0, -driveX));
      const permNow = permittedAt(x);
      const nl = nextLimitAt(x);

      /* 停站判定：速度 < 0.3，且在停车标 ±500 m */
      if (!stopped && v < 0.3 && Math.abs(x - STOP_X) < 500) {
        stopped = true;
        stopErr = x - STOP_X;
        const elapsed = (performance.now() - startWall) / 1000;
        puncSec = SCHED - elapsed;
        if (puncEl) {
          const e = stopErr >= 0 ? '+' : '';
          const p = puncSec >= 0 ? '早点' : '晚点';
          puncEl.textContent = `停站 ${e}${stopErr.toFixed(2)} m · ${p} ${Math.abs(puncSec).toFixed(0)} s`;
        }
        if (staEl) staEl.textContent = '上海虹桥 · 已停站';
        if (modeEl) modeEl.textContent = '停车';
        setHint('上海虹桥停车完成 · R 重置 · 停站误差与正晚点见 HUD');
      } else if (!stopped && puncEl) {
        puncEl.textContent = '运行 ' + fmtTime((performance.now() - startWall) / 1000);
      }

      if (speedEl) speedEl.textContent = String(Math.round(v * 3.6));
      if (distEl) distEl.textContent = (x / 1000).toFixed(2) + ' km';
      if (atpEl) atpEl.textContent = 'ATP ' + Math.max(0, Math.round(permNow * 3.6));
      if (nextEl) {
        const dkm = Math.max(0, (nl.x - x) / 1000);
        nextEl.textContent = nl.v > 0
          ? `下一限速 ${nl.v} · ${dkm.toFixed(1)} km`
          : `停车标 · ${dkm.toFixed(2)} km`;
      }
      if (staEl && !stopped) staEl.textContent = `下一站 上海虹桥 · ${(Math.max(0, STOP_X - x) / 1000).toFixed(1)} km`;
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
    running = false;
    cancelAnimationFrame(raf);
    if (drive) exitDrive();
    mask.classList.add('hidden');
  }

  btn.addEventListener('click', open);
  closeBtn && closeBtn.addEventListener('click', close);
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });

  driveBtn && driveBtn.addEventListener('click', () => {
    if (drive) exitDrive(); else enterDrive();
  });

  function resetDrive() {
    driveX = 0;
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
    if (nextEl) nextEl.textContent = '下一限速 300 · 250.0 km';
    if (warnEl) { warnEl.textContent = ''; warnEl.classList.add('hidden'); warnEl.classList.remove('eb'); }
    if (staEl) staEl.textContent = '下一站 上海虹桥 · 294.9 km';
    if (puncEl) puncEl.textContent = '运行 00:00';
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
        station: staEl ? staEl.textContent : ''
      };
    },
    setPosition(m, kmh) {
      driveX = -Math.max(0, Math.min(RUN, m));
      v = Math.min(SPEED, Math.max(0, (kmh == null ? 350 : kmh) / 3.6));
      lastT = performance.now();
    }
  };
})();
