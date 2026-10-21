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

  let renderer = null, scene = null, camera = null, model = null, grid = null, corridor = null;
  let raf = 0, running = false, ready = false;
  let yaw = 0.72, pitch = 0.18, dist = 48;
  let dragging = false, lastX = 0, lastY = 0;
  let drive = false, driveX = 0, baseX = 0, lastT = 0;
  const RUN = 5000;                 // 5.0 km
  const SPEED = 350 / 3.6;          // 97.222 m/s

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
    const count = Math.floor(RUN / 2);
    const sleepers = new THREE.InstancedMesh(sleeperGeo, sleeperMat, count);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      m4.makeTranslation(-i * 2, 0.02, 0);
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
    lastT = performance.now();
    grid.visible = false;
    corridor.visible = true;
    scene.fog = new THREE.Fog(0x0a1116, 350, 1600);
    hud.classList.remove('hidden');
    if (speedEl) speedEl.textContent = '350';
    if (distEl) distEl.textContent = '0.00 km';
    if (driveBtn) driveBtn.textContent = '退出 350 km/h 走廊';
    model.position.x = baseX;
    model.rotation.y = 0;
    setHint('5.0 km 直线走廊 · 350 km/h（97.22 m/s）· 自动运行，约 51 s 跑完');
  }

  function exitDrive() {
    drive = false;
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

  function animate(now) {
    if (!running) return;
    raf = requestAnimationFrame(animate);
    if (!renderer || !scene || !camera) return;

    if (drive && model) {
      const t = now || performance.now();
      const dt = Math.min(0.25, Math.max(0, (t - lastT) / 1000));
      lastT = t;
      driveX -= SPEED * dt;
      if (driveX < -RUN) driveX = 0;
      model.position.x = baseX + driveX;
      model.rotation.y = 0;

      camera.position.set(driveX - 38, 8.0, 22);
      camera.lookAt(driveX + 4, 2.2, 0);
      if (distEl) distEl.textContent = (Math.min(RUN, -driveX) / 1000).toFixed(2) + ' km';
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

  resetBtn && resetBtn.addEventListener('click', () => {
    if (drive) {
      driveX = 0;
      lastT = performance.now();
      if (distEl) distEl.textContent = '0.00 km';
    } else {
      yaw = 0.72; pitch = 0.18;
      if (model) { model.rotation.y = 0; fitModel(model); }
    }
  });

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
})();
