/* ================================================================
   线路几何：经纬度 → 世界坐标，样条中心线，纵断面，曲线限速，时刻表
   ================================================================ */
class RoutePath {
  constructor(def, line) {
    this.def = def;
    this.line = line;
    const raw = line.stations;
    const lat0 = raw.reduce((a, s) => a + s.lat, 0) / raw.length;
    const lon0 = raw.reduce((a, s) => a + s.lon, 0) / raw.length;
    this.origin = { lat: lat0, lon: lon0 };
    this.KX = 111320 * Math.cos(lat0 * D2R);
    this.KZ = 111132;

    const pts = raw.map(s => {
      const p = this.project(s.lat, s.lon);
      return new THREE.Vector2(p.x, p.z);
    });
    this.rawStations = raw;

    /* —— 环线：控制点首尾相接，末尾再续一小段让列车能停回起点站台 —— */
    this.loop = !!def.loop;
    this.vmax = line.vmax || VMAX;
    const cps = [];
    if (!this.loop) {
      const preDir = pts[0].clone().sub(pts[1]).normalize().multiplyScalar(240);
      cps.push(new THREE.Vector3(pts[0].x + preDir.x, 0, pts[0].y + preDir.y));
    }
    for (let i = 0; i < pts.length; i++) {
      cps.push(new THREE.Vector3(pts[i].x, 0, pts[i].y));
      if (i < pts.length - 1) {
        const dx = pts[i + 1].x - pts[i].x, dz = pts[i + 1].y - pts[i].y;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len, nz = dx / len;
        const amp = Math.min(17, len * 0.026) * (i % 2 ? -1 : 1) * (0.7 + 0.3 * RNG());
        cps.push(new THREE.Vector3(pts[i].x + dx * 0.34 + nx * amp, 0, pts[i].y + dz * 0.34 + nz * amp));
        cps.push(new THREE.Vector3(pts[i].x + dx * 0.68 + nx * amp, 0, pts[i].y + dz * 0.68 + nz * amp));
      }
    }
    if (this.loop) {
      // 闭合：回到起点站，再沿第一条区间延伸，形成可停车的尾段
      const n0 = pts.length;
      cps.push(new THREE.Vector3(pts[0].x, 0, pts[0].y));
      const dx = pts[1].x - pts[0].x, dz = pts[1].y - pts[0].y;
      for (const f of [0.3, 0.6]) cps.push(new THREE.Vector3(pts[0].x + dx * f, 0, pts[0].y + dz * f));
      cps.push(new THREE.Vector3(pts[1].x, 0, pts[1].y));
    } else {
      const postDir = pts[pts.length - 1].clone().sub(pts[pts.length - 2]).normalize().multiplyScalar(240);
      cps.push(new THREE.Vector3(pts[pts.length - 1].x + postDir.x, 0, pts[pts.length - 1].y + postDir.y));
    }

    const curve = new THREE.CatmullRomCurve3(cps, false, 'centripetal');
    curve.arcLengthDivisions = 1600;
    this.curve = curve;
    this.length = curve.getLength();
    // 全线交路很长，适当放宽采样间距，避免长线加载过慢
    this.ds = (this.def.id && /^full/.test(this.def.id))
      ? (this.length > 52000 ? 4 : this.length > 32000 ? 3 : 2.5)
      : 2.0;
    const N = Math.ceil(this.length / this.ds);
    this.ds = this.length / N;
    this.N = N;
    const flat = curve.getSpacedPoints(N);

    /* —— 车站里程 —— */
    this.stationS = [];
    this.stationY = raw.map(s => s.y);
    let scanFrom = 0;
    for (let k = 0; k < pts.length; k++) {
      const target = new THREE.Vector3(pts[k].x, 0, pts[k].y);
      let best = 0, bd = Infinity;
      const a0 = this.loop ? Math.max(0, Math.floor(scanFrom / this.ds)) : 0;
      let a1 = N;
      if (this.loop) {
        const gap = k > 0 ? pts[k].distanceTo(pts[k - 1]) : 400;
        a1 = Math.min(N, Math.floor((scanFrom + gap * 1.7 + 900) / this.ds));
      }
      for (let i = a0; i <= a1; i++) {
        const d = flat[i].distanceToSquared(target);
        if (d < bd) { bd = d; best = i; }
      }
      scanFrom = best * this.ds;
      const i0 = Math.max(0, best - 1), i1 = Math.min(N, best + 1);
      const seg = flat[i1].clone().sub(flat[i0]);
      const sl = seg.length() || 1;
      const proj = clamp(target.clone().sub(flat[i0]).dot(seg) / sl, 0, sl);
      this.stationS.push((i0 * this.ds) + proj);
    }

    /* —— 纵断面 —— */
    const eS = this.stationS, eY = this.stationY;
    const elevAt = (s) => {
      if (s <= eS[0]) return eY[0];
      for (let i = 0; i < eS.length - 1; i++) {
        if (s <= eS[i + 1]) {
          const gap = eS[i + 1] - eS[i];
          const ramp = Math.min(900, gap * 0.8);
          const start = eS[i] + (gap - ramp) / 2;
          return lerp(eY[i], eY[i + 1], smoothstep((s - start) / ramp));
        }
      }
      return eY[eY.length - 1];
    };
    this.elevAt = elevAt;

    /* —— 三维采样 —— */
    this.P = []; this.T = []; this.R = []; this.U = [];
    this.G = new Float32Array(N + 1);
    this.K = new Float32Array(N + 1);
    this.S = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const s = i * this.ds;
      this.S[i] = s;
      this.P.push(new THREE.Vector3(flat[i].x, elevAt(s), flat[i].z));
    }
    /* —— 站内线路拉直：保证列车与直线站台、屏蔽门精确对齐 —— */
    for (let k = 0; k < this.stationS.length; k++) {
      const s0 = this.stationS[k];
      const iC = clamp(Math.round(s0 / this.ds), 2, N - 2);
      const base = this.P[iC].clone();
      const tan = this.P[iC + 2].clone().sub(this.P[iC - 2]).normalize();
      for (let i = 0; i <= N; i++) {
        const d = this.S[i] - s0;
        const ad = Math.abs(d);
        if (ad > 150) continue;
        const w = ad < 73 ? 1 : 1 - smoothstep((ad - 73) / 77);
        if (w <= 0) continue;
        this.P[i].x = lerp(this.P[i].x, base.x + tan.x * d, w);
        this.P[i].z = lerp(this.P[i].z, base.z + tan.z * d, w);
      }
    }

