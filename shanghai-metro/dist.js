
/* ===== 10_data.js ===== */
/* =====================================================================
   上海地铁 · 模拟驾驶  —  Shanghai Metro Driver Simulator
   单文件 WebGL 模拟器 / 非官方粉丝作品
   ===================================================================== */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ---------------------------------------------------------------- 工具 */
const PI = Math.PI, TAU = PI * 2, D2R = PI / 180;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const KMH = 1 / 3.6;
const pad2 = n => String(n).padStart(2, '0');
const fmtClock = sec => {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600) % 24, m = Math.floor(sec / 60) % 60, s = sec % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
};
const fmtClockShort = sec => {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600) % 24, m = Math.floor(sec / 60) % 60;
  return `${pad2(h)}:${pad2(m)}`;
};
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const RNG = mulberry32(20240918);

/* ---------------------------------------------------------------- 线路数据
   坐标取自公开地图的近似位置，用于重建线路走向与站间距。
   高程 y 为轨面相对地面（m），负值为地下。                              */
const LINES = [
  {
    id: 'L2', badge: '2', name: '2号线', en: 'Line 2', color: '#8CC63F',
    depot: '龙阳路车辆段', stock: 'AC-02 / AC-08', cars: 6,
    stations: [
      { zh: '南京东路', en: 'East Nanjing Road', lat: 31.23904, lon: 121.48005, y: -14, tr: ['10号线'], near: '外滩 · 南京路步行街' },
      { zh: '陆家嘴', en: 'Lujiazui', lat: 31.23991, lon: 121.49917, y: -16.5, tr: [], near: '东方明珠 · 上海中心' },
      { zh: '东昌路', en: 'Dongchang Road', lat: 31.23580, lon: 121.50673, y: -15, tr: [], near: '浦东南路' },
      { zh: '世纪大道', en: 'Century Avenue', lat: 31.23429, lon: 121.52308, y: -14, tr: ['4号线', '6号线', '9号线'], near: '世纪大道枢纽' },
      { zh: '上海科技馆', en: 'Shanghai Science & Technology Museum', lat: 31.22820, lon: 121.53806, y: -13, tr: [], near: '上海科技馆' },
      { zh: '世纪公园', en: 'Century Park', lat: 31.22083, lon: 121.54882, y: -12.5, tr: [], near: '世纪公园' },
      { zh: '龙阳路', en: 'Longyang Road', lat: 31.20486, lon: 121.55728, y: 9.5, tr: ['7号线', '磁浮线'], near: '磁浮龙阳路站' },
      { zh: '张江高科', en: 'Zhangjiang High Technology Park', lat: 31.20375, lon: 121.58651, y: 9.5, tr: [], near: '张江科学城' }
    ]
  },
  {
    id: 'L1', badge: '1', name: '1号线', en: 'Line 1', color: '#E4002B',
    depot: '梅陇车辆段', stock: 'AC-01 / AC-06', cars: 6,
    stations: [
      { zh: '徐家汇', en: 'Xujiahui', lat: 31.19365, lon: 121.43632, y: -13, tr: ['9号线', '11号线'], near: '徐家汇商圈' },
      { zh: '衡山路', en: 'Hengshan Road', lat: 31.20586, lon: 121.44610, y: -14.5, tr: [], near: '衡山路历史风貌区' },
      { zh: '常熟路', en: 'Changshu Road', lat: 31.21396, lon: 121.44894, y: -15.5, tr: ['7号线'], near: '淮海中路' },
      { zh: '陕西南路', en: 'South Shaanxi Road', lat: 31.21736, lon: 121.45867, y: -15.5, tr: ['10号线', '12号线'], near: '环贸 iapm' },
      { zh: '黄陂南路', en: 'South Huangpi Road', lat: 31.22567, lon: 121.46977, y: -16, tr: [], near: '新天地' },
      { zh: '人民广场', en: "People's Square", lat: 31.23296, lon: 121.46964, y: -16, tr: ['2号线', '8号线'], near: '人民广场 · 上海博物馆' },
      { zh: '新闸路', en: 'Xinzha Road', lat: 31.24043, lon: 121.46359, y: -15, tr: [], near: '苏州河' },
      { zh: '汉中路', en: 'Hanzhong Road', lat: 31.24750, lon: 121.45974, y: -14, tr: ['12号线', '13号线'], near: '苏州河北岸' },
      { zh: '上海火车站', en: 'Shanghai Railway Station', lat: 31.24960, lon: 121.45580, y: -13, tr: ['3号线', '4号线'], near: '铁路上海站' }
    ]
  },
  {
    id: 'L3', badge: '3', name: '3号线', en: 'Line 3', color: '#FFD100',
    depot: '石龙路车辆段', stock: 'AC-03', cars: 6,
    stations: [
      { zh: '中山公园', en: 'Zhongshan Park', lat: 31.21974, lon: 121.41988, y: 10, tr: ['2号线', '4号线'], near: '中山公园' },
      { zh: '金沙江路', en: 'Jinshajiang Road', lat: 31.22897, lon: 121.41116, y: 10, tr: ['13号线'], near: '环球港' },
      { zh: '曹杨路', en: 'Caoyang Road', lat: 31.23902, lon: 121.40955, y: 10, tr: ['11号线'], near: '曹杨新村' },
      { zh: '镇坪路', en: 'Zhenping Road', lat: 31.24611, lon: 121.42607, y: 10, tr: ['7号线'], near: '苏州河湾' },
      { zh: '中潭路', en: 'Zhongtan Road', lat: 31.25216, lon: 121.43613, y: 10, tr: [], near: '梦清园' },
      { zh: '上海火车站', en: 'Shanghai Railway Station', lat: 31.24960, lon: 121.45580, y: 10, tr: ['1号线', '4号线'], near: '铁路上海站' },
      { zh: '宝山路', en: 'Baoshan Road', lat: 31.25662, lon: 121.46669, y: 10, tr: ['4号线'], near: '虬江路' },
      { zh: '东宝兴路', en: 'Dongbaoxing Road', lat: 31.26059, lon: 121.47436, y: 10, tr: [], near: '多伦路文化街' },
      { zh: '虹口足球场', en: 'Hongkou Football Stadium', lat: 31.26891, lon: 121.47929, y: 10, tr: ['8号线'], near: '虹口足球场' },
      { zh: '赤峰路', en: 'Chifeng Road', lat: 31.27694, lon: 121.48724, y: 10, tr: [], near: '同济大学' },
      { zh: '大柏树', en: 'Dabaishu', lat: 31.28576, lon: 121.49391, y: 10, tr: [], near: '曲阳路' },
      { zh: '江湾镇', en: 'Jiangwan Town', lat: 31.29643, lon: 121.49173, y: 10, tr: [], near: '江湾体育场' }
    ]
  }
];

const ROUTES = [
  {
    id: 'l2e', line: 0, seg: '浦东段', segEn: 'PUDONG',
    title: '南京东路 → 张江高科',
    sub: '过江隧道 · 陆家嘴 · 张江高科',
    desc: '从南京路步行街下方出发，穿越黄浦江底隧道抵达陆家嘴，随后沿世纪大道东行，在世纪公园后出洞爬升至龙阳路高架，终到张江科学城。隧道与高架各半，是全网最具代表性的东西大动脉。',
    tags: ['过江隧道', '陆家嘴天际线', '出洞爬坡', '高架区段'],
    start: '08:12:00', dwell: 30, highlights: '黄浦江底 · 陆家嘴 · 张江'
  },
  {
    id: 'l1c', line: 1, seg: '市区段', segEn: 'DOWNTOWN',
    title: '徐家汇 → 上海火车站',
    sub: '全线地下 · 站距短 · 停站密集',
    desc: '贯穿上海老城核心的地下干线。八座车站平均站距不足 900 米，站台紧邻隧道曲线，制动点判断与停站精度是这条交路的核心考验。',
    tags: ['全线隧道', '短站距', '曲线进站', '高密度'],
    start: '07:48:00', dwell: 28, highlights: '徐家汇 · 人民广场 · 苏州河'
  },
  {
    id: 'l3n', line: 2, seg: '北段', segEn: 'NORTH',
    title: '中山公园 → 江湾镇',
    sub: '全线高架 · 城市景观 · 长区间',
    desc: '沿苏州河北岸架设的高架线，从中山公园一路向北，跨过苏州河湾，经过上海火车站与虹口足球场。夜间行车时，整座城市的灯火都在车窗之外。',
    tags: ['全线高架', '苏州河', '城市天际线', '夜景观光'],
    start: '19:26:00', dwell: 30, highlights: '苏州河 · 虹口足球场 · 江湾'
  }
];

/* 沿线地标（用于生成城市天际线） */
const LANDMARKS = [
  { id: 'pearl', zh: '东方明珠', lat: 31.23967, lon: 121.49976, h: 468, kind: 'pearl' },
  { id: 'shanghai', zh: '上海中心', lat: 31.23365, lon: 121.50551, h: 632, kind: 'twist' },
  { id: 'swfc', zh: '环球金融中心', lat: 31.23526, lon: 121.50732, h: 492, kind: 'swfc' },
  { id: 'jinmao', zh: '金茂大厦', lat: 31.23673, lon: 121.50531, h: 421, kind: 'jinmao' },
  { id: 'bund', zh: '外滩', lat: 31.24010, lon: 121.49020, h: 40, kind: 'bund' },
  { id: 'stadium', zh: '虹口足球场', lat: 31.27055, lon: 121.47812, h: 45, kind: 'stadium' },
  { id: 'museum', zh: '上海科技馆', lat: 31.21950, lon: 121.54190, h: 32, kind: 'museum' }
];

/* 黄浦江中心线（纬度, 经度） */
const RIVER_PATH = [
  [31.310, 121.501], [31.285, 121.499], [31.262, 121.496], [31.245, 121.4935],
  [31.230, 121.4918], [31.212, 121.4965], [31.196, 121.5035], [31.175, 121.5095],
  [31.150, 121.5155], [31.120, 121.5225]
];
const RIVER_WIDTH = 430;

/* 参考运行时分：与物理模型一致的牵引-制动曲线 */
const VMAX = 80;            // km/h
const ACC_MAX = 1.0;        // m/s^2 牵引
const BRK_SRV = 1.0;        // m/s^2 常用制动
const BRK_EMG = 1.35;       // m/s^2 紧急制动
const JERK_LIMIT = 0.75;    // m/s^3 参考值
const CAR_LEN = 22.8;       // A 型车车长
const CAR_W = 3.0;          // 车宽
const CAR_GAP = 0.35;       // 车钩间隙
const CAR_PITCH = CAR_LEN + CAR_GAP;
const PLATFORM_HALF = 70;   // 站台半长，停车标位于 +70

function estimateRunTime(dist, vmaxKmh = VMAX) {
  const v = vmaxKmh * KMH;
  const da = v * v / (2 * ACC_MAX), db = v * v / (2 * BRK_SRV);
  if (da + db < dist) return v / ACC_MAX + v / BRK_SRV + (dist - da - db) / v;
  const vp = Math.sqrt(2 * dist * ACC_MAX * BRK_SRV / (ACC_MAX + BRK_SRV));
  return vp / ACC_MAX + vp / BRK_SRV;
}


/* ===== 20_route.js ===== */
/* ================================================================
   线路几何：经纬度 → 世界坐标，样条中心线，纵断面，曲线限速，时刻表
   ================================================================ */
class RoutePath {
  constructor(def, line) {
    this.def = def;
    this.line = line;
    const raw = line.stations;
    const lat0 = raw.reduce((a, s) => a + s.lat, 0) / raw.length;
    const lon0 = raw.reduce((a, s) => a + s.lon, 0) / raw.length;
    this.origin = { lat: lat0, lon: lon0 };
    this.KX = 111320 * Math.cos(lat0 * D2R);
    this.KZ = 111132;

    const pts = raw.map(s => {
      const p = this.project(s.lat, s.lon);
      return new THREE.Vector2(p.x, p.z);
    });
    this.rawStations = raw;

    /* —— 控制点：站间加入带横向偏移的中间点，形成自然缓和曲线 —— */
    const cps = [];
    const preDir = pts[0].clone().sub(pts[1]).normalize().multiplyScalar(240);
    cps.push(new THREE.Vector3(pts[0].x + preDir.x, 0, pts[0].y + preDir.y));
    for (let i = 0; i < pts.length; i++) {
      cps.push(new THREE.Vector3(pts[i].x, 0, pts[i].y));
      if (i < pts.length - 1) {
        const dx = pts[i + 1].x - pts[i].x, dz = pts[i + 1].y - pts[i].y;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len, nz = dx / len;
        const amp = Math.min(52, len * 0.05) * (i % 2 ? -1 : 1) * (0.75 + 0.35 * RNG());
        cps.push(new THREE.Vector3(pts[i].x + dx * 0.34 + nx * amp, 0, pts[i].y + dz * 0.34 + nz * amp));
        cps.push(new THREE.Vector3(pts[i].x + dx * 0.68 + nx * amp, 0, pts[i].y + dz * 0.68 + nz * amp));
      }
    }
    const postDir = pts[pts.length - 1].clone().sub(pts[pts.length - 2]).normalize().multiplyScalar(240);
    cps.push(new THREE.Vector3(pts[pts.length - 1].x + postDir.x, 0, pts[pts.length - 1].y + postDir.y));

    const curve = new THREE.CatmullRomCurve3(cps, false, 'centripetal');
    curve.arcLengthDivisions = 1600;
    this.curve = curve;
    this.length = curve.getLength();
    this.ds = 2.0;
    const N = Math.ceil(this.length / this.ds);
    this.ds = this.length / N;
    this.N = N;
    const flat = curve.getSpacedPoints(N);

    /* —— 车站里程 —— */
    this.stationS = [];
    this.stationY = raw.map(s => s.y);
    for (let k = 0; k < pts.length; k++) {
      const target = new THREE.Vector3(pts[k].x, 0, pts[k].y);
      let best = 0, bd = Infinity;
      for (let i = 0; i <= N; i++) {
        const d = flat[i].distanceToSquared(target);
        if (d < bd) { bd = d; best = i; }
      }
      const i0 = Math.max(0, best - 1), i1 = Math.min(N, best + 1);
      const seg = flat[i1].clone().sub(flat[i0]);
      const sl = seg.length() || 1;
      const proj = clamp(target.clone().sub(flat[i0]).dot(seg) / sl, 0, sl);
      this.stationS.push((i0 * this.ds) + proj);
    }

    /* —— 纵断面 —— */
    const eS = this.stationS, eY = this.stationY;
    const elevAt = (s) => {
      if (s <= eS[0]) return eY[0];
      for (let i = 0; i < eS.length - 1; i++) {
        if (s <= eS[i + 1]) {
          const gap = eS[i + 1] - eS[i];
          const ramp = Math.min(900, gap * 0.8);
          const start = eS[i] + (gap - ramp) / 2;
          return lerp(eY[i], eY[i + 1], smoothstep((s - start) / ramp));
        }
      }
      return eY[eY.length - 1];
    };
    this.elevAt = elevAt;

    /* —— 三维采样 —— */
    this.P = []; this.T = []; this.R = []; this.U = [];
    this.G = new Float32Array(N + 1);
    this.K = new Float32Array(N + 1);
    this.S = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const s = i * this.ds;
      this.S[i] = s;
      this.P.push(new THREE.Vector3(flat[i].x, elevAt(s), flat[i].z));
    }
    const UP = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i <= N; i++) {
      const a = this.P[Math.max(0, i - 1)], b = this.P[Math.min(N, i + 1)];
      const t = b.clone().sub(a).normalize();
      const r = new THREE.Vector3().crossVectors(UP, t).normalize();
      const u = new THREE.Vector3().crossVectors(t, r).normalize();
      this.T.push(t); this.R.push(r); this.U.push(u);
      if (i > 0 && i < N) this.G[i] = (this.P[i + 1].y - this.P[i - 1].y) / (2 * this.ds);
    }
    this.G[0] = this.G[1]; this.G[N] = this.G[N - 1];

    /* —— 曲率半径与限速 —— */
    this.LIM = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) {
      let lim = VMAX;
      if (i > 0 && i < N) {
        const a = this.T[i - 1], b = this.T[i + 1];
        const ang = Math.acos(clamp(a.dot(b), -1, 1));
        const k = ang / (2 * this.ds);
        this.K[i] = k;
        const R = k > 1e-6 ? 1 / k : 1e6;
        lim = R > 760 ? 80 : R > 560 ? 72 : R > 420 ? 62 : R > 300 ? 52 : 45;
      } else { this.K[i] = 0; }
      this.LIM[i] = lim;
    }

    /* —— 车站附加信息 —— */
    this.stations = raw.map((st, i) => {
      const p = this.project(st.lat, st.lon);
      const s = this.stationS[i];
      const f = this.frameAt(s);
      return {
        ...st, index: i, s, stopS: s + 70, platformLen: 140,
        x: p.x, z: p.z, frame: f,
        dist: i > 0 ? s - this.stationS[i - 1] : 0
      };
    });

    /* —— 时刻表 —— */
    this.buildSchedule();

    /* —— 道岔/信号机位置 —— */
    this.signals = [];
    for (let s = 320; s < this.length - 320; s += 520) {
      const f = this.frameAt(s);
      this.signals.push({ s, pos: this.pointAt(s, 3.6), tan: f.tan });
    }
  }

  project(lat, lon) {
    return {
      x: (lon - this.origin.lon) * this.KX,
      z: (this.origin.lat - lat) * this.KZ
    };
  }
  projectLL(lat, lon) { return this.project(lat, lon); }

  frameAt(s) {
    const f = clamp(s / this.ds, 0, this.N - 1e-4);
    const i = Math.floor(f), t = f - i;
    const p = new THREE.Vector3().lerpVectors(this.P[i], this.P[i + 1], t);
    const tan = new THREE.Vector3().lerpVectors(this.T[i], this.T[i + 1], t).normalize();
    const right = new THREE.Vector3().lerpVectors(this.R[i], this.R[i + 1], t).normalize();
    const up = new THREE.Vector3().crossVectors(tan, right).normalize();
    return { pos: p, tan, right, up };
  }
  pointAt(s, lateral = 0, vert = 0) {
    const f = clamp(s / this.ds, 0, this.N - 1e-4);
    const i = Math.floor(f), t = f - i;
    return new THREE.Vector3().lerpVectors(this.P[i], this.P[i + 1], t)
      .addScaledVector(this.R[i], lateral).addScaledVector(new THREE.Vector3(0, 1, 0), vert);
  }
  tangentAt(s) {
    const i = clamp(Math.round(s / this.ds), 0, this.N);
    return this.T[i].clone();
  }
  gradeAt(s) {
    const i = clamp(Math.round(s / this.ds), 0, this.N);
    return this.G[i];
  }
  curvatureAt(s) {
    const i = clamp(Math.round(s / this.ds), 0, this.N);
    return this.K[i];
  }
  /** 静态限速（含 400m 前瞻制动曲线），返回 km/h */
  atpLimit(s, v) {
    let lim = 999;
    const base = this.LIM[clamp(Math.round(s / this.ds), 0, this.N)];
    lim = base;
    const look = 460;
    for (let d = 0; d <= look; d += 20) {
      const idx = clamp(Math.round((s + d) / this.ds), 0, this.N);
      const vl = this.LIM[idx];
      if (vl < lim) {
        const allow = Math.sqrt(vl * vl + 2 * 0.85 * d) * 3.6;
        lim = Math.min(lim, allow);
      }
    }
    return lim;
  }
  buildSchedule() {
    const st = this.stations;
    const startSec = parseClock(this.def.start);
    st[0].schArr = startSec - this.def.dwell;
    st[0].schDep = startSec;
    for (let i = 1; i < st.length; i++) {
      const run = estimateRunTime(Math.max(60, st[i].stopS - st[i - 1].stopS)) + 6;
      st[i].schArr = st[i - 1].schDep + run;
      st[i].schDep = st[i].schArr + this.def.dwell;
    }
    this.startSec = startSec;
  }
  totalMeters() { return this.stations[this.stations.length - 1].stopS - this.stations[0].stopS; }
}

function parseClock(str) {
  const [h, m, s] = str.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
}


/* ===== 30_materials.js ===== */
/* ================================================================
   程序化纹理与材质
   ================================================================ */
const TEX_CACHE = new Map();
const MAT = {};

function cv2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function toTex(canvas, rx = 1, ry = 1, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
function noiseFill(ctx, w, h, n, col, aMin, aMax) {
  ctx.save();
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    const s = Math.random() * 2.2 + 0.4;
    ctx.globalAlpha = aMin + Math.random() * (aMax - aMin);
    ctx.fillStyle = col;
    ctx.fillRect(x, y, s, s);
  }
  ctx.restore();
}

