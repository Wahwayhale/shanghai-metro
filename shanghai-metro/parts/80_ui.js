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

/* ---------------- 生涯进度（本地存档，按线路分层） ----------------
   存储结构：
     sm_career  { routeId: {score, grade}, routeId:rev: {...} }   逐交路最高分
   导出结构（带版本与时间戳，便于跨设备迁移）：
     { v:1, at:<ISO>, routes:{...}, settings:{...} }
   分层目的：用户换电脑/清缓存后能带走成绩，不再「一清就没」。 */
function loadCareer() {
  try { return JSON.parse(localStorage.getItem('sm_career') || '{}'); } catch (e) { return {}; }
}
function saveCareer(id, score, grade) {
  const c = loadCareer();
  if (!c[id] || score > c[id].score) c[id] = { score, grade };
  try { localStorage.setItem('sm_career', JSON.stringify(c)); } catch (e) { console.warn('[career] 存档写入失败', e); }
}

/** 按线路分组，供菜单显示「本线已完成几个交路」 */
function careerByLine() {
  const c = loadCareer();
  const out = {};
  for (const id in c) {
    const base = id.replace(/:rev$/, '');
    const r = (typeof ROUTES !== 'undefined') ? ROUTES.find(x => x.id === base) : null;
    if (!r) continue;
    const l = LINES[r.line];
    if (!l) continue;
    const key = l.name;
    if (!out[key]) out[key] = { name: key, badge: l.badge, color: l.color, done: 0, total: 0, best: null };
    out[key].done++;
    if (!out[key].best || c[id].score > out[key].best.score) out[key].best = { score: c[id].score, grade: c[id].grade };
  }
  /* 分母：该线路在 ROUTES 里的交路数 */
  for (const r of ROUTES) {
    const l = LINES[r.line];
    if (!l) continue;
    if (!out[l.name]) out[l.name] = { name: l.name, badge: l.badge, color: l.color, done: 0, total: 0, best: null };
    out[l.name].total++;
  }
  return Object.values(out).sort((a, b) => (parseInt(a.badge) || 99) - (parseInt(b.badge) || 99));
}

/** 导出存档为可下载的 JSON 字符串 */
function exportSave() {
  const payload = {
    v: 1,
    at: new Date().toISOString(),
    routes: loadCareer(),
    settings: loadSettings()
  };
  return JSON.stringify(payload, null, 2);
}

/** 导入存档。返回 {ok, routes, settings, reason} */
function importSave(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) {
    return { ok: false, reason: '不是合法的 JSON' };
  }
  if (!data || typeof data !== 'object') return { ok: false, reason: '内容为空' };
  if (data.v !== 1) return { ok: false, reason: `不支持的存档版本：${data.v}` };
  if (!data.routes || typeof data.routes !== 'object') return { ok: false, reason: '缺少成绩数据' };

  /* 只接受结构正确的条目，脏数据丢弃而不是整包失败 */
  const clean = {};
  for (const id in data.routes) {
    const v = data.routes[id];
    if (!v || typeof v.score !== 'number' || typeof v.grade !== 'string') continue;
    clean[id] = { score: Math.round(v.score), grade: String(v.grade).slice(0, 2) };
  }
  if (!Object.keys(clean).length) return { ok: false, reason: '没有可用的成绩记录' };

  /* 与现有成绩合并，取高分，不覆盖更优记录 */
  const cur = loadCareer();
  let added = 0;
  for (const id in clean) {
    if (!cur[id] || clean[id].score > cur[id].score) { cur[id] = clean[id]; added++; }
  }
  try { localStorage.setItem('sm_career', JSON.stringify(cur)); } catch (e) {
    return { ok: false, reason: '写入失败：' + e.message };
  }
  if (data.settings) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(Object.assign(loadSettings(), data.settings))); } catch (e) { /* 设置写入失败不影响成绩 */ }
  }
  return { ok: true, routes: Object.keys(clean).length, added, settings: !!data.settings };
}

/* ---------------- 设置持久化 ----------------
   之前时段/天气/难度/画质/音量/震动每次重开页面都重置，是线上使用时最刺眼的
   体验问题之一（每开一次要重设一遍）。这里统一存 sm_settings。 */
