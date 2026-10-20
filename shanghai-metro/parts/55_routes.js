/* =====================================================================
   进路表与敌对矩阵（P3-3）
   ---------------------------------------------------------------------
   纯逻辑：给一条线路的每座车站生成「正线通过」进路，加上两端渡线的
   折返进路，按「区段资源」计算敌对关系。浏览器侧（49_interlock.js）
   只负责道岔动画与按钮，判定全部走这里，便于 node 单测。

   为什么用资源集合而不是手写敌对表：
   - 手写表在 27 个站 + 2 处渡线时既长又容易漏；
   - 资源集合能自动回答「两条进路为什么敌对」（共用哪一段）；
   - 以后加侧线/存车线，只要给进路多挂一个资源即可。
   ===================================================================== */

const ROUTE_DEFAULTS = {
  stationHalf: 190,   // 车站进路覆盖的里程半宽（m）
  turnoutHalf: 60     // 渡线进路覆盖的里程半宽（m）
};

/**
 * 生成整条线路的进路表。
 *
 * @param {object} o
 * @param {Array} o.stations  [{ idx, zh, stopS }]
 * @param {Array} o.turnouts  [{ key:'A'|'B', s }]
 * @returns {{routes:Array, byId:Object, matrix:Object}}
 *   route: { id, name, sub, kind:'station'|'turnback', resources:[], fromS, toS, conflicts:[] }
 */
function buildRouteTable(o) {
  const opt = o || {};
  const stations = (opt.stations || []).filter(s => s && s.stopS != null);
  const turnouts = opt.turnouts || [];
  const sh = opt.stationHalf || ROUTE_DEFAULTS.stationHalf;
  const th = opt.turnoutHalf || ROUTE_DEFAULTS.turnoutHalf;
  const routes = [];

  /* 每站一条正线通过进路；首末站额外占用端部渡线资源 */
  for (const st of stations) {
    const res = [`sec:${st.idx}`];
    const tA = turnouts.find(t => t.key === 'A');
    const tB = turnouts.find(t => t.key === 'B');
    const isFirst = st.idx === stations[0].idx;
    const isLast = st.idx === stations[stations.length - 1].idx;
    if (isFirst && tA) res.push('ix:A');
    if (isLast && tB) res.push('ix:B');
    routes.push({
      id: `S${st.idx}-main`,
      name: `${st.zh || '车站'} 正线通过`,
      sub: isFirst ? '首站 · 经 A 渡线直向' : isLast ? '末站 · 经 B 渡线直向' : '站内正线',
      kind: 'station',
      resources: res,
      fromS: st.stopS - sh,
      toS: st.stopS + sh,
      conflicts: []
    });
  }

  /* 两端折返进路 */
  for (const t of turnouts) {
    if (t.key !== 'A' && t.key !== 'B') continue;
    routes.push({
      id: t.key === 'A' ? 'revA' : 'revB',
      name: t.key === 'A' ? '起点折返' : '终点折返',
      sub: `${t.key} 渡线反位`,
      kind: 'turnback',
      resources: [`ix:${t.key}`],
      fromS: t.s - th,
      toS: t.s + th,
      conflicts: []
    });
  }
  if (turnouts.some(t => t.key === 'A') && turnouts.some(t => t.key === 'B')) {
    routes.push({
      id: 'both',
      name: '两端折返',
      sub: 'A/B 渡线同时反位',
      kind: 'turnback',
      resources: ['ix:A', 'ix:B'],
      fromS: -Infinity,
      toS: Infinity,
      conflicts: []
    });
  }

  /* 敌对矩阵：资源交集非空即敌对 */
  const byId = {};
  for (const r of routes) byId[r.id] = r;
  for (let i = 0; i < routes.length; i++) {
    for (let j = i + 1; j < routes.length; j++) {
      const a = routes[i], b = routes[j];
      const shared = a.resources.filter(x => b.resources.indexOf(x) >= 0);
      if (!shared.length) continue;
      a.conflicts.push(b.id);
      b.conflicts.push(a.id);
    }
  }
  const matrix = {};
  for (const r of routes) matrix[r.id] = r.conflicts.slice();

  return { routes, byId, matrix };
}

/**
 * 请求排列一条进路。
 *
 * @param {object} table   buildRouteTable 的返回值
 * @param {string} id      目标进路
 * @param {Array}  locks   已锁闭的进路 id（列车占用中）
 * @param {Array}  occupied 被占用的资源 id
 * @returns {{ok:boolean, reason?:string, route?:object}}
 */
function checkRouteRequest(table, id, locks, occupied) {
  if (!table || !table.byId || !table.byId[id]) {
    return { ok: false, reason: '未知进路' };
  }
  const route = table.byId[id];
  const locked = locks || [];
  for (const lid of locked) {
    if (lid === id) continue;
    const other = table.byId[lid];
    if (!other) continue;
    const shared = route.resources.filter(x => other.resources.indexOf(x) >= 0);
    if (shared.length) {
      return {
        ok: false,
        reason: `与锁闭进路「${other.name}」敌对（共用 ${shared.join('、')}）`,
        conflicts: other.id
      };
    }
  }
  const occ = occupied || [];
  const busy = route.resources.filter(x => occ.indexOf(x) >= 0);
  if (busy.length) {
    return { ok: false, reason: `区段被占用：${busy.join('、')}` };
  }
  return { ok: true, route };
}

/* 供 49_interlock.js 使用的单例状态（纯数据，不碰 DOM） */
function makeInterlockState() {
  return { locks: [], occupied: [] };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ROUTE_DEFAULTS, buildRouteTable, checkRouteRequest, makeInterlockState
  };
}
