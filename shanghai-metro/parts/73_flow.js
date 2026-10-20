/* ================================================================
   值乘流程 / 站内步行 / 换乘 / 终端折返 / 结算
   （由 70_game.js 拆分而来，逻辑未改动）
   ================================================================ */
/* ---------------------------------------------------------------- 开始 / 重置 */
function resetService() {
  const st = path.stations;
  G.s = st[0].stopS;
  G.v = 0; G.lever = 0; G.eb = false;
  G.doorsOpen = true; G.doorT = 1;
  G.clock = path.startSec - 30;
  G.targetIdx = 0;
  G.stopState = 'dwell';
  G.stopErr = 0; G.stopScore = 0;
  G.results = []; G.penalties = 0; G.atpViol = 0; G.ebCount = 0;
  G.energy = 0; G.finishTimer = -1;
  G.announced = {};
  G.camMode = 0; G.yaw = 0; G.pitch = -0.02;
  G.ato = false; G.atoState = 'run'; G.atoTimer = 0; G.atpBrake = false; G.doorWarned = false;
  if (typeof IX !== 'undefined' && IX.routes.length) IX.applyRoute('main', true);
  G.fault = null; G.faultCount = 0; G.speedLog = [];
  G.sigMode = 'cbtc'; G.examTasks = []; G.examDone = 0; G.doorAt = {};
  G.walk = null; G.turnback = null;
  hideTransferPanel();
  if (G.exam) examInit();

  train.carLag.fill(0);
  train._lastV = 0;
  train.update(G.s, 0, 0);
  train.setDoorT(1);
  stationObjs.forEach((so, i) => {
    if (!so) return;
    so.psdL.setOpen(i === 0 ? 1 : 0);
    so.psdR.setOpen(0);
    if (so.crowd) so.crowd.reset();
  });
  for (const ai of aiTrains) { ai.reset(); ai._psd = null; }
  G.leaderGap = null; G.leaderNo = '';
  buildTimetable();
  updateHUD(true);
  showBanner(st[0].zh, st[0].en);
  toast(`值乘开始 · ${st[0].zh} 站，请关闭车门`, 'good', 5200);
  AUDIO.announce(`欢迎乘坐上海地铁${line.name}，本次列车开往${st[st.length - 1].zh}方向。请关闭车门，准备发车。`);
}

function beginDriving() {
  $('briefing').classList.add('hidden');
  $('hud').classList.add('on');
  G.mode = 'driving';
  G.paused = false;
  clock.getDelta();
  resetService();
  updateCamera(0, true);
}
/* ---------------- 站内步行 ---------------- */
function enterWalk(idx) {
  const st = path.stations[idx], f = st.frame;
  const pos = f.pos.clone()
    .addScaledVector(f.right, -3.0)
    .addScaledVector(f.up, 1.06 + 1.7)
    .addScaledVector(f.tan, 60);
  G.walk = {
    active: true, station: idx, pos,
    yaw: Math.atan2(-f.tan.x, -f.tan.z), pitch: 0, tip: false, tpHidden: false
  };
  hideTransferPanel();
}

function toggleWalk() {
  if (G.mode !== 'driving' || G.paused) return;
  if (G.walk && G.walk.active) {
    G.walk.active = false;
    hideTransferPanel();
    updateCamera(0, true);
    toast('已返回司机室', 'info', 2600);
    return;
  }
  if (G.stopState !== 'dwell' || !G.doorsOpen) { toast('停稳并开门后才能下车', 'warn', 3000); return; }
  if (isLastServed(G.targetIdx)) { toast('终到站请结束值乘', 'warn', 3000); return; }
  if (G.ato) toggleATO(false);
  enterWalk(G.targetIdx);
  toast('步行模式 · WASD 移动，鼠标环视，F 返回司机室；换乘通道尽头可换乘', 'info', 5200);
}

function clampWalk() {
  if (!G.walk || !G.walk.active) return;
  const w = G.walk, st = path.stations[w.station], f = st.frame;
  const inv = new THREE.Matrix4().makeBasis(f.right, f.up, f.tan).invert();
  const local = w.pos.clone().sub(f.pos).applyMatrix4(inv);
  local.x = clamp(local.x, -3.75, 3.75);
  local.z = Math.max(local.z, -69);
  const hasTr = st.tr && st.tr.length;
  if (hasTr) {
    if (local.z > 69) {
      local.x = clamp(local.x, -3.0, 3.0);
      local.z = Math.min(local.z, 94);
      if (!w.tip) {
        w.tip = true;
        toast('换乘通道 · 走到尽头选择要换乘的线路', 'info', 4200);
      }
    }
    if (local.z < 82) w.tpHidden = false;
    if (local.z > 88 && !w.tpHidden) showTransferPanel();
    else hideTransferPanel();
  } else {
    local.z = Math.min(local.z, 69);
    hideTransferPanel();
  }
  local.y = 1.06 + 1.7;
  w.pos.copy(f.pos)
    .addScaledVector(f.right, local.x)
    .addScaledVector(f.up, local.y)
    .addScaledVector(f.tan, local.z);
}

