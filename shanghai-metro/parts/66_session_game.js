/* =====================================================================
   运营日运行时（P2）
   ---------------------------------------------------------------------
   纯逻辑在 65_session.js；本文件负责把它接进游戏：
   - 开局建时段、逐段值乘、段间交接
   - 事件时间轴的实际触发（故障/大客流/临时限速/调度指令）
   - 运营结算与逐段对账
   - 中途存档 / 继续运营日（localStorage: sm_session）
   ===================================================================== */

const SESSION_KEY = 'sm_session';
const SESSION_DIR_NAME = '运营日';

function sessionActive() {
  return !!(G.session && G.session.plan);
}

function sessionLegLabel() {
  const s = G.session;
  if (!s) return '';
  return `${SESSION_DIR_NAME} ${Math.min(s.legIndex + 1, s.legCount)}/${s.legCount}`;
}

/* ---------------------------------------------------------------- 开局 */
/* 在 buildService 之后、beginDriving 之前调用：用本务车次的全程时长
   估算一局能跑几段，并生成事件时间轴。 */
function sessionStart(routeIdx) {
  if (typeof buildSessionPlan !== 'function') return null;
  const svc = path && path.playerService;
  const legSeconds = svc ? Math.max(180, Math.round(svc.endSec - svc.startSec)) : 900;
  const reverseAllowed = !(routeDef.loop || routeDef.stopPlan);
  const seed = (G.sessionSeed != null)
    ? (G.sessionSeed >>> 0)
    : ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
  const plan = buildSessionPlan({
    seed, diff: G.diff, legSeconds, reverseAllowed,
    targetSec: (G.sessionMinutes || 120) * 60,
    legCount: G.sessionLegs || undefined
  });
  G.session = {
    schema: SESSION_SCHEMA,
    routeId: routeDef.id,
    routeIdx,
    seed,
    diff: G.diff,
    plan,
    legIndex: 0,
    legCount: plan.legCount,
    legStart: path.startSec,
    pendingStart: path.startSec,
    events: [],
    cursor: 0,
    log: [],
    dispatch: [],
    legFaults: 0, legFaultsFixed: 0,
    legCrowds: 0, legCrowdsServed: 0, crowdStation: -1,
    phase: 'driving',
    snap: null
  };
  sessionBeginLeg(0);
  return G.session;
}

/* 进入某一段：把该段事件换算成绝对时刻，清段内计数 */
function sessionBeginLeg(i) {
  const s = G.session;
  if (!s) return;
  s.legIndex = i;
  s.legStart = path.startSec;
  s.pendingStart = path.startSec;
  s.events = s.plan.events
    .filter(e => e.legIndex === i)
    .map(e => Object.assign({}, e, { at: s.legStart + e.atSec }));
  s.cursor = 0;
  s.legFaults = 0; s.legFaultsFixed = 0;
  s.legCrowds = 0; s.legCrowdsServed = 0; s.crowdStation = -1;
  s.phase = 'driving';
  sessionSave(false);
  sessionUpdateHud();
}

function sessionUpdateHud() {
  const el = $('hudDuty');
  if (!el) return;
  if (!sessionActive()) { el.textContent = ''; el.classList.add('hidden'); return; }
  const s = G.session;
  el.classList.remove('hidden');
  el.textContent = `${SESSION_DIR_NAME} ${s.legIndex + 1}/${s.legCount} · ${(SESSION_DIFF[s.diff] || {}).label || s.diff}`;
}

/* ---------------------------------------------------------------- 事件 */
function sessionFaultText(type) {
  if (type === 'door') return { brief: '车门未关闭', hint: '按 L 切除该车门' };
  if (type === 'traction') return { brief: '牵引逆变器故障', hint: '限速 40 km/h，按 L 复位' };
  if (type === 'signal') return { brief: '车载 ATP 故障', hint: '已转入固定闭塞，按 L 复位' };
  if (type === 'pantograph') return { brief: '受电弓检测异常', hint: '牵引锁定，按 L 重启' };
  return { brief: '制动缓解不良', hint: '制动力下降，按 L 复位' };
}

