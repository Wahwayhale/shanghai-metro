/* ================================================================
   多质点车钩动力学（P2-4）
   ----------------------------------------------------------------
   单质点模型把整列车当成一个刚体，看不出任何纵向冲动。
   这里把每节车当独立质量，车钩用「弹簧 + 阻尼 + 自由间隙」连接：

     m·v̇ᵢ = Fᵢ(牵引/制动) − Rᵢ(基本阻力) − m·g·grade
             + F_c(i−1) − F_c(i)          ← 前后车钩力

   车钩力 F_c = k·stretch + c·(vᵢ − vᵢ₊₁)，但 stretch 先扣掉自由间隙：
   间隙内车钩不受力，所以起步会有「一顿」、停车会有「回弹」，这正是真实感来源。

   对外的接口保证与单质点一致：G.s / G.v 仍是车头质点，
   由第 0 节车驱动，其余车跟随 —— 这样现有 ATO / 停站 / ATP 逻辑完全不用改。

   ---------------------------------------------------------------
   本文件刻意写成「零浏览器依赖」：只用到 CAR_PITCH 与 BODY 两个常量，
   构造时可以全部走入参，因此 node 里直接 require 就能单测（见
   tests/unit/bodychain.test.js）。这是全项目第一个可脱离浏览器测试的模块。
   ================================================================ */

class BodyChain {
  /**
   * @param {object} [cfg]  覆盖 BODY 的参数；node 环境下可传 { pitch, ... } 全部自给
   * @param {number} [cfg.pitch] 车辆定距（默认取全局 CAR_PITCH）
   */
  constructor(cfg) {
    const B = cfg || (typeof BODY !== 'undefined' ? BODY : null);
    if (!B) throw new Error('BodyChain 需要配置：请传入 cfg 或在页面环境下加载 BODY 常量');
    this.pitch = B.pitch != null ? B.pitch
      : (typeof CAR_PITCH !== 'undefined' ? CAR_PITCH : 23.15);
    this.n = B.n;
    this.m = new Array(this.n).fill(B.mass);
    this.motor = B.motor.slice();
    this.k = B.k;
    this.c = B.c;
    this.slack = B.slack;
    this.cSlack = B.cSlack != null ? B.cSlack : B.c * 0.4;
    this.brakeBias = B.brakeBias;
    /* 每节车的绝对里程（s 越大越靠近运行前方）与速度 */
    this.s = new Array(this.n).fill(0);
    this.v = new Array(this.n).fill(0);
    /* 车钩相对形变（已扣间隙），供外部读取车钩力可视化 */
    this.stretch = new Array(this.n).fill(0);
    this.couplerF = new Array(this.n).fill(0);
    this.inited = false;
  }

  /** 以车头里程 s、速度 v 初始化静态编组（车尾在前方 dir 的反方向） */
  reset(s, v = 0, dir = 1) {
    for (let i = 0; i < this.n; i++) {
      this.s[i] = s - dir * i * this.pitch * (this.n > 1 ? 1 : 0);
      this.v[i] = v;
      this.stretch[i] = 0;
      this.couplerF[i] = 0;
    }
    this.inited = true;
  }

