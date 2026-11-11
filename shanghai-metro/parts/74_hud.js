/* ================================================================
   HUD / 时刻表 / 执照考试 / PIS / AI 屏蔽门
   （由 70_game.js 拆分而来，逻辑未改动）
   ================================================================ */
/* ---------------------------------------------------------------- HUD */
function toast(text, kind = 'info', ms = 3400) {
  const area = $('toastArea');
  const d = document.createElement('div');
  d.className = 'toast ' + (kind === 'info' ? '' : kind);
  d.textContent = text;
  area.appendChild(d);
  while (area.children.length > 3) area.removeChild(area.firstChild);
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, ms);
}
function showBanner(zh, en) {
  const b = $('stationBanner');
  b.querySelector('.zh').textContent = zh;
  b.querySelector('.en').textContent = en;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}

let ttRows = [];
function buildTimetable() {
  const box = $('hudTT');
  box.innerHTML = '';
  ttRows = [];
  path.stations.forEach((st, i) => {
    if (G.stopPlan && !G.stopPlan.has(i)) return;
    const row = document.createElement('div');
    row.className = 'tt-row' + (i === G.targetIdx ? ' now' : '');
    row.innerHTML = `<span class="st"></span><span>${st.zh}</span><span class="t1">${fmtClockShort(st.schArr)}</span><span class="t2">${fmtClockShort(st.schDep)}</span>`;
    box.appendChild(row);
    ttRows.push({ row, idx: i });
  });
  $('hudLine').textContent = line.name;
  $('hudSeg').textContent = routeDef.seg;
  $('hudService').textContent = routeDef.seg;
  document.documentElement.style.setProperty('--line', line.color);
  document.documentElement.style.setProperty('--line-glow', line.color + '59');
}
function updateTimetable() {
  ttRows.forEach((item, k) => {
    item.row.classList.toggle('now', item.idx === G.targetIdx);
    item.row.classList.toggle('done', item.idx < G.targetIdx);
  });
}
/* ---------------- 执照考试 ---------------- */
function examInit() {
  G.examTasks = [
    { id: 'depart', label: '首站正点发车（±20 秒）', ok: null },
    { id: 'stop', label: '连续 3 站停车误差 ≤ 0.3 m', ok: null, prog: 0 },
    { id: 'eb', label: '全程未施加紧急制动', ok: true },
    { id: 'atp', label: '全程未触发 ATP 制动', ok: true },
    { id: 'door', label: '站站开门办理乘降', ok: true }
  ];
  G.examDone = 0;
  examRender();
}

function examEvent(id, val) {
  if (!G.exam || !G.examTasks.length) return;
  const t = G.examTasks.find(x => x.id === id);
  if (!t) return;
  if (id === 'stop') {
    if (val <= 0.3) {
      t.prog = (t.prog || 0) + 1;
      if (t.prog >= 3) t.ok = true;
    } else {
      t.prog = 0;
    }
  } else if (id === 'depart') {
    t.ok = Math.abs(val) <= 20;
  } else {
    t.ok = !!val;
  }
  examRender();
}

function examRender() {
  const box = $('examPanel');
  if (!box) return;
  const on = G.exam && G.mode === 'driving';
  box.classList.toggle('on', !!on);
  if (!on) return;
  const done = G.examTasks.filter(t => t.ok === true).length;
  box.innerHTML = `<h6>执照考试 · ${done}/${G.examTasks.length}</h6>` +
    G.examTasks.map(t => {
      const cls = t.ok === true ? 'ok' : t.ok === false ? 'bad' : '';
      const mark = t.ok === true ? '✓' : t.ok === false ? '✕' : '·';
      const extra = t.id === 'stop' && t.ok !== true ? `（${t.prog || 0}/3）` : '';
      return `<div class="exam-item ${cls}"><i>${mark}</i><span>${t.label}${extra}</span></div>`;
    }).join('');
}

