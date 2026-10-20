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

/* ---------------------------------------------------------------------
   buildCityProtos：把一组建筑实例按原型分组，各建一个 InstancedMesh
   ---------------------------------------------------------------------
   items: [{ proto, x, y, z, w, h, d, rot, tint }]
     tint 是 0..1 的明度抖动，用 instanceColor 实现，
     这样同一种原型不需要为「颜色不同」再开 draw call。
   返回实际创建的 InstancedMesh 数量（用于 draw call 统计）。
   --------------------------------------------------------------------- */
function buildCityProtos(group, items, material) {
  if (!items || !items.length) return 0;
  const byProto = new Map();
  for (const it of items) {
    const k = CITY_PROTO_DEF[it.proto] ? it.proto : 'slab';
    if (!byProto.has(k)) byProto.set(k, []);
    byProto.get(k).push(it);
  }

  const d = new THREE.Object3D();
  const col = new THREE.Color();
  let created = 0;

  for (const [name, arr] of byProto) {
    const proto = cityProto(name);
    const im = new THREE.InstancedMesh(proto.geo, material, arr.length);
    im.frustumCulled = false;
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
    group.add(im);
    created++;
  }
  return created;
}
