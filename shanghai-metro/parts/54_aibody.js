/* ================================================================
   AI 列车决策核心（纯逻辑，零浏览器依赖）
   ----------------------------------------------------------------
   从 52_ai.js 里抽出 AI 的「状态机 + 速度决策 + 停站判定」。

   设计要点：**不迁移状态字段**，只把方法体搬出来。
   aiUpdate(self, dt, ld, C) 里的 self 就是 AiTrain 实例本身，
   读写它原有的 s / v / idx / state / dwellT ……
   —— 因此外部代码访问 ai.s / ai.dir / ai.len 全部照旧，零兼容风险。

   这样拆的收益：决策逻辑不再碰 Three.js，node 里传一个假 self
   和一个假 P（只要有 length / stations[].stopS / atpLimit）就能跑，
   见 tests/unit/ai.test.js。

   ---- P1-3 按图运行 ----
   在原始状态机之上增加了「绑定车次」分支（self.service 非空时生效）：
   - 每帧用剩余距离 / 计划到达剩余时间 / 当前速度反解巡航速度
   - 停站时长按计划发车时刻（早到等待、晚点最短办客）
   - 正晚点读数按「计划位置 vs 实际位置」折算成秒
   未绑定车次（对向通过车、折返后）仍走原来的自由运行逻辑。

   ---- 渲染 ----
   this.train.setDoorT(...) / this.train.update(...) 留在 AiTrain 里做。
   ================================================================ */

const AI_DEFAULTS = {
  AI_BRK: 0.95,      // AI 常用制动 m/s²
  AI_ACC: 1.0,       // AI 牵引 m/s²
  AI_VMAX: 22.2,     // 80 km/h（m/s）
  KMH: 1 / 3.6,
  /* 绑定车次后改用「运行图口径」的加减速（与 57_timetable 的 TT_ACC/TT_BRK 一致）。
     不绑定车次的 AI（对向通过车）仍用上面的温和值，避免视觉突变。 */
  AI_ACC_PLAN: 1.45,
  AI_BRK_PLAN: 1.0,
  AI_STOP_PLAN: 1.0,
  AI_MIN_DWELL: 18,  // 停站最短办客时间（秒）
  AI_MIN_GAP: 55     // 最小追踪间隔硬约束（米，车尾到车头）
};

function aiClamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

/**
 * 推进一帧 AI 决策。直接读写 self 的字段。
 *
 * @param {object} self  AiTrain 实例（需要有 s/v/idx/state/dwellT/...）
 * @param {number} dt
 * @param {object|null} ld  前车 { gap, v } 或 null
 * @param {object} C     常量覆盖（AI_BRK / AI_ACC / AI_VMAX / KMH）
 * @returns {{events:string[]}}
 */
