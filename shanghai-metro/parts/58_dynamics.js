/* ================================================================
   列车纵向动力学核心（纯函数，零浏览器依赖）
   ----------------------------------------------------------------
   从 72_physics.js 的 physics() 里抽出「牵引/制动分档 → 加速度」这一段。
   抽它的理由：这是整条动力学链上唯一既无副作用、又能决定走行行为的部分：

     手柄/故障/车门联锁 → traction/brake
     牵引/制动 + 基本阻力 + 坡道 + 载荷修正 → 加速度 a

   副作用（toast / AUDIO / examEvent / HUD）全部留在 physics() 里。
   本文件只做数学，因此在 node 里可毫秒级反复跑工况（见
   tests/unit/dynamics.test.js）。

   注意：抽的是「加速度」，不是「积分」。速度/位置的积分仍留在
   physics()，因为它和停站判定、车钩链、车门动画耦合在一起，
   整体搬走风险大于收益。
   ================================================================ */

/* 缺省参数：与 10_data.js 的常量一致；node 环境下可全部走入参覆盖 */
const DYN_DEFAULTS = {
  ACC_MAX: 1.45,     // m/s² 牵引
  POWER_V: 18.0,     // m/s 恒功率转折点
  BRK_SRV: 1.0,      // m/s² 常用制动
  BRK_EMG: 1.35,     // m/s² 紧急制动
  MASS: 230000,      // 6 节编组总质量 kg
  MOTOR_RATIO: 0.66, // 动轴承担的车重比例（黏着重量）
  MU_DRY: 0.33,      // 干燥轨面黏着系数
  SLIP_PENALTY: 0.85,// 空转后动摩擦低于静摩擦
  REGEN_EFF: 0.75    // 再生制动回馈效率（含变流/线路损耗）
};

/**
 * 手柄与联锁 → 牵引/制动分档（0..1）。
 * 故障标志用布尔入参表达，避免这个纯函数去读全局 G。
 *
 * @param {object} o
 * @param {number} o.lever        手柄位置 -1..1
 * @param {boolean} o.eb          紧急制动
 * @param {boolean} o.atpBrake    ATP 常用制动
 * @param {boolean} o.doorsOpen   车门开启
 * @param {number} o.doorT        车门开度 0..1
 * @param {object|null} o.fault   { type, warned }
 * @returns {{traction:number, brake:number, events:string[]}}
 *          events 是「本步新触发的一次性事件」，由调用方决定怎么提示
 */
function splitTraction(o) {
  const events = [];
  let traction = 0, brake = 0;

  if (o.eb) brake = 1;
  else if (o.atpBrake) { brake = 1; traction = 0; }
  else if (o.lever > 0.005) traction = o.lever;
  else if (o.lever < -0.005) brake = -o.lever;

  /* 受电弓故障：牵引锁定（只在首次触发时报告） */
  if (o.fault && o.fault.type === 'pantograph' && traction > 0) {
    traction = 0;
    if (!o.fault.warned) events.push('fault:pantograph');
  }
  /* 牵引逆变器：牵引减半 */
  if (o.fault && o.fault.type === 'traction') traction *= 0.5;
  /* 制动缓解不良：制动力下降 */
  if (o.fault && o.fault.type === 'brake') brake *= 0.7;

  /* 车门故障：未切除则牵引锁定 */
  if (o.fault && o.fault.type === 'door' && traction > 0) {
    traction = 0;
    if (!o.fault.warned) events.push('fault:door');
  }

  /* 车门联锁：门未关不允许牵引 */
  if ((o.doorsOpen || o.doorT > 0.02) && traction > 0) {
    traction = 0;
    if (!o.doorWarned) events.push('interlock:door');
  }

  return { traction, brake, events };
}

/**
 * 牵引/制动 → 加速度。
 * 纯数学：不含任何 State 读取，也不写任何 State。
 *
 * @param {object} o
 * @param {number} o.traction   0..1
 * @param {number} o.brake      0..1
 * @param {number} o.v          m/s
 * @param {boolean} o.eb        紧急制动（决定用 BRK_EMG 还是 BRK_SRV）
 * @param {number} o.grip       附着系数（雨雾天 < 1）
 * @param {number} o.grade      坡度（正为上坡）
 * @param {object} [c]          常量覆盖
 * @returns {{a:number, force:number}}  a = m/s²，force = N（牵引力，用于能耗）
 */
