/* ------------------------------------------------------------------
   进路表 / 敌对矩阵单测（55_routes.js，P3-3）

   覆盖：
   1. 每站一条正线通过 + 两端折返 + 两端同时，数量与 id 正确
   2. 敌对关系由「区段资源交集」推出：revA 与首站进路敌对，与中间站不敌对
   3. 锁闭进路时，请求敌对进路被拒绝且给出原因
   4. 区段占用时拒绝
   5. 矩阵对称、未知进路拒绝
   ------------------------------------------------------------------ */
const path = require('path');
const {
  buildRouteTable, checkRouteRequest, makeInterlockState
} = require(path.join(__dirname, '..', '..', 'parts', '55_routes.js'));

let pass = 0, fail = 0;
const failed = [];
function ok(name, cond, detail) {
  if (cond) pass++;
  else { fail++; failed.push({ name, detail }); }
}

const stations = [];
for (let i = 0; i < 5; i++) stations.push({ idx: i, zh: 'S' + i, stopS: 500 + i * 1500 });
const turnouts = [{ key: 'A', s: 300 }, { key: 'B', s: 6800 }];
const table = buildRouteTable({ stations, turnouts });

ok('进路数 = 5 站 + 2 折返 + 1 双端', table.routes.length === 8, table.routes.length);
ok('每站都有正线进路', stations.every(s => !!table.byId[`S${s.idx}-main`]));
ok('存在起点折返进路', !!table.byId.revA && !!table.byId.revB && !!table.byId.both);
ok('首站进路占用 A 渡线资源', table.byId['S0-main'].resources.includes('ix:A'));
ok('末站进路占用 B 渡线资源', table.byId['S4-main'].resources.includes('ix:B'));
ok('中间站不占渡线资源',
  !table.byId['S2-main'].resources.some(r => r.startsWith('ix:')),
  table.byId['S2-main'].resources);

/* 敌对矩阵 */
ok('revA 与首站进路敌对', table.matrix.revA.includes('S0-main'), table.matrix.revA);
ok('revA 与末站进路不敌对', !table.matrix.revA.includes('S4-main'), table.matrix.revA);
ok('revA 与 revB 不共用资源', !table.matrix.revA.includes('revB'), table.matrix.revA);
ok('both 与两侧折返都敌对',
  table.matrix.both.includes('revA') && table.matrix.both.includes('revB'));
ok('敌对矩阵对称',
  table.routes.every(r => r.conflicts.every(id => table.matrix[id].includes(r.id))));

/* 请求检查 */
{
  const okReq = checkRouteRequest(table, 'S2-main', [], []);
  ok('无锁闭无占用 → 允许', okReq.ok === true, okReq);

  const conflict = checkRouteRequest(table, 'both', ['revA'], []);
  ok('锁闭 revA 时请求 both → 拒绝', conflict.ok === false, conflict);
  ok('拒绝原因包含敌对进路名',
    /敌对/.test(conflict.reason) && /起点折返/.test(conflict.reason), conflict.reason);

  const nonConflict = checkRouteRequest(table, 'S2-main', ['revA'], []);
  ok('锁闭 revA 时请求中间站 → 允许', nonConflict.ok === true, nonConflict);

  const busy = checkRouteRequest(table, 'revA', [], ['ix:A']);
  ok('A 渡线占用时请求 revA → 拒绝', busy.ok === false, busy);
  ok('占用拒绝原因带资源名', /ix:A/.test(busy.reason), busy.reason);

  const unknown = checkRouteRequest(table, 'nope', [], []);
  ok('未知进路 → 拒绝', unknown.ok === false && /未知/.test(unknown.reason), unknown);
}

/* 状态对象 */
{
  const st = makeInterlockState();
  ok('联锁状态初始为空', st.locks.length === 0 && st.occupied.length === 0);
}

const out = { passed: fail === 0, pass, fail, failed };
console.log(JSON.stringify(out, null, 1));
process.exit(out.passed ? 0 : 1);
