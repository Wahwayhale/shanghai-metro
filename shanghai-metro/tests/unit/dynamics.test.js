/* ------------------------------------------------------------------
   动力学核心单测（58_dynamics.js）

   这个文件第一次做到了「真·require」：58_dynamics.js 末尾有
   `if (typeof module !== 'undefined') module.exports = {...}`，
   所以 node 里直接 require 就能跑，不需要 vm 沙箱，也不需要浏览器。

   对比：tests/regress_* 每套要起浏览器、加载 1.1 MB 产物、等 10 秒构建，
   这里的断言全部在毫秒级完成，因此可以一次跑几百组工况。
   ------------------------------------------------------------------ */
const path = require('path');
const {
  DYN_DEFAULTS, splitTraction, accelFromTraction, integrateSpeed, energyStep
} = require(path.join(__dirname, '..', '..', 'parts', '58_dynamics.js'));

let pass = 0, fail = 0;
const failed = [];
function ok(name, cond, detail) {
  if (cond) pass++;
  else { fail++; failed.push({ name, detail }); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* ========== splitTraction：手柄与联锁 ========== */

ok('手柄居中 → 无牵引无制动',
  (() => { const r = splitTraction({ lever: 0 }); return r.traction === 0 && r.brake === 0; })(),
  splitTraction({ lever: 0 }));

ok('手柄正 → 牵引',
  near(splitTraction({ lever: 0.7 }).traction, 0.7, 1e-9));

ok('手柄负 → 制动',
  near(splitTraction({ lever: -0.4 }).brake, 0.4, 1e-9));

ok('紧急制动优先于手柄',
  (() => { const r = splitTraction({ lever: 1, eb: true }); return r.brake === 1 && r.traction === 0; })());

ok('ATP 制动优先于手柄',
  (() => { const r = splitTraction({ lever: 1, atpBrake: true }); return r.brake === 1 && r.traction === 0; })());

ok('车门开启 → 牵引封锁并报告一次',
  (() => { const r = splitTraction({ lever: 1, doorsOpen: true }); return r.traction === 0 && r.events.includes('interlock:door'); })());

ok('车门已关 → 不报告联锁',
  (() => { const r = splitTraction({ lever: 1, doorsOpen: false, doorT: 0 }); return r.traction > 0 && r.events.length === 0; })());

ok('受电弓故障 → 牵引封锁',
  (() => { const r = splitTraction({ lever: 1, fault: { type: 'pantograph' } }); return r.traction === 0 && r.events.includes('fault:pantograph'); })());

ok('受电弓已警告过 → 不重复报告',
  (() => { const r = splitTraction({ lever: 1, fault: { type: 'pantograph', warned: true } }); return r.traction === 0 && r.events.length === 0; })());

ok('牵引故障 → 牵引减半',
  near(splitTraction({ lever: 1, fault: { type: 'traction' } }).traction, 0.5, 1e-9));

ok('制动故障 → 制动力降至 70%',
  near(splitTraction({ lever: -1, fault: { type: 'brake' } }).brake, 0.7, 1e-9));

ok('车门故障 → 牵引封锁',
  (() => { const r = splitTraction({ lever: 1, fault: { type: 'door', name: '3 号车门' } }); return r.traction === 0 && r.events.includes('fault:door'); })());

/* ========== accelFromTraction：牵引/制动/阻力/坡道 ========== */

{
  const idle = accelFromTraction({ traction: 0, brake: 0, v: 0, grade: 0 });
  ok('静止无操作 → 加速度约 0', near(idle.a, 0, 1e-9), idle);

  const full = accelFromTraction({ traction: 1, brake: 0, v: 0, grade: 0 });
  /* ACC_MAX × 1 × 0.94 = 1.363；v=0 时 Math.sign(0||0)=0，所以没有基本阻力项 */
  const expectA = DYN_DEFAULTS.ACC_MAX * 0.94;
  ok('全牵引静止 → 加速度符合公式', near(full.a, expectA, 1e-6), { a: full.a, expectA });
  ok('全牵引产生牵引力', full.force > 0, full.force);

  /* 有速度时才有基本阻力 */
  const fullAt5 = accelFromTraction({ traction: 1, brake: 0, v: 5, grade: 0 });
  ok('有速度时阻力使加速度略降', fullAt5.a < expectA, { at0: expectA, at5: fullAt5.a });

  const brakeFull = accelFromTraction({ traction: 0, brake: 1, v: 5, grade: 0 });
  ok('全常用制动 → 加速度为负', brakeFull.a < -0.9, brakeFull.a);
  ok('全常用制动时无牵引力', brakeFull.force === 0);

  const brakeEmg = accelFromTraction({ traction: 0, brake: 1, v: 5, eb: true });
  ok('紧急制动比常用制动更强', brakeEmg.a < brakeFull.a, { emg: brakeEmg.a, srv: brakeFull.a });

  const wet = accelFromTraction({ traction: 0, brake: 1, v: 5, grip: 0.6 });
  ok('雨天附着下降 → 制动力变弱', wet.a > brakeFull.a, { wet: wet.a, dry: brakeFull.a });

  const upGrade = accelFromTraction({ traction: 0, brake: 0, v: 0, grade: 0.02 });
  ok('上坡 → 加速度为负', upGrade.a < 0, upGrade.a);

  const downGrade = accelFromTraction({ traction: 0, brake: 0, v: 5, grade: -0.02 });
  ok('下坡比平道加速度更大', downGrade.a > accelFromTraction({ traction: 0, brake: 0, v: 5, grade: 0 }).a);
}

/* 恒功率区：速度越高，牵引加速度越小 */
{
  const low = accelFromTraction({ traction: 1, brake: 0, v: 5 });
  const above = accelFromTraction({ traction: 1, brake: 0, v: DYN_DEFAULTS.POWER_V });
  const high = accelFromTraction({ traction: 1, brake: 0, v: DYN_DEFAULTS.POWER_V * 2 });
  ok('转折点之前加速度不随速度衰减', low.a > above.a - 0.05, { low: low.a, above: above.a });
  ok('转折点之后加速度按 1/v 衰减', high.a < above.a, { above: above.a, high: high.a });
  ok('恒功率区牵引力也随之下降', high.force < above.force, { above: above.force, high: high.force });
}

/* 阻力随速度增长 */
{
  const r0 = accelFromTraction({ traction: 0, brake: 0, v: 0.001 });
  const r60 = accelFromTraction({ traction: 0, brake: 0, v: 20 });
  ok('高速时基本阻力更大', r60.a < r0.a, { v0: r0.a, v20: r60.a });
}

/* ========== integrateSpeed：零速钳位 ========== */

ok('制动到负速度 → 钳为 0', integrateSpeed({ v: 0.5, a: -5, brake: 1, dt: 0.1 }) === 0);
ok('无制动负加速度 → 允许减速到 0 但不为负',
  integrateSpeed({ v: 0.1, a: -5, brake: 0, dt: 0.1 }) === 0);
ok('正常加速 → 线性增长',
  near(integrateSpeed({ v: 10, a: 1, brake: 0, dt: 0.5 }), 10.5, 1e-9));
ok('低速且有制动 → 直接归零',
  integrateSpeed({ v: 0.01, a: -0.1, brake: 1, dt: 0.1 }) === 0);

/* ========== 参数可覆盖（不依赖全局常量） ========== */
{
  const custom = accelFromTraction({ traction: 1, brake: 0, v: 0, mu: 1.0 }, { ACC_MAX: 3.0 });
  ok('常量可被入参覆盖', custom.a > 2.5, custom.a);
}

/* ========== P3-1 轮轨黏着 / 空转 ========== */
{
  const dry = accelFromTraction({ traction: 1, brake: 0, v: 0, mu: 0.33 });
  ok('干燥轨面全牵引不空转', dry.slip === false, dry);
  ok('干燥轨面加速度 ≈ 1.36 m/s²', near(dry.a, DYN_DEFAULTS.ACC_MAX * 0.94, 0.02), dry.a);

  const rain = accelFromTraction({ traction: 1, brake: 0, v: 0, mu: 0.18 });
  ok('雨天 μ=0.18 满牵引触发空转', rain.slip === true, rain);
  ok('空转时牵引力被黏着极限压住',
    rain.force < dry.force && rain.force <= rain.adhesion, { force: rain.force, adh: rain.adhesion });
  ok('空转时加速度出现平台（显著低于干燥）', rain.a < dry.a - 0.25, { rain: rain.a, dry: dry.a });

  /* 平台：牵引手柄继续加大，加速度不再增加 */
  const r80 = accelFromTraction({ traction: 0.8, brake: 0, v: 0, mu: 0.18 });
  const r95 = accelFromTraction({ traction: 0.95, brake: 0, v: 0, mu: 0.18 });
  const r100 = accelFromTraction({ traction: 1.0, brake: 0, v: 0, mu: 0.18 });
  ok('0.8 手柄尚未空转', r80.slip === false, r80);
  ok('超过黏着后 0.95 与 1.0 加速度相同（平台）',
    near(r95.a, r100.a, 1e-9), { a95: r95.a, a100: r100.a });
  ok('平台段加速度低于 0.8 手柄', r100.a < r80.a - 0.05, { a80: r80.a, a100: r100.a });

  /* 低黏着下制动也受限 */
  const icy = accelFromTraction({ traction: 0, brake: 1, v: 5, eb: true, mu: 0.05 });
  ok('极低黏着时紧急制动被限制在 μg', icy.a > -0.6, icy.a);
}

/* ========== P3-2 能量积分与再生回馈 ========== */
{
  /* 恒定牵引力 200 kN、10 m/s、60 s：
     解析值 = 200000 × 10 × 60 / 3.6e6 = 33.333 kWh */
  const F = 200000, v = 10, dt = 0.001, T = 60;
  let eT = 0, eR = 0;
  for (let t = 0; t < T; t += dt) {
    const e = energyStep({ force: F, v, dt });
    eT += e.traction;
  }
  const analytic = F * v * T / 3.6e6;
  ok('牵引能耗积分与解析解偏差 < 0.1%',
    Math.abs(eT - analytic) / analytic < 1e-3, { eT, analytic });
  ok('恒定牵引 200 kN / 10 m/s / 60 s ≈ 33.33 kWh', near(eT, 33.333, 0.01), eT);

  /* 再生：100 kN 制动力、15 m/s、30 s、效率 0.85 */
  for (let t = 0; t < 30; t += dt) {
    const e = energyStep({ regenForce: 100000, v: 15, dt, regenEff: 0.85 });
    eR += e.regen;
  }
  const analyticR = 100000 * 15 * 30 / 3.6e6 * 0.85;
  ok('再生回馈积分与解析解偏差 < 0.1%',
    Math.abs(eR - analyticR) / analyticR < 1e-3, { eR, analyticR });
  ok('回馈小于牵引（效率损失）', eR < 100000 * 15 * 30 / 3.6e6, eR);
}

/* ========== 批量工况：1000 次加速度计算 ========== */
{
  const t0 = Date.now();
  let sum = 0;
  for (let i = 0; i < 1000; i++) {
    sum += accelFromTraction({ traction: (i % 100) / 100, brake: 0, v: i % 30 }).a;
  }
  const ms = Date.now() - t0;
  ok('1000 组工况计算无异常', isFinite(sum) && Math.abs(sum) < 1e6, sum);
  ok('1000 组工况耗时 < 50 ms', ms < 50, ms + 'ms');
}

const out = { passed: fail === 0, pass, fail, failed };
console.log(JSON.stringify(out, null, 1));
process.exit(out.passed ? 0 : 1);
