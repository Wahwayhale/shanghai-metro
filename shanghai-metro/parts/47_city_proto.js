/* =====================================================================
   建筑原型库（P5-1 / v2.0）
   ---------------------------------------------------------------------
   每个原型是一份**合并好的几何**（几种基础体拼成），运行时按原型分组用
   InstancedMesh 绘制。8 种原型 = 8 个 draw call，这是城市能加入而不拖垮
   帧率的前提（当前总 draw call 975，瓶颈在 CPU）。

   坐标系约定：原型立在原点，底面 y=0，朝向 +z。
   几何按**参考尺寸**建（ref），实例用 (w/ref.w, h/ref.h, d/ref.d) 缩放。
   非等比缩放会让细节轻微变形，但在城市尺度下看不出来，换来的是
   一套几何能吃下任意长宽高组合。
   ===================================================================== */

/* 合并工具：把若干已 translate 的几何合成一个 */
function protoMerge(parts) {
  if (typeof BufferGeometryUtils === 'undefined' || !BufferGeometryUtils.mergeGeometries) {
    /* 兜底：合并不可用时返回第一个（不会崩，只是少了细节） */
    return parts[0];
  }
  const merged = BufferGeometryUtils.mergeGeometries(parts, false);
  return merged || parts[0];
}

/* 一个盒子，中心落在 (x, y, z) */
function protoBox(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x || 0, y || 0, z || 0);
  return g;
}

/* ---------------- 8 种原型 ---------------- */

const CITY_PROTO_DEF = {
  /* 板楼：住宅主力。主体 + 女儿墙 + 屋顶电梯机房 */
  slab: () => ({
    ref: { w: 32, h: 58, d: 13 },
    geo: protoMerge([
      protoBox(32, 56, 13, 0, 28, 0),
      protoBox(32.8, 1.4, 13.8, 0, 56.7, 0),      // 女儿墙
      protoBox(6, 3.2, 6, -8, 58.2, 0)            // 电梯机房
    ])
  }),

  /* 矩形塔楼：商务区主力 */
  tower: () => ({
    ref: { w: 28, h: 108, d: 28 },
    geo: protoMerge([
      protoBox(28, 104, 28, 0, 52, 0),
      protoBox(29, 1.6, 29, 0, 105, 0),
      protoBox(9, 4.5, 9, 0, 108, 0)              // 屋顶机房
    ])
  }),

  /* 退台塔楼：核心商务区地标式体量，三段收分 + 顶冠 */
  towerSetback: () => ({
    ref: { w: 36, h: 178, d: 36 },
    geo: protoMerge([
      protoBox(36, 96, 36, 0, 48, 0),
      protoBox(30, 52, 30, 0, 122, 0),
      protoBox(23, 32, 23, 0, 164, 0),
      protoBox(25, 2.2, 25, 0, 97.5, 0),          // 第一段收分线脚
      protoBox(19, 1.8, 19, 0, 148.5, 0),         // 第二段线脚
      protoBox(11, 9, 11, 0, 182, 0)              // 顶冠
    ])
  }),

  /* 裙房 + 塔楼：商场上盖综合体 */
  podium: () => ({
    ref: { w: 52, h: 96, d: 44 },
    geo: protoMerge([
      protoBox(52, 20, 44, 0, 10, 0),             // 裙房
      protoBox(53, 1.2, 45, 0, 20.6, 0),
      protoBox(26, 72, 24, 0, 56, 0),             // 塔楼
      protoBox(27, 1.4, 25, 0, 92.5, 0),
      protoBox(8, 3.5, 8, 0, 95, 0)
    ])
  }),

  /* 低层洋房：衡复风貌区。主体 + 简单坡顶 + 烟囱 */
  villa: () => ({
    ref: { w: 16, h: 15, d: 13 },
    geo: protoMerge([
      protoBox(16, 11, 13, 0, 5.5, 0),
      protoBox(14, 3.4, 11, 0, 12.7, 0),          // 坡顶近似（收窄一段）
      protoBox(11, 1.6, 9, 0, 14.8, 0),
      protoBox(1.2, 2.4, 1.2, 4, 12, 2)           // 烟囱
    ])
  }),

  /* 老式里弄：三开间连排，山墙分隔 */
  lane: () => ({
    ref: { w: 27, h: 13, d: 11 },
    geo: protoMerge([
      protoBox(8.4, 12, 11, -9.2, 6, 0),
      protoBox(8.4, 12, 11, 0, 6, 0),
      protoBox(8.4, 12, 11, 9.2, 6, 0),
      protoBox(27.6, 1.2, 11.6, 0, 12.6, 0),      // 统一檐口
      protoBox(27.6, 0.8, 11.2, 0, 0.4, 0)        // 台基
    ])
  }),

  /* 大跨厂房：锯齿屋顶 + 高侧窗带 */
  factory: () => ({
    ref: { w: 62, h: 18, d: 32 },
    geo: protoMerge([
      protoBox(62, 14, 32, 0, 7, 0),
      protoBox(20, 3.2, 33, -20, 15.6, 0),        // 锯齿顶（三段坡）
      protoBox(20, 3.2, 33, 0, 15.6, 0),
      protoBox(20, 3.2, 33, 20, 15.6, 0),
      protoBox(63, 1.0, 33, 0, 14.2, 0)
    ])
  }),

  /* 外滩历史建筑：厚重的石砌体量 + 檐口 + 中部塔冠 */
  heritage: () => ({
    ref: { w: 34, h: 42, d: 26 },
    geo: protoMerge([
      protoBox(34, 32, 26, 0, 16, 0),
      protoBox(35.2, 2.4, 27.2, 0, 33.2, 0),      // 檐口
      protoBox(24, 6, 20, 0, 37.5, 0),            // 退台
      protoBox(18, 4, 16, 0, 41, 0),
      protoBox(2.4, 3.6, 24, 0, 0, 13.2)          // 门廊柱列（前脸）
    ])
  }),

  /* 筒仓 / 冷却塔：工业带点缀 */
  silo: () => ({
    ref: { w: 14, h: 34, d: 14 },
    geo: protoMerge([
      (() => { const g = new THREE.CylinderGeometry(6.4, 7.2, 32, 14); g.translate(0, 16, 0); return g; })(),
      (() => { const g = new THREE.CylinderGeometry(7.4, 7.4, 2, 14); g.translate(0, 33, 0); return g; })()
    ])
  })
};

