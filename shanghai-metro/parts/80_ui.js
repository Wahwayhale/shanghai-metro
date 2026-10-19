/* ================================================================
   界面接线 / 启动
   ================================================================ */
function routeTT(route) {
  // 站间距离按经纬度近似累加
  let d = 0;
  const st = route.stations || LINES[route.line].stations;
  const seg = (a, b) => {
    const dx = (b.lon - a.lon) * 111320 * Math.cos(a.lat * D2R);
    const dz = (b.lat - a.lat) * 111132;
    return Math.hypot(dx, dz);
  };
  for (let i = 0; i < st.length - 1; i++) d += seg(st[i], st[i + 1]);
  if (route.loop) d += seg(st[st.length - 1], st[0]);
  return d / 1000;
}

function routeMapSVG(route) {
  const allSt = route.stations || LINES[route.line].stations;
  const st = route.stopPlan ? allSt.filter((_, i) => route.stopPlan.includes(i)) : allSt;
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
  let d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  if (route.loop) d += ' Z';
  const dots = pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.4" fill="#0b0f12" stroke="${l.color}" stroke-width="1.6"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}">
    <path d="${d}" fill="none" stroke="${l.color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>
    ${dots}
    <circle cx="${pts[0][0].toFixed(1)}" cy="${pts[0][1].toFixed(1)}" r="4.2" fill="${l.color}"/>
    <circle cx="${pts[pts.length - 1][0].toFixed(1)}" cy="${pts[pts.length - 1][1].toFixed(1)}" r="4.2" fill="${l.color}"/>
  </svg>`;
}

/* ---------------- 生涯进度（本地存档） ---------------- */
function loadCareer() {
  try { return JSON.parse(localStorage.getItem('sm_career') || '{}'); } catch (e) { return {}; }
}
function saveCareer(id, score, grade) {
  const c = loadCareer();
  if (!c[id] || score > c[id].score) c[id] = { score, grade };
  try { localStorage.setItem('sm_career', JSON.stringify(c)); } catch (e) { console.warn('[career] 存档写入失败', e); }
}

function renderRouteCards() {
  const box = $('routeList');
  const career = loadCareer();
  $('statRoutes') && ($('statRoutes').textContent = ROUTES.length);
  box.innerHTML = '';
  ROUTES.forEach((r, i) => {
    const l = LINES[r.line];
    const km = routeTT(r);
    const card = document.createElement('div');
    card.className = 'route-card';
    card.style.setProperty('--rc', l.color);
    if (l.color2) {
      card.classList.add('dual');
      card.style.setProperty('--rc2', l.color2);
    }
    card.dataset.i = i;
    const best = career[r.id], rev = career[r.id + ':rev'];
    card.innerHTML = `
      <div>
        <div class="rc-line"><span class="rc-badge">${l.badge}</span><span class="rc-seg">${l.name} · ${r.seg} · ${r.segEn}</span>${best ? `<span class="rc-career">${best.grade} · ${best.score}</span>` : ''}${rev ? `<span class="rc-career rev">反 ${rev.grade} · ${rev.score}</span>` : ''}</div>
        <div class="rc-title">${r.title}<small>${r.sub}</small></div>
        <div class="rc-meta"><span><i>里程</i> ${km.toFixed(1)} km</span><span><i>车站</i> ${r.stopPlan ? r.stopPlan.length : (r.stations || l.stations).length} 座</span><span><i>车底</i> ${l.stock}</span><span><i>编组</i> ${l.cars} 辆</span></div>
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
  $('statStops').textContent = def.stopPlan ? def.stopPlan.length : (def.stations || l.stations).length;
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
  $('weatherGroup').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    G.weather = b.dataset.v;
    [...$('weatherGroup').children].forEach(x => x.classList.toggle('on', x === b));
    applyWeather(G.weather, scene);
    toast('天气 · ' + (WEATHER[G.weather] || WEATHER.clear).name, 'info', 1600);
  });
  $('modeGroup').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    G.exam = b.dataset.v === 'exam';
    [...$('modeGroup').children].forEach(x => x.classList.toggle('on', x === b));
    toast(G.exam ? '执照考试模式 · 五项考核全部达标才算通过' : '普通值乘模式', 'info', 2600);
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
    const st = def.stations || l.stations;
    $('brTitle').textContent = '出乘简报';
    $('brSub').textContent = `${l.name} · ${def.title}`;
    $('brTrain').textContent = l.badge + '014';
    $('brDepart').textContent = def.start;
    const hasOfficial = (typeof OFFICIAL_RUN !== 'undefined' && OFFICIAL_RUN[def.id])
      || (typeof OFFICIAL_RUN_NETWORK !== 'undefined' && OFFICIAL_RUN_NETWORK[def.id]);
    $('brTimes').textContent = hasOfficial ? '官方首末班车推导' : '物理曲线估算';
    $('brDist').textContent = routeTT(def).toFixed(1) + ' km';
    $('brStops').textContent = (def.stopPlan ? def.stopPlan.length - 1 : (st.length - 1 + (def.loop ? 1 : 0))) + ' 站';
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
  $('shakeGroup').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    G.shakeOn = b.dataset.v === 'on';
    [...$('shakeGroup').children].forEach(x => x.classList.toggle('on', x === b));
  });
  $('resAgain').addEventListener('click', () => {
    $('results').classList.add('hidden');
    $('hud').classList.add('on');
    G.mode = 'driving';
    clock.getDelta();
    resetService();
  });
  $('resReverse') && $('resReverse').addEventListener('click', () => startTurnback());
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
  ATS.init();
  IX.init();
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
  get aiTrains() { return aiTrains; },
  get audio() { return AUDIO; },
  get routes() { return ROUTES; },
  get lines() { return LINES; },
  showTransferPanel, clampWalk,
  get signals() { return signals; },
  get IX() { return IX; },
  get sigMeshes() { return sigLampMeshes; },
  snapCam() { updateCamera(0, true); },
  snapTrain() { if (train) train.update(G.s, G.v, 0); },
  advance(sec) {
    const h = 0.02; const n = Math.round(sec / h);
    for (let i = 0; i < n; i++) { physics(h); for (const ai of aiTrains) ai.update(h); G.clock += h; }
    train.update(G.s, G.v, 0); updateHUD(true); return { s: G.s, v: G.v, state: G.stopState, target: G.targetIdx, doors: G.doorT };
  },
  setLever(v) { G.lever = v; },
  openDoors, closeDoors, finishService, releaseEB, triggerEB, toggleATO,
  startTurnback, performTransfer,
  advanceTurnback(sec) {
    const n = Math.round(sec / 0.02);
    for (let i = 0; i < n; i++) updateTurnback(0.02);
    return { mode: G.mode, s: G.s, tb: G.turnback };
  },
  getKeys() { return { ...keys }; },
  setFreeCam(pos, look, fov) { G.freeCam = pos ? { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look), fov } : null; }
};
