/* ------------------------------------------------------------------
   运行图数据层单测（57_timetable.js）

   全部是纯函数，毫秒级跑完，不需要浏览器。
   重点验证：跨站运行时分累加、跳站、峰谷间隔、跨天、防御性上限。
   ------------------------------------------------------------------ */
const path = require('path');
const {
  TT_DEFAULTS,
  ttEstimateRun, ttParseClock, ttFormatClock, ttIsPeak, ttHeadwayAt,
  ttComputeService, ttBuildTimetable, ttServiceAt, ttStopOf, ttDelay
} = require(path.join(__dirname, '..', '..', 'parts', '57_timetable.js'));

let pass = 0, fail = 0;
const failed = [];
function ok(name, cond, detail) {
  if (cond) pass++;
  else { fail++; failed.push({ name, detail }); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* 构造一条 5 站线路：站间距 1200 m，官方时分每段 90 s */
const mkStations = (n, gap) => {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ stopS: i * (gap || 1200), served: true });
  return out;
};

/* ========== 时间工具 ========== */

ok('ttParseClock 06:30:15', ttParseClock('06:30:15') === 6 * 3600 + 30 * 60 + 15);
ok('ttParseClock 05:30', ttParseClock('05:30') === 5 * 3600 + 30 * 60);
ok('ttFormatClock 回环', ttFormatClock(6 * 3600 + 30 * 60 + 5) === '06:30:05');
ok('ttFormatClock 跨天取模', ttFormatClock(25 * 3600) === '01:00:00');
ok('ttIsPeak 早高峰内', ttIsPeak(8 * 3600) === true);
ok('ttIsPeak 平峰外', ttIsPeak(11 * 3600) === false);
ok('ttHeadwayAt 高峰 150', ttHeadwayAt(8 * 3600) === TT_DEFAULTS.headwayPeak);
ok('ttHeadwayAt 平峰 300', ttHeadwayAt(11 * 3600) === TT_DEFAULTS.headwayNormal);

/* ========== ttEstimateRun ========== */

ok('ttEstimateRun 短距离为正', ttEstimateRun(500, 80) > 0);
ok('ttEstimateRun 长距离更大', ttEstimateRun(5000, 80) > ttEstimateRun(500, 80));
ok('ttEstimateRun 限速越高越快', ttEstimateRun(3000, 100) < ttEstimateRun(3000, 60));
/* 理论校验：1200 m、80 km/h
   = 22.22/1.45 加速 + 22.22/1.0 制动 + (1200-417)/22.22 匀速
   = 15.33 + 22.22 + 35.24 ≈ 72.8 s（平均 59 km/h，符合地铁常识） */
ok('ttEstimateRun 1200m/80 ≈ 72.8 s',
  near(ttEstimateRun(1200, 80), 72.8, 0.5), ttEstimateRun(1200, 80));

/* ========== ttComputeService ========== */

const stations5 = mkStations(5);
const svc = ttComputeService(stations5, { startSec: 6 * 3600, dwell: 40, vmax: 80 });

ok('车次停靠 5 站', svc.stops.length === 5, svc.stops.length);
ok('首站发车 = startSec', svc.stops[0].dep === 6 * 3600);
ok('首站到达 = 发车 - 停站', svc.stops[0].arr === 6 * 3600 - 40);
ok('到发时刻单调递增',
  svc.stops.every((s, i) => i === 0 || s.arr > svc.stops[i - 1].dep));
ok('末站发车 = endSec', svc.endSec === svc.stops[4].dep);
ok('全程耗时合理（4 段 × 约 100 s）',
  svc.endSec - svc.startSec > 300 && svc.endSec - svc.startSec < 700,
  svc.endSec - svc.startSec);

/* 不修改传入的 stations（纯函数要求） */
ok('不污染入参 stations',
  !('schArr' in stations5[0]) && !('schDep' in stations5[0]),
  Object.keys(stations5[0]).join(','));

/* ========== 官方时分优先 ========== */

const withOfficial = ttComputeService(stations5, {
  startSec: 0, dwell: 40,
  runTimes: [90, 90, 90, 90]
});
ok('官方时分被采纳（第 2 站 run=90）', withOfficial.stops[1].run === 90, withOfficial.stops[1].run);
ok('官方时分标记 official', withOfficial.stops[1].official === true);