const CITY_PROTO_CACHE = new Map();

/* 取原型（懒构造 + 缓存）。返回 { name, ref, geo } */
function cityProto(name) {
  const key = CITY_PROTO_DEF[name] ? name : 'slab';
  if (CITY_PROTO_CACHE.has(key)) return CITY_PROTO_CACHE.get(key);
  const built = CITY_PROTO_DEF[key]();
  const out = { name: key, ref: built.ref, geo: built.geo };
  CITY_PROTO_CACHE.set(key, out);
  return out;
}

/* 远景 LOD：只保留一个盒子（12 三角面）。
   原型本体 36–112 三角面，远景下这些细节完全看不见，但乘上几千栋就是
   十几万面。换成盒子几何后，同一批实例的三角面降到 1/4 ~ 1/8。 */
const CITY_FAR_GEO_CACHE = new Map();
function cityProtoFar(name) {
  const p = cityProto(name);
  if (CITY_FAR_GEO_CACHE.has(p.name)) return CITY_FAR_GEO_CACHE.get(p.name);
  const g = new THREE.BoxGeometry(p.ref.w, p.ref.h, p.ref.d);
  g.translate(0, p.ref.h / 2, 0);
  CITY_FAR_GEO_CACHE.set(p.name, g);
  return g;
}

/* ---------------- 分块 + LOD 的城市实例化 ----------------
   为什么要分块：
   全局一个 InstancedMesh 时，`frustumCulled=false` —— 相机背后的建筑
   也会被提交。分块后每个块是一个独立 mesh，`frustumCulled=true`，
   three.js 会把不在视锥内的块**连 draw call 一起跳过**。
   实测 1 号线城市约 1568 栋 / 8.6 万面，占全场景 200 万面的 4%，
   所以省面本身收益不大；真正的收益是「相机背后的块完全不提交」。

   块大小 1200 m：太小会让 draw call 变多（CPU 是当前瓶颈），
   太大又失去了视锥剔除的粒度。1200 m 在一条 30 km 线路上约 25 个块。
   --------------------------------------------------------------------- */
const CITY_CHUNK = 1200;         // 分块边长（米）
const CITY_LOD_DIST = 750;       // 超过这个距离改用远景盒子
const CITY_VISIBLE_DIST = 3200;  // 超过这个距离整块隐藏