const SETTINGS_KEY = 'sm_settings';
const SETTINGS_DEFAULTS = {
  tod: 'dusk', weather: 'clear', diff: 'normal',
  quality: 'high', voice: 'on', shakeOn: true, volume: 0.7
};

function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (e) {
    console.warn('[settings] 读取失败，使用默认值', e);
  }
  /* 逐字段校验：存档可能来自旧版本或被手改，脏值一律回退默认 */
  const out = Object.assign({}, SETTINGS_DEFAULTS);
  if (THEMES[s.tod]) out.tod = s.tod;
  if (typeof WEATHER !== 'undefined' && WEATHER[s.weather]) out.weather = s.weather;
  if (['easy', 'normal', 'hard'].includes(s.diff)) out.diff = s.diff;
  if (['high', 'medium', 'low'].includes(s.quality)) out.quality = s.quality;
  if (['on', 'off'].includes(s.voice)) out.voice = s.voice;
  if (typeof s.shakeOn === 'boolean') out.shakeOn = s.shakeOn;
  if (typeof s.volume === 'number' && s.volume >= 0 && s.volume <= 1) out.volume = s.volume;
  return out;
}

function saveSettings(patch) {
  const cur = loadSettings();
  const next = Object.assign(cur, patch || {});
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch (e) {
    console.warn('[settings] 写入失败', e);
  }
  return next;
}