/* ---------------- 混凝土 ---------------- */
function texConcrete(base = '#6a6d70', dark = 0.1, seams = 0) {
  const key = 'conc' + base + dark + seams;
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const [c, x] = cv2d(512, 512);
  x.fillStyle = base; x.fillRect(0, 0, 512, 512);
  // 大块色斑
  for (let i = 0; i < 26; i++) {
    const g = x.createRadialGradient(Math.random() * 512, Math.random() * 512, 4, Math.random() * 512, Math.random() * 512, 60 + Math.random() * 110);
    g.addColorStop(0, `rgba(0,0,0,${0.02 + Math.random() * 0.05})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  }
  noiseFill(x, 512, 512, 5200, '#000', 0.02, 0.07);
  noiseFill(x, 512, 512, 2600, '#fff', 0.015, 0.05);
  // 模板拼缝
  x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const y = 64 + i * 128;
    x.beginPath(); x.moveTo(0, y); x.lineTo(512, y); x.stroke();
  }
  if (seams) {
    x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 2.5;
    for (let y = 0; y < 512; y += seams) { x.beginPath(); x.moveTo(0, y); x.lineTo(512, y); x.stroke(); }
    x.strokeStyle = 'rgba(255,255,255,.05)'; x.lineWidth = 1;
    for (let y = 2; y < 512; y += seams) { x.beginPath(); x.moveTo(0, y); x.lineTo(512, y); x.stroke(); }
  }
  const t = toTex(c);
  TEX_CACHE.set(key, t);
  return t;
}

/* ---------------- 道砟 / 道床 ---------------- */
function texBallast() {
  if (TEX_CACHE.has('ballast')) return TEX_CACHE.get('ballast');
  const [c, x] = cv2d(256, 256);
  x.fillStyle = '#37393b'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2400; i++) {
    const g = 40 + Math.random() * 55;
    x.fillStyle = `rgba(${g},${g + 2},${g + 3},${0.5 + Math.random() * 0.5})`;
    const s = 1 + Math.random() * 3;
    x.beginPath(); x.ellipse(Math.random() * 256, Math.random() * 256, s, s * 0.8, Math.random() * 3, 0, TAU); x.fill();
  }
  noiseFill(x, 256, 256, 1500, '#000', 0.05, 0.18);
  const t = toTex(c, 1, 1);
  TEX_CACHE.set('ballast', t);
  return t;
}

/* ---------------- 站台地面 ---------------- */
function texPlatformFloor() {
  if (TEX_CACHE.has('pfloor')) return TEX_CACHE.get('pfloor');
  const [c, x] = cv2d(512, 512);
  x.fillStyle = '#8e9398'; x.fillRect(0, 0, 512, 512);
  const tw = 128, th = 128;
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    const v = 138 + Math.random() * 22;
    x.fillStyle = `rgb(${v},${v + 3},${v + 6})`;
    x.fillRect(gx * tw + 2, gy * th + 2, tw - 4, th - 4);
    x.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.04})`;
    x.fillRect(gx * tw + 2, gy * th + 2, tw - 4, 6);
  }
  x.strokeStyle = 'rgba(0,0,0,.22)'; x.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    x.beginPath(); x.moveTo(i * tw, 0); x.lineTo(i * tw, 512); x.stroke();
    x.beginPath(); x.moveTo(0, i * th); x.lineTo(512, i * th); x.stroke();
  }
  noiseFill(x, 512, 512, 3000, '#000', 0.02, 0.06);
  const t = toTex(c, 1, 1);
  TEX_CACHE.set('pfloor', t);
  return t;
}

/* ---------------- 盲道 ---------------- */
function texTactile() {
  if (TEX_CACHE.has('tactile')) return TEX_CACHE.get('tactile');
  const [c, x] = cv2d(128, 128);
  x.fillStyle = '#d8a520'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = 'rgba(0,0,0,.18)';
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    x.beginPath(); x.arc(16 + gx * 32, 16 + gy * 32, 8, 0, TAU); x.fill();
  }
  x.fillStyle = 'rgba(255,255,255,.22)';
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    x.beginPath(); x.arc(15 + gx * 32, 15 + gy * 32, 6, 0, TAU); x.fill();
  }
  const t = toTex(c, 1, 1);
  TEX_CACHE.set('tactile', t);
  return t;
}

/* ---------------- 楼宇立面 ---------------- */
function texBuilding(variant = 0, floors = 16) {
  const key = 'bld' + variant + '_' + floors;
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const W = 256, H = 512;
  const [c, x] = cv2d(W, H);
  const [ec, ex] = cv2d(W, H);
  const facades = ['#242a31', '#2c3339', '#1f252b'];
  const base = facades[variant % 3];
  x.fillStyle = base; x.fillRect(0, 0, W, H);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);
  // 立面竖向分隔
  x.fillStyle = 'rgba(255,255,255,.035)';
  for (let i = 0; i < 4; i++) x.fillRect(i * 64 + 6, 0, 3, H);
  const cols = 6;
  const rows = floors;
  const cw = W / cols, ch = H / rows;
  const winW = cw * 0.58, winH = ch * 0.56;
  for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
    const px = col * cw + (cw - winW) / 2;
    const py = r * ch + (ch - winH) / 2;
    const lit = Math.random() < (variant === 2 ? 0.42 : 0.3);
    if (lit) {
      const warm = Math.random() < 0.72;
      const g = x.createLinearGradient(px, py, px, py + winH);
      g.addColorStop(0, warm ? '#ffe3ae' : '#dff0ff');
      g.addColorStop(1, warm ? '#c79352' : '#8fb6cc');
      x.fillStyle = g; x.fillRect(px, py, winW, winH);
      ex.fillStyle = warm ? 'rgba(255,214,150,.95)' : 'rgba(200,230,255,.9)';
      ex.fillRect(px, py, winW, winH);
    } else {
      x.fillStyle = 'rgba(9,13,18,.92)'; x.fillRect(px, py, winW, winH);
      x.fillStyle = 'rgba(120,160,190,.08)';
      x.fillRect(px, py, winW, winH * 0.4);
    }
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(px, py + winH, winW, 2);
  }
  // 顶部设备层
  x.fillStyle = 'rgba(255,255,255,.05)'; x.fillRect(0, 0, W, 10);
  const t = toTex(c, 1, 1);
  const e = toTex(ec, 1, 1);
  const out = { map: t, emissive: e };
  TEX_CACHE.set(key, out);
  return out;
}

/* ---------------- 车厢侧面涂装 ---------------- */
function texCarSide(color, open = false, mirror = false, lineNo = '02') {
  const key = `car_${color}_${open}_${mirror}_${lineNo}`;
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const W = 2048, H = 512;
  const [c, x] = cv2d(W, H);
  if (mirror) { x.translate(W, 0); x.scale(-1, 1); }
  // 车体
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#fbfcfb'); g.addColorStop(0.72, '#eef0ef'); g.addColorStop(1, '#d6d9d8');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // 顶部阴影
  x.fillStyle = 'rgba(0,0,0,.16)'; x.fillRect(0, 0, W, 12);
  // 裙板
  x.fillStyle = '#3c4246'; x.fillRect(0, 448, W, 64);
  x.fillStyle = 'rgba(255,255,255,.1)'; x.fillRect(0, 448, W, 3);
  // 色带
  x.fillStyle = color; x.fillRect(0, 402, W, 40);
  x.fillStyle = 'rgba(255,255,255,.28)'; x.fillRect(0, 402, W, 3);
  // 窗带
  x.fillStyle = '#141a1f'; x.fillRect(20, 128, W - 40, 214);
  // 窗
  const winW = 138, gap = 46;
  for (let i = 0; i < 12; i++) {
    const px = 34 + i * (winW + gap);
    if (px + winW > W - 20) break;
    const wg = x.createLinearGradient(px, 140, px + winW, 330);
    wg.addColorStop(0, '#2b3d4b'); wg.addColorStop(0.45, '#101820'); wg.addColorStop(1, '#1b2a35');
    x.fillStyle = wg;
    x.beginPath(); x.roundRect(px, 140, winW, 190, 12); x.fill();
    x.strokeStyle = 'rgba(255,255,255,.16)'; x.lineWidth = 2;
    x.beginPath(); x.roundRect(px, 140, winW, 190, 12); x.stroke();
    x.fillStyle = 'rgba(180,215,235,.10)';
    x.beginPath(); x.moveTo(px + 10, 330); x.lineTo(px + 62, 140); x.lineTo(px + 96, 140); x.lineTo(px + 44, 330); x.closePath(); x.fill();
  }
  // 车门
  const doorCenters = [-7.6, -2.6, 2.6, 7.6];
  for (const zc of doorCenters) {
    const px = ((zc + 11.4) / 22.8) * W;
    const w = 126, h = 300, y0 = 130;
    // 门框
    x.fillStyle = '#c9cdcc'; x.fillRect(px - w / 2 - 3, y0 - 3, w + 6, h + 4);
    if (open) {
      x.fillStyle = '#0a0d0f'; x.fillRect(px - w / 2, y0, w, h);
      x.fillStyle = 'rgba(90,110,125,.35)'; x.fillRect(px - w / 2, y0 + h - 34, w, 34);
    } else {
      const dg = x.createLinearGradient(px - w / 2, 0, px + w / 2, 0);
      dg.addColorStop(0, '#e8ebea'); dg.addColorStop(.5, '#f4f6f5'); dg.addColorStop(1, '#dfe2e1');
      x.fillStyle = dg; x.fillRect(px - w / 2, y0, w, h);
      // 门缝
      x.fillStyle = '#5b6469'; x.fillRect(px - 1.5, y0, 3, h);
      // 门玻璃
      x.fillStyle = '#16212a';
      x.beginPath(); x.roundRect(px - w / 2 + 14, y0 + 22, w / 2 - 20, 108, 8); x.fill();
      x.beginPath(); x.roundRect(px + 6, y0 + 22, w / 2 - 20, 108, 8); x.fill();
      // 门下部
      x.fillStyle = 'rgba(0,0,0,.06)'; x.fillRect(px - w / 2 + 8, y0 + 150, w - 16, 130);
    }
    x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 1.5;
    x.strokeRect(px - w / 2 - 3, y0 - 3, w + 6, h + 4);
  }
  // 编号 / 标识
  x.fillStyle = '#2a3034'; x.font = '600 26px "Microsoft YaHei",sans-serif';
  x.fillText('上海地铁', 1520, 96);
  x.fillStyle = color; x.fillRect(1490, 108, 132, 6);
  x.fillStyle = '#4a5257'; x.font = '500 22px ui-monospace,monospace';
  x.fillText(`SHANGHAI METRO  ·  ${lineNo}A014`, 1460, 140);
  x.fillStyle = '#7a8288'; x.font = '500 20px ui-monospace,monospace';
  x.fillText('A型车  定员 310', 150, 476);
  // 车身分色线
  x.strokeStyle = 'rgba(0,0,0,.08)'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(0, 126); x.lineTo(W, 126); x.stroke();
  const t = toTex(c, 1, 1);
  TEX_CACHE.set(key, t);
  return t;
}

/* ---------------- 站名牌 ---------------- */
function texStationSign(station, line, dirTo) {
  const key = 'sign_' + line.id + '_' + station.zh;
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const W = 1536, H = 384;
  const [c, x] = cv2d(W, H);
  x.fillStyle = '#f6f7f6'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#e9ebe9'; x.fillRect(0, H - 26, W, 26);
  // 线路色块
  x.fillStyle = line.color; x.fillRect(0, 0, 210, H);
  x.fillStyle = '#fff'; x.font = '800 132px "Microsoft YaHei",sans-serif';
  x.textAlign = 'center'; x.fillText(line.badge, 105, 208);
  x.font = '600 34px "Microsoft YaHei",sans-serif';
  x.fillText(line.name, 105, 282);
  // 站名
  x.textAlign = 'left';
  x.fillStyle = '#15181a';
  x.font = '800 132px "PingFang SC","Microsoft YaHei",sans-serif';
  x.fillText(station.zh, 260, 190);
  x.fillStyle = '#586468';
  x.font = '500 40px "Segoe UI",Helvetica,sans-serif';
  x.fillText(station.en.toUpperCase(), 264, 258);
  // 方向
  x.fillStyle = '#2b3236'; x.font = '600 40px "Microsoft YaHei",sans-serif';
  x.textAlign = 'right';
  x.fillText(`往 ${dirTo}`, W - 70, 150);
  x.fillStyle = '#7a868b'; x.font = '500 32px "Microsoft YaHei",sans-serif';
  x.fillText('TO ' + dirTo, W - 70, 210);
  x.strokeStyle = '#c9cfd1'; x.lineWidth = 4; x.strokeRect(2, 2, W - 4, H - 4);
  const t = toTex(c, 1, 1);
  TEX_CACHE.set(key, t);
  return t;
}

/* ---------------- 线路图 ---------------- */
function texLineDiagram(line, currentIdx) {
  const key = 'diag_' + line.id;
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const W = 2048, H = 320;
  const [c, x] = cv2d(W, H);
  x.fillStyle = '#f4f6f5'; x.fillRect(0, 0, W, H);
  const n = line.stations.length;
  const x0 = 90, x1 = W - 90;
  const y = 150;
  x.strokeStyle = line.color; x.lineWidth = 18; x.lineCap = 'round';
  x.beginPath(); x.moveTo(x0, y); x.lineTo(x1, y); x.stroke();
  for (let i = 0; i < n; i++) {
    const px = x0 + (x1 - x0) * (i / (n - 1));
    x.fillStyle = '#fff'; x.beginPath(); x.arc(px, y, 13, 0, TAU); x.fill();
    x.strokeStyle = line.color; x.lineWidth = 7; x.beginPath(); x.arc(px, y, 13, 0, TAU); x.stroke();
    x.save(); x.translate(px, y + 64); x.rotate(-PI / 5.2);
    x.fillStyle = '#2a3236'; x.font = '600 27px "Microsoft YaHei",sans-serif'; x.textAlign = 'left';
    x.fillText(line.stations[i].zh, 0, 0);
    x.fillStyle = '#8c979c'; x.font = '500 17px "Segoe UI",sans-serif';
    x.fillText(line.stations[i].en, 0, 26);
    x.restore();
  }
  x.fillStyle = line.color; x.fillRect(0, 0, 26, H);
  const t = toTex(c, 1, 1);
  TEX_CACHE.set(key, t);
  return t;
}

/* ---------------- 广告 ---------------- */
function texAd(i) {
  const key = 'ad' + i;
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const W = 512, H = 256;
  const [c, x] = cv2d(W, H);
  const pal = [
    ['#12232e', '#2e6f7d', '#9fe8d8'],
    ['#2a1420', '#7b2c46', '#ffb7a8'],
    ['#101a2c', '#2c4b8a', '#a8c8ff'],
    ['#1c2412', '#4c6b25', '#d8f0a0']
  ][i % 4];
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, pal[0]); g.addColorStop(1, pal[1]);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.globalAlpha = 0.25;
  for (let k = 0; k < 5; k++) {
    x.fillStyle = pal[2];
    x.beginPath(); x.arc(Math.random() * W, Math.random() * H, 30 + Math.random() * 80, 0, TAU); x.fill();
  }
  x.globalAlpha = 1;
  x.fillStyle = '#fff'; x.font = '800 44px "Microsoft YaHei",sans-serif';
  x.fillText(['文明乘车', '安全出行', '低碳生活', '城市脉搏'][i % 4], 34, 118);
  x.fillStyle = pal[2]; x.font = '500 22px "Microsoft YaHei",sans-serif';
  x.fillText(['先下后上 · 有序排队', '请勿倚靠车门', '地铁让城市更美好', '每一程 都值得'][i % 4], 36, 160);
  x.fillStyle = 'rgba(255,255,255,.5)'; x.font = '600 14px ui-monospace,monospace';
  x.fillText('SHANGHAI METRO  ·  PUBLIC SERVICE', 36, 214);
  const t = toTex(c, 1, 1);
  TEX_CACHE.set(key, t);
  return t;
}

/* ---------------- 目的地 LED ---------------- */
function texDestination(line, station, arrow = true) {
  const key = 'dest_' + station.zh + line.id;
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const W = 512, H = 128;
  const [c, x] = cv2d(W, H);
  x.fillStyle = '#080a08'; x.fillRect(0, 0, W, H);
  x.fillStyle = line.color; x.fillRect(0, 0, 8, H);
  x.fillStyle = '#ffb733'; x.font = '700 44px "Microsoft YaHei",sans-serif';
  x.textAlign = 'center'; x.fillText(station.zh, W / 2 + 8, 62);
  x.fillStyle = '#ff8a1f'; x.font = '600 24px "Segoe UI",sans-serif';
  x.fillText(station.en.toUpperCase(), W / 2 + 8, 96);
  if (arrow) { x.fillStyle = '#ffb733'; x.font = '700 34px sans-serif'; x.fillText('→', W - 26, 72); }
  const t = toTex(c, 1, 1);
  TEX_CACHE.set(key, t);
  return t;
}

/* ---------------- 天空 ---------------- */
const THEMES = {
  day: {
    top: new THREE.Color('#3f7fc4'), horizon: new THREE.Color('#cfe3f0'), ground: new THREE.Color('#9fb0bb'),
    sun: new THREE.Color('#fff3d6'), sunDir: new THREE.Vector3(-0.45, 0.72, 0.52), sunSize: 0.9993,
    amb: 1.15, hemi: 1.0, sunI: 2.3, fog: '#bcd3e2', fogD: 0.00028,
    bloom: 0.18, exposure: 1.0, windowGlow: 0.06, headlight: 0.35
  },
  dusk: {
    top: new THREE.Color('#101d33'), horizon: new THREE.Color('#e79a63'), ground: new THREE.Color('#4a4a4e'),
    sun: new THREE.Color('#ffb473'), sunDir: new THREE.Vector3(-0.88, 0.10, 0.46), sunSize: 0.9989,
    amb: 0.55, hemi: 0.55, sunI: 1.25, fog: '#6d6a70', fogD: 0.00042,
    bloom: 0.62, exposure: 1.02, windowGlow: 0.85, headlight: 1.0
  },
  night: {
    top: new THREE.Color('#02050d'), horizon: new THREE.Color('#0e1a28'), ground: new THREE.Color('#05080c'),
    sun: new THREE.Color('#a9c4e0'), sunDir: new THREE.Vector3(0.4, 0.6, -0.5), sunSize: 0.9995,
    amb: 0.16, hemi: 0.18, sunI: 0.28, fog: '#05090f', fogD: 0.0005,
    bloom: 0.95, exposure: 1.1, windowGlow: 1.5, headlight: 1.4
  }
};

function createSky(theme) {
  const geo = new THREE.SphereGeometry(4200, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: theme.top }, horizon: { value: theme.horizon }, ground: { value: theme.ground },
      sunColor: { value: theme.sun }, sunDir: { value: theme.sunDir.clone().normalize() },
      sunSize: { value: theme.sunSize }
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top, horizon, ground, sunColor; uniform vec3 sunDir; uniform float sunSize;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(horizon, top, pow(clamp(h,0.0,1.0), 0.55));
        col = mix(ground, col, smoothstep(-0.12, 0.02, h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * pow(s, 2200.0) * 3.2;
        col += sunColor * pow(s, 22.0) * 0.14;
        float band = exp(-abs(h) * 26.0);
        col += horizon * band * 0.10;
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = -1000;
  return m;
}


/* ===== 40_world.js ===== */
/* ================================================================
   世界构建 A：材质初始化、轨道、隧道、高架、地面、城市、地标
   ================================================================ */
function initMaterials(renderer, theme) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const setAniso = t => { t.anisotropy = aniso; return t; };

  MAT.tunnel = new THREE.MeshStandardMaterial({
    map: setAniso(texConcrete('#5d6265', 0.1, 256)), roughness: 0.94, metalness: 0.02,
    color: 0xffffff, side: THREE.DoubleSide, emissive: new THREE.Color('#1a1a1a'), emissiveIntensity: 0.55
  });
  MAT.tunnel.map.repeat.set(1, 1);
  MAT.stationWall = new THREE.MeshStandardMaterial({
    map: setAniso(texConcrete('#93979a', 0.06, 0)), roughness: 0.82, metalness: 0.04,
    color: 0xffffff, side: THREE.DoubleSide, emissive: new THREE.Color('#22221f'), emissiveIntensity: 0.5
  });
  MAT.concrete = new THREE.MeshStandardMaterial({
    map: setAniso(texConcrete('#77797b', 0.08, 0)), roughness: 0.9, metalness: 0.03,
    side: THREE.DoubleSide, emissive: new THREE.Color('#111'), emissiveIntensity: 0.35
  });
  MAT.concreteDark = new THREE.MeshStandardMaterial({
    map: setAniso(texConcrete('#4c5053', 0.1, 0)), roughness: 0.95, metalness: 0.02,
    side: THREE.DoubleSide, emissive: new THREE.Color('#0d0d0d'), emissiveIntensity: 0.4
  });
  MAT.ballast = new THREE.MeshStandardMaterial({
    map: setAniso(texBallast()), roughness: 0.98, metalness: 0.0, color: 0xbfc2c2, side: THREE.DoubleSide,
    emissive: new THREE.Color('#101010'), emissiveIntensity: 0.4
  });
  MAT.ballast.map.repeat.set(1, 1);
  MAT.rail = new THREE.MeshStandardMaterial({ color: 0xd7dade, roughness: 0.28, metalness: 0.92, envMapIntensity: 1.2 });
  MAT.sleeper = new THREE.MeshStandardMaterial({ color: 0x9a9d9c, roughness: 0.9, metalness: 0.05 });
  MAT.platform = new THREE.MeshStandardMaterial({ map: setAniso(texPlatformFloor()), roughness: 0.72, metalness: 0.06, color: 0xd7dade });
  MAT.platform.map.repeat.set(2, 24);
  MAT.tactile = new THREE.MeshStandardMaterial({ map: setAniso(texTactile()), roughness: 0.8, metalness: 0.02, color: 0xffffff });
  MAT.tactile.map.repeat.set(2, 90);
  MAT.safety = new THREE.MeshStandardMaterial({ color: 0xe8b93a, roughness: 0.7, metalness: 0.05 });
  MAT.darkMetal = new THREE.MeshStandardMaterial({ color: 0x2b3237, roughness: 0.5, metalness: 0.7 });
  MAT.metal = new THREE.MeshStandardMaterial({ color: 0x9aa4aa, roughness: 0.35, metalness: 0.85, envMapIntensity: 1.0 });
  MAT.white = new THREE.MeshStandardMaterial({ color: 0xeef1f1, roughness: 0.5, metalness: 0.05 });
  MAT.psdGlass = new THREE.MeshPhysicalMaterial({
    color: 0x9fc2cf, roughness: 0.06, metalness: 0.25, transparent: true, opacity: 0.30,
    envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false
  });
  MAT.water = new THREE.MeshStandardMaterial({ color: 0x0c2230, roughness: 0.08, metalness: 0.9, envMapIntensity: 1.4 });
  MAT.tree = new THREE.MeshStandardMaterial({ color: 0x1e3320, roughness: 0.95 });
  MAT.trunk = new THREE.MeshStandardMaterial({ color: 0x322a24, roughness: 0.9 });
  MAT.ground = new THREE.MeshStandardMaterial({ map: setAniso(texGround()), roughness: 0.95, metalness: 0.02, color: 0x8a8f90 });
  MAT.ground.map.repeat.set(26, 26);

  MAT.strip = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.45, 2.1), toneMapped: false, fog: false });
  MAT.stripCool = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 2.4, 2.7), toneMapped: false, fog: false });
  MAT.lampWarm = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.6, 1.8), toneMapped: false });
  MAT.lampRed = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 0.25, 0.2), toneMapped: false });
  MAT.lampGreen = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.6, 1.1), toneMapped: false });
  MAT.exitSign = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 1.9, 1.0), toneMapped: false, side: THREE.DoubleSide });

  MAT.bld = [];
  for (let v = 0; v < 3; v++) {
    for (let f = 0; f < 3; f++) {
      const t = texBuilding(v, [10, 20, 34][f]);
      MAT.bld.push(new THREE.MeshStandardMaterial({
        map: setAniso(t.map), emissiveMap: setAniso(t.emissive), emissive: 0xffffff,
        emissiveIntensity: theme.windowGlow, roughness: 0.82, metalness: 0.15, color: 0xffffff
      }));
    }
  }
}

