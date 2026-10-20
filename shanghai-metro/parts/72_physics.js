/* ================================================================
   动力学 / 停站判定 / ATO / 车门 / 故障演练
   （由 70_game.js 拆分而来，逻辑未改动）
   ================================================================ */
/* ---------------------------------------------------------------- 时刻 */
/* 本务在某站的计划到发：优先取运行图里「这趟车」的计划，
   取不到就回退到车站对象上的旧字段（兼容没生成运行图的加载路径）。
   HUD / 司机室 HMI / 结算记录都走这一个入口，避免三处口径不一致。 */
function planStopOf(idx) {
  if (typeof path !== 'undefined' && path && path.playerService && typeof ttStopOf === 'function') {
    const sp = ttStopOf(path.playerService, idx);
    if (sp) return sp;
  }
  const st = (typeof path !== 'undefined' && path && path.stations[idx]) || {};
  return { arr: st.schArr, dep: st.schDep };
}

/* 当前正晚点（秒，正为晚点）。
   停稳/停站时用「现在 - 计划到达」；运行中用「预计到达 - 计划到达」。 */
function currentDelay() {
  if (typeof path === 'undefined' || !path || !path.stations[G.targetIdx]) return 0;
  const st = path.stations[G.targetIdx];
  const plan = planStopOf(G.targetIdx);
  if (G.stopState === 'stop' || G.stopState === 'dwell' || G.doorsOpen) {
    return Math.round(G.clock - plan.arr);
  }
  /* 运行中：和 AI 一样用「此刻计划应在的里程」和实际里程比。
     原来用 estimateRunTime(剩余距离, 当前速度)，列车刚起步时速度很低，
     会把 4 km 的区间估成 300 s，HUD 瞬间跳到「晚点 303 s」。 */
  if (path.playerService && typeof ttServicePosition === 'function') {
    const schedPos = ttServicePosition(path.playerService, G.clock);
    const behind = schedPos - G.s;
    return Math.round(behind / Math.max(6, G.v));
  }
  const dd = Math.max(0, st.stopS - G.s);
  const eta = G.clock + (G.v > 1 ? estimateRunTime(dd, Math.max(25, G.v * 3.6)) : 0);
  return Math.round(eta - plan.arr);
}

/* ---------------------------------------------------------------- 物理 */
function stationDist() {
  const st = path.stations[G.targetIdx];
  return st ? st.stopS - G.s : 0;
}

