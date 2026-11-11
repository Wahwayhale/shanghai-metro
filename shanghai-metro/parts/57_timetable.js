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
  /* s 记下停站里程：绑定车次 / ATS 换算位置时要用，且不依赖调用方再查站表 */
  stops.push({ idx: first, s: stations[first].stopS, arr: startSec - dwell, dep: startSec, dwell, run: 0 });

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
    stops.push({ idx: bi, s: b.stopS, arr, dep: arr + dwell, dwell, run, official });
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

/* ---------------------------------------------------------------------
   以下是 P1-3「AI 按图运行」用的纯函数
   --------------------------------------------------------------------- */

/* 以 vmax 跑完 dist 所需的最短时间（秒）。
   与 ttEstimateRun 同一套物理：先加速后制动，能巡航就巡航。 */
function ttMinRun(dist, vmaxKmh, acc, brk) {
  const a = acc || TT_ACC, b = brk || TT_BRK;
  const v = (vmaxKmh || TT_VMAX) * TT_KMH;
  const da = v * v / (2 * a), db = v * v / (2 * b);
  if (da + db < dist) return v / a + v / b + (dist - da - db) / v;
  const vp = Math.sqrt(2 * dist * a * b / (a + b));
  return vp / a + vp / b;
}

/* 给定剩余距离、剩余时间、当前速度，求「恰好按点到达」的巡航速度（m/s）。
   -----------------------------------------------------------------
   为什么必须带当前速度：如果按「从静止重新起步」求解，列车一动起来
   剩余时间缩得比剩余距离快，解出的速度会一路上涨，最后跑成最短时间
   （早点 6~7 s）。带 v0 后，解出的速度在整段里基本恒定。

   速度剖面：从 v0 加速到 vc → 巡航 → 以 b 制动到停车标。
   时间随 vc 单调递减，用二分求根；时间不够（即使 vc 取上限也赶不上）时
   返回 vmax，让列车跑满线路限速。 */
function ttSolveCruiseFrom(dist, sec, v0, vmaxKmh, acc, brk) {
  const vmax = (vmaxKmh || TT_VMAX) * TT_KMH;
  if (!(dist > 0) || !(sec > 0)) return vmax;
  const a = acc || TT_ACC, b = brk || TT_BRK;
  const v = Math.min(vmax, Math.max(0, v0 || 0));

  /* 加速+制动正好用完全程时的巡航速度（再高就没有巡航段） */
  const cap = Math.sqrt((dist + v * v / (2 * a)) / (0.5 / a + 0.5 / b));
  const vCap = Math.min(vmax, cap);
  const timeAt = nu => {
    const u = Math.max(0.01, nu);
    const da = Math.max(0, (u * u - v * v)) / (2 * a);
    const db = u * u / (2 * b);
    if (da + db >= dist) return (u - v) / a + u / b;
    return (u - v) / a + u / b + (dist - da - db) / u;
  };

  if (timeAt(vCap) >= sec) return vmax;   // 时间不够：跑满限速

  /* 已经很早：需要先减速到更低的巡航速度（不然会越来越早）。
     剖面：以 b 从 v 减速到 vc → 巡航 → 再以 b 制动到停车标。
     总时间 = v/b + (D − v²/2b)/vc，解出 vc。 */
  if (timeAt(v) <= sec) {
    const denom = sec - v / b;
    if (denom <= 1e-6) return 0;
    const vc = (dist - v * v / (2 * b)) / denom;
    return Math.max(0, Math.min(v, vc));
  }

  let lo = v, hi = vCap;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (timeAt(mid) > sec) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* 不带当前速度的简化版（v0 = 0），保留给纯计算与单测 */
function ttSolveCruise(dist, sec, vmaxKmh, acc, brk) {
  return ttSolveCruiseFrom(dist, sec, 0, vmaxKmh, acc, brk);
}

/* 车次在某一时刻所处的里程（米）。停站期间取站台里程。
   用于把 AI 车「对到」它自己的时刻表上：给定开局时刻与当前位置，
   反推出这个车次应该何时从首站发车。 */
function ttServicePosition(service, sec) {
  if (!service || !service.stops || !service.stops.length) return 0;
  const stops = service.stops;
  if (sec <= stops[0].arr) return stops[0].s;
  for (let i = 1; i < stops.length; i++) {
    const p = stops[i - 1], q = stops[i];
    if (sec <= p.dep) return p.s;
    if (sec < q.arr) {
      const run = q.arr - p.dep;
      const f = run > 0 ? (sec - p.dep) / run : 1;
      return p.s + (q.s - p.s) * f;
    }
  }
  return stops[stops.length - 1].s;
}

/* 车次在某一里程处的计划通过时刻（秒）。
   s 落在停站区间时返回该站的到达时刻（保守：按「已到站」算）。 */
function ttTimeAtPosition(service, s) {
  if (!service || !service.stops || !service.stops.length) return 0;
  const stops = service.stops;
  if (s <= stops[0].s) return stops[0].arr;
  for (let i = 1; i < stops.length; i++) {
    const p = stops[i - 1], q = stops[i];
    if (s < q.s) {
      const f = q.s > p.s ? (s - p.s) / (q.s - p.s) : 1;
      return p.dep + (q.arr - p.dep) * f;
    }
    if (s <= q.s) return q.arr;
  }
  return stops[stops.length - 1].dep;
}

/* 整张运行图平移 delta 秒（含全部车次与停站时刻）。
   运营日的下一段要精确从「交班时刻」发车，而运行图是按发车间隔网格
   生成的，不一定正好落在该时刻，所以整表对齐一次。 */
function ttShiftTimetable(tt, delta) {
  if (!tt || !tt.services || !delta) return tt;
  tt.fromSec += delta;
  tt.toSec += delta;
  for (const svc of tt.services) {
    svc.startSec += delta;
    svc.endSec += delta;
    for (const sp of svc.stops) { sp.arr += delta; sp.dep += delta; }
  }
  return tt;
}

/* 克隆一个车次并整体平移 offset 秒。
   P1-3 用它给 AI 车生成「以自己当前位置为准」的班次：
   AI 的初始位置是场景布置决定的，不能为了对时刻表把车挪走，
   所以取本务车次的运行时分与停站时间，平移到 AI 当前所在处。 */
function ttShiftService(service, offsetSec, no) {
  if (!service) return null;
  const off = Number(offsetSec) || 0;
  const stops = service.stops.map(sp => ({
    idx: sp.idx, s: sp.s, run: sp.run, dwell: sp.dwell, official: sp.official,
    arr: sp.arr + off, dep: sp.dep + off
  }));
  return {
    no: no || service.no,
    dir: service.dir,
    startSec: service.startSec + off,
    endSec: service.endSec + off,
    stops,
    served: service.served ? service.served.slice() : []
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TT_DEFAULTS,
    ttEstimateRun, ttParseClock, ttFormatClock, ttIsPeak, ttHeadwayAt,
    ttComputeService, ttBuildTimetable, ttServiceAt, ttStopOf, ttDelay,
    ttMinRun, ttSolveCruise, ttSolveCruiseFrom, ttServicePosition, ttTimeAtPosition,
    ttShiftService, ttShiftTimetable
  };
}
