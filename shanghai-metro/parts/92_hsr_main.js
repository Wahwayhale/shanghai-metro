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

    const deck = new THREE.Mesh(new THREE.BoxGeometry(RUN + 600, 0.6, 18), mat(0x8f969b, 0.95));
    deck.position.set(600 - (RUN + 600) / 2, -0.3, 0);
    g.add(deck);

    for (const z of [-0.7175, 0.7175]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(RUN + 600, 0.08, 0.075), mat(0x9aa3aa, 0.35));
      rail.position.set(deck.position.x, 0.12, z);
      g.add(rail);
    }

    const m4 = new THREE.Matrix4();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(RUN + 600, 0.10, 3.4), mat(0xc6cacc, 0.9));
    slab.position.set(deck.position.x, 0.01, 0); g.add(slab);
    const nBal = Math.floor((RUN + 600) / 1000);
    const balises = new THREE.InstancedMesh(new THREE.BoxGeometry(0.38, 0.06, 0.38), new THREE.MeshStandardMaterial({ color: 0xe8c84a, emissive: 0x3a2a00, emissiveIntensity: 0.3, roughness: 0.6 }), nBal);
    const mBal = new THREE.Matrix4();
    for (let i = 0; i < nBal; i++) { mBal.makeTranslation(600 - i * 1000, 0.09, 0); balises.setMatrixAt(i, mBal); }
    balises.instanceMatrix.needsUpdate = true; g.add(balises);
    const contactWireMat = new THREE.MeshStandardMaterial({ color: 0x30363a, metalness: 0.8, roughness: 0.4 });
    for (const wy of [5.35, 5.95]) {
      const wire = new THREE.Mesh(new THREE.BoxGeometry(RUN + 600, 0.025, 0.025), contactWireMat);
      wire.position.set(deck.position.x, wy, 0); g.add(wire);
    }
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

    const mg = scene.getObjectByName('main-ground'); if (mg) mg.visible = false;
    const tc = document.createElement('canvas'); tc.width = 512; tc.height = 512;
    const tg = tc.getContext('2d'); tg.fillStyle = '#6f7c66'; tg.fillRect(0, 0, 512, 512);
    const cols = ['#7f8f5f', '#8d9a6a', '#657a55', '#a0a77a', '#5f7250'];
    for (let i = 0; i < 60; i++) { tg.fillStyle = cols[i % cols.length]; tg.fillRect((i * 97) % 512, (i * 53) % 512, 40 + (i % 5) * 12, 24 + (i % 4) * 10); }
    tg.strokeStyle = '#9a9f95'; tg.lineWidth = 3;
    for (let i = 0; i < 6; i++) { tg.beginPath(); tg.moveTo(0, 30 + i * 80); tg.lineTo(512, 10 + i * 80); tg.stroke(); }
    const ttex = new THREE.CanvasTexture(tc); ttex.colorSpace = THREE.SRGBColorSpace; ttex.wrapS = ttex.wrapT = THREE.RepeatWrapping; ttex.repeat.set(40, 40);
    const terrain = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ map: ttex, color: 0xffffff, roughness: 0.95 }));
    terrain.rotation.x = -Math.PI / 2; terrain.position.set(600, -12, 0); g.add(terrain);
    const girder = new THREE.Mesh(new THREE.BoxGeometry(RUN + 600, 1.4, 12), mat(0xa8adb0, 0.9));
    girder.position.set(deck.position.x, -1.3, 0); g.add(girder);
    const nPier = Math.floor((RUN + 600) / 64);
    const piers = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 9.8, 4.4), mat(0x9aa0a4, 0.9), nPier);
    const mPier = new THREE.Matrix4();
    for (let i = 0; i < nPier; i++) { mPier.makeTranslation(600 - i * 64, -5.5, 0); piers.setMatrixAt(i, mPier); }
    piers.instanceMatrix.needsUpdate = true; g.add(piers);
    const approachMats = [500, 250, 80].map(d => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 160;
      const g2 = c.getContext('2d'); g2.fillStyle = '#0b3f8a'; g2.fillRect(0, 0, 512, 160);
      g2.strokeStyle = '#ffffff'; g2.lineWidth = 8; g2.strokeRect(4, 4, 504, 152);
      g2.fillStyle = '#ffffff'; g2.font = '800 62px "Microsoft YaHei", sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
      g2.fillText('停车标 ' + d + 'm', 256, 84);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide });
    });
    const carColors = ['#2f6fd0', '#e8c84a', '#2f9e5a', '#8e5bd0'];
    const carMarkerMats = [];
    for (let n = 1; n <= 17; n++) {
      const mc = document.createElement('canvas'); mc.width = 256; mc.height = 128;
      const mg2 = mc.getContext('2d'); mg2.fillStyle = carColors[(n - 1) % 4]; mg2.fillRect(0, 0, 256, 128);
      mg2.strokeStyle = '#ffffff'; mg2.lineWidth = 6; mg2.strokeRect(4, 4, 248, 120);
      mg2.fillStyle = '#ffffff'; mg2.font = '800 64px "Microsoft YaHei", sans-serif'; mg2.textAlign = 'center'; mg2.textBaseline = 'middle';
      mg2.fillText(n + '车', 128, 68);
      const mt = new THREE.CanvasTexture(mc); mt.colorSpace = THREE.SRGBColorSpace;
      carMarkerMats.push(new THREE.MeshBasicMaterial({ map: mt, side: THREE.DoubleSide }));
    }
    const infoC = document.createElement('canvas'); infoC.width = 512; infoC.height = 96;
    const ig = infoC.getContext('2d'); ig.fillStyle = '#0b1b2a'; ig.fillRect(0, 0, 512, 96);
    ig.strokeStyle = '#2a7a96'; ig.lineWidth = 4; ig.strokeRect(2, 2, 508, 92);
    ig.fillStyle = '#ffd479'; ig.font = '700 28px "Microsoft YaHei", sans-serif'; ig.textAlign = 'left'; ig.textBaseline = 'middle';
    ig.fillText('G25  终到 上海虹桥', 18, 32);
    ig.fillStyle = '#cfe0ea'; ig.font = '600 20px "Microsoft YaHei", sans-serif';
    ig.fillText('开点 20:16  ·  6 站台  ·  1-16 车厢方向 →', 18, 68);
    const infoTex = new THREE.CanvasTexture(infoC); infoTex.colorSpace = THREE.SRGBColorSpace;
    const infoMat = new THREE.MeshBasicMaterial({ map: infoTex, side: THREE.DoubleSide });
    for (const st of D.STATIONS) {
      const stBase = new THREE.Mesh(new THREE.BoxGeometry(450, 11.8, 30), mat(0x9aa0a4, 0.9));
      stBase.position.set(-st.x, -5.9, -14); g.add(stBase);
      const platform = new THREE.Mesh(new THREE.BoxGeometry(450, 1.25, 12), mat(0x6b737a, 0.9));
      platform.position.set(-st.x, 0.625, -7.5);
      g.add(platform);
      for (let mi = 0; mi < 18; mi++) {
        const marker = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.68), carMarkerMats[Math.min(16, mi)]);
        marker.position.set(-st.x + (mi - 8.5) * 25, 1.285, -3.35);
        marker.rotation.x = -Math.PI / 2; g.add(marker);
      }
      [500, 250, 80].forEach((d, di) => {
        const ab = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.15), approachMats[di]);
        ab.position.set(-st.x - d, 3.0, -2.15); ab.rotation.y = -Math.PI / 2; g.add(ab);
      });
      const stopC = document.createElement('canvas'); stopC.width = 512; stopC.height = 128;
      const sg = stopC.getContext('2d'); sg.fillStyle = '#0b3f8a'; sg.fillRect(0, 0, 512, 128);
      sg.strokeStyle = '#ffffff'; sg.lineWidth = 6; sg.strokeRect(3, 3, 506, 122);
      sg.fillStyle = '#ffffff'; sg.font = '800 44px "Microsoft YaHei", sans-serif'; sg.textAlign = 'center'; sg.textBaseline = 'middle';
      sg.fillText('16辆 / 17辆动车组停车位置标', 256, 66);
      const stopTex = new THREE.CanvasTexture(stopC); stopTex.colorSpace = THREE.SRGBColorSpace;
      const stopBoard = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.0), new THREE.MeshBasicMaterial({ map: stopTex, side: THREE.DoubleSide }));
      stopBoard.position.set(-st.x + 12, 2.3, -1.95); stopBoard.rotation.y = -Math.PI / 2; g.add(stopBoard);
      const gantry = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.8), new THREE.MeshBasicMaterial({ map: stopTex, side: THREE.DoubleSide }));
      gantry.position.set(-st.x + 14, 4.55, 0); gantry.rotation.y = -Math.PI / 2; g.add(gantry);

      for (let ii = -4; ii <= 4; ii++) {
        const info = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.64), infoMat);
        info.position.set(-st.x + ii * 50, 6.4, -7.5); g.add(info);
      }

      const fascia = stationLabel(st.name);
      fascia.position.set(-st.x, 4.70, -10.15); fascia.rotation.y = 0; fascia.scale.set(0.20, 0.20, 1); g.add(fascia);
      const appName = stationLabel(st.name);
      appName.position.set(-st.x - 30, 3.2, -4.2); appName.rotation.y = Math.PI / 2; appName.scale.set(0.35, 0.35, 1); g.add(appName);
      const platC = document.createElement('canvas'); platC.width = 256; platC.height = 96;
      const pg2 = platC.getContext('2d'); pg2.fillStyle = '#0b3f8a'; pg2.fillRect(0, 0, 256, 96);
      pg2.strokeStyle = '#ffffff'; pg2.lineWidth = 5; pg2.strokeRect(3, 3, 250, 90);
      const pn = ((D.STATIONS.indexOf(st) % 6) + 1);
      pg2.fillStyle = '#ffffff'; pg2.font = '800 40px "Microsoft YaHei", sans-serif'; pg2.textAlign = 'center'; pg2.textBaseline = 'middle';
      pg2.fillText(pn + ' 站台', 128, 38);
      pg2.font = '500 20px system-ui, sans-serif'; pg2.fillStyle = '#cfe0ea'; pg2.fillText('Platform ' + pn, 128, 72);
      const platTex = new THREE.CanvasTexture(platC); platTex.colorSpace = THREE.SRGBColorSpace;
      const platSign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.82), new THREE.MeshBasicMaterial({ map: platTex, side: THREE.DoubleSide }));
      platSign.position.set(-st.x - 24, 2.25, -3.3); platSign.rotation.y = Math.PI / 2; g.add(platSign);
      const roofL = new THREE.Mesh(new THREE.BoxGeometry(450, 0.16, 5.5), mat(0xb9c1c7, 0.8));
      roofL.position.set(-st.x, 8.2, -11.0); roofL.rotation.x = 0.14; g.add(roofL);
      const roofR = new THREE.Mesh(new THREE.BoxGeometry(450, 0.16, 5.5), mat(0xb9c1c7, 0.8));
      roofR.position.set(-st.x, 8.2, -4.0); roofR.rotation.x = -0.14; g.add(roofR);
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(450, 0.18, 0.45), mat(0x9aa4ab, 0.6));
      ridge.position.set(-st.x, 8.47, -7.5); g.add(ridge);
      for (let r = -3; r <= 3; r++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 12.0), mat(0x8f979e, 0.6));
        rib.position.set(-st.x + r * 60, 7.91, -7.5); g.add(rib);
      }
      const lampMat = new THREE.MeshStandardMaterial({ color: 0xf4fbff, emissive: 0xeaf6ff, emissiveIntensity: 1.4 });
      for (let l = -2; l <= 2; l++) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.18), lampMat);
        lamp.position.set(-st.x + l * 80, 7.4, -7.5); g.add(lamp);
      }
      for (const bo of [-120, 0, 120]) {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.38, 0.55), mat(0x4d575f, 0.8));
        bench.position.set(-st.x + bo, 1.55, -6.5); g.add(bench);
      }
      for (const px of [-120, 0, 120]) {
        const nc = document.createElement('canvas'); nc.width = 128; nc.height = 128;
        const ng = nc.getContext('2d'); ng.fillStyle = '#f4f6f7'; ng.fillRect(0, 0, 128, 128);
        ng.strokeStyle = '#c8102e'; ng.lineWidth = 10; ng.strokeRect(5, 5, 118, 118);
        ng.fillStyle = '#111416'; ng.font = '800 78px system-ui, sans-serif'; ng.textAlign = 'center'; ng.textBaseline = 'middle'; ng.fillText('1', 64, 68);
        const nt = new THREE.CanvasTexture(nc); nt.colorSpace = THREE.SRGBColorSpace;
        const np = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: nt, side: THREE.DoubleSide }));
        np.position.set(-st.x + px, 3.15, -9.78); g.add(np);
      }
      const dbC = document.createElement('canvas'); dbC.width = 512; dbC.height = 128;
      const db = dbC.getContext('2d'); db.fillStyle = '#0b1218'; db.fillRect(0, 0, 512, 128);
      db.strokeStyle = '#c8102e'; db.lineWidth = 8; db.strokeRect(4, 4, 504, 120);
      db.fillStyle = '#f2f7fa'; db.font = '700 40px "Microsoft YaHei", sans-serif'; db.textAlign = 'center'; db.textBaseline = 'middle';
      db.fillText('G25  北京南 → 上海虹桥  17:00', 256, 66);
      const dbTex = new THREE.CanvasTexture(dbC); dbTex.colorSpace = THREE.SRGBColorSpace;
      const dbMesh = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), new THREE.MeshBasicMaterial({ map: dbTex, transparent: true, side: THREE.DoubleSide }));
      dbMesh.position.set(-st.x + 160, 4.2, -5.4); dbMesh.rotation.y = Math.PI / 2; g.add(dbMesh);
      const whiteLine = new THREE.Mesh(new THREE.BoxGeometry(450, 0.04, 0.08), mat(0xf2f4f5, 0.8));
      whiteLine.position.set(-st.x, 1.27, -2.55); g.add(whiteLine);
      const tactile = new THREE.Mesh(new THREE.BoxGeometry(450, 0.035, 0.40), mat(0xd8b53a, 0.85));
      tactile.position.set(-st.x, 1.27, -2.95); g.add(tactile);
      for (const bo of [-120, 0, 120]) {
        const back = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.42, 0.08), mat(0x4d575f, 0.8));
        back.position.set(-st.x + bo, 1.82, -6.72); g.add(back);
      }
      const clockC = document.createElement('canvas'); clockC.width = 128; clockC.height = 128;
      const ck = clockC.getContext('2d'); ck.fillStyle = '#f4f6f7'; ck.beginPath(); ck.arc(64, 64, 60, 0, Math.PI * 2); ck.fill();
      ck.strokeStyle = '#1a2328'; ck.lineWidth = 4; ck.stroke();
      for (let h = 0; h < 12; h++) { const a = h * Math.PI / 6; ck.beginPath(); ck.moveTo(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48); ck.lineTo(64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54); ck.stroke(); }
      const hfrac = (D.STATIONS.indexOf(st) / (D.STATIONS.length - 1)) * (21 + 18 / 60 - 17);
      const hour = 17 + hfrac, hAng = ((hour % 12) / 12) * Math.PI * 2 - Math.PI / 2;
      const mAng = ((hour % 1) * Math.PI * 2) - Math.PI / 2;
      ck.lineWidth = 5; ck.beginPath(); ck.moveTo(64, 64); ck.lineTo(64 + Math.cos(hAng) * 30, 64 + Math.sin(hAng) * 30); ck.stroke();
      ck.lineWidth = 3; ck.beginPath(); ck.moveTo(64, 64); ck.lineTo(64 + Math.cos(mAng) * 42, 64 + Math.sin(mAng) * 42); ck.stroke();
      const clockTex = new THREE.CanvasTexture(clockC); clockTex.colorSpace = THREE.SRGBColorSpace;
      for (const cx of [-120, 120]) {
        const cm = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: clockTex, side: THREE.DoubleSide }));
        cm.position.set(-st.x + cx, 3.9, -9.78); g.add(cm);
      }
      const exitC = document.createElement('canvas'); exitC.width = 256; exitC.height = 64;
      const ex = exitC.getContext('2d'); ex.fillStyle = '#123a63'; ex.fillRect(0, 0, 256, 64);
      ex.strokeStyle = '#e8f1f6'; ex.lineWidth = 3; ex.strokeRect(2, 2, 252, 60);
      ex.fillStyle = '#ffffff'; ex.font = '700 28px "Microsoft YaHei", sans-serif'; ex.textAlign = 'center'; ex.textBaseline = 'middle';
      ex.fillText('出站口 / 检票口', 128, 34);
      const exitTex = new THREE.CanvasTexture(exitC); exitTex.colorSpace = THREE.SRGBColorSpace;
      for (const exx of [-80, 80]) {
        const em = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), new THREE.MeshBasicMaterial({ map: exitTex, side: THREE.DoubleSide }));
        em.position.set(-st.x + exx, 3.1, -9.78); g.add(em);
      }
      const edge = new THREE.Mesh(new THREE.BoxGeometry(450, 0.05, 0.22), mat(0xd8b53a, 0.8));
      edge.position.set(-st.x, 1.27, -1.85); g.add(edge);
      const shellMat = mat(0x8f99a1, 0.85);
      const backWall = new THREE.Mesh(new THREE.BoxGeometry(110, 8.2, 0.3), shellMat);
      backWall.position.set(-st.x, 4.1, -22.4); g.add(backWall);
      for (const sx of [-54.85, 54.85]) {
        const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 8.2, 7.9), shellMat);
        sideWall.position.set(-st.x + sx, 4.1, -18.45); g.add(sideWall);
      }
      const shellRoof = new THREE.Mesh(new THREE.BoxGeometry(110, 0.3, 7.9), shellMat);
      shellRoof.position.set(-st.x, 8.2, -18.45); g.add(shellRoof);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(110, 0.2, 7.9), mat(0xb7bdc1, 0.9));
      floor.position.set(-st.x, 1.2, -18.45); g.add(floor);
      const interiorCol = mat(0x9aa4ab, 0.8);
      for (let c = -4; c <= 4; c++) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.55, 6.7, 0.55), interiorCol);
        col.position.set(-st.x + c * 12, 4.55, -18.0); g.add(col);
      }
      const lightMat = new THREE.MeshStandardMaterial({ color: 0xf4fbff, emissive: 0xeaf6ff, emissiveIntensity: 1.2 });
      for (const lz of [-16.5, -20.0]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(96, 0.06, 0.35), lightMat);
        strip.position.set(-st.x, 7.7, lz); g.add(strip);
      }
      const boardC = document.createElement('canvas'); boardC.width = 1024; boardC.height = 320;
      const bg = boardC.getContext('2d'); bg.fillStyle = '#071018'; bg.fillRect(0, 0, 1024, 320);
      bg.fillStyle = '#e8f1f6'; bg.font = '700 42px "Microsoft YaHei", sans-serif'; bg.fillText('北京南站  B E I J I N G N A N', 30, 58);
      bg.strokeStyle = '#2a7a96'; bg.lineWidth = 4; bg.beginPath(); bg.moveTo(30, 82); bg.lineTo(994, 82); bg.stroke();
      const rows = [['G25', '上海虹桥', '17:00', '检票'], ['G1', '上海', '06:30', '正点'], ['G3', '上海', '06:52', '正点'], ['G5', '上海', '07:40', '正点'], ['G7', '上海', '08:00', '正点']];
      bg.font = '600 34px ui-monospace, monospace';
      rows.forEach((r, i) => { const y = 132 + i * 38; bg.fillStyle = i === 0 ? '#ffd479' : '#cfe0ea'; bg.fillText(r[0], 40, y); bg.fillText(r[1], 220, y); bg.fillText(r[2], 620, y); bg.fillStyle = i === 0 ? '#8fe06a' : '#8fa3b0'; bg.fillText(r[3], 840, y); });
      const boardTex = new THREE.CanvasTexture(boardC); boardTex.colorSpace = THREE.SRGBColorSpace;
      const board = new THREE.Mesh(new THREE.PlaneGeometry(20, 6.25), new THREE.MeshBasicMaterial({ map: boardTex, side: THREE.DoubleSide }));
      board.position.set(-st.x, 5.2, -15.4); g.add(board);
      const gateMat = mat(0xb9c1c7, 0.55), gateDark = mat(0x2b353b, 0.7);
      for (const gx of [-30, -20, 20, 30]) {
        for (let k = 0; k < 2; k++) {
          const gate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.05, 0.9), gateMat);
          gate.position.set(-st.x + gx + k * 0.9, 1.78, -15.9); g.add(gate);
          const top = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.7), gateDark);
          top.position.set(-st.x + gx + k * 0.9, 2.33, -15.9); g.add(top);
        }
      }
      for (const sx of [-32, 0, 32]) {
        for (let i = 0; i < 6; i++) {
          const seat = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.10, 0.50), gateDark);
          seat.position.set(-st.x + sx + i * 0.58, 1.62, -17.2); g.add(seat);
          const back = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.42, 0.08), gateDark);
          back.position.set(-st.x + sx + i * 0.58, 1.85, -17.45); g.add(back);
        }
      }
      const shopGlassMat = new THREE.MeshStandardMaterial({ color: 0x6f98aa, transparent: true, opacity: 0.35, roughness: 0.15, metalness: 0.15, side: THREE.DoubleSide });
      for (const sx of [-42, 42]) {
        const shop = new THREE.Mesh(new THREE.BoxGeometry(10, 3.0, 3.4), mat(0x33434c, 0.6));
        shop.position.set(-st.x + sx, 2.85, -20.6); g.add(shop);
        const shopGlass = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 2.2), shopGlassMat);
        shopGlass.position.set(-st.x + sx, 2.6, -18.88); g.add(shopGlass);
      }
      for (let bx = -4; bx <= 4; bx++) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.30, 7.5), interiorCol);
        beam.position.set(-st.x + bx * 12, 7.85, -18.4); g.add(beam);
      }
      const inName = stationLabel(st.name);
      inName.position.set(-st.x, 6.5, -22.15); inName.rotation.y = 0; inName.scale.set(0.36, 0.36, 1); g.add(inName);
      const facadeMat = new THREE.MeshStandardMaterial({ color: 0x33434c, transparent: true, opacity: 0.82, emissive: 0x0a1418, emissiveIntensity: 0.4, roughness: 0.12, metalness: 0.15, side: THREE.DoubleSide });
      const facade = new THREE.Mesh(new THREE.BoxGeometry(100, 7, 0.16), facadeMat);
      facade.position.set(-st.x, 4.6, -14.38); g.add(facade);
      const entryMat = new THREE.MeshStandardMaterial({ color: 0x1c2d36, emissive: 0x0e1a20, emissiveIntensity: 0.5, roughness: 0.25, metalness: 0.3 });
      const entry = new THREE.Mesh(new THREE.BoxGeometry(12, 3.6, 0.14), entryMat);
      entry.position.set(-st.x, 2.9, -14.28); g.add(entry);
      for (let m = -3; m <= 3; m++) {
        const mull = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.7, 0.18), mat(0x9aa4ab, 0.6));
        mull.position.set(-st.x + m * 2, 2.9, -14.20); g.add(mull);
      }
      const entryCanopy = new THREE.Mesh(new THREE.BoxGeometry(13, 0.28, 3.2), mat(0x9aa4ab, 0.7));
      entryCanopy.position.set(-st.x, 5.05, -12.9); g.add(entryCanopy);
      const mullMat = mat(0x9aa4ab, 0.6);
      for (let m = -5; m <= 5; m++) {
        const mull = new THREE.Mesh(new THREE.BoxGeometry(0.30, 7, 0.22), mullMat);
        mull.position.set(-st.x + m * 10, 4.6, -14.30); g.add(mull);
      }
      for (const fy of [2.55, 4.35, 6.15]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(102, 0.16, 0.22), mat(0x9aa4ab, 0.6));
        band.position.set(-st.x, fy, -14.30); g.add(band);
      }
      const roofName = stationLabel(st.name);
      roofName.position.set(-st.x, 7.45, -14.05); roofName.rotation.y = 0; roofName.scale.set(0.27, 0.27, 1); g.add(roofName);
      const upperGlass = new THREE.Mesh(new THREE.BoxGeometry(100, 5.4, 0.16), facadeMat);
      upperGlass.position.set(-st.x, 11.0, -14.38); g.add(upperGlass);
      for (const sx of [-54.85, 54.85]) {
        const uw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.6, 7.9), shellMat);
        uw.position.set(-st.x + sx, 11.0, -18.45); g.add(uw);
      }
      const upperBack = new THREE.Mesh(new THREE.BoxGeometry(110, 5.6, 0.3), shellMat);
      upperBack.position.set(-st.x, 11.0, -22.4); g.add(upperBack);
      const upperRoof = new THREE.Mesh(new THREE.BoxGeometry(112, 0.4, 8.2), shellMat);
      upperRoof.position.set(-st.x, 13.9, -18.45); g.add(upperRoof);
      for (const fy of [9.6, 11.7, 13.2]) {
        const ub = new THREE.Mesh(new THREE.BoxGeometry(102, 0.18, 0.22), mat(0x9aa4ab, 0.6));
        ub.position.set(-st.x, fy, -14.30); g.add(ub);
      }
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(122, 0.55, 12.5), mat(0x9aa4ab, 0.7));
      canopy.position.set(-st.x, 14.25, -18.4); g.add(canopy);
      const roofSign = stationLabel(st.name);
      roofSign.position.set(-st.x, 13.0, -14.05); roofSign.rotation.y = 0; roofSign.scale.set(0.38, 0.38, 1); g.add(roofSign);
      const parapet = new THREE.Mesh(new THREE.BoxGeometry(104, 0.55, 0.35), mat(0x9aa4ab, 0.7));
      parapet.position.set(-st.x, 8.55, -14.30); g.add(parapet);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(110, 0.45, 4.2), mat(0x9aa4ab, 0.7));
      roof.position.set(-st.x, 8.35, -16.0); g.add(roof);
      for (let j = -5; j <= 5; j++) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.28, 7.2, 0.28), mat(0x8f979e, 0.6));
        col.position.set(-st.x + j * 40, 4.1, -10.2);
        g.add(col);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.62), mat(0x9aa4ab, 0.6));
        cap.position.set(-st.x + j * 40, 5.22, -10.2); g.add(cap);
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.28, 0.52), mat(0x9aa4ab, 0.6));
        base.position.set(-st.x + j * 40, 1.30, -10.2); g.add(base);
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

    const speedLimits = [{ x: 1201000, v: 300 }, { x: 1270000, v: 250 }, { x: 1290000, v: 200 }, { x: 1298000, v: 160 }];
    for (const sl of speedLimits) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256;
      const g2 = c.getContext('2d'); g2.fillStyle = '#f2f4f5'; g2.fillRect(0, 0, 256, 256);
      g2.strokeStyle = '#c8102e'; g2.lineWidth = 18; g2.strokeRect(9, 9, 238, 238);
      g2.fillStyle = '#111416'; g2.font = '800 132px system-ui, sans-serif';
      g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText(String(sl.v), 128, 132);
      const tt = new THREE.CanvasTexture(c); tt.colorSpace = THREE.SRGBColorSpace;
      const bd = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ map: tt, side: THREE.DoubleSide }));
      bd.position.set(-sl.x, 4.3, 5.6); bd.rotation.y = -Math.PI / 2; g.add(bd);
      const po = new THREE.Mesh(new THREE.BoxGeometry(0.16, 4.0, 0.16), new THREE.MeshStandardMaterial({ color: 0x8f979e, metalness: 0.6, roughness: 0.4 }));
      po.position.set(-sl.x, 2.0, 5.6); g.add(po);
    }
    const stationXs = D.STATIONS.map(x => x.x).sort((a, b) => a - b);
    const zones = [];
    let cur = 0;
    for (const sx of stationXs) {
      const a = Math.max(cur, sx - 230), b = Math.max(a, sx + 230);
      if (a > cur) zones.push([cur, a]);
      cur = b;
    }
    if (cur < RUN) zones.push([cur, RUN]);
    const barrierMat = mat(0x9aa4ab, 0.8);
    const barrierGlass = new THREE.MeshStandardMaterial({ color: 0x9fc4d4, transparent: true, opacity: 0.3, roughness: 0.2, metalness: 0.1 });
    for (const [x0, x1] of zones) {
      const len = x1 - x0; if (len < 20) continue;
      for (const bz of [-6.2, 6.2]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 2.3, 0.12), barrierMat);
        wall.position.set(-(x0 + x1) / 2, 2.05, bz); g.add(wall);
        const glass = new THREE.Mesh(new THREE.BoxGeometry(len, 0.7, 0.08), barrierGlass);
        glass.position.set(-(x0 + x1) / 2, 3.05, bz); g.add(glass);
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
    g.fillText('CR400AF-BS-2344', 1120, 52);
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


