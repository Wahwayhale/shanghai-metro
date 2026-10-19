/* =====================================================================
   AI 列车：本务之外的其它列车
   —— 对向车（另一条正线）、同向车（本务前方，可被追踪）
   —— 按站停站、按曲线限速、跟车保持间隔、终端折返

   决策逻辑已抽到 54_aibody.js（aiUpdate，纯函数、零 Three.js 依赖）。
   本文件只负责：构造 Three.js 车辆、把决策结果同步到车体、布置场景。
   ===================================================================== */
const AI_BRK = 0.95;        // AI 常用制动
const AI_ACC = 1.0;         // AI 牵引
const AI_VMAX = 22.2;       // 80 km/h

class AiTrain {
  constructor(path, line, opts = {}) {
    this.path = path;
    this.line = line;
    this.dir = opts.dir || 1;
    this.lateral = opts.lateral || TRACK_LAT;
    this.carNo = opts.carNo || '0000';
    this.cars = opts.cars || 6;
    this.vmax = line.vmax || (AI_VMAX * 3.6);
    this.vmaxMs = this.vmax * KMH;
    this.len = this.cars * CAR_LEN + (this.cars - 1) * CAR_GAP;
    this.s = opts.s || 0;
    this.v = opts.v || 0;
    this.idx = opts.idx != null ? opts.idx : 1;
    this.state = 'run';           // run / dwell / turnback
    this.dwellT = 0;
    this.dwellNeed = 0;
    this.holdT = 0;               // 调度扣车（秒）
    this.skip = false;            // 下一站跳停
    this.stops = opts.stops !== false;
    this.doorT = 0;
    this.dead = false;
    this.seed = (parseInt(this.carNo, 10) || 7) % 13;
    this.dest = opts.dest || line.stations[line.stations.length - 1];
    this.train = new Train(line, path, {
      cars: this.cars, player: false, lateral: this.lateral,
      dir: this.dir, dest: this.dest
    });
    this.train.ai = this;
    this.phase = 0;
    this.s0 = this.s; this.v0 = this.v; this.idx0 = this.idx;
    this.dir0 = this.dir; this.lat0 = this.lateral;
    /* 决策用的常量包（与全局常量一致，便于单测覆盖） */
    this._C = { AI_BRK, AI_ACC, AI_VMAX, KMH };
    this._events = [];
  }

  reset() {
    this.s = this.s0; this.v = this.v0; this.idx = this.idx0;
    this.dir = this.dir0; this.lateral = this.lat0;
    this.state = 'run'; this.dwellT = 0; this.dwellNeed = 0;
    this.holdT = 0; this.skip = false; this.doorT = 0;
    this.train.lateral = this.lateral;
    this.train.dir = this.dir;
    this.train.setDoorT(0);
    this.train.carLag.fill(0);
    this.train._lastV = 0;
    this.train.update(this.s, this.v, 0);
  }

  /* 车头到下一停车标的距离（带符号，正为尚未到达） */
  gapToStop(idx) {
    const st = this.path.stations[idx];
    if (!st) return 0;
    return this.dir > 0 ? st.stopS - this.s : this.s - st.stopS;
  }

  /* 前方同向、同股道的最近列车（含本务） */
  leader() {
    let best = null, bd = Infinity;
    for (const o of aiTrains) {
      if (o === this || o.dead) continue;
      if (o.dir !== this.dir) continue;
      if (Math.abs(o.lateral - this.lateral) > 0.05) continue;
      const gap = this.dir > 0 ? (o.s - this.s) - o.len : (this.s - o.s) - o.len;
      if (gap > -1 && gap < bd) { bd = gap; best = { gap, v: o.v }; }
    }
    if (G.mode === 'driving' && train && this.dir === 1 && Math.abs(this.lateral + TRACK_LAT) < 0.05) {
      const gap = (G.s - this.s) - this.len;
      if (gap > -1 && gap < bd) { bd = gap; best = { gap, v: G.v }; }
    }
    return best;
  }