function texGround() {
  if (TEX_CACHE.has('ground')) return TEX_CACHE.get('ground');
  const [c, x] = cv2d(512, 512);
  x.fillStyle = '#4e5352'; x.fillRect(0, 0, 512, 512);
  // 街区
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    const v = 62 + Math.random() * 16;
    x.fillStyle = `rgb(${v},${v + 3},${v + 2})`;
    x.fillRect(gx * 128 + 10, gy * 128 + 10, 108, 108);
  }
  // 道路
  x.fillStyle = '#3a3e3f';
  for (let i = 0; i < 4; i++) { x.fillRect(i * 128, 0, 20, 512); x.fillRect(0, i * 128, 512, 20); }
  x.fillStyle = 'rgba(210,200,160,.25)';
  for (let i = 0; i < 4; i++) {
    x.fillRect(i * 128 + 9, 0, 2, 512);
    x.fillRect(0, i * 128 + 9, 512, 2);
  }
  noiseFill(x, 512, 512, 6000, '#000', 0.02, 0.09);
  noiseFill(x, 512, 512, 2000, '#fff', 0.01, 0.04);
  const t = toTex(c, 1, 1);
  TEX_CACHE.set('ground', t);
  return t;
}

/* ---------------- 沿线路挤出截面 ---------------- */
function extrudeAlong(route, i0, i1, profile, mat, opts = {}) {
  const { step = 2, uScale = 6, vScale = 8, closed = true } = opts;
  const prof = profile.slice();
  if (closed) prof.push(prof[0]);
  const cum = [0];
  for (let k = 1; k < prof.length; k++) {
    cum.push(cum[k - 1] + Math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]));
  }
  const rings = Math.max(2, Math.floor((i1 - i0) / step) + 1);
  const vc = prof.length;
  const pos = new Float32Array(rings * vc * 3);
  const uv = new Float32Array(rings * vc * 2);
  const idx = [];
  let vi = 0, ui = 0;
  for (let r = 0; r < rings; r++) {
    const i = Math.min(i1, i0 + r * step);
    const p = route.P[i], right = route.R[i], up = route.U[i];
    const s = route.S[i];
    for (let k = 0; k < vc; k++) {
      pos[vi++] = p.x + right.x * prof[k][0] + up.x * prof[k][1];
      pos[vi++] = p.y + right.y * prof[k][0] + up.y * prof[k][1];
      pos[vi++] = p.z + right.z * prof[k][0] + up.z * prof[k][1];
      uv[ui++] = cum[k] / uScale;
      uv[ui++] = s / vScale;
    }
  }
  for (let r = 0; r < rings - 1; r++) {
    for (let k = 0; k < vc - 1; k++) {
      const a = r * vc + k, b = a + 1, c = a + vc, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return new THREE.Mesh(g, mat);
}

/* ---------------- 轨道 ---------------- */
function buildTrack(route, group, quality) {
  const i0 = 0, i1 = route.N;
  // 道床
  const bedProfile = [[-5.7, -0.95], [-4.3, -0.36], [4.3, -0.36], [5.7, -0.95]];
  const bed = extrudeAlong(route, i0, i1, bedProfile, MAT.ballast, { step: 2, uScale: 4, vScale: 4 });
  group.add(bed);
  // 四条钢轨
  const railProf = [[-0.04, -0.17], [0.04, -0.17], [0.04, -0.015], [0.028, 0], [-0.028, 0], [-0.04, -0.015]];
  for (const off of [-3.1175, -1.6825, 1.6825, 3.1175]) {
    const p = railProf.map(([a, b]) => [a + off, b]);
    group.add(extrudeAlong(route, i0, i1, p, MAT.rail, { step: 2, uScale: 1, vScale: 2 }));
  }
  // 轨枕
  const stepM = 1.35;
  const count = Math.floor(route.length / stepM) * 2;
  const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(2.5, 0.16, 0.26), MAT.sleeper, count);
  const dummy = new THREE.Object3D();
  let n = 0;
  for (let tr = 0; tr < 2; tr++) {
    const lat = tr === 0 ? -2.4 : 2.4;
    for (let s = 1; s < route.length - 1; s += stepM) {
      const f = route.frameAt(s);
      dummy.position.copy(f.pos).addScaledVector(f.right, lat).addScaledVector(f.up, -0.3);
      dummy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.right, f.up, f.tan));
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      sleepers.setMatrixAt(n++, dummy.matrix);
      if (n >= count) break;
    }
    if (n >= count) break;
  }
  sleepers.count = n;
  sleepers.instanceMatrix.needsUpdate = true;
  sleepers.frustumCulled = false;
  group.add(sleepers);

  // 接触网（明线区段）
  buildCatenary(route, group);
}

function buildCatenary(route, group) {
  const wireMat = new THREE.LineBasicMaterial({ color: 0x3d4448, transparent: true, opacity: 0.9 });
  const pts = [[], []];
  for (let s = 0; s <= route.length; s += 10) {
    const f = route.frameAt(s);
    for (let tr = 0; tr < 2; tr++) {
      const lat = tr === 0 ? -2.4 : 2.4;
      const p = f.pos.clone().addScaledVector(f.right, lat).addScaledVector(f.up, 4.85);
      pts[tr].push(p);
    }
  }
  for (let tr = 0; tr < 2; tr++) {
    const g = new THREE.BufferGeometry().setFromPoints(pts[tr]);
    group.add(new THREE.Line(g, wireMat));
  }
  // 吊弦
  const drop = [];
  for (let s = 0; s <= route.length; s += 24) {
    const f = route.frameAt(s);
    for (let tr = 0; tr < 2; tr++) {
      const lat = tr === 0 ? -2.4 : 2.4;
      const a = f.pos.clone().addScaledVector(f.right, lat).addScaledVector(f.up, 4.85);
      const b = a.clone().add(new THREE.Vector3(0, 1.15, 0));
      drop.push(a, b);
    }
  }
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(drop), wireMat));

  // 支柱（仅在无隧道区段）
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7.4, 8);
  const armGeo = new THREE.BoxGeometry(2.6, 0.09, 0.09);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x565b5d, roughness: 0.6, metalness: 0.5 });
  const positions = [];
  for (let s = 30; s < route.length; s += 26) {
    const i = Math.round(s / route.ds);
    if (route.P[i].y < -2.2) continue;
    for (const side of [-1, 1]) {
      positions.push({ s, side });
    }
  }
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, positions.length);
  const arms = new THREE.InstancedMesh(armGeo, poleMat, positions.length);
  const d = new THREE.Object3D();
  positions.forEach((p, k) => {
    const f = route.frameAt(p.s);
    const base = f.pos.clone().addScaledVector(f.right, p.side * 5.9);
    base.y = Math.max(0, base.y - 0.5);
    d.position.copy(base).add(new THREE.Vector3(0, 3.7, 0));
    d.rotation.set(0, 0, 0);
    d.updateMatrix();
    poles.setMatrixAt(k, d.matrix);
    const armPos = f.pos.clone().addScaledVector(f.right, p.side * 4.6).addScaledVector(f.up, 5.55);
    d.position.copy(armPos);
    d.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.right, f.up, f.tan));
    d.scale.set(p.side * 1, 1, 1);
    d.updateMatrix();
    arms.setMatrixAt(k, d.matrix);
  });
  poles.instanceMatrix.needsUpdate = true; arms.instanceMatrix.needsUpdate = true;
  poles.frustumCulled = false; arms.frustumCulled = false;
  group.add(poles, arms);
}

/* ---------------- 隧道 ---------------- */
function tunnelRanges(route) {
  const runs = [];
  let cur = null;
  const skip = route.stations.filter(s => s.y < -2).map(s => [s.s - 74, s.s + 74]);
  for (let i = 0; i <= route.N; i += 1) {
    const s = route.S[i];
    const inSkip = skip.some(([a, b]) => s > a && s < b);
    const isT = route.P[i].y < -1.7 && !inSkip;
    if (isT && !cur) cur = { a: i, b: i };
    else if (isT && cur) cur.b = i;
    else if (!isT && cur) { if (cur.b - cur.a > 3) runs.push(cur); cur = null; }
  }
  if (cur && cur.b - cur.a > 3) runs.push(cur);
  return runs;
}

function buildTunnels(route, group) {
  const R = 5.95, spring = 3.1, rise = 2.35;
  const prof = [[-R, -0.42], [-R, spring]];
  const steps = 14;
  for (let k = 1; k < steps; k++) {
    const a = PI - PI * (k / steps);
    prof.push([R * Math.cos(a), spring + rise * Math.sin(a)]);
  }
  prof.push([R, spring], [R, -0.42]);

  const runs = tunnelRanges(route);
  for (const run of runs) {
    const m = extrudeAlong(route, run.a, run.b, prof, MAT.tunnel, { step: 2, uScale: 7, vScale: 7 });
    group.add(m);

    // 顶部灯带
    const stripPts = [];
    for (let i = run.a; i <= run.b; i += 2) {
      const p = route.P[i].clone().add(new THREE.Vector3(0, 1, 0)).addScaledVector(route.U[i], 5.32);
      stripPts.push(p);
    }
    const stripGeo = new THREE.BufferGeometry().setFromPoints(stripPts);
    const strip = new THREE.Line(stripGeo, new THREE.LineBasicMaterial({ color: new THREE.Color(2.2, 2.1, 1.7), toneMapped: false, fog: false }));
    group.add(strip);

    // 环向灯（每 22m）
    const lampGeo = new THREE.BoxGeometry(0.6, 0.1, 0.32);
    const cnt = Math.floor((route.S[run.b] - route.S[run.a]) / 22);
    const lamps = new THREE.InstancedMesh(lampGeo, MAT.lampWarm, Math.max(1, cnt));
    const d = new THREE.Object3D();
    for (let k = 0; k < cnt; k++) {
      const s = route.S[run.a] + k * 22 + 6;
      const f = route.frameAt(s);
      d.position.copy(f.pos).addScaledVector(f.up, 5.34);
      d.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.right, f.up, f.tan));
      d.updateMatrix();
      lamps.setMatrixAt(k, d.matrix);
    }
    lamps.count = cnt;
    lamps.instanceMatrix.needsUpdate = true;
    lamps.frustumCulled = false;
    group.add(lamps);

    // 疏散指示
    for (let s = route.S[run.a] + 40; s < route.S[run.b] - 20; s += 120) {
      const f = route.frameAt(s);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), MAT.exitSign);
      sign.position.copy(f.pos).addScaledVector(f.right, R - 0.3).addScaledVector(f.up, 2.35);
      sign.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.tan.clone().negate(), f.up, f.right.clone().negate()));
      group.add(sign);
    }

    // 洞口门框
    for (const [idx, dir] of [[run.a, -1], [run.b, 1]]) {
      const f = route.frameAt(route.S[idx]);
      const frame = new THREE.Group();
      frame.position.copy(f.pos);
      frame.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.right, f.up, f.tan));
      const wallMat = MAT.concrete;
      const mk = (w, h, d2, x, y, z) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d2), wallMat);
        b.position.set(x, y, z); frame.add(b);
      };
      mk(3.2, 9.4, 1.4, -R - 1.5, 3.2, 0);
      mk(3.2, 9.4, 1.4, R + 1.5, 3.2, 0);
      mk(2 * R + 6.4, 3.0, 1.4, 0, 7.6, 0);
      group.add(frame);
    }
  }
}

/* ---------------- 高架 ---------------- */
function buildViaduct(route, group) {
  const deckProf = [[-5.6, -0.34], [-5.55, -1.15], [-4.4, -1.55], [4.4, -1.55], [5.55, -1.15], [5.6, -0.34]];
  const runs = [];
  let cur = null;
  for (let i = 0; i <= route.N; i++) {
    const on = route.P[i].y > 3.2;
    if (on && !cur) cur = { a: i, b: i };
    else if (on && cur) cur.b = i;
    else if (!on && cur) { if (cur.b - cur.a > 4) runs.push(cur); cur = null; }
  }
  if (cur && cur.b - cur.a > 4) runs.push(cur);

  for (const run of runs) {
    group.add(extrudeAlong(route, run.a, run.b, deckProf, MAT.concrete, { step: 2, uScale: 5, vScale: 5 }));
    // 护栏
    for (const side of [-1, 1]) {
      const p = [[side * 5.45, -0.34], [side * 5.45, 0.86], [side * 5.2, 0.96], [side * 5.2, -0.34]];
      group.add(extrudeAlong(route, run.a, run.b, p, MAT.concreteDark, { step: 3, uScale: 4, vScale: 4 }));
    }
    // 桥墩
    const spanStep = 26;
    const s0 = route.S[run.a], s1 = route.S[run.b];
    const cnt = Math.max(1, Math.floor((s1 - s0) / spanStep));
    const pierGeo = new THREE.BoxGeometry(1.9, 1, 1.9);
    const capGeo = new THREE.BoxGeometry(9.6, 1.1, 1.6);
    const pierMat = MAT.concrete;
    const piers = new THREE.InstancedMesh(pierGeo, pierMat, cnt);
    const caps = new THREE.InstancedMesh(capGeo, pierMat, cnt);
    const d = new THREE.Object3D();
    for (let k = 0; k < cnt; k++) {
      const s = s0 + k * spanStep + 8;
      const f = route.frameAt(s);
      const h = Math.max(2.5, f.pos.y - 1.6);
      d.position.copy(f.pos); d.position.y = h / 2;
      d.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.right, f.up, f.tan));
      d.scale.set(1, h, 1);
      d.updateMatrix(); piers.setMatrixAt(k, d.matrix);
      d.position.copy(f.pos); d.position.y = f.pos.y - 1.9;
      d.scale.set(1, 1, 1); d.updateMatrix(); caps.setMatrixAt(k, d.matrix);
    }
    piers.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true;
    piers.frustumCulled = false; caps.frustumCulled = false;
    group.add(piers, caps);
  }
}

/* ---------------- 地面 / 河流 ---------------- */
function buildGround(route, group) {
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000, 1, 1), MAT.ground);
  plane.rotation.x = -PI / 2;
  plane.position.y = -0.05;
  plane.receiveShadow = true;
  group.add(plane);

  // 黄浦江
  const cps = RIVER_PATH.map(([la, lo]) => {
    const p = route.projectLL(la, lo);
    return new THREE.Vector3(p.x, 0, p.z);
  });
  const curve = new THREE.CatmullRomCurve3(cps, false, 'catmullrom', 0.5);
  const N = 160;
  const pts = curve.getSpacedPoints(N);
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const p = pts[i];
    const t = (i < N ? pts[i + 1].clone().sub(p) : p.clone().sub(pts[i - 1])).normalize();
    const n = new THREE.Vector3(-t.z, 0, t.x);
    const a = p.clone().addScaledVector(n, RIVER_WIDTH / 2);
    const b = p.clone().addScaledVector(n, -RIVER_WIDTH / 2);
    pos.push(a.x, 0.04, a.z, b.x, 0.04, b.z);
    uv.push(0, i / 8, 1, i / 8);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const water = new THREE.Mesh(g, MAT.water);
  water.receiveShadow = false;
  group.add(water);

  // 河岸
  const bankMat = new THREE.MeshStandardMaterial({ color: 0x5c605f, roughness: 0.9 });
  for (const side of [1, -1]) {
    const bp = [], bi = [];
    for (let i = 0; i <= N; i++) {
      const p = pts[i];
      const t = (i < N ? pts[i + 1].clone().sub(p) : p.clone().sub(pts[i - 1])).normalize();
      const n = new THREE.Vector3(-t.z, 0, t.x).multiplyScalar(side * RIVER_WIDTH / 2);
      const a = p.clone().add(n);
      bp.push(a.x, -0.1, a.z, a.x, 0.9, a.z);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      if (side > 0) bi.push(a, c, b, b, c, d); else bi.push(a, b, c, b, d, c);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    bg.setIndex(bi); bg.computeVertexNormals();
    group.add(new THREE.Mesh(bg, bankMat));
  }
  return { riverPts: pts };
}

function distToRiver(x, z, pts) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i += 2) {
    const ax = pts[i].x, az = pts[i].z, bx = pts[i + 1].x, bz = pts[i + 1].z;
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    const px = ax + dx * t, pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) best = d;
  }
  return best;
}

/* ---------------- 城市 ---------------- */
function buildCity(route, group, riverPts) {
  const cbd = [{ x: 0, z: 0, r: 0, p: 0 }];
  const lujiazui = route.projectLL(31.2365, 121.5055);
  const peopleSq = route.projectLL(31.2329, 121.4696);
  const xujiahui = route.projectLL(31.1936, 121.4363);
  const hongkou = route.projectLL(31.2689, 121.4793);
  const centers = [
    { x: lujiazui.x, z: lujiazui.z, r: 900, h: 250 },
    { x: peopleSq.x, z: peopleSq.z, r: 1600, h: 95 },
    { x: xujiahui.x, z: xujiahui.z, r: 1200, h: 80 },
    { x: hongkou.x, z: hongkou.z, r: 1200, h: 60 }
  ];
  const heightAt = (x, z) => {
    let h = 14 + RNG() * 16;
    for (const c of centers) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r) h = Math.max(h, c.h * Math.pow(1 - d / c.r, 1.8) + 12);
    }
    return h;
  };
  const buckets = [[], [], []];
  const rng = mulberry32(77123);
  for (let s = 240; s < route.length - 200; s += 44) {
    const f = route.frameAt(s);
    for (const side of [-1, 1]) {
      const n = 2 + Math.floor(rng() * 2);
      for (let k = 0; k < n; k++) {
        const lat = side * (40 + rng() * 300);
        const along = (rng() - 0.5) * 40;
        const p = f.pos.clone().addScaledVector(f.right, lat).addScaledVector(f.tan, along);
        if (distToRiver(p.x, p.z, riverPts) < RIVER_WIDTH / 2 + 26) continue;
        let nearStation = false;
        for (const st of route.stations) {
          if (Math.hypot(p.x - st.frame.pos.x, p.z - st.frame.pos.z) < 34) { nearStation = true; break; }
        }
        if (nearStation) continue;
        const h = heightAt(p.x, p.z) * (0.55 + rng() * 0.9);
        const w = 22 + rng() * 30, dp = 22 + rng() * 32;
        const cls = h < 30 ? 0 : h < 85 ? 1 : 2;
        buckets[cls].push({ x: p.x, y: 0, z: p.z, w, h, d: dp, rot: Math.atan2(f.tan.x, f.tan.z) + (rng() - 0.5) * 0.18, c: rng() });
      }
    }
  }
  for (let c = 0; c < 3; c++) {
    const arr = buckets[c];
    if (!arr.length) continue;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = MAT.bld[c * 3 + Math.floor(RNG() * 3)] || MAT.bld[0];
    const im = new THREE.InstancedMesh(geo, mat, arr.length);
    const d = new THREE.Object3D();
    arr.forEach((b, i) => {
      d.position.set(b.x, b.h / 2, b.z);
      d.rotation.set(0, b.rot, 0);
      d.scale.set(b.w, b.h, b.d);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = false; im.receiveShadow = false;
    im.frustumCulled = false;
    group.add(im);
  }

  // 树木
  const treeN = 320;
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.22, 2.2, 5);
  const crownGeo = new THREE.IcosahedronGeometry(1.7, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, MAT.trunk, treeN);
  const crowns = new THREE.InstancedMesh(crownGeo, MAT.tree, treeN);
  const dt = new THREE.Object3D();
  let tn = 0;
  for (let i = 0; i < treeN * 3 && tn < treeN; i++) {
    const s = 200 + RNG() * (route.length - 400);
    const f = route.frameAt(s);
    const side = RNG() < 0.5 ? -1 : 1;
    const p = f.pos.clone().addScaledVector(f.right, side * (14 + RNG() * 24));
    if (distToRiver(p.x, p.z, riverPts) < RIVER_WIDTH / 2 + 8) continue;
    const h = 1 + RNG() * 0.8;
    dt.position.set(p.x, 1.1 * h, p.z); dt.rotation.set(0, RNG() * TAU, 0); dt.scale.set(h, h, h);
    dt.updateMatrix(); trunks.setMatrixAt(tn, dt.matrix);
    dt.position.y = 2.6 * h; dt.scale.set(h * (0.8 + RNG() * 0.5), h, h * (0.8 + RNG() * 0.5));
    dt.updateMatrix(); crowns.setMatrixAt(tn, dt.matrix);
    tn++;
  }
  trunks.count = tn; crowns.count = tn;
  trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true;
  trunks.frustumCulled = false; crowns.frustumCulled = false;
  group.add(trunks, crowns);
}

