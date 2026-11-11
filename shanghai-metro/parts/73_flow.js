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
  G.energy = 0; G.energyTraction = 0; G.regen = 0; G.regenOn = false;
  G.slipping = false; G._slipWarned = false;
  G.couplerPeak = { tension: 0, compression: 0 }; G.finishTimer = -1;
  G.announced = {};
  G.camMode = 0; G.yaw = 0; G.pitch = -0.02;
  G.ato = false; G.atoState = 'run'; G.atoTimer = 0; G.atpBrake = false; G.doorWarned = false;
  if (typeof IX !== 'undefined' && IX.routes.length) IX.applyRoute('main', true);
  G.fault = null; G.faultCount = 0; G.speedLog = [];
  G.sigMode = 'cbtc'; G.examTasks = []; G.examDone = 0; G.doorAt = {};
  G.walk = null; G.turnback = null; G.slowzone = null;
  G.aiTakeover = false; G.carNo = line.badge + '014';
  hideTransferPanel();
  if (typeof hideTakeoverPanel === 'function') hideTakeoverPanel();
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
  if (typeof sessionUpdateHud === 'function') sessionUpdateHud();
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
  if (typeof maybeShowOnboard === 'function') maybeShowOnboard(false);
}
/* ---------------- 站内步行 / 自由进出车厢 / 就座与乘车 / AI 接管 ---------------- */
function enterWalk(idx) {
  const st = path.stations[idx], f = st.frame;
  const pos = f.pos.clone()
    .addScaledVector(f.right, -3.0)
    .addScaledVector(f.up, 1.06 + 1.7)
    .addScaledVector(f.tan, 60);
  G.walk = {
    active: true, station: idx, pos,
    yaw: Math.atan2(-f.tan.x, -f.tan.z), pitch: 0,
    tip: false, tpHidden: false,
    awayTimer: 0, _warned30: false,
    inTrain: null
  };
  G.aiTakeover = false;
  hideTransferPanel();
  hideTakeoverPanel();
}

function toggleWalk() {
  if (G.mode !== 'driving' || G.paused) return;
  if (G.walk && G.walk.active) {
    if (G.walk.inTrain && G.walk.inTrain.aiRef) {
      takeOverTrain(G.walk.inTrain.aiRef);
      return;
    }
    G.walk.active = false;
    G.walk.inTrain = null;
    G.aiTakeover = false;
    if (G.ato) G.ato = false;
    hideTransferPanel();
    hideTakeoverPanel();
    updateCamera(0, true);
    updateHUD(true);
    toast('已返回司机室 · 手动接管本列车', 'info', 2600);
    return;
  }
  if (G.stopState !== 'dwell' || !G.doorsOpen) { toast('停稳并开门后才能下车', 'warn', 3000); return; }
  if (isLastServed(G.targetIdx)) { toast('终到站请结束值乘', 'warn', 3000); return; }
  if (G.ato) toggleATO(false);
  enterWalk(G.targetIdx);
  toast('步行模式 · 可自由走进车厢（按 E 就座/站立）、前往换乘通道，或按 G 接管任意列车', 'info', 5200);
}

/* 查找当前在指定车站停靠且开门的列车（本务或 AI 列车） */
function findOpenTrainsAtStation(stIdx) {
  const st = path.stations[stIdx];
  if (!st) return [];
  const out = [];
  if (train && Math.abs(G.s - st.stopS) < 16 && G.doorT > 0.45) {
    out.push({ trainRef: train, aiRef: null, s: G.s, side: (train.lateral || -TRACK_LAT) < 0 ? -1 : 1 });
  }
  if (typeof aiTrains !== 'undefined') {
    for (const ai of aiTrains) {
      if (!ai || ai.dead || !ai.train) continue;
      if (Math.abs(ai.s - st.stopS) < 18 && ai.doorT > 0.45) {
        out.push({ trainRef: ai.train, aiRef: ai, s: ai.s, side: (ai.lateral || TRACK_LAT) < 0 ? -1 : 1 });
      }
    }
  }
  return out;
}