/* 环线终到站是合成站，没有独立站台对象，复用起点站台 */
function stationObjFor(idx) {
  const so = stationObjs[idx];
  if (so) return so;
  const st = path.stations[idx];
  return (st && st.synthetic) ? stationObjs[0] : null;
}
function physics(dt) {
  const st = path.stations[G.targetIdx];
  const v = G.v;
  const speedKmh = v * 3.6;
  const indoor = path.frameAt(G.s).pos.y < -2;

  // ATP 限速
  let limit = path.atpLimit(G.s, v);
  const ldr = playerLeader();
  G.leaderGap = ldr ? ldr.gap : null;
  G.leaderNo = ldr ? ldr.carNo : '';
  if (ldr && ldr.gap < 700) {
    const track = Math.sqrt(2 * 0.85 * Math.max(0, ldr.gap - 24)) * 3.6;
    limit = Math.min(limit, track);
  }
  if (G.sigMode === 'fixed') limit = Math.min(limit, fixedBlockLimit());
  // 牵引故障限速必须先于超速判定生效
  if (G.fault && G.fault.type === 'traction') limit = Math.min(limit, 40);
  /* 运营日临时限速（P2-2）：时间窗内的全线限速 */
  if (G.slowzone && G.clock < G.slowzone.until) limit = Math.min(limit, G.slowzone.limit);
  if (typeof interlockSpeedLimit === 'function') limit = interlockSpeedLimit(G.s, limit);
  G.limit = limit;
  const overBy = speedKmh - limit;
  G.atpWarn = overBy > 3.0;
  if (overBy > 12 && !G.eb) {
    triggerEB('ATP 超速防护动作');
  } else if (overBy > 6.5) {
    if (!G.atpBrake) {
      toast('ATP 实施常用制动 · 请注意限速', 'warn', 3200);
      if (G.exam) examEvent('atp', false);
    }
    G.atpBrake = true;
  }
  if (G.atpBrake && overBy < 1.2) G.atpBrake = false;

  if (G.ato) { atoStep(dt); G.lever = atoCommand(); }

  // 新手模式：停站制动辅助
  if (!G.ato && G.diff === 'easy' && !G.eb && G.stopState === 'run' && st) {
    const d = st.stopS - G.s;
    if (d > 3 && G.v > 0.5) {
      const need = (G.v * G.v) / (2 * d) / BRK_SRV;
      if (need > 0.1 && -G.lever < need * 0.94) G.lever = -clamp(need, 0, 1);
    }
  }

  // 手柄 + 故障 + 车门联锁 → 牵引/制动分档（纯函数，见 58_dynamics.js）
  const split = splitTraction({
    lever: G.lever, eb: G.eb, atpBrake: G.atpBrake,
    doorsOpen: G.doorsOpen, doorT: G.doorT,
    fault: G.fault, doorWarned: G.doorWarned
  });
  let traction = split.traction;
  let brake = split.brake;
  /* 纯函数只报告「哪些事件发生了」，提示与音效仍在这里做，保持行为不变 */
  for (const ev of split.events) {
    if (ev === 'fault:pantograph') {
      G.fault.warned = true;
      toast('受电弓无电流 · 牵引锁定，按 L 重启', 'bad', 5200);
      AUDIO.beep(true);
    } else if (ev === 'fault:door') {
      G.fault.warned = true;
      toast(`${G.fault.name}未关闭 · 牵引被锁定，按 L 切除`, 'bad', 5200);
      AUDIO.beep(true);
    } else if (ev === 'interlock:door') {
      toast('车门未关闭，牵引被锁定', 'warn'); AUDIO.beep(); G.doorWarned = true;
    }
  }
  if (!G.doorsOpen && G.doorT < 0.02) G.doorWarned = false;

  // 牵引/制动 + 阻力 + 坡道 → 加速度（纯函数）
  const dyn = accelFromTraction({
    traction, brake, v, eb: G.eb,
    grip: indoor ? 1 : weatherGrip(),
    grade: path.gradeAt(G.s)
  });
  let a = dyn.a;
  let force = dyn.force;

  /* ---- 多质点车钩：车头加速度由车链解算，后车通过车钩反作用于车头 ----
     这才是真的多质点：车头不再由单质点公式直接积分，而是取车链第 0 节车的
     加速度（含后车传来的车钩力）。后果是真实的：
       · 起步时后车拖住车头，实际加速度略低于指令
       · 制动时后车顶上来，车头减速被"推"得快一点
       · 停站时车钩回弹会造成微小的纵向摆动 → 停站误差与金样基线必然变化 */
  let aHead = a;
  if (train && train.chain && train.chain.n > 1) {
    const ch = train.chain;
    if (!ch.inited || Math.abs(ch.s[0] - G.s) > 2.0) {
      ch.reset(G.s, G.v, 1);
    } else {
      ch.s[0] = G.s;
      ch.v[0] = G.v;
    }
    const vNew = ch.step(a, dt, { grade: path.gradeAt(G.s), dir: 1 });
    /* 车头实际加速度 = 车链解出来的，而不是单质点公式的 a */
    aHead = dt > 1e-6 ? (vNew - v) / dt : a;
    train.chainOffsets = ch.offsets();
    train.chainCoupler = ch.summary();
    G.coupler = train.chainCoupler;
    /* 后车拖拽的真实反馈：车头速度跟随车链，而不是被单质点公式钉死 */
    G.v = vNew;
  } else {
    const nv = v + a * dt;
    if (nv < 0 && brake > 0.01) { G.v = 0; }
    else if (nv < 0) { G.v = Math.max(0, nv); }
    else G.v = nv;
    if (G.v < 0.02 && brake > 0.02) G.v = 0;
  }

  // 停车保持（坡道防溜）
  if (G.v < 0.06 && traction < 0.01 && brake < 0.01) G.v = 0;

  G.s += G.v * dt;
  G.s = clamp(G.s, 0, path.length - 12);

  // 能耗
  if (force > 0) G.energy += force * Math.max(0, G.v) * dt / 3.6e6;

  // 停站判定
  if (st) {
    const dist = st.stopS - G.s;
    if (G.stopState === 'run') {
      if (G.v < 0.05 && Math.abs(dist) < 8) {
        onStopped(st, dist);
      } else if (dist < -8 && G.v > 1) {
        missedStation(st);
      }
    }
    if (G.stopState === 'stop' && G.v > 0.5) {
      onDeparture(st);
    }
    if (G.stopState === 'dwell' && G.v > 0.5) {
      // 门未关强行牵引（已被联锁阻止，这里兜底）
      G.v = 0;
    }
    // 活塞风：高速通过或进入隧道时
    if (G.v > 9 && G.targetIdx >= 0 && !G.announced['w' + G.targetIdx] && dist < 260 && dist > 200) {
      G.announced['w' + G.targetIdx] = true;
      const tunnel = path.frameAt(G.s).pos.y < -2;
      AUDIO.windGust(tunnel ? 1.15 : 0.7);
    }
    // 到达预告
    if (G.stopState === 'run' && dist < 420 && dist > 380 && !G.announced['a' + G.targetIdx]) {
      G.announced['a' + G.targetIdx] = true;
      AUDIO.chime('info');
      AUDIO.announce(`下一站，${st.zh}，请从左侧车门下车，请注意站台间隙。`);
      toast(`下一站  ${st.zh}  ·  请准备停车`, 'info', 4200);
    }
  }

  // 车门动画
  const target = G.doorsOpen ? 1 : 0;
  if (G.doorT !== target) {
    G.doorT += Math.sign(target - G.doorT) * dt * 0.33;
    G.doorT = clamp(G.doorT, 0, 1);
    train.setDoorT(G.doorT);
    const so = stationObjFor(G.targetIdx);
    if (so) { so.psdL.setOpen(G.doorT); }
  }
}
function triggerEB(reason) {
  if (G.eb) return;
  G.eb = true;
  G.ebCount++;
  G.penalties += 15;
  G.lever = 0;
  if (G.exam) {
    examEvent('eb', false);
    if (/ATP/i.test(reason)) examEvent('atp', false);
  }
  AUDIO.beep(true);
  toast('紧急制动 · ' + reason, 'bad', 4200);
}

