/* =====================================================================
   天气：晴 / 雨 / 雾
   —— 雨幕为相机跟随的线段粒子，雾改场景 FogExp2 浓度，雨天降低附着系数
   ===================================================================== */
const WEATHER = {
  clear: { fogMul: 1.0, rain: 0, grip: 1.0, name: '晴' },
  rain: { fogMul: 2.4, rain: 1, grip: 0.86, name: '雨' },
  fog: { fogMul: 6.5, rain: 0, grip: 0.94, name: '雾' }
};

let rainMesh = null, rainPos = null, rainN = 0, rainY = null;
let weatherNow = 'clear';

function buildWeather(scene) {
  const N = 900;
  const arr = new Float32Array(N * 6);
  rainY = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = (Math.random() - 0.5) * 70;
    const y = Math.random() * 36 - 12;
    const z = (Math.random() - 0.5) * 70;
    const len = 0.55 + Math.random() * 0.5;
    arr[i * 6 + 0] = x; arr[i * 6 + 1] = y; arr[i * 6 + 2] = z;
    arr[i * 6 + 3] = x + 0.05; arr[i * 6 + 4] = y - len; arr[i * 6 + 5] = z;
    rainY[i] = y;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xb9d2e2, transparent: true, opacity: 0.46, depthWrite: false });
  rainMesh = new THREE.LineSegments(geo, mat);
  rainMesh.frustumCulled = false;
  rainMesh.visible = false;
  rainMesh.renderOrder = 3;
  scene.add(rainMesh);
  rainPos = arr;
  rainN = N;
}

/* 天气对材质的影响：只改材质参数，不增加任何 mesh 与 pass，
   在 CPU 受限（本机实测瓶颈）的情况下几乎零成本，但观感差别明显。 */
const WEATHER_MAT_BASE = {
  /* platform/ballast 带 roughnessMap，基准必须保持 1.0，否则会整体变亮泽 */
  platform: { roughness: 1.0, metalness: 0.06, env: 1.0 },
  ground: { roughness: 0.95, metalness: 0.02, env: 1.0 },
  ballast: { roughness: 1.0, metalness: 0.00, env: 1.0 },
  concrete: { roughness: 0.90, metalness: 0.03, env: 1.0 }
};

function applyWeatherMaterials() {
  if (typeof MAT === 'undefined') return;
  const wet = weatherNow === 'rain' ? 1 : 0;
  /* 雨天：地面与站台被打湿 → 粗糙度下降、环境反射增强，出现「湿反光」 */
  const apply = (key, mat, wetK) => {
    if (!mat) return;
    const base = WEATHER_MAT_BASE[key];
    mat.roughness = wet ? Math.max(0.18, base.roughness * (1 - 0.72 * wetK)) : base.roughness;
    mat.metalness = wet ? base.metalness + 0.10 * wetK : base.metalness;
    mat.envMapIntensity = wet ? base.env * (1 + 0.8 * wetK) : base.env;
    mat.needsUpdate = true;
  };
  apply('platform', MAT.platform, 1.0);
  apply('ground', MAT.ground, 1.0);
  apply('ballast', MAT.ballast, 0.55);      // 道砟吸水性弱，变化小一些
  apply('concrete', MAT.concrete, 0.35);    // 混凝土墙面只是微湿
}

function applyWeather(w, scene) {
  weatherNow = WEATHER[w] ? w : 'clear';
  const cfg = WEATHER[weatherNow];
  if (rainMesh) rainMesh.visible = cfg.rain > 0;
  if (scene && scene.fog) {
    const base = (THEMES[G.tod] || THEMES.dusk).fogD;
    scene.fog.density = base * cfg.fogMul;
  }
  applyWeatherMaterials();
}

function updateWeather(dt) {
  if (!rainMesh) return;
  const cfg = WEATHER[weatherNow] || WEATHER.clear;
  // 只有露天区段才下雨（隧道内不穿墙）
  let outdoor = true;
  if (typeof path !== 'undefined' && path && typeof G !== 'undefined' && G.mode === 'driving') {
    try { outdoor = path.frameAt(G.s).pos.y > -2.0; } catch (e) { outdoor = true; }
  }
  const show = cfg.rain > 0 && outdoor;
  if (rainMesh.visible !== show) rainMesh.visible = show;
  if (!show) return;
  const cam = camera.position;
  rainMesh.position.set(cam.x, cam.y, cam.z);
  const arr = rainPos;
  const speed = 26 * dt;
  for (let i = 0; i < rainN; i++) {
    const o = i * 6;
    let y = rainY[i] - speed;
    if (y < -14) {
      y += 36;
      const x = (Math.random() - 0.5) * 70;
      const z = (Math.random() - 0.5) * 70;
      arr[o] = x; arr[o + 2] = z;
      arr[o + 3] = x + 0.05; arr[o + 5] = z;
    }
    rainY[i] = y;
    const len = arr[o + 1] - arr[o + 4];
    arr[o + 1] = y;
    arr[o + 4] = y - len;
  }
  rainMesh.geometry.attributes.position.needsUpdate = true;
}

/* 雨天/雾天对制动的影响 */
function weatherGrip() {
  return (WEATHER[weatherNow] || WEATHER.clear).grip;
}

/* 轮轨黏着系数（P3-1）：雨天钢轨有水膜，μ 从 0.33 掉到 0.18。
   与 grip 的区别：grip 是旧的「制动力折扣」，这里给牵引/制动共用的绝对黏着。 */
function weatherMu() {
  if (weatherNow === 'rain') return 0.18;
  if (weatherNow === 'fog') return 0.22;
  return 0.33;
}