  update(dt) {
    if (this.dead) return;
    /* 决策逻辑在 54_aibody.js（纯函数，可脱离浏览器测试）；
       这里只负责把结果同步到 Three.js 车辆上。 */
    const r = aiUpdate(this, dt, this.leader(), this._C);
    this._events = r.events;
    if (this.train) {
      this.train.lateral = this.lateral;
      this.train.dir = this.dir;
      this.train.setDoorT(this.doorT);
      this.train.update(this.s, this.v, dt);
    }
  }

  nearestStationIdx() {
    let bi = 0, bd = Infinity;
    this.path.stations.forEach((st, i) => {
      const d = Math.abs(st.stopS - this.s);
      if (d < bd) { bd = d; bi = i; }
    });
    return bi;
  }

  /* 调度命令 */
  command(kind, arg) {
    if (kind === 'hold') { this.holdT = Math.max(this.holdT, arg || 60); this.dwellNeed = Math.max(this.dwellNeed, 2); return true; }
    if (kind === 'skip') { this.skip = true; return true; }
    if (kind === 'go') { this.dwellT = this.dwellNeed; this.holdT = 0; return true; }
    return false;
  }

  dispose(root) {
    this.dead = true;
    root.remove(this.train.group);
    this.train.group.traverse(o => {
      if (o.isMesh && o.geometry && o.geometry.dispose) o.geometry.dispose();
    });
  }
}

/* ------------------------------------------------------------------ 布置 */
function spawnAiTrains(path, line, root) {
  aiTrains = [];
  const sts = path.stations;
  const n = sts.length;
  const L = path.length;

  // 对向车：另一条正线，从终点方向开来，通过不停站
  const opp = [
    { s: L * 0.86, v: 16, carNo: '0226' },
    { s: L * 0.44, v: 18, carNo: '0231' }
  ];
  let k = 0;
  for (const o of opp) {
    let idx = 0, bd = Infinity;
    sts.forEach((st, i) => { const d = Math.abs(st.stopS - o.s); if (d < bd) { bd = d; idx = i; } });
    const ai = new AiTrain(path, line, {
      dir: -1, lateral: TRACK_LAT, s: o.s, v: o.v, idx: Math.max(0, idx - 1),
      carNo: o.carNo, stops: false, dest: sts[0]
    });
    root.add(ai.train.group);
    aiTrains.push(ai);
    k++;
  }

  // 同向车：本务前方，按站停车，可被追踪
  const aheadS = clamp(sts[0].stopS + 1050, 0, L - 200);
  let idx2 = 1, bd2 = Infinity;
  sts.forEach((st, i) => { const d = Math.abs(st.stopS - aheadS); if (d < bd2) { bd2 = d; idx2 = i; } });
  const front = new AiTrain(path, line, {
    dir: 1, lateral: -TRACK_LAT, s: aheadS, v: 14,
    idx: Math.min(n - 1, idx2 + 1), carNo: '0214',
    dest: sts[n - 1]
  });
  root.add(front.train.group);
  aiTrains.push(front);

  // 前方第二列：构成追踪链，本务先跟 0214，再跟 0211
  const ahead2 = clamp(sts[0].stopS + 2450, 0, L - 120);
  let idx3 = 1, bd3 = Infinity;
  sts.forEach((st, i) => { const d = Math.abs(st.stopS - ahead2); if (d < bd3) { bd3 = d; idx3 = i; } });
  const rear = new AiTrain(path, line, {
    dir: 1, lateral: -TRACK_LAT, s: ahead2, v: 16,
    idx: Math.min(n - 1, idx3 + 1), carNo: '0211', dest: sts[n - 1]
  });
  root.add(rear.train.group);
  aiTrains.push(rear);

  return aiTrains;
}

/* ------------------------------------------------------------------ 本务的前车 */
function playerLeader() {
  let best = null, bd = Infinity;
  for (const o of aiTrains) {
    if (o.dead || o.dir !== 1) continue;
    if (Math.abs(o.lateral + TRACK_LAT) > 0.05) continue;
    const gap = (o.s - G.s) - o.len;
    if (gap > -2 && gap < bd) { bd = gap; best = { gap, v: o.v, carNo: o.carNo, s: o.s }; }
  }
  return best;
}

/* 车身长度常量（供追踪距离计算） */
function playerTrainLen() {
  return 6 * CAR_LEN + 5 * CAR_GAP;
}
