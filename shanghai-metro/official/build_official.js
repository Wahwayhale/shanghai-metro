/* 从官方首末班车 JSON 推导各路线的站间运行时分（不含停站） */
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const partsDir = path.join(dir, '..', 'parts');

const raw = {};
for (const line of [1, 2, 3, 4, 11, 16]) {
  raw[line] = JSON.parse(fs.readFileSync(path.join(dir, `fltime_${line}.json`), 'utf8'));
}
const byDesc = (line, desc) => raw[line].filter(x => x.description === desc);
const sec = t => {
  if (!t || t === '--') return null;
  const [h, m] = t.split(':').map(Number);
  return h * 3600 + m * 60;
};
const alias = name => name === '黄陂南路' ? '一大会址·黄陂南路' : name;

function travelOrder(list, reverse) {
  return reverse ? list.slice().reverse() : list.slice();
}

function pairRuns(seq, dwell) {
  const map = new Map();
  for (let i = 0; i < seq.length - 1; i++) {
    const a = seq[i], b = seq[i + 1];
    const ta = sec(a.last_time), tb = sec(b.last_time);
    if (ta == null || tb == null) continue;
    let d = tb - ta;
    if (d < 0) d += 86400;
    if (d > 40 * 60) continue;
    const run = d - dwell;
    if (run >= 30 && run <= 600) map.set(alias(a.name) + '→' + alias(b.name), run);
  }
  return map;
}

function merge(...maps) {
  const out = new Map();
  for (const m of maps) for (const [k, v] of m) out.set(k, v);
  return out;
}

const pairMaps = {};
const dir1 = line => byDesc(line, raw[line].find(x => x.direction === 1 && x.description.indexOf('往') === 0).description);
// 显式方向选择，避免首条方向不是需要的方向
const lineSeq = {
  1: travelOrder(byDesc(1, '往富锦路'), false),
  2: travelOrder(byDesc(2, '往广兰路'), false),
  3: travelOrder(byDesc(3, '往江杨北路'), false),
  4: travelOrder(byDesc(4, '全程（外）'), true),
  11: travelOrder(byDesc(11, '往迪士尼'), false),
  16: travelOrder(byDesc(16, '往滴水湖'), false),
  34: travelOrder(byDesc(3, '往上海南站'), true)
};
pairMaps.l1 = pairRuns(lineSeq[1], 28);
pairMaps.l2 = pairRuns(lineSeq[2], 30);
pairMaps.l3 = pairRuns(lineSeq[3], 30);
pairMaps.l4 = pairRuns(lineSeq[4], 28);
pairMaps.l11 = pairRuns(lineSeq[11], 28);
pairMaps.l16 = pairRuns(lineSeq[16], 26);
pairMaps.l34 = pairRuns(lineSeq[34], 26);

// 11 号线：嘉定北→白银路 + 嘉定新城→迪士尼/花桥 两段
pairMaps.l11a = merge(
  pairRuns(byDesc(11, '嘉定北往迪士尼'), 28),
  pairRuns(byDesc(11, '往迪士尼'), 28)
);
pairMaps.l11b = merge(
  pairRuns(byDesc(11, '嘉定北往迪士尼'), 26),
  pairRuns(byDesc(11, '往花桥').slice().reverse(), 26)
);

const routeStations = {
  l2e: ['南京东路', '陆家嘴', '浦东南路', '世纪大道', '上海科技馆', '世纪公园', '龙阳路', '张江高科'],
  l1c: ['徐家汇', '衡山路', '常熟路', '陕西南路', '黄陂南路', '人民广场', '新闸路', '汉中路', '上海火车站'],
  l3n: ['中山公园', '金沙江路', '曹杨路', '镇坪路', '中潭路', '上海火车站', '宝山路', '东宝兴路', '虹口足球场', '赤峰路', '大柏树', '江湾镇'],
  l4e: ['世纪大道', '浦东大道', '杨树浦路', '大连路', '临平路', '海伦路', '宝山路', '上海火车站'],
  l4full: ['世纪大道', '浦东大道', '杨树浦路', '大连路', '临平路', '海伦路', '宝山路', '上海火车站', '中潭路', '镇坪路', '曹杨路', '金沙江路', '中山公园', '延安西路', '虹桥路', '宜山路', '上海体育馆', '上海体育场', '东安路', '大木桥路', '鲁班路', '西藏南路', '南浦大桥', '塘桥', '蓝村路', '向城路'],
  l34: ['宝山路', '上海火车站', '中潭路', '镇坪路', '曹杨路', '金沙江路', '中山公园', '延安西路', '虹桥路'],
  l11a: ['嘉定北', '嘉定西', '白银路', '嘉定新城', '马陆', '陈翔公路', '南翔', '桃浦新村', '武威路', '祁连山路', '李子园', '上海西站', '真如', '枫桥路', '曹杨路', '隆德路', '江苏路', '交通大学', '徐家汇'],
  l11b: ['嘉定北', '嘉定西', '白银路', '嘉定新城', '上海赛车场', '昌吉东路', '上海汽车城', '安亭', '兆丰路', '光明路', '花桥'],
  l16s: ['龙阳路', '华夏中路', '罗山路', '周浦东', '鹤沙航城', '航头东', '新场', '野生动物园'],
  l16e: ['龙阳路', '华夏中路', '罗山路', '周浦东', '鹤沙航城', '航头东', '新场', '野生动物园']
};
const routeMap = { l2e: 'l2', l1c: 'l1', l3n: 'l3', l4e: 'l4', l4full: 'l4', l34: 'l34', l11a: 'l11a', l11b: 'l11b', l16s: 'l16', l16e: 'l16' };
const routeLoop = { l4full: true };
const routeDwell = { l2e: 30, l1c: 28, l3n: 30, l4e: 28, l4full: 28, l34: 26, l11a: 28, l11b: 26, l16s: 26, l16e: 24 };

const out = {};
let missing = [];
for (const [id, sts] of Object.entries(routeStations)) {
  const map = pairMaps[routeMap[id]];
  const dwell = routeDwell[id];
  const arr = [];
  const n = sts.length;
  const last = routeLoop[id] ? n : n - 1;
  for (let i = 1; i <= last; i++) {
    const from = sts[i - 1], to = sts[i % n];
    const v = map.get(alias(from) + '→' + alias(to));
    if (v == null) missing.push(`${id}:${from}→${to}`);
    arr.push(v == null ? null : v);
  }
  out[id] = arr;
}

const js = `/* =====================================================================
   官方首末班车时刻表推导的站间运行时分（不含停站）
   数据：上海地铁 service.shmetro.com/hcskb + m.shmetro.com fltime 接口
   抓取：2026-10-18；单位为秒；null 表示官方数据缺失，回退物理曲线
   ===================================================================== */
const OFFICIAL_RUN = ${JSON.stringify(out, null, 2)};
const OFFICIAL_SOURCE = '上海地铁首末班车时刻表（2026-10-18）';
`;
fs.writeFileSync(path.join(partsDir, '15_official.js'), js, 'utf8');
console.log('official runs written', Object.keys(out).length, 'routes');
console.log('missing', missing.length, missing.join(' | '));