/* 进入指定列车的某节车厢 */
function enterTrainCar(trainObj, carIdx = 0, lzOpt = 0, lxOpt = 0) {
  if (!G.walk || !G.walk.active || !trainObj || !trainObj.cars || !trainObj.cars.length) return false;
  const idx = clamp(carIdx | 0, 0, trainObj.cars.length - 1);
  const car = trainObj.cars[idx];
  const zMax = idx === 0 ? 6.65 : 10.9;
  const lz = clamp(lzOpt || 0, -10.9, zMax);
  const lx = clamp(lxOpt || 0, -0.78, 0.78);
  const carFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(car.group.quaternion);
  G.walk.inTrain = {
    trainRef: trainObj,
    aiRef: trainObj.ai || null,
    carIdx: idx,
    lx,
    lz,
    seated: false,
    seatSide: 0,
    _lastCarYaw: Math.atan2(carFwd.x, carFwd.z)
  };
  const eyeY = 1.15 + 1.66;
  G.walk.pos.copy(car.group.localToWorld(new THREE.Vector3(lx, eyeY, lz)));
  hideTransferPanel();
  const label = trainObj.ai ? `${trainObj.ai.carNo} 次列车` : '本务列车';
  toast(`已进入${label} ${idx + 1} 号车厢 · 按 E 就座/站立，可穿过贯通道前往其它车厢`, 'good', 3600);
  return true;
}

/* 在车厢内切换就座 / 站立，或在站台上按键快速进入最近车厢 */
function walkInteractE() {
  if (!G.walk || !G.walk.active) return false;
  const w = G.walk;
  if (w.inTrain) {
    const it = w.inTrain;
    const tr = it.trainRef || train;
    const car = tr.cars[clamp(it.carIdx, 0, tr.cars.length - 1)];
    if (it.seated) {
      it.seated = false;
      it.lx = (it.seatSide || -1) * 0.36;
      const p = car.group.localToWorld(new THREE.Vector3(it.lx, 1.15 + 1.66, it.lz));
      w.pos.copy(p);
      toast(`已在 ${it.carIdx + 1} 号车厢站起 · 可在车厢及贯通道内自由走动`, 'info', 2600);
      return true;
    } else {
      // 寻找当前车厢内最近的空余座位点
      let bestSpot = null, bd = 1e9;
      if (car && car.seatSpots && car.seatSpots.length) {
        for (const sp of car.seatSpots) {
          const d = Math.hypot(sp.x - it.lx, sp.z - it.lz);
          if (d < bd) { bd = d; bestSpot = sp; }
        }
      }
      if (!bestSpot) {
        const sSide = it.lx < 0 ? -1 : 1;
        bestSpot = { x: sSide * 1.02, z: clamp(it.lz, -6.2, 6.2), side: sSide };
      }
      it.seated = true;
      it.seatSide = bestSpot.side;
      it.lx = bestSpot.x;
      it.lz = bestSpot.z;
      // 朝向车厢过道对面（与同排坐姿乘客一致）
      const across = new THREE.Vector3(-bestSpot.side, 0, 0).applyQuaternion(car.group.quaternion);
      w.yaw = Math.atan2(-across.x, -across.z);
      w.pitch = -0.03;
      const p = car.group.localToWorld(new THREE.Vector3(it.lx, 1.15 + 1.16, it.lz));
      w.pos.copy(p);
      toast(`已在 ${it.carIdx + 1} 号车厢就座 · 按 E 可站起，列车开行时可乘车观景`, 'good', 3400);
      return true;
    }
  }
  // 在站台上按 E：直接步入当前停站开门列车的最近车厢
  const openList = findOpenTrainsAtStation(w.station);
  if (!openList.length) {
    toast('当前站台无开门列车 · 可等待后车进站或按 G 接管任意列车', 'warn', 3000);
    return false;
  }
  let bestTr = openList[0].trainRef, bestCar = 0, bestZ = 0, bestD = 1e9;
  for (const item of openList) {
    item.trainRef.cars.forEach((c, ci) => {
      const loc = c.group.worldToLocal(w.pos.clone());
      const d = Math.hypot(loc.x, loc.z);
      if (d < bestD) { bestD = d; bestTr = item.trainRef; bestCar = ci; bestZ = loc.z; }
    });
  }
  const dList = doorOffsetsOf(bestTr.line);
  let nearDoorZ = dList[0];
  for (const dz of dList) if (Math.abs(dz - bestZ) < Math.abs(nearDoorZ - bestZ)) nearDoorZ = dz;
  return enterTrainCar(bestTr, bestCar, nearDoorZ, 0);
}