function accelFromTraction(o, c) {
  const C = Object.assign({}, DYN_DEFAULTS, c || {});
  const v = o.v || 0;
  const mass = o.mass || C.MASS;
  const mu = o.mu != null ? o.mu
    : C.MU_DRY * (o.grip == null ? 1 : o.grip);
  /* 黏着极限：动轴承担的重量 × μ。超过它，轮对开始空转。 */
  const adhesion = mu * mass * (o.motorRatio || C.MOTOR_RATIO) * 9.81;
  let a = 0, force = 0, slip = false, slipRatio = 0;

  if (o.traction > 0) {
    let aT = C.ACC_MAX * o.traction;
    /* 恒功率区：超过转折点后牵引力反比于速度 */
    if (v > C.POWER_V) aT *= C.POWER_V / v;
    /* 载荷修正：满载乘客 → 加速度略降 */
    aT *= 0.94;
    /* 轮轨黏着：指令牵引力超过黏着极限时，实际只能用到极限值，
       且动摩擦（空转）低于静摩擦，加速度出现平台。 */
    const fCmd = aT * mass;
    if (fCmd > adhesion) {
      slip = true;
      force = adhesion * C.SLIP_PENALTY;
      aT = force / mass;
      slipRatio = Math.min(1, (fCmd / Math.max(1, adhesion) - 1) * 2 + 0.05);
    } else {
      force = fCmd;
    }
    a += aT;
  }
  if (o.brake > 0) {
    /* 制动同样受黏着限制（紧急制动在低 μ 下会延长） */
    const aB = Math.min(
      (o.eb ? C.BRK_EMG : C.BRK_SRV) * o.brake * (o.grip == null ? 1 : o.grip),
      mu * 9.81 * 0.98
    );
    a -= aB;
  }
  /* 基本阻力（Davis 式简化）+ 坡道 */
  const res = 0.018 + 0.00045 * v + 0.00007 * v * v;
  a -= Math.sign(v || 0) * res;
  a -= 9.81 * (o.grade || 0);

  return { a, force, slip, slipRatio, adhesion, mu };
}

/**
 * 一步能量：牵引电耗与再生回馈（kWh）。
 * 纯函数，便于用解析解校验积分误差（P3-2）。
 *
 * @param {object} o
 * @param {number} o.force      实际牵引力 N
 * @param {number} o.regenForce 实际再生制动力 N
 * @param {number} o.v          m/s
 * @param {number} o.dt         秒
 * @param {number} [o.regenEff] 回馈效率
 * @returns {{traction:number, regen:number}}
 */
function energyStep(o) {
  const dt = Math.max(0, o.dt || 0);
  const v = Math.max(0, o.v || 0);
  const eff = o.regenEff == null ? DYN_DEFAULTS.REGEN_EFF : o.regenEff;
  const traction = Math.max(0, o.force || 0) * v * dt / 3.6e6;
  const regen = Math.max(0, o.regenForce || 0) * v * dt / 3.6e6 * eff;
  return { traction, regen };
}

/**
 * 一步速度积分（不含位置）。把零速钳位规则收进来，便于单测。
 *
 * @param {object} o
 * @param {number} o.v
 * @param {number} o.a
 * @param {number} o.brake
 * @param {number} o.dt
 * @returns {number} 新速度
 */
function integrateSpeed(o) {
  const nv = o.v + o.a * o.dt;
  if (nv < 0 && o.brake > 0.01) return 0;
  if (nv < 0) return Math.max(0, nv);
  if (nv < 0.02 && o.brake > 0.02) return 0;
  return nv;
}

/* 页面环境无需导出（打包成 IIFE 后同作用域可见）；
   node 环境通过 module.exports 暴露，供单测直接 require */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DYN_DEFAULTS, splitTraction, accelFromTraction, integrateSpeed, energyStep };
}