const STATION_EN2 = {'北京南':'Beijing South','廊坊':'Langfang','天津南':'Tianjin South','沧州西':'Cangzhou West','德州东':'Dezhou East','济南西':'Jinan West','泰安':"Tai'an",'曲阜东':'Qufu East','滕州东':'Tengzhou East','枣庄':'Zaozhuang','徐州东':'Xuzhou East','宿州东':'Suzhou East','蚌埠南':'Bengbu South','定远':'Dingyuan','滁州':'Chuzhou','南京南':'Nanjing South','镇江南':'Zhenjiang South','丹阳北':'Danyang North','常州北':'Changzhou North','无锡东':'Wuxi East','苏州北':'Suzhou North','昆山南':'Kunshan South','上海虹桥':'Shanghai Hongqiao'};

  function stationLabel(name) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(6,10,14,.88)'; g.fillRect(0, 0, 512, 128);
    g.strokeStyle = '#c8102e'; g.lineWidth = 6; g.strokeRect(3, 3, 506, 122);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f2f7fa';
    g.font = '700 56px "Microsoft YaHei", "PingFang SC", sans-serif';
    g.fillText(name, 256, 44);
    g.font = '500 26px system-ui, sans-serif'; g.fillStyle = '#b9d4e2';
    g.fillText(STATION_EN2[name] || '', 256, 96);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthTest: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(16, 4.0), m);
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
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0xeef3f5, roughness: 0.75, emissive: 0x2a3034, emissiveIntensity: 0.6 });
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
    const blankScreen = (kind) => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 320;
      const g2 = c.getContext('2d'); g2.fillStyle = '#04121a'; g2.fillRect(0, 0, 512, 320);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.MeshBasicMaterial({ map: t });
      m.userData = { canvas: c, ctx: g2, kind };
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
    add(new THREE.BoxGeometry(3.0, 0.10, 2.75), ceilMat, 5.8, 4.52, 0);
    for (const z of [-1.36, 1.36]) {
      add(new THREE.BoxGeometry(4.4, 0.9, 0.12), wall, 5.2, 1.7, z);
      add(new THREE.BoxGeometry(4.0, 1.0, 0.12), wall, 5.4, 3.95, z);
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
    
    add(new THREE.BoxGeometry(0.18, 0.14, 2.55), dark, 3.0, 2.18, 0);
    // sun visor
    
    // wipers
    const wiper = new THREE.CylinderGeometry(0.018, 0.018, 0.85, 8);
    const w1 = add(wiper, black, 3.08, 2.42, -0.5); w1.rotation.z = 1.05;
    const w2 = add(wiper, black, 3.08, 2.42, 0.55); w2.rotation.z = 1.15;
    g.userData.wipers = [{ m: w1, b: 1.05 }, { m: w2, b: 1.15 }];
    // curved wrap-around desk (arc segments around the driver)
    const DCX = 6.10, DR = 1.85, DN = 8;
    for (let i = 0; i < DN; i++) {
      const a = Math.PI - 0.85 + (i / (DN - 1)) * 1.70;
      const dx = DCX + DR * Math.cos(a);
      const dz = DR * Math.sin(a);
      add(new THREE.BoxGeometry(0.66, 0.09, 0.66), trim, dx, 2.31, dz, 0, -a, 0);
      add(new THREE.BoxGeometry(0.40, 0.64, 0.66), mid, dx + 0.10 * Math.cos(a), 1.98, dz + 0.10 * Math.sin(a), 0, -a, 0);
      add(new THREE.BoxGeometry(0.42, 0.05, 0.62), trim, dx, 2.36, dz, 0, -a, 0);
    }
    // dashboard face panel + cowl so screens are mounted, not floating
    add(new THREE.BoxGeometry(0.12, 0.54, 2.36), mid, 3.78, 2.48, 0);
    // DMI screens
    const tcmsM = blankScreen('tcms');
    const dmiM = blankScreen('dmi');
    const brakeM = blankScreen('brake');
    makeDmi(3.82, 2.60, 0.62, 0.56, 0.38, tcmsM, 0);
    makeDmi(3.82, 2.60, 0.00, 0.56, 0.38, dmiM, 0);
    makeDmi(3.82, 2.60, -0.62, 0.56, 0.38, brakeM, 0);
    g.userData.screens = [{ m: tcmsM, kind: 'tcms' }, { m: dmiM, kind: 'dmi' }, { m: brakeM, kind: 'brake' }];
    g.userData.dmis = [tcmsM, dmiM, brakeM];
    const stripMat = new THREE.MeshStandardMaterial({ color: 0x1b2328, emissive: 0x2a5a44, emissiveIntensity: 0.45 });
    for (const zz of [-0.95, -0.75, -0.55, -0.35, 0.35, 0.55, 0.75, 0.95]) {
      add(new THREE.BoxGeometry(0.05, 0.035, 0.07), stripMat, 4.18, 2.41, zz);
    }
    // left/right consoles and levers
    add(new THREE.BoxGeometry(1.6, 0.28, 0.42), mid, 5.05, 2.02, -1.05);
    add(new THREE.BoxGeometry(1.6, 0.28, 0.42), mid, 5.05, 2.02, 1.05);
    const lever = new THREE.CylinderGeometry(0.035, 0.035, 0.45, 10);
    const knob = new THREE.SphereGeometry(0.075, 12, 8);
    const l1 = add(lever, trim, 4.6, 2.38, -1.05, 0, 0, 0.2);
    add(knob, trim, 4.68, 2.58, -1.05);
    const l2 = add(lever, trim, 4.6, 2.38, 1.05, 0, 0, -0.2);
    add(knob, trim, 4.68, 2.58, 1.05);
    const leverLabel = (text) => {
      const lc = document.createElement('canvas'); lc.width = 256; lc.height = 64;
      const lg = lc.getContext('2d'); lg.fillStyle = '#1a2228'; lg.fillRect(0, 0, 256, 64);
      lg.strokeStyle = '#5a6a74'; lg.lineWidth = 3; lg.strokeRect(2, 2, 252, 60);
      lg.fillStyle = '#dceaf2'; lg.font = '700 30px "Microsoft YaHei", sans-serif'; lg.textAlign = 'center'; lg.textBaseline = 'middle';
      lg.fillText(text, 128, 34);
      const lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshBasicMaterial({ map: lt });
    };
    for (const side of [-1, 1]) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.30), mid);
      base.position.set(4.55, 2.33, side * 1.05); g.add(base);
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.13), leverLabel(side < 0 ? '牵引' : '制动'));
      lab.position.set(4.55, 2.365, side * 1.05); lab.rotation.x = -Math.PI / 2; g.add(lab);
    }
    g.userData.levers = [l1, l2];
    const gateC = document.createElement('canvas'); gateC.width = 512; gateC.height = 64;
    const gg = gateC.getContext('2d'); gg.fillStyle = '#0d151b'; gg.fillRect(0, 0, 512, 64);
    gg.fillStyle = '#9fc4d4'; gg.font = '700 26px ui-monospace, monospace'; gg.textAlign = 'center'; gg.textBaseline = 'middle';
    for (let i = 0; i <= 7; i++) gg.fillText(i === 7 ? '7B' : String(i), 40 + i * 62, 32);
    const gateTex = new THREE.CanvasTexture(gateC); gateTex.colorSpace = THREE.SRGBColorSpace;
    const gate = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.08), new THREE.MeshBasicMaterial({ map: gateTex, side: THREE.DoubleSide }));
    gate.position.set(4.35, 2.07, 1.05); gate.rotation.x = -Math.PI / 2; g.add(gate);
    const warnMat = new THREE.MeshStandardMaterial({ color: 0x2a0a0a, emissive: 0x400000, emissiveIntensity: 0.3 });
    add(new THREE.BoxGeometry(0.10, 0.04, 0.10), warnMat, 4.95, 2.22, 1.15);
    g.userData.warnLamp = warnMat;
    g.userData.doorLeds = [];
    for (const zz of [-0.9, -0.3, 0.3, 0.9]) {
      const lm = new THREE.MeshStandardMaterial({ color: 0x0d2a18, emissive: 0x2f9e5a, emissiveIntensity: 1.0 });
      add(new THREE.BoxGeometry(0.06, 0.035, 0.06), lm, 4.18, 2.38, zz);
      g.userData.doorLeds.push(lm);
    }
    const dirLabel = (text) => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 64;
      const g2 = c.getContext('2d'); g2.fillStyle = '#1a2228'; g2.fillRect(0, 0, 128, 64);
      g2.fillStyle = '#dceaf2'; g2.font = '700 26px "Microsoft YaHei", sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
      g2.fillText(text, 64, 34);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshBasicMaterial({ map: t });
    };
    const cruiseBtn = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.12), new THREE.MeshStandardMaterial({ color: 0x1b2328, emissive: 0x2f6fd0, emissiveIntensity: 0.7 }));
    cruiseBtn.position.set(4.46, 2.36, 0.20); g.add(cruiseBtn);
    const cruiseLab = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.08), dirLabel('恒速'));
    cruiseLab.position.set(4.46, 2.38, 0.20); cruiseLab.rotation.x = -Math.PI / 2; g.add(cruiseLab);
    g.userData.cruiseButton = cruiseBtn;
    g.userData.cruiseMat = cruiseBtn.material;
    // direction selector + left/right door buttons
    const dirBase = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.035, 16), mid);
    dirBase.position.set(4.50, 2.36, 0.72); g.add(dirBase);
    const dirKnob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), trim);
    dirKnob.position.set(4.50, 2.41, 0.72); g.add(dirKnob);
    g.userData.dirKnob = dirKnob;
    const dirRing = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.014, 20), new THREE.MeshStandardMaterial({ color: 0x1b2328, emissive: 0x2f9e5a, emissiveIntensity: 0.8 }));
    dirRing.position.set(4.50, 2.385, 0.72); g.add(dirRing);
    g.userData.dirRing = dirRing;
    const dirLab = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.08), dirLabel('方向'));
    dirLab.position.set(4.50, 2.38, 0.72); dirLab.rotation.x = -Math.PI / 2; g.add(dirLab);
    const doorBtnMat = new THREE.MeshStandardMaterial({ color: 0x1b2328, emissive: 0x2f9e5a, emissiveIntensity: 0.8 });
    g.userData.doorButtons = [];
    for (const z of [-1.18, 1.18]) {
      const dbMat = doorBtnMat.clone();
      const db = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 0.08), dbMat);
      db.position.set(4.40, 2.37, z); g.add(db);
      g.userData.doorButtons.push({ m: db, side: z < 0 ? -1 : 1, mat: dbMat });
      const dl = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.08), dirLabel(z < 0 ? '左门' : '右门'));
      dl.position.set(4.40, 2.37, z + (z < 0 ? -0.12 : 0.12)); dl.rotation.x = -Math.PI / 2; g.add(dl);
    }
    // wiper / coupling switches on the desk
    const swBase = new THREE.MeshStandardMaterial({ color: 0x1b2328, roughness: 0.7 });
    for (const [sx, sz, txt] of [[4.30, -0.72, '雨刷'], [4.30, 0.42, '连挂'], [4.30, 1.02, '照明'], [4.30, -1.02, '头灯']]) {
      const sw = add(new THREE.BoxGeometry(0.10, 0.03, 0.10), swBase, sx, 2.36, sz);
      if (txt === '雨刷') g.userData.wiperSwitch = sw;
      if (txt === '照明') g.userData.lightSwitch = sw;
      if (txt === '头灯') g.userData.headlightSwitch = sw;
      const sl = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.08), dirLabel(txt));
      sl.position.set(sx, 2.38, sz); sl.rotation.x = -Math.PI / 2; g.add(sl);
    }
    // button clusters
    const panelLabel = (text) => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 80;
      const g = c.getContext('2d'); g.fillStyle = '#1a2228'; g.fillRect(0, 0, 256, 80);
      g.strokeStyle = '#4b5b66'; g.lineWidth = 3; g.strokeRect(2, 2, 252, 76);
      g.fillStyle = '#dceaf2'; g.font = '700 38px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 42);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshBasicMaterial({ map: t });
    };
    for (const side of [-1, 1]) {
      add(new THREE.BoxGeometry(0.75, 0.06, 0.42), mid, 5.05, 2.16, side * 1.05);
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.20), panelLabel(side < 0 ? '牵引' : '制动'));
      lab.position.set(5.05, 2.20, side * 1.05); lab.rotation.x = -Math.PI / 2; g.add(lab);
      const gaugeMat = new THREE.MeshStandardMaterial({ color: 0x0c1418, emissive: 0x1d5a70, emissiveIntensity: 0.7 });
      for (let k = 0; k < 3; k++) {
        const gg = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.025, 16), gaugeMat);
        gg.position.set(5.28, 2.20, side * 1.05 + (k - 1) * 0.12); g.add(gg);
      }
    }

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
    add(new THREE.BoxGeometry(0.16, 0.06, 2.30), wall, 3.55, 3.74, 0);
    const conBtn = new THREE.MeshStandardMaterial({ color: 0x1b2328, emissive: 0x3a1a0a, emissiveIntensity: 0.35 });
    for (let i = 0; i < 6; i++) {
      add(new THREE.BoxGeometry(0.05, 0.035, 0.07), conBtn, 5.02, 2.20, -1.18 + i * 0.09);
      add(new THREE.BoxGeometry(0.05, 0.035, 0.07), conBtn, 5.02, 2.20, 0.82 + i * 0.09);
    }
    const redMat = new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.45, metalness: 0.2 });
    const ebBtn = add(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 16), redMat, 4.22, 2.40, 0.0);
    g.userData.ebButton = ebBtn;
    const cir = screen('CIR', '--', '无线');
    const cirMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.18), cir);
    cirMesh.position.set(5.02, 2.36, -1.12); cirMesh.rotation.y = Math.PI / 2 + 0.35; g.add(cirMesh);
    add(new THREE.BoxGeometry(1.4, 0.06, 0.9), new THREE.MeshStandardMaterial({ color: 0x2f6f9e, roughness: 0.9 }), 5.15, 1.33, 0);
    // ceiling panel seams / vents
    const seamMat = new THREE.MeshStandardMaterial({ color: 0x39434a, roughness: 0.8 });
    for (const sx of [4.3, 5.2, 6.1]) add(new THREE.BoxGeometry(0.035, 0.012, 2.4), seamMat, sx, 4.46, 0);
    add(new THREE.BoxGeometry(0.8, 0.025, 0.18), seamMat, 4.9, 4.44, -0.55);
    add(new THREE.BoxGeometry(0.8, 0.025, 0.18), seamMat, 4.9, 4.44, 0.55);
    // ceiling light strips
    const litMat = new THREE.MeshStandardMaterial({ color: 0xe8f4ff, emissive: 0xddefff, emissiveIntensity: 1.2 });
    add(new THREE.BoxGeometry(1.8, 0.035, 0.10), litMat, 5.8, 4.45, -0.42);
    add(new THREE.BoxGeometry(1.8, 0.035, 0.10), litMat, 5.8, 4.45, 0.42);
    // side window frames
    for (const z of [-1.36, 1.36]) {
      add(new THREE.BoxGeometry(2.2, 0.06, 0.08), dark, 5.1, 2.22, z);
      add(new THREE.BoxGeometry(2.2, 0.06, 0.08), dark, 5.1, 3.34, z);
      add(new THREE.BoxGeometry(0.06, 1.16, 0.08), dark, 4.02, 2.78, z);
      add(new THREE.BoxGeometry(0.06, 1.16, 0.08), dark, 6.18, 2.78, z);
    }
    // lower side cabinets
    for (const z of [-1.30, 1.30]) {
      add(new THREE.BoxGeometry(2.2, 0.78, 0.16), mid, 5.4, 1.82, z);
      for (let d = -1; d <= 1; d++) {
        add(new THREE.BoxGeometry(0.60, 0.62, 0.03), trim, 5.4 + d * 0.68, 1.82, z + (z > 0 ? 0.09 : -0.09));
        add(new THREE.BoxGeometry(0.12, 0.035, 0.035), dark, 5.4 + d * 0.68, 1.86, z + (z > 0 ? 0.12 : -0.12));
      }
    }
    // side window dividers / latches / handrails
    for (const z of [-1.355, 1.355]) {
      add(new THREE.BoxGeometry(0.05, 1.10, 0.06), dark, 5.10, 2.78, z);
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10), trim, 5.10, 2.62, z + (z > 0 ? 0.05 : -0.05));
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.25, 10), trim);
      rail.position.set(4.25, 2.55, z * 0.92); g.add(rail);
    }
    // sun visors
    // cab equipment bay / electrical cabinet details
    const ventMat = new THREE.MeshStandardMaterial({ color: 0x2a343a, roughness: 0.8 });
    for (let vi = 0; vi < 5; vi++) {
      add(new THREE.BoxGeometry(0.42, 0.025, 0.03), ventMat, 5.25, 1.62 + vi * 0.09, -1.38);
      add(new THREE.BoxGeometry(0.42, 0.025, 0.03), ventMat, 5.25, 1.62 + vi * 0.09, 1.38);
    }
    const breakerMat = new THREE.MeshStandardMaterial({ color: 0x1a2328, emissive: 0x2a1a0a, emissiveIntensity: 0.25 });
    add(new THREE.BoxGeometry(0.42, 0.55, 0.06), breakerMat, 5.85, 1.95, 1.36);
    for (let bi = 0; bi < 5; bi++) add(new THREE.BoxGeometry(0.07, 0.05, 0.08), breakerMat, 5.72 + bi * 0.07, 2.02, 1.40);
    const extMat = new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.6, metalness: 0.2 });
    add(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 12), extMat, 4.55, 1.75, 1.30);
    const cabLabel = (text) => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64;
      const g2 = c.getContext('2d'); g2.fillStyle = '#1a2228'; g2.fillRect(0, 0, 256, 64);
      g2.strokeStyle = '#5a6a74'; g2.lineWidth = 3; g2.strokeRect(2, 2, 252, 60);
      g2.fillStyle = '#dceaf2'; g2.font = '700 22px "Microsoft YaHei", sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
      g2.fillText(text, 128, 34);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshBasicMaterial({ map: t });
    };
    for (const z of [-1.35, 1.35]) {
      for (const [cx, txt] of [[4.95, z < 0 ? '左前电气柜' : '右前电气柜'], [6.35, z < 0 ? '左后电气柜' : '右后电气柜']]) {
        const lp = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.16), cabLabel(txt));
        lp.position.set(cx, 2.12, z); lp.rotation.y = z < 0 ? Math.PI / 2 : -Math.PI / 2;
        g.add(lp);
      }
    }
    add(new THREE.BoxGeometry(0.34, 0.52, 0.34), trim, 6.95, 1.50, 0.55);
    // distribution panels 1/2/3 on the rear partition
    for (let pi = 0; pi < 3; pi++) {
      const px = 7.27, pz = (pi - 1) * 0.85, py = 2.15;
      add(new THREE.BoxGeometry(0.06, 0.55, 0.55), mid, px, py, pz);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.40, 0.10), dirLabel('配电盘' + (pi + 1)));
      pl.position.set(px - 0.04, py + 0.20, pz); pl.rotation.y = -Math.PI / 2; g.add(pl);
      for (let si = 0; si < 4; si++) {
        const swm = new THREE.MeshStandardMaterial({ color: 0x1b2328, emissive: 0x2a4a2a, emissiveIntensity: 0.4 });
        add(new THREE.BoxGeometry(0.03, 0.06, 0.08), swm, px - 0.05, py - 0.05 + si * 0.09, pz);
      }
    }
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.24), new THREE.MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.8 }));
    pedal.position.set(4.45, 1.34, 0.55); g.add(pedal);
    g.userData.deadman = pedal;
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
    g.userData.cabLamp = lamp;
    return g;
  }

  async function buildTrain(scene) {
    const THREE = window.__HSR_THREE;
    const [headG, midG, cabinG] = await Promise.all([
      loadGltf(window.__HSR_ASSETS.head),
      loadGltf(window.__HSR_ASSETS.middle),
      window.__HSR_ASSETS.cabin ? loadGltf(window.__HSR_ASSETS.cabin).catch(() => null) : Promise.resolve(null)
    ]);
    const root = new THREE.Group();
    root.name = 'HSR-MAIN-TRAIN';
    const HEAD = 27.58, MID = 25.65, GAP = 0.0;

    const head = headG.scene;
    head.visible = true;
    head.position.set(HEAD / 2, 0, 0);
    head.scale.x = 27.58 / 25.95;
    root.add(head);
    const liveryGeo = liveryRibbonGeometry();
    const liveryMat = new THREE.MeshBasicMaterial({ map: liveryTexture(), side: THREE.DoubleSide, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const headLivery = new THREE.Mesh(liveryGeo, liveryMat);
    headLivery.position.x = HEAD / 2;
    headLivery.scale.x = 27.58 / 25.95;
    headLivery.renderOrder = 2;
    root.add(headLivery);
    const frontDark = new THREE.MeshStandardMaterial({ color: 0x1a2024, roughness: 0.6, metalness: 0.3 });
    const coupler = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.42, 0.80), frontDark);
    coupler.position.set(0.10, 0.62, 0); root.add(coupler);
    for (const wz of [-0.45, 0.45]) {
      const wiper = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.72, 6), frontDark);
      wiper.position.set(0.08, 2.35, wz); wiper.rotation.z = 1.05; root.add(wiper);
    }
    const noseRedMat = new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.5, metalness: 0.15 });
    const noseGoldMat = new THREE.MeshStandardMaterial({ color: 0xd8a21f, roughness: 0.5, metalness: 0.2 });
    const nr1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 1.72), noseRedMat); nr1.position.set(0.08, 1.18, 0); root.add(nr1);
    const nr2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.60), noseGoldMat); nr2.position.set(0.09, 1.04, 0); root.add(nr2);
    const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 2.2, roughness: 0.2 });
    root.userData.headlightMat = hlMat;
    for (const hz of [-0.78, 0.78]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.24), hlMat);
      hl.position.set(0.10, 1.35, hz); root.add(hl);
    }
    const decalC = document.createElement('canvas'); decalC.width = 1024; decalC.height = 96;
    const dg = decalC.getContext('2d');
    dg.clearRect(0, 0, 1024, 96);
    dg.fillStyle = '#ffffff'; dg.font = '700 48px "Microsoft YaHei", sans-serif'; dg.textBaseline = 'middle';
    dg.fillText('CR400AF-BS-2344  ·  京沪高铁 G25', 24, 50);
    const decalTex = new THREE.CanvasTexture(decalC); decalTex.colorSpace = THREE.SRGBColorSpace;
    const decalMat = new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    for (const dx of [4, 56, 110, 164, 218, 272, 326, 380]) {
      for (const dz of [-1.43, 1.43]) {
        const dp = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 0.50), decalMat);
        dp.position.set(dx, 2.25, dz);
        if (dz < 0) dp.rotation.y = Math.PI;
        root.add(dp);
      }
    }
    const depotC = document.createElement('canvas'); depotC.width = 512; depotC.height = 64;
    const depg = depotC.getContext('2d'); depg.clearRect(0, 0, 512, 64);
    depg.fillStyle = '#ffffff'; depg.font = '700 34px "Microsoft YaHei", sans-serif'; depg.textBaseline = 'middle';
    depg.fillText('京局北京动车段', 18, 34);
    const depotTex = new THREE.CanvasTexture(depotC); depotTex.colorSpace = THREE.SRGBColorSpace;
    const depotMat = new THREE.MeshBasicMaterial({ map: depotTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    for (const dx of [4, 56, 110, 164, 218, 272, 326, 380]) {
      for (const dz of [-1.44, 1.44]) {
        const dp = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.40), depotMat);
        dp.position.set(dx, 1.98, dz); if (dz < 0) dp.rotation.y = Math.PI; root.add(dp);
      }
    }
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
      inst.scale.x = 25.65 / 25.5;
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

    const carNumMat = (n) => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 128;
      const g2 = c.getContext('2d'); g2.clearRect(0, 0, 128, 128);
      g2.fillStyle = 'rgba(20,24,28,0.9)'; g2.font = '800 72px system-ui, sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
      g2.fillText(String(n), 64, 68);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
    };
    const addCarNum = (x, n) => {
      for (const dz of [-1.47, 1.47]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), carNumMat(n));
        p.position.set(x, 2.32, dz); if (dz < 0) p.rotation.y = Math.PI; root.add(p);
      }
    };
    addCarNum(HEAD / 2, 1);
    for (let ci = 0; ci < carXs.length; ci++) addCarNum(carXs[ci], ci + 2);
    addCarNum(carXs[carXs.length - 1] + MID / 2 + GAP + HEAD / 2, 17);
    const tail = headG.scene.clone(true);
    tail.visible = true;
    tail.position.set(carXs[carXs.length - 1] + MID / 2 + GAP + HEAD / 2, 0, 0);
    tail.rotation.y = Math.PI;
    tail.scale.x = 27.58 / 25.95;
    const tlMat = new THREE.MeshStandardMaterial({ color: 0xc8102e, emissive: 0xff1a1a, emissiveIntensity: 1.8, roughness: 0.3 });
    for (const tz of [-0.72, 0.72]) {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.22), tlMat);
      tl.position.set(0.10, 1.30, tz); tail.add(tl);
    }
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

    const bogieMat = new THREE.MeshStandardMaterial({ color: 0x2b3237, roughness: 0.75, metalness: 0.3 });
    const bogieCenters = [HEAD / 2, ...carXs, carXs[carXs.length - 1] + MID / 2 + GAP + HEAD / 2];
    for (const bx of bogieCenters) {
      for (const off of [-8.9, 8.9]) {
        const bg = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.35, 2.0), bogieMat);
        bg.position.set(bx + off, 0.55, 0); root.add(bg);
        for (const bz of [-1.15, 1.15]) {
          const side = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.22, 0.12), bogieMat);
          side.position.set(bx + off, 0.55, bz); root.add(side);
        }
      }
    }
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xb9c0c4, roughness: 0.7, metalness: 0.2 });
    const roofCenters = [HEAD / 2, ...carXs, carXs[carXs.length - 1] + MID / 2 + GAP + HEAD / 2];
    for (const rx of roofCenters) {
      for (const off of [-5.5, 5.5]) {
        const ac = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 1.5), roofMat);
        ac.position.set(rx + off, 4.05, 0); root.add(ac);
      }
    }
    const panto = new THREE.Group();
    const pantoMat = new THREE.MeshStandardMaterial({ color: 0x4a5359, metalness: 0.7, roughness: 0.35 });
    const pBase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 1.2), pantoMat); panto.add(pBase);
    panto.userData.lower = []; panto.userData.upper = [];
    for (const pz of [-0.4, 0.4]) {
      const lower = new THREE.Group(); lower.position.set(0, 0.04, pz);
      const la = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.58, 8), pantoMat);
      la.position.y = 0.29; la.rotation.z = 0.35; lower.add(la);
      panto.add(lower); panto.userData.lower.push(lower);
      const upper = new THREE.Group(); upper.position.set(0, 0.60, pz);
      const ua = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.56, 8), pantoMat);
      ua.position.y = 0.28; ua.rotation.z = -0.35; upper.add(ua);
      panto.add(upper); panto.userData.upper.push(upper);
    }
    const pBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 1.4), pantoMat); pBar.position.y = 1.16; panto.add(pBar);
    panto.userData.bar = pBar;
    panto.position.set(HEAD / 2, 4.05, 0); root.add(panto); root.userData.pantograph = panto;
    if (cabinG && cabinG.scene) {
      const scenic = document.createElement('canvas'); scenic.width = 512; scenic.height = 256;
      const sg = scenic.getContext('2d');
      const grad = sg.createLinearGradient(0, 0, 0, 150);
      grad.addColorStop(0, '#6fa8c8'); grad.addColorStop(0.55, '#cfe6f2'); grad.addColorStop(1, '#e8f2f4');
      sg.fillStyle = grad; sg.fillRect(0, 0, 512, 150);
      sg.fillStyle = '#7d9a6a'; sg.beginPath(); sg.moveTo(0, 150); sg.lineTo(90, 120); sg.lineTo(190, 142); sg.lineTo(300, 112); sg.lineTo(420, 140); sg.lineTo(512, 118); sg.lineTo(512, 256); sg.lineTo(0, 256); sg.closePath(); sg.fill();
      sg.fillStyle = '#8fae76'; sg.fillRect(0, 154, 512, 102);
      sg.fillStyle = '#6f8c5c'; for (let i = 0; i < 16; i++) sg.fillRect(i * 34, 176 + (i % 3) * 10, 18, 4);
      const stex = new THREE.CanvasTexture(scenic); stex.colorSpace = THREE.SRGBColorSpace;
      root.userData.scenic = { ctx: sg, tex: stex, last: -1e9, lastStopped: null };
      const ledC = document.createElement('canvas'); ledC.width = 512; ledC.height = 64;
      const lg2 = ledC.getContext('2d'); lg2.fillStyle = '#071018'; lg2.fillRect(0, 0, 512, 64);
      lg2.fillStyle = '#ffb340'; lg2.font = '700 26px "Microsoft YaHei", monospace'; lg2.textAlign = 'center'; lg2.textBaseline = 'middle';
      lg2.fillText('05车  G25  北京南—上海虹桥  350km/h  24°C', 256, 34);
      const ledTex = new THREE.CanvasTexture(ledC); ledTex.colorSpace = THREE.SRGBColorSpace;
      root.userData.cabinLed = { ctx: lg2, tex: ledTex, last: -1 };
      for (const dx of [-12.26, 12.26]) {
        const led = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.30), new THREE.MeshBasicMaterial({ map: ledTex, side: THREE.DoubleSide }));
        led.position.set((carXs[3] || 0) + dx, 3.10, 0); led.rotation.y = dx < 0 ? Math.PI / 2 : -Math.PI / 2; root.add(led);
      }
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x8fa6b4, roughness: 0.35, metalness: 0.15 });
      root.userData.cabinDoors = [];
      for (const dx of [-12.34, 12.34]) {
        for (const dz of [-0.30, 0.30]) {
          const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.20, 0.58), doorMat);
          doorPanel.position.set((carXs[3] || 0) + dx, 2.45, dz); root.add(doorPanel);
          root.userData.cabinDoors.push({ m: doorPanel, dz });
        }
      }

      const gangMat = new THREE.MeshStandardMaterial({ color: 0x5a646b, roughness: 0.8 });
      for (const dx of [-13.15, 13.15]) {
        const gfloor = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 1.5), gangMat); gfloor.position.set((carXs[3] || 0) + dx, 1.28, 0); root.add(gfloor);
        const gceil = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 1.5), gangMat); gceil.position.set((carXs[3] || 0) + dx, 3.55, 0); root.add(gceil);
        for (const gz of [-0.72, 0.72]) {
          const gw = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.25, 0.06), gangMat); gw.position.set((carXs[3] || 0) + dx, 2.42, gz); root.add(gw);
        }
        const gend = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.25, 1.4), doorMat); gend.position.set((carXs[3] || 0) + dx + Math.sign(dx) * 0.85, 2.42, 0); root.add(gend);
      }
      const bellowsMat = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.95 });
      for (const dx of [-13.15, 13.15]) {
        for (let ri = 0; ri < 4; ri++) {
          const rx = (carXs[3] || 0) + dx - 0.65 + ri * 0.42;
          const top = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 1.52), bellowsMat); top.position.set(rx, 3.50, 0); root.add(top);
          const bot = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 1.52), bellowsMat); bot.position.set(rx, 1.33, 0); root.add(bot);
          for (const bz of [-0.74, 0.74]) { const side = new THREE.Mesh(new THREE.BoxGeometry(0.10, 2.25, 0.10), bellowsMat); side.position.set(rx, 2.42, bz); root.add(side); }
        }
      }
      cabinG.scene.traverse(o => {
        if (!o.isMesh || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m.name && m.name.indexOf('window_sky') >= 0) {
            m.map = stex; m.color.setHex(0xffffff); m.emissive.setHex(0x000000); m.needsUpdate = true;
          }
          if (m.name === 'glass') {
            m.transparent = false; m.opacity = 1; m.color.setHex(0x6f8fa6); m.roughness = 0.25; m.needsUpdate = true;
          }
          if (m.name === 'wall') { m.color.multiplyScalar(0.68); m.roughness = 0.85; m.needsUpdate = true; }
          if (m.name === 'light') { m.emissiveIntensity = 0.55; m.needsUpdate = true; }
          if (m.name === 'seat_light') { m.color.multiplyScalar(0.85); m.needsUpdate = true; }
        }
      });
    }
    if (cabinG && cabinG.scene) {
      const cabin = cabinG.scene;
      cabin.position.set(carXs[3], 1.25, 0);
      cabin.name = 'HSR-PASSENGER-CABIN';
      root.add(cabin);
      for (const ci of [2, 4]) {
        if (!carXs[ci]) continue;
        const clone = cabin.clone(true);
        clone.position.set(carXs[ci], 1.25, 0);
        clone.name = 'HSR-PASSENGER-CABIN-' + (ci + 2);
        root.add(clone);
      }

      root.userData.passengerX = carXs[3];
    }
    const carSignMats = [];
    for (let n = 1; n <= 17; n++) {
      const sc = document.createElement('canvas'); sc.width = 256; sc.height = 64;
      const sg2 = sc.getContext('2d'); sg2.fillStyle = '#0a1116'; sg2.fillRect(0, 0, 256, 64);
      sg2.fillStyle = '#ffb340'; sg2.font = '700 28px "Microsoft YaHei", monospace'; sg2.textAlign = 'center'; sg2.textBaseline = 'middle';
      sg2.fillText('G25  ' + String(n).padStart(2, '0') + '车', 128, 34);
      const stx = new THREE.CanvasTexture(sc); stx.colorSpace = THREE.SRGBColorSpace;
      carSignMats.push(new THREE.MeshBasicMaterial({ map: stx, side: THREE.DoubleSide }));
    }
    const signCars = [{ x: HEAD / 2, n: 1 }, ...carXs.map((x, i) => ({ x, n: i + 2 })), { x: carXs[carXs.length - 1] + MID / 2 + GAP + HEAD / 2, n: 17 }];
    for (const c of signCars) {
      for (const dx of [-8.2, 8.2]) {
        for (const sz of [-1.46, 1.46]) {
          const sp = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.29), carSignMats[c.n - 1]);
          sp.position.set(c.x + dx, 3.05, sz); if (sz < 0) sp.rotation.y = Math.PI; root.add(sp);
        }
      }
    }
    root.scale.set(1, 0.837, 0.977);
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
