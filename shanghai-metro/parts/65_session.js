/* =====================================================================
   运营日（P2）：时段编排 / 事件时间轴 / 运营结算 / 存档
   ---------------------------------------------------------------------
   本文件是纯逻辑，不依赖 THREE / DOM，可在 node 里直接 require 单测。

   设计要点：
   1. 一局 = 一个运营时段（默认约 2 小时），由若干「值乘段」组成。
      每段是一个单程交路；段间有折返/交接时间（slack）。
   2. 事件按「种子 + 难度 + 段内相对时刻」生成，同一 seed 必然得到
      同一串事件——不依赖 Math.random，可复现、可回归。
   3. 结算按段汇总：准点率、停站误差、能耗、故障处置、乘客满意度，
      每个分项都能追溯到逐段记录，便于对账。
   ===================================================================== */

const SESSION_SCHEMA = 1;
const SESSION_TARGET_SEC = 2 * 3600;   // 目标运营时段长度

/* 三档难度：事件数量、段间余量、段数修正 */
const SESSION_DIFF = {
  easy:   { label: '见习', faults: 0, crowds: 1, slowzones: 0, dispatch: 1, slack: 360, legBonus: -1 },
  normal: { label: '常规', faults: 2, crowds: 1, slowzones: 1, dispatch: 2, slack: 300, legBonus: 0 },
  hard:   { label: '高峰', faults: 3, crowds: 2, slowzones: 2, dispatch: 2, slack: 240, legBonus: 1 }
};

/* 与 72_physics.js 的 FAULT_TYPES 权重保持一致（纯逻辑层不引用渲染文件） */
const SESSION_FAULT_TYPES = [
  { type: 'door', w: 0.34 },
  { type: 'traction', w: 0.24 },
  { type: 'signal', w: 0.20 },
  { type: 'pantograph', w: 0.12 },
  { type: 'brake', w: 0.10 }
];

function sessClamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

/* mulberry32：与项目里 RNG 同一套算法，但独立命名避免与全局冲突 */
function sessMulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function sessInt(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }

function sessPickFault(rng) {
  let r = rng();
  for (const f of SESSION_FAULT_TYPES) {
    r -= f.w;
    if (r <= 0) return f.type;
  }
  return SESSION_FAULT_TYPES[0].type;
}

/* 故障文案：与 72_physics.FAULT_TYPES 的 make() 保持同样字段 */
function sessFaultInfo(type, rng) {
  if (type === 'door') {
    const car = sessInt(rng, 2, 5);
    return { type, name: `${car} 号车门`, brief: `${car} 号车门未关闭`, hint: '按 L 切除该车门' };
  }
  if (type === 'traction') return { type, name: '牵引逆变器', brief: '牵引逆变器故障', hint: '限速 40 km/h，按 L 复位' };
  if (type === 'signal') return { type, name: '车载 ATP', brief: '车载 ATP 故障', hint: '已转入固定闭塞，按 L 复位' };
  if (type === 'pantograph') return { type, name: '受电弓', brief: '受电弓检测异常', hint: '牵引锁定，按 L 重启' };
  return { type, name: '制动系统', brief: '制动缓解不良', hint: '制动力下降，按 L 复位' };
}

/* ---------------------------------------------------------------------
   buildSessionPlan：生成整局运营时段
   ---------------------------------------------------------------------
   o {
     seed, diff, legSeconds, reverseAllowed, legCount?
   }
   返回 {
     schema, seed, diff, legSeconds, legCount, legs[], events[], totalSec
   }
   --------------------------------------------------------------------- */