/* ---------------- 地标 ---------------- */
function buildLandmarks(route, group, theme) {
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.5, 1.1), toneMapped: false });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x2b4050, roughness: 0.12, metalness: 0.85, envMapIntensity: 1.3,
    emissive: new THREE.Color(0x1a2a3a), emissiveIntensity: 0.5
  });
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0xb9b3a8, roughness: 0.8, metalness: 0.1 });

  for (const lm of LANDMARKS) {
    const p = route.projectLL(lm.lat, lm.lon);
    let nearest = 1e9;
    for (const st of route.stations) nearest = Math.min(nearest, Math.hypot(p.x - st.frame.pos.x, p.z - st.frame.pos.z));
    if (nearest > 3600) continue;
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);

    if (lm.kind === 'pearl') {
      // 三根斜撑
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 5.2, 150, 10), concreteMat);
        leg.position.set(Math.cos(a) * 26, 75, Math.sin(a) * 26);
        leg.rotation.z = Math.cos(a) * 0.17; leg.rotation.x = -Math.sin(a) * 0.17;
        g.add(leg);
      }
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(7, 11, 300, 16), concreteMat);
      shaft.position.y = 150; g.add(shaft);
      for (const [y, r] of [[112, 28], [263, 23], [350, 14]]) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshStandardMaterial({
          color: 0xd94a63, roughness: 0.25, metalness: 0.5, emissive: 0xb01f3a, emissiveIntensity: 0.9
        }));
        s.position.y = y; g.add(s);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.008, 0.7, 6, 32), glow);
        ring.position.y = y; ring.rotation.x = PI / 2; g.add(ring);
      }
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.2, 110, 8), concreteMat);
      ant.position.y = 405; g.add(ant);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8), MAT.lampRed);
      tip.position.y = 462; g.add(tip);
    } else if (lm.kind === 'twist') {
      const seg = 26, total = lm.h;
      for (let i = 0; i < seg; i++) {
        const t = i / seg;
        const w = lerp(62, 34, t), d = lerp(58, 30, t);
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, total / seg * 1.02, d), glassMat);
        b.position.y = total * (i + 0.5) / seg;
        b.rotation.y = t * 0.9;
        g.add(b);
      }
      const crown = new THREE.Mesh(new THREE.BoxGeometry(36, 8, 32), glow);
      crown.position.y = total; g.add(crown);
    } else if (lm.kind === 'swfc') {
      const b = new THREE.Mesh(new THREE.BoxGeometry(58, 430, 58), glassMat);
      b.position.y = 215; b.scale.set(1, 1, 1); g.add(b);
      const top = new THREE.Mesh(new THREE.BoxGeometry(56, 62, 56), glassMat);
      top.position.y = 461; g.add(top);
      // 顶部风洞
      const hole = new THREE.Mesh(new THREE.BoxGeometry(24, 30, 60), new THREE.MeshBasicMaterial({ color: 0x05080c }));
      hole.position.y = 452; g.add(hole);
    } else if (lm.kind === 'jinmao') {
      const tiers = [[54, 52, 190], [44, 42, 80], [36, 34, 60], [28, 26, 42], [20, 18, 30]];
      let y = 0;
      for (const [w, d, h] of tiers) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({
          color: 0x8b8172, roughness: 0.35, metalness: 0.75, envMapIntensity: 1.2
        }));
        b.position.y = y + h / 2; g.add(b);
        const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 1.2, d + 0.6), glow);
        band.position.y = y + h; g.add(band);
        y += h;
      }
      const spire = new THREE.Mesh(new THREE.ConeGeometry(8, 42, 8), MAT.metal);
      spire.position.y = y + 21; g.add(spire);
    } else if (lm.kind === 'bund') {
      const warmMat = new THREE.MeshStandardMaterial({
        color: 0x6b5f4c, roughness: 0.75, metalness: 0.15,
        emissive: new THREE.Color(0xffc07a), emissiveIntensity: 0.55
      });
      for (let i = 0; i < 9; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(30 + RNG() * 14, 26 + RNG() * 16, 22), warmMat);
        b.position.set(0, b.geometry.parameters.height / 2, -180 + i * 44);
        b.rotation.y = PI / 2;
        g.add(b);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 8), new THREE.MeshStandardMaterial({ color: 0x5b6158, roughness: 0.5, metalness: 0.5 }));
        dome.position.set(0, b.geometry.parameters.height + 5, -180 + i * 44);
        g.add(dome);
      }
    } else if (lm.kind === 'stadium') {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(95, 88, 34, 36, 1, true), new THREE.MeshStandardMaterial({
        color: 0x9aa3a6, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide
      }));
      ring.position.y = 17; g.add(ring);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(98, 98, 5, 36), new THREE.MeshStandardMaterial({ color: 0xc9d3d6, roughness: 0.4, metalness: 0.4 }));
      roof.position.y = 36; g.add(roof);
      const field = new THREE.Mesh(new THREE.CylinderGeometry(70, 70, 1.4, 36), new THREE.MeshStandardMaterial({ color: 0x22451f, roughness: 0.95 }));
      field.position.y = 1.5; g.add(field);
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * TAU;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 40, 6), MAT.metal);
        post.position.set(Math.cos(a) * 96, 20, Math.sin(a) * 96); g.add(post);
      }
    } else if (lm.kind === 'museum') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(120, 22, 90), new THREE.MeshStandardMaterial({ color: 0xb9bdbd, roughness: 0.5, metalness: 0.4 }));
      base.position.y = 11; g.add(base);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(38, 24, 16, 0, TAU, 0, PI / 2), new THREE.MeshPhysicalMaterial({
        color: 0x9fc6d8, roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.55, envMapIntensity: 1.3
      }));
      dome.position.y = 22; g.add(dome);
    }
    group.add(g);
  }
}


/* ===== 42_stations.js ===== */
/* ================================================================
   世界构建 B：车站（站台 / 屏蔽门 / 导向 / 乘客）
   ================================================================ */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);

function pbox(parent, w, h, d, mat, x, y, z, cast = false) {
  const m = new THREE.Mesh(UNIT_BOX, mat);
  m.scale.set(w, h, d); m.position.set(x, y, z);
  m.castShadow = cast; m.receiveShadow = false;
  parent.add(m);
  return m;
}
function pplane(parent, w, h, mat, x, y, z, ry = 0, rx = 0) {
  const m = new THREE.Mesh(UNIT_PLANE, mat);
  m.scale.set(w, h, 1); m.position.set(x, y, z);
  m.rotation.set(rx, ry, 0);
  parent.add(m);
  return m;
}

function texStopBoard() {
  if (TEX_CACHE.has('stopboard')) return TEX_CACHE.get('stopboard');
  const [c, x] = cv2d(256, 256);
  x.fillStyle = '#f2f4f2'; x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#1d7a44'; x.fillRect(0, 0, 256, 62);
  x.fillStyle = '#fff'; x.font = '700 30px "Microsoft YaHei",sans-serif'; x.textAlign = 'center';
  x.fillText('停 车 标', 128, 43);
  x.strokeStyle = '#1d7a44'; x.lineWidth = 12;
  x.beginPath(); x.moveTo(128, 78); x.lineTo(128, 190); x.stroke();
  x.lineWidth = 8; x.beginPath(); x.moveTo(90, 160); x.lineTo(128, 200); x.lineTo(166, 160); x.stroke();
  x.fillStyle = '#3b4448'; x.font = '600 20px "Segoe UI",sans-serif';
  x.fillText('STOP MARK', 128, 232);
  const t = toTex(c);
  TEX_CACHE.set('stopboard', t);
  return t;
}
function texExitSign() {
  if (TEX_CACHE.has('exitsign')) return TEX_CACHE.get('exitsign');
  const [c, x] = cv2d(256, 96);
  x.fillStyle = '#0e6b3a'; x.fillRect(0, 0, 256, 96);
  x.fillStyle = '#eafff2'; x.font = '700 34px "Microsoft YaHei",sans-serif'; x.textAlign = 'center';
  x.fillText('出 口', 128, 45);
  x.font = '600 18px "Segoe UI",sans-serif'; x.fillText('EXIT', 128, 74);
  const t = toTex(c);
  TEX_CACHE.set('exitsign', t);
  return t;
}

/* ---------------- 屏蔽门 ---------------- */
class PSDGroup {
  constructor(parent, x, openings, height, opts = {}) {
    this.x = x;
    this.height = height;
    this.openings = openings;
    this.leaves = [];
    this.t = 0;
    const glass = MAT.psdGlass;
    const frameMat = MAT.darkMetal;
    const zMin = opts.zMin ?? -70, zMax = opts.zMax ?? 70;

    // 固定玻璃板
    const segs = [];
    let cur = zMin;
    const halfOpen = 0.86;
    const sorted = openings.slice().sort((a, b) => a - b);
    for (const o of sorted) {
      const a = o - halfOpen, b = o + halfOpen;
      if (a - cur > 0.25) segs.push({ c: (cur + a) / 2, w: a - cur });
      cur = b;
    }
    if (zMax - cur > 0.25) segs.push({ c: (cur + zMax) / 2, w: zMax - cur });

    const fixed = new THREE.InstancedMesh(UNIT_BOX, glass, segs.length);
    const d = new THREE.Object3D();
    segs.forEach((s, i) => {
      d.position.set(x, height / 2, s.c);
      d.scale.set(0.06, height, s.w);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      fixed.setMatrixAt(i, d.matrix);
    });
    fixed.instanceMatrix.needsUpdate = true;
    fixed.frustumCulled = false;
    parent.add(fixed);

    // 门扇
    const leafW = 0.84;
    const leafCount = sorted.length * 2;
    const leaves = new THREE.InstancedMesh(UNIT_BOX, glass, leafCount);
    let li = 0;
    for (const o of sorted) {
      for (const dir of [-1, 1]) {
        this.leaves.push({ z: o + dir * leafW / 2, dir });
        d.position.set(x, height / 2, o + dir * leafW / 2);
        d.scale.set(0.075, height - 0.06, leafW);
        d.updateMatrix();
        leaves.setMatrixAt(li++, d.matrix);
      }
    }
    this.leafMesh = leaves;
    leaves.instanceMatrix.needsUpdate = true;
    leaves.frustumCulled = false;
    parent.add(leaves);

    // 立柱与横梁
    const posts = [];
    for (let z = zMin; z <= zMax; z += 2.5) posts.push(z);
    for (const o of sorted) { posts.push(o - halfOpen, o + halfOpen); }
    const pm = new THREE.InstancedMesh(UNIT_BOX, frameMat, posts.length);
    posts.forEach((z, i) => {
      d.position.set(x, height / 2, z);
      d.scale.set(0.14, height, 0.1);
      d.updateMatrix(); pm.setMatrixAt(i, d.matrix);
    });
    pm.instanceMatrix.needsUpdate = true; pm.frustumCulled = false;
    parent.add(pm);

    pbox(parent, 0.18, 0.16, zMax - zMin, frameMat, x, height, (zMin + zMax) / 2);
    pbox(parent, 0.18, 0.2, zMax - zMin, frameMat, x, 0.1, (zMin + zMax) / 2);
    // 门头指示灯带
    pbox(parent, 0.1, 0.05, zMax - zMin, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.0, 0.9), toneMapped: false }), x - 0.09, height + 0.12, (zMin + zMax) / 2);
    this.d = d;
  }
  setOpen(t) {
    if (Math.abs(t - this.t) < 0.002) return;
    this.t = t;
    const d = this.d;
    this.leaves.forEach((leaf, i) => {
      d.position.set(this.x, this.height / 2, leaf.z - leaf.dir * 0.82 * t);
      d.scale.set(0.075, this.height - 0.06, 0.84);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      this.leafMesh.setMatrixAt(i, d.matrix);
    });
    this.leafMesh.instanceMatrix.needsUpdate = true;
  }
}

/* ---------------- 车站 ---------------- */
function buildStation(route, line, st, idx, theme) {
  const g = new THREE.Group();
  g.position.copy(st.frame.pos);
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(st.frame.right, st.frame.up, st.frame.tan));
  const y0 = 0;              // 轨面
  const pt = 1.06;           // 站台面
  const underground = st.y < -2;
  const nextName = route.stations[Math.min(route.stations.length - 1, idx + 1)]?.zh || st.zh;
  const dirTo = idx >= route.stations.length - 1
    ? route.stations[route.stations.length - 2].zh
    : route.stations[idx + 1].zh;

  const wallMat = underground ? MAT.stationWall : MAT.concrete;
  const H = underground ? 7.4 : 5.6;

  /* 站台板 */
  for (const side of [-1, 1]) {
    pbox(g, 8.2, 1.52, 140, MAT.platform, side * 8.1, pt - 0.76, 0);
    // 站台边缘
    pbox(g, 0.16, 1.52, 140, MAT.concreteDark, side * 4.02, pt - 0.76, 0);
    // 盲道 + 安全线
    pbox(g, 0.62, 0.02, 138, MAT.safety, side * 4.75, pt + 0.012, 0);
    pbox(g, 0.1, 0.02, 138, MAT.safety, side * 4.18, pt + 0.012, 0);
    // 站台边缘灯带
    pbox(g, 0.05, 0.05, 138, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 2.4, 2.0), toneMapped: false }), side * 4.0, pt - 0.1, 0);
  }
  /* 轨道区 */
  pbox(g, 8.0, 0.3, 148, MAT.concreteDark, 0, -0.45, 0);

  if (underground) {
    // 侧墙 / 顶板
    for (const side of [-1, 1]) {
      pplane(g, 148, H + 1.2, wallMat, side * 12.05, (H - 1.2) / 2 + 0.5, 0, side > 0 ? -PI / 2 : PI / 2);
      // 墙面腰线
      pbox(g, 0.06, 0.34, 148, new THREE.MeshStandardMaterial({ color: new THREE.Color(line.color), roughness: 0.5, metalness: 0.1, emissive: new THREE.Color(line.color), emissiveIntensity: 0.35 }), side * 11.98, 3.1, 0);
      pbox(g, 0.06, 0.06, 148, MAT.darkMetal, side * 11.98, 2.88, 0);
    }
    pplane(g, 24.4, 148, MAT.concreteDark, 0, H, 0, 0, PI / 2);
    // 端墙
    for (const dir of [-1, 1]) {
      pbox(g, 6.25, H + 1.4, 0.6, wallMat, -9.05, (H - 1.4) / 2 + 0.2, dir * 74);
      pbox(g, 6.25, H + 1.4, 0.6, wallMat, 9.05, (H - 1.4) / 2 + 0.2, dir * 74);
      pbox(g, 24.4, 2.0, 0.6, wallMat, 0, H - 1.0, dir * 74);
      // 洞口轮廓
      pbox(g, 0.6, 6.4, 0.7, MAT.concreteDark, -6.0, 3.0, dir * 74);
      pbox(g, 0.6, 6.4, 0.7, MAT.concreteDark, 6.0, 3.0, dir * 74);
      pbox(g, 12.6, 0.55, 0.7, MAT.concreteDark, 0, 5.55, dir * 74);
    }
    // 立柱
    const colCount = 14;
    const cols = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.42, H - pt, 12), MAT.white, colCount * 2);
    const d = new THREE.Object3D();
    let ci = 0;
    for (let i = 0; i < colCount; i++) {
      const z = -65 + i * 10;
      for (const side of [-1, 1]) {
        d.position.set(side * 7.4, (H + pt) / 2 - 0.1, z);
        d.updateMatrix(); cols.setMatrixAt(ci++, d.matrix);
      }
    }
    cols.instanceMatrix.needsUpdate = true; cols.frustumCulled = false;
    g.add(cols);
    // 顶部灯带
    const lightN = 46;
    const lights = new THREE.InstancedMesh(UNIT_BOX, MAT.strip, lightN * 2);
    let li2 = 0;
    for (let i = 0; i < lightN; i++) {
      const z = -69 + i * 3;
      for (const side of [-1, 1]) {
        d.position.set(side * 4.6, H - 0.15, z);
        d.scale.set(0.34, 0.09, 2.4);
        d.updateMatrix(); lights.setMatrixAt(li2++, d.matrix);
      }
    }
    lights.instanceMatrix.needsUpdate = true; lights.frustumCulled = false;
    g.add(lights);
  } else {
    // 高架：雨棚
    pbox(g, 25.5, 0.26, 148, MAT.white, 0, H, 0, true);
    pbox(g, 25.9, 0.9, 148, new THREE.MeshStandardMaterial({ color: new THREE.Color(line.color), roughness: 0.55, metalness: 0.2 }), 0, H + 0.52, 0);
    pbox(g, 25.5, 0.1, 148, MAT.metal, 0, H - 0.2, 0);
    for (const side of [-1, 1]) {
      pbox(g, 0.4, H - pt, 148, MAT.concrete, side * 12.0, (H + pt) / 2, 0);
      // 外侧栏杆
      pbox(g, 0.08, 0.5, 148, MAT.metal, side * 12.15, pt + 0.55, 0);
      pbox(g, 0.08, 0.5, 148, MAT.metal, side * 12.15, pt + 1.25, 0);
    }
    // 雨棚柱
    const colN = 13;
    const cols = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.34, H - pt, 10), MAT.metal, colN * 2);
    const d = new THREE.Object3D();
    let ci = 0;
    for (let i = 0; i < colN; i++) {
      const z = -66 + i * 11;
      for (const side of [-1, 1]) {
        d.position.set(side * 9.4, (H + pt) / 2, z);
        d.updateMatrix(); cols.setMatrixAt(ci++, d.matrix);
      }
    }
    cols.instanceMatrix.needsUpdate = true; cols.frustumCulled = false;
    g.add(cols);
    // 顶棚灯
    const lights = new THREE.InstancedMesh(UNIT_BOX, MAT.stripCool, 30);
    for (let i = 0; i < 30; i++) {
      d.position.set(0, H - 0.28, -69 + i * 4.7);
      d.scale.set(7, 0.08, 0.5);
      d.updateMatrix(); lights.setMatrixAt(i, d.matrix);
    }
    lights.instanceMatrix.needsUpdate = true; lights.frustumCulled = false;
    g.add(lights);
  }

  /* 屏蔽门：门位与列车车门一致 */
  const doors = [];
  for (let car = 0; car < 6; car++) {
    for (const off of [-7.6, -2.6, 2.6, 7.6]) {
      doors.push(PLATFORM_HALF - 11.4 - car * CAR_PITCH + off);
    }
  }
  const psdH = underground ? 2.85 : 1.55;
  const psdL = new PSDGroup(g, -4.06, doors, psdH);
  const psdR = new PSDGroup(g, 4.06, doors, psdH);

  /* 站名牌、导向、广告 */
  const signMat = new THREE.MeshStandardMaterial({
    map: texStationSign(st, line, dirTo), roughness: 0.55, metalness: 0.05,
    emissive: 0xffffff, emissiveMap: texStationSign(st, line, dirTo), emissiveIntensity: 0.28
  });
  const diagMat = new THREE.MeshStandardMaterial({
    map: texLineDiagram(line, idx), roughness: 0.6, metalness: 0.05,
    emissive: 0xffffff, emissiveMap: texLineDiagram(line, idx), emissiveIntensity: 0.22
  });
  for (const side of [-1, 1]) {
    const wx = underground ? 11.9 : 9.2;
    const wy = underground ? 4.5 : 4.18;
    // 大站名牌
    for (const z of [-46, 0, 46]) {
      if (underground) pplane(g, 6.4, 1.6, signMat, side * wx, wy, z, side > 0 ? -PI / 2 : PI / 2);
    }
    if (underground) {
      // 线路图
      pplane(g, 9.0, 1.4, diagMat, side * 11.9, 2.6, 0, side > 0 ? -PI / 2 : PI / 2);
      // 广告
      for (const z of [-62, -30, 30, 62]) {
        const ad = new THREE.MeshStandardMaterial({ map: texAd((idx + Math.abs(z)) % 4), roughness: 0.6, emissive: 0xffffff, emissiveMap: texAd((idx + Math.abs(z)) % 4), emissiveIntensity: 0.3 });
        pplane(g, 4.2, 2.1, ad, side * 11.88, 3.0, z, side > 0 ? -PI / 2 : PI / 2);
      }
    }
    // 吊挂导向
    for (const z of [-38, 12, 58]) {
      const s = pplane(g, 4.4, 1.1, signMat, side * 7.2, underground ? 5.4 : 3.9, z, 0);
      s.material.side = THREE.DoubleSide;
      pbox(g, 4.5, 0.06, 0.06, MAT.darkMetal, side * 7.2, (underground ? 5.4 : 3.9) + 0.6, z);
      pbox(g, 0.05, 0.6, 0.05, MAT.darkMetal, side * 7.2 - 1.6, (underground ? 5.4 : 3.9) + 0.3, z);
      pbox(g, 0.05, 0.6, 0.05, MAT.darkMetal, side * 7.2 + 1.6, (underground ? 5.4 : 3.9) + 0.3, z);
    }
  }
  // 高架站：雨棚檐口站名
  if (!underground) {
    for (const z of [-52, 0, 52]) {
      pplane(g, 7.2, 1.8, signMat, 0, H + 0.52, z, 0);
      pplane(g, 7.2, 1.8, signMat, 0, H + 0.52, z, PI);
    }
  }
  // 出口牌
  const exitMat = new THREE.MeshStandardMaterial({ map: texExitSign(), roughness: 0.5, emissive: 0xffffff, emissiveMap: texExitSign(), emissiveIntensity: 0.9 });
  for (const side of [-1, 1]) {
    for (const z of [-20, 24]) {
      pplane(g, 1.5, 0.56, exitMat, side * 11.86, 2.9, z, side > 0 ? -PI / 2 : PI / 2);
    }
  }

  /* 楼扶梯 */
  for (const side of [-1, 1]) {
    for (const z of [-44, 46]) {
      const esc = new THREE.Group();
      esc.position.set(side * 9.4, 0, z);
      esc.rotation.y = side > 0 ? PI : 0;
      const body = pbox(esc, 3.0, 0.55, 13, MAT.darkMetal, 0, 1.6, 0);
      body.rotation.x = -0.42;
      body.position.y = 2.3;
      const sides = pbox(esc, 3.1, 0.9, 13, new THREE.MeshStandardMaterial({ color: 0x8c9aa0, roughness: 0.3, metalness: 0.7 }), 0, 2.7, 0);
      sides.rotation.x = -0.42;
      // 上行洞口
      pbox(esc, 3.4, 2.6, 4.2, new THREE.MeshBasicMaterial({ color: 0x05070a }), 0, 5.6, 4.6);
      g.add(esc);
    }
  }
  // 无障碍电梯
  pbox(g, 2.0, 3.2, 2.4, new THREE.MeshStandardMaterial({ color: 0xa8b2b5, roughness: 0.35, metalness: 0.6 }), -10.2, pt + 1.6, -4);

  /* 座椅 / 垃圾桶 */
  for (const side of [-1, 1]) {
    for (const z of [-24, 8, 36]) {
      pbox(g, 0.5, 0.08, 3.2, MAT.metal, side * 9.6, pt + 0.46, z);
      pbox(g, 0.12, 0.46, 3.2, MAT.metal, side * 9.85, pt + 0.24, z);
      pbox(g, 0.5, 0.6, 0.5, MAT.darkMetal, side * 9.6, pt + 0.3, z - 1.9);
    }
    pbox(g, 0.6, 0.8, 0.6, MAT.darkMetal, side * 10.6, pt + 0.4, 58);
  }

  /* 停车标 */
  const sbMat = new THREE.MeshStandardMaterial({ map: texStopBoard(), roughness: 0.6, emissive: 0xffffff, emissiveMap: texStopBoard(), emissiveIntensity: 0.25, side: THREE.DoubleSide });
  const sb = pplane(g, 0.7, 0.7, sbMat, -4.65, pt + 1.5, 70);
  pbox(g, 0.06, 1.5, 0.06, MAT.darkMetal, -4.65, pt + 0.75, 70);

  /* 站台端部护栏 */
  for (const dir of [-1, 1]) {
    for (const side of [-1, 1]) {
      pbox(g, 8.0, 0.08, 0.08, MAT.safety, side * 8.1, pt + 1.05, dir * 70.2);
      pbox(g, 8.0, 0.08, 0.08, MAT.safety, side * 8.1, pt + 0.55, dir * 70.2);
      for (let i = 0; i < 5; i++) pbox(g, 0.07, 1.1, 0.07, MAT.darkMetal, side * 8.1 - 3.6 + i * 1.8, pt + 0.55, dir * 70.2);
    }
  }

  /* 候车乘客 */
  addPeople(g, st, underground, pt);

  return { group: g, psdL, psdR, stopZ: 70 };
}