function transferRouteFor(name) {
  let fallback = -1;
  for (let i = 0; i < ROUTES.length; i++) {
    const r = ROUTES[i], l = LINES[r.line];
    if (!l || l.name !== name) continue;
    if (r.id.startsWith('full')) return i;
    if (fallback < 0) fallback = i;
  }
  return fallback;
}

function showTransferPanel() {
  if (!G.walk || !G.walk.active) return;
  const st = path.stations[G.walk.station];
  const box = $('transferPanel'), list = $('transferList');
  if (!st || !st.tr || !st.tr.length) { hideTransferPanel(); return; }
  const names = [...new Set(st.tr)].filter(n => n !== line.name && transferRouteFor(n) >= 0);
  if (!names.length) { hideTransferPanel(); return; }
  const key = G.walk.station + '|' + line.name + '|' + names.join(',');
  if (box.dataset.key !== key) {
    box.dataset.key = key;
    list.innerHTML = names.map(n => {
      const ri = transferRouteFor(n), l = LINES[ROUTES[ri].line];
      return `<button class="tp-line" data-line="${n}" style="--c:${l.color}"><b>${l.badge}</b><span>${l.name}</span><i>换乘</i></button>`;
    }).join('');
  }
  box.classList.remove('hidden');
}

function hideTransferPanel() {
  const box = $('transferPanel');
  if (box) box.classList.add('hidden');
}
async function performTransfer(lineName) {
  if (!G.walk || !G.walk.active) return;
  const from = path.stations[G.walk.station];
  const ri = transferRouteFor(lineName);
  if (ri < 0) { toast(`${lineName} 暂无可用交路`, 'warn', 3000); return; }
  hideTransferPanel();
  G.walk.active = false;
  G.mode = 'loading';
  $('hud').classList.remove('on');
  $('loading').classList.remove('hidden');
  $('loadStep').textContent = `正在换乘至 ${lineName}…`;
  $('loadPct').textContent = '';
  $('loadFill').style.width = '0%';
  try {
    await buildService(ri);
    let ti = path.stations.findIndex(s => s.zh === from.zh);
    if (ti < 0) ti = 0;
    const st = path.stations[ti];
    G.targetIdx = ti;
    G.s = st.stopS;
    G.v = 0; G.lever = 0; G.eb = false;
    G.doorsOpen = true; G.doorT = 1;
    G.stopState = 'dwell';
    G.clock = st.schArr;
    G.doorAt = {}; G.announced = {};
    G.results = []; G.penalties = 0; G.atpViol = 0; G.ebCount = 0;
    G.energy = 0; G.speedLog = [];
    G.finishTimer = -1; G.ato = false; G.atoState = 'run';
    G.exam = false; G.examTasks = []; G.fault = null; G.faultCount = 0;
    G.sigMode = 'cbtc'; G.walk = null; G.turnback = null;
    train.carLag.fill(0); train._lastV = 0;
    train.update(G.s, 0, 0);
    train.setDoorT(1);
    const so = stationObjFor(ti);
    if (so) so.psdL.setOpen(1);
    buildTimetable();
    updateTimetable();
    updateHUD(true);
    $('loading').classList.add('hidden');
    $('results').classList.add('hidden');
    $('examPanel').classList.remove('on');
    $('hud').classList.add('on');
    G.mode = 'driving';
    clock.getDelta();
    enterWalk(ti);
    toast(`换乘成功 · ${line.name} ${st.zh} 站台`, 'good', 4600);
    AUDIO.announce(`已换乘至上海地铁${line.name}${st.zh}站。`);
    updateCamera(0, true);
  } catch (err) {
    console.error(err);
    $('loadStep').textContent = '换乘失败：' + (err && err.message ? err.message : err);
    $('loadPct').textContent = '请刷新页面重试';
  }
}
/* 终端折返：先锁闭 B 进路，列车动车至折返线，再重建反向交路 */
function startTurnback() {
  if (!path || !train || G.mode !== 'results') return;
  if (routeDef.loop || routeDef.stopPlan || G.reverse) return;
  const last = path.stations[path.stations.length - 1];
  if (G.targetIdx !== last.index) { toast('只能在终到站折返', 'warn', 3000); return; }
  if (typeof IX !== 'undefined' && IX.occupied()) {
    toast('折返进路区段有车占用 · 进路锁闭', 'warn', 3600);
    return;
  }
  if (typeof IX !== 'undefined') IX.applyRoute('revB');
  G.doorsOpen = false; G.doorT = 0;
  train.setDoorT(0);
  const so = stationObjFor(G.targetIdx);
  if (so) so.psdL.setOpen(0);
  $('results').classList.add('hidden');
  $('hud').classList.add('on');
  G.mode = 'turnback';
  G.finishTimer = -1;
  G.ato = false; G.lever = 0; G.eb = false;

  /* B 渡线反位 → 列车在渡线区间从本线横移到对向线。
     IX.buildCrossover 里渡线几何从 a1 = -TRACK_LAT 连到 b1 = +TRACK_LAT，
     本务线横向偏移也是 -TRACK_LAT，所以顺着 s 增加方向横移量取 +2·TRACK_LAT。
     列车动车的终点必须越过 B 渡线，否则不会真正换线。 */
  const tB = (typeof IX !== 'undefined' && IX.turnouts) ? IX.turnouts.find(t => t.key === 'B') : null;
  const xoEnd = tB ? tB.s + 30 : null;
  const moveTarget = Math.min(path.length - 20, (tB ? Math.max(last.stopS + 80, xoEnd + 45) : last.stopS + 80));
  path.clearCrossovers();
  if (tB) path.addCrossover(tB.s - 30, tB.s + 30, 2 * TRACK_LAT);

  G.turnback = {
    phase: 'move', t: 0, v: 0, s: G.s,
    target: moveTarget,
    crossover: tB ? { s0: tB.s - 30, s1: tB.s + 30, ok: moveTarget > xoEnd } : null
  };
  toast('终端折返 · B 进路已锁闭，列车动车经渡线至折返线', 'info', 4600);
  AUDIO.announce('终点站折返，列车经渡线进入折返线，请注意安全。');
  updateHUD(true);
}

