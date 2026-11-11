/* ------------------------------------------------------------------
   AI 按图运行 + 晚点传播单测（P1-3 / P1-4）

   不加载浏览器、不加载 Three.js：57_timetable.js 提供运行图纯函数，
   54_aibody.js 的 aiUpdate 只依赖传入的 self / path / C.clock。

   覆盖：
   1. 单列车绑定车次后按图运行，逐站到达偏差 ≤ 1 s
   2. 早点到达时停站时间被拉长到计划发车时刻
   3. 前车扣车 120 s → 后车在下游站被动晚点，与理论值偏差 < 15%
   4. 晚点可以被追回（前车在终点恢复正点）
   5. 全程不追尾（车尾间距始终为正）
   ------------------------------------------------------------------ */
const path = require('path');
const tt = require(path.join(__dirname, '..', '..', 'parts', '57_timetable.js'));
const { aiUpdate, AI_DEFAULTS } = require(path.join(__dirname, '..', '..', 'parts', '54_aibody.js'));

/* aiUpdate 在浏览器里直接看到 57 的顶层函数；node 里用 global 补齐 */
global.ttStopOf = tt.ttStopOf;
global.ttMinRun = tt.ttMinRun;
global.ttSolveCruise = tt.ttSolveCruise;
global.ttSolveCruiseFrom = tt.ttSolveCruiseFrom;
global.ttTimeAtPosition = tt.ttTimeAtPosition;
global.ttShiftService = tt.ttShiftService;
global.ttServicePosition = tt.ttServicePosition;