function examPassed() {
  return G.examTasks.length > 0 && G.examTasks.every(t => t.ok === true);
}
/* 站台 PIS：显示下一列车到站时间 */
function updatePisDisplays() {
  const term = path.stations[path.stations.length - 1];
  const show = (idx, so) => {
    if (!so || !so.pis) return;
    const st = path.stations[idx];
    if (!st) return;
    const d = st.stopS - G.s;
    let eta = '—', label = '暂无列车', soon = false;
    if (G.targetIdx === idx) {
      if (d < 0) { eta = '已到站'; label = ''; }
      else if (d < 30) { eta = '即将'; label = '进站'; soon = true; }
      else {
        const tt = estimateRunTime(Math.max(30, d), 60);
        eta = Math.ceil(tt / 60) + "'";
        label = `${Math.round(d)} m`;
        soon = tt < 100;
      }
    } else if (G.targetIdx > idx) {
      eta = '已过'; label = '';
    } else {
      const gap = path.stations[G.targetIdx].stopS - G.s;
      const tt = estimateRunTime(gap + (st.stopS - path.stations[G.targetIdx].stopS), 60) + 60;
      eta = Math.ceil(tt / 60) + "'";
      label = '预计';
    }
    drawPis(so.pis, {
      color: line.color, line: line.name,
      dir: `开往 ${term.zh}`,
      eta, etaLabel: label, soon,
      tip: st.tr && st.tr.length ? `可换乘 ${st.tr.join('、')}` : '请站在安全线内候车'
    });
  };
  if (G.targetIdx > 0) show(G.targetIdx - 1, stationObjFor(G.targetIdx - 1));
  show(G.targetIdx, stationObjFor(G.targetIdx));
  const nx = nextServedIdx(G.targetIdx);
  if (nx < stationObjs.length) show(nx, stationObjFor(nx));
}
/* AI 停站时联动对应侧屏蔽门 */
function updateAiPsd() {
  for (const ai of aiTrains) {
    if (ai.dead) continue;
    if (ai.state === 'dwell') {
      let so = null, bd = 1e9;
      for (const s of stationObjs) {
        if (!s) continue;
        const d = Math.abs(ai.s - ((s.s || 0) + (s.stopZ || 70)));
        if (d < bd) { bd = d; so = s; }
      }
      if (so && bd < 40) {
        const psd = ai.lateral > 0 ? so.psdR : so.psdL;
        if (psd) { psd.setOpen(ai.doorT); ai._psd = { psd, so }; }
      }
    } else if (ai._psd) {
      const pso = stationObjFor(G.targetIdx);
      const playerAt = pso === ai._psd.so && (G.stopState === 'stop' || G.stopState === 'dwell');
      if (!playerAt) ai._psd.psd.setOpen(0);
      ai._psd = null;
    }
  }
}
function updateHUD(force = false) {
  if (!path || !train) return;
  const st = path.stations[G.targetIdx];
  /* 正晚点（P1-2）：司机室 HMI 之外，主 HUD 也给一个读数。
     口径与 HMI 一致（currentDelay），±5 s 内按正点处理。 */
  const dv = currentDelay();
  G.puncDelay = dv;
  const pEl = $('hudPunc');
  if (pEl) {
    pEl.textContent = Math.abs(dv) <= 5 ? '正点' : (dv > 0 ? `晚点 ${dv} s` : `早点 ${-dv} s`);
    pEl.className = Math.abs(dv) > 60 ? 'bad' : Math.abs(dv) > 15 ? 'late' : dv < -5 ? 'early' : '';
  }
  const dist = Math.max(0, st.stopS - G.s);
  $('hudNextZh').textContent = st.zh;
  $('hudNextEn').textContent = st.en;
  $('hudDist').textContent = Math.round(dist);
  $('hudTime').textContent = fmtClock(G.clock);
  $('hudSpeed').textContent = Math.round(G.v * 3.6);
  const lim = Math.round(G.limit || 80);
  $('hudLimit').textContent = lim;
  $('hudLimit').className = G.eb ? 'eb' : (lim < 70 ? 'warn' : '');
  const lv = G.lever;
  $('hudTraction').style.width = (lv > 0 ? lv * 50 : 0) + '%';
  $('hudBrake').style.width = (lv < 0 ? -lv * 50 : 0) + '%';
  $('hudLeverTxt').textContent = G.eb ? '紧急制动' : lv > 0.005 ? `牵引 ${Math.round(lv * 100)}%` : lv < -0.005 ? `制动 ${Math.round(-lv * 100)}%` : '0%';
  const ldEl = $('hudLeader');
  if (ldEl) {
    if (G.leaderGap != null && G.leaderGap < 1200) {
      ldEl.textContent = `${G.leaderNo}  ${Math.round(Math.max(0, G.leaderGap))} m`;
      ldEl.style.color = G.leaderGap < 220 ? '#ff9f43' : '';
    } else {
      ldEl.textContent = '—';
      ldEl.style.color = '';
    }
  }
  $('hudDoorL').classList.toggle('open', G.doorT > 0.1);
  $('hudDoorR').classList.toggle('open', false);
  /* 车钩力：多质点动力学的外部可观测指标。
     拉伸为正（起动时后车拖曳），压缩为负（制动时后车顶上来）。 */
  const cpEl = $('hudCoupler');
  if (cpEl) {
    if (G.coupler && (Math.abs(G.coupler.tension) > 2 || Math.abs(G.coupler.compression) > 2)) {
      const v = Math.abs(G.coupler.compression) > G.coupler.tension ? G.coupler.compression : G.coupler.tension;
      cpEl.textContent = `${v > 0 ? '拉' : '压'} ${Math.abs(Math.round(v))} kN`;
      cpEl.style.color = Math.abs(v) > 120 ? '#ff6b5a' : Math.abs(v) > 60 ? '#ffb020' : '#7f939f';
    } else {
      cpEl.textContent = '—';
      cpEl.style.color = '';
    }
  }
  const ebB = $('ebBanner'); if (ebB) ebB.classList.toggle('on', G.eb);
  const ab = $('atoBtn'); if (ab) ab.classList.toggle('on', G.ato);
  const progress = clamp(1 - dist / Math.max(1, st.stopS - (G.targetIdx > 0 ? path.stations[G.targetIdx - 1].stopS : 0)), 0, 1);
  $('hudStopFill').style.width = (G.stopState === 'dwell' || G.stopState === 'stop' ? 100 : progress * 100) + '%';
  let status = '区间运行';
  if (G.sigMode === 'fixed') status = '固定闭塞 · 按地面信号行车';
  if (G.fault) {
    status = G.fault.type === 'door' ? '车门故障 · 按 L 切除'
      : G.fault.type === 'traction' ? '牵引故障 · 限速 40'
        : G.fault.type === 'signal' ? 'ATP 故障 · 固定闭塞'
          : G.fault.type === 'pantograph' ? '受电弓故障 · 牵引锁定'
            : '制动故障 · 制动力下降';
  }
  else if (G.eb) status = '紧急制动';
  else if (G.slipping) status = '轮对空转 · 黏着受限';
  else if (G.slowzone && G.clock < G.slowzone.until) status = `临时限速 ${G.slowzone.limit} km/h`;
  else if (G.regenOn && G.v > 1) status = '再生制动 · 能量回馈';
  else if (G.ato) status = G.atoState === 'dwell' ? 'ATO 停站' : 'ATO 自动运行';
  else if (G.stopState === 'dwell') status = '停站作业';
  else if (G.stopState === 'stop') status = '停稳';
  else if (G.atpWarn) status = '超速警告';
  else if (isLastServed(G.targetIdx) && G.stopState === 'dwell') status = '终到';
  if (G.walk && G.walk.active) {
    if (G.walk.inTrain) {
      const it = G.walk.inTrain;
      status = `${it.carIdx + 1}号车厢${it.seated ? '就座' : '站立'} · ${G.aiTakeover ? 'AI托管运行' : 'F返回驾驶'}`;
    } else {
      status = G.aiTakeover ? '站内步行 · AI已接管列车' : '站内步行 · F 返回';
    }
  }
  $('hudStatus').textContent = status;
  $('hudStatus').className = (G.eb || G.atpWarn) ? 'late' : '';
  /* 步行交互栏按钮：只绑一次（updateHUD 每帧都会调用，重复 addEventListener 会累积） */
  if (!G._wbBound) {
    G._wbBound = true;
    const seatBtn = $('wbActSeat'), tkBtn = $('wbActTakeover'), cabBtn = $('wbActCab');
    if (seatBtn) seatBtn.addEventListener('click', () => { if (typeof walkInteractE === 'function') walkInteractE(); });
    if (tkBtn) tkBtn.addEventListener('click', () => { if (typeof toggleTakeoverPanel === 'function') toggleTakeoverPanel(); });
    if (cabBtn) cabBtn.addEventListener('click', () => {
      if (G.walk && G.walk.inTrain && G.walk.inTrain.aiRef && typeof takeOverTrain === 'function') takeOverTrain(G.walk.inTrain.aiRef);
      else if (typeof toggleWalk === 'function') toggleWalk();
    });
    const backBtn = $('takeoverBack');
    if (backBtn) backBtn.addEventListener('click', () => { if (typeof hideTakeoverPanel === 'function') hideTakeoverPanel(); });
  }
  const wb = $('walkHudBar');
  if (wb) {
    const onWalk = !!(G.walk && G.walk.active);
    wb.classList.toggle('on', onWalk);
    if (onWalk) {
      const it = G.walk.inTrain;
      const locEl = $('wbLoc'), timEl = $('wbTimer'), seatEl = $('wbSeatTxt');
      if (locEl) {
        locEl.textContent = it
          ? `${it.carIdx + 1}号车厢 · ${it.seated ? '已就座' : '站立中'}`
          : `站台步行 · ${(path.stations[G.walk.station] && path.stations[G.walk.station].zh) || ''}`;
      }
      if (seatEl) {
        seatEl.textContent = it ? (it.seated ? '站起活动' : '在座位就座') : '进入车厢';
      }
      if (timEl) {
        const lim = G.aiTakeoverDelay != null ? G.aiTakeoverDelay : 60;
        const away = Math.min(lim, Math.floor(G.walk.awayTimer || 0));
        timEl.textContent = G.aiTakeover
          ? 'AI 已自动接管列车运行'
          : `离车 ${away}s / ${lim}s`;
        timEl.classList.toggle('ai', !!G.aiTakeover);
      }
    }
  }
  // 停车误差
  if (G.stopState === 'stop' || G.stopState === 'dwell') {
    const e = G.s - st.stopS;
    $('hudStopDelta').textContent = (e >= 0 ? '+' : '') + e.toFixed(2) + ' m';
    $('hudStopDelta').style.color = Math.abs(e) < 0.35 ? '#3ddc97' : Math.abs(e) < 1.5 ? '#ffb020' : '#ff6b5a';
  } else {
    $('hudStopDelta').textContent = dist > 0 ? `${Math.round(dist)} m` : '—';
    $('hudStopDelta').style.color = '';
  }
  // 停站倒计时
  if (G.stopState === 'dwell') {
    const dwell = G.clock - st.schArr;
    $('hudDwell').textContent = `停站 ${Math.max(0, Math.round(dwell))}s`;
  } else if (G.doorsOpen) {
    $('hudDwell').textContent = '开门';
  } else if (G.stopState === 'run' && G.v > 0.5 && !G.ato) {
    const d = st.stopS - G.s;
    const need = d > 1 ? (G.v * G.v) / (2 * d) / BRK_SRV : 0;
    if (need > 0.12) {
      $('hudDwell').textContent = `建议制动 ${Math.min(100, Math.round(need * 100))}%`;
      $('hudDwell').style.color = need > 0.85 ? '#ff6b5a' : need > 0.5 ? '#ffb020' : '#8b9daa';
    } else {
      $('hudDwell').textContent = '区间运行';
      $('hudDwell').style.color = '';
    }
  } else {
    $('hudDwell').textContent = G.v > 0.1 ? '运行中' : '待发车';
    $('hudDwell').style.color = '';
  }
  if (G.touchMode && typeof updateTouchUI === 'function') updateTouchUI();
}