function addPeople(g, st, underground, pt) {
  const rng = mulberry32(9001 + st.index * 77);
  const N = 54;
  const bodyGeo = new THREE.CapsuleGeometry(0.21, 0.78, 3, 6);
  const headGeo = new THREE.SphereGeometry(0.135, 8, 6);
  const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.02, color: 0xffffff });
  const headMat = new THREE.MeshStandardMaterial({ roughness: 0.8, color: 0xb08b74 });
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, N);
  const heads = new THREE.InstancedMesh(headGeo, headMat, N);
  const cols = ['#2c3a48', '#3d3630', '#20242a', '#4a4a52', '#6a5a4a', '#8a9298', '#333a3f', '#5b4a52'];
  const d = new THREE.Object3D();
  for (let i = 0; i < N; i++) {
    const side = -1; // 乘客只在左站台（乘降侧）
    const z = (rng() - 0.5) * 132;
    const x = side * (5.0 + rng() * 5.4);
    const h = 1.0 + rng() * 0.16;
    d.position.set(x, pt + 0.72 * h, z);
    d.rotation.set(0, rng() * TAU, 0);
    d.scale.set(h, h, h);
    d.updateMatrix();
    bodies.setMatrixAt(i, d.matrix);
    d.position.y = pt + 1.42 * h;
    d.scale.set(h, h, h);
    d.updateMatrix();
    heads.setMatrixAt(i, d.matrix);
    bodies.setColorAt(i, new THREE.Color(cols[Math.floor(rng() * cols.length)]));
  }
  bodies.instanceColor.needsUpdate = true;
  bodies.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
  bodies.frustumCulled = false; heads.frustumCulled = false;
  g.add(bodies, heads);
}


/* ===== 50_train.js ===== */
/* ================================================================
   列车：A 型车 6 辆编组 / 外部模型 / 司机室 / 仪表
   ================================================================ */
function carSideMats(line, open) {
  const key = 'cs' + line.id + open;
  if (!TRAIN_MATS[key]) {
    TRAIN_MATS[key] = {
      right: new THREE.MeshStandardMaterial({ map: texCarSide(line.color, open, false, line.badge), roughness: 0.42, metalness: 0.12, envMapIntensity: 0.8 }),
      left: new THREE.MeshStandardMaterial({ map: texCarSide(line.color, open, true, line.badge), roughness: 0.42, metalness: 0.12, envMapIntensity: 0.8 })
    };
  }
  return TRAIN_MATS[key];
}
const TRAIN_MATS = {};

class CabDisplay {
  constructor() {
    const [c1, x1] = cv2d(560, 350);
    const [c2, x2] = cv2d(560, 350);
    this.c1 = c1; this.x1 = x1; this.c2 = c2; this.x2 = x2;
    this.t1 = toTex(c1); this.t2 = toTex(c2);
    this.t1.anisotropy = 4; this.t2.anisotropy = 4;
    this.speedCanvas = document.createElement('canvas');
    this.speedCanvas.width = 320; this.speedCanvas.height = 320;
    this.sx = this.speedCanvas.getContext('2d');
    this.speedTex = toTex(this.speedCanvas);
    this.last = -1;
  }
  update(dt, st) {
    this.last += dt;
    if (this.last < 0.1) return;
    this.last = 0;
    this.drawATP(st);
    this.drawHMI(st);
    this.drawSpeedo(st);
  }
  drawATP(st) {
    const x = this.x1, W = 560, H = 350;
    x.fillStyle = '#06110c'; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#1d3a2e'; x.lineWidth = 4; x.strokeRect(2, 2, W - 4, H - 4);
    x.fillStyle = '#0c1f17'; x.fillRect(0, 0, W, 46);
    x.fillStyle = '#5ef2a8'; x.font = '700 24px "Microsoft YaHei",sans-serif';
    x.fillText('ATP  列车自动防护', 16, 31);
    x.fillStyle = '#2b6f52'; x.font = '600 16px ui-monospace,monospace';
    x.fillText('MODE  CM', W - 150, 30);
    // 速度
    x.fillStyle = '#7dffc0'; x.font = '700 96px ui-monospace,monospace';
    x.fillText(String(Math.round(st.speedKmh)).padStart(3, '0'), 26, 152);
    x.fillStyle = '#3f8f6c'; x.font = '600 18px "Microsoft YaHei",sans-serif';
    x.fillText('km/h', 226, 150);
    // 限速
    x.fillStyle = '#0f2a1e'; x.fillRect(300, 66, 240, 90);
    x.strokeStyle = '#2f7c58'; x.lineWidth = 2; x.strokeRect(300, 66, 240, 90);
    x.fillStyle = '#8fa8a0'; x.font = '600 15px "Microsoft YaHei",sans-serif';
    x.fillText('允许速度', 314, 88);
    x.fillStyle = st.overSpeed ? '#ff6b5a' : '#ffe083';
    x.font = '700 52px ui-monospace,monospace';
    x.fillText(String(Math.round(st.limit)).padStart(2, '0'), 316, 140);
    // 停车点
    x.fillStyle = '#8fa8a0'; x.font = '600 15px "Microsoft YaHei",sans-serif';
    x.fillText('距停车点', 26, 200);
    x.fillStyle = '#e8fff4'; x.font = '700 40px ui-monospace,monospace';
    x.fillText(Math.max(0, Math.round(st.distToStop)) + ' m', 116, 204);
    // 目标条
    const bw = 320;
    x.fillStyle = '#132b20'; x.fillRect(26, 222, bw, 10);
    const p = clamp(1 - st.distToStop / 420, 0, 1);
    x.fillStyle = '#3ddc97'; x.fillRect(26, 222, bw * p, 10);
    x.fillStyle = '#5ef2a8'; x.fillRect(26 + bw - 3, 218, 3, 18);
    // 状态
    x.fillStyle = '#0c1f17'; x.fillRect(0, 250, W, 100);
    x.font = '600 17px "Microsoft YaHei",sans-serif';
    x.fillStyle = st.doorOpen ? '#ffb020' : '#5ef2a8';
    x.fillText(st.doorOpen ? '● 车门开启' : '● 车门关闭', 20, 282);
    x.fillStyle = st.eb ? '#ff5a4a' : '#3f8f6c';
    x.fillText(st.eb ? '● 紧急制动' : '● 制动正常', 20, 312);
    x.fillStyle = st.traction > 0.01 ? '#5ef2a8' : '#3f8f6c';
    x.fillText(st.traction > 0.01 ? '● 牵引输出' : '● 牵引切除', 300, 282);
    x.fillStyle = st.atpWarn ? '#ffb020' : '#3f8f6c';
    x.fillText(st.atpWarn ? '● ATP 警告' : '● ATP 正常', 300, 312);
    x.fillStyle = '#1a3a2c'; x.fillRect(16, 330, W - 32, 2);
    x.fillStyle = '#3f8f6c'; x.font = '500 12px ui-monospace,monospace';
    x.fillText('SHANGHAI METRO  ATP-2000', 18, 344);
    this.t1.needsUpdate = true;
  }
  drawHMI(st) {
    const x = this.x2, W = 560, H = 350;
    x.fillStyle = '#080d14'; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#1a2c40'; x.lineWidth = 4; x.strokeRect(2, 2, W - 4, H - 4);
    // 线路徽标
    x.fillStyle = st.lineColor; x.fillRect(0, 0, 74, H);
    x.fillStyle = '#08110a'; x.font = '800 52px "Microsoft YaHei",sans-serif'; x.textAlign = 'center';
    x.fillText(st.lineBadge, 37, 88);
    x.save(); x.translate(37, 110); x.rotate(PI / 2);
    x.fillStyle = '#08110a'; x.font = '700 18px "Microsoft YaHei",sans-serif'; x.textAlign = 'left';
    x.fillText(st.lineName, 0, 0); x.restore();
    x.textAlign = 'left';
    // 下一站
    x.fillStyle = '#7f95a8'; x.font = '600 14px "Microsoft YaHei",sans-serif';
    x.fillText('下一站  NEXT STATION', 98, 40);
    x.fillStyle = '#ffffff'; x.font = '800 46px "PingFang SC","Microsoft YaHei",sans-serif';
    x.fillText(st.nextZh, 96, 92);
    x.fillStyle = '#7f95a8'; x.font = '500 19px "Segoe UI",sans-serif';
    x.fillText(st.nextEn, 98, 118);
    // 时刻
    x.strokeStyle = '#1c2f42'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(96, 136); x.lineTo(540, 136); x.stroke();
    const rows = [
      ['计划到达', fmtClock(st.schArr)],
      ['计划发车', fmtClock(st.schDep)],
      ['当前时间', fmtClock(st.clock)],
      ['偏差', (st.delay > 0 ? '+' : '') + Math.round(st.delay) + ' s']
    ];
    rows.forEach((r, i) => {
      const yy = 164 + i * 34;
      x.fillStyle = '#7f95a8'; x.font = '500 17px "Microsoft YaHei",sans-serif';
      x.fillText(r[0], 98, yy);
      x.fillStyle = i === 3 ? (Math.abs(st.delay) > 30 ? '#ffb020' : '#6ef0b0') : '#dfeefb';
      x.font = '600 21px ui-monospace,monospace';
      x.fillText(r[1], 250, yy);
    });
    // 线路条
    x.fillStyle = '#0f1a26'; x.fillRect(96, 292, 444, 6);
    x.fillStyle = st.lineColor; x.fillRect(96, 292, 444 * st.progress, 6);
    x.fillStyle = st.lineColor;
    x.beginPath(); x.arc(96 + 444 * st.progress, 295, 7, 0, TAU); x.fill();
    x.fillStyle = '#5c7386'; x.font = '500 12px "Microsoft YaHei",sans-serif';
    x.fillText(st.fromZh, 96, 320);
    x.textAlign = 'right'; x.fillText(st.toZh, 540, 320);
    x.textAlign = 'left';
    this.t2.needsUpdate = true;
  }
  drawSpeedo(st) {
    const x = this.sx, W = 320, H = 320;
    x.clearRect(0, 0, W, H);
    x.fillStyle = '#0b0f12'; x.beginPath(); x.arc(160, 160, 156, 0, TAU); x.fill();
    const a0 = PI * 0.75, a1 = PI * 2.25;
    for (let v = 0; v <= 90; v += 5) {
      const a = lerp(a0, a1, v / 90);
      const big = v % 10 === 0;
      const r1 = big ? 118 : 128;
      x.strokeStyle = v >= 75 ? '#ff6b5a' : '#8fa8a0';
      x.lineWidth = big ? 3 : 1.5;
      x.beginPath();
      x.moveTo(160 + Math.cos(a) * r1, 160 + Math.sin(a) * r1);
      x.lineTo(160 + Math.cos(a) * 140, 160 + Math.sin(a) * 140);
      x.stroke();
      if (big) {
        x.fillStyle = v >= 75 ? '#ff8f80' : '#cfe6dd';
        x.font = '600 20px ui-monospace,monospace';
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(String(v), 160 + Math.cos(a) * 96, 160 + Math.sin(a) * 96);
      }
    }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#5c7386'; x.font = '600 13px "Segoe UI",sans-serif';
    x.fillText('km/h', 160, 220);
    const a = lerp(a0, a1, clamp(st.speedKmh / 90, 0, 1));
    x.strokeStyle = '#6ef0b0'; x.lineWidth = 5; x.lineCap = 'round';
    x.beginPath(); x.moveTo(160, 160);
    x.lineTo(160 + Math.cos(a) * 112, 160 + Math.sin(a) * 112); x.stroke();
    x.fillStyle = '#0b0f12'; x.beginPath(); x.arc(160, 160, 13, 0, TAU); x.fill();
    x.strokeStyle = '#6ef0b0'; x.lineWidth = 2; x.beginPath(); x.arc(160, 160, 13, 0, TAU); x.stroke();
    this.speedTex.needsUpdate = true;
  }
}

function texButtonPanel() {
  if (TEX_CACHE.has('btnpanel')) return TEX_CACHE.get('btnpanel');
  const [c, x] = cv2d(512, 256);
  x.fillStyle = '#20262a'; x.fillRect(0, 0, 512, 256);
  x.strokeStyle = '#3a444a'; x.lineWidth = 3; x.strokeRect(4, 4, 504, 248);
  const btns = [['开门', 40, 40], ['关门', 190, 40], ['鸣笛', 340, 40], ['头灯', 40, 140], ['广播', 190, 140], ['对讲', 340, 140]];
  btns.forEach(([t, bx, by]) => {
    x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(bx, by + 34, 130, 40);
    x.strokeStyle = '#4a565d'; x.lineWidth = 2; x.strokeRect(bx, by + 34, 130, 40);
    x.fillStyle = '#c9d6dd'; x.font = '600 22px "Microsoft YaHei",sans-serif'; x.textAlign = 'center';
    x.fillText(t, bx + 65, by + 62);
    x.fillStyle = '#0d1114'; x.beginPath(); x.arc(bx + 65, by + 12, 11, 0, TAU); x.fill();
    x.strokeStyle = '#4a565d'; x.beginPath(); x.arc(bx + 65, by + 12, 11, 0, TAU); x.stroke();
  });
  x.textAlign = 'left';
  const t = toTex(c);
  TEX_CACHE.set('btnpanel', t);
  return t;
}

function texClipboard(st) {
  const key = 'clip' + st.zh;
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const [c, x] = cv2d(256, 340);
  x.fillStyle = '#e8e4d8'; x.fillRect(0, 0, 256, 340);
  x.fillStyle = '#2b3236'; x.font = '700 19px "Microsoft YaHei",sans-serif';
  x.fillText('本次乘务', 16, 34);
  x.strokeStyle = '#b9b3a4'; x.lineWidth = 1;
  for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(16, 56 + i * 30); x.lineTo(240, 56 + i * 30); x.stroke(); }
  x.fillStyle = '#3b444a'; x.font = '500 13px ui-monospace,monospace';
  x.fillText(st.zh, 18, 76);
  x.fillText('6 辆编组  A 型车', 18, 106);
  const t = toTex(c);
  TEX_CACHE.set(key, t);
  return t;
}