    const UP = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i <= N; i++) {
      const a = this.P[Math.max(0, i - 1)], b = this.P[Math.min(N, i + 1)];
      const t = b.clone().sub(a).normalize();
      const r = new THREE.Vector3().crossVectors(UP, t).normalize();
      const u = new THREE.Vector3().crossVectors(t, r).normalize();
      this.T.push(t); this.R.push(r); this.U.push(u);
      if (i > 0 && i < N) this.G[i] = (this.P[i + 1].y - this.P[i - 1].y) / (2 * this.ds);
    }
    this.G[0] = this.G[1]; this.G[N] = this.G[N - 1];

    /* —— 曲率半径与限速 —— */
    this.LIM = new Float32Array(N + 1);
    const vk = this.vmax / VMAX;
    for (let i = 0; i <= N; i++) {
      let lim = this.vmax;
      if (i > 0 && i < N) {
        const a = this.T[i - 1], b = this.T[i + 1];
        const ang = Math.acos(clamp(a.dot(b), -1, 1));
        const k = ang / (2 * this.ds);
        this.K[i] = k;
        const R = k > 1e-6 ? 1 / k : 1e6;
        lim = (R > 760 ? 80 : R > 560 ? 72 : R > 420 ? 62 : R > 300 ? 52 : 45) * vk;
      } else { this.K[i] = 0; }
      this.LIM[i] = lim;
    }

    /* —— 环线终到：回到起点站台 —— */
    this.loopEndS = -1;
    if (this.loop) {
      const target = new THREE.Vector3(pts[0].x, 0, pts[0].y);
      let best = -1, bd = Infinity;
      const i0 = Math.floor((this.stationS[this.stationS.length - 1] + 200) / this.ds);
      for (let i = i0; i <= N; i++) {
        const d = flat[i].distanceToSquared(target);
        if (d < bd) { bd = d; best = i; }
      }
      if (best > 0) this.loopEndS = best * this.ds;
    }

    /* —— 车站附加信息 —— */
    this.stations = raw.map((st, i) => {
      const p = this.project(st.lat, st.lon);
      const s = this.stationS[i];
      const f = this.frameAt(s);
      return {
        ...st, index: i, s, stopS: s + 70, platformLen: 140,
        x: p.x, z: p.z, frame: f,
        dist: i > 0 ? s - this.stationS[i - 1] : 0
      };
    });
    if (this.loop && this.loopEndS > 0) {
      const lastS = this.stationS[this.stationS.length - 1];
      this.stations.push({
        ...raw[0], index: this.stations.length, s: this.loopEndS,
        stopS: this.loopEndS + 70, platformLen: 140,
        x: this.stations[0].x, z: this.stations[0].z,
        frame: this.frameAt(this.loopEndS), synthetic: true, loopEnd: true,
        dist: this.loopEndS - lastS
      });
    }

    /* —— 停站计划与时刻表 —— */
    const served = this.def.stopPlan ? new Set(this.def.stopPlan) : null;
    this.stations.forEach((st, i) => { st.served = !served || served.has(i); });
    this.buildSchedule();
  }

  project(lat, lon) {
    return {
      x: (lon - this.origin.lon) * this.KX,
      z: (this.origin.lat - lat) * this.KZ
    };
  }
  projectLL(lat, lon) { return this.project(lat, lon); }

  frameAt(s) {
    const f = clamp(s / this.ds, 0, this.N - 1e-4);
    const i = Math.floor(f), t = f - i;
    const p = new THREE.Vector3().lerpVectors(this.P[i], this.P[i + 1], t);
    const tan = new THREE.Vector3().lerpVectors(this.T[i], this.T[i + 1], t).normalize();
    const right = new THREE.Vector3().lerpVectors(this.R[i], this.R[i + 1], t).normalize();
    const up = new THREE.Vector3().crossVectors(tan, right).normalize();
    return { pos: p, tan, right, up };
  }
  pointAt(s, lateral = 0, vert = 0) {
    const f = clamp(s / this.ds, 0, this.N - 1e-4);
    const i = Math.floor(f), t = f - i;
    return new THREE.Vector3().lerpVectors(this.P[i], this.P[i + 1], t)
      .addScaledVector(this.R[i], lateral).addScaledVector(new THREE.Vector3(0, 1, 0), vert);
  }

  /* ----------------------------------------------------------------
     道岔横移：进路反位时，列车在渡线区间从一条正线横移到另一条。
     由 IX 在折返过程中登记，平时为空数组（零开销）。
     ---------------------------------------------------------------- */
  clearCrossovers() { this.xo = []; }
  addCrossover(s0, s1, delta) {
    if (!(s1 > s0)) return;
    (this.xo || (this.xo = [])).push({ s0, s1, delta });
  }
  /** 该里程处的累计横向偏移（基准 lateral + 已通过的渡线位移） */
  lateralAt(s, base = 0) {
    const xs = this.xo;
    if (!xs || !xs.length) return base;
    let lat = base;
    for (let i = 0; i < xs.length; i++) {
      const t = xs[i];
      if (s <= t.s0) continue;
      if (s >= t.s1) { lat += t.delta; continue; }
      lat += t.delta * smoothstep((s - t.s0) / (t.s1 - t.s0));
    }
    return lat;
  }
  /** 含横向偏移的位姿。横移段用差分重算切向，车身跟着转向而不是横向侧滑。 */
  poseAt(s, lateral = 0) {
    const f = this.frameAt(s);
    if (!this.xo || !this.xo.length) {
      return { pos: f.pos.clone().addScaledVector(f.right, lateral), tan: f.tan, right: f.right, up: f.up };
    }
    const pos = f.pos.clone().addScaledVector(f.right, this.lateralAt(s, lateral));
    const h = 2.0;
    const sa = clamp(s - h, 0, this.length), sb = clamp(s + h, 0, this.length);
    const fa = this.frameAt(sa), fb = this.frameAt(sb);
    const pa = fa.pos.clone().addScaledVector(fa.right, this.lateralAt(sa, lateral));
    const pb = fb.pos.clone().addScaledVector(fb.right, this.lateralAt(sb, lateral));
    const tan = pb.clone().sub(pa).normalize();
    if (!isFinite(tan.x)) return { pos, tan: f.tan, right: f.right, up: f.up };
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), tan).normalize();
    return { pos, tan, right, up: new THREE.Vector3().crossVectors(tan, right).normalize() };
  }
  tangentAt(s) {
    const i = clamp(Math.round(s / this.ds), 0, this.N);
    return this.T[i].clone();
  }
  gradeAt(s) {
    const i = clamp(Math.round(s / this.ds), 0, this.N);
    return this.G[i];
  }
  curvatureAt(s) {
    const i = clamp(Math.round(s / this.ds), 0, this.N);
    return this.K[i];
  }
  /** 静态限速（含 400m 前瞻制动曲线），返回 km/h */
  atpLimit(s, v) {
    let lim = 999;
    const base = this.LIM[clamp(Math.round(s / this.ds), 0, this.N)];
    lim = base;
    const look = 620;
    for (let d = 0; d <= look; d += 20) {
      const idx = clamp(Math.round((s + d) / this.ds), 0, this.N);
      const vl = this.LIM[idx];
      const vms = vl * KMH;
      const allow = Math.sqrt(vms * vms + 2 * 0.52 * d) * 3.6;
      if (allow < lim) lim = allow;
    }
    return lim;
  }
  buildSchedule() {
    const st = this.stations;
    const startSec = parseClock(this.def.start);
    const order = st.map((s, i) => i).filter(i => st[i].served !== false);
    const first = order[0];
    const off = (typeof OFFICIAL_RUN !== 'undefined' && OFFICIAL_RUN[this.def.id])
      || (typeof OFFICIAL_RUN_NETWORK !== 'undefined' && OFFICIAL_RUN_NETWORK[this.def.id])
      || null;
    st[first].schArr = startSec - this.def.dwell;
    st[first].schDep = startSec;
    for (let k = 1; k < order.length; k++) {
      const a = st[order[k - 1]], b = st[order[k]];
      let run = 0, official = false;
      if (off) {
        let sum = 0, ok = true;
        for (let j = order[k - 1] + 1; j <= order[k]; j++) {
          const v = off[j - 1];
          if (v == null) { ok = false; break; }
          sum += v;
        }
        if (ok && sum > 0) { run = sum; official = true; }
      }
      if (!official) run = estimateRunTime(Math.max(60, b.stopS - a.stopS), this.vmax) + 6;
      b.schArr = a.schDep + run;
      b.schDep = b.schArr + this.def.dwell;
    }
    st.forEach(s => { if (s.served === false) { s.schArr = null; s.schDep = null; } });
    this.startSec = startSec;
  }
  totalMeters() { return this.stations[this.stations.length - 1].stopS - this.stations[0].stopS; }
}

function parseClock(str) {
  const [h, m, s] = str.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
}