function releaseEB() {
  if (!G.eb) return false;
  if (G.v > 0.3) {
    toast('列车尚未停稳，不能缓解紧急制动', 'warn', 2600);
    AUDIO.beep();
    return false;
  }
  G.eb = false;
  G.lever = 0;
  AUDIO.hiss(0.45, 0.05);
  toast('紧急制动已缓解 · 可重新牵引（W）', 'good', 3600);
  updateHUD(true);
  return true;
}
/* ---------------- ATO 自动运行 ---------------- */
function toggleATO(force) {
  if (G.mode !== 'driving') return;
  const on = force === undefined ? !G.ato : !!force;
  if (on === G.ato) return;
  G.ato = on;
  if (on) {
    G.atoState = G.doorsOpen ? 'dwell' : (G.stopState === 'run' ? 'run' : 'stopped');
    G.atoTimer = G.doorsOpen ? Math.max(0, (routeDef.dwell || 30) - 7) : 0;
    if (G.stopState === 'stop') G.atoState = 'stopped';
    toast('ATO 自动运行已启用 · 按 A 或 W/S 接管', 'good', 4200);
    AUDIO.beep();
    AUDIO.announce('自动驾驶已启用，列车将自动运行。');
  } else {
    toast('ATO 已退出 · 手动驾驶', 'info', 2600);
  }
  updateHUD(true);
}

