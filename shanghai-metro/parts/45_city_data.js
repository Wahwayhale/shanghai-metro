/* =====================================================================
   城市分区数据（P5-0 / v2.0）
   ---------------------------------------------------------------------
   为什么需要分区：如果全城用同一套「随机高度方盒子」，结果一定像
   SimCity 而不像上海。真实城市的肌理是分层的 —— 陆家嘴是超高层塔楼、
   老城厢是低矮密集里弄、衡复一带是梧桐树下的低层洋房。

   本文件只放**数据与纯函数**，不碰 THREE、不生成几何。
   ===================================================================== */

/* 分区：中心用经纬度（与 LANDMARKS / RIVER_PATH 同一套坐标系），
   半径单位米。hMin/hMax 是该区建筑高度区间，block 是街区边长区间。 */
const CITY_DISTRICTS = [
  { id: 'lujiazui',   name: '陆家嘴',     lat: 31.2365, lon: 121.5055, r: 1500, kind: 'tower',    hMin: 90,  hMax: 320, block: [90, 170],  density: 0.85 },
  { id: 'bund',       name: '外滩',       lat: 31.2400, lon: 121.4900, r: 850,  kind: 'heritage', hMin: 20,  hMax: 48,  block: [60, 100],  density: 0.80 },
  { id: 'peoplesq',   name: '人民广场',   lat: 31.2329, lon: 121.4696, r: 1700, kind: 'office',   hMin: 40,  hMax: 120, block: [80, 150],  density: 0.80 },
  { id: 'french',     name: '衡复风貌',   lat: 31.2050, lon: 121.4450, r: 1600, kind: 'villa',    hMin: 10,  hMax: 26,  block: [55, 105],  density: 0.70 },
  { id: 'laocheng',   name: '老城厢',     lat: 31.2200, lon: 121.4900, r: 1200, kind: 'lane',     hMin: 8,   hMax: 22,  block: [40, 80],   density: 0.92 },
  { id: 'xujiahui',   name: '徐家汇',     lat: 31.1936, lon: 121.4363, r: 1300, kind: 'office',   hMin: 45,  hMax: 140, block: [80, 140],  density: 0.85 },
  { id: 'hongkou',    name: '虹口',       lat: 31.2689, lon: 121.4793, r: 1400, kind: 'mixed',    hMin: 20,  hMax: 95,  block: [70, 130],  density: 0.75 },
  { id: 'zhongshan',  name: '中山公园',   lat: 31.2200, lon: 121.4200, r: 1200, kind: 'office',   hMin: 30,  hMax: 90,  block: [80, 140],  density: 0.80 },
  { id: 'wujiaochang',name: '五角场',     lat: 31.3000, lon: 121.5150, r: 1300, kind: 'mixed',    hMin: 25,  hMax: 100, block: [80, 150],  density: 0.80 },
  { id: 'pudong_s',   name: '浦东腹地',   lat: 31.1800, lon: 121.5600, r: 2200, kind: 'mixed',    hMin: 20,  hMax: 80,  block: [100, 190], density: 0.60 },
  { id: 'minhang',    name: '闵行',       lat: 31.1100, lon: 121.3800, r: 2600, kind: 'mixed',    hMin: 14,  hMax: 70,  block: [110, 200], density: 0.55 },
  { id: 'baoshan',    name: '宝山',       lat: 31.3600, lon: 121.4800, r: 2400, kind: 'mixed',    hMin: 14,  hMax: 65,  block: [110, 200], density: 0.55 }
];

/* 分区类型 → 可用建筑原型及权重。
   原型名对应 47_city_proto.js 里的 CITY_PROTO。 */
const CITY_KIND_PROTO = {
  tower:    [['towerSetback', 0.35], ['tower', 0.40], ['podium', 0.25]],
  office:   [['tower', 0.45], ['slab', 0.30], ['podium', 0.25]],
  mixed:    [['slab', 0.40], ['tower', 0.25], ['lane', 0.20], ['podium', 0.15]],
  villa:    [['villa', 0.70], ['slab', 0.30]],
  lane:     [['lane', 0.80], ['villa', 0.20]],
  heritage: [['heritage', 0.80], ['podium', 0.20]],
  factory:  [['factory', 0.80], ['silo', 0.20]]
};

/* 裸地：不属于任何分区时使用（郊区/工业带） */
const CITY_FALLBACK = { id: 'rural', name: '外围', kind: 'factory', hMin: 8, hMax: 30, block: [120, 220], density: 0.35 };

/* 把经纬度中心投影成世界坐标（需要传 route.projectLL）。
   返回带 x/z 的分区数组，按半径从大到小排序，便于「小区域优先命中」。 */
function resolveCityDistricts(route) {
  const out = [];
  for (const d of CITY_DISTRICTS) {
    const p = route.projectLL(d.lat, d.lon);
    out.push(Object.assign({}, d, { x: p.x, z: p.z }));
  }
  out.sort((a, b) => a.r - b.r);
  return out;
}

/* 给定世界坐标，返回所属分区；都不命中则返回 fallback。
   districts 必须已排序（resolveCityDistricts 已处理）。 */
function cityDistrictAt(x, z, districts) {
  if (!districts || !districts.length) return CITY_FALLBACK;
  for (const d of districts) {
    const dx = x - d.x, dz = z - d.z;
    if (dx * dx + dz * dz <= d.r * d.r) return d;
  }
  return CITY_FALLBACK;
}

/* 按权重从分区允许的原型里挑一个；rnd 传 0..1 的随机数，便于确定性重放 */
function cityPickProto(kind, rnd) {
  const list = CITY_KIND_PROTO[kind] || CITY_KIND_PROTO.mixed;
  let acc = 0;
  for (const [name, w] of list) {
    acc += w;
    if (rnd < acc) return name;
  }
  return list[list.length - 1][0];
}

/* 高度：分区基础高度 × 距中心衰减 × 随机抖动。
   rndH 0..1 控制高度落点，rndJ 0..1 控制抖动。 */
function cityBuildingHeight(district, dx, dz, rndH, rndJ) {
  const d = Math.hypot(dx, dz);
  const falloff = Math.max(0.25, 1 - Math.pow(d / (district.r || 1), 1.6));
  const base = district.hMin + (district.hMax - district.hMin) * rndH;
  const h = base * falloff * (0.75 + rndJ * 0.55);
  /* 防线：任何输入异常都不要让高度变成 NaN（NaN 会静默摧毁整个实例的变换矩阵） */
  if (!isFinite(h)) return Math.max(8, district.hMin || 10);
  return Math.max(district.hMin * 0.4, h);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CITY_DISTRICTS, CITY_KIND_PROTO, CITY_FALLBACK,
    resolveCityDistricts, cityDistrictAt, cityPickProto, cityBuildingHeight
  };
}
