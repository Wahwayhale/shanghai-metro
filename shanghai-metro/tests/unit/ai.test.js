/* ------------------------------------------------------------------
   AI 决策核心单测（54_aibody.js）

   不需要浏览器、不需要 Three.js、不需要 RoutePath。
   传一个假线路（只有 length / stations[].stopS / atpLimit）就能跑，
   因此可以把 AI 的状态机从「加载 10 秒 + 仿真 20 秒」压到毫秒级。

   覆盖：
   1. 区间限速跟随（atpLimit）
   2. 停车曲线：接近停车标时目标速度收敛到 0
   3. 停稳 → dwell，dwell 结束 → 发车并 idx+1
   4. 跳停：skip 标记通过站台后清掉且 idx 前进
   5. 越站：d<−6 时放行到下一站并报 station:missed
   6. 跟车：前车太近时目标速度被压下来
   7. 折返：34 秒后 dir 取反、lateral 取反
   8. 扣车：holdT 期间速度被压、dwell 不结束
   9. 不依赖渲染：跑完全程不会碰任何 Three.js 对象
   ------------------------------------------------------------------ */
const path = require('path');
const { aiUpdate, AI_DEFAULTS, aiClamp } = require(path.join(__dirname, '..', '..', 'parts', '54_aibody.js'));