function atoStep(dt) {
  const st = path.stations[G.targetIdx];
  switch (G.atoState) {
    case 'run':
      if (G.eb) {
        G.atoTimer += dt;
        if (G.v < 0.1 && G.atoTimer > 2.2) { releaseEB(); G.atoTimer = 0; }
      } else if (G.stopState === 'stop' && G.v < 0.05) {
        G.atoState = 'stopped'; G.atoTimer = 0;
      }
      break;
    case 'stopped':
      G.atoTimer += dt;
      if (G.atoTimer > 1.2) {
        openDoors();
        if (G.doorsOpen) { G.atoState = 'dwell'; G.atoTimer = 0; }
        else if (G.atoTimer > 7) {
          G.ato = false;
          toast('ATO 未能对准站台，已切换人工驾驶', 'bad', 4200);
        }
      }
      break;
    case 'dwell': {
      G.atoTimer += dt;
      /* 停站时长按运行图计划发车时刻：早到多等，晚点只停最短办客时间。
         提前 5 s 关门（关门动画约 3 s + 出发确认 1.5 s）。 */
      const plan = planStopOf(G.targetIdx);
      const closeAt = plan && plan.dep != null ? plan.dep - 5 : null;
      const wantClose = closeAt != null
        ? (G.atoTimer > 8 && G.clock >= closeAt)
        : G.atoTimer > (routeDef.dwell || 30);
      if (!G.doorsOpen && G.doorT < 0.02) { G.atoState = 'waitdepart'; G.atoTimer = 0; }
      else if (wantClose) { closeDoors(); G.atoTimer = 0; }
      break;
    }
    case 'waitdepart':
      G.atoTimer += dt;
      if (G.atoTimer > 1.5) { G.atoState = 'depart'; G.atoTimer = 0; }
      break;
    case 'depart':
      if (G.stopState === 'run') { G.atoState = 'run'; G.atoTimer = 0; }
      break;
  }
}

function atoCommand() {
  const st = path.stations[G.targetIdx];
  if (!st || G.eb) return 0;
  if (G.doorsOpen || G.doorT > 0.03) return 0;
  const v = G.v;
  if (G.atoState === 'depart') return v < 3.2 ? 0.55 : 0;
  if (G.atoState !== 'run') return 0;

  const d = st.stopS - G.s;
  if (d <= 0.3) return v > 0.08 ? -0.7 : 0;

  let vLim = Math.min(path.vmax - 1, path.atpLimit(G.s, v) - 2.0) * KMH;

  /* ATO 也按图运行（P1-2 的延伸）：用剩余距离与计划到达剩余时间反解巡航速度。
     否则 ATO 会以线路限速一路追上前车，被压住后逐站累积晚点。
     手动驾驶不受影响——司机本来就可以选择跑到限速。 */
  const plan = planStopOf(G.targetIdx);
  if (plan && plan.arr != null && typeof ttSolveCruiseFrom === 'function') {
    const tLeft = plan.arr - G.clock;
    if (tLeft > 0 && d > 1) {
      const vC = ttSolveCruiseFrom(d, tLeft, v, path.vmax, 1.3, 0.95);
      vLim = Math.min(vLim, Math.max(vC, d > 30 ? 3 : 0));
    }
  }

  const req = (v * v) / (2 * Math.max(0.35, d - 1.1));

  // 低速精确对位
  if (d < 13) {
    const vCrawl = clamp(d * 0.42, 0, 3.0);
    return clamp((vCrawl - v) * 0.9, -0.75, 0.6);
  }

  let brakeCmd = 0;
  if (v > vLim + 0.25) brakeCmd = Math.max(brakeCmd, clamp(0.18 + (v - vLim) * 0.62, 0.12, 1));
  if (req > 0.42) brakeCmd = Math.max(brakeCmd, clamp(req / 0.95, 0.1, 1));
  if (brakeCmd > 0.02) return -brakeCmd;

  const vT = Math.min(vLim, Math.sqrt(2 * 0.95 * Math.max(0, d - 2.0)));
  /* 牵引爬升按运行图口径（约 1.3 m/s²）：原来 0.85 m/s² 的温和曲线
     会让每段都比计划慢几秒，逐站累积成十几秒晚点。 */
  if (v < vT - 0.12) return clamp(0.5 + (vT - v) * 1.1, 0, 1.3);
  return 0;
}
function onStopped(st, dist) {
  if (G.exam) examEvent('stop', Math.abs(dist));
  G.stopState = 'stop';
  G.stopErr = G.s - st.stopS;
  const e = Math.abs(G.stopErr);
  let base = clamp(100 - 26 * e, 0, 100);
  if (e <= 0.35) base = 100;
  G.stopScore = base;
  if (e <= 0.35) {
    toast(`停车精准 · 偏差 ${(G.stopErr >= 0 ? '+' : '')}${G.stopErr.toFixed(2)} m  ·  +100`, 'good', 5000);
    AUDIO.chime('info');
  } else if (e <= 1.2) {
    toast(`停车良好 · 偏差 ${(G.stopErr >= 0 ? '+' : '')}${G.stopErr.toFixed(2)} m  ·  +${Math.round(base)}`, 'good', 4600);
  } else {
    toast(`停车偏差 ${(G.stopErr >= 0 ? '+' : '')}${G.stopErr.toFixed(2)} m  ·  +${Math.round(base)}`, 'warn', 4600);
  }
  if (G.targetIdx > 0) {
    const plan = planStopOf(G.targetIdx);
    G.results.push({
      idx: G.targetIdx, zh: st.zh, err: G.stopErr, stopScore: base,
      arrClock: G.clock, schArr: plan.arr, arrDelay: Math.round(G.clock - plan.arr), depDelay: 0, punc: 0
    });
  }
  AUDIO.announce(`${st.zh}站，到了。`);
}

