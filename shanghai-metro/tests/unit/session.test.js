/* ------------------------------------------------------------------
   运营日纯逻辑单测（65_session.js）

   覆盖：
   1. 同一 seed 的时段编排/事件序列完全一致，不同 seed 不同
   2. 三档难度的事件数量符合设计
   3. 段数与方向：2–6 段、可反向时交替
   4. 事件时刻落在段内且按时间排序
   5. 结算分项与逐段记录可对账，评分随表现变化
   6. 存档结构校验与往返
   ------------------------------------------------------------------ */
const path = require('path');
const S = require(path.join(__dirname, '..', '..', 'parts', '65_session.js'));

let pass = 0, fail = 0;
const failed = [];
function ok(name, cond, detail) {
  if (cond) pass++;
  else { fail++; failed.push({ name, detail }); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const base = { seed: 424242, diff: 'normal', legSeconds: 900, reverseAllowed: true };

/* ========== 1. 可复现 ========== */
{
  const a = S.buildSessionPlan(base);
  const b = S.buildSessionPlan(base);
  ok('同 seed 生成完全一致', deepEqual(a, b));
  const c = S.buildSessionPlan(Object.assign({}, base, { seed: 424243 }));
  ok('不同 seed 事件不同', !deepEqual(a.events, c.events));
  ok('车次/段数仍在合理范围', a.legCount >= 2 && a.legCount <= 6, a.legCount);
}

/* ========== 2. 难度事件数量 ========== */
{
  const easy = S.buildSessionPlan(Object.assign({}, base, { diff: 'easy' }));
  const normal = S.buildSessionPlan(Object.assign({}, base, { diff: 'normal' }));
  const hard = S.buildSessionPlan(Object.assign({}, base, { diff: 'hard' }));
  const count = (p, k) => p.events.filter(e => e.kind === k).length;

  ok('见习无故障', count(easy, 'fault') === 0, count(easy, 'fault'));
  ok('见习无临时限速', count(easy, 'slowzone') === 0, count(easy, 'slowzone'));
  ok('常规 2 条故障', count(normal, 'fault') === 2, count(normal, 'fault'));
  ok('常规 1 次大客流', count(normal, 'crowd') === 1, count(normal, 'crowd'));
  ok('常规 1 段临时限速', count(normal, 'slowzone') === 1, count(normal, 'slowzone'));
  ok('高峰 3 条故障', count(hard, 'fault') === 3, count(hard, 'fault'));
  ok('高峰 2 次大客流', count(hard, 'crowd') === 2, count(hard, 'crowd'));
  ok('高峰 2 段临时限速', count(hard, 'slowzone') === 2, count(hard, 'slowzone'));
  ok('每档都有调度指令', count(normal, 'dispatch') === 2, count(normal, 'dispatch'));
  ok('故障类型合法', normal.events.filter(e => e.kind === 'fault')
    .every(e => S.SESSION_FAULT_TYPES.some(t => t.type === e.faultType)));
}

/* ========== 3. 段数与方向 ========== */
{
  const long = S.buildSessionPlan(Object.assign({}, base, { legSeconds: 3600 }));  // 1 小时一段
  ok('长交路压缩到 2 段', long.legCount === 2, long.legCount);

  const short = S.buildSessionPlan(Object.assign({}, base, { legSeconds: 300 }));  // 5 分钟一段
  ok('短交路不超过 6 段', short.legCount === 6, short.legCount);

  ok('可反向时方向交替', short.legs.every((l, i) => l.dir === (i % 2 === 0 ? 1 : -1)),
    short.legs.map(l => l.dir).join(','));
  const noRev = S.buildSessionPlan(Object.assign({}, base, { reverseAllowed: false }));
  ok('不可反向时全部同向', noRev.legs.every(l => l.dir === 1));
}

/* ========== 4. 事件时刻 ========== */
{
  for (const diff of ['easy', 'normal', 'hard']) {
    const p = S.buildSessionPlan(Object.assign({}, base, { diff }));
    const bad = p.events.filter(e => e.atSec < 0 || e.atSec > p.legSeconds);
    ok(`事件时刻落在段内（${diff}）`, bad.length === 0, bad.length);
    const sorted = p.events.every((e, i) => i === 0 ||
      (e.legIndex > p.events[i - 1].legIndex ||
        (e.legIndex === p.events[i - 1].legIndex && e.atSec >= p.events[i - 1].atSec)));
    ok(`事件按段/时间排序（${diff}）`, sorted);
  }
  const p = S.buildSessionPlan(base);
  const ev = p.events.find(e => e.legIndex === 0);
  if (ev) {
    ok('sessEventsAt 到点前不触发', S.sessEventsAt(p, 0, 1000, 1000 + ev.atSec - 1).length === 0);
    ok('sessEventsAt 到点后触发', S.sessEventsAt(p, 0, 1000, 1000 + ev.atSec).length === 1);
  }
}

/* ========== 5. 运营结算 ========== */
{
  const perfect = S.scoreSession([
    { punc: 100, stopErr: 0, energy: 7.5 * 10, distanceKm: 10, faults: 0, faultsFixed: 0, crowds: 1, crowdsServed: 1 },
    { punc: 100, stopErr: 0, energy: 7.5 * 10, distanceKm: 10, faults: 0, faultsFixed: 0, crowds: 1, crowdsServed: 1 }
  ]);
  ok('全优结算接近 100 分', perfect.score >= 97, perfect.score);
  ok('全优评级 S', perfect.grade === 'S', perfect.grade);
  ok('全优各分项 100', Object.values(perfect.parts).every(v => v === 100), perfect.parts);

  const bad = S.scoreSession([
    { punc: 40, stopErr: 2, energy: 16 * 10, distanceKm: 10, faults: 2, faultsFixed: 0, crowds: 2, crowdsServed: 0 },
    { punc: 30, stopErr: 3, energy: 18 * 10, distanceKm: 10, faults: 2, faultsFixed: 1, crowds: 1, crowdsServed: 0 }
  ]);
  ok('表现差分数显著更低', bad.score < perfect.score - 30, { bad: bad.score, perfect: perfect.score });
  ok('故障未处置拉低满意度', bad.parts.satisfaction < 60, bad.parts.satisfaction);

  /* 对账：分项能从逐段记录重算 */
  const puncAvg = (40 + 30) / 2;
  ok('准点分项 = 逐段均值', near(bad.parts.punc, puncAvg, 0.6), bad.parts.punc);
  ok('总里程 = 逐段求和', near(bad.totals.distanceKm, 20, 1e-9), bad.totals.distanceKm);
  ok('故障汇总 = 逐段求和', bad.totals.faults === 4 && bad.totals.faultsFixed === 1,
    { f: bad.totals.faults, fixed: bad.totals.faultsFixed });
  ok('逐段明细行数 = 段数', bad.legs.length === 2, bad.legs.length);
}

/* ========== 6. 存档往返 ========== */
{
  const plan = S.buildSessionPlan(base);
  const session = {
    routeId: 'full4', routeIdx: 3, seed: base.seed, diff: 'normal',
    legIndex: 1, legCount: plan.legCount, pendingStart: 33000,
    log: [{ punc: 90 }], plan, snap: { s: 123, clock: 33010 }
  };
  const save = S.sessionToSave(session);
  ok('存档带 schema 版本', save.v === S.SESSION_SCHEMA, save.v);
  const back = S.sessionFromSave(JSON.stringify(save));
  ok('存档可解析', back.ok === true, back.reason);
  ok('存档段号保留', back.ok && back.data.legIndex === 1);
  ok('存档计划完整', back.ok && back.data.plan.events.length === plan.events.length);

  ok('拒绝旧版本', S.sessionFromSave(JSON.stringify(Object.assign({}, save, { v: 0 }))).ok === false);
  ok('拒绝坏 JSON', S.sessionFromSave('{oops').ok === false);
  ok('拒绝缺计划', S.sessionFromSave(JSON.stringify(Object.assign({}, save, { plan: null }))).ok === false);
}

const out = { passed: fail === 0, pass, fail, failed };
console.log(JSON.stringify(out, null, 1));
process.exit(out.passed ? 0 : 1);
