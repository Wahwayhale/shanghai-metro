/* =====================================================================
   道岔 · 联锁 · 固定闭塞
   —— 站前/站后两处剪刀式渡线，转辙机可动，进路排列带锁闭
   ===================================================================== */

const IX = {
  turnouts: [],        // { s, pos, t, target, blades:[], lamp }
  routes: [],
  active: 'main',
  locked: {},
  group: null,
  inited: false,

  /* 两处渡线位置：起点站前、终点站后 */
  build(route, group) {
    this.group = new THREE.Group();
    group.add(this.group);
    this.turnouts = [];
    const sts = route.stations;
    const sA = clamp(sts[0].stopS - 210, 80, route.length - 100);
    const sB = clamp(sts[sts.length - 1].stopS + 190, 120, route.length - 60);

    for (const [key, s] of [['A', sA], ['B', sB]]) {
      const t = this.buildCrossover(route, s, key);
      this.turnouts.push(t);
    }
    this.routes = [
      { id: 'main', name: '正线通过', sub: '上下行直向', states: { A: 0, B: 0 }, conflicts: ['revA', 'revB', 'both'] },
      { id: 'revA', name: '起点折返', sub: 'A 渡线反位', states: { A: 1, B: 0 }, conflicts: ['main', 'revB', 'both'] },
      { id: 'revB', name: '终点折返', sub: 'B 渡线反位', states: { A: 0, B: 1 }, conflicts: ['main', 'revA', 'both'] },
      { id: 'both', name: '两端折返', sub: 'A/B 渡线同时反位', states: { A: 1, B: 1 }, conflicts: ['main', 'revA', 'revB'] }
    ];
    this.active = 'main';
    this.applyRoute('main', true);
    this.renderIx();
  },

  buildCrossover(route, s, key) {
    const HALF = 30;
    const railMat = new THREE.MeshStandardMaterial({ color: 0x9aa2a4, roughness: 0.36, metalness: 0.78 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x22282c, roughness: 0.7, metalness: 0.3 });

    const f0 = route.frameAt(Math.max(0, s - HALF));
    const f1 = route.frameAt(Math.min(route.length - 1, s + HALF));
    const a1 = f0.pos.clone().addScaledVector(f0.right, -TRACK_LAT);
    const b1 = f1.pos.clone().addScaledVector(f1.right, TRACK_LAT);
    const a2 = f0.pos.clone().addScaledVector(f0.right, TRACK_LAT);
    const b2 = f1.pos.clone().addScaledVector(f1.right, -TRACK_LAT);

    const railSeg = (a, b, mat, w, h) => {
      const dir = b.clone().sub(a);
      const len = dir.length();
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), mat);
      m.position.copy(a).addScaledVector(dir, 0.5);
      m.lookAt(b);
      this.group.add(m);
      return m;
    };
    railSeg(a1, b1, railMat, 0.1, 0.16);
    railSeg(a2, b2, railMat, 0.1, 0.16);

    /* 尖轨：绕跟端小幅摆动 */
    const blades = [];
    for (const [a, b, sign] of [[a1, b1, 1], [a2, b2, -1]]) {
      const dir = b.clone().sub(a).normalize();
      const pivot = new THREE.Group();
      pivot.position.copy(a);
      pivot.lookAt(b);
      this.group.add(pivot);
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 9.2), railMat);
      bl.position.set(0, 0, 4.6);
      pivot.add(bl);
      blades.push({ pivot, sign });
    }

    /* 转辙机 + 表示器 */
    const machineMat = new THREE.MeshStandardMaterial({ color: 0x2b3236, roughness: 0.72, metalness: 0.28 });
    const midF = route.frameAt(s);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.44, 1.1), machineMat);
    box.position.copy(midF.pos).addScaledVector(midF.right, 0).addScaledVector(midF.up, 0.22);
    this.group.add(box);
    const lamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 1.4, 0.45), toneMapped: false });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), lamMat);
    lamp.position.copy(midF.pos).addScaledVector(midF.up, 0.52);
    this.group.add(lamp);

    // 道岔编号牌
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.24), new THREE.MeshBasicMaterial({ map: texPointNumber(key), toneMapped: false }));
    plate.position.copy(midF.pos).addScaledVector(midF.right, -0.55).addScaledVector(midF.up, 0.3);
    plate.rotation.y = 0;
    this.group.add(plate);

    return { key, s, blades, lamp, mat: lamMat, t: 0, target: 0, pos: midF.pos.clone() };
  },

  applyRoute(id, instant) {
    const r = this.routes.find(x => x.id === id);
    if (!r) return;
    this.active = id;
    for (const t of this.turnouts) {
      t.target = r.states[t.key] || 0;
    }
    if (instant) for (const t of this.turnouts) { t.t = t.target; this.updateBlades(t); }
    this.renderIx();
  },

  updateBlades(t) {
    for (const b of t.blades) {
      b.pivot.rotation.y = b.sign * lerp(-0.062, 0.062, t.t);
    }
    const on = t.t > 0.5;
    t.mat.color.setRGB(on ? 1.6 : 0.25, on ? 1.15 : 1.4, on ? 0.2 : 0.45);
  },

  /* 道岔区段是否被本务或 AI 占用 */
  occupied() {
    const near = s => this.turnouts.some(t => Math.abs(s - t.s) < 75);
    if (typeof G !== 'undefined' && G.mode === 'driving' && near(G.s)) return true;
    for (const ai of (typeof aiTrains !== 'undefined' ? aiTrains : [])) {
      if (!ai.dead && near(ai.s)) return true;
    }
    return false;
  },

  update(dt) {
    let moving = false;
    for (const t of this.turnouts) {
      if (Math.abs(t.t - t.target) < 0.001) continue;
      moving = true;
      t.t += Math.sign(t.target - t.t) * dt * 0.9;
      t.t = clamp(t.t, 0, 1);
      this.updateBlades(t);
    }
    if (moving && !this._clicked) {
      this._clicked = true;
      AUDIO.thud();
    } else if (!moving) this._clicked = false;
  },

  /* 联锁：渡线附近的信号机受进路控制 */
  aspectFor(sg) {
    for (const t of this.turnouts) {
      const gap = sg.dir > 0 ? sg.s - t.s : t.s - sg.s;
      if (gap < -45 || gap > 95) continue;
      // 直向不覆盖占用显示；反位才施加进路限制
      if (t.t <= 0.5) continue;
      // 反位：来车方向显示黄（侧向），另一方向红（敌对）
      const approach = sg.dir > 0 ? t.key === 'A' : t.key === 'B';
      return approach ? SIG_YELLOW : SIG_RED;
    }
    return null;
  },

  renderIx() {
    const box = $('atsIx');
    if (!box) return;
    box.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'ats-ix-head';
    const tA = this.turnouts.find(t => t.key === 'A');
    const tB = this.turnouts.find(t => t.key === 'B');
    const occupied = this.occupied();
    head.innerHTML = `<span>联锁进路</span><i>道岔 ${tA ? (tA.t > 0.5 ? 'A:反' : 'A:直') : ''} ${tB ? (tB.t > 0.5 ? 'B:反' : 'B:直') : ''} · ${occupied ? '区段占用' : '区段空闲'}</i>`;
    box.appendChild(head);
    const active = this.routes.find(r => r.id === this.active);
    const conflicts = active && active.conflicts && active.conflicts.length
      ? active.conflicts.map(id => (this.routes.find(r => r.id === id) || {}).name).filter(Boolean).join(' / ')
      : '无';
    const sub = document.createElement('div');
    sub.className = 'ats-ix-head';
    sub.innerHTML = `<span>敌对进路</span><i>${conflicts}</i>`;
    box.appendChild(sub);
    for (const r of this.routes) {
      const b = document.createElement('button');
      b.className = 'ats-ix-btn' + (this.active === r.id ? ' on' : '');
      b.dataset.ix = r.id;
      b.innerHTML = `<b>${r.name}</b><span>${r.sub}</span>`;
      box.appendChild(b);
    }
  },

  init() {
    if (this.inited) return;
    this.inited = true;
    const box = $('atsIx');
    if (!box) return;
    box.addEventListener('click', e => {
      const b = e.target.closest('button[data-ix]');
      if (!b) return;
      const id = b.dataset.ix;
      if (!this.routes.find(r => r.id === id)) return;
      if (id !== this.active && this.occupied()) {
        toast('道岔区段有车占用 · 进路锁闭，禁止转换', 'warn', 3800);
        AUDIO.beep(true);
        return;
      }
      this.applyRoute(id);
      AUDIO.beep();
      const nm = this.routes.find(r => r.id === id).name;
      toast(`进路已排列 · ${nm} · 道岔转换中`, 'good', 3000);
      if (id !== 'main') toast('注意：反位进路占用对向正线，敌对信号已锁闭', 'warn', 4200);
    });
    this.renderIx();
  }
};