let pass = 0, fail = 0;
const failed = [];
function ok(name, cond, detail) {
  if (cond) pass++;
  else { fail++; failed.push({ name, detail }); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* ---------------- 假线路 ---------------- */
function makePath(spacing = 1500, count = 5, vmaxKmh = 80) {
  const stations = [];
  for (let i = 0; i < count; i++) stations.push({ stopS: 500 + i * spacing, zh: 'T' + i });
  return {
    length: 500 + (count - 1) * spacing + 600,
    stations,
    /* 简化 ATP：恒定限速，可被 atpVmax 覆盖 */
    atpVmax: vmaxKmh,
    atpLimit() { return this.atpVmax; }
  };
}

/* ---------------- 假 AI 实例（只具备 aiUpdate 需要的字段） ---------------- */
function makeSelf(opts = {}) {
  const self = {
    dir: opts.dir || 1,
    lateral: opts.lateral != null ? opts.lateral : 5.72,
    carNo: opts.carNo || '0214',
    cars: 6,
    vmax: opts.vmax || 80,
    vmaxMs: (opts.vmax || 80) * (1 / 3.6),
    len: 6 * 22.8 + 5 * 0.35,
    s: opts.s || 0,
    v: opts.v || 0,
    idx: opts.idx != null ? opts.idx : 1,
    state: opts.state || 'run',
    dwellT: opts.dwellT || 0,
    dwellNeed: opts.dwellNeed || 0,
    holdT: 0,
    skip: !!opts.skip,
    stops: opts.stops !== false,
    doorT: 0,
    seed: 3,
    phase: 0,
    path: opts.path || makePath(),
    nearestStationIdx() {
      let bi = 0, bd = Infinity;
      this.path.stations.forEach((st, i) => {
        const d = Math.abs(st.stopS - this.s);
        if (d < bd) { bd = d; bi = i; }
      });
      return bi;
    },
    gapToStop(idx) {
      const st = this.path.stations[idx];
      if (!st) return 0;
      return this.dir > 0 ? st.stopS - this.s : this.s - st.stopS;
    }
  };
  return self;
}

/* 跑 n 步，返回每步快照 */
function run(self, steps, dt = 0.02, P = null, ldFn = null) {
  const path = P || self.path;
  const trace = [];
  const events = [];
  for (let i = 0; i < steps; i++) {
    const ld = ldFn ? ldFn(self, i) : null;
    const r = aiUpdate(self, dt, ld, self._C);
    if (r.events.length) events.push(...r.events.map(e => ({ e, i })));
    trace.push({ s: self.s, v: self.v, state: self.state, idx: self.idx });
  }
  return { trace, events, self };
}

/* ========== 1. 区间限速跟随 ========== */
{
  const P = makePath(1500, 5, 50);          // 限速 50 km/h
  const self = makeSelf({ s: 500, v: 0, idx: 1, path: P });
  run(self, 400, 0.02, P);
  const vMaxSeen = Math.max(...Array.from({ length: 1 }, () => self.v));
  ok('速度不超过线路限速', self.v <= 50 * (1 / 3.6) + 0.5, self.v * 3.6);

  const P2 = makePath(1500, 5, 80);
  const self2 = makeSelf({ s: 500, v: 0, idx: 1, path: P2 });
  run(self2, 800, 0.02, P2);
  ok('限速放宽后跑得更快', self2.v > self.v, { v80: self2.v, v50: self.v });
}

/* ========== 2. 停车曲线收敛 ========== */
{
  const P = makePath(1500, 5, 80);
  const st = P.stations[1];
  /* 从 400 m 外、80 km/h 全速接近，AI 应主动减速并停住 */
  const self = makeSelf({ s: st.stopS - 400, v: 0, idx: 1, path: P });
  run(self, 300, 0.02, P);
  const vCruise = self.v;
  ok('远离停车标时正常行驶', vCruise > 5, vCruise);

  /* 一路跑到停稳 */
  for (let i = 0; i < 3000; i++) {
    aiUpdate(self, 0.02, null, self._C);
    if (self.state === 'dwell') break;
  }
  ok('最终停稳', self.v < 0.3, self.v);
  ok('停稳后进入 dwell', self.state === 'dwell', { state: self.state, s: self.s });
  ok('停在对准位置（误差 < 0.5 m）',
    Math.abs(self.s - st.stopS) < 0.5, { s: self.s, target: st.stopS });
}

/* ========== 3. 停稳 → dwell → 发车 ========== */
{
  const P = makePath(1500, 5, 80);
  const self = makeSelf({ s: P.stations[1].stopS - 2, v: 0.2, idx: 1, path: P });
  const r = run(self, 60, 0.02, P);
  ok('在停车标附近停住即进入 dwell', self.state === 'dwell', { state: self.state, s: self.s });
  ok('dwell 时速度归零', self.v === 0);
  ok('dwell 时对齐停车标', near(self.s, P.stations[1].stopS, 1e-6), self.s);
  ok('dwellNeed 落在 26~38 秒区间', self.dwellNeed >= 26 && self.dwellNeed <= 38, self.dwellNeed);

  /* 推到 dwell 结束 */
  const idxBefore = self.idx;
  run(self, Math.ceil((self.dwellNeed + 2) / 0.02), 0.02, P);
  ok('dwell 结束后恢复运行', self.state === 'run', self.state);
  ok('dwell 结束后 idx 前进', self.idx === idxBefore + 1, { before: idxBefore, after: self.idx });
}

/* ========== 4. 跳停 ========== */
{
  const P = makePath(1500, 5, 80);
  const self = makeSelf({ s: P.stations[1].stopS + 1, v: 10, idx: 1, path: P, skip: true });
  const idxBefore = self.idx;
  const r = run(self, 100, 0.02, P);
  ok('跳停标记通过站台后被清除', self.skip === false);
  ok('跳停后 idx 前进', self.idx > idxBefore, { before: idxBefore, after: self.idx });
  ok('跳停不进入 dwell', self.state !== 'dwell', self.state);
}

/* ========== 5. 越站 ========== */
{
  const P = makePath(1500, 5, 80);
  /* 已越过停车标 10 m */
  const self = makeSelf({ s: P.stations[1].stopS + 10, v: 8, idx: 1, path: P });
  const idxBefore = self.idx;
  const r = run(self, 50, 0.02, P);
  ok('越站后 idx 前进', self.idx > idxBefore, { before: idxBefore, after: self.idx });
  ok('越站产生 station:missed 事件', r.events.some(x => x.e === 'station:missed'), r.events);
}

/* ========== 6. 跟车 ========== */
{
  const P = makePath(1500, 5, 80);
  const free = makeSelf({ s: 600, v: 20, idx: 1, path: P });
  run(free, 300, 0.02, P, null);

  const followed = makeSelf({ s: 600, v: 20, idx: 1, path: P });
  run(followed, 300, 0.02, P, () => ({ gap: 40, v: 8 }));

  ok('前车过近时速度被压低', followed.v < free.v, { free: free.v, followed: followed.v });
}

/* ========== 7. 折返 ========== */
{
  const P = makePath(1500, 5, 80);
  /* 停在最后一个站（模拟到达终点）*/
  const self = makeSelf({ s: P.stations[4].stopS, v: 0, idx: 4, dir: 1, lateral: 5.72, path: P });
  /* 让 idx 越界以触发折返 */
  self.idx = 5;
  const r1 = run(self, 5, 0.02, P);
  ok('目标站越界 → 进入 turnback', self.state === 'turnback', self.state);
  ok('越界产生 turnback:begin 事件', r1.events.some(x => x.e === 'turnback:begin'), r1.events);

  /* 折返 34 秒 */
  run(self, 1750, 0.02, P);       // 35 秒
  ok('折返后方向反转', self.dir === -1, self.dir);
  ok('折返后横向位置镜像', near(self.lateral, -5.72, 1e-9), self.lateral);
  ok('折返产生 turnback:done 事件或恢复运行',
    self.state === 'run' || self.dwellT < 1, { state: self.state, dwellT: self.dwellT });
}

/* ========== 8. 扣车 ========== */
{
  const P = makePath(1500, 5, 80);
  const self = makeSelf({ s: P.stations[1].stopS, v: 0, state: 'dwell', dwellT: 20, dwellNeed: 26, path: P });
  self.holdT = 60;
  run(self, 500, 0.02, P);        // 10 秒
  ok('扣车期间不结束 dwell', self.state === 'dwell', { state: self.state, dwellT: self.dwellT });
  ok('扣车计时递减', self.holdT < 60, self.holdT);
}

/* ========== 9. 纯逻辑：全程不触碰渲染 ========== */
{
  const P = makePath(1500, 5, 80);
  const self = makeSelf({ s: 500, v: 0, idx: 1, path: P });
  /* 如果 aiUpdate 里混进了 this.train.* 之类，这里会直接抛错 */
  let threw = null;
  try { run(self, 300, 0.02, P); } catch (e) { threw = e.message; }
  ok('aiUpdate 不依赖任何渲染对象', threw === null, threw);
  ok('aiUpdate 返回 events 数组', Array.isArray(aiUpdate(self, 0.02, null, {}).events));
}

/* ========== 10. 常量可覆盖 ========== */
{
  const P = makePath(1500, 5, 80);
  const slow = makeSelf({ s: 600, v: 0, idx: 1, path: P });
  const fast = makeSelf({ s: 600, v: 0, idx: 1, path: P });
  run(slow, 200, 0.02, P);
  const C = { AI_ACC: 0.2 };      // 大幅降低牵引力
  for (let i = 0; i < 200; i++) aiUpdate(fast, 0.02, null, C);
  ok('AI_ACC 可被覆盖并影响速度', fast.v < slow.v, { fast: fast.v, slow: slow.v });
}

/* ========== 性能：一次跑 3000 步 ========== */
{
  const P = makePath(1500, 8, 80);
  const self = makeSelf({ s: 500, v: 0, idx: 1, path: P });
  const t0 = Date.now();
  run(self, 3000, 0.02, P);
  const ms = Date.now() - t0;
  ok('3000 步耗时 < 50 ms', ms < 50, ms + 'ms');
}

const out = { passed: fail === 0, pass, fail, failed };
console.log(JSON.stringify(out, null, 1));
process.exit(out.passed ? 0 : 1);