function buildSessionPlan(o) {
  const opt = o || {};
  const diff = SESSION_DIFF[opt.diff] ? opt.diff : 'normal';
  const cfg = SESSION_DIFF[diff];
  const seed = (opt.seed == null ? 20261020 : opt.seed) >>> 0;
  const rng = sessMulberry32(seed ^ 0x9E3779B9);
  const legSeconds = Math.round(sessClamp(opt.legSeconds || 900, 180, 7200));
  const reverseAllowed = opt.reverseAllowed !== false;

  /* 段数：尽量铺满目标时段（默认 2 小时），受难度修正；最短 2 段、最长 6 段 */
  const targetSec = Math.max(600, opt.targetSec || SESSION_TARGET_SEC);
  let legCount = opt.legCount;
  if (!legCount) {
    legCount = Math.round(targetSec / (legSeconds + cfg.slack));
    legCount += cfg.legBonus;
  }
  legCount = Math.round(sessClamp(legCount, 2, 6));

  const legs = [];
  const events = [];
  let cursor = 0;
  for (let i = 0; i < legCount; i++) {
    const dir = (!reverseAllowed || i % 2 === 0) ? 1 : -1;
    legs.push({
      i, dir,
      startSec: cursor,
      endSec: cursor + legSeconds,
      slack: cfg.slack,
      name: `第 ${i + 1} 段`
    });
    cursor += legSeconds + cfg.slack;
  }

  /* 事件分配：尽量一张一弛，不要把三条故障塞进同一段 */
  const legOrder = [...Array(legCount).keys()];
  const shuffled = legOrder.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = sessInt(rng, 0, i);
    const t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
  }
  const pickLegs = n => shuffled.slice(0, Math.min(n, legCount));

  const add = (legIndex, atSec, kind, extra) => {
    events.push(Object.assign({
      id: `L${legIndex}-${kind}-${events.length}`,
      legIndex, atSec: Math.round(atSec), kind
    }, extra || {}));
  };

  for (const li of pickLegs(cfg.faults)) {
    const type = sessPickFault(rng);
    const info = sessFaultInfo(type, rng);
    add(li, legSeconds * (0.22 + rng() * 0.4), 'fault', { faultType: info.type, faultName: info.name });
  }
  for (const li of pickLegs(cfg.crowds)) {
    add(li, legSeconds * (0.32 + rng() * 0.45), 'crowd', { surge: sessInt(rng, 10, 18) });
  }
  for (const li of pickLegs(cfg.slowzones)) {
    add(li, legSeconds * (0.2 + rng() * 0.5), 'slowzone', {
      limit: sessInt(rng, 30, 45) | 0,
      duration: sessInt(rng, 90, 150)
    });
  }
  /* 调度指令：首段发车后一条，中段一条（"中场有 ATS 调度指令"） */
  add(0, 35 + rng() * 40, 'dispatch', { text: '调度：注意前方区间，按图行车' });
  if (cfg.dispatch > 1) {
    const mid = Math.floor(legCount / 2);
    add(mid, legSeconds * 0.5, 'dispatch', { text: '调度：中段客流上升，注意停站时间' });
  }

  events.sort((a, b) => (a.legIndex - b.legIndex) || (a.atSec - b.atSec));

  return {
    schema: SESSION_SCHEMA,
    seed, diff, legSeconds, legCount,
    legs, events,
    totalSec: cursor
  };
}

/* 某一时刻该段已经/即将触发的事件（绝对时刻） */
function sessEventsAt(plan, legIndex, legStart, now) {
  if (!plan || !plan.events) return [];
  return plan.events.filter(e => e.legIndex === legIndex && legStart + e.atSec <= now);
}

/* ---------------------------------------------------------------------
   scoreSession：运营结算
   ---------------------------------------------------------------------
   legs: [{
     punc, stopErr, energy, distanceKm,
     faults, faultsFixed, crowds, crowdsServed
   }]
   返回 { score, grade, parts, totals, legs }
   --------------------------------------------------------------------- */