/* ========== 跳站：中间段累加 ========== */

const skipStations = mkStations(5);
skipStations[1].served = false;
skipStations[2].served = false;
const skipped = ttComputeService(skipStations, {
  startSec: 0, dwell: 40, runTimes: [90, 90, 90, 90]
});
ok('跳 2 站后只剩 3 个停站', skipped.stops.length === 3, skipped.stops.length);
ok('跳站时运行时分累加 3 段 = 270', skipped.stops[1].run === 270, skipped.stops[1].run);
ok('跳站后站序正确（0 → 3）',
  skipped.stops[0].idx === 0 && skipped.stops[1].idx === 3,
  skipped.stops.map(s => s.idx).join(','));

/* ========== buildTimetable ========== */

const tt = ttBuildTimetable(stations5, {
  fromSec: 7 * 3600, toSec: 9 * 3600,
  dwell: 40, vmax: 80
});
ok('2 小时高峰生成多个车次', tt.services.length >= 30, tt.services.length);
ok('车次按发车时间递增',
  tt.services.every((s, i) => i === 0 || s.startSec > tt.services[i - 1].startSec));
ok('车次号唯一',
  new Set(tt.services.map(s => s.no)).size === tt.services.length);
ok('首个车次 = fromSec', tt.services[0].startSec === 7 * 3600);

/* 峰谷间隔：高峰段的相邻间隔约 150 s，午间约 300 s */
const peakGaps = [];
for (let i = 1; i < tt.services.length; i++) {
  peakGaps.push(tt.services[i].startSec - tt.services[i - 1].startSec);
}
ok('高峰间隔全部 = 150', peakGaps.every(g => g === 150), peakGaps.slice(0, 3).join(','));

const ttNoon = ttBuildTimetable(stations5, { fromSec: 11 * 3600, toSec: 13 * 3600, dwell: 40, vmax: 80 });
const noonGaps = [];
for (let i = 1; i < ttNoon.services.length; i++) {
  noonGaps.push(ttNoon.services[i].startSec - ttNoon.services[i - 1].startSec);
}
ok('平峰间隔全部 = 300', noonGaps.every(g => g === 300), noonGaps.slice(0, 3).join(','));

/* 防御：headway 传 0 不会生成无限车次 */
const ttBad = ttBuildTimetable(stations5, { fromSec: 0, toSec: 86400, dwell: 40, headwayNormal: 0, headwayPeak: 0 });
ok('异常间隔被兜底（不超过 maxServices）',
  ttBad.services.length <= TT_DEFAULTS.maxServices, ttBad.services.length);
ok('异常间隔兜底后仍为正数', ttBad.services.length > 0, ttBad.services.length);

/* ========== 查询工具 ========== */

const mid = tt.services[3];
const probe = Math.floor((mid.startSec + mid.endSec) / 2);
ok('ttServiceAt 命中运行中的车次', ttServiceAt(tt, probe) !== null);
ok('ttServiceAt 空表返回 null', ttServiceAt({ services: [] }, 0) === null);
ok('ttStopOf 能取到指定站', ttStopOf(mid, mid.stops[2].idx) !== null);
ok('ttStopOf 未停靠站返回 null', ttStopOf(mid, 99) === null);

/* ========== 正晚点 ========== */

ok('晚点 30 s', ttDelay(1000, 1030) === 30);
ok('早点 15 s', ttDelay(1000, 985) === -15);

/* ========== 性能 ========== */

(() => {
  const t0 = Date.now();
  const big = ttBuildTimetable(mkStations(30, 1400), {
    fromSec: 5 * 3600 + 1800, toSec: 23 * 3600, dwell: 40, vmax: 80
  });
  const ms = Date.now() - t0;
  ok('30 站全天运行图生成成功', big.services.length > 100, big.services.length);
  ok('全天运行图生成 < 300 ms', ms < 300, ms + 'ms');
})();

const out = { passed: fail === 0, pass, fail, failed };
console.log(JSON.stringify(out, null, 1));
process.exit(out.passed ? 0 : 1);