function onDeparture(st) {
  if (G.exam && st.index === 0) examEvent('depart', G.clock - st.schDep);
  if (G.exam && st.index > 0 && !G.doorAt[st.index]) examEvent('door', false);
  G.stopState = 'run';
  const rec = G.results.find(r => r.idx === G.targetIdx);
  const delay = G.clock - planStopOf(G.targetIdx).dep;
  if (rec) {
    rec.depClock = G.clock; rec.depDelay = delay;
    rec.punc = clamp(100 - 1.5 * Math.abs(delay), 0, 100);
  }
  const prevIdx = G.targetIdx;
  G.announced['a' + prevIdx] = false;
  const nxIdx = nextServedIdx(prevIdx);
  if (nxIdx < path.stations.length) {
    G.targetIdx = nxIdx;
    const nx = path.stations[nxIdx];
    AUDIO.announce(`车门关闭，列车启动，下一站，${nx.zh}。`);
    toast(`发车 · 下一站 ${nx.zh}`, 'info', 4000);
    // 关闭已离开车站的屏蔽门
    const prev = stationObjFor(prevIdx);
    if (prev) { prev.psdL.setOpen(0); }
  }
  updateTimetable();
}

function missedStation(st) {
  toast(`越过 ${st.zh} 停车位置 · 本站未办理乘降`, 'bad', 5000);
  if (G.exam) { examEvent('door', false); examEvent('stop', 99); }
  G.penalties += 30;
  const prevIdx = G.targetIdx;
  G.results.push({ idx: prevIdx, zh: st.zh, err: 99, stopScore: 0, arrClock: G.clock, schArr: planStopOf(prevIdx).arr, arrDelay: 99, punc: 0 });
  G.stopState = 'run';
  const prev = stationObjFor(prevIdx);
  if (prev) { prev.psdL.setOpen(0); }
  const nxIdx = nextServedIdx(prevIdx);
  if (nxIdx < path.stations.length) {
    G.targetIdx = nxIdx;
    updateTimetable();
  } else {
    finishService();
  }
}
/* ---------------------------------------------------------------- 门控 */
function openDoors() {
  if (G.mode !== 'driving' || G.paused) return;
  if (G.doorsOpen) return;
  const st = path.stations[G.targetIdx];
  if (G.v > 0.2) { toast('列车未停稳，车门不能开启', 'warn'); AUDIO.beep(); return; }
  const dist = Math.abs(G.s - st.stopS);
  if (dist > 8) { toast('未对准站台，车门不能开启', 'bad'); AUDIO.beep(); return; }
  if (G.stopState !== 'stop' && G.stopState !== 'dwell') { toast('当前不在停站状态', 'warn'); return; }
  G.doorsOpen = true;
  G.stopState = 'dwell';
  G.doorAt[G.targetIdx] = true;
  /* 运营日：大客流站点办客即记为已服务（P2-2/P2-4 满意度） */
  if (typeof sessionCrowdServed === 'function') sessionCrowdServed(G.targetIdx);
  AUDIO.hiss(1.1, 0.05);
  setTimeout(() => AUDIO.thud(), 340);
  AUDIO.chime('open');
  toast('车门开启 · 请确认站台安全', 'good', 3000);
  maybeFault();
  AUDIO.announce('车门已开启，请先下后上，注意站台间隙。');
  const rec = G.results.find(r => r.idx === G.targetIdx);
  if (rec) {
    rec.arrDelay = Math.round(G.clock - planStopOf(G.targetIdx).arr);
  }
  if (isLastServed(G.targetIdx)) {
    G.finishTimer = 6;
    const plan = planStopOf(G.targetIdx);
    const rec2 = G.results.find(r => r.idx === G.targetIdx);
    if (rec2) {
      rec2.punc = clamp(100 - 1.5 * Math.abs(G.clock - plan.arr), 0, 100);
      rec2.depDelay = G.clock - plan.arr;
    }
    toast('终到站 · 本次值乘即将结束', 'good', 5000);
  }
}
/* ---------------- 故障演练 ---------------- */
const FAULT_TYPES = [
  { type: 'door', w: 0.34, make: () => {
      const car = 2 + Math.floor(Math.random() * 4);
      return { name: `${car} 号车门`, brief: `${car} 号车门未关闭`, hint: '按 L 切除该车门' };
    } },
  { type: 'traction', w: 0.24, make: () => ({ name: '牵引逆变器', brief: '牵引逆变器故障', hint: '限速 40 km/h，按 L 复位' }) },
  { type: 'signal', w: 0.2, make: () => ({ name: '车载 ATP', brief: '车载 ATP 故障', hint: '已转入固定闭塞，按 L 复位' }) },
  { type: 'pantograph', w: 0.12, make: () => ({ name: '受电弓', brief: '受电弓检测异常', hint: '牵引锁定，按 L 重启' }) },
  { type: 'brake', w: 0.1, make: () => ({ name: '制动系统', brief: '制动缓解不良', hint: '制动力下降，按 L 复位' }) }
];