/** 把设置灌进 G 与 UI 的选中态（启动时调用一次） */
function applySettings() {
  const s = loadSettings();
  G.tod = s.tod;
  G.weather = s.weather;
  G.diff = s.diff;
  G.quality = s.quality;
  G.voice = s.voice;
  G.shakeOn = s.shakeOn;
  theme = THEMES[G.tod];

  /* 关键：读档后必须按新档位重算像素预算。
     不重算的后果 —— initRenderer 里先用 'medium'（2.1 MP）建好渲染器，
     之后 applySettings 把 G.quality 改成用户存的 'high'，但 renderer
     的 pixelRatio 一直是 medium 的值。表现是：设置里选「精细」，
     实际仍按 1930×1086 渲染再拉伸到 2K/4K 屏，所有 3D 文字都发虚。
     这正是「字体不清晰」的第二个主因。 */
  if (typeof applyRenderScale === 'function') applyRenderScale();

  /* 回填按钮选中态：分组按钮用 data-v 与设置值比对 */
  const mark = (groupId, val) => {
    const box = $(groupId);
    if (!box) return;
    [...box.children].forEach(b => b.classList.toggle('on', b.dataset.v === String(val)));
  };
  mark('todGroup', s.tod);
  mark('weatherGroup', s.weather);
  mark('diffGroup', s.diff);
  mark('qualGroup', s.quality);
  mark('voiceGroup', s.voice);
  mark('shakeGroup', s.shakeOn ? 'on' : 'off');
  const vol = $('volRange');
  if (vol) vol.value = Math.round(s.volume * 100);
  return s;
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
    saveSettings({ tod: G.tod });
    [...$('todGroup').children].forEach(x => x.classList.toggle('on', x === b));
    theme = THEMES[G.tod];
    rebuildHero();
  });
  $('weatherGroup').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    G.weather = b.dataset.v;
    saveSettings({ weather: G.weather });
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
    saveSettings({ diff: G.diff });
    [...$('diffGroup').children].forEach(x => x.classList.toggle('on', x === b));
  });
  $('voiceGroup').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    G.voice = b.dataset.v;
    saveSettings({ voice: G.voice });
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
  $('volRange').addEventListener('input', e => {
    AUDIO.setVolume(e.target.value / 100);
    saveSettings({ volume: e.target.value / 100 });
  });

  $('qualGroup').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    G.quality = b.dataset.v;
    saveSettings({ quality: G.quality });
    [...$('qualGroup').children].forEach(x => x.classList.toggle('on', x === b));
    if (sun) sun.castShadow = G.quality !== 'low';
    /* 换档要立刻重算像素预算与后期管线，否则要等下一次 resize 才生效 */
    if (typeof applyRenderScale === 'function') applyRenderScale();
    if (typeof applyQualityEffects === 'function') applyQualityEffects();
    if (typeof rebuildPostChain === 'function') rebuildPostChain();
    /* 换档会重建后处理管线并编译着色器，前后几帧是几百毫秒的长任务。
       必须冷却，否则会被自动降档逻辑误判成「还是很慢」而继续降档
       —— 这就是「显示 0 fps 然后一档一档降到流畅」的成因。
       同时，用户手动选了档位就是对画质的明确取舍，自动降档应当停手。 */
    G.autoQuality = false;
    G._fpsCooldown = 3.0;
    G._fpsBuf = null;
    G._fpsSum = 0;
    G.fps = 0;
    G.frameMs = 0;
    G._slowStreak = 0;
  });
  $('shakeGroup').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    G.shakeOn = b.dataset.v === 'on';
    saveSettings({ shakeOn: G.shakeOn });
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

  /* ---------------- 存档导出 / 导入（P3-3）---------------- */
  const expBtn = $('saveExport');
  if (expBtn) expBtn.addEventListener('click', () => {
    const text = exportSave();
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    a.href = url;
    a.download = `地铁驾驶存档-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const n = Object.keys(loadCareer()).length;
    toast(`已导出 ${n} 条成绩记录`, 'good', 3000);
  });

  const impBtn = $('saveImport');
  const fileEl = $('saveFile');
  if (impBtn && fileEl) {
    impBtn.addEventListener('click', () => fileEl.click());
    fileEl.addEventListener('change', () => {
      const f = fileEl.files && fileEl.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        const r = importSave(String(rd.result || ''));
        if (r.ok) {
          toast(`导入成功 · ${r.added} 条新成绩（共 ${r.routes} 条）`, 'good', 4000);
          /* 重新渲染卡片以显示新成绩 */
          if (typeof renderRouteCards === 'function') renderRouteCards();
          if (typeof applySettings === 'function') applySettings();
        } else {
          toast('导入失败 · ' + r.reason, 'bad', 5000);
        }
        fileEl.value = '';       // 允许重复导入同一文件
      };
      rd.onerror = () => toast('导入失败 · 文件读取错误', 'bad', 4000);
      rd.readAsText(f);
    });
  }

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
  line = LINES[ROUTES[0].line];
  /* 设置持久化：在 bindMenu 之前应用，按钮选中态才能对齐已存设置。
     G.quality 不能只硬编码 'high'——低画质用户重开页面会被改回去。 */
  const saved = (typeof applySettings === 'function') ? applySettings() : null;
  theme = THEMES[G.tod];
  initMaterials(renderer, theme);
  renderRouteCards();
  bindMenu();
  bindInput();
  ATS.init();
  IX.init();
  /* 音量在 AUDIO.init 之前只是记下数值；真正出声要等首次点击（浏览器自动播放策略） */
  if (saved && typeof AUDIO !== 'undefined') {
    AUDIO.volume = saved.volume;
    AUDIO.voiceOn = saved.voice === 'on';
  }
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
  get composer() { return composer; }, get bloomPass() { return bloomPass; },
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
  installBloomChain, makeComposer,
  startTurnback, performTransfer,
  advanceTurnback(sec) {
    const n = Math.round(sec / 0.02);
    for (let i = 0; i < n; i++) updateTurnback(0.02);
    return { mode: G.mode, s: G.s, tb: G.turnback };
  },
  getKeys() { return { ...keys }; },
  /* 存档与设置：暴露给自动化测试，也方便在控制台里手动导出 */
  exportSave, importSave, loadCareer, careerByLine,
  loadSettings, saveSettings, applySettings,
  get gamepad() { return G.gamepad; },
  get fps() { return G.fps || 0; },
  get frameMs() { return G.frameMs || 0; },
  get renderPx() { return G.renderPx || 0; },
  get renderPR() { return G.renderPR || 1; },
  applyRenderScale, rebuildPostChain,
  pollGamepad(dt) { if (window.__pollGamepad) window.__pollGamepad(dt); },
  setFreeCam(pos, look, fov) { G.freeCam = pos ? { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look), fov } : null; }
};