function updateTurnback(dt) {
  const tb = G.turnback;
  if (!tb) return;
  if (typeof IX !== 'undefined') IX.update(dt);
  if (typeof updateSignals === 'function') updateSignals(dt);
  for (const ai of aiTrains) ai.update(dt);
  if (tb.phase === 'move') {
    tb.t += dt;
    const d = tb.target - tb.s;
    const vT = d > 16 ? 6 : Math.max(0, d * 0.6);
    tb.v += clamp(vT - tb.v, -1.1 * dt, 0.9 * dt);
    tb.s = Math.min(tb.target, tb.s + tb.v * dt);
    G.s = tb.s; G.v = tb.v;
    train.setDoorT(0);
    train.update(G.s, G.v, dt);
    updateCamera(dt);
    if (tb.target - tb.s < 0.15 && tb.v < 0.08) {
      tb.s = tb.target; tb.v = 0; tb.phase = 'wait'; tb.t = 0;
    }
  } else if (tb.phase === 'wait') {
    tb.t += dt;
    if (tb.t > 2.4) {
      tb.phase = 'reload';
      finishTurnback();
    }
  }
}

async function finishTurnback() {
  G.mode = 'loading';
  $('hud').classList.remove('on');
  $('loading').classList.remove('hidden');
  $('loadStep').textContent = '折返完成，正在准备反向交路…';
  $('loadPct').textContent = '';
  $('loadFill').style.width = '0%';
  try {
    await buildService(G.routeIdx, true);
    $('loading').classList.add('hidden');
    G.turnback = null;
    beginDriving();
    toast('折返完成 · 反向值乘开始', 'good', 4200);
  } catch (err) {
    console.error(err);
    $('loadStep').textContent = '折返失败：' + (err && err.message ? err.message : err);
    $('loadPct').textContent = '请刷新页面重试';
  }
}

function nextServedIdx(idx) {
  if (!G.stopPlan) return idx + 1;
  for (let i = idx + 1; i < path.stations.length; i++) {
    if (G.stopPlan.has(i)) return i;
  }
  return path.stations.length;
}

