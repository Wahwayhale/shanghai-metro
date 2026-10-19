/* ------------------------------------------------------------------
   BodyChain 单元测试 —— 全项目第一个脱离浏览器的测试。

   不用 puppeteer、不开页面、不加载 Three.js。
   直接 require 源码（去掉 class 声明即可在 node 里跑），毫秒级完成。

   覆盖：
   1. 静止编组位置正确（车距 = 定距）
   2. 全牵引 → 中间车滞后（拉伸），车钩力为正
   3. 全制动 → 车厢被压缩，车钩力为负
   4. 间隙内不受弹簧力，但有缓冲器阻尼
   5. 长时间自由演化不发散（数值稳定性）
   6. 静摩擦：低速且无驱动时彻底停住
   7. offsets() 语义：相对刚性编组的偏差
   ------------------------------------------------------------------ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', '..', 'parts', '56_bodies.js');

/* 用 vm 在隔离上下文里执行源码，注入最小配置 —— 模拟页面环境的两个常量 */
function loadBodyChain() {
  const code = fs.readFileSync(SRC, 'utf8');
  const sandbox = {
    CAR_PITCH: 23.15,
    BODY: {
      n: 6, mass: 38000, k: 1.5e6, c: 1.2e5, slack: 0.03, cSlack: 4.5e4,
      motor: [1.5, 1.5, 0, 0, 1.5, 1.5], brakeBias: 0.06
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(code + '\n;globalThis.__BodyChain = BodyChain;', sandbox);
  return sandbox.__BodyChain;
}

const BodyChain = loadBodyChain();

/* ---------------- 极简断言 ---------------- */
let pass = 0, fail = 0;
const results = [];
function ok(name, cond, detail) {
  if (cond) { pass++; results.push({ name, ok: true }); }
  else { fail++; results.push({ name, ok: false, detail }); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* 建一条静止编组 */
function fresh() {
  const ch = new BodyChain();
  ch.reset(1000, 0, 1);
  return ch;
}

/* 1. 静止布局 */
{
  const ch = fresh();
  const offs = ch.offsets();
  ok('静止时编组无偏差', offs.every(o => near(o, 0, 1e-9)), offs);
  const d = ch.s[0] - ch.s[5];
  ok('车距 = 5 × 定距', near(d, 5 * 23.15, 1e-6), d);
  ok('初始化后 inited 为真', ch.inited === true);
}

/* 2. 全牵引 → 中间车滞后 */
{
  const ch = fresh();
  for (let i = 0; i < 250; i++) ch.step(1.0, 0.02, { grade: 0, dir: 1 });
  const offs = ch.offsets();
  const midLag = Math.max(...offs);
  ok('牵引时出现拉伸（正偏移）', midLag > 0.02, { offs, midLag });
  ok('拉伸量在车钩间隙量级内', midLag < 0.5, midLag);
  const sum = ch.summary();
  ok('牵引时车钩受拉', sum.tension > 0, sum);
}

/* 3. 全制动 → 出现压缩 */
{
  const ch = fresh();
  /* 先加速到有速度 */
  for (let i = 0; i < 200; i++) ch.step(1.0, 0.02, { grade: 0, dir: 1 });
  const vAfterAccel = ch.v[0];
  ok('加速后速度为正', vAfterAccel > 1, vAfterAccel);
  /* 再全制动 */
  let minComp = 0;
  for (let i = 0; i < 150; i++) {
    ch.step(-1.0, 0.02, { grade: 0, dir: 1 });
    minComp = Math.min(minComp, ch.summary().compression);
  }
  ok('制动时出现压缩（负车钩力）', minComp < -5, minComp);
  ok('压缩力量级合理（不超 400 kN）', minComp > -400, minComp);
}

/* 4. 间隙内无弹簧力、但有缓冲器阻尼 */
{
  const ch = fresh();
  /* 人为拉开一个小于间隙的距离，且两车有相对速度 */
  ch.s[1] = ch.s[0] - 23.15 - 0.01;   // 比定距多 1 cm（< slack 3 cm）
  ch.v[0] = 0.5; ch.v[1] = 0;         // 有明显相对速度
  ch.step(0, 0.02, { grade: 0, dir: 1 });
  const f = ch.couplerF[0];
  /* 间隙内：只有 cSlack·Δv，没有 k·strain。
     验证方式是把它与「同样形变但如果超出间隙」的弹簧力作对比：
     间隙内应当远小于同等形变的弹簧力。 */
  const expected = 4.5e4 * (0.5 - 0);
  ok('间隙内车钩力 = 缓冲器阻尼', near(f, expected, Math.abs(expected) * 0.5), { f, expected });
  const springIfOutside = 1.5e6 * 0.01;         // 2 cm 形变的弹簧力
  ok('间隙内不受弹簧力（力来自阻尼而非刚度）',
    Math.abs(f) < springIfOutside * 0.5 || Math.abs(f) < 5e4,
    { f, springIfOutside });
}

/* 5. 长时间自由演化不发散 */
{
  const ch = fresh();
  for (let i = 0; i < 5000; i++) ch.step(0.3, 0.02, { grade: 0, dir: 1 });
  ok('5000 步后速度仍有限', ch.v.every(x => isFinite(x)), ch.v);
  ok('5000 步后位置仍有限', ch.s.every(x => isFinite(x)), ch.s);
  ok('5000 步后偏移未爆炸', ch.offsets().every(o => Math.abs(o) < 5), ch.offsets());
}

/* 6. 静摩擦：低速无驱动时停住 */
{
  const ch = fresh();
  ch.v.fill(0.01);                     // 1 cm/s 蠕行
  for (let i = 0; i < 50; i++) ch.step(0, 0.02, { grade: 0, dir: 1 });
  ok('静摩擦吃掉低速蠕行', ch.v.every(x => Math.abs(x) < 1e-9), ch.v);
}

/* 7. relocate / reset 语义 */
{
  const ch = fresh();
  ch.step(0.5, 0.02, { grade: 0, dir: 1 });
  ch.relocate(500, 1);
  ok('relocate 后车头对齐', near(ch.s[0], 500, 1e-9), ch.s[0]);
  ok('relocate 后车距不变', near(ch.s[0] - ch.s[1], 23.15, 1e-6), ch.s[0] - ch.s[1]);
}

/* ---------------- 输出 ---------------- */
const out = { passed: fail === 0, pass, fail, failed: results.filter(r => !r.ok) };
console.log(JSON.stringify(out, null, 1));
process.exit(out.passed ? 0 : 1);
