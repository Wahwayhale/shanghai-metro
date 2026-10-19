/* =====================================================================
   上海地铁 · 模拟驾驶  —  Shanghai Metro Driver Simulator
   单文件 WebGL 模拟器 / 非官方粉丝作品
   ===================================================================== */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* ---------------------------------------------------------------- 工具 */
const PI = Math.PI, TAU = PI * 2, D2R = PI / 180;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const KMH = 1 / 3.6;

/* ---- 线路几何统一参数（岛式站台布置） ----
   站台居中，两条正线分列两侧：站台 -4.0~+4.0，屏蔽门 ±4.06，
   列车中心 ±5.72，单洞双线隧道半径 8.1。                        */
const PLAT_HALF = 4.0;      // 站台半宽
const PSD_X = 4.06;         // 屏蔽门位置（站台边缘外侧）
const TRACK_LAT = 5.72;     // 正线中心线横向偏移
const RAIL_HALF = 0.7175;   // 轨距 1.435 的一半
const TUNNEL_R = 8.1;       // 隧道半径
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
    depot: '龙阳路车辆段', stock: 'AC-02 / AC-08', cars: 6, model: 'AC02', vvvf: 'IGBT',
    stations: [
      { zh: '南京东路', en: 'East Nanjing Road', lat: 31.23904, lon: 121.48005, y: -14, tr: ['10号线'], near: '外滩 · 南京路步行街' },
      { zh: '陆家嘴', en: 'Lujiazui', lat: 31.23991, lon: 121.49917, y: -16.5, tr: [], near: '东方明珠 · 上海中心' },
      { zh: '浦东南路', en: 'Pudong South Road', lat: 31.23750, lon: 121.51150, y: -15, tr: [], near: '浦东南路' },
      { zh: '世纪大道', en: 'Century Avenue', lat: 31.23429, lon: 121.52308, y: -14, tr: ['4号线', '6号线', '9号线'], near: '世纪大道枢纽' },
      { zh: '上海科技馆', en: 'Shanghai Science & Technology Museum', lat: 31.22820, lon: 121.53806, y: -13, tr: [], near: '上海科技馆' },
      { zh: '世纪公园', en: 'Century Park', lat: 31.22083, lon: 121.54882, y: -12.5, tr: [], near: '世纪公园' },
      { zh: '龙阳路', en: 'Longyang Road', lat: 31.20486, lon: 121.55728, y: 9.5, tr: ['7号线', '磁浮线'], near: '磁浮龙阳路站' },
      { zh: '张江高科', en: 'Zhangjiang High Technology Park', lat: 31.20375, lon: 121.58651, y: 9.5, tr: [], near: '张江科学城' }
    ]
  },
  {
    id: 'L1', badge: '1', name: '1号线', en: 'Line 1', color: '#E4002B', model: 'AC04', vvvf: 'GTO',
    depot: '梅陇车辆段', stock: 'AC-01 / AC-06', cars: 6,
    stations: [
      { zh: '徐家汇', en: 'Xujiahui', lat: 31.19365, lon: 121.43632, y: -13, tr: ['9号线', '11号线'], near: '徐家汇商圈' },
      { zh: '衡山路', en: 'Hengshan Road', lat: 31.20586, lon: 121.44610, y: -14.5, tr: [], near: '衡山路历史风貌区' },
      { zh: '常熟路', en: 'Changshu Road', lat: 31.21396, lon: 121.44894, y: -15.5, tr: ['7号线'], near: '淮海中路' },
      { zh: '陕西南路', en: 'South Shaanxi Road', lat: 31.21736, lon: 121.45867, y: -15.5, tr: ['10号线', '12号线'], near: '环贸 iapm' },
      { zh: '一大会址·黄陂南路', en: 'Site of the First CPC Congress · S. Huangpi Road', lat: 31.22567, lon: 121.46977, y: -16, tr: [], near: '新天地 · 一大会址' },
      { zh: '人民广场', en: "People's Square", lat: 31.23296, lon: 121.46964, y: -16, tr: ['2号线', '8号线'], near: '人民广场 · 上海博物馆' },
      { zh: '新闸路', en: 'Xinzha Road', lat: 31.24043, lon: 121.46359, y: -15, tr: [], near: '苏州河' },
      { zh: '汉中路', en: 'Hanzhong Road', lat: 31.24750, lon: 121.45974, y: -14, tr: ['12号线', '13号线'], near: '苏州河北岸' },
      { zh: '上海火车站', en: 'Shanghai Railway Station', lat: 31.24960, lon: 121.45580, y: -13, tr: ['3号线', '4号线'], near: '铁路上海站' }
    ]
  },
  {
    id: 'L3', badge: '3', name: '3号线', en: 'Line 3', color: '#FFD100', model: 'AC03', vvvf: 'IGBT',
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
  },
  {
    id: 'L4', badge: '4', name: '4号线', en: 'Line 4', color: '#5A2D82', model: 'AC05', vvvf: 'IGBT',
    depot: '蒲汇塘车辆段', stock: 'AC-05', cars: 6, loop: true,
    stations: [
      { zh: '世纪大道', en: 'Century Avenue', lat: 31.23429, lon: 121.52308, y: -14, tr: ['2号线', '6号线', '9号线'], near: '世纪大道枢纽' },
      { zh: '浦东大道', en: 'Pudong Avenue', lat: 31.24032, lon: 121.51725, y: -13, tr: [], near: '浦东大道' },
      { zh: '杨树浦路', en: 'Yangshupu Road', lat: 31.24864, lon: 121.51682, y: -13, tr: [], near: '杨浦滨江' },
      { zh: '大连路', en: 'Dalian Road', lat: 31.25349, lon: 121.51734, y: -14, tr: ['12号线'], near: '大连路隧道' },
      { zh: '临平路', en: 'Linping Road', lat: 31.25913, lon: 121.50681, y: -13, tr: [], near: '瑞虹新城' },
      { zh: '海伦路', en: 'Hailun Road', lat: 31.26419, lon: 121.49437, y: -14, tr: ['10号线'], near: '音乐谷' },
      { zh: '宝山路', en: 'Baoshan Road', lat: 31.25662, lon: 121.46669, y: -13, tr: ['3号线'], near: '虬江路' },
      { zh: '上海火车站', en: 'Shanghai Railway Station', lat: 31.24960, lon: 121.45580, y: -12, tr: ['1号线', '3号线'], near: '铁路上海站' },
      { zh: '中潭路', en: 'Zhongtan Road', lat: 31.25216, lon: 121.43613, y: -13, tr: [], near: '梦清园' },
      { zh: '镇坪路', en: 'Zhenping Road', lat: 31.24611, lon: 121.42607, y: -14, tr: ['7号线'], near: '苏州河湾' },
      { zh: '曹杨路', en: 'Caoyang Road', lat: 31.23902, lon: 121.40955, y: -13, tr: ['11号线'], near: '曹杨新村' },
      { zh: '金沙江路', en: 'Jinshajiang Road', lat: 31.22897, lon: 121.41116, y: -13, tr: ['13号线'], near: '环球港' },
      { zh: '中山公园', en: 'Zhongshan Park', lat: 31.21974, lon: 121.41988, y: -14, tr: ['2号线', '3号线'], near: '中山公园' },
      { zh: '延安西路', en: 'West Yan\'an Road', lat: 31.21160, lon: 121.42120, y: -13, tr: [], near: '上生新所' },
      { zh: '虹桥路', en: 'Hongqiao Road', lat: 31.19740, lon: 121.42230, y: -14, tr: ['3号线', '10号线'], near: '徐家汇公园' },
      { zh: '宜山路', en: 'Yishan Road', lat: 31.18860, lon: 121.42690, y: -13, tr: ['3号线', '9号线'], near: '宜山路商圈' },
      { zh: '上海体育馆', en: 'Shanghai Indoor Stadium', lat: 31.18340, lon: 121.43720, y: -14, tr: ['1号线'], near: '上海体育馆' },
      { zh: '上海体育场', en: 'Shanghai Stadium', lat: 31.18160, lon: 121.44400, y: -13, tr: [], near: '上海体育场' },
      { zh: '东安路', en: 'Dong\'an Road', lat: 31.19050, lon: 121.45650, y: -14, tr: ['7号线'], near: '龙华医院' },
      { zh: '大木桥路', en: 'Damuqiao Road', lat: 31.19650, lon: 121.46550, y: -13, tr: ['12号线'], near: '枫林路' },
      { zh: '鲁班路', en: 'Luban Road', lat: 31.20150, lon: 121.47250, y: -14, tr: [], near: '卢浦大桥' },
      { zh: '西藏南路', en: 'South Xizang Road', lat: 31.20650, lon: 121.48250, y: -13, tr: ['8号线'], near: '世博浦西园区' },
      { zh: '南浦大桥', en: 'Nanpu Bridge', lat: 31.20950, lon: 121.49350, y: -14, tr: [], near: '南浦大桥' },
      { zh: '塘桥', en: 'Tangqiao', lat: 31.21350, lon: 121.50850, y: -13, tr: [], near: '塘桥' },
      { zh: '蓝村路', en: 'Lancun Road', lat: 31.21850, lon: 121.51750, y: -14, tr: ['6号线'], near: '蓝村路' },
      { zh: '向城路', en: 'Xiangcheng Road', lat: 31.22650, lon: 121.52680, y: -13, tr: [], near: '向城路' }
    ]
  },
  {
    id: 'L34', badge: '3/4', name: '3/4号线', en: 'Line 3 / 4', color: '#FFD100', color2: '#5A2D82',
    model: 'AC03', vvvf: 'IGBT', depot: '石龙路车辆段', stock: 'AC-03 / AC-05', cars: 6, shared: true,
    stations: [
      { zh: '宝山路', en: 'Baoshan Road', lat: 31.25662, lon: 121.46669, y: 10, tr: ['4号线'], near: '虬江路' },
      { zh: '上海火车站', en: 'Shanghai Railway Station', lat: 31.24960, lon: 121.45580, y: 10, tr: ['1号线', '4号线'], near: '铁路上海站' },
      { zh: '中潭路', en: 'Zhongtan Road', lat: 31.25216, lon: 121.43613, y: 10, tr: ['4号线'], near: '梦清园' },
      { zh: '镇坪路', en: 'Zhenping Road', lat: 31.24611, lon: 121.42607, y: 10, tr: ['7号线', '4号线'], near: '苏州河湾' },
      { zh: '曹杨路', en: 'Caoyang Road', lat: 31.23902, lon: 121.40955, y: 10, tr: ['11号线', '4号线'], near: '曹杨新村' },
      { zh: '金沙江路', en: 'Jinshajiang Road', lat: 31.22897, lon: 121.41116, y: 10, tr: ['13号线', '4号线'], near: '环球港' },
      { zh: '中山公园', en: 'Zhongshan Park', lat: 31.21974, lon: 121.41988, y: 10, tr: ['2号线', '4号线'], near: '中山公园' },
      { zh: '延安西路', en: 'West Yan\'an Road', lat: 31.21160, lon: 121.42120, y: 10, tr: ['4号线'], near: '上生新所' },
      { zh: '虹桥路', en: 'Hongqiao Road', lat: 31.19740, lon: 121.42230, y: 10, tr: ['4号线', '10号线'], near: '徐家汇公园' }
    ]
  },
  {
    id: 'L11', badge: '11', name: '11号线', en: 'Line 11', color: '#7A1F3D', model: 'AC06', vvvf: 'IGBT',
    depot: '嘉定车辆段', stock: 'AC-06', cars: 6,
    stations: [
      { zh: '嘉定北', en: 'North Jiading', lat: 31.40190, lon: 121.24000, y: 10, tr: [], near: '嘉定老城' },
      { zh: '嘉定西', en: 'West Jiading', lat: 31.39080, lon: 121.23300, y: 10, tr: [], near: '嘉定西' },
      { zh: '白银路', en: 'Baiyin Road', lat: 31.38300, lon: 121.24700, y: 10, tr: [], near: '嘉定新城' },
      { zh: '嘉定新城', en: 'Jiading Xincheng', lat: 31.37620, lon: 121.25600, y: 10, tr: ['支线'], near: '嘉定新城' },
      { zh: '马陆', en: 'Malu', lat: 31.35800, lon: 121.26800, y: 10, tr: [], near: '马陆葡萄园' },
      { zh: '陈翔公路', en: 'Chenxiang Highway', lat: 31.34400, lon: 121.27900, y: 10, tr: [], near: '陈翔公路' },
      { zh: '南翔', en: 'Nanxiang', lat: 31.32300, lon: 121.29000, y: 10, tr: [], near: '南翔古镇' },
      { zh: '桃浦新村', en: 'Taopu Xincun', lat: 31.29600, lon: 121.31700, y: 10, tr: [], near: '桃浦' },
      { zh: '武威路', en: 'Wuwei Road', lat: 31.28300, lon: 121.33000, y: 10, tr: [], near: '武威路' },
      { zh: '祁连山路', en: 'Qilianshan Road', lat: 31.27400, lon: 121.34000, y: 10, tr: [], near: '祁连山路' },
      { zh: '李子园', en: 'Liziyuan', lat: 31.26600, lon: 121.35000, y: 10, tr: [], near: '李子园' },
      { zh: '上海西站', en: 'Shanghai West Railway Station', lat: 31.25800, lon: 121.36000, y: 10, tr: ['15号线'], near: '铁路上海西站' },
      { zh: '真如', en: 'Zhenru', lat: 31.25100, lon: 121.37000, y: 10, tr: ['14号线'], near: '真如寺' },
      { zh: '枫桥路', en: 'Fengqiao Road', lat: 31.24400, lon: 121.37900, y: 10, tr: [], near: '枫桥路' },
      { zh: '曹杨路', en: 'Caoyang Road', lat: 31.23902, lon: 121.40955, y: 10, tr: ['3号线', '4号线'], near: '曹杨新村' },
      { zh: '隆德路', en: 'Longde Road', lat: 31.23800, lon: 121.38800, y: 10, tr: ['13号线'], near: '隆德路' },
      { zh: '江苏路', en: 'Jiangsu Road', lat: 31.22430, lon: 121.42450, y: -14, tr: ['2号线'], near: '愚园路' },
      { zh: '交通大学', en: 'Jiaotong University', lat: 31.20100, lon: 121.43050, y: -14, tr: [], near: '上海交通大学' },
      { zh: '徐家汇', en: 'Xujiahui', lat: 31.19365, lon: 121.43632, y: -14, tr: ['1号线', '9号线'], near: '徐家汇商圈' }
    ]
  },
  {
    id: 'L16', badge: '16', name: '16号线', en: 'Line 16', color: '#6FC7B4', model: 'AC16', vvvf: 'PM',
    depot: '治北车辆段', stock: 'AC-16', cars: 6, doors: 3, thirdRail: true, vmax: 120,
    stations: [
      { zh: '龙阳路', en: 'Longyang Road', lat: 31.20486, lon: 121.55728, y: 9.5, tr: ['2号线', '7号线', '磁浮线'], near: '磁浮龙阳路站' },
      { zh: '华夏中路', en: 'Middle Huaxia Road', lat: 31.18650, lon: 121.56700, y: 9.5, tr: ['13号线'], near: '华夏中路' },
      { zh: '罗山路', en: 'Luoshan Road', lat: 31.17500, lon: 121.57600, y: 9.5, tr: ['11号线'], near: '罗山路' },
      { zh: '周浦东', en: 'East Zhoupu', lat: 31.16200, lon: 121.58100, y: 9.5, tr: [], near: '周浦' },
      { zh: '鹤沙航城', en: 'Heshahangcheng', lat: 31.14000, lon: 121.59500, y: 9.5, tr: [], near: '航头' },
      { zh: '航头东', en: 'East Hangtou', lat: 31.12500, lon: 121.60800, y: 9.5, tr: [], near: '航头东' },
      { zh: '新场', en: 'Xinchang', lat: 31.06200, lon: 121.64000, y: 9.5, tr: [], near: '新场古镇' },
      { zh: '野生动物园', en: 'Wild Animal Park', lat: 31.04700, lon: 121.66500, y: 9.5, tr: [], near: '上海野生动物园' }
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
  },
  {
    id: 'l4e', line: 3, seg: '环线东段', segEn: 'LOOP EAST',
    title: '世纪大道 → 上海火车站',
    sub: '环线东半圈 · 全线地下 · 换乘密集',
    desc: '4 号线环线的东半圈，从浦东世纪大道出发，沿杨浦滨江北上，穿过大连路、海伦路与宝山路，最后折向西南抵达铁路上海站。这是全网换乘最密集的一段，也是环线运行的代表性交路。',
    tags: ['全线隧道', '环线东段', '换乘密集', '杨浦滨江'],
    start: '09:04:00', dwell: 28, highlights: '杨浦滨江 · 宝山路 · 上海站',
    stations: [
      { zh: '世纪大道', en: 'Century Avenue', lat: 31.23429, lon: 121.52308, y: -14, tr: ['2号线', '6号线', '9号线'], near: '世纪大道枢纽' },
      { zh: '浦东大道', en: 'Pudong Avenue', lat: 31.24032, lon: 121.51725, y: -13, tr: [], near: '浦东大道' },
      { zh: '杨树浦路', en: 'Yangshupu Road', lat: 31.24864, lon: 121.51682, y: -13, tr: [], near: '杨浦滨江' },
      { zh: '大连路', en: 'Dalian Road', lat: 31.25349, lon: 121.51734, y: -14, tr: ['12号线'], near: '大连路隧道' },
      { zh: '临平路', en: 'Linping Road', lat: 31.25913, lon: 121.50681, y: -13, tr: [], near: '瑞虹新城' },
      { zh: '海伦路', en: 'Hailun Road', lat: 31.26419, lon: 121.49437, y: -14, tr: ['10号线'], near: '音乐谷' },
      { zh: '宝山路', en: 'Baoshan Road', lat: 31.25662, lon: 121.46669, y: -13, tr: ['3号线'], near: '虬江路' },
      { zh: '上海火车站', en: 'Shanghai Railway Station', lat: 31.24960, lon: 121.45580, y: -12, tr: ['1号线', '3号线'], near: '铁路上海站' }
    ]
  },
  {
    id: 'l4full', line: 3, seg: '完整环线', segEn: 'FULL LOOP',
    title: '世纪大道 → 世纪大道',
    sub: '环线一周 · 26 站 · 33.4 km',
    desc: '4 号线是全国少见的全地下环线。从世纪大道出发，沿杨浦滨江北上，绕过上海火车站折向西南，穿过曹杨、中山公园，再沿虹桥路、宜山路南下，经上海体育场转回浦东，最后回到世纪大道。一整圈 26 站，不设终点，回到起点才算跑完。',
    tags: ['完整闭环', '26 站', '全地下', '环线运行'],
    start: '08:40:00', dwell: 28, loop: true, highlights: '杨浦滨江 · 中山公园 · 世博园'
  },
  {
    id: 'l34', line: 4, seg: '共线段', segEn: 'SHARED',
    title: '宝山路 → 虹桥路',
    sub: '3/4 号线共线高架 · 9 站',
    desc: '3 号线与 4 号线在宝山路至虹桥路之间共用同一条高架桥。两线的列车在同一条正线上排队运行，站台上同时挂着两种线路色，是上海地铁最特殊的运营区段。',
    tags: ['两线共线', '全线高架', '苏州河', '共用站台'],
    start: '08:20:00', dwell: 26, highlights: '苏州河湾 · 曹杨 · 中山公园'
  },
  {
    id: 'l11a', line: 5, seg: '嘉定段', segEn: 'JIADING',
    title: '嘉定北 → 徐家汇',
    sub: '高架入城 · 19 站 · 跨嘉定与市区',
    desc: '11 号线北段从嘉定老城出发，一路高架南下，经南翔、桃浦进入市区，在隆德路之后入地，穿过江苏路、交通大学抵达徐家汇。前半段是郊区高架的长区间，后半段是市区地下的密集停站。',
    tags: ['郊区高架', '长区间', '入地爬坡', '南翔古镇'],
    start: '07:32:00', dwell: 28, highlights: '嘉定老城 · 南翔 · 徐家汇'
  },
  {
    id: 'l11b', line: 5, seg: '嘉定支线', segEn: 'BRANCH',
    title: '嘉定北 → 花桥',
    sub: '支线分岔 · 11 站 · 跨省运营',
    desc: '11 号线支线在嘉定新城分岔，向西经上海赛车场、昌吉东路、上海汽车城，穿过安亭后继续向西，终到花桥。这是国内第一条跨省运营的城市轨道交通线路，也是全线唯一的支线交路。',
    tags: ['支线分岔', '跨省运营', '赛车场', '安亭'],
    start: '06:58:00', dwell: 26,
    stations: [
      { zh: '嘉定北', en: 'North Jiading', lat: 31.40190, lon: 121.24000, y: 10, tr: [], near: '嘉定老城' },
      { zh: '嘉定西', en: 'West Jiading', lat: 31.39080, lon: 121.23300, y: 10, tr: [], near: '嘉定西' },
      { zh: '白银路', en: 'Baiyin Road', lat: 31.38300, lon: 121.24700, y: 10, tr: [], near: '嘉定新城' },
      { zh: '嘉定新城', en: 'Jiading Xincheng', lat: 31.37620, lon: 121.25600, y: 10, tr: ['11号线'], near: '嘉定新城' },
      { zh: '上海赛车场', en: 'Shanghai Circuit', lat: 31.37200, lon: 121.25800, y: 10, tr: [], near: '上海国际赛车场' },
      { zh: '昌吉东路', en: 'Changji East Road', lat: 31.36900, lon: 121.25000, y: 10, tr: [], near: '昌吉东路' },
      { zh: '上海汽车城', en: 'Shanghai Automobile City', lat: 31.36400, lon: 121.22500, y: 10, tr: [], near: '上海汽车城' },
      { zh: '安亭', en: 'Anting', lat: 31.35600, lon: 121.19000, y: 10, tr: [], near: '安亭镇' },
      { zh: '兆丰路', en: 'Zhaofeng Road', lat: 31.35200, lon: 121.15500, y: 10, tr: [], near: '兆丰路' },
      { zh: '光明路', en: 'Guangming Road', lat: 31.34950, lon: 121.13200, y: 10, tr: [], near: '光明路' },
      { zh: '花桥', en: 'Huaqiao', lat: 31.34800, lon: 121.10800, y: 10, tr: [], near: '花桥国际商务城' }
    ],
    highlights: '赛车场 · 汽车城 · 安亭'
  },
  {
    id: 'l16s', line: 6, seg: '南段', segEn: 'SOUTH',
    title: '龙阳路 → 野生动物园',
    sub: '三开门列车 · 第三轨 · 120 km/h',
    desc: '16 号线是上海地铁里最特别的一条：A 型车每节车厢只有三对车门，采用第三轨受流，最高运行速度 120 km/h。这条交路从龙阳路出发，沿浦东腹地向南，穿过罗山路、周浦东、航头东与新场古镇，终到野生动物园，站间距普遍在 3 公里以上。',
    tags: ['三开门', '第三轨', '120 km/h', '长站距'],
    start: '07:10:00', dwell: 26, highlights: '罗山路 · 周浦东 · 新场古镇'
  },
  {
    id: 'l16e', line: 6, seg: '大站车', segEn: 'EXPRESS',
    title: '龙阳路 → 野生动物园',
    sub: '跳停快车 · 6 站 · 120 km/h',
    desc: '16 号线大站车在龙阳路至野生动物园之间跳停鹤沙航城、航头东，只停靠华夏中路、罗山路、周浦东、新场等主要车站。列车与普通车共用同一条正线，最高运行速度 120 km/h；由于当前线路为单线几何，快车只做跳停运行，不模拟越行。',
    tags: ['大站车', '跳停', '120 km/h', '长站距'],
    start: '07:22:00', dwell: 24, highlights: '华夏中路 · 罗山路 · 新场',
    stopPlan: [0, 1, 2, 3, 6, 7]
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
const ACC_MAX = 1.45;       // m/s^2 牵引（玩家手感偏强）
const POWER_V = 18.0;       // m/s 恒功率转折点（约 65 km/h）
const BRK_SRV = 1.0;        // m/s^2 常用制动
const BRK_EMG = 1.35;       // m/s^2 紧急制动
const JERK_LIMIT = 0.75;    // m/s^3 参考值
const CAR_LEN = 22.8;       // A 型车车长
const CAR_W = 3.0;          // 车宽
const CAR_GAP = 0.35;       // 车钩间隙
const CAR_PITCH = CAR_LEN + CAR_GAP;
const PLATFORM_HALF = 70;   // 站台半长，停车标位于 +70

/* ---------------- 多质点车钩动力学参数 ----------------
   每节车独立质量，车钩用「弹簧 + 阻尼 + 自由间隙」建模。
   直接产物：起动时后车滞后、制动时后车顶上来、坡道上车钩受力不均、
   停车时有真实的纵向冲动，而不是原来那条假的正弦 carLag。 */
const BODY = {
  n: 6,                     // 编组辆数
  mass: 38000,              // 单节车质量 kg（满载 A 型车量级）
  k: 1.5e6,                 // 车钩刚度 N/m（固有频率约 1.4 Hz）
  c: 1.2e5,                 // 车钩阻尼 N·s/m（约 0.35 临界阻尼）
  slack: 0.03,              // 车钩自由间隙 m（单侧），6 辆共约 0.15 m
  /* 间隙内的缓冲器阻尼：间隙内弹簧不起作用，但油压缓冲器仍有阻力，
     否则车辆会在间隙里无限自由蠕滑，停车后编组长度慢慢漂移 */
  cSlack: 4.5e4,            // N·s/m
  /* 动拖比 4 动 2 拖（平均为 1）：动车出力，拖车被拖动 → 产生真实车钩力 */
  motor: [1.5, 1.5, 0, 0, 1.5, 1.5],
  brakeBias: 0.06           // 前端制动力略高 → 制动时车钩受压、后车顶上来
};

function estimateRunTime(dist, vmaxKmh = VMAX) {
  const v = vmaxKmh * KMH;
  const da = v * v / (2 * ACC_MAX), db = v * v / (2 * BRK_SRV);
  if (da + db < dist) return v / ACC_MAX + v / BRK_SRV + (dist - da - db) / v;
  const vp = Math.sqrt(2 * dist * ACC_MAX * BRK_SRV / (ACC_MAX + BRK_SRV));
  return vp / ACC_MAX + vp / BRK_SRV;
}