  /**
   * 推进 dt 秒。
   * @param {number} accCmd  车头综合加速度指令 m/s²（含牵引/制动/阻力，由 physics 算好）
   * @param {number} dt
   * @param {object} opts    { grade, resCoef(v), dir }
   * @returns {number} 车头新速度
   */
  step(accCmd, dt, opts = {}) {
    if (!this.inited) this.reset(0, 0);
    const dir = opts.dir || 1;
    const grade = opts.grade || 0;
    const n = this.n;

    /* 每节车的基础加速度：按动拖比分配车头指令 + 制动力偏差 */
    const base = new Array(n);
    for (let i = 0; i < n; i++) {
      let a = accCmd * this.motor[i];
      /* 制动时（accCmd<0）前端稍强 → 后车顶上来的压缩力 */
      if (accCmd < 0) a += accCmd * this.brakeBias * (1 - i / Math.max(1, n - 1) * 2);
      a -= 9.81 * grade;
      base[i] = a;
    }

    /* 车钩力（对 i 与 i+1 之间）。约定：正 = 拉伸（前车拉后车）
       位置：s 越大越靠前，所以前车 i 应当满足 s[i] > s[i+1]。
       平衡间距 = CAR_PITCH；实际间距超出 → 拉伸，不足 → 压缩。 */
    const F = new Array(Math.max(0, n - 1)).fill(0);
    for (let i = 0; i < n - 1; i++) {
      const gap = (this.s[i] - this.s[i + 1]) - this.pitch;
      const inSlack = Math.abs(gap) <= this.slack;
      const dv = this.v[i] - this.v[i + 1];
      if (inSlack) {
        /* 间隙内不受弹簧力，但缓冲器有摩擦/油阻尼 —— 否则车辆会在间隙里
           无限自由蠕滑，停车后编组长度慢慢漂移。这里只留相对速度阻尼。 */
        F[i] = this.cSlack * dv;
      } else {
        const strain = gap - Math.sign(gap) * this.slack;
        F[i] = this.k * strain + this.c * dv;
      }
    }

    /* 加速度合成：车钩力作用在相邻两车上方向相反 */
    const acc = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      acc[i] = base[i];
      if (i > 0) acc[i] += F[i - 1] / this.m[i];       // 后车被前车拉/推
      if (i < n - 1) acc[i] -= F[i] / this.m[i];        // 前车被后车拖/顶
    }

    /* 半隐式欧拉（先速度后位置），k=1.5e6/m=38000 时 ω≈6.3 rad/s，
       dt=1/120 下 ω·dt≈0.05，远小于稳定上限 2，安全 */
    for (let i = 0; i < n; i++) this.v[i] += acc[i] * dt;
    for (let i = 0; i < n; i++) this.s[i] += dir * this.v[i] * dt;

    /* 静摩擦：真实车钩/轴承有静摩擦，低速且无驱动时会彻底停住。
       没有这一条，车厢会在间隙里以 mm/s 级速度永久蠕行，
       停车后编组长度慢慢漂移（实测 10 秒漂 0.12 m）。 */
    const creep = 0.02;    // m/s 静摩擦阈值
    const headStill = Math.abs(this.v[0]) < creep;
    for (let i = 0; i < n; i++) {
      if (Math.abs(this.v[i]) < creep && Math.abs(acc[i]) < 0.03) this.v[i] = 0;
    }
    /* 车头已停且无牵引/制动指令时，整列入库：避免后车残余速度继续推车头 */
    if (headStill && Math.abs(accCmd) < 0.03) {
      for (let i = 0; i < n; i++) this.v[i] = 0;
    }

    /* 记录形变供可视化 */
    for (let i = 0; i < n - 1; i++) {
      const gap = (this.s[i] - this.s[i + 1]) - this.pitch;
      const slack = gap >= 0 ? this.slack : -this.slack;
      this.stretch[i] = Math.abs(gap) <= this.slack ? 0 : gap - slack;
      this.couplerF[i] = F[i];
    }
    this.stretch[n - 1] = 0;
    this.couplerF[n - 1] = 0;

    /* 防发散：车钩刚度大时偶尔会因为间隙切换产生数值抖动，夹一下 */
    for (let i = 0; i < n; i++) {
      if (!isFinite(this.v[i])) this.v[i] = 0;
      if (Math.abs(this.v[i]) > 60) this.v[i] = Math.sign(this.v[i]) * 60;
    }
    return this.v[0];
  }

  /** 把车链整体平移到新的车头里程（用于传送/AI 同步） */
  relocate(s, dir = 1) {
    for (let i = 0; i < this.n; i++) this.s[i] = s - dir * i * this.pitch;
  }

  /** 每节车相对刚性编组位置的纵向偏差（正 = 落后），供 Train 摆位用 */
  offsets() {
    const out = new Array(this.n);
    for (let i = 0; i < this.n; i++) {
      out[i] = (this.s[0] - this.s[i]) - i * this.pitch;
    }
    return out;
  }

  /** 车钩力汇总，供 HUD / 调试读取（kN） */
  summary() {
    let maxT = 0, maxC = 0;
    for (let i = 0; i < this.n - 1; i++) {
      const f = this.couplerF[i] / 1000;
      if (f > maxT) maxT = f;
      if (f < maxC) maxC = f;
    }
    return { tension: +maxT.toFixed(1), compression: +maxC.toFixed(1) };
  }
}