class Train {
  constructor(line, route, opts = {}) {
    this.line = line;
    this.route = route;
    this.cars = [];
    this.carCount = opts.cars || 6;
    this.isPlayer = !!opts.player;
    this.group = new THREE.Group();
    this.doorOpen = false;
    this.wheels = [];
    this.cab = null;
    this.lateral = opts.lateral || 0;
    this.dir = opts.dir || 1;
    const mats = carSideMats(line, false);
    this.matsClosed = mats;
    this.matsOpen = carSideMats(line, true);

    for (let i = 0; i < this.carCount; i++) {
      const car = this.buildCar(i, i === 0, opts);
      this.cars.push(car);
      this.group.add(car.group);
    }
    if (this.isPlayer) {
      this.cabDisplay = new CabDisplay();
      this.cab = this.buildCab(this.cars[0]);
      this.cars[0].group.add(this.cab.group);
      this.headlight = this.buildHeadlight(this.cars[0]);
    }
  }
  buildCar(i, isLead, opts) {
    const g = new THREE.Group();
    const line = this.line;
    const mats = carSideMats(line, false);
    // 侧墙
    const sideGeo = new THREE.PlaneGeometry(CAR_LEN, 2.85);
    const right = new THREE.Mesh(sideGeo, mats.right);
    right.position.set(CAR_W / 2, 2.42, 0); right.rotation.y = PI / 2;
    const left = new THREE.Mesh(sideGeo, mats.left);
    left.position.set(-CAR_W / 2, 2.42, 0); left.rotation.y = -PI / 2;
    g.add(right, left);

    // 车顶
    const roof = new THREE.Mesh(new RoundedBoxGeometry(CAR_W, 0.42, CAR_LEN, 3, 0.14), new THREE.MeshStandardMaterial({ color: 0xb9bfc1, roughness: 0.62, metalness: 0.3 }));
    roof.position.y = 3.72;
    g.add(roof);
    // 车顶设备
    const ac = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.34, 5.6), new THREE.MeshStandardMaterial({ color: 0x8f979a, roughness: 0.7, metalness: 0.2 }));
    ac.position.set(0, 3.98, i % 2 ? 3.4 : -3.4);
    g.add(ac);
    // 端部
    const endMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e2, roughness: 0.5, metalness: 0.1 });
    const gang = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.6, 0.5), new THREE.MeshStandardMaterial({ color: 0x2e3438, roughness: 0.85 }));
    gang.position.set(0, 2.3, -CAR_LEN / 2 - 0.16);
    g.add(gang);
    const endFace = new THREE.Mesh(new THREE.PlaneGeometry(CAR_W - 0.1, 2.85), endMat);
    endFace.position.set(0, 2.42, -CAR_LEN / 2 - 0.02);
    endFace.rotation.y = PI;
    g.add(endFace);
    // 底部
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(CAR_W - 0.12, 0.55, CAR_LEN - 0.3), new THREE.MeshStandardMaterial({ color: 0x33393d, roughness: 0.8, metalness: 0.2 }));
    skirt.position.y = 0.92; g.add(skirt);
    const under = new THREE.Mesh(new THREE.BoxGeometry(CAR_W - 0.5, 0.5, CAR_LEN - 1.4), new THREE.MeshStandardMaterial({ color: 0x1c2124, roughness: 0.9 }));
    under.position.y = 0.55; g.add(under);
    // 转向架
    for (const z of [-7.4, 7.4]) {
      const bogie = new THREE.Group();
      bogie.position.set(0, 0, z);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.42, 3.0), new THREE.MeshStandardMaterial({ color: 0x23282b, roughness: 0.8, metalness: 0.4 }));
      frame.position.y = 0.62; bogie.add(frame);
      for (const wx of [-0.78, 0.78]) for (const wz of [-0.95, 0.95]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.14, 16), MAT.rail);
        wheel.rotation.z = PI / 2;
        wheel.position.set(wx, 0.43, wz);
        bogie.add(wheel);
        this.wheels.push(wheel);
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 14), new THREE.MeshStandardMaterial({ color: 0x5a6266, roughness: 0.6, metalness: 0.7 }));
        disc.rotation.z = PI / 2; disc.position.set(wx, 0.43, wz); bogie.add(disc);
      }
      g.add(bogie);
    }
    // 受电弓
    if (i === 1 || i === 3) {
      const p = new THREE.Group();
      p.position.set(0, 4.05, 0);
      const armMat = MAT.darkMetal;
      const baseBar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.1), armMat); p.add(baseBar);
      const a1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.5, 0.07), armMat);
      a1.position.set(0.3, 0.75, 0.25); a1.rotation.x = 0.42; p.add(a1);
      const a2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.5, 0.07), armMat);
      a2.position.set(-0.25, 1.45, -0.15); a2.rotation.x = -0.4; p.add(a2);
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.16), new THREE.MeshStandardMaterial({ color: 0x2a2f31, roughness: 0.5, metalness: 0.8 }));
      head.position.y = 2.2; p.add(head);
      const horn = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.2), MAT.metal);
      horn.position.y = 2.26; p.add(horn);
      g.add(p);
    }
    if (isLead) this.buildNose(g, line, opts);
    const car = { group: g, right, left, index: i, length: CAR_LEN };
    return car;
  }
  buildNose(g, line, opts) {
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xf1f3f2, roughness: 0.38, metalness: 0.18, envMapIntensity: 0.9 });
    const zF = CAR_LEN / 2;
    // 前脸：下部 / 顶部 / 两侧立柱，中间为挡风玻璃开口
    const lower = new THREE.Mesh(new THREE.BoxGeometry(CAR_W - 0.06, 0.62, 0.22), noseMat);
    lower.position.set(0, 1.31, zF - 0.06);
    g.add(lower);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(CAR_W - 0.06, 0.75, 0.22), noseMat);
    upper.position.set(0, 3.425, zF - 0.06);
    g.add(upper);
    for (const sx of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.43, 0.22), noseMat);
      pillar.position.set(sx * 1.33, 2.335, zF - 0.06);
      g.add(pillar);
    }
    // 挡风玻璃
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.34, 1.4), new THREE.MeshPhysicalMaterial({
      color: 0x0d1a22, roughness: 0.06, metalness: 0.85, transparent: true, opacity: 0.9, envMapIntensity: 1.8
    }));
    glass.position.set(0, 2.335, zF + 0.075);
    glass.rotation.x = -0.04;
    g.add(glass);
    this.noseGlass = glass;
    // 雨刷
    for (const x of [-0.62, 0.62]) {
      const wiper = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.78, 0.04), MAT.darkMetal);
      wiper.position.set(x, 2.24, zF + 0.1); wiper.rotation.z = 0.55;
      g.add(wiper);
    }
    // 头灯
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.0, 2.4), toneMapped: false });
    for (const x of [-0.98, 0.98]) {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.34, 0.14), new THREE.MeshStandardMaterial({ color: 0x1d2326, roughness: 0.4, metalness: 0.6 }));
      housing.position.set(x, 1.32, zF + 0.04); g.add(housing);
      for (const dx of [-0.13, 0.13]) {
        const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.075, 12), lampMat);
        lamp.position.set(x + dx, 1.32, zF + 0.12);
        g.add(lamp);
        this.headLamps = this.headLamps || [];
        this.headLamps.push(lamp);
      }
    }
    // 目的地屏
    const destMat = new THREE.MeshBasicMaterial({ map: texDestination(line, opts.dest || line.stations[line.stations.length - 1], true), toneMapped: false });
    const dest = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.39), destMat);
    dest.position.set(0, 3.42, zF + 0.13);
    g.add(dest);
    // 线路号
    const badgeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(line.color), roughness: 0.4, metalness: 0.2, emissive: new THREE.Color(line.color), emissiveIntensity: 0.5 });
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.06), badgeMat);
    badge.position.set(-1.22, 3.4, zF + 0.09); g.add(badge);
    // 车钩
    const coupler = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.7), new THREE.MeshStandardMaterial({ color: 0x363c40, roughness: 0.7, metalness: 0.6 }));
    coupler.position.set(0, 0.86, zF + 0.28); g.add(coupler);
    // 排障器
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x2c3235, roughness: 0.8 }));
    skirt.position.set(0, 0.5, zF + 0.12); g.add(skirt);
    // 侧面过渡
    for (const s of [-1, 1]) {
      const corner = new THREE.Mesh(new THREE.BoxGeometry(0.26, 2.6, 0.4), noseMat);
      corner.position.set(s * (CAR_W / 2 - 0.13), 2.36, zF - 0.2);
      corner.rotation.y = s * 0.16;
      g.add(corner);
    }
  }
  buildHeadlight(car) {
    const spot = new THREE.SpotLight(0xfff2d8, 60, 150, 0.42, 0.5, 1.2);
    spot.position.set(0, 1.7, CAR_LEN / 2 + 0.2);
    const target = new THREE.Object3D();
    target.position.set(0, 0.4, 60);
    car.group.add(spot, target);
    spot.target = target;
    return spot;
  }
  buildCab(car) {
    const g = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xc3cacd, roughness: 0.72, metalness: 0.04 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2c3438, roughness: 0.62, metalness: 0.15 });
    const deskMat = new THREE.MeshStandardMaterial({ color: 0x252c31, roughness: 0.55, metalness: 0.1 });
    const zBack = 7.05, zFront = 10.36;
    // 地板 / 顶板
    pbox(g, 2.86, 0.1, 3.7, new THREE.MeshStandardMaterial({ color: 0x3a4145, roughness: 0.9 }), 0, 1.17, (zBack + zFront) / 2);
    pbox(g, 2.86, 0.08, 3.7, wallMat, 0, 3.52, (zBack + zFront) / 2);
    // 左右侧墙
    pplane(g, 3.7, 2.36, wallMat, -1.43, 2.36, (zBack + zFront) / 2, PI / 2);
    pplane(g, 3.7, 2.36, wallMat, 1.43, 2.36, (zBack + zFront) / 2, -PI / 2);
    // 后墙 + 门洞
    pbox(g, 0.55, 2.36, 0.14, wallMat, -1.14, 2.36, zBack);
    pbox(g, 0.55, 2.36, 0.14, wallMat, 1.14, 2.36, zBack);
    pbox(g, 2.86, 0.45, 0.14, wallMat, 0, 3.3, zBack);
    const cabDoor = pbox(g, 1.72, 1.9, 0.08, new THREE.MeshStandardMaterial({ color: 0x9aa5a9, roughness: 0.6, metalness: 0.2 }), 0, 2.22, zBack + 0.02);
    pbox(g, 0.6, 0.72, 0.04, new THREE.MeshPhysicalMaterial({ color: 0x223038, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.5 }), 0, 2.62, zBack + 0.07);
    // 前墙（挡风窗框）
    pbox(g, 2.86, 0.62, 0.14, wallMat, 0, 1.46, zFront);
    pbox(g, 2.86, 0.72, 0.14, wallMat, 0, 3.2, zFront);
    pbox(g, 0.2, 2.3, 0.14, wallMat, -1.33, 2.35, zFront);
    pbox(g, 0.2, 2.3, 0.14, wallMat, 1.33, 2.35, zFront);
    // 玻璃
    const wglass = new THREE.Mesh(new THREE.PlaneGeometry(2.46, 1.26), new THREE.MeshPhysicalMaterial({
      color: 0x8fb4c4, roughness: 0.03, metalness: 0.2, transparent: true, opacity: 0.075, envMapIntensity: 1.1, side: THREE.DoubleSide
    }));
    wglass.position.set(0, 2.33, zFront + 0.08);
    wglass.rotation.x = -0.04;
    g.add(wglass);
    // 遮阳板
    pbox(g, 2.4, 0.22, 0.05, new THREE.MeshStandardMaterial({ color: 0x1f2629, roughness: 0.8 }), 0, 3.0, zFront - 0.06);
    // 雨刷
    for (const x of [-0.55, 0.55]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.62, 0.03), MAT.darkMetal);
      w.position.set(x, 1.82, zFront - 0.02); w.rotation.z = x > 0 ? -0.7 : 0.7;
      g.add(w);
    }
    // 驾驶台
    const desk = pbox(g, 2.58, 0.16, 0.82, deskMat, 0, 1.68, 9.62);
    desk.rotation.x = -0.08;
    pbox(g, 2.58, 0.5, 0.12, deskMat, 0, 1.4, 9.24);
    // 台面装饰条
    pbox(g, 2.5, 0.02, 0.03, MAT.metal, 0, 1.77, 9.2);
    // 屏幕 1 / 2
    const scrMat1 = new THREE.MeshBasicMaterial({ map: this.cabDisplay.t1, toneMapped: false });
    const scrMat2 = new THREE.MeshBasicMaterial({ map: this.cabDisplay.t2, toneMapped: false });
    const s1 = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.34), scrMat1);
    s1.position.set(-0.62, 1.94, 9.56); s1.rotation.x = -0.34; g.add(s1);
    const s2 = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.34), scrMat2);
    s2.position.set(0.02, 1.94, 9.56); s2.rotation.x = -0.34; g.add(s2);
    pbox(g, 0.62, 0.4, 0.03, darkMat, -0.62, 1.94, 9.56).rotation.x = -0.34;
    pbox(g, 0.62, 0.4, 0.03, darkMat, 0.02, 1.94, 9.56).rotation.x = -0.34;
    // 速度表
    const speedoMat = new THREE.MeshBasicMaterial({ map: this.cabDisplay.speedTex, toneMapped: false });
    const speedo = new THREE.Mesh(new THREE.CircleGeometry(0.19, 32), speedoMat);
    speedo.position.set(-1.02, 1.83, 9.5); speedo.rotation.x = -PI / 2 + 0.35;
    g.add(speedo);
    // 主控手柄
    const leverBase = pbox(g, 0.26, 0.12, 0.44, darkMat, -1.02, 1.79, 9.05);
    const leverPivot = new THREE.Group();
    leverPivot.position.set(-1.02, 1.84, 9.05);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.4, 8), MAT.metal);
    shaft.position.y = 0.2; leverPivot.add(shaft);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 8), new THREE.MeshStandardMaterial({ color: 0x1a1f22, roughness: 0.5 }));
    knob.position.y = 0.42; leverPivot.add(knob);
    g.add(leverPivot);
    this.leverPivot = leverPivot;
    // 按钮面板
    const bpMat = new THREE.MeshBasicMaterial({ map: texButtonPanel(), toneMapped: false });
    const bp = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), bpMat);
    bp.position.set(0.86, 1.78, 9.3); bp.rotation.x = -PI / 2 + 0.18;
    g.add(bp);
    // 紧急制动按钮
    const ebBase = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0x14181a, roughness: 0.7 }));
    ebBase.position.set(1.14, 1.8, 9.55); ebBase.rotation.x = -PI / 2 + 0.2; g.add(ebBase);
    this.ebButton = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.062, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0xc4231f, roughness: 0.35, metalness: 0.2, emissive: 0x5a0d0b, emissiveIntensity: 0.7 }));
    this.ebButton.position.set(1.14, 1.83, 9.55); this.ebButton.rotation.x = -PI / 2 + 0.2; g.add(this.ebButton);
    // 对讲机
    const radio = pbox(g, 0.1, 0.3, 0.18, MAT.darkMetal, 1.4, 2.5, 8.4);
    const handset = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.26, 0.06), new THREE.MeshStandardMaterial({ color: 0x1b2024, roughness: 0.8 }));
    handset.position.set(1.33, 2.32, 8.4); handset.rotation.z = 0.16; g.add(handset);
    // 司机椅
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x1d2a3a, roughness: 0.9 });
    pbox(g, 0.58, 0.14, 0.56, seatMat, -0.55, 1.6, 8.02);
    pbox(g, 0.58, 0.72, 0.12, seatMat, -0.55, 1.98, 7.76);
    pbox(g, 0.1, 0.4, 0.1, MAT.darkMetal, -0.55, 1.35, 8.02);
    // 顶灯
    pbox(g, 0.7, 0.03, 0.18, MAT.lampWarm, 0, 3.46, 8.6);
    // 时刻表夹板
    const clip = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3), new THREE.MeshBasicMaterial({ map: texClipboard(this.line.stations[0]) }));
    clip.position.set(0.62, 1.78, 9.02); clip.rotation.x = -PI / 2 + 0.1;
    g.add(clip);
    // 内部补光
    const lamp = new THREE.PointLight(0xffe6c8, 5.5, 4.2, 2);
    lamp.position.set(-0.2, 3.3, 8.7);
    g.add(lamp);
    // 相机安装点
    this.eyePos = new THREE.Vector3(-0.55, 2.36, 8.42);
    return { group: g };
  }
  bindScreens() {
    this.screenMat1 = null;
  }
  setDoors(open) {
    if (this.doorOpen === open) return;
    this.doorOpen = open;
    const mats = open ? this.matsOpen : this.matsClosed;
    for (const c of this.cars) {
      c.right.material = mats.right;
      c.left.material = mats.left;
    }
  }
  setLever(v) {
    if (this.leverPivot) {
      this.leverPivot.rotation.x = lerp(-0.5, 0.5, (v + 1) / 2);
    }
  }
  update(s, v, dt) {
    for (let i = 0; i < this.cars.length; i++) {
      const dir = this.dir;
      const cs = dir > 0 ? s - 11.4 - i * CAR_PITCH : s + 11.4 + i * CAR_PITCH;
      const f = this.route.frameAt(cs);
      const tan = dir > 0 ? f.tan.clone() : f.tan.clone().negate();
      const right = new THREE.Vector3().crossVectors(f.up, tan).normalize();
      const car = this.cars[i];
      car.group.position.copy(f.pos).addScaledVector(f.right, this.lateral);
      car.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, f.up, tan));
      car.group.updateMatrixWorld();
    }
    for (const w of this.wheels) w.rotation.x -= v * dt / 0.43;
  }
  getCabWorld() {
    const car = this.cars[0];
    const p = car.group.localToWorld(this.eyePos.clone());
    return p;
  }
}


/* ===== 60_audio.js ===== */
/* ================================================================
   音频：VVVF 牵引 / 轮轨 / 制动 / 车门 / 鸣笛 / 报站
   ================================================================ */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.65;
    this.voiceOn = true;
    this.zhVoice = null;
    this.ready = false;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    // 噪声
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    // 牵引
    this.motorGain = ctx.createGain(); this.motorGain.gain.value = 0;
    this.motorFilter = ctx.createBiquadFilter();
    this.motorFilter.type = 'lowpass'; this.motorFilter.frequency.value = 1400; this.motorFilter.Q.value = 3;
    this.motorGain.connect(this.motorFilter); this.motorFilter.connect(this.master);
    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth'; this.osc1.frequency.value = 46;
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'square'; this.osc2.frequency.value = 92;
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    this.osc1.connect(this.motorGain); this.osc2.connect(g2); g2.connect(this.motorGain);
    this.osc1.start(); this.osc2.start();

    // 轮轨
    this.rollGain = ctx.createGain(); this.rollGain.gain.value = 0;
    const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 620; rf.Q.value = 0.7;
    const rn = ctx.createBufferSource(); rn.buffer = buf; rn.loop = true;
    rn.connect(rf); rf.connect(this.rollGain); this.rollGain.connect(this.master);
    rn.start();
    this.rollFilter = rf;

    // 制动
    this.brkGain = ctx.createGain(); this.brkGain.gain.value = 0;
    const bf = ctx.createBiquadFilter(); bf.type = 'highpass'; bf.frequency.value = 1800;
    const bn = ctx.createBufferSource(); bn.buffer = buf; bn.loop = true;
    bn.connect(bf); bf.connect(this.brkGain); this.brkGain.connect(this.master);
    bn.start();

    // 啸叫
    this.sqGain = ctx.createGain(); this.sqGain.gain.value = 0;
    this.sqOsc = ctx.createOscillator(); this.sqOsc.type = 'sine'; this.sqOsc.frequency.value = 2400;
    this.sqOsc.connect(this.sqGain); this.sqGain.connect(this.master); this.sqOsc.start();

    // 车厢环境
    this.ambGain = ctx.createGain(); this.ambGain.gain.value = 0;
    const af = ctx.createBiquadFilter(); af.type = 'lowpass'; af.frequency.value = 260;
    const an = ctx.createBufferSource(); an.buffer = buf; an.loop = true;
    an.connect(af); af.connect(this.ambGain); this.ambGain.connect(this.master);
    an.start();

    this.ready = true;
    this.pickVoice();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => this.pickVoice();
    }
  }
  pickVoice() {
    if (!window.speechSynthesis) return;
    const vs = window.speechSynthesis.getVoices() || [];
    this.zhVoice = vs.find(v => /zh[-_]CN|Chinese|中文|普通话/i.test(v.lang + v.name)) || null;
  }
  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }
  update(dt, st) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const spd = st.speed;
    const f = 44 + spd * 3.1 + st.traction * 26;
    this.osc1.frequency.setTargetAtTime(f, t, 0.08);
    this.osc2.frequency.setTargetAtTime(f * 2.005, t, 0.08);
    const mg = 0.012 + st.traction * 0.085 + Math.min(0.02, spd * 0.0012);
    this.motorGain.gain.setTargetAtTime(mg, t, 0.1);
    this.motorFilter.frequency.setTargetAtTime(700 + spd * 40 + st.traction * 900, t, 0.1);
    this.rollGain.gain.setTargetAtTime(Math.min(0.075, spd * 0.0035) * (st.inTunnel ? 1.25 : 1), t, 0.15);
    this.rollFilter.frequency.setTargetAtTime(420 + spd * 26, t, 0.15);
    const bg = st.brake * Math.min(0.05, 0.012 + spd * 0.0016);
    this.brkGain.gain.setTargetAtTime(bg, t, 0.1);
    const squeal = st.brake > 0.25 && spd < 14 && spd > 0.4 ? 0.011 * st.brake : 0;
    this.sqGain.gain.setTargetAtTime(squeal, t, 0.15);
    this.sqOsc.frequency.setTargetAtTime(1700 + (14 - Math.min(14, spd)) * 110, t, 0.2);
    this.ambGain.gain.setTargetAtTime(0.016 + (st.inTunnel ? 0.006 : 0), t, 0.3);
  }
  chime(kind = 'close') {
    if (!this.ready) return;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.02;
    const notes = kind === 'close' ? [784, 659, 523] : kind === 'open' ? [523, 659] : [880, 740, 587, 440];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0 + i * 0.19);
      g.gain.linearRampToValueAtTime(0.11, t0 + i * 0.19 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + i * 0.19 + 0.42);
      o.connect(g); g.connect(this.master);
      o.start(t0 + i * 0.19); o.stop(t0 + i * 0.19 + 0.45);
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f / 2;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0, t0 + i * 0.19);
      g2.gain.linearRampToValueAtTime(0.05, t0 + i * 0.19 + 0.02);
      g2.gain.exponentialRampToValueAtTime(0.0006, t0 + i * 0.19 + 0.4);
      o2.connect(g2); g2.connect(this.master);
      o2.start(t0 + i * 0.19); o2.stop(t0 + i * 0.19 + 0.45);
    });
  }
  hiss(dur = 0.5, vol = 0.05) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur + 0.05);
  }
  thud() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.14, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.35);
  }
  horn() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [311, 370, 466].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = i === 2 ? 'sine' : 'sawtooth'; o.frequency.value = f;
      const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(i === 2 ? 0.035 : 0.075, t + 0.04);
      g.gain.setValueAtTime(i === 2 ? 0.035 : 0.075, t + 0.55);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
      o.connect(fl); fl.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.9);
    });
  }
  beep(high = false) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (let i = 0; i < (high ? 3 : 1); i++) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = high ? 1180 : 880;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.16);
      g.gain.linearRampToValueAtTime(0.035, t + i * 0.16 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.13);
      o.connect(g); g.connect(this.master);
      o.start(t + i * 0.16); o.stop(t + i * 0.16 + 0.15);
    }
  }
  announce(text, force = false) {
    if (!this.voiceOn && !force) return;
    if (!window.speechSynthesis) return;
    if (!this.zhVoice) { this.pickVoice(); if (!this.zhVoice) return; }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.voice = this.zhVoice; u.rate = 0.94; u.pitch = 1.02; u.volume = Math.min(1, this.volume + 0.25);
      window.speechSynthesis.speak(u);
    } catch (e) { }
  }
}
const AUDIO = new AudioEngine();


/* ===== 70_game.js ===== */
/* ================================================================
   游戏主体：状态机 / 物理 / 停站 / 视角 / HUD
   ================================================================ */