let cityChunks = [];             // [{ cx, cz, near: [mesh], far: [mesh], x, z }]
let cityMatRef = null;

function buildCityChunked(group, items, material) {
  cityChunks = [];
  cityMatRef = material;
  if (!items || !items.length) return { chunks: 0, meshes: 0 };

  /* 按块 × 原型归类 */
  const buckets = new Map();
  for (const it of items) {
    const kx = Math.floor(it.x / CITY_CHUNK);
    const kz = Math.floor(it.z / CITY_CHUNK);
    const key = kx + ',' + kz;
    let ch = buckets.get(key);
    if (!ch) {
      ch = { kx, kz, byProto: new Map() };
      buckets.set(key, ch);
    }
    const pk = CITY_PROTO_DEF[it.proto] ? it.proto : 'slab';
    if (!ch.byProto.has(pk)) ch.byProto.set(pk, []);
    ch.byProto.get(pk).push(it);
  }

  const d = new THREE.Object3D();
  const col = new THREE.Color();
  let meshCount = 0;

  const makeMesh = (protoName, arr, far) => {
    const proto = cityProto(protoName);
    const geo = far ? cityProtoFar(protoName) : proto.geo;
    const im = new THREE.InstancedMesh(geo, material, arr.length);
    im.frustumCulled = true;          // 关键：让 three.js 跳过视锥外的块
    arr.forEach((it, i) => {
      d.position.set(it.x, it.y || 0, it.z);
      d.rotation.set(0, it.rot || 0, 0);
      d.scale.set(
        Math.max(0.05, it.w / proto.ref.w),
        Math.max(0.05, it.h / proto.ref.h),
        Math.max(0.05, it.d / proto.ref.d)
      );
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
      const t = it.tint == null ? 1 : it.tint;
      col.setRGB(t, t, t * (0.97 + (it.warmth || 0) * 0.06));
      im.setColorAt(i, col);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = false;
    im.receiveShadow = false;
    im.visible = false;               // 由 updateCityLOD 决定
    group.add(im);
    meshCount++;
    return im;
  };

  for (const [, ch] of buckets) {
    const near = [], far = [];
    for (const [pk, arr] of ch.byProto) {
      near.push(makeMesh(pk, arr, false));
      far.push(makeMesh(pk, arr, true));
    }
    /* 块中心用于距离判定 */
    let sx = 0, sz = 0, n = 0;
    for (const [, arr] of ch.byProto) for (const it of arr) { sx += it.x; sz += it.z; n++; }
    cityChunks.push({ near, far, x: sx / n, z: sz / n });
  }

  return { chunks: cityChunks.length, meshes: meshCount };
}

/* 每帧调用：按相机距离切换 LOD 与整块可见性。
   只遍历 chunk（约 25 个），不做任何矩阵运算，开销可忽略。
   LOD 与可见性都带**滞回**（进入用近阈值、退出用远阈值），
   否则相机停在阈值上时整块会在「细节/盒子」之间反复跳变。 */
const CITY_LOD_HYST = 90;        // LOD 切换滞回（米）
const CITY_VIS_HYST = 220;       // 可见性切换滞回（米）

function updateCityLOD(camPos) {
  if (!cityChunks.length || !camPos) return;
  for (const ch of cityChunks) {
    const dx = ch.x - camPos.x, dz = ch.z - camPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    /* 沿用上一帧状态做滞回判断 */
    const wasNear = ch.isNear !== undefined ? ch.isNear : (dist < CITY_LOD_DIST);
    const wasVis = ch.visible !== undefined ? ch.visible : (dist < CITY_VISIBLE_DIST);

    const isNear = wasNear ? dist < CITY_LOD_DIST + CITY_LOD_HYST : dist < CITY_LOD_DIST - CITY_LOD_HYST;
    const vis = wasVis ? dist < CITY_VISIBLE_DIST + CITY_VIS_HYST : dist < CITY_VISIBLE_DIST - CITY_VIS_HYST;

    ch.isNear = isNear;
    ch.visible = vis;
    for (const m of ch.near) m.visible = vis && isNear;
    for (const m of ch.far) m.visible = vis && !isNear;
  }
}

/* 兼容旧调用：不想要分块时仍可用（当前 buildCity 已改走分块版本） */
function buildCityProtos(group, items, material) {
  const r = buildCityChunked(group, items, material);
  return r.chunks ? r.chunks : 0;
}