function maybeFault() {
  /* 运营日的故障由种子时间轴触发（66_session_game.js），不再走随机 */
  if (G.session) return;
  const chance = G.diff === 'hard' ? 0.24 : G.diff === 'easy' ? 0.05 : 0.13;
  if (G.fault || G.targetIdx === 0) return;
  if (Math.random() > chance) return;
  let r = Math.random(), pick = FAULT_TYPES[0];
  for (const f of FAULT_TYPES) { r -= f.w; if (r <= 0) { pick = f; break; } }
  const info = pick.make();
  G.fault = { type: pick.type, name: info.name, warned: false };
  G.faultCount++;
  toast(`⚠ ${info.brief} · ${info.hint}`, 'bad', 6800);
  AUDIO.beep(true);
  AUDIO.announce(`${info.brief}，请司机处理。`);
  if (pick.type === 'signal') G.sigMode = 'fixed';
  updateHUD(true);
}

function clearFault() {
  if (!G.fault) return;
  const n = G.fault.name, ty = G.fault.type;
  G.fault = null;
  if (G.session) G.session.legFaultsFixed++;
  G.penalties += 6;
  AUDIO.beep();
  AUDIO.hiss(0.3, 0.04);
  if (ty === 'signal') G.sigMode = 'cbtc';
  const msg = ty === 'door' ? `${n}已切除 · 牵引锁定解除`
    : ty === 'traction' ? '牵引逆变器已复位 · 限速解除'
      : ty === 'signal' ? 'ATP 已重启 · 恢复移动闭塞'
        : ty === 'pantograph' ? '受电弓已重启 · 牵引恢复'
          : '制动系统已复位';
  toast(msg, 'good', 3800);
  if (G.exam) examEvent('faultFixed');
  updateHUD(true);
}

function closeDoors() {
  if (G.mode !== 'driving' || G.paused) return;
  if (!G.doorsOpen) return;
  G.doorsOpen = false;
  G.stopState = 'stop';
  AUDIO.chime('close');
  AUDIO.hiss(0.9, 0.042);
  setTimeout(() => AUDIO.thud(), 2750);
  toast('车门关闭 · 可以发车', 'good', 3000);
}
