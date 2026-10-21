/* ============================================================
   高铁 DLC 资产预览（DLC-0/1 验证）
   - 把 build2 内联的 CR400AF-BS GLB 用 GLTFLoader 解析出来
   - 菜单里点「高铁 DLC 资产预览」打开，拖拽旋转 / 滚轮缩放
   - 不进入正式线路，不改现有地铁运营逻辑
   ============================================================ */
(function hsrPreviewModule() {
  const btn = document.getElementById('hsrPreviewBtn');
  const mask = document.getElementById('hsrPreview');
  const canvas = document.getElementById('hsrCanvas');
  if (!btn || !mask || !canvas) return;

  const closeBtn = document.getElementById('hsrClose');
  const resetBtn = document.getElementById('hsrReset');
  const hint = document.getElementById('hsrHint');

  let renderer = null, scene = null, camera = null, model = null;
  let raf = 0, running = false, ready = false;
  let yaw = 0.72, pitch = 0.18, dist = 58;
  let dragging = false, lastX = 0, lastY = 0;

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
    dist = Math.max(size.x, size.z) * 1.55 + 4;
  }

  function init() {
    if (renderer) return;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080d11);

    scene.add(new THREE.HemisphereLight(0xcfe3f2, 0x1a1410, 1.4));
    const key = new THREE.DirectionalLight(0xfff2df, 2.8);
    key.position.set(40, -55, 60);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8fc4ff, 1.1);
    fill.position.set(-50, 25, 25);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffd0a8, 1.2);
    rim.position.set(0, 40, -55);
    scene.add(rim);

    const grid = new THREE.GridHelper(160, 32, 0x2b3d48, 0x15222a);
    grid.position.y = -2.1;
    scene.add(grid);

    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 3000);
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
        setHint('CR400AF-BS 头车 · 25.7 m · 拖拽旋转 / 滚轮缩放 · 这是资产验证，不是正式线路');
      }, (err) => {
        console.error('[hsr] GLB 解析失败', err);
        setHint('GLB 解析失败：' + (err && err.message ? err.message : err));
      });
    } catch (err) {
      console.error('[hsr] GLB 初始化失败', err);
      setHint('GLB 初始化失败：' + (err && err.message ? err.message : err));
    }
  }

  function animate() {
    if (!running) return;
    raf = requestAnimationFrame(animate);
    if (renderer && scene && camera) {
      const cy = Math.cos(pitch) * dist;
      camera.position.set(Math.sin(yaw) * cy, 8 + Math.sin(pitch) * dist, Math.cos(yaw) * cy);
      camera.lookAt(0, 1.6, 0);
      if (model && ready) model.rotation.y += 0.0015;
      renderer.render(scene, camera);
    }
  }

  function open() {
    mask.classList.remove('hidden');
    init();
    running = true;
    cancelAnimationFrame(raf);
    if (renderer && scene && camera) {
      requestAnimationFrame(() => { resize(); animate(); });
    }
  }

  function close() {
    running = false;
    cancelAnimationFrame(raf);
    mask.classList.add('hidden');
  }

  btn.addEventListener('click', open);
  closeBtn && closeBtn.addEventListener('click', close);
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });

  resetBtn && resetBtn.addEventListener('click', () => {
    yaw = 0.72; pitch = 0.18;
    if (model) { model.rotation.y = 0; fitModel(model); }
  });

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    yaw -= (e.clientX - lastX) * 0.006;
    pitch = Math.max(-0.15, Math.min(0.75, pitch + (e.clientY - lastY) * 0.004));
    lastX = e.clientX; lastY = e.clientY;
  });
  canvas.addEventListener('pointerup', () => { dragging = false; });
  canvas.addEventListener('pointercancel', () => { dragging = false; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    dist = Math.max(18, Math.min(180, dist * (1 + Math.sign(e.deltaY) * 0.08)));
  }, { passive: false });

  window.addEventListener('resize', () => { if (running) resize(); });
})();
