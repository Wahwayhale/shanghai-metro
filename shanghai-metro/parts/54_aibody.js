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

   ---- 与原 52_ai.js 的一致性 ----
   下面的逻辑是**逐行搬运**，不是重写。唯一的改动是把
   this.train.setDoorT(...) / this.train.update(...) 从尾部去掉
   （那是渲染，留在 AiTrain 里做）。
   ================================================================ */

const AI_DEFAULTS = {
  AI_BRK: 0.95,      // AI 常用制动 m/s²
  AI_ACC: 1.0,       // AI 牵引 m/s²
  AI_VMAX: 22.2,     // 80 km/h（m/s）
  KMH: 1 / 3.6
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

  /* ---- 停站 / 折返 ---- */
  if (self.state === 'dwell') {
    self.dwellT += dt;
    if (self.holdT > 0) self.holdT = Math.max(0, self.holdT - dt);
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
      events.push('turnback:begin');
    }
  }

  let vT = self.vmaxMs;

  if (self.state === 'run') {
    const tgt = P.stations[aiClamp(self.idx, 0, n - 1)];
    const d = self.gapToStop(self.idx);

    /* 区间限速 */
    const vLim = Math.min(self.vmax, P.atpLimit(self.s, self.v)) * K.KMH;
    vT = Math.min(vT, vLim);

    /* 停车曲线：远段按制动曲线，近段线性收敛到停车标（跳停时不施加） */
    if (self.stops && !self.skip) {
      let vStop = 0;
      if (d > 0) {
        vStop = Math.sqrt(2 * 0.82 * Math.max(0, d - 0.35));
        if (d < 6) vStop = Math.min(vStop, aiClamp(d * 0.45, 0, 1.6));
      }
      vT = Math.min(vT, vStop);
    }

    /* 跟车 */
    if (ld && ld.gap < 420) {
      vT = Math.min(vT, Math.sqrt(2 * K.AI_BRK * Math.max(0, ld.gap - 30)));
      if (ld.gap < 60) vT = Math.min(vT, ld.v * 0.9);
    }

    /* 跳停：通过站台后放行 */
    if (self.skip && d <= 0.5 && d > -30) {
      self.skip = false;
      self.idx += self.dir;
      events.push('skip:cleared');
    }

    /* 已越过停车标太多，直接放行到下一站 */
    if (self.stops && d < -6 && !self.skip) {
      self.idx += self.dir;
      events.push('station:missed');
      if (self.idx < 0 || self.idx >= n) { self.state = 'turnback'; self.dwellT = 0; self.v = 0; events.push('turnback:begin'); }
    }

    /* 停稳判定：站台范围内停住即办客 */
    if (self.stops && Math.abs(d) <= 6 && self.v < 0.3) {
      self.v = 0;
      self.s = tgt.stopS;
      if (self.skip) {
        self.skip = false;
        self.idx += self.dir;
        self.state = 'run';
      } else {
        self.state = 'dwell';
        self.dwellT = 0;
        self.dwellNeed = 26 + (self.seed % 5) * 3;
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
  if (vT < 0.06 && self.v > 0.02) a = -1.0;          // 停车目标：直接制动到底
  else if (Math.abs(dv) > 0.08) a = dv > 0 ? Math.min(K.AI_ACC, 0.25 + dv * 0.4) : -Math.min(1.1, 0.22 + (-dv) * 0.55);
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