function aiUpdate(self, dt, ld, C) {
  const K = Object.assign({}, AI_DEFAULTS, C || {});
  const P = self.path;
  const n = P.stations.length;
  const events = [];
  /* 本帧时刻：由 AiTrain.update 从 G.clock 同步进来。
     绑定车次后，所有「按图」判断都基于它；拿不到就退回旧的自由运行。 */
  const now = K.clock != null ? K.clock : null;
  const sched = (self.service && typeof ttStopOf === 'function') ? self.service : null;
  const accCap = sched ? (K.AI_ACC_PLAN || K.AI_ACC) : K.AI_ACC;
  const brkCap = sched ? (K.AI_BRK_PLAN || K.AI_BRK) : K.AI_BRK;
  const stopDecel = sched ? (K.AI_STOP_PLAN || 0.82) : 0.82;

  /* ---- 停站 / 折返 ---- */
  if (self.state === 'dwell') {
    self.dwellT += dt;
    if (self.holdT > 0) self.holdT = Math.max(0, self.holdT - dt);
    /* 正晚点读数：停站时「现在 - 计划到达」就是到达偏差 */
    if (sched && now != null) {
      const sp = ttStopOf(sched, self.idx);
      if (sp) self.delay = Math.round(now - sp.arr);
    }
    if (self.dwellT >= self.dwellNeed && self.holdT <= 0) {
      self.idx += self.dir;
      self.state = 'run';
      self.dwellT = 0;
      events.push('station:depart');
    }
  } else if (self.state === 'turnback') {
    self.dwellT += dt;
    if (self.dwellT > 34) {
      self.dir *= -1;
      self.lateral *= -1;
      self.s = aiClamp(self.s, 30, P.length - 30);
      self.idx = self.dir > 0 ? self.nearestStationIdx() + 1 : self.nearestStationIdx() - 1;
      self.state = 'run';
      self.dwellT = 0;
      self.v = 0;
      events.push('turnback:done');
    }
  }

  /* ---- 目标站 ---- */
  if (self.state === 'run') {
    if (self.idx < 0 || self.idx >= n) {
      self.state = 'turnback';
      self.dwellT = 0;
      self.v = 0;
      /* 折返后方向相反，原车次的停站时刻不再适用。运行图只覆盖本方向，
         折返车按自由运行处理（P2 再做折返车次接续）。 */
      self.service = null;
      events.push('turnback:begin');
    }
  }

  let vT = self.vmaxMs;
  let stopTarget = null;      // 本帧停车曲线给出的速度上限（绑定车次时用于精确制动）

  if (self.state === 'run') {
    const tgt = P.stations[aiClamp(self.idx, 0, n - 1)];
    const d = self.gapToStop(self.idx);
    /* 本段终点在运行图里的计划到发（未绑定车次则为 null）。
       跳停交路上会有「车次不停靠」的车站：这时不施加停车曲线，直接通过。 */
    const sp = sched ? ttStopOf(sched, self.idx) : null;
    const stopHere = !sched || !!sp;
    /* 下一处「计划停靠」：跳站区间里也按它来控制速度，避免冲得太早 */
    let schedStop = sp;
    if (sched && !schedStop) {
      for (const q of sched.stops) {
        if (q.s - self.s > 0) { schedStop = q; break; }
      }
    }

    /* 区间限速 */
    const vLim = Math.min(self.vmax, P.atpLimit(self.s, self.v)) * K.KMH;
    vT = Math.min(vT, vLim);

    /* 停车曲线：远段按制动曲线，近段线性收敛到停车标（跳停时不施加）。
       绑定车次的 AI 用运行图口径的制动率，保证到站时刻和计划对得上。 */
    if (self.stops && !self.skip && stopHere) {
      let vStop = 0;
      if (d > 0) {
        vStop = Math.sqrt(2 * stopDecel * Math.max(0, d - 0.35));
        if (!sched && d < 6) vStop = Math.min(vStop, aiClamp(d * 0.45, 0, 1.6));
      }
      stopTarget = vStop;
      vT = Math.min(vT, vStop);
    }

    /* 按图运行（P1-3）：用「剩余距离 / 计划到达剩余时间」反解巡航速度。
       时间富余就压低巡航速度，时间不够就跑满线路限速；
       不用「追赶到点时刻」的 P 控制，避免速度抖动。 */
    if (schedStop && now != null && d > 0) {
      const aheadD = self.dir > 0
        ? schedStop.s - self.s
        : self.s - schedStop.s;
      const tLeft = schedStop.arr - now;
      if (tLeft > 0 && aheadD > 0) {
        /* 带入当前速度：否则列车一动起来，解出的巡航速度会一路上涨 */
        const vC = typeof ttSolveCruiseFrom === 'function'
          ? ttSolveCruiseFrom(aheadD, tLeft, self.v, self.vmax, accCap, stopDecel)
          : ttSolveCruise(aheadD, tLeft, self.vmax, accCap, stopDecel);
        /* 下限 10.8 km/h：避免「早点太多」时整段爬行，早点交给停站等待消化 */
        vT = Math.min(vT, Math.max(vC, aheadD > 30 ? 3 : 0));
      }
      /* 正晚点读数：拿「此刻计划应在的里程」和实际里程比，
         再按当前速度折成秒。比「最早可能的到达时刻」更贴近司机的直觉：
         正常按图运行时读数稳定在 0，被前车压住时读数才逐渐变大。 */
      if (typeof ttServicePosition === 'function') {
        const schedPos = ttServicePosition(sched, now);
        const behind = self.dir > 0 ? schedPos - self.s : self.s - schedPos;
        self.delay = Math.round(behind / Math.max(6, self.v));
      } else {
        self.delay = Math.max(0, Math.round(now + ttMinRun(aheadD, self.vmax, accCap, stopDecel) - schedStop.arr));
      }
      self.planArr = schedStop.arr;
    }

    /* 跳停交路上的通过站：不办客，越过站台即放行到下一站 */
    if (sched && !stopHere && d <= 0.5 && d > -40) {
      self.idx += self.dir;
      events.push('station:pass');
    }

    /* 跟车（P1-4）：软约束按制动曲线压速，硬约束保证最小追踪间隔。
       前车晚点时后车的计划被占用，这里压下来的速度就是「被动晚点」的来源。 */
    if (ld && ld.gap < 420) {
      vT = Math.min(vT, Math.sqrt(2 * brkCap * Math.max(0, ld.gap - 30)));
      if (ld.gap < 60) vT = Math.min(vT, ld.v * 0.9);
      if (ld.gap < K.AI_MIN_GAP) vT = 0;
    }

    /* 跳停：通过站台后放行 */
    if (self.skip && d <= 0.5 && d > -30) {
      self.skip = false;
      self.idx += self.dir;
      events.push('skip:cleared');
    }

    /* 已越过停车标太多，直接放行到下一站 */
    if (self.stops && stopHere && d < -6 && !self.skip) {
      self.idx += self.dir;
      events.push('station:missed');
      if (self.idx < 0 || self.idx >= n) { self.state = 'turnback'; self.dwellT = 0; self.v = 0; events.push('turnback:begin'); }
    }

    /* 停稳判定：站台范围内停住即办客 */
    if (self.stops && stopHere && Math.abs(d) <= 6 && self.v < 0.3) {
      self.v = 0;
      self.s = tgt.stopS;
      if (self.skip) {
        self.skip = false;
        self.idx += self.dir;
        self.state = 'run';
      } else {
        self.state = 'dwell';
        self.dwellT = 0;
        /* 停站时长按运行图：早点到就等到计划发车，晚点就只停最短办客时间。
           这是「晚点不再被停站时间放大」的关键。 */
        let need = 26 + (self.seed % 5) * 3;
        if (sp && now != null) {
          need = Math.max(K.AI_MIN_DWELL, Math.min(300, sp.dep - now));
          self.lastArrDelay = Math.round(now - sp.arr);
          if (self.arrLog) {
            self.arrLog.push({ idx: self.idx, planned: sp.arr, actual: now, delay: self.lastArrDelay });
            if (self.arrLog.length > 400) self.arrLog.shift();
          }
          self.delay = self.lastArrDelay;
        }
        self.dwellNeed = need;
        self.doorT = 0;
        events.push('station:dwell');
      }
    }

    /* 越过终点 */
    if (!self.stops && (self.s > P.length - 20 || self.s < 20)) {
      self.state = 'turnback';
      self.dwellT = 0;
      events.push('turnback:begin');
    }
  } else {
    vT = 0;
  }

  /* ---- 速度积分 ---- */
  const dv = vT - self.v;
  let a = 0;
  if (vT < 0.06 && self.v > 0.02) a = -brkCap;       // 停车目标：直接制动到底
  else if (sched && stopTarget != null && self.v > stopTarget + 0.05) {
    /* 绑定车次时严格跟随停车曲线：比例控制在曲线匀速下降时会留下
       1 m/s 左右的稳态偏差，到站前 20 m 就足以冲过停车标（越站）。 */
    a = -stopDecel;
  } else if (Math.abs(dv) > 0.08) {
    /* 绑定车次的 AI 牵引爬升更快：运行图时分按 1.45 m/s² 满牵引编排，
       若沿用温和的 0.25+0.4·dv 会把每段都拖慢几秒，逐站累积成晚点。 */
    a = dv > 0
      ? Math.min(accCap, sched ? 0.5 + dv * 1.2 : 0.25 + dv * 0.4)
      : -Math.min(1.1, 0.22 + (-dv) * 0.55);
  }
  self.v = aiClamp(self.v + a * dt, 0, self.vmaxMs);
  if (self.state === 'dwell' || self.state === 'turnback') self.v = 0;
  self.s += self.v * self.dir * dt;
  self.phase += dt;

  /* ---- 车门（停站时开合，仅数值；渲染由 AiTrain 读 doorT） ---- */
  if (self.state === 'dwell') {
    const t = aiClamp(self.dwellT / 3, 0, 1);
    const closing = self.dwellT > self.dwellNeed - 3.5;
    self.doorT = closing ? aiClamp((self.dwellNeed - self.dwellT) / 3.5, 0, 1) : t;
  } else {
    self.doorT = 0;
  }

  return { events };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { aiUpdate, AI_DEFAULTS, aiClamp };
}