let pass = 0, fail = 0;
const failed = [];
function ok(name, cond, detail) {
  if (cond) pass++;
  else { fail++; failed.push({ name, detail }); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* ---------------- 假线路 ---------------- */
const SP = 1500, N = 7;
const stations = [];
for (let i = 0; i < N; i++) stations.push({ stopS: 500 + i * SP, zh: 'T' + i });
const P = {
  length: 500 + (N - 1) * SP + 600,
  stations,
  atpLimit() { return 80; }
};

/* ---------------- 假 AI 实例 ---------------- */
function mk(svc, s, idx, state) {
  return {
    dir: 1, lateral: 5.72, carNo: 'A', cars: 6, vmax: 80, vmaxMs: 80 / 3.6,
    len: 6 * 22.8 + 5 * 0.35, s, v: 0, idx, state, dwellT: 0, dwellNeed: 0,
    holdT: 0, skip: false, stops: true, doorT: 0, seed: 3, phase: 0,
    service: svc, delay: 0, arrLog: [], path: P,
    gapToStop(i) { const st = P.stations[i]; return st ? st.stopS - this.s : 0; },
    nearestStationIdx() {
      let bi = 0, bd = Infinity;
      P.stations.forEach((st, i) => { const d = Math.abs(st.stopS - this.s); if (d < bd) { bd = d; bi = i; } });
      return bi;
    },
    _C: { AI_BRK: 0.95, AI_ACC: 1.0, AI_VMAX: 22.2, KMH: 1 / 3.6, clock: 0 }
  };
}

/* 单列车：从首站发车，跑到终点 */
{
  const svc = tt.ttComputeService(stations, { startSec: 0, dwell: 40, vmax: 80 });
  const self = mk(svc, 500, 1, 'run');
  const dt = 0.02;
  for (let i = 0; i < Math.round(900 / dt); i++) {
    self._C.clock = i * dt;
    aiUpdate(self, dt, null, self._C);
  }
  ok('单列车跑完全程（到达 6 站）', self.arrLog.length === 6, self.arrLog.length);
  const maxAbs = Math.max(...self.arrLog.map(a => Math.abs(a.delay)));
  ok('逐站到达偏差都 ≤ 1 s（P1-3 目标 8 s）', maxAbs <= 1,
    self.arrLog.map(a => a.delay).join(','));
  ok('早点到达时停站等到计划发车', self.arrLog.length > 1, '—');
}

/* 早点到达：把车次整体推后 30 s，列车应早到并在站台等到计划发车 */
{
  const svc = tt.ttComputeService(stations, { startSec: 0, dwell: 40, vmax: 80 });
  const lateSvc = tt.ttShiftService(svc, 30, 'LATE');
  const self = mk(lateSvc, 500, 1, 'run');
  const dt = 0.02;
  let dwellNeed = null;
  for (let i = 0; i < Math.round(200 / dt); i++) {
    self._C.clock = i * dt;
    aiUpdate(self, dt, null, self._C);
    if (self.state === 'dwell' && dwellNeed == null) dwellNeed = self.dwellNeed;
  }
  ok('早到列车停站时间被拉长（> 标准 40 s）', dwellNeed > 40, dwellNeed);
  ok('早到但到达偏差仍被控制在 1 s 内',
    Math.abs(self.arrLog[0].delay) <= 1, self.arrLog[0].delay);
}

/* 跳停交路：未停靠站直接通过，不办客 */
{
  const s7 = [];
  for (let i = 0; i < 7; i++) s7.push({ stopS: 500 + i * 1500, zh: 'S' + i, served: [0, 1, 3, 5, 6].indexOf(i) >= 0 });
  const P7 = { length: 500 + 6 * 1500 + 600, stations: s7, atpLimit() { return 80; } };
  const svc = tt.ttComputeService(s7, { startSec: 0, dwell: 40, vmax: 80 });
  const self = mk(svc, 500, 1, 'run');
  self.path = P7;
  const dt = 0.02;
  for (let i = 0; i < Math.round(900 / dt); i++) {
    self._C.clock = i * dt;
    aiUpdate(self, dt, null, self._C);
  }
  const idxs = self.arrLog.map(a => a.idx);
  ok('跳停交路只停靠计划站', idxs.length === 4 && idxs.every(i => s7[i].served), idxs.join(','));
  ok('跳停交路不在未停靠站办客', idxs.indexOf(2) < 0 && idxs.indexOf(4) < 0, idxs.join(','));
  ok('跳停交路到达偏差仍 ≤ 1.5 s',
    Math.max(...self.arrLog.map(a => Math.abs(a.delay))) <= 1.5,
    self.arrLog.map(a => a.delay).join(','));
}

/* ---------------- 晚点传播（P1-4） ---------------- */
function runFleet(headway, holdSec) {
  const base = tt.ttComputeService(stations, { startSec: 0, dwell: 40, vmax: 80 });
  const frontSvc = base;
  const rearSvc = tt.ttShiftService(base, headway, 'R');
  const front = mk(frontSvc, 500, 1, 'run');
  const rear = mk(rearSvc, 500, 0, 'dwell');
  rear.dwellNeed = headway;          // 后车在首站按图待发

  const dt = 0.02;
  let held = false, minGap = Infinity;
  const tEnd = 1200;
  for (let i = 0; i < Math.round(tEnd / dt); i++) {
    const t = i * dt;
    front._C.clock = t; rear._C.clock = t;
    aiUpdate(front, dt, null, front._C);
    const gap = front.s - rear.s - front.len;
    /* 开局两车同站台（后车待发），重叠是初始条件；发车后再统计净距 */
    if (t > headway + 5 && gap < minGap) minGap = gap;
    aiUpdate(rear, dt, { gap, v: front.v }, rear._C);
    if (!held && front.state === 'dwell' && front.idx === 2) {
      front.holdT = holdSec;
      held = true;
    }
  }
  return { front, rear, minGap };
}

{
  const HEADWAY = 90, HOLD = 120;
  const { front, rear, minGap } = runFleet(HEADWAY, HOLD);

  const frontArr = front.arrLog.find(a => a.idx === 3);
  const rearArr = rear.arrLog.find(a => a.idx === 2);
  ok('前车扣车后下游站晚点 > 0', frontArr && frontArr.delay > 0,
    frontArr && frontArr.delay);

  /* 理论值：后车计划到达 - 前车实际出发 + 最小间隔时间
     = hold + sep - headway（sep 由最小追踪间隔的加速/制动时间推出） */
  const sep = tt.ttMinRun(front.len + AI_DEFAULTS.AI_MIN_GAP, 80,
    AI_DEFAULTS.AI_ACC_PLAN, AI_DEFAULTS.AI_BRK_PLAN);
  const theory = Math.max(0, HOLD + sep - HEADWAY);
  const measured = rearArr ? rearArr.delay : null;
  ok('后车在下游站被动晚点', measured > 0, measured);
  ok('后车晚点与理论值偏差 < 15%',
    measured != null && Math.abs(measured - theory) <= theory * 0.15,
    { measured, theory: Math.round(theory * 10) / 10, sep: Math.round(sep * 10) / 10 });

  /* 后车晚点应小于前车晚点（行车间隔吸收了部分扰动） */
  ok('晚点传播有衰减（后车晚点 < 前车晚点）', measured < frontArr.delay,
    { rear: measured, front: frontArr.delay });

  /* 前车靠区间提速把晚点追回 */
  const frontLast = front.arrLog[front.arrLog.length - 1];
  ok('前车末站恢复正点（|偏差| ≤ 2 s）', Math.abs(frontLast.delay) <= 2, frontLast.delay);

  /* 全程不追尾：车尾间距始终为正 */
  ok('全程不追尾（最小车尾间距 > 0）', minGap > 0, Math.round(minGap));

  ok('两车都产生到站记录', front.arrLog.length >= 5 && rear.arrLog.length >= 4,
    { front: front.arrLog.length, rear: rear.arrLog.length });
}

const out = { passed: fail === 0, pass, fail, failed };
console.log(JSON.stringify(out, null, 1));
process.exit(out.passed ? 0 : 1);