const $ = id => document.getElementById(id);
const G = {
  mode: 'menu',
  routeIdx: 0,
  tod: 'dusk',
  diff: 'normal',
  voice: 'on',
  paused: false,
  s: 0, v: 0, lever: 0, eb: false,
  doorsOpen: false, doorT: 0,
  clock: 0, targetIdx: 0, stopState: 'run',
  stopErr: 0, stopScore: 0,
  results: [], penalties: 0, atpViol: 0, ebCount: 0,
  energy: 0, trainNo: '02014',
  lastSoundDoor: -1,
  camMode: 0, yaw: 0, pitch: -0.02,
  orbit: { az: 0.7, el: 0.26, dist: 34 },
  dragging: false, lastX: 0, lastY: 0,
  finishTimer: -1,
  announced: {},
  ready: false
};

let renderer, camera, scene, composer, bloomPass, sun, skyMesh, hemi;
let path = null, line = null, routeDef = null, theme = THEMES.dusk;
let train = null, aiTrains = [], stationObjs = [], worldGroup = null;
let hero = null;
let clock = new THREE.Clock();
let matInited = false;

/* ---------------------------------------------------------------- 初始化 */
function initRenderer() {
  const canvas = $('scene');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.06, 5200);
  camera.position.set(0, 3, 10);
  window.addEventListener('resize', onResize);
}

function onResize() {
  if (!renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) {
    composer.setSize(window.innerWidth, window.innerHeight);
    if (bloomPass) bloomPass.resolution.set(window.innerWidth, window.innerHeight);
  }
}

function makeComposer(targetScene) {
  if (composer) { composer.dispose(); composer = null; }
  if (G.quality === 'low') return;
  const pr = Math.min(window.devicePixelRatio || 1, 1.6);
  const rt = new THREE.WebGLRenderTarget(Math.floor(window.innerWidth * pr), Math.floor(window.innerHeight * pr), {
    type: THREE.HalfFloatType, samples: 4
  });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(targetScene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), theme.bloom, 0.7, 0.82);
  composer.addPass(bloomPass);
  const vig = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, strength: { value: 0.55 }, time: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
      void main(){ vec4 c=texture2D(tDiffuse,vUv); vec2 p=vUv-0.5; float v=smoothstep(0.85,0.18,length(p)*1.25);
      c.rgb*=mix(1.0-strength*0.55,1.0,v); gl_FragColor=c; }`
  });
  composer.addPass(vig);
  composer.addPass(new OutputPass());
}

/* ---------------------------------------------------------------- 菜单场景 */
function buildHero() {
  const th = THEMES[G.tod];
  const s = new THREE.Scene();
  s.fog = new THREE.FogExp2(th.fog, 0.0026);
  s.add(createSky(th));
  const pm = new THREE.PMREMGenerator(renderer);
  const es = new THREE.Scene(); es.add(createSky(th));
  try { s.environment = pm.fromScene(es, 0.02).texture; } catch (e) { }
  const sunL = new THREE.DirectionalLight(th.sun, th.sunI * 1.1);
  sunL.position.set(-80, 40, 60);
  s.add(sunL);
  s.add(new THREE.HemisphereLight(0xa8c6dc, 0x2a2822, th.hemi * 0.9));

  // 地面
  const g = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: 0x2f3334, roughness: 0.95 }));
  g.rotation.x = -PI / 2; g.position.y = -0.1; s.add(g);

  // 轨道
  const bal = new THREE.Mesh(new THREE.BoxGeometry(11, 0.4, 340), new THREE.MeshStandardMaterial({ map: texBallast(), roughness: 0.95, color: 0xa8adad }));
  bal.position.set(0, -0.22, 60); s.add(bal);
  for (const off of [-3.1175, -1.6825, 1.6825, 3.1175]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 340), MAT.rail);
    r.position.set(off, -0.04, 60); s.add(r);
  }
  // 站台
  const plat = new THREE.Mesh(new THREE.BoxGeometry(8, 1.5, 220), new THREE.MeshStandardMaterial({ map: texPlatformFloor(), roughness: 0.7, color: 0xc9d0d0 }));
  plat.position.set(-8, 0.62, 40); s.add(plat);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.5, 220), MAT.safety);
  edge.position.set(-4.05, 0.62, 40); s.add(edge);
  for (let i = 0; i < 5; i++) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 5.4, 10), MAT.metal);
    col.position.set(-8.5, 3.4, -50 + i * 44); s.add(col);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(14, 0.26, 220), new THREE.MeshStandardMaterial({ color: 0xdfe5e4, roughness: 0.4, metalness: 0.4 }));
  roof.position.set(-8, 6.2, 40); s.add(roof);
  // 远景
  const rng = mulberry32(4242);
  for (let i = 0; i < 60; i++) {
    const h = 20 + rng() * 120;
    const w = 14 + rng() * 26;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshStandardMaterial({
      color: 0x1b222a, roughness: 0.8, metalness: 0.2, emissive: new THREE.Color(0x0a0f14), emissiveIntensity: 1
    }));
    b.position.set(-260 + rng() * 620, h / 2, -120 - rng() * 420);
    s.add(b);
  }

  // 列车
  const fakeRoute = { frameAt: () => ({ pos: new THREE.Vector3(), tan: new THREE.Vector3(0, 0, 1), right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) }), stations: line ? line.stations : [] };
  const t = new Train(line, fakeRoute, { cars: 3, player: false, dest: line.stations[line.stations.length - 1] });
  t.cars.forEach((c, i) => { c.group.position.set(0, 0, 14 - i * CAR_PITCH); });
  t.cars[0].group.position.z = 30;
  t.cars[1].group.position.z = 30 - CAR_PITCH;
  t.cars[2].group.position.z = 30 - 2 * CAR_PITCH;
  s.add(t.group);
  hero = { scene: s, train: t, t: 0, cam: camera };
  return hero;
}

function updateHero(dt) {
  if (!hero) return;
  hero.t += dt;
  const a = -0.72 + Math.sin(hero.t * 0.07) * 0.38;
  const R = 34;
  const cx = Math.sin(a) * R, cz = 30 + Math.cos(a) * R;
  const cy = 7.5 + Math.sin(hero.t * 0.11) * 1.0;
  camera.position.lerp(new THREE.Vector3(cx, cy, cz), 0.04);
  const target = new THREE.Vector3(0, 2.6, 6);
  // 将列车构图偏右
  const dir = target.clone().sub(camera.position).normalize();
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  target.addScaledVector(right, 7.5);
  camera.lookAt(target);
  camera.fov = 48; camera.updateProjectionMatrix();
}

/* ---------------------------------------------------------------- 世界构建 */
async function loadStep(label, pct) {
  $('loadStep').textContent = label;
  $('loadFill').style.width = Math.round(pct * 100) + '%';
  $('loadPct').textContent = Math.round(pct * 100) + '%';
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
}

async function buildService(routeIdx) {
  routeDef = ROUTES[routeIdx];
  line = LINES[routeDef.line];
  theme = THEMES[G.tod];
  G.routeIdx = routeIdx;

  await loadStep('正在解算线路中心线…', 0.04);
  path = new RoutePath(routeDef, line);

  await loadStep('正在初始化材质…', 0.1);
  initMaterials(renderer, theme);
  matInited = true;

  const s = new THREE.Scene();
  scene = s;
  s.fog = new THREE.FogExp2(theme.fog, theme.fogD);
  skyMesh = createSky(theme);
  s.add(skyMesh);
  const pm = new THREE.PMREMGenerator(renderer);
  const es = new THREE.Scene(); es.add(createSky(theme));
  try { s.environment = pm.fromScene(es, 0.02).texture; } catch (e) { }

  hemi = new THREE.HemisphereLight(0xc2d8e8, 0x2c2a22, theme.hemi);
  s.add(hemi);
  s.add(new THREE.AmbientLight(0xffffff, theme.amb * 0.35));
  sun = new THREE.DirectionalLight(theme.sun, theme.sunI);
  sun.position.copy(theme.sunDir).multiplyScalar(200);
  sun.castShadow = G.quality !== 'low';
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.4;
  s.add(sun); s.add(sun.target);

  const root = new THREE.Group();
  worldGroup = root;
  s.add(root);

  await loadStep('正在铺设轨道与道床…', 0.2);
  buildTrack(path, root, G.quality);

  await loadStep('正在开挖隧道…', 0.33);
  buildTunnels(path, root);

  await loadStep('正在架设高架桥…', 0.42);
  buildViaduct(path, root);

  await loadStep('正在还原黄浦江与地面…', 0.5);
  const river = buildGround(path, root);

  await loadStep('正在生成沿线城市…', 0.6);
  buildCity(path, root, river.riverPts);

  await loadStep('正在布置地标建筑…', 0.7);
  buildLandmarks(path, root, theme);

  stationObjs = [];
  for (let i = 0; i < path.stations.length; i++) {
    await loadStep(`正在建造车站  ${path.stations[i].zh}…`, 0.72 + 0.18 * (i / path.stations.length));
    const so = buildStation(path, line, path.stations[i], i, theme);
    root.add(so.group);
    stationObjs.push(so);
  }

  await loadStep('列车整备中…', 0.94);
  train = new Train(line, path, { player: true, dest: path.stations[path.stations.length - 1] });
  root.add(train.group);
  train.group.traverse(o => {
    if (o.isMesh && o.material && o.material.transparent !== true) { o.castShadow = true; o.receiveShadow = true; }
  });

  aiTrains = [];
  for (let i = 0; i < 2; i++) {
    const ai = new Train(line, path, { cars: 6, lateral: 2.4, dir: -1, dest: path.stations[0] });
    ai.aiS = path.length * (0.55 + i * 0.35);
    ai.aiV = 15;
    root.add(ai.group);
    aiTrains.push(ai);
  }

  await loadStep('完成', 1.0);
  makeComposer(scene);
  G.ready = true;
}

/* ---------------------------------------------------------------- 开始 / 重置 */
function resetService() {
  const st = path.stations;
  G.s = st[0].stopS;
  G.v = 0; G.lever = 0; G.eb = false;
  G.doorsOpen = true; G.doorT = 1;
  G.clock = path.startSec - 30;
  G.targetIdx = 0;
  G.stopState = 'dwell';
  G.stopErr = 0; G.stopScore = 0;
  G.results = []; G.penalties = 0; G.atpViol = 0; G.ebCount = 0;
  G.energy = 0; G.finishTimer = -1;
  G.announced = {};
  G.camMode = 0; G.yaw = 0; G.pitch = -0.02;
  train.update(G.s, 0, 0);
  train.setDoors(true);
  stationObjs.forEach((so, i) => {
    so.psdL.setOpen(i === 0 ? 1 : 0);
    so.psdR.setOpen(i === 0 ? 1 : 0);
  });
  buildTimetable();
  updateHUD(true);
  showBanner(st[0].zh, st[0].en);
  toast(`值乘开始 · ${st[0].zh} 站，请关闭车门`, 'good', 5200);
  AUDIO.announce(`欢迎乘坐上海地铁${line.name}，本次列车开往${st[st.length - 1].zh}方向。请关闭车门，准备发车。`);
}

function beginDriving() {
  $('briefing').classList.add('hidden');
  $('hud').classList.add('on');
  G.mode = 'driving';
  G.paused = false;
  clock.getDelta();
  resetService();
  updateCamera(0, true);
}

/* ---------------------------------------------------------------- 物理 */
function stationDist() {
  const st = path.stations[G.targetIdx];
  return st ? st.stopS - G.s : 0;
}

function physics(dt) {
  const st = path.stations[G.targetIdx];
  const v = G.v;
  const speedKmh = v * 3.6;

  // ATP 限速
  const limit = path.atpLimit(G.s, v);
  G.limit = limit;
  const over = speedKmh > limit + 3.2;
  G.atpWarn = over;
  if (speedKmh > limit + 6.5 && !G.eb) {
    triggerEB('ATP 超速防护动作');
  }

  // 手柄 → 牵引/制动
  let traction = 0, brake = 0;
  if (G.eb) brake = 1;
  else if (G.lever > 0.005) traction = G.lever;
  else if (G.lever < -0.005) brake = -G.lever;

  // 车门联锁
  if ((G.doorsOpen || G.doorT > 0.02) && traction > 0) {
    traction = 0;
    if (!G.doorWarned) { toast('车门未关闭，牵引被封锁', 'warn'); AUDIO.beep(); G.doorWarned = true; }
  } else if (!G.doorsOpen && G.doorT < 0.02) G.doorWarned = false;

  let a = 0;
  let force = 0;
  if (traction > 0) {
    let aT = ACC_MAX * traction;
    if (v > 11.1) aT *= 11.1 / v;
    // 载荷修正
    aT *= 0.94;
    a += aT;
    force = aT * 230000;
  }
  if (brake > 0) {
    const aB = (G.eb ? BRK_EMG : BRK_SRV) * brake;
    a -= aB;
  }
  // 基本阻力 + 坡道
  const res = 0.018 + 0.00045 * v + 0.00007 * v * v;
  a -= Math.sign(v || 0) * res;
  a -= 9.81 * path.gradeAt(G.s);

  const nv = v + a * dt;
  if (nv < 0 && brake > 0.01) { G.v = 0; }
  else if (nv < 0) { G.v = Math.max(0, nv); }
  else G.v = nv;
  if (G.v < 0.02 && brake > 0.02) G.v = 0;

  // 停车保持（坡道防溜）
  if (G.v < 0.06 && traction < 0.01 && brake < 0.01) G.v = 0;

  G.s += G.v * dt;
  G.s = clamp(G.s, 0, path.length - 12);

  // 能耗
  if (force > 0) G.energy += force * Math.max(0, G.v) * dt / 3.6e6;

  // 停站判定
  if (st) {
    const dist = st.stopS - G.s;
    if (G.stopState === 'run') {
      if (G.v < 0.05 && Math.abs(dist) < 8) {
        onStopped(st, dist);
      } else if (dist < -8 && G.v > 1) {
        missedStation(st);
      }
    }
    if (G.stopState === 'stop' && G.v > 0.5) {
      onDeparture(st);
    }
    if (G.stopState === 'dwell' && G.v > 0.5) {
      // 门未关强行牵引（已被联锁阻止，这里兜底）
      G.v = 0;
    }
    // 到达预告
    if (G.stopState === 'run' && dist < 420 && dist > 380 && !G.announced['a' + G.targetIdx]) {
      G.announced['a' + G.targetIdx] = true;
      AUDIO.chime('info');
      AUDIO.announce(`下一站，${st.zh}，请从左侧车门下车，请注意站台间隙。`);
      toast(`下一站  ${st.zh}  ·  请准备停车`, 'info', 4200);
    }
  }

  // 车门动画
  const target = G.doorsOpen ? 1 : 0;
  if (G.doorT !== target) {
    G.doorT += Math.sign(target - G.doorT) * dt * 1.5;
    G.doorT = clamp(G.doorT, 0, 1);
    train.setDoors(G.doorT > 0.3);
    const so = stationObjs[G.targetIdx];
    if (so) { so.psdL.setOpen(G.doorT); so.psdR.setOpen(G.doorT); }
  }
}

function triggerEB(reason) {
  if (G.eb) return;
  G.eb = true;
  G.ebCount++;
  G.penalties += 24;
  AUDIO.beep(true);
  toast('紧急制动 · ' + reason, 'bad', 4200);
}

function onStopped(st, dist) {
  G.stopState = 'stop';
  G.stopErr = G.s - st.stopS;
  const e = Math.abs(G.stopErr);
  let base = clamp(100 - 26 * e, 0, 100);
  if (e <= 0.35) base = 100;
  G.stopScore = base;
  if (e <= 0.35) {
    toast(`停车精准 · 偏差 ${(G.stopErr >= 0 ? '+' : '')}${G.stopErr.toFixed(2)} m  ·  +100`, 'good', 5000);
    AUDIO.chime('info');
  } else if (e <= 1.2) {
    toast(`停车良好 · 偏差 ${(G.stopErr >= 0 ? '+' : '')}${G.stopErr.toFixed(2)} m  ·  +${Math.round(base)}`, 'good', 4600);
  } else {
    toast(`停车偏差 ${(G.stopErr >= 0 ? '+' : '')}${G.stopErr.toFixed(2)} m  ·  +${Math.round(base)}`, 'warn', 4600);
  }
  if (G.targetIdx > 0) {
    G.results.push({
      idx: G.targetIdx, zh: st.zh, err: G.stopErr, stopScore: base,
      arrClock: G.clock, schArr: st.schArr, depDelay: 0, punc: 0
    });
  }
  AUDIO.announce(`${st.zh}站，到了。`);
}

function onDeparture(st) {
  G.stopState = 'run';
  const rec = G.results.find(r => r.idx === G.targetIdx);
  const delay = G.clock - st.schDep;
  if (rec) {
    rec.depClock = G.clock; rec.depDelay = delay;
    rec.punc = clamp(100 - 1.5 * Math.abs(delay), 0, 100);
  }
  G.announced['a' + G.targetIdx] = false;
  if (G.targetIdx < path.stations.length - 1) {
    G.targetIdx++;
    const nx = path.stations[G.targetIdx];
    AUDIO.announce(`车门关闭，列车启动，下一站，${nx.zh}。`);
    toast(`发车 · 下一站 ${nx.zh}`, 'info', 4000);
    // 关闭已离开车站的屏蔽门
    const prev = stationObjs[G.targetIdx - 1];
    if (prev) { prev.psdL.setOpen(0); prev.psdR.setOpen(0); }
  }
  updateTimetable();
}

function missedStation(st) {
  toast(`越过 ${st.zh} 停车位置 · 本站未办理乘降`, 'bad', 5000);
  G.penalties += 40;
  G.results.push({ idx: G.targetIdx, zh: st.zh, err: 99, stopScore: 0, arrClock: G.clock, schArr: st.schArr, punc: 0 });
  G.stopState = 'run';
  const prev = stationObjs[G.targetIdx];
  if (prev) { prev.psdL.setOpen(0); prev.psdR.setOpen(0); }
  if (G.targetIdx < path.stations.length - 1) {
    G.targetIdx++;
    updateTimetable();
  } else {
    finishService();
  }
}

/* ---------------------------------------------------------------- 门控 */
function openDoors() {
  if (G.mode !== 'driving' || G.paused) return;
  if (G.doorsOpen) return;
  const st = path.stations[G.targetIdx];
  if (G.v > 0.2) { toast('列车未停稳，车门不能开启', 'warn'); AUDIO.beep(); return; }
  const dist = Math.abs(G.s - st.stopS);
  if (dist > 8) { toast('未对准站台，车门不能开启', 'bad'); AUDIO.beep(); return; }
  if (G.stopState !== 'stop' && G.stopState !== 'dwell') { toast('当前不在停站状态', 'warn'); return; }
  G.doorsOpen = true;
  G.stopState = 'dwell';
  AUDIO.hiss(0.55, 0.045);
  setTimeout(() => AUDIO.thud(), 380);
  AUDIO.chime('open');
  toast('车门开启 · 请确认站台安全', 'good', 3000);
  AUDIO.announce('车门已开启，请先下后上，注意站台间隙。');
  const rec = G.results.find(r => r.idx === G.targetIdx);
  if (rec) {
    rec.arrDelay = G.clock - st.schArr;
  }
  if (G.targetIdx === path.stations.length - 1) {
    G.finishTimer = 6;
    const rec = G.results.find(r => r.idx === G.targetIdx);
    if (rec) {
      rec.punc = clamp(100 - 1.5 * Math.abs(G.clock - st.schArr), 0, 100);
      rec.depDelay = G.clock - st.schArr;
    }
    toast('终到站 · 本次值乘即将结束', 'good', 5000);
  }
}
function closeDoors() {
  if (G.mode !== 'driving' || G.paused) return;
  if (!G.doorsOpen) return;
  G.doorsOpen = false;
  G.stopState = 'stop';
  AUDIO.chime('close');
  AUDIO.hiss(0.5, 0.04);
  setTimeout(() => AUDIO.thud(), 520);
  toast('车门关闭 · 可以发车', 'good', 3000);
}

/* ---------------------------------------------------------------- 结算 */
function finishService() {
  if (G.mode === 'results') return;
  G.mode = 'results';
  const recs = G.results.filter(r => r.idx > 0 || r.idx === 0);
  const stops = G.results.filter(r => r.idx > 0);
  const avgStop = stops.length ? stops.reduce((a, r) => a + r.stopScore, 0) / stops.length : 0;
  const avgPunc = stops.length ? stops.reduce((a, r) => a + r.punc, 0) / stops.length : 0;
  const base = 0.62 * avgStop + 0.38 * avgPunc - G.penalties;
  const score = clamp(Math.round(base), 0, 100);
  const grade = score >= 93 ? 'S' : score >= 84 ? 'A' : score >= 72 ? 'B' : score >= 58 ? 'C' : 'D';
  $('resGrade').textContent = grade;
  $('resScore').textContent = score;
  $('resStop').innerHTML = (stops.length ? (stops.reduce((a, r) => a + Math.abs(r.err), 0) / stops.length).toFixed(2) : '—') + '<small>m</small>';
  $('resPunc').innerHTML = Math.round(avgPunc) + '<small>%</small>';
  $('resKwh').innerHTML = Math.round(G.energy) + '<small>kWh</small>';
  let rows = `<div class="stop-line head"><span>车站</span><span>停车偏差</span><span>发车偏差</span><span>得分</span></div>`;
  for (const r of stops) {
    const s = clamp(Math.round(0.62 * r.stopScore + 0.38 * r.punc), 0, 100);
    rows += `<div class="stop-line"><b>${r.zh}</b><span>${r.err === 99 ? '越站' : ((r.err >= 0 ? '+' : '') + r.err.toFixed(2) + ' m')}</span>
      <span>${r.depDelay === undefined ? '—' : ((r.depDelay >= 0 ? '+' : '') + Math.round(r.depDelay) + ' s')}</span><b>${s}</b></div>`;
  }
  $('resTable').innerHTML = rows;
  $('results').classList.remove('hidden');
  $('hud').classList.remove('on');
  AUDIO.announce(`本次值乘结束，综合评分${score}分，${grade}级。感谢您的驾驶。`);
}

/* ---------------------------------------------------------------- 相机 */
const qFlip = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, PI, 0));

function updateCamera(dt, snap = false) {
  if (!train) return;
  const car = train.cars[0];
  if (G.camMode === 0) {
    const eye = car.group.localToWorld(train.eyePos.clone());
    const shake = Math.min(0.012, G.v * 0.0006);
    eye.x += Math.sin(performance.now() * 0.012) * shake;
    eye.y += Math.sin(performance.now() * 0.017) * shake * 1.4;
    if (snap) camera.position.copy(eye); else camera.position.lerp(eye, 0.55);
    const look = new THREE.Quaternion().setFromEuler(new THREE.Euler(G.pitch, G.yaw, 0, 'YXZ'));
    const q = car.group.quaternion.clone().multiply(qFlip).multiply(look);
    if (snap) camera.quaternion.copy(q); else camera.quaternion.slerp(q, 0.35);
    camera.fov = 58;
    if (train.noseGlass) train.noseGlass.visible = false;
  } else {
    if (train.noseGlass) train.noseGlass.visible = true;
    const nose = path.frameAt(G.s);
    if (G.camMode === 1) {
      const p = nose.pos.clone().addScaledVector(nose.tan, -22).add(new THREE.Vector3(0, 7.4, 0));
      camera.position.lerp(p, snap ? 1 : 0.12);
      camera.lookAt(nose.pos.clone().add(new THREE.Vector3(0, 1.9, 0)).addScaledVector(nose.tan, 6));
      camera.fov = 52;
    } else if (G.camMode === 2) {
      const o = G.orbit;
      const p = nose.pos.clone()
        .addScaledVector(nose.tan, Math.cos(o.az) * o.dist)
        .addScaledVector(nose.right, Math.sin(o.az) * o.dist)
        .add(new THREE.Vector3(0, o.el * o.dist, 0));
      camera.position.lerp(p, snap ? 1 : 0.18);
      camera.lookAt(nose.pos.clone().add(new THREE.Vector3(0, 2.2, 0)));
      camera.fov = 45;
    } else {
      const so = stationObjs[Math.min(G.targetIdx, stationObjs.length - 1)];
      const st = path.stations[Math.min(G.targetIdx, path.stations.length - 1)];
      const base = st.frame.pos.clone()
        .addScaledVector(st.frame.right, -10.5)
        .addScaledVector(st.frame.up, 1.05)
        .addScaledVector(st.frame.tan, -34);
      camera.position.lerp(base, snap ? 1 : 0.1);
      camera.lookAt(nose.pos.clone().add(new THREE.Vector3(0, 2.0, 0)));
      camera.fov = 50;
    }
    camera.updateProjectionMatrix();
  }
  if (G.camMode === 0 && !snap) camera.updateProjectionMatrix();
}

/* ---------------------------------------------------------------- HUD */
function toast(text, kind = 'info', ms = 3400) {
  const area = $('toastArea');
  const d = document.createElement('div');
  d.className = 'toast ' + (kind === 'info' ? '' : kind);
  d.textContent = text;
  area.appendChild(d);
  while (area.children.length > 3) area.removeChild(area.firstChild);
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, ms);
}
function showBanner(zh, en) {
  const b = $('stationBanner');
  b.querySelector('.zh').textContent = zh;
  b.querySelector('.en').textContent = en;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}

let ttRows = [];
function buildTimetable() {
  const box = $('hudTT');
  box.innerHTML = '';
  ttRows = [];
  path.stations.forEach((st, i) => {
    const row = document.createElement('div');
    row.className = 'tt-row' + (i === 0 ? ' now' : '');
    row.innerHTML = `<span class="st"></span><span>${st.zh}</span><span class="t1">${fmtClockShort(st.schArr)}</span><span class="t2">${fmtClockShort(st.schDep)}</span>`;
    box.appendChild(row);
    ttRows.push(row);
  });
  $('hudLine').textContent = line.name;
  $('hudSeg').textContent = routeDef.seg;
  $('hudService').textContent = routeDef.seg;
  document.documentElement.style.setProperty('--line', line.color);
  document.documentElement.style.setProperty('--line-glow', line.color + '59');
}
function updateTimetable() {
  ttRows.forEach((row, i) => {
    row.classList.toggle('now', i === G.targetIdx);
    row.classList.toggle('done', i < G.targetIdx);
  });
}

function updateHUD(force = false) {
  if (!path || !train) return;
  const st = path.stations[G.targetIdx];
  const dist = Math.max(0, st.stopS - G.s);
  $('hudNextZh').textContent = st.zh;
  $('hudNextEn').textContent = st.en;
  $('hudDist').textContent = Math.round(dist);
  $('hudTime').textContent = fmtClock(G.clock);
  $('hudSpeed').textContent = Math.round(G.v * 3.6);
  const lim = Math.round(G.limit || 80);
  $('hudLimit').textContent = lim;
  $('hudLimit').className = G.eb ? 'eb' : (lim < 70 ? 'warn' : '');
  const lv = G.lever;
  $('hudTraction').style.width = (lv > 0 ? lv * 50 : 0) + '%';
  $('hudBrake').style.width = (lv < 0 ? -lv * 50 : 0) + '%';
  $('hudLeverTxt').textContent = G.eb ? '紧急制动' : lv > 0.005 ? `牵引 ${Math.round(lv * 100)}%` : lv < -0.005 ? `制动 ${Math.round(-lv * 100)}%` : '0%';
  $('hudDoorL').classList.toggle('open', G.doorT > 0.1);
  $('hudDoorR').classList.toggle('open', false);
  const progress = clamp(1 - dist / Math.max(1, st.stopS - (G.targetIdx > 0 ? path.stations[G.targetIdx - 1].stopS : 0)), 0, 1);
  $('hudStopFill').style.width = (G.stopState === 'dwell' || G.stopState === 'stop' ? 100 : progress * 100) + '%';
  let status = '区间运行';
  if (G.eb) status = '紧急制动';
  else if (G.stopState === 'dwell') status = '停站作业';
  else if (G.stopState === 'stop') status = '停稳';
  else if (G.atpWarn) status = '超速警告';
  else if (G.targetIdx === path.stations.length - 1 && G.stopState === 'dwell') status = '终到';
  $('hudStatus').textContent = status;
  $('hudStatus').className = (G.eb || G.atpWarn) ? 'late' : '';
  // 停车误差
  if (G.stopState === 'stop' || G.stopState === 'dwell') {
    const e = G.s - st.stopS;
    $('hudStopDelta').textContent = (e >= 0 ? '+' : '') + e.toFixed(2) + ' m';
    $('hudStopDelta').style.color = Math.abs(e) < 0.35 ? '#3ddc97' : Math.abs(e) < 1.5 ? '#ffb020' : '#ff6b5a';
  } else {
    $('hudStopDelta').textContent = dist > 0 ? `${Math.round(dist)} m` : '—';
    $('hudStopDelta').style.color = '';
  }
  // 停站倒计时
  if (G.stopState === 'dwell') {
    const dwell = G.clock - st.schArr;
    $('hudDwell').textContent = `停站 ${Math.max(0, Math.round(dwell))}s`;
  } else if (G.doorsOpen) {
    $('hudDwell').textContent = '开门';
  } else {
    $('hudDwell').textContent = G.v > 0.1 ? '运行中' : '待发车';
  }
}

/* ---------------------------------------------------------------- 主循环 */
function updateGame(dt) {
  if (!G.ready || G.mode !== 'driving') return;
  if (G.paused) return;
  let remain = Math.min(dt, 0.1);
  while (remain > 0.0001) {
    const h = Math.min(1 / 120, remain);
    physics(h);
    remain -= h;
  }
  G.clock += dt;
  if (G.finishTimer > 0) {
    G.finishTimer -= dt;
    if (G.finishTimer <= 0) finishService();
  }
  // 手柄速率控制
  const up = keys['KeyW'] || keys['ArrowUp'];
  const dn = keys['KeyS'] || keys['ArrowDown'];
  if (up && !dn) G.lever = clamp(G.lever + dt * 0.85, -1, 1);
  if (dn && !up) G.lever = clamp(G.lever - dt * 0.85, -1, 1);
  if (!up && !dn && Math.abs(G.lever) < 0.02) G.lever = 0;

  train.setLever(G.lever);
  train.update(G.s, G.v, dt);
  for (const ai of aiTrains) {
    ai.aiS -= ai.aiV * dt;
    if (ai.aiS < 60) ai.aiS = path.length - 60;
    ai.update(ai.aiS, ai.aiV, dt);
  }
  updateCamera(dt);
  updateHUD();
  if (AUDIO.ready) {
    AUDIO.update(dt, {
      speed: G.v,
      traction: G.eb ? 0 : Math.max(0, G.lever),
      brake: G.eb ? 1 : Math.max(0, -G.lever),
      inTunnel: path.frameAt(G.s).pos.y < -2
    });
    if (G.atpWarn && !G.atpBeepT) { AUDIO.beep(); G.atpBeepT = setTimeout(() => { G.atpBeepT = null; }, 1800); }
  }
  // 阳光跟随
  if (sun) {
    const f = path.frameAt(G.s);
    sun.target.position.copy(f.pos);
    sun.position.copy(f.pos).addScaledVector(theme.sunDir.clone().normalize(), 220);
    sun.target.updateMatrixWorld();
  }
  if (skyMesh) skyMesh.position.copy(camera.position);
  // 每秒刷新时刻表
  G._ttT = (G._ttT || 0) + dt;
  if (G._ttT > 0.5) { G._ttT = 0; updateTimetable(); }
}

let lastFrame = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.06, clock.getDelta());
  if (G.mode === 'menu') {
    if (hero) {
      updateHero(dt);
      if (composer && G.quality !== 'low') composer.render(); else renderer.render(hero.scene, camera);
    }
    return;
  }
  if (G.mode === 'loading') {
    if (hero) renderer.render(hero.scene, camera);
    return;
  }
  if (G.mode === 'driving' || G.mode === 'paused' || G.mode === 'results') {
    updateGame(dt);
    if (G.mode === 'driving') { }
    if (composer && G.quality !== 'low') composer.render(); else renderer.render(scene, camera);
  }
}

/* ---------------------------------------------------------------- 输入 */
const keys = {};
function bindInput() {
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    keys[e.code] = true;
    if (G.mode === 'driving') {
      if (e.code === 'KeyO') openDoors();
      if (e.code === 'KeyP') closeDoors();
      if (e.code === 'KeyH') AUDIO.horn();
      if (e.code === 'Space') {
        e.preventDefault();
        if (!G.eb) triggerEB('司机手动施加');
      }
      if (e.code === 'KeyR') {
        if (G.eb && G.v < 0.1) { G.eb = false; toast('紧急制动已缓解', 'good'); AUDIO.hiss(0.4, 0.05); }
        else if (G.eb) toast('列车未停稳，不能缓解紧急制动', 'warn');
        else { G.yaw = 0; G.pitch = -0.02; }
      }
      if (e.code === 'KeyC') { G.camMode = (G.camMode + 1) % 4; toast(['司机室视角', '追车视角', '自由环绕', '站台视角'][G.camMode], 'info', 1600); updateCamera(0, true); }
      if (e.code === 'Escape') togglePause(true);
    } else if (G.mode === 'paused') {
      if (e.code === 'Escape') togglePause(false);
    }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  const canvas = $('scene');
  canvas.addEventListener('pointerdown', e => {
    G.dragging = true; G.lastX = e.clientX; G.lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!G.dragging || G.mode !== 'driving') return;
    const dx = e.clientX - G.lastX, dy = e.clientY - G.lastY;
    G.lastX = e.clientX; G.lastY = e.clientY;
    if (G.camMode === 0) {
      G.yaw = clamp(G.yaw - dx * 0.0032, -1.25, 1.25);
      G.pitch = clamp(G.pitch - dy * 0.0028, -0.55, 0.35);
    } else if (G.camMode === 2) {
      G.orbit.az -= dx * 0.006;
      G.orbit.el = clamp(G.orbit.el + dy * 0.004, 0.02, 1.1);
    }
  });
  canvas.addEventListener('pointerup', e => { G.dragging = false; });
  canvas.addEventListener('wheel', e => {
    if (G.mode !== 'driving') return;
    if (G.camMode === 2) G.orbit.dist = clamp(G.orbit.dist + e.deltaY * 0.03, 12, 140);
  }, { passive: true });
  canvas.addEventListener('contextmenu', e => { e.preventDefault(); G.yaw = 0; G.pitch = -0.02; });

  window.addEventListener('blur', () => { if (G.mode === 'driving') togglePause(true); });
}

function togglePause(on) {
  if (G.mode === 'driving' && on) {
    G.mode = 'paused';
    $('pause').classList.remove('hidden');
    $('pauseSub').textContent = `${line.name} · ${routeDef.seg} · ${path.stations[G.targetIdx].zh}`;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  } else if (G.mode === 'paused' && !on) {
    G.mode = 'driving';
    $('pause').classList.add('hidden');
    clock.getDelta();
  }
}


/* ===== 80_ui.js ===== */
/* ================================================================
   界面接线 / 启动
   ================================================================ */
function routeTT(route) {
  // 站间距离按经纬度近似累加
  let d = 0;
  const st = LINES[route.line].stations;
  for (let i = 0; i < st.length - 1; i++) {
    const a = st[i], b = st[i + 1];
    const dx = (b.lon - a.lon) * 111320 * Math.cos(a.lat * D2R);
    const dz = (b.lat - a.lat) * 111132;
    d += Math.hypot(dx, dz);
  }
  return d / 1000;
}

function routeMapSVG(route) {
  const st = LINES[route.line].stations;
  const l = LINES[route.line];
  const W = 190, H = 64, pad = 10;
  const lats = st.map(s => s.lat), lons = st.map(s => s.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const spanX = (maxLon - minLon) || 1, spanY = (maxLat - minLat) || 1;
  const k = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY);
  const pts = st.map(s => {
    const x = pad + (s.lon - minLon) * k + (W - pad * 2 - spanX * k) / 2;
    const y = H - pad - (s.lat - minLat) * k - (H - pad * 2 - spanY * k) / 2;
    return [x, y];
  });
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const dots = pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.4" fill="#0b0f12" stroke="${l.color}" stroke-width="1.6"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}">
    <path d="${d}" fill="none" stroke="${l.color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>
    ${dots}
    <circle cx="${pts[0][0].toFixed(1)}" cy="${pts[0][1].toFixed(1)}" r="4.2" fill="${l.color}"/>
    <circle cx="${pts[pts.length - 1][0].toFixed(1)}" cy="${pts[pts.length - 1][1].toFixed(1)}" r="4.2" fill="${l.color}"/>
  </svg>`;
}

