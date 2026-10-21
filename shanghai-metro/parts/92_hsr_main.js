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
  function buildHsrScene() {
    const THREE = window.__HSR_THREE;
    const s = new THREE.Scene();
    buildHsrWorld(s);
    return s;
  }
  window.HSR_MAIN = { buildHsrWorld, buildHsrScene, THREE };
})();