function clampWalk() {
  if (!G.walk || !G.walk.active) return;
  const w = G.walk;

  // 1. 若玩家当前在车厢内（支持站立走动、跨车厢贯通道穿行、就座乘车、开门时走出车门回站台）
  if (w.inTrain) {
    const it = w.inTrain;
    const tr = it.trainRef || train;
    if (!tr || !tr.cars || !tr.cars.length) { w.inTrain = null; return; }
    it.carIdx = clamp(it.carIdx | 0, 0, tr.cars.length - 1);
    let car = tr.cars[it.carIdx];
    const carFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(car.group.quaternion);
    const curCarYaw = Math.atan2(carFwd.x, carFwd.z);
    if (it._lastCarYaw != null) {
      let dy = curCarYaw - it._lastCarYaw;
      while (dy > PI) dy -= TAU;
      while (dy < -PI) dy += TAU;
      w.yaw += dy;
    }
    it._lastCarYaw = curCarYaw;

    if (it.seated) {
      it.lx = (it.seatSide || -1) * 1.02;
      const eyeY = 1.15 + 1.16;
      w.pos.copy(car.group.localToWorld(new THREE.Vector3(it.lx, eyeY, it.lz)));
      return;
    }

    // 站立在车厢内：检查是否穿过前后贯通道进入相邻车厢
    if (it.lz < -11.32 && it.carIdx < tr.cars.length - 1 && Math.abs(it.lx) < 0.72) {
      it.carIdx++;
      it.lz = 11.18;
      car = tr.cars[it.carIdx];
      const f2 = new THREE.Vector3(0, 0, 1).applyQuaternion(car.group.quaternion);
      it._lastCarYaw = Math.atan2(f2.x, f2.z);
      toast(`已穿过贯通道进入 ${it.carIdx + 1} 号车厢`, 'info', 2000);
    } else if (it.lz > 11.32 && it.carIdx > 0 && Math.abs(it.lx) < 0.72) {
      it.carIdx--;
      it.lz = -11.18;
      car = tr.cars[it.carIdx];
      const f2 = new THREE.Vector3(0, 0, 1).applyQuaternion(car.group.quaternion);
      it._lastCarYaw = Math.atan2(f2.x, f2.z);
      toast(`已穿过贯通道进入 ${it.carIdx + 1} 号车厢`, 'info', 2000);
    }

    const zMin = it.carIdx < tr.cars.length - 1 ? -11.36 : -10.85;
    const zMax = it.carIdx === 0 ? 6.72 : 11.36;
    it.lz = clamp(it.lz, zMin, zMax);

    // 检查是否从开启的车门走出车厢回到站台
    const dSide = tr.doorSide || 1;
    const dList = doorOffsetsOf(tr.line);
    const atDoor = tr.doorT > 0.55 && dList.some(dz => Math.abs(it.lz - dz) < 0.88);
    if (atDoor) {
      if (dSide > 0) it.lx = clamp(it.lx, -0.86, 1.72);
      else it.lx = clamp(it.lx, -1.72, 0.86);
      if (it.lx * dSide > 1.48) {
        // 走出车门，切换到当前最近车站的站台坐标
        const trS = it.aiRef ? it.aiRef.s : G.s;
        let nearIdx = w.station || 0, bd = 1e9;
        path.stations.forEach((s, idx) => {
          const d = Math.abs(s.stopS - trS);
          if (d < bd) { bd = d; nearIdx = idx; }
        });
        w.station = nearIdx;
        const stNow = path.stations[nearIdx], fNow = stNow.frame;
        const worldDoor = car.group.localToWorld(new THREE.Vector3(dSide * 1.95, 1.15 + 1.66, it.lz));
        const invNow = new THREE.Matrix4().makeBasis(fNow.right, fNow.up, fNow.tan).invert();
        const locNow = worldDoor.sub(fNow.pos).applyMatrix4(invNow);
        locNow.x = (tr.lateral || -TRACK_LAT) < 0 ? -3.52 : 3.52;
        locNow.z = clamp(locNow.z, -68, 68);
        locNow.y = 1.06 + 1.7;
        w.inTrain = null;
        w.pos.copy(fNow.pos)
          .addScaledVector(fNow.right, locNow.x)
          .addScaledVector(fNow.up, locNow.y)
          .addScaledVector(fNow.tan, locNow.z);
        toast(`已步出车厢 · 当前位于 ${stNow.zh} 站台`, 'info', 2600);
        return;
      }
    } else {
      it.lx = clamp(it.lx, -0.86, 0.86);
    }

    const eyeY = 1.15 + 1.66;
    w.pos.copy(car.group.localToWorld(new THREE.Vector3(it.lx, eyeY, it.lz)));
    return;
  }

  // 2. 站台与换乘通道内步行（若走向开启的屏蔽门/车门，则自然步入车厢！）
  const st = path.stations[w.station], f = st.frame;
  const inv = new THREE.Matrix4().makeBasis(f.right, f.up, f.tan).invert();
  const local = w.pos.clone().sub(f.pos).applyMatrix4(inv);

  if (Math.abs(local.x) > 3.68 && local.z >= -68 && local.z <= 69) {
    const sideWanted = local.x < 0 ? -1 : 1;
    const openList = findOpenTrainsAtStation(w.station).filter(o => o.side === sideWanted);
    for (const item of openList) {
      const tr = item.trainRef;
      const dList = doorOffsetsOf(tr.line);
      for (let ci = 0; ci < tr.cars.length; ci++) {
        const cLoc = tr.cars[ci].group.worldToLocal(w.pos.clone());
        if (Math.abs(cLoc.z) > CAR_LEN / 2 + 0.3) continue;
        const nearDoor = dList.find(dz => Math.abs(cLoc.z - dz) < 1.15);
        if (nearDoor !== undefined) {
          // 允许穿过屏蔽门与车门门槛（|local.x| > 4.20 即进入车厢内部）
          if (Math.abs(local.x) > 4.18) {
            enterTrainCar(tr, ci, nearDoor, (tr.doorSide || 1) * 0.72);
            return;
          }
          local.z = lerp(local.z, local.z + (nearDoor - cLoc.z) * 0.35, 0.5);
          local.y = 1.06 + 1.7;
          w.pos.copy(f.pos)
            .addScaledVector(f.right, local.x)
            .addScaledVector(f.up, local.y)
            .addScaledVector(f.tan, local.z);
          return;
        }
      }
    }
  }

  local.x = clamp(local.x, -3.75, 3.75);
  local.z = Math.max(local.z, -69);
  const hasTr = st.tr && st.tr.length;
  if (hasTr) {
    if (local.z > 69) {
      const maxX = local.z > 91 ? 5.1 : 3.0;
      local.x = clamp(local.x, -maxX, maxX);
      local.z = Math.min(local.z, 101);
      if (!w.tip) {
        w.tip = true;
        toast('换乘通道 · 有乘客正在双向换乘，走到尽头可换乘其它线路', 'info', 4200);
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

/* ---------------- 离开列车 1 分钟后 AI 自动接管 & 允许接管任意列车 ---------------- */
function triggerAiTakeover() {
  if (G.aiTakeover) return;
  G.aiTakeover = true;
  G.ato = true;
  G.atoState = G.doorsOpen ? 'dwell' : (G.stopState === 'run' ? 'run' : 'stopped');
  G.atoTimer = 99;
  if (G.eb) releaseEB();
  /* 玩家不在车上（在站台/换乘通道）时，本务列车由 AI 直接开走：
     不再原地「托管」——把本务状态交给一列真正的 AI 车，
     玩家从此是站台上的乘客，等下一列进站再接管。 */
  const playerOffBoard = G.walk && G.walk.active && !G.walk.inTrain;
  if (playerOffBoard) {
    scheduleNextTrainForPlayer(G.walk.station);
  }
  AUDIO.beep();
  toast(playerOffBoard
    ? '离开驾驶室已满 1 分钟 · AI 已接管并驶离本列车，你已成为乘客（按 G 接管下一列进站列车）'
    : '离开驾驶室已满 1 分钟 · AI 已自动接管本列车（按 G 可随时接管任意列车）', 'good', 5600);
  updateHUD(true);
}

/* 给站台上的玩家调一列车：优先复用前方同向 AI 车（把它拉到本站上游 170 m 进站），
   没有可用 AI 车时，用「本务车的副本」新造一列，避免玩家永远等不到车。 */
function scheduleNextTrainForPlayer(stationIdx) {
  if (stationIdx == null) return null;
  const st = path.stations[stationIdx];
  if (!st || typeof aiTrains === 'undefined') return null;
  /* 已经有一列同向车正在本站附近进站，就别重复调度 */
  for (const a of aiTrains) {
    if (!a || a.dead || a.dir !== 1) continue;
    if (Math.abs(a.s - st.stopS) < 200 && a.stops) return a;
  }
  const free = aiTrains.find(a => !a.dead && a.dir === 1 && a.stops);
  if (free) {
    free.s = Math.max(0, st.stopS - 170);
    free.v = Math.max(8, free.v);
    free.idx = stationIdx;
    free.state = 'run';
    free.doorT = 0;
    free.dwellT = 0;
    free.holdT = 0;
    free.lateral = -TRACK_LAT;
    free.train.lateral = free.lateral;
    free.train.setDoorT(0);
    free.train.update(free.s, free.v, 0);
    G.nextTrainNo = free.carNo;
    G.nextTrainEta = 170 / Math.max(4, free.v);
    return free;
  }
  return null;
}

function updateWalkTimer(dt) {
  if (!G.walk || !G.walk.active) return;
  G.walk.awayTimer = (G.walk.awayTimer || 0) + dt;
  const limit = G.aiTakeoverDelay != null ? G.aiTakeoverDelay : 60;
  if (!G.walk._warned30 && G.walk.awayTimer >= limit * 0.5 && !G.aiTakeover) {
    G.walk._warned30 = true;
    toast(`离开驾驶室已 ${Math.round(G.walk.awayTimer)} 秒 · 满 1 分钟 AI 将自动接管车辆`, 'warn', 3600);
  }
  if (!G.aiTakeover && G.walk.awayTimer >= limit) {
    triggerAiTakeover();
  }
}

/* 接管任意一辆列车：支持 'self'（本务车）、AiTrain 实例、车号字符串或索引 */
function takeOverTrain(target) {
  if (!path || !train) return false;
  hideTakeoverPanel();
  hideTransferPanel();

  // 未传参时：若在某列车厢内则接管该车，否则优先接管距离最近的列车
  if (target === undefined || target === null) {
    if (G.walk && G.walk.active && G.walk.inTrain && G.walk.inTrain.aiRef) {
      target = G.walk.inTrain.aiRef;
    } else if (G.walk && G.walk.active && !G.walk.inTrain && typeof aiTrains !== 'undefined' && aiTrains.length) {
      const refS = path.stations[G.walk.station] ? path.stations[G.walk.station].stopS : G.s;
      let best = 'self', bd = Math.abs(G.s - refS);
      for (const a of aiTrains) {
        if (a && !a.dead && Math.abs(a.s - refS) < bd) { bd = Math.abs(a.s - refS); best = a; }
      }
      target = best;
    } else {
      target = 'self';
    }
  }

  let ai = null;
  if (target === 'self' || target === train || target === 0) {
    ai = null;
  } else if (typeof target === 'object' && target.train) {
    ai = target;
  } else if (typeof target === 'string' && typeof aiTrains !== 'undefined') {
    ai = aiTrains.find(a => a && !a.dead && String(a.carNo) === target) || null;
  } else if (typeof target === 'number' && typeof aiTrains !== 'undefined') {
    ai = aiTrains[target - 1] || aiTrains[target] || null;
  }

  if (!ai) {
    // 接管本务列车
    if (G.walk) { G.walk.active = false; G.walk.inTrain = null; }
    G.aiTakeover = false;
    G.ato = false;
    G.eb = false;
    G.lever = 0;
    updateCamera(0, true);
    updateHUD(true);
    toast(`已接管本务列车（${G.carNo || (line.badge + '014')} 次）· 手动驾驶已就绪`, 'good', 3800);
    return true;
  }

  /* 接管选中的 AI 列车：玩家直接成为它的司机。
     原来的「交换控制权」会让玩家那列 AI 车凭空跳到本务位置，玩家看不到
     「我的车被开走了」这件事。现在改为：
       - 目标列车 → 本务（玩家接手）
       - 原来的本务车 → 完全交给 AI，按它自己的位置继续跑（不瞬移）
     这样玩家在站台上等下一列车、再接管，整个过程是连续的。 */
  const prevPlayer = {
    s: G.s,
    v: G.v,
    idx: G.targetIdx,
    doorT: G.doorT,
    doorsOpen: G.doorsOpen,
    carNo: G.carNo || (line.badge + '014'),
    keepRunning: !!G.aiTakeover
  };

  const newS = clamp(ai.s, 0, path.stations[path.stations.length - 1].stopS - 2);
  let nextIdx = clamp(ai.idx != null ? ai.idx : ai.nearestStationIdx(), 0, path.stations.length - 1);
  for (let i = 0; i < path.stations.length; i++) {
    if (path.stations[i].stopS >= newS - 6) { nextIdx = i; break; }
  }
  const stTarget = path.stations[nextIdx];
  const atStop = Math.abs(stTarget.stopS - newS) < 8 && ai.v < 0.15;
  const openNow = (ai.state === 'dwell' || ai.doorT > 0.35) && atStop;

  G.s = newS;
  G.v = openNow ? 0 : ai.v;
  G.targetIdx = nextIdx;
  G.doorsOpen = openNow;
  G.doorT = openNow ? Math.max(0.85, ai.doorT) : 0;
  G.stopState = openNow ? 'dwell' : (atStop ? 'stop' : 'run');
  G.carNo = ai.carNo || (line.badge + '021');
  G.lever = 0;
  G.eb = false;
  G.ato = false;
  G.aiTakeover = false;
  if (G.walk) { G.walk.active = false; G.walk.inTrain = null; }

  /* 目标列车已经从 aiTrains 里被玩家接手：把它标成 dead 并从列表移除，
     避免它继续按 AI 逻辑跑、跟本务车重影。 */
  ai.dead = true;
  if (ai.train && ai.train.group && ai.train.group.parent) {
    ai.train.group.parent.remove(ai.train.group);
  }
  const aiPos = aiTrains.indexOf(ai);
  if (aiPos >= 0) aiTrains.splice(aiPos, 1);

  /* 原来那列本务车：如果玩家已经是「乘客」状态（AI 已接管），
     就补一列 AI 车在原位继续运营，让线路不至于少一列车。 */
  if (prevPlayer.keepRunning && typeof AiTrain === 'function') {
    try {
      const ghost = new AiTrain(path, line, {
        dir: 1, lateral: -TRACK_LAT, s: prevPlayer.s, v: prevPlayer.v,
        idx: clamp(prevPlayer.idx, 0, path.stations.length - 1),
        carNo: prevPlayer.carNo, stops: true, dest: line.stations[line.stations.length - 1]
      });
      ghost.state = prevPlayer.doorsOpen ? 'dwell' : 'run';
      ghost.doorT = prevPlayer.doorT;
      ghost.dwellT = 0;
      ghost.dwellNeed = 8;
      ghost.train.lateral = ghost.lateral;
      ghost.train.setDoorT(ghost.doorT);
      ghost.train.update(ghost.s, ghost.v, 0);
      if (typeof scene !== 'undefined' && scene) scene.add(ghost.train.group);
      aiTrains.push(ghost);
    } catch (e) { /* 造车失败不影响接管 */ }
  }

  if (train.chain) train.chain.reset(G.s, G.v, 1);
  train.lateral = -TRACK_LAT;
  train.dir = 1;
  train.setDoorT(G.doorT);
  train.update(G.s, G.v, 0);
  const so = stationObjFor(G.targetIdx);
  if (so && so.psdL) so.psdL.setOpen(G.doorT);
  updateTimetable();
  updateCamera(0, true);
  updateHUD(true);
  toast(`已成功接管 ${G.carNo} 次列车 · 当前位于 ${stTarget.zh} 区段`, 'good', 4200);
  return true;
}

function showTakeoverPanel() {
  const box = $('takeoverPanel'), list = $('takeoverList');
  if (!box || !list || !path || !train) return;
  const items = [];
  const nearStOf = (sVal) => {
    let best = path.stations[0], bd = 1e9;
    for (const st of path.stations) {
      const d = Math.abs(st.stopS - sVal);
      if (d < bd) { bd = d; best = st; }
    }
    return best ? best.zh : '区间';
  };
  const selfNo = G.carNo || (line.badge + '014');
  items.push({
    id: 'self',
    title: `${selfNo} 次（本务列车${G.aiTakeover ? ' · AI 托管中' : ''}）`,
    sub: `位置：${nearStOf(G.s)} 附近 · 速度 ${Math.round(G.v * 3.6)} km/h · ${G.doorsOpen ? '停站开门' : '运行/待发'}`,
    tag: '接管本务'
  });
  if (typeof aiTrains !== 'undefined') {
    aiTrains.forEach((ai, idx) => {
      if (!ai || ai.dead) return;
      const dirTxt = ai.dir > 0 ? '上行同向' : '下行对向';
      items.push({
        id: String(ai.carNo),
        idx,
        title: `${ai.carNo} 次（${dirTxt}列车）`,
        sub: `位置：${nearStOf(ai.s)} 附近 · 速度 ${Math.round(ai.v * 3.6)} km/h · ${ai.state === 'dwell' ? '停站开门' : '区间运行'}`,
        tag: '立即接管'
      });
    });
  }
  list.innerHTML = items.map(it => `
    <button type="button" class="tk-item" data-tk="${it.id}">
      <div><b>${it.title}</b><small>${it.sub}</small></div>
      <span class="tk-tag">${it.tag}</span>
    </button>`).join('');
  list.querySelectorAll('.tk-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tk = btn.dataset.tk;
      takeOverTrain(tk === 'self' ? 'self' : tk);
    });
  });
  box.classList.remove('hidden');
}

function hideTakeoverPanel() {
  const box = $('takeoverPanel');
  if (box) box.classList.add('hidden');
}

function toggleTakeoverPanel() {
  const box = $('takeoverPanel');
  if (!box) return;
  if (!box.classList.contains('hidden')) {
    hideTakeoverPanel();
  } else {
    showTakeoverPanel();
  }
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
  /* 运营日是一整段交路，中途换线会打断时段编排与逐段对账 */
  if (typeof sessionActive === 'function' && sessionActive()) {
    toast('运营日期间不可换乘 · 请按交路完成本段值乘', 'warn', 3600);
    return;
  }
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
    G.energy = 0; G.energyTraction = 0; G.regen = 0; G.regenOn = false; G.speedLog = [];
    G.slipping = false; G._slipWarned = false;
    G.couplerPeak = { tension: 0, compression: 0 };
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
  const isSession = (typeof sessionActive === 'function') && sessionActive();
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
  const cpk = G.couplerPeak || { tension: 0, compression: 0 };
  $('resEnergy').innerHTML = `牵引 ${Math.round(G.energyTraction || 0)} kWh · 回馈 ${Math.round(G.regen || 0)} kWh · 净 ${Math.round(G.energy || 0)} kWh`
    + `<br>车钩峰值 拉 ${Math.round(cpk.tension)} kN / 压 ${Math.abs(Math.round(cpk.compression))} kN`;
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

  /* ---- 运营日（P2）：提交本段成绩，进入段间交接或最终结算 ---- */
  if (isSession) {
    sessionCommitLeg();
    const sess = G.session;
    const more = sess && sess.legIndex < sess.legCount - 1;
    $('resAgain').classList.add('hidden');
    $('resReverse').classList.remove('hidden');
    $('resReverse').style.display = '';
    if (more) {
      sessionShowIntermission(score, grade);
      AUDIO.announce(`第${sess.legIndex + 1}段值乘结束，准备交班。`);
    } else {
      sessionShowFinal(false);
      AUDIO.announce('本次运营日结束，正在结算。');
    }
    $('results').classList.remove('hidden');
    $('hud').classList.remove('on');
    return;
  }

  if (typeof routeDef !== 'undefined' && routeDef) saveCareer(routeDef.id + (G.reverse ? ':rev' : ''), score, grade);
  const rvBtn = $('resReverse');
  if (rvBtn) rvBtn.style.display = (G.reverse || (routeDef && (routeDef.loop || routeDef.stopPlan))) ? 'none' : '';
  $('resSession') && ($('resSession').style.display = 'none');
  $('resScoreLabel') && ($('resScoreLabel').textContent = '总评分');
  $('resAgain').classList.remove('hidden');
  $('resMenu').textContent = '返回线路选择';
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