/* 道岔编号牌 */
function texPointNumber(key) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#0d1215'; x.fillRect(0, 0, 128, 96);
  x.strokeStyle = '#e4e9ea'; x.lineWidth = 4; x.strokeRect(4, 4, 120, 88);
  x.fillStyle = '#f0f4f5';
  x.font = '800 54px ui-monospace,monospace';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(key === 'A' ? 'P1' : 'P2', 64, 52);
  return toTex(c);
}

/* ---------------- 固定闭塞降级 ---------------- */
/* 反位进路经过道岔区段时按侧向限速运行 */
function interlockSpeedLimit(s, limit) {
  if (typeof IX === 'undefined' || IX.active === 'main' || !IX.turnouts) return limit;
  for (const t of IX.turnouts) {
    if (Math.abs(s - t.s) < 70) return Math.min(limit, 45);
  }
  return limit;
}

function fixedBlockLimit() {
  const vmax = (typeof path !== 'undefined' && path && path.vmax) ? path.vmax : VMAX;
  const sg = nextSignalAhead();
  if (!sg) return vmax;
  const d = sg.gap;
  if (sg.state === SIG_RED) {
    const stopAt = Math.max(0, d - 14);
    return Math.sqrt(2 * 0.62 * stopAt) * 3.6;
  }
  if (sg.state === SIG_YELLOW) {
    return Math.min(45, Math.sqrt(2 * 0.62 * Math.max(0, d - 14)) * 3.6 + 26);
  }
  return vmax;
}

function toggleSignalMode(force) {
  if (G.mode !== 'driving') return;
  const to = force === undefined ? (G.sigMode === 'cbtc' ? 'fixed' : 'cbtc') : force;
  if (to === G.sigMode) return;
  G.sigMode = to;
  AUDIO.beep();
  if (to === 'fixed') {
    toast('ATP 已切除 · 转入固定闭塞，按地面信号行车', 'warn', 5200);
    AUDIO.announce('自动防护已切除，转为固定闭塞模式，请按地面信号行车。');
  } else {
    toast('ATP 已恢复 · 移动闭塞正常', 'good', 3600);
  }
  updateHUD(true);
}