function scoreSession(legs, extra) {
  const list = (legs || []).filter(Boolean);
  const n = Math.max(1, list.length);
  const sum = k => list.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const avg = k => sum(k) / n;

  const punc = sessClamp(avg('punc'), 0, 100);
  const stopErr = Math.abs(avg('stopErr'));
  const stop = sessClamp(100 - 26 * stopErr, 0, 100);
  const energy = sum('energy');
  const distanceKm = sum('distanceKm');
  const kwhPerKm = energy / Math.max(0.5, distanceKm);
  /* 能耗基准随线路最高速度走（120 km/h 的磁浮/16 号线每公里电耗更高），
     高于基准每 1 kWh/km 扣 8 分；只用于同一线路内的驾驶习惯比较。 */
  const vmax = (extra && extra.vmax) || 80;
  const refKwhPerKm = 5.5 + 0.03 * vmax;
  const energyScore = sessClamp(100 - (kwhPerKm - refKwhPerKm) * 8, 0, 100);
  const faults = sum('faults');
  const faultsFixed = sum('faultsFixed');
  const faultScore = faults > 0 ? sessClamp(100 * faultsFixed / faults, 0, 100) : 100;
  const crowds = sum('crowds');
  const crowdsServed = sum('crowdsServed');
  const satisfaction = sessClamp(100 - (crowds - crowdsServed) * 12 - (faults - faultsFixed) * 18, 0, 100);

  const score = Math.round(
    0.40 * punc + 0.22 * stop + 0.13 * energyScore + 0.15 * faultScore + 0.10 * satisfaction
  );
  const grade = score >= 93 ? 'S' : score >= 84 ? 'A' : score >= 72 ? 'B' : score >= 58 ? 'C' : 'D';

  return {
    score: sessClamp(score, 0, 100),
    grade,
    parts: {
      punc: Math.round(punc),
      stop: Math.round(stop),
      energy: Math.round(energyScore),
      fault: Math.round(faultScore),
      satisfaction: Math.round(satisfaction)
    },
    totals: {
      legs: list.length,
      energy: Math.round(energy * 10) / 10,
      distanceKm: Math.round(distanceKm * 10) / 10,
      faults, faultsFixed, crowds, crowdsServed,
      avgStopErr: Math.round(stopErr * 100) / 100,
      kwhPerKm: Math.round(kwhPerKm * 100) / 100
    },
    legs: list.map((r, i) => ({
      i: i + 1,
      punc: Math.round(Number(r.punc) || 0),
      stopErr: Math.round((Number(r.stopErr) || 0) * 100) / 100,
      energy: Math.round((Number(r.energy) || 0) * 10) / 10,
      distanceKm: Math.round((Number(r.distanceKm) || 0) * 10) / 10,
      faults: Number(r.faults) || 0,
      faultsFixed: Number(r.faultsFixed) || 0,
      crowds: Number(r.crowds) || 0,
      crowdsServed: Number(r.crowdsServed) || 0
    }))
  };
}

/* ---------------------------------------------------------------------
   存档：只做结构校验与版本迁移，不碰 localStorage（由 UI 层负责）
   --------------------------------------------------------------------- */
function sessionToSave(session) {
  if (!session) return null;
  return {
    v: SESSION_SCHEMA,
    routeId: session.routeId,
    routeIdx: session.routeIdx,
    seed: session.seed,
    diff: session.diff,
    legIndex: session.legIndex,
    legCount: session.legCount,
    pendingStart: session.pendingStart,
    legStart: session.legStart,
    phase: session.phase || 'driving',
    log: session.log || [],
    dispatch: session.dispatch || [],
    plan: session.plan || null,
    snap: session.snap || null,
    savedAt: Date.now()
  };
}

function sessionFromSave(text) {
  let d;
  try { d = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { return { ok: false, reason: '不是合法的 JSON' }; }
  if (!d || typeof d !== 'object') return { ok: false, reason: '内容为空' };
  if (d.v !== SESSION_SCHEMA) return { ok: false, reason: `不支持的运营日存档版本：${d.v}` };
  if (!d.plan || !Array.isArray(d.plan.legs) || !Array.isArray(d.plan.events)) return { ok: false, reason: '缺少时段编排' };
  const plan = d.plan;
  if (!SESSION_DIFF[plan.diff] || typeof d.legIndex !== 'number') return { ok: false, reason: '运营日数据不完整' };
  return { ok: true, data: d };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SESSION_SCHEMA, SESSION_TARGET_SEC, SESSION_DIFF, SESSION_FAULT_TYPES,
    sessClamp, sessMulberry32, sessInt, sessPickFault, sessFaultInfo,
    buildSessionPlan, sessEventsAt, scoreSession, sessionToSave, sessionFromSave
  };
}
