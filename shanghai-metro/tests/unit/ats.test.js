/* ------------------------------------------------------------------
   ATS 调度台纯逻辑单测（59_atslog.js）

   不需要浏览器：atsRows / atsTag / atsCommand / atsSubtitle 全是
   纯数据转换，node 里直接 require 即可。

   覆盖：
   1. 本务行：站名取前一站→当前站，状态映射 eb/dwell/run
   2. AI 行：上下行 sub、from/to 取相邻站、ops 命令列表
   3. dead 列车被跳过
   4. 索引越界钳位
   5. 状态标签优先级：紧急 > 扣车 > 停站 > 折返 > 运行
   6. 调度命令：hold 90 秒 / go / skip 的秒数与文案
   7. 副标题文案
   ------------------------------------------------------------------ */
const path = require('path');
const {
  atsTag, atsRows, atsCommand, atsSubtitle, atsClamp, ATS_CMDS
} = require(path.join(__dirname, '..', '..', 'parts', '59_atslog.js'));

let pass = 0, fail = 0;
const failed = [];
function ok(name, cond, detail) {
  if (cond) pass++;
  else { fail++; failed.push({ name, detail }); }
}

const sts = [
  { zh: '莘庄' }, { zh: '外环路' }, { zh: '莲花路' }, { zh: '锦江乐园' }
];

function mkAi(over) {
  return Object.assign({
    carNo: '0214', dir: 1, idx: 2, v: 10, state: 'run', holdT: 0, dead: false
  }, over || {});
}

/* ========== 1. 本务行 ========== */
{
  const rows = atsRows({
    G: { targetIdx: 2, v: 15, eb: false, doorsOpen: false },
    aiTrains: [], stations: sts
  });
  ok('本务始终是第一行', rows[0].no === '本务' && rows[0].me === true, rows[0]);
  ok('本务 from 取前一站', rows[0].from === '外环路', rows[0].from);
  ok('本务 to 取当前目标站', rows[0].to === '莲花路', rows[0].to);
  ok('本务速度从 m/s 换算 km/h', Math.round(rows[0].v) === 54, rows[0].v);
  ok('本务无调度按钮', rows[0].ops === null, rows[0].ops);
  ok('本务状态为运行', rows[0].state === 'run', rows[0].state);
}

/* 本务在始发站 */
{
  const rows = atsRows({ G: { targetIdx: 0, v: 0, eb: false, doorsOpen: false }, aiTrains: [], stations: sts });
  ok('targetIdx=0 时 from 显示「始发」', rows[0].from === '始发', rows[0].from);
}

/* 本务紧急制动 */
{
  const rows = atsRows({ G: { targetIdx: 1, v: 0, eb: true, doorsOpen: false }, aiTrains: [], stations: sts });
  ok('EB 时本务状态为 eb', rows[0].state === 'eb', rows[0].state);
}

/* 本务开门 */
{
  const rows = atsRows({ G: { targetIdx: 1, v: 0, eb: false, doorsOpen: true }, aiTrains: [], stations: sts });
  ok('开门时本务状态为 dwell', rows[0].state === 'dwell', rows[0].state);
}

/* ========== 2. AI 行 ========== */
{
  const rows = atsRows({
    G: { targetIdx: 1, v: 0, eb: false, doorsOpen: false },
    aiTrains: [mkAi({ carNo: '0214', dir: 1, idx: 2, v: 12, state: 'run' })],
    stations: sts
  });
  ok('AI 行数正确', rows.length === 2, rows.length);
  const ai = rows[1];
  ok('AI 上行 sub 正确', ai.sub === '上行', ai.sub);
  ok('AI from 取 idx-dir', ai.from === '外环路', ai.from);
  ok('AI to 取 idx', ai.to === '莲花路', ai.to);
  ok('AI 速度换算正确', Math.round(ai.v) === 43, ai.v);
  ok('AI 带三条调度命令', Array.isArray(ai.ops) && ai.ops.length === 3, ai.ops);
  ok('AI 命令集合正确', ai.ops.join(',') === 'hold,go,skip', ai.ops);
  ok('AI 行 me 为 false', ai.me === false);
}

/* 下行 AI */
{
  const rows = atsRows({
    G: { targetIdx: 0, v: 0, eb: false, doorsOpen: false },
    aiTrains: [mkAi({ carNo: '0231', dir: -1, idx: 2 })],
    stations: sts
  });
  ok('下行 sub 正确', rows[1].sub === '下行', rows[1].sub);
  ok('下行 from 取 idx+1', rows[1].from === '锦江乐园', rows[1].from);
  ok('下行 to 取 idx', rows[1].to === '莲花路', rows[1].to);
}

/* ========== 3. dead 列车被跳过 ========== */
{
  const rows = atsRows({
    G: { targetIdx: 0, v: 0, eb: false, doorsOpen: false },
    aiTrains: [mkAi({ carNo: 'A1', dead: true }), mkAi({ carNo: 'A2', dead: false })],
    stations: sts
  });
  ok('dead 列车不出现在列表', rows.length === 2 && rows[1].no === 'A2', rows.map(r => r.no));
}

