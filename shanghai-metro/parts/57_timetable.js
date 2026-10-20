/* =====================================================================
   运行图数据层（P0-3 / v2.0）
   ---------------------------------------------------------------------
   目标：把「一条线路一个时段内的所有车次」变成纯函数可算的数据结构，
   供 AI 车按图运行、玩家比对正晚点、ATS 做调度。

   为什么单独抽出来（而不是继续在 20_route.js 里改）：
   现在的 `Route.buildSchedule()` 把时刻直接写到 **车站对象** 上
   （`st.schArr` / `st.schDep`），等于「同一时刻只能存在一张时刻表」。
   要做运行图，必须能同时持有几十个车次，所以时刻要挂在 **车次** 上。

   本文件不依赖 THREE、不读全局变量，可以 node 直接 require 单测。
   全部函数无副作用：不修改传入的 stations，不读写模块级状态。
   ===================================================================== */

/* 与 10_data.js 的动力学常量保持一致。
   之所以不直接引用，是因为 10_data.js 依赖 THREE 与 DOM，node 里 require 不了。
   数值必须同步：ACC_MAX 1.45 m/s²、BRK_SRV 1.0 m/s²（见 10_data.js:317-320）。 */
const TT_KMH = 1 / 3.6;
const TT_ACC = 1.45;
const TT_BRK = 1.0;
const TT_VMAX = 80;

const TT_DEFAULTS = {
  dwell: 40,                      // 标准停站秒数
  headwayNormal: 300,             // 平峰发车间隔（秒）
  headwayPeak: 150,               // 高峰发车间隔（秒）
  peakRanges: [[7 * 3600, 9 * 3600], [17 * 3600, 19 * 3600]],
  dayFrom: 5 * 3600 + 30 * 60,    // 05:30
  dayTo: 23 * 3600,               // 23:00
  maxServices: 4000               // 防御：参数异常时不要生成十万个车次
};

/* 与 10_data.js:347 的 estimateRunTime 等价的本地实现。
   传入 dist(米)、vmax(km/h)，返回秒。 */
function ttEstimateRun(dist, vmaxKmh) {
  const v = (vmaxKmh || TT_VMAX) * TT_KMH;
  const da = v * v / (2 * TT_ACC), db = v * v / (2 * TT_BRK);
  if (da + db < dist) return v / TT_ACC + v / TT_BRK + (dist - da - db) / v;
  const vp = Math.sqrt(2 * dist * TT_ACC * TT_BRK / (TT_ACC + TT_BRK));
  return vp / TT_ACC + vp / TT_BRK;
}