function renderRouteCards() {
  const box = $('routeList');
  box.innerHTML = '';
  ROUTES.forEach((r, i) => {
    const l = LINES[r.line];
    const km = routeTT(r);
    const card = document.createElement('div');
    card.className = 'route-card';
    card.style.setProperty('--rc', l.color);
    card.dataset.i = i;
    card.innerHTML = `
      <div>
        <div class="rc-line"><span class="rc-badge">${l.badge}</span><span class="rc-seg">${l.name} · ${r.seg} · ${r.segEn}</span></div>
        <div class="rc-title">${r.title}<small>${r.sub}</small></div>
        <div class="rc-meta"><span><i>里程</i> ${km.toFixed(1)} km</span><span><i>车站</i> ${l.stations.length} 座</span><span><i>车底</i> ${l.stock}</span><span><i>编组</i> ${l.cars} 辆</span></div>
        <div class="rc-desc">${r.desc}</div>
      </div>
      <div class="rc-map">${routeMapSVG(r)}</div>`;
    card.addEventListener('click', () => selectRoute(i));
    box.appendChild(card);
  });
}

function selectRoute(i) {
  G.routeIdx = i;
  const def = ROUTES[i];
  const l = LINES[def.line];
  line = l;
  document.querySelectorAll('.route-card').forEach((c, k) => c.classList.toggle('on', k === i));
  $('statDist').textContent = routeTT(def).toFixed(1);
  $('statStops').textContent = l.stations.length;
  document.documentElement.style.setProperty('--line', l.color);
  document.documentElement.style.setProperty('--line-glow', l.color + '66');
  theme = THEMES[G.tod];
  rebuildHero();
}

function rebuildHero() {
  if (hero) {
    hero.train.group.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    hero.scene.traverse(o => { if (o.isMesh && o.geometry && o.geometry !== UNIT_BOX) o.geometry.dispose(); });
    hero = null;
  }
  buildHero();
  makeComposer(hero.scene);
}

function bindMenu() {
  $('todGroup').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    G.tod = b.dataset.v;
    [...$('todGroup').children].forEach(x => x.classList.toggle('on', x === b));
    theme = THEMES[G.tod];
    rebuildHero();
  });
  $('diffGroup').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    G.diff = b.dataset.v;
    [...$('diffGroup').children].forEach(x => x.classList.toggle('on', x === b));
  });
  $('voiceGroup').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    G.voice = b.dataset.v;
    AUDIO.voiceOn = G.voice === 'on';
    [...$('voiceGroup').children].forEach(x => x.classList.toggle('on', x === b));
  });

  $('startBtn').addEventListener('click', () => {
    AUDIO.init();
    AUDIO.setVolume(AUDIO.volume);
    AUDIO.voiceOn = G.voice === 'on';
    theme = THEMES[G.tod];
    const def = ROUTES[G.routeIdx];
    const l = LINES[def.line];
    const st = l.stations;
    $('brTitle').textContent = '出乘简报';
    $('brSub').textContent = `${l.name} · ${def.title}`;
    $('brTrain').textContent = l.badge + '014';
    $('brDepart').textContent = def.start;
    $('brDist').textContent = routeTT(def).toFixed(1) + ' km';
    $('brStops').textContent = (st.length - 1) + ' 站';
    $('brShift').textContent = 'SHIFT ' + (l.badge === '1' ? '0118' : l.badge === '3' ? '0306' : '0214');
    $('briefing').classList.remove('hidden');
  });
  $('brBack').addEventListener('click', () => $('briefing').classList.add('hidden'));
  $('brGo').addEventListener('click', async () => {
    $('briefing').classList.add('hidden');
    $('menu').classList.add('hidden');
    $('hud').classList.remove('on');
    $('loading').classList.remove('hidden');
    G.mode = 'loading';
    try {
      await buildService(G.routeIdx);
      $('loading').classList.add('hidden');
      beginDriving();
    } catch (err) {
      console.error(err);
      $('loadStep').textContent = '构建失败：' + (err && err.message ? err.message : err);
      $('loadPct').textContent = '请刷新页面重试';
    }
  });

  // 暂停
  $('pResume').addEventListener('click', () => togglePause(false));
  $('pRestart').addEventListener('click', () => {
    $('pause').classList.add('hidden');
    G.mode = 'driving';
    clock.getDelta();
    resetService();
  });
  $('pQuit').addEventListener('click', () => location.reload());
  $('volRange').addEventListener('input', e => AUDIO.setVolume(e.target.value / 100));
  $('qualGroup').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    G.quality = b.dataset.v;
    [...$('qualGroup').children].forEach(x => x.classList.toggle('on', x === b));
    if (sun) sun.castShadow = G.quality !== 'low';
  });
  $('resAgain').addEventListener('click', () => {
    $('results').classList.add('hidden');
    $('hud').classList.add('on');
    G.mode = 'driving';
    clock.getDelta();
    resetService();
  });
  $('resMenu').addEventListener('click', () => location.reload());

  window.addEventListener('beforeunload', () => { if (window.speechSynthesis) window.speechSynthesis.cancel(); });
}

/* ---------------------------------------------------------------- 启动 */
function boot() {
  const canvas = $('scene');
  // WebGL 检测
  try {
    const test = document.createElement('canvas');
    if (!(test.getContext('webgl2') || test.getContext('webgl'))) throw new Error('no webgl');
  } catch (e) {
    document.body.innerHTML = '<div style="color:#fff;font:14px system-ui;padding:40px;line-height:2">当前浏览器未启用 WebGL，无法运行本模拟器。<br>请使用最新版 Chrome / Edge，并在设置中开启硬件加速。</div>';
    return;
  }
  initRenderer();
  G.quality = 'high';
  G.mode = 'menu';
  theme = THEMES[G.tod];
  line = LINES[ROUTES[0].line];
  initMaterials(renderer, theme);
  renderRouteCards();
  bindMenu();
  bindInput();
  selectRoute(0);
  loop();
}

try { boot(); } catch (e) {
  console.error(e);
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;background:#05080a;color:#dbe6ed;font:13px/1.9 system-ui;padding:48px;z-index:999';
  el.innerHTML = '<b style="font-size:16px">启动失败</b><br>' + (e && e.message ? e.message : e) + '<br><br>请确认网络可访问 cdn.jsdelivr.net（Three.js 由此加载）。';
  document.body.appendChild(el);
}

/* 调试接口（便于自动化测试） */
window.__sim = {
  G,
  get path() { return path; }, get train() { return train; }, get stationObjs() { return stationObjs; },
  get renderer() { return renderer; }, get scene() { return scene; }, get hero() { return hero; },
  get line() { return line; }, get routeDef() { return routeDef; }, get camera() { return camera; },
  get aiTrains() { return aiTrains; }
};