function sessionFire(e) {
  const s = G.session;
  if (!s || !e) return;
  if (e.kind === 'fault') {
    if (G.fault) return;                      // 同一时间只处理一条故障
    const tx = sessionFaultText(e.faultType);
    G.fault = { type: e.faultType, name: e.faultName || tx.brief, warned: false };
    G.faultCount++;
    s.legFaults++;
    if (e.faultType === 'signal') G.sigMode = 'fixed';
    toast(`⚠ ${e.faultName || tx.brief} · ${tx.hint}`, 'bad', 6800);
    AUDIO.beep(true);
    AUDIO.announce(`${tx.brief}，请司机处理。`);
    updateHUD(true);
    return;
  }
  if (e.kind === 'crowd') {
    const idx = G.targetIdx;
    const so = stationObjFor(idx);
    if (so && so.crowd) {
      so.crowd.waitingCount = Math.min(so.crowd.N - 2, so.crowd.waitingCount + (e.surge || 12));
      so.crowd.reset();
    }
    s.legCrowds++;
    s.crowdStation = idx;
    const zh = path.stations[idx] ? path.stations[idx].zh : '下一站';
    toast(`大客流预警 · ${zh}，请关注乘降安全`, 'warn', 6800);
    AUDIO.announce(`${zh}站客流较大，请司机注意乘降安全。`);
    return;
  }
  if (e.kind === 'slowzone') {
    G.slowzone = { until: G.clock + (e.duration || 120), limit: e.limit || 40 };
    toast(`临时限速 ${G.slowzone.limit} km/h · 持续 ${Math.round(e.duration || 120)} 秒`, 'warn', 6000);
    AUDIO.announce(`前方临时限速，限速${G.slowzone.limit}公里。`);
    return;
  }
  if (e.kind === 'dispatch') {
    s.dispatch.push({ at: Math.round(G.clock), text: e.text || '按图行车' });
    toast(`调度指令 · ${e.text || '按图行车'}`, 'info', 7000);
    AUDIO.announce(e.text || '调度指令，请按图行车。');
  }
}

/* 每帧推进事件时间轴；不依赖 Math.random，种子固定则序列固定 */
function sessionTick() {
  if (!sessionActive() || G.mode !== 'driving') return;
  const s = G.session;
  while (s.cursor < s.events.length && G.clock + 1e-6 >= s.events[s.cursor].at) {
    const e = s.events[s.cursor];
    /* 故障未处置完时先挂起后续事件，避免「第二条故障被静默丢弃」 */
    if (e.kind === 'fault' && G.fault) return;
    s.cursor++;
    sessionFire(e);
  }
  if (G.slowzone && G.clock >= G.slowzone.until) {
    G.slowzone = null;
    toast('临时限速已解除', 'good', 3000);
  }
}

/* 大客流站点办客（开门）时记为已服务 */
function sessionCrowdServed(idx) {
  const s = G.session;
  if (!s || s.crowdStation !== idx) return;
  s.legCrowdsServed++;
  s.crowdStation = -1;
}

/* ---------------------------------------------------------------- 结算 */
function sessionDistanceKm() {
  if (!path || !path.stations.length) return 0;
  const a = path.stations[0].stopS;
  const b = path.stations[path.stations.length - 1].stopS;
  return Math.abs(b - a) / 1000;
}

function sessionCommitLeg() {
  const s = G.session;
  if (!s || s.phase !== 'driving') return null;
  const stops = G.results.filter(r => r.idx > 0);
  const punc = stops.length ? stops.reduce((a, r) => a + (r.punc || 0), 0) / stops.length : 0;
  const errs = stops.map(r => (r.err === 99 ? 5 : Math.abs(r.err || 0)));
  const stopErr = errs.length ? errs.reduce((a, v) => a + v, 0) / errs.length : 0;
  const rec = {
    leg: s.legIndex + 1,
    dir: G.reverse ? -1 : 1,
    from: path.stations[0] ? path.stations[0].zh : '',
    to: path.stations[path.stations.length - 1] ? path.stations[path.stations.length - 1].zh : '',
    startClock: Math.round(s.legStart),
    endClock: Math.round(G.clock),
    punc: Math.round(punc),
    stopErr: Math.round(stopErr * 100) / 100,
    energy: Math.round(G.energy * 10) / 10,
    distanceKm: Math.round(sessionDistanceKm() * 10) / 10,
    penalties: G.penalties,
    faults: s.legFaults,
    faultsFixed: s.legFaultsFixed,
    crowds: s.legCrowds,
    crowdsServed: s.legCrowdsServed
  };
  s.log.push(rec);
  s.phase = 'intermission';
  return rec;
}