/* ========== 4. 索引越界钳位 ========== */
{
  const rows = atsRows({
    G: { targetIdx: 0, v: 0, eb: false, doorsOpen: false },
    aiTrains: [mkAi({ idx: 99, dir: 1 })],
    stations: sts
  });
  ok('idx 越界被钳到最后站', rows[1].to === '锦江乐园', rows[1].to);
  const rows2 = atsRows({
    G: { targetIdx: 0, v: 0, eb: false, doorsOpen: false },
    aiTrains: [mkAi({ idx: -5, dir: 1 })],
    stations: sts
  });
  ok('idx 为负被钳到首站', rows2[1].from === '莘庄', rows2[1].from);
}

/* ========== 5. 状态标签优先级 ========== */
{
  ok('EB 优先于一切', atsTag({ state: 'eb', hold: 30 }).tag === '紧急');
  ok('扣车优先于停站', atsTag({ state: 'dwell', hold: 30 }).tag.startsWith('扣车'), atsTag({ state: 'dwell', hold: 30 }));
  ok('扣车秒数四舍五入', atsTag({ state: 'run', hold: 12.6 }).tag === '扣车 13s', atsTag({ state: 'run', hold: 12.6 }));
  ok('停站标签', atsTag({ state: 'dwell', hold: 0 }).tag === '停站');
  ok('折返标签', atsTag({ state: 'turnback', hold: 0 }).tag === '折返');
  ok('运行标签', atsTag({ state: 'run', hold: 0 }).tag === '运行');
  ok('扣车未满 0.5s 不显示扣车', atsTag({ state: 'run', hold: 0.2 }).tag === '运行', atsTag({ state: 'run', hold: 0.2 }));
  ok('标签带对应 CSS 类', atsTag({ state: 'eb' }).cls === 'hold' && atsTag({ state: 'run' }).cls === 'run');
}

/* ========== 6. 调度命令 ========== */
{
  const hold = atsCommand('hold');
  ok('hold 秒数为 90', hold.secs === 90, hold.secs);
  ok('hold 等级为 warn', hold.level === 'warn', hold.level);
  ok('hold 文案含车次', hold.text('0214').includes('0214'), hold.text('0214'));
  ok('hold 文案含 90 秒', hold.text('0214').includes('90'), hold.text('0214'));

  const go = atsCommand('go');
  ok('go 秒数为 0', go.secs === 0, go.secs);
  ok('go 文案为放行', go.text('0214').includes('放行'), go.text('0214'));

  const skip = atsCommand('skip');
  ok('skip 文案为跳停', skip.text('0214').includes('跳停'), skip.text('0214'));

  ok('未知命令返回 null', atsCommand('bogus') === null);
  ok('命令集合完整', ATS_CMDS.join(',') === 'hold,go,skip', ATS_CMDS);
}

/* ========== 7. 副标题 ========== */
{
  const s = atsSubtitle({ line: { name: '1号线' }, aiCount: 4, pathLen: 33165.6 });
  ok('副标题含线路名', s.includes('1号线'), s);
  ok('副标题含在网列车数（AI+本务）', s.includes('5 列在网'), s);
  ok('副标题含线路长度', s.includes('33166') || s.includes('33165'), s);
}

/* ========== 8. 纯逻辑：不触碰 DOM ========== */
{
  let threw = null;
  try {
    atsRows({ G: { targetIdx: 1, v: 0 }, aiTrains: [mkAi()], stations: sts });
    atsTag({ state: 'run', hold: 0 });
    atsCommand('hold');
    atsSubtitle({ line: null, aiCount: 0, pathLen: 0 });
  } catch (e) { threw = e.message; }
  ok('全部函数不依赖 DOM / Three.js', threw === null, threw);
}

/* ========== 9. 空数据不崩 ========== */
{
  let threw = null;
  try {
    atsRows({ G: {}, aiTrains: [], stations: [] });
    atsSubtitle({});
  } catch (e) { threw = e.message; }
  ok('空数据不抛异常', threw === null, threw);
}

/* ========== 10. 批量：1000 次行构建 ========== */
{
  const ais = [];
  for (let i = 0; i < 6; i++) ais.push(mkAi({ carNo: '02' + i, idx: i }));
  const t0 = Date.now();
  for (let i = 0; i < 1000; i++) {
    atsRows({ G: { targetIdx: 2, v: 5 }, aiTrains: ais, stations: sts });
  }
  const ms = Date.now() - t0;
  ok('1000 次列表构建耗时 < 50 ms', ms < 50, ms + 'ms');
}

const out = { passed: fail === 0, pass, fail, failed };
console.log(JSON.stringify(out, null, 1));
process.exit(out.passed ? 0 : 1);
