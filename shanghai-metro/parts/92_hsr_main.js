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

    const wireMat = new THREE.LineBasicMaterial({ color: 0x4a555e });
    for (const z of [-0.32, 0.32]) {
      const pts = [new THREE.Vector3(600, 7.2, z), new THREE.Vector3(-RUN, 7.2, z)];
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat);
      g.add(line);
    }
    const sigPost = new THREE.MeshStandardMaterial({ color: 0x7d858c, metalness: 0.6, roughness: 0.45 });
    const sigHead = new THREE.MeshStandardMaterial({ color: 0x161b1f, roughness: 0.7 });
    const sigGreen = new THREE.MeshStandardMaterial({ color: 0x1f8a4c, emissive: 0x1f8a4c, emissiveIntensity: 1.5 });
    g.userData.signals = [];
    for (const st of D.STATIONS) {
      const label = stationLabel(st.name);
      label.position.set(-st.x + 220, 6.5, -5.6);
      g.add(label);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 4.2, 0.16), sigPost);
      post.position.set(-st.x + 180, 2.1, 5.9); g.add(post);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.32), sigHead);
      head.position.set(-st.x + 180, 4.5, 5.9); g.add(head);
      const lampMat = sigGreen.clone();
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), lampMat);
      lamp.position.set(-st.x + 180, 4.75, 5.72); g.add(lamp);
      g.userData.signals.push({ x: -st.x + 180, lamp });
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


  function liveryTexture() {
    const c = document.createElement('canvas');
    c.width = 2048; c.height = 256;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 2048, 256);
    const band = (y0, y1, color, lift) => {
      g.strokeStyle = color; g.lineWidth = y1 - y0; g.lineCap = 'butt';
      g.beginPath(); g.moveTo(0, y0 + lift);
      g.bezierCurveTo(210, y0 + lift, 320, y0, 560, y0);
      g.lineTo(2048, y0); g.stroke();
    };
    band(150, 230, '#c8102e', 34);
    band(126, 146, '#e87722', 24);
    band(112, 122, '#c9a227', 18);
    g.fillStyle = '#15181a';
    g.font = '700 54px system-ui, sans-serif';
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('CR400AF-BS-2341', 1120, 52);
    g.fillStyle = '#c8102e';
    g.font = '600 32px "Microsoft YaHei", sans-serif';
    g.fillText('复兴号', 1120, 102);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  function liveryRibbonGeometry() {
    const N = 64, z0 = 1.50, z1 = 2.40;
    const pos = [], uv = [], idx = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i <= N; i++) {
        const x = -12.7 + (25.4 * i) / N;
        const nose = Math.max(0, (-x - 8) / 4.7);
        const w = 1.72 * (1 - 0.45 * Math.pow(nose, 1.3)) + 0.012;
        pos.push(x, z0, side * w, x, z1, side * w);
        const u = side > 0 ? i / N : 1 - i / N;
        uv.push(u, 0, u, 1);
        if (i < N) {
          const a = i * 2 + (side > 0 ? 0 : (N + 1) * 2);
          const b = a + 1, c = a + 2, d = a + 3;
          if (side > 0) idx.push(a, b, c, b, d, c);
          else idx.push(a, c, b, b, c, d);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }


  function stationLabel(name) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(6,10,14,.88)'; g.fillRect(0, 0, 512, 128);
    g.strokeStyle = '#c8102e'; g.lineWidth = 6; g.strokeRect(3, 3, 506, 122);
    g.font = '700 64px "Microsoft YaHei", "PingFang SC", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f2f7fa';
    g.fillText(name, 256, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthTest: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(30, 7.5), m);
    mesh.rotation.y = -Math.PI / 2;
    mesh.renderOrder = 10;
    mesh.frustumCulled = false;
    return mesh;
  }


  function buildCab() {
    const g = new THREE.Group();
    g.name = 'HSR-MAIN-CAB';
    const dark = new THREE.MeshStandardMaterial({ color: 0x151b20, roughness: 0.82, metalness: 0.12 });
    const mid = new THREE.MeshStandardMaterial({ color: 0x2a333a, roughness: 0.7, metalness: 0.18 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x3c474f, roughness: 0.55, metalness: 0.25 });
    const black = new THREE.MeshStandardMaterial({ color: 0x070b0e, roughness: 0.9 });
    const add = (geo, mat, x, y, z, rx, ry, rz) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
      if (rx) m.rotation.x = rx; if (ry) m.rotation.y = ry; if (rz) m.rotation.z = rz;
      g.add(m); return m;
    };
    const screen = (title, value, sub) => {
      const c = document.createElement('canvas'); c.width = 320; c.height = 180;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#04121a'; ctx.fillRect(0, 0, 320, 180);
      ctx.strokeStyle = '#2a7a96'; ctx.lineWidth = 5; ctx.strokeRect(5, 5, 310, 170);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#86c6dd'; ctx.font = '600 22px ui-monospace,monospace';
      ctx.fillText(title, 160, 38);
      ctx.fillStyle = '#e8f7ff'; ctx.font = '800 46px ui-monospace,monospace';
      ctx.fillText(value, 160, 100);
      ctx.fillStyle = '#8fe06a'; ctx.font = '600 22px ui-monospace,monospace';
      ctx.fillText(sub, 160, 148);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshBasicMaterial({ map: t });
    };
    const makeDmi = (x, y, z, w, h, mat, tilt) => {
      add(new THREE.BoxGeometry(0.06, h + 0.06, w + 0.06), dark, x, y, z);
      const sc = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      sc.position.set(x + 0.04, y, z); sc.rotation.y = Math.PI / 2; sc.rotation.x = tilt;
      g.add(sc);
    };
    // shell
    add(new THREE.BoxGeometry(4.4, 0.14, 2.75), dark, 5.2, 1.25, 0);
    add(new THREE.BoxGeometry(4.4, 0.12, 2.75), dark, 5.2, 3.95, 0);
    add(new THREE.BoxGeometry(4.4, 2.7, 0.12), dark, 5.2, 2.65, -1.36);
    add(new THREE.BoxGeometry(4.4, 2.7, 0.12), dark, 5.2, 2.65, 1.36);
    add(new THREE.BoxGeometry(0.12, 2.7, 2.8), dark, 7.35, 2.65, 0);
    // windshield frame
    add(new THREE.BoxGeometry(0.16, 1.85, 0.16), trim, 3.0, 3.15, -1.18);
    add(new THREE.BoxGeometry(0.16, 1.85, 0.16), trim, 3.0, 3.15, 1.18);
    add(new THREE.BoxGeometry(0.18, 0.16, 2.55), trim, 3.0, 4.02, 0);
    add(new THREE.BoxGeometry(0.18, 0.14, 2.55), dark, 3.0, 2.18, 0);
    // sun visor
    add(new THREE.BoxGeometry(0.32, 0.16, 2.45), black, 3.45, 3.82, 0, 0, 0, -0.12);
    // wipers
    const wiper = new THREE.CylinderGeometry(0.018, 0.018, 0.85, 8);
    const w1 = add(wiper, black, 3.08, 2.42, -0.5); w1.rotation.z = 1.05;
    const w2 = add(wiper, black, 3.08, 2.42, 0.55); w2.rotation.z = 1.15;
    // main desk
    add(new THREE.BoxGeometry(1.15, 0.58, 2.6), mid, 4.42, 2.02, 0);
    add(new THREE.BoxGeometry(1.3, 0.09, 2.72), trim, 4.35, 2.34, 0);
    add(new THREE.BoxGeometry(0.6, 0.3, 2.8), dark, 4.9, 1.8, 0);
    // DMI screens
    makeDmi(4.02, 2.58, -0.52, 0.52, 0.36, screen('DMI-1', '0', 'ATP 350'), -0.1);
    makeDmi(4.02, 2.58, 0.52, 0.52, 0.36, screen('DMI-2', '南京南', '1017.9 km'), -0.1);
    makeDmi(4.03, 2.43, 0.0, 0.28, 0.20, screen('G25', '待发', '车门关闭'), -0.08);
    // left/right consoles and levers
    add(new THREE.BoxGeometry(1.6, 0.28, 0.42), mid, 5.05, 2.02, -1.05);
    add(new THREE.BoxGeometry(1.6, 0.28, 0.42), mid, 5.05, 2.02, 1.05);
    const lever = new THREE.CylinderGeometry(0.035, 0.035, 0.45, 10);
    const knob = new THREE.SphereGeometry(0.075, 12, 8);
    const l1 = add(lever, trim, 4.6, 2.38, -1.05, 0, 0, 0.2);
    add(knob, trim, 4.68, 2.58, -1.05);
    const l2 = add(lever, trim, 4.6, 2.38, 1.05, 0, 0, -0.2);
    add(knob, trim, 4.68, 2.58, 1.05);
    // button clusters
    const btnMat = new THREE.MeshStandardMaterial({ color: 0x1b2328, emissive: 0x0e3b2a, emissiveIntensity: 0.4 });
    for (let i = 0; i < 6; i++) {
      add(new THREE.BoxGeometry(0.05, 0.04, 0.06), btnMat, 4.75, 2.2, -0.55 + i * 0.07);
    }
    // seat
    add(new THREE.BoxGeometry(0.55, 0.16, 0.55), dark, 6.55, 1.75, 0.55);
    add(new THREE.BoxGeometry(0.18, 0.9, 0.55), dark, 6.85, 2.3, 0.55);
    // interior light
    const lamp = new THREE.PointLight(0xcfe6f2, 0.9, 9, 2); lamp.position.set(5.2, 3.6, 0); g.add(lamp);
    return g;
  }

  async function buildTrain(scene) {
    const THREE = window.__HSR_THREE;
    const [headG, midG] = await Promise.all([
      loadGltf(window.__HSR_ASSETS.head),
      loadGltf(window.__HSR_ASSETS.middle)
    ]);
    const root = new THREE.Group();
    root.name = 'HSR-MAIN-TRAIN';
    const HEAD = 25.7, MID = 25.5, GAP = 0.35;

    const head = headG.scene;
    head.visible = true;
    head.position.set(HEAD / 2, 0, 0);
    root.add(head);
    const liveryGeo = liveryRibbonGeometry();
    const liveryMat = new THREE.MeshBasicMaterial({ map: liveryTexture(), side: THREE.DoubleSide, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const headLivery = new THREE.Mesh(liveryGeo, liveryMat);
    headLivery.position.x = HEAD / 2;
    headLivery.renderOrder = 2;
    root.add(headLivery);
    root.userData.doorNodes = [];
    root.userData.midDoors = [];
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
      if (mesh.name && mesh.name.startsWith('M-door_') && !mesh.name.includes('frame') && !mesh.name.includes('win')) {
        root.userData.midDoors.push({
          inst,
          side: mesh.name.includes('_-1_') ? -1 : 1,
          carXs: carXs.slice(),
          world: mesh.matrixWorld.clone()
        });
      }
    }

    const tail = headG.scene.clone(true);
    tail.visible = true;
    tail.position.set(carXs[carXs.length - 1] + MID / 2 + GAP + HEAD / 2, 0, 0);
    tail.rotation.y = Math.PI;
    root.add(tail);
    tail.traverse((o) => {
      if (o.isMesh && o.name && o.name.startsWith('GEO-door_')
          && !o.name.includes('frame') && !o.name.includes('window')) {
        root.userData.doorNodes.push({ node: o, y0: o.position.y, side: o.position.y >= 0 ? 1 : -1 });
      }
    });
    const tailLivery = new THREE.Mesh(liveryGeo, liveryMat);
    tailLivery.position.x = tail.position.x;
    tailLivery.rotation.y = Math.PI;
    tailLivery.renderOrder = 2;
    root.add(tailLivery);

    const midLivery = new THREE.InstancedMesh(liveryGeo, liveryMat, carXs.length);
    const lm = new THREE.Matrix4();
    for (let i = 0; i < carXs.length; i++) { lm.makeTranslation(carXs[i], 0, 0); midLivery.setMatrixAt(i, lm); }
    midLivery.instanceMatrix.needsUpdate = true;
    midLivery.frustumCulled = false;
    midLivery.renderOrder = 2;
    root.add(midLivery);

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
  window.HSR_MAIN = { buildHsrWorld, buildTrain, buildTrainScene, buildHsrScene, buildCab, THREE };
})();
