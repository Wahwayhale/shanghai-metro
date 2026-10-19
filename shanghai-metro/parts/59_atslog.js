/* ================================================================
   ATS 调度台纯逻辑（零浏览器依赖）
   ----------------------------------------------------------------
   从 76_ats.js 里抽出与渲染无关的两块：
     1. atsRows()   —— 把「本务 + AI 车队」转成表格行数据
     2. atsTag()    —— 状态 → 中文标签 + CSS 类
     3. atsCommand() —— 调度命令 → { ai, secs, toast } 的动作描述

   canvas 绘制与 DOM 拼装留在 76_ats.js。
   本文件不碰 canvas / document / Three.js，node 里可直接 require
   （见 tests/unit/ats.test.js）。

   抽取时的取舍：原 renderList() 把「取数 → 判定 → 拼 HTML」写在
   一个 map 里，HTML 字符串与业务判定混在一起，无法单独验证。
   现在判定归纯函数，HTML 拼装仍在 UI 层。
   ================================================================ */

/** 数值钳位（本文件自用，避免依赖全局 clamp） */
function atsClamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

/**
 * 状态 → { tag, cls }。
 * 优先级：紧急 > 扣车 > 停站 > 折返 > 运行。
 * @param {{state:string, hold:number}} r
 */
function atsTag(r) {
  if (r.state === 'eb') return { tag: '紧急', cls: 'hold' };
  if (r.hold > 0.5) return { tag: '扣车 ' + Math.round(r.hold) + 's', cls: 'hold' };
  if (r.state === 'dwell') return { tag: '停站', cls: 'dwell' };
  if (r.state === 'turnback') return { tag: '折返', cls: 'dwell' };
  return { tag: '运行', cls: 'run' };
}

/**
 * 构建列车列表的行数据（不含 HTML）。
 *
 * @param {object} o
 * @param {object} o.G         本务状态（需 targetIdx / v / eb / doorsOpen）
 * @param {Array}  o.aiTrains  AI 车队
 * @param {Array}  o.stations  站表（需 zh）
 * @returns {Array<object>}    行数组，第 0 行是本务
 */
function atsRows(o) {
  const G = o.G || {};
  const ais = o.aiTrains || [];
  const sts = o.stations || [];
  const rows = [];

  /* ---- 本务 ---- */
  rows.push({
    no: '本务', sub: 'DRIVER', me: true,
    from: G.targetIdx > 0 && sts[G.targetIdx - 1] ? sts[G.targetIdx - 1].zh : '始发',
    to: sts[G.targetIdx] ? sts[G.targetIdx].zh : '',
    v: (G.v || 0) * 3.6,
    state: G.eb ? 'eb' : G.doorsOpen ? 'dwell' : 'run',
    hold: 0,
    ops: null            // 本务无调度按钮
  });

  /* ---- AI ---- */
  for (const ai of ais) {
    if (ai.dead) continue;
    const ti = atsClamp(ai.idx, 0, sts.length - 1);
    const fi = atsClamp(ai.idx - ai.dir, 0, sts.length - 1);
    rows.push({
      no: ai.carNo,
      sub: ai.dir > 0 ? '上行' : '下行',
      me: false,
      from: sts[fi] ? sts[fi].zh : '',
      to: sts[ti] ? sts[ti].zh : '',
      v: (ai.v || 0) * 3.6,
      state: ai.state,
      hold: ai.holdT || 0,
      ops: ['hold', 'go', 'skip']   // UI 层据此生成按钮
    });
  }
  return rows;
}

/**
 * 调度命令 → 动作描述。
 * @param {string} cmd   'hold' | 'go' | 'skip'
 * @returns {{cmd:string, secs:number, level:string, text:(no:string)=>string}|null}
 */
function atsCommand(cmd) {
  if (cmd === 'hold') {
    return {
      cmd, secs: 90, level: 'warn',
      text: no => `${no} 次 · 调度扣车 90 秒`
    };
  }
  if (cmd === 'go') {
    return {
      cmd, secs: 0, level: 'good',
      text: no => `${no} 次 · 调度放行`
    };
  }
  if (cmd === 'skip') {
    return {
      cmd, secs: 0, level: 'info',
      text: no => `${no} 次 · 下一站跳停`
    };
  }
  return null;
}

/** 顶部副标题文案 */
function atsSubtitle(o) {
  const line = o.line;
  return `${line ? line.name : ''} · 上行 · ${(o.aiCount || 0) + 1} 列在网 · ${(o.pathLen || 0).toFixed(0)} m`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { atsTag, atsRows, atsCommand, atsSubtitle, atsClamp, ATS_CMDS: ['hold', 'go', 'skip'] };
}
