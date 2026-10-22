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
      const roofL = new THREE.Mesh(new THREE.BoxGeometry(450, 0.16, 4.4), mat(0xb9c1c7, 0.8));
      roofL.position.set(-st.x, 5.65, -12.1); roofL.rotation.x = 0.14; g.add(roofL);
      const roofR = new THREE.Mesh(new THREE.BoxGeometry(450, 0.16, 4.4), mat(0xb9c1c7, 0.8));
      roofR.position.set(-st.x, 5.65, -8.3); roofR.rotation.x = -0.14; g.add(roofR);
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(450, 0.18, 0.45), mat(0x9aa4ab, 0.6));
      ridge.position.set(-st.x, 5.92, -10.2); g.add(ridge);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(450, 0.05, 0.22), mat(0xd8b53a, 0.8));
      edge.position.set(-st.x, 1.13, -3.62); g.add(edge);
      const bldg = new THREE.Mesh(new THREE.BoxGeometry(110, 8.2, 8), mat(0x8f99a1, 0.85));
      bldg.position.set(-st.x, 4.1, -18.5); g.add(bldg);
      const winMat = new THREE.MeshStandardMaterial({ color: 0x2a3942, emissive: 0x1a2a33, emissiveIntensity: 0.35, roughness: 0.4 });
      for (let w = -4; w <= 4; w++) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(7, 1.4, 0.12), winMat);
        win.position.set(-st.x + w * 11, 5.2, -14.45); g.add(win);
      }
      for (let j = -5; j <= 5; j++) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.28, 4.8, 0.28), mat(0x8f979e, 0.6));
        col.position.set(-st.x + j * 40, 2.9, -10.2);
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
      label.position.set(-st.x + 220, 4.75, -5.35);
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
    const wall = new THREE.MeshStandardMaterial({ color: 0xd5dade, roughness: 0.8, metalness: 0.04 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x8d9398, roughness: 0.95 });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0xa89a84, roughness: 0.9 });
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
      const m = new THREE.MeshBasicMaterial({ map: t });
      m.userData = { canvas: c, ctx };
      return m;
    };
    const makeDmi = (x, y, z, w, h, mat, tilt) => {
      add(new THREE.BoxGeometry(0.06, h + 0.06, w + 0.06), dark, x, y, z);
      const sc = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      sc.position.set(x + 0.10, y, z); sc.rotation.y = Math.PI / 2 - z * 0.22; sc.rotation.x = 0;
      g.add(sc);
    };
    // shell
    add(new THREE.BoxGeometry(4.4, 0.14, 2.75), floorMat, 5.2, 1.25, 0);
    add(new THREE.BoxGeometry(4.4, 0.12, 2.75), wall, 5.2, 3.95, 0);
    for (const z of [-1.36, 1.36]) {
      add(new THREE.BoxGeometry(4.4, 0.9, 0.12), wall, 5.2, 1.7, z);
      add(new THREE.BoxGeometry(4.4, 0.55, 0.12), wall, 5.2, 3.62, z);
      add(new THREE.BoxGeometry(0.35, 2.7, 0.12), wall, 3.2, 2.65, z);
      add(new THREE.BoxGeometry(0.35, 2.7, 0.12), wall, 7.0, 2.65, z);
    }
    const glassMat = new THREE.MeshBasicMaterial({ color: 0xbcd8e8, transparent: true, opacity: 0.10, depthWrite: false, side: THREE.DoubleSide });
    for (const z of [-1.35, 1.35]) {
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.1), glassMat);
      glass.position.set(5.1, 2.75, z);
      if (z < 0) glass.rotation.y = Math.PI;
      g.add(glass);
    }
    const shield = new THREE.Mesh(new THREE.PlaneGeometry(2.35, 1.75), glassMat);
    shield.position.set(3.06, 3.12, 0); shield.rotation.y = Math.PI / 2; g.add(shield);
    add(new THREE.BoxGeometry(0.12, 2.7, 2.8), wall, 7.35, 2.65, 0);
    // windshield frame
    add(new THREE.BoxGeometry(0.16, 1.85, 0.16), wall, 3.0, 3.15, -1.18);
    add(new THREE.BoxGeometry(0.16, 1.85, 0.16), wall, 3.0, 3.15, 1.18);
    add(new THREE.BoxGeometry(0.18, 0.16, 2.55), wall, 3.0, 4.02, 0);
    add(new THREE.BoxGeometry(0.18, 0.14, 2.55), dark, 3.0, 2.18, 0);
    // sun visor
    add(new THREE.BoxGeometry(0.32, 0.16, 2.45), black, 3.45, 3.82, 0, 0, 0, -0.12);
    // wipers
    const wiper = new THREE.CylinderGeometry(0.018, 0.018, 0.85, 8);
    const w1 = add(wiper, black, 3.08, 2.42, -0.5); w1.rotation.z = 1.05;
    const w2 = add(wiper, black, 3.08, 2.42, 0.55); w2.rotation.z = 1.15;
    // curved wrap-around desk (arc segments around the driver)
    const DCX = 6.10, DR = 1.85, DN = 8;
    for (let i = 0; i < DN; i++) {
      const a = Math.PI - 0.85 + (i / (DN - 1)) * 1.70;
      const dx = DCX + DR * Math.cos(a);
      const dz = DR * Math.sin(a);
      add(new THREE.BoxGeometry(0.62, 0.09, 0.48), trim, dx, 2.31, dz, 0, -a, 0);
      add(new THREE.BoxGeometry(0.38, 0.64, 0.48), mid, dx + 0.10 * Math.cos(a), 1.98, dz + 0.10 * Math.sin(a), 0, -a, 0);
      add(new THREE.BoxGeometry(0.40, 0.05, 0.44), trim, dx, 2.36, dz, 0, -a, 0);
    }
    // dashboard face panel + cowl so screens are mounted, not floating
    add(new THREE.BoxGeometry(0.12, 0.54, 2.36), mid, 3.78, 2.48, 0);
    // DMI screens
    const dmi1 = screen('DMI-1', '0', 'ATP 350');
    const dmi2 = screen('DMI-2', '南京南', '1017.9 km');
    const dmi3 = screen('G25', '待发', '车门关闭');
    const dmiG = screen('仪表', '25.0', 'kV · 正常');
    makeDmi(3.82, 2.60, -0.90, 0.42, 0.30, dmi1, 0);
    makeDmi(3.82, 2.60, -0.30, 0.42, 0.30, dmi2, 0);
    makeDmi(3.82, 2.60, 0.30, 0.42, 0.30, dmi3, 0);
    makeDmi(3.82, 2.60, 0.90, 0.42, 0.30, dmiG, 0);
    g.userData.dmis = [dmi1, dmi2, dmi3, dmiG];
    // left/right consoles and levers
    add(new THREE.BoxGeometry(1.6, 0.28, 0.42), mid, 5.05, 2.02, -1.05);
    add(new THREE.BoxGeometry(1.6, 0.28, 0.42), mid, 5.05, 2.02, 1.05);
    const lever = new THREE.CylinderGeometry(0.035, 0.035, 0.45, 10);
    const knob = new THREE.SphereGeometry(0.075, 12, 8);
    const l1 = add(lever, trim, 4.6, 2.38, -1.05, 0, 0, 0.2);
    add(knob, trim, 4.68, 2.58, -1.05);
    const l2 = add(lever, trim, 4.6, 2.38, 1.05, 0, 0, -0.2);
    add(knob, trim, 4.68, 2.58, 1.05);
    g.userData.levers = [l1, l2];
    // button clusters
    const btnMat = new THREE.MeshStandardMaterial({ color: 0x1b2328, emissive: 0x0e3b2a, emissiveIntensity: 0.4 });
    for (let i = 0; i < 6; i++) {
      add(new THREE.BoxGeometry(0.05, 0.04, 0.06), btnMat, 4.75, 2.2, -0.55 + i * 0.07);
    }
    // seat
    add(new THREE.BoxGeometry(0.55, 0.16, 0.55), seatMat, 6.95, 1.75, 0.55);
    add(new THREE.BoxGeometry(0.18, 0.9, 0.55), seatMat, 7.15, 2.3, 0.55);
    add(new THREE.BoxGeometry(0.22, 0.34, 0.46), seatMat, 7.15, 3.12, 0.55);
    add(new THREE.BoxGeometry(0.42, 0.08, 0.16), seatMat, 6.82, 1.98, 0.18);
    add(new THREE.BoxGeometry(0.42, 0.08, 0.16), seatMat, 6.82, 1.98, 0.92);
    // wrap-around side consoles
    add(new THREE.BoxGeometry(1.4, 0.20, 0.46), mid, 5.05, 2.05, -1.10, 0, 0.22, 0);
    add(new THREE.BoxGeometry(1.4, 0.20, 0.46), mid, 5.05, 2.05, 1.10, 0, -0.22, 0);
    add(new THREE.BoxGeometry(0.9, 0.10, 2.3), wall, 3.55, 3.72, 0);
    const conBtn = new THREE.MeshStandardMaterial({ color: 0x1b2328, emissive: 0x3a1a0a, emissiveIntensity: 0.35 });
    for (let i = 0; i < 6; i++) {
      add(new THREE.BoxGeometry(0.05, 0.035, 0.07), conBtn, 5.02, 2.20, -1.18 + i * 0.09);
      add(new THREE.BoxGeometry(0.05, 0.035, 0.07), conBtn, 5.02, 2.20, 0.82 + i * 0.09);
    }
    const swMat = new THREE.MeshStandardMaterial({ color: 0x1a2228, emissive: 0x7a4a12, emissiveIntensity: 0.4 });
    for (let i = 0; i < 11; i++) add(new THREE.BoxGeometry(0.05, 0.035, 0.07), swMat, 3.52, 3.64, -0.8 + i * 0.16);
    const redMat = new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.45, metalness: 0.2 });
    add(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 16), redMat, 4.22, 2.40, 0.0);
    const cir = screen('CIR', '--', '无线');
    const cirMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.18), cir);
    cirMesh.position.set(5.02, 2.36, -1.12); cirMesh.rotation.y = Math.PI / 2 + 0.35; g.add(cirMesh);
    add(new THREE.BoxGeometry(1.4, 0.06, 0.9), new THREE.MeshStandardMaterial({ color: 0x2f6f9e, roughness: 0.9 }), 5.15, 1.33, 0);
    // ceiling light strips
    const litMat = new THREE.MeshStandardMaterial({ color: 0xe8f4ff, emissive: 0xddefff, emissiveIntensity: 1.2 });
    add(new THREE.BoxGeometry(1.8, 0.035, 0.10), litMat, 5.2, 3.88, -0.42);
    add(new THREE.BoxGeometry(1.8, 0.035, 0.10), litMat, 5.2, 3.88, 0.42);
    // side window frames
    for (const z of [-1.36, 1.36]) {
      add(new THREE.BoxGeometry(2.2, 0.06, 0.08), dark, 5.1, 2.22, z);
      add(new THREE.BoxGeometry(2.2, 0.06, 0.08), dark, 5.1, 3.34, z);
      add(new THREE.BoxGeometry(0.06, 1.16, 0.08), dark, 4.02, 2.78, z);
      add(new THREE.BoxGeometry(0.06, 1.16, 0.08), dark, 6.18, 2.78, z);
    }
    // sun visors
    add(new THREE.BoxGeometry(0.30, 0.10, 0.86), black, 3.36, 3.72, -0.62, 0, 0, -0.14);
    add(new THREE.BoxGeometry(0.30, 0.10, 0.86), black, 3.36, 3.72, 0.62, 0, 0, -0.14);
    // rear partition door behind the seat
    add(new THREE.BoxGeometry(0.07, 2.15, 0.92), mid, 7.28, 2.55, 0.55);
    const doorGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.75), glassMat);
    doorGlass.position.set(7.24, 2.95, 0.55); doorGlass.rotation.y = -Math.PI / 2; g.add(doorGlass);
    add(new THREE.BoxGeometry(0.16, 0.05, 0.16), trim, 7.22, 2.35, 0.95);
    add(new THREE.BoxGeometry(0.08, 0.22, 0.08), trim, 7.22, 2.2, 0.15);
    // left/right raised switch panels
    add(new THREE.BoxGeometry(0.08, 0.30, 0.72), mid, 4.98, 2.28, -1.05);
    add(new THREE.BoxGeometry(0.08, 0.30, 0.72), mid, 4.98, 2.28, 1.05);
    for (let i = 0; i < 4; i++) {
      add(new THREE.BoxGeometry(0.04, 0.04, 0.05), conBtn, 4.94, 2.32, -1.28 + i * 0.14);
      add(new THREE.BoxGeometry(0.04, 0.04, 0.05), conBtn, 4.94, 2.32, 0.78 + i * 0.14);
    }
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