/* 'HH:MM' / 'HH:MM:SS' → 秒 */
function ttParseClock(str) {
  if (typeof str === 'number') return str;
  const parts = String(str || '0:0').split(':').map(Number);
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

/* 秒 → 'HH:MM:SS'（跨天按 24h 取模，便于显示末班 23:59 之后的车） */
function ttFormatClock(sec) {
  const s = ((Math.round(sec) % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const p2 = n => String(n).padStart(2, '0');
  return `${p2(h)}:${p2(m)}:${p2(ss)}`;
}

/* 某个时刻是否落在高峰时段 */
function ttIsPeak(sec, ranges) {
  const rs = ranges || TT_DEFAULTS.peakRanges;
  for (const [a, b] of rs) if (sec >= a && sec < b) return true;
  return false;
}

/* 发车间隔：按当前时刻判断峰谷 */
function ttHeadwayAt(sec, opts) {
  const o = opts || {};
  const hw = {
    headwayNormal: o.headwayNormal || TT_DEFAULTS.headwayNormal,
    headwayPeak: o.headwayPeak || TT_DEFAULTS.headwayPeak,
    peakRanges: o.peakRanges || TT_DEFAULTS.peakRanges
  };
  return ttIsPeak(sec, hw.peakRanges) ? hw.headwayPeak : hw.headwayNormal;
}

/* ---------------------------------------------------------------------
   computeService：算一个车次的逐站到发时刻
   ---------------------------------------------------------------------
   入参：
     stations  [{ stopS, served }]   只读，不会被修改
     opts {
       runTimes  [[秒],...] | null   station[i] → station[i+1] 的官方运行时分
       dwell     停站秒
       vmax      线路最高速度 km/h
       startSec  首站发车时刻（秒）
       no        车次号（可选，仅透传）
       dir       方向（可选，仅透传）
     }
   返回：
     {
       no, dir, startSec, endSec,
       stops: [{ idx, arr, dep, dwell, run }]   run = 从上一站到本站的运行时分
       served: [idx...]                         实际停靠的站序
     }
   --------------------------------------------------------------------- */
function ttComputeService(stations, opts) {
  const o = opts || {};
  const dwell = o.dwell == null ? TT_DEFAULTS.dwell : o.dwell;
  const vmax = o.vmax || TT_VMAX;
  const runTimes = o.runTimes || null;
  const startSec = o.startSec || 0;

  const served = [];
  for (let i = 0; i < stations.length; i++) {
    if (stations[i].served !== false) served.push(i);
  }
  if (!served.length) {
    return { no: o.no || '', dir: o.dir || 1, startSec, endSec: startSec, stops: [], served: [] };
  }

  const stops = [];
  const first = served[0];
  stops.push({ idx: first, arr: startSec - dwell, dep: startSec, dwell, run: 0 });

  for (let k = 1; k < served.length; k++) {
    const a = stations[served[k - 1]], b = stations[served[k]];
    const ai = served[k - 1], bi = served[k];

    /* 官方站间时分：把中间被跳过的站的分段累加（跳停时也要走完这段路） */
    let run = 0, official = false;
    if (runTimes) {
      let sum = 0, ok = true;
      for (let j = ai + 1; j <= bi; j++) {
        const v = runTimes[j - 1];
        if (v == null) { ok = false; break; }
        sum += v;
      }
      if (ok && sum > 0) { run = sum; official = true; }
    }
    if (!official) {
      run = ttEstimateRun(Math.max(60, b.stopS - a.stopS), vmax) + 6;
    }

    const prev = stops[stops.length - 1];
    const arr = prev.dep + run;
    stops.push({ idx: bi, arr, dep: arr + dwell, dwell, run, official });
  }

  return {
    no: o.no || '',
    dir: o.dir || 1,
    startSec,
    endSec: stops[stops.length - 1].dep,
    stops,
    served
  };
}

/* ---------------------------------------------------------------------
   buildTimetable：按发车间隔生成一个时段内的全部车次
   ---------------------------------------------------------------------
   opts {
     fromSec, toSec       生成区间（默认 05:30–23:00）
     headwayNormal/Peak   发车间隔
     peakRanges           高峰时段
     dwell, vmax, runTimes
     dir                  方向
     noPrefix             车次号前缀（如 '101'）
   }
   返回 { fromSec, toSec, dir, services: [...] }
   --------------------------------------------------------------------- */
function ttBuildTimetable(stations, opts) {
  const o = opts || {};
  const fromSec = o.fromSec == null ? TT_DEFAULTS.dayFrom : o.fromSec;
  const toSec = o.toSec == null ? TT_DEFAULTS.dayTo : o.toSec;
  const dir = o.dir || 1;
  const noPrefix = o.noPrefix || '1';
  const services = [];

  let t = fromSec;
  let guard = 0;
  while (t < toSec && guard < TT_DEFAULTS.maxServices) {
    guard++;
    const svc = ttComputeService(stations, {
      runTimes: o.runTimes, dwell: o.dwell, vmax: o.vmax,
      startSec: t, dir,
      no: `${noPrefix}${String(services.length + 1).padStart(3, '0')}`
    });
    services.push(svc);
    const hw = ttHeadwayAt(t, o);
    t += Math.max(60, hw);
  }
  if (guard >= TT_DEFAULTS.maxServices) {
    /* 参数异常（例如 headway 传了 0）时不要静默生成四万个车次 */
    services.length = TT_DEFAULTS.maxServices;
  }
  return { fromSec, toSec, dir, services };
}

/* 给定时刻，找出该时刻正在区间内运行的车次（用于 ATS 显示「当前载客车次」） */
function ttServiceAt(timetable, sec) {
  const list = timetable && timetable.services;
  if (!list || !list.length) return null;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (sec >= s.startSec && sec <= s.endSec) return s;
  }
  return null;
}

/* 车次在某一站的计划到发（按站序索引查） */
function ttStopOf(service, stationIdx) {
  if (!service || !service.stops) return null;
  for (const st of service.stops) if (st.idx === stationIdx) return st;
  return null;
}

/* 正晚点：正数为晚点（秒），负数为早点 */
function ttDelay(plannedSec, actualSec) {
  return Math.round(actualSec - plannedSec);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TT_DEFAULTS,
    ttEstimateRun, ttParseClock, ttFormatClock, ttIsPeak, ttHeadwayAt,
    ttComputeService, ttBuildTimetable, ttServiceAt, ttStopOf, ttDelay
  };
}