function sessionFmtClock(sec) {
  if (typeof fmtClock === 'function') return fmtClock(sec);
  const s = ((Math.round(sec) % 86400) + 86400) % 86400;
  const p = n => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

function sessionFmtDuration(sec) {
  const m = Math.max(0, Math.round(sec / 60));
  if (m < 60) return `${m} 分`;
  return `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
}

function sessionResultHtml(score, final) {
  const s = G.session;
  if (!s) return '';
  const t0 = s.log.length ? s.log[0].startClock : s.legStart;
  const t1 = s.log.length ? s.log[s.log.length - 1].endClock : G.clock;
  const parts = final ? `
    <div class="sess-parts">
      <div><i>准点</i><b>${score.parts.punc}</b></div>
      <div><i>停站</i><b>${score.parts.stop}</b></div>
      <div><i>能耗</i><b>${score.parts.energy}</b></div>
      <div><i>故障处置</i><b>${score.parts.fault}</b></div>
      <div><i>满意度</i><b>${score.parts.satisfaction}</b></div>
    </div>` : '';
  const rows = s.log.map(r => `<div class="sess-leg">
      <span>${r.leg}</span>
      <span class="seg">${r.from} → ${r.to}</span>
      <span>${r.punc}%</span>
      <span>${r.stopErr.toFixed(2)} m</span>
      <span>${r.energy.toFixed(0)} kWh</span>
      <span>${r.faults ? `${r.faultsFixed}/${r.faults}` : '—'}</span>
    </div>`).join('');
  const next = (!final && s.phase === 'intermission' && s.log.length < s.legCount)
    ? `<div class="sess-next">下一段 ${sessionFmtClock(s.pendingStart)} 发车 · 交班余量 ${sessionFmtDuration(s.pendingStart - G.clock)}</div>`
    : '';
  return `<div class="sess-head"><b>${SESSION_DIR_NAME}</b><span>${(LINES[routeDef.line] || {}).name || ''} · ${s.legCount} 段 · ${sessionFmtClock(t0)}–${sessionFmtClock(t1)}</span></div>
    ${parts}${next}
    <div class="sess-legs">
      <div class="sess-leg head"><span>段</span><span class="seg">区间</span><span>准点</span><span>停站</span><span>能耗</span><span>故障</span></div>
      ${rows}
    </div>
    <div class="sess-foot">调度指令 ${s.dispatch.length} 条 · 种子 ${s.seed}</div>`;
}

function sessionShowIntermission(legScore, legGrade) {
  const s = G.session;
  if (!s) return;
  const next = s.plan.legs[s.legIndex + 1];
  s.pendingStart = Math.round(G.clock + (s.plan.legs[s.legIndex].slack || 300));
  sessionSave(false);
  $('resTitle').textContent = `第 ${s.legIndex + 1} 段完成 · 准备交班`;
  $('resScoreLabel').textContent = '本段评分';
  $('resGrade').textContent = legGrade;
  $('resScore').textContent = legScore;
  $('resSession').style.display = '';
  $('resSession').innerHTML = sessionResultHtml(scoreSession(s.log, { vmax: path.vmax }), false);
  $('resAgain').classList.add('hidden');
  const rv = $('resReverse');
  rv.classList.remove('hidden');
  rv.textContent = next ? `开始下一段（第 ${s.legIndex + 2} 段）` : '开始下一段';
  $('resMenu').textContent = '结束运营日并结算';
  sessionUpdateHud();
}

function sessionShowFinal(early) {
  const s = G.session;
  if (!s) return;
  if (!s.log.length) { sessionClearSave(); return; }
  const score = scoreSession(s.log, { vmax: path.vmax });
  $('resTitle').textContent = early ? '运营日提前结束 · 结算' : '运营日结算';
  $('resScoreLabel').textContent = '运营总分';
  $('resGrade').textContent = score.grade;
  $('resScore').textContent = score.score;
  $('resStop').innerHTML = score.totals.avgStopErr.toFixed(2) + '<small>m</small>';
  $('resPunc').innerHTML = score.parts.punc + '<small>%</small>';
  $('resKwh').innerHTML = Math.round(score.totals.energy) + '<small>kWh</small>';
  const pen = s.log.reduce((a, r) => a + (r.penalties || 0), 0);
  $('resPenalty').innerHTML = (pen > 0 ? '-' + pen : '0') + '<small>分</small>';
  $('resSession').style.display = '';
  $('resSession').innerHTML = sessionResultHtml(score, true);
  $('resAgain').classList.add('hidden');
  $('resReverse').classList.add('hidden');
  $('resMenu').textContent = '返回线路选择';
  if (typeof saveCareer === 'function' && routeDef) saveCareer(routeDef.id + ':day', score.score, score.grade);
  s.phase = 'done';
  sessionClearSave();
  sessionUpdateHud();
}

/* 段间交接：重建下一方向交路，按下一段计划发车时刻开始 */
async function sessionNextLeg() {
  const s = G.session;
  if (!s || s.phase !== 'intermission') return;
  const next = s.plan.legs[s.legIndex + 1];
  if (!next) { sessionShowFinal(false); return; }
  s.pendingStart = Math.round(G.clock + (s.plan.legs[s.legIndex].slack || 300));
  const dir = next.dir;
  $('results').classList.add('hidden');
  $('hud').classList.remove('on');
  $('loading').classList.remove('hidden');
  $('loadStep').textContent = `第 ${next.i + 1} 段 · 正在准备${dir < 0 ? '反向' : '正向'}交路…`;
  $('loadPct').textContent = '';
  $('loadFill').style.width = '0%';
  G.mode = 'loading';
  try {
    await buildService(s.routeIdx, dir < 0);
    $('loading').classList.add('hidden');
    G.turnback = null;
    beginDriving();
    sessionBeginLeg(next.i);
    toast(`第 ${next.i + 1} 段开始 · ${sessionFmtClock(path.startSec)} 发车`, 'good', 4600);
  } catch (err) {
    console.error(err);
    $('loadStep').textContent = '交班失败：' + (err && err.message ? err.message : err);
    $('loadPct').textContent = '请刷新页面重试';
  }
}

function sessionFinishEarly() {
  const s = G.session;
  if (!s) return;
  sessionShowFinal(true);
}

/* ---------------------------------------------------------------- 存档 */
function sessionSnapshot() {
  return {
    clock: G.clock,
    s: G.s,
    targetIdx: G.targetIdx,
    results: G.results.map(r => Object.assign({}, r)),
    energy: G.energy,
    penalties: G.penalties,
    doorsOpen: G.doorsOpen,
    stopState: G.stopState,
    fault: G.fault ? Object.assign({}, G.fault) : null,
    faultCount: G.faultCount,
    legStart: G.session.legStart,
    cursor: G.session.cursor,
    legFaults: G.session.legFaults,
    legFaultsFixed: G.session.legFaultsFixed,
    legCrowds: G.session.legCrowds,
    legCrowdsServed: G.session.legCrowdsServed,
    crowdStation: G.session.crowdStation
  };
}

function sessionSave(withSnap) {
  const s = G.session;
  if (!s) return;
  s.snap = withSnap ? sessionSnapshot() : null;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionToSave(s)));
  } catch (e) {
    console.warn('[session] 存档写入失败', e);
  }
}

function sessionClearSave() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* 忽略 */ }
}

function sessionReadSave() {
  let txt = null;
  try { txt = localStorage.getItem(SESSION_KEY); } catch (e) { return null; }
  if (!txt) return null;
  const r = sessionFromSave(txt);
  return r.ok ? r.data : null;
}

/* 继续运营日：phase=intermission 时直接开下一段；driving 时恢复快照 */
async function sessionResume() {
  const data = sessionReadSave();
  if (!data) { toast('没有可继续的运营日存档', 'warn', 3000); return false; }
  const plan = data.plan;
  let legIndex = data.legIndex;
  let pendingStart = data.pendingStart;
  if (data.phase === 'intermission') {
    legIndex = data.legIndex + 1;
    if (legIndex >= plan.legCount) { toast('这段运营日已经结束', 'warn', 3000); return false; }
    pendingStart = data.pendingStart;
  }
  const leg = plan.legs[legIndex];
  if (!leg) { toast('运营日存档已损坏', 'bad', 4000); return false; }
  /* 用 routeId 反查交路：路线表顺序可能因版本变化，不能依赖存下来的下标 */
  const routeIdx = ROUTES.findIndex(r => r.id === data.routeId);
  if (routeIdx < 0) { toast('存档对应的交路已不存在', 'bad', 4000); return false; }

  G.session = {
    schema: SESSION_SCHEMA,
    routeId: data.routeId, routeIdx,
    seed: data.seed, diff: data.diff, plan,
    legIndex, legCount: plan.legCount,
    legStart: pendingStart, pendingStart,
    events: [], cursor: 0, log: data.log || [], dispatch: data.dispatch || [],
    legFaults: 0, legFaultsFixed: 0, legCrowds: 0, legCrowdsServed: 0, crowdStation: -1,
    phase: 'driving', snap: data.snap || null
  };
  G.diff = data.diff;
  G.sessionSeed = data.seed;
  G.routeIdx = routeIdx;
  G.playMode = 'day';
  G.exam = false;

  $('menu').classList.add('hidden');
  $('hud').classList.remove('on');
  $('loading').classList.remove('hidden');
  $('loadStep').textContent = '正在恢复运营日…';
  $('loadPct').textContent = '';
  $('loadFill').style.width = '0%';
  G.mode = 'loading';
  try {
    await buildService(routeIdx, leg.dir < 0);
    $('loading').classList.add('hidden');
    beginDriving();
    if (data.snap && data.phase !== 'intermission') {
      sessionRestoreSnap(data.snap);
    } else {
      sessionBeginLeg(legIndex);
      toast(`继续运营日 · 第 ${legIndex + 1}/${plan.legCount} 段`, 'good', 4200);
    }
    return true;
  } catch (err) {
    console.error(err);
    $('loadStep').textContent = '恢复失败：' + (err && err.message ? err.message : err);
    $('loadPct').textContent = '请刷新页面重试';
    return false;
  }
}

function sessionRestoreSnap(snap) {
  const s = G.session;
  if (!s || !snap) return;
  G.clock = snap.clock;
  G.s = snap.s;
  G.v = 0;
  G.lever = 0;
  G.targetIdx = snap.targetIdx;
  G.results = snap.results || [];
  G.energy = snap.energy || 0;
  G.penalties = snap.penalties || 0;
  G.fault = snap.fault || null;
  G.faultCount = snap.faultCount || 0;
  G.doorsOpen = !!snap.doorsOpen;
  G.stopState = snap.stopState || 'dwell';
  G.doorT = G.doorsOpen ? 1 : 0;
  G.ato = false;
  if (G.fault && G.fault.type === 'signal') G.sigMode = 'fixed';
  train.carLag.fill(0);
  train._lastV = 0;
  train.update(G.s, 0, 0);
  train.setDoorT(G.doorT);
  const so = stationObjFor(G.targetIdx);
  if (so) so.psdL.setOpen(G.doorsOpen ? 1 : 0);
  /* 事件时刻以存档里的 legStart 为准，已触发过的事件跳过 */
  s.legStart = snap.legStart || s.legStart;
  s.events = s.plan.events.filter(e => e.legIndex === s.legIndex)
    .map(e => Object.assign({}, e, { at: s.legStart + e.atSec }));
  s.cursor = snap.cursor || 0;
  s.legFaults = snap.legFaults || 0;
  s.legFaultsFixed = snap.legFaultsFixed || 0;
  s.legCrowds = snap.legCrowds || 0;
  s.legCrowdsServed = snap.legCrowdsServed || 0;
  s.crowdStation = snap.crowdStation == null ? -1 : snap.crowdStation;
  s.phase = 'driving';
  updateTimetable();
  updateHUD(true);
  sessionSave(true);
  toast('运营日已恢复 · 继续驾驶', 'good', 3800);
}

/* 菜单里的「继续运营日」入口 */
function sessionResumePrompt() {
  const btn = $('resumeDay');
  if (!btn) return;
  const data = sessionReadSave();
  const routeIdx = data ? ROUTES.findIndex(r => r.id === data.routeId) : -1;
  const route = routeIdx >= 0 ? ROUTES[routeIdx] : null;
  if (!data || !route) { btn.classList.add('hidden'); return; }
  const legIndex = data.phase === 'intermission' ? data.legIndex + 1 : data.legIndex;
  if (legIndex >= data.plan.legCount) { btn.classList.add('hidden'); return; }
  const lineName = (LINES[route.line] || {}).name || '';
  btn.innerHTML = `继续运营日 <span>${lineName} · 第 ${legIndex + 1}/${data.plan.legCount} 段 · ${sessionFmtClock(data.pendingStart)}</span>`;
  btn.classList.remove('hidden');
  btn.disabled = false;
  btn.onclick = async () => {
    btn.disabled = true;
    const ok = await sessionResume();
    if (!ok) btn.disabled = false;
  };
}

