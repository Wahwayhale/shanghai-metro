/* 京沪高铁主场景世界构建器（C 项第一步：与独立 canvas 解耦） */
(function () {
  function buildHsrWorld(scene, THREE) {
    THREE = THREE || window.__HSR_THREE;
    const D = window.HSR_DATA;
    if (!D) throw new Error('HSR_DATA 未就绪');
    const g = new THREE.Group();
    g.name = 'HSR-MAIN-WORLD';
    const RUN = D.RUN;
    const mat = (color, rough) => new THREE.MeshStandardMaterial({ color, roughness: rough == null ? 0.85 : rough, metalness: 0.05 });

    const deck = new THREE.Mesh(new THREE.BoxGeometry(RUN + 600, 0.6, 18), mat(0x2a3138, 0.95));
    deck.position.set(600 - (RUN + 600) / 2, -0.3, 0);
    g.add(deck);

    for (const z of [-0.7175, 0.7175]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(RUN + 600, 0.08, 0.075), mat(0x9aa3aa, 0.35));
      rail.position.set(deck.position.x, 0.08, z);
      g.add(rail);
    }

    const sleeperGeo = new THREE.BoxGeometry(0.26, 0.08, 2.6);
    const sleeperMat = mat(0x4a5056, 0.95);
    const nSleep = Math.floor((RUN + 600) / 10);
    const sleepers = new THREE.InstancedMesh(sleeperGeo, sleeperMat, nSleep);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < nSleep; i++) {
      m4.makeTranslation(600 - i * 10, 0.01, 0);
      sleepers.setMatrixAt(i, m4);
    }
    sleepers.instanceMatrix.needsUpdate = true;
    g.add(sleepers);

    const mastGeo = new THREE.BoxGeometry(0.18, 5.8, 0.18);
    const mastMat = mat(0x7d858c, 0.5);
    const nMast = Math.floor((RUN + 600) / 100) * 2;
    const masts = new THREE.InstancedMesh(mastGeo, mastMat, nMast);
    let k = 0;
    for (let i = 0; i < (RUN + 600) / 100; i++) {
      for (const z of [-5.1, 5.1]) {
        m4.makeTranslation(600 - i * 100 - 50, 2.9, z);
        masts.setMatrixAt(k++, m4);
      }
    }
    masts.instanceMatrix.needsUpdate = true;
    g.add(masts);

    for (const st of D.STATIONS) {
      const platform = new THREE.Mesh(new THREE.BoxGeometry(450, 1.1, 6.2), mat(0x6b737a, 0.9));
      platform.position.set(-st.x, 0.55, -6.8);
      g.add(platform);
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(450, 0.22, 14), mat(0xb9c1c7, 0.8));
      canopy.position.set(-st.x, 5.4, -6.8);
      g.add(canopy);
      for (let j = -5; j <= 5; j++) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.28, 4.8, 0.28), mat(0x8f979e, 0.6));
        col.position.set(-st.x + j * 40, 2.9, -6.8);
        g.add(col);
      }
    }

    scene.add(g);
    return g;
  }

  function decodeB64(b64) {
    const bin = atob(b64);
    const buf = new ArrayBuffer(bin.length);
    const u8 = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return buf;
  }

  function loadGltf(b64) {
    return new Promise((resolve, reject) => {
      try {
        const loader = new window.__HSR_LOADER();
        loader.parse(decodeB64(b64), '', resolve, reject);
      } catch (e) { reject(e); }
    });
  }

  async function buildTrain(scene) {
    const THREE = window.__HSR_THREE;
    const [headG, midG, tailG] = await Promise.all([
      loadGltf(window.__HSR_ASSETS.head),
      loadGltf(window.__HSR_ASSETS.middle),
      loadGltf(window.__HSR_ASSETS.merged || window.__HSR_ASSETS.head)
    ]);
    const root = new THREE.Group();
    root.name = 'HSR-MAIN-TRAIN';
    const HEAD = 25.7, MID = 25.5, GAP = 0.35;

    const head = headG.scene;
    head.visible = true;
    head.position.set(HEAD / 2, 0, 0);
    root.add(head);
    root.userData.doorNodes = [];
    head.traverse((o) => {
      if (o.isMesh && o.name && o.name.startsWith('GEO-door_')
          && !o.name.includes('frame') && !o.name.includes('window')) {
        root.userData.doorNodes.push({ node: o, y0: o.position.y, side: o.position.y >= 0 ? 1 : -1 });
      }
    });

    const middle = midG.scene;
    middle.updateMatrixWorld(true);
    const midMeshes = [];
    middle.traverse(o => { if (o.isMesh) midMeshes.push(o); });
    const carXs = [];
    let x = HEAD + GAP;
    for (let i = 0; i < 15; i++) { carXs.push(x + MID / 2); x += MID + GAP; }
    const cm = new THREE.Matrix4(), im = new THREE.Matrix4();
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
    }

    const tail = tailG.scene;
    tail.visible = true;
    tail.position.set(carXs[carXs.length - 1] + MID / 2 + GAP + HEAD / 2, 0, 0);
    tail.rotation.y = Math.PI;
    root.add(tail);

    scene.add(root);
    return root;
  }

  async function buildTrainScene() {
    const s = new THREE.Scene();
    buildHsrWorld(s);
    await buildTrain(s);
    return s;
  }

  function buildHsrScene() {
    const THREE = window.__HSR_THREE;
    const s = new THREE.Scene();
    buildHsrWorld(s);
    return s;
  }
  window.HSR_MAIN = { buildHsrWorld, buildTrain, buildTrainScene, buildHsrScene, THREE };
})();