function isLastServed(idx) {
  return nextServedIdx(idx) >= path.stations.length;
}
/* ---------------------------------------------------------------- 结算 */
function finishService() {
  if (G.mode === 'results') return;
  G.mode = 'results';
  const stops = G.results.filter(r => r.idx > 0);
  const avgStop = stops.length ? stops.reduce((a, r) => a + r.stopScore, 0) / stops.length : 0;
  const avgPunc = stops.length ? stops.reduce((a, r) => a + r.punc, 0) / stops.length : 0;
  const examOK = G.exam && G.examTasks.length > 0 && examPassed();
  const base = 0.62 * avgStop + 0.38 * avgPunc - (examOK ? 0 : G.penalties);
  const score = clamp(Math.round(base), 0, 100);
  const grade = score >= 93 ? 'S' : score >= 84 ? 'A' : score >= 72 ? 'B' : score >= 58 ? 'C' : 'D';
  $('resGrade').textContent = grade;
  $('resScore').textContent = score;
  $('resStop').innerHTML = (stops.length ? (stops.reduce((a, r) => a + Math.abs(r.err), 0) / stops.length).toFixed(2) : '—') + '<small>m</small>';
  $('resPunc').innerHTML = Math.round(avgPunc) + '<small>%</small>';
  $('resKwh').innerHTML = Math.round(G.energy) + '<small>kWh</small>';
  const pen = $('resPenalty');
  if (pen) pen.innerHTML = (G.penalties > 0 ? '-' + G.penalties : '0') + '<small>分</small>';
  let rows = `<div class="stop-line head"><span>车站</span><span>停车偏差</span><span>发车偏差</span><span>得分</span></div>`;
  for (const r of stops) {
    const s = clamp(Math.round(0.62 * r.stopScore + 0.38 * r.punc), 0, 100);
    rows += `<div class="stop-line"><b>${r.zh}</b><span>${r.err === 99 ? '越站' : ((r.err >= 0 ? '+' : '') + r.err.toFixed(2) + ' m')}</span>
      <span>${r.depDelay === undefined ? '—' : ((r.depDelay >= 0 ? '+' : '') + Math.round(r.depDelay) + ' s')}</span><b>${s}</b></div>`;
  }
  $('resTable').innerHTML = rows;
  const exBox = $('resExam');
  if (exBox) {
    if (G.exam && G.examTasks.length) {
      const pass = examPassed();
      exBox.style.display = '';
      exBox.innerHTML = `<div class="er-head"><span>执照考试</span><span class="${pass ? 'pass' : 'fail'}">${pass ? '通过' : '未通过'}</span></div>` +
        G.examTasks.map(t => `<div class="er-item ${t.ok === true ? 'ok' : 'bad'}"><b>${t.ok === true ? '✓' : '✕'}</b>${t.label}</div>`).join('');
      if (pass) {
        G.penalties = 0;
        $('resTitle').textContent = '执照考试通过';
      } else {
        $('resTitle').textContent = '执照考试未通过';
      }
    } else {
      exBox.style.display = 'none';
      $('resTitle').textContent = '值乘结束';
    }
  }
  drawSpeedChart();
  drawDelayChart();
  if (typeof routeDef !== 'undefined' && routeDef) saveCareer(routeDef.id + (G.reverse ? ':rev' : ''), score, grade);
  const rvBtn = $('resReverse');
  if (rvBtn) rvBtn.style.display = (G.reverse || (routeDef && (routeDef.loop || routeDef.stopPlan))) ? 'none' : '';
  $('results').classList.remove('hidden');
  $('hud').classList.remove('on');
  AUDIO.announce(`本次值乘结束，综合评分${score}分，${grade}级。感谢您的驾驶。`);
}
/* ---------------------------------------------------------------- 结算曲线 */
function drawSpeedChart() {
  const cv = $('resChart');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const log = G.speedLog || [];
  const x0 = 44, x1 = W - 14, y0 = 14, y1 = H - 22;
  // 网格
  ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1;
  for (let k = 0; k <= 4; k++) {
    const y = y0 + (y1 - y0) * k / 4;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  }
  ctx.fillStyle = '#6b8290'; ctx.font = '500 13px ui-monospace,monospace';
  const vTop = (typeof path !== 'undefined' && path && path.vmax) ? path.vmax : 80;
  ctx.fillText(String(Math.round(vTop)), 8, y0 + 5);
  ctx.fillText('0', 20, y1 + 4);
  ctx.fillText('速度 km/h', 8, H - 4);
  if (log.length < 2) return;
  const sMin = log[0][0], sMax = log[log.length - 1][0];
  const span = Math.max(1, sMax - sMin);
  ctx.beginPath();
  log.forEach(([s, v], i) => {
    const x = x0 + (s - sMin) / span * (x1 - x0);
    const y = y1 - clamp(v / vTop, 0, 1) * (y1 - y0);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  const grd = ctx.createLinearGradient(0, y0, 0, y1);
  grd.addColorStop(0, 'rgba(140,198,63,.85)');
  grd.addColorStop(1, 'rgba(140,198,63,.12)');
  ctx.strokeStyle = grd; ctx.lineWidth = 2.4; ctx.stroke();
  ctx.lineTo(x1, y1); ctx.lineTo(x0, y1); ctx.closePath();
  ctx.fillStyle = 'rgba(140,198,63,.10)'; ctx.fill();
  ctx.fillStyle = '#7f939f'; ctx.font = '500 12px "Microsoft YaHei",sans-serif';
  ctx.fillText('全程速度曲线', x0 + 4, y0 + 14);
}

/* ---------------------------------------------------------------- 晚点曲线（P1-5）
   逐站发车正晚点。数据直接取结算表同源的 G.results[].depDelay，
   保证「曲线与逐站数据一致」；±60 s 画告警线，与 HMI/ATS 同口径。 */
function drawDelayChart() {
  const cv = $('resDelay');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const rows = (G.results || []).filter(r =>
    r.idx > 0 && (r.depDelay != null || r.arrDelay != null));
  const x0 = 46, x1 = W - 14, y0 = 18, y1 = H - 24;
  ctx.fillStyle = '#7f939f'; ctx.font = '500 12px "Microsoft YaHei",sans-serif';
  ctx.fillText('逐站发车正晚点  s', x0, 13);
  if (!rows.length) {
    ctx.fillStyle = '#5f7280'; ctx.fillText('无正晚点数据', x0 + 10, (y0 + y1) / 2);
    return;
  }
  const vals = rows.map(r => (r.depDelay != null ? r.depDelay : r.arrDelay) || 0);
  const maxAbs = Math.max(30, ...vals.map(v => Math.abs(v)));
  const span = Math.max(30, Math.ceil(maxAbs / 30) * 30);
  const Y = v => (y0 + y1) / 2 - (v / span) * ((y1 - y0) / 2 - 4);
  const X = i => rows.length === 1 ? (x0 + x1) / 2 : x0 + (i / (rows.length - 1)) * (x1 - x0);

  /* ±60 s 告警带（若量程够） */
  if (span >= 60) {
    for (const s of [-60, 60]) {
      ctx.strokeStyle = 'rgba(255,107,90,.28)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, Y(s)); ctx.lineTo(x1, Y(s)); ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  /* 零线与刻度 */
  ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0, Y(0)); ctx.lineTo(x1, Y(0)); ctx.stroke();
  ctx.fillStyle = '#6b8290'; ctx.font = '500 11px ui-monospace,monospace';
  ctx.textAlign = 'right';
  ctx.fillText('0', x0 - 6, Y(0) + 4);
  ctx.fillText('+' + span, x0 - 6, Y(span) + 4);
  ctx.fillText('-' + span, x0 - 6, Y(-span) + 4);
  ctx.textAlign = 'left';

  /* 晚点为正（琥珀），早点为负（蓝） */
  ctx.beginPath();
  vals.forEach((v, i) => { i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)); });
  ctx.strokeStyle = 'rgba(140,198,63,.85)'; ctx.lineWidth = 2.2; ctx.stroke();
  vals.forEach((v, i) => {
    const bad = Math.abs(v) > 60;
    ctx.fillStyle = bad ? '#ff6b5a' : v > 5 ? '#ffb020' : v < -5 ? '#6fd3ff' : '#3ddc97';
    ctx.beginPath(); ctx.arc(X(i), Y(v), 3.2, 0, Math.PI * 2); ctx.fill();
    if (rows.length <= 14) {
      ctx.fillStyle = '#93a9b6'; ctx.font = '500 10px ui-monospace,monospace';
      ctx.textAlign = 'center';
      ctx.fillText((v > 0 ? '+' : '') + Math.round(v), X(i), Y(v) - 7);
      ctx.textAlign = 'left';
    }
  });
  /* 站名刻度：只标首末与中间，避免拥挤 */
  ctx.fillStyle = '#6b8290'; ctx.font = '500 11px "Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  const step = Math.max(1, Math.ceil(rows.length / 8));
  rows.forEach((r, i) => {
    if (i % step && i !== rows.length - 1) return;
    ctx.fillText(r.zh, X(i), y1 + 16);
  });
  ctx.textAlign = 'left';
}
