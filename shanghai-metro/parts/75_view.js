/* ================================================================
   相机与输入
   （由 70_game.js 拆分而来，逻辑未改动）
   ================================================================ */
/* ---------------------------------------------------------------- 相机 */
const qFlip = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, PI, 0));

function updateCamera(dt, snap = false) {
  if (!train) return;
  if (G.walk && G.walk.active) {
    camera.position.copy(G.walk.pos);
    camera.quaternion.setFromEuler(new THREE.Euler(G.walk.pitch, G.walk.yaw, 0, 'YXZ'));
    camera.fov = 60;
    camera.updateProjectionMatrix();
    return;
  }
  if (G.freeCam) {
    camera.position.copy(G.freeCam.pos);
    camera.lookAt(G.freeCam.look);
    camera.fov = G.freeCam.fov || 55;
    camera.updateProjectionMatrix();
    if (train.noseGlass) train.noseGlass.visible = true;
    return;
  }
  const car = train.cars[0];
  if (G.camMode === 0) {
    const eye = car.group.localToWorld(train.eyePos.clone());
    if (G.shakeOn) {
      // 极轻微的走行震动（毫米级）
      const amp = G.shakeAmp * clamp(G.v / 14, 0, 1);
      const t = performance.now() * 0.001;
      eye.y += Math.sin(t * 41) * amp + Math.sin(t * 17.3) * amp * 0.6;
      eye.x += Math.sin(t * 33.7 + 1.1) * amp * 0.5;
    }
    camera.position.copy(eye);
    const look = new THREE.Quaternion().setFromEuler(new THREE.Euler(G.pitch, G.yaw, 0, 'YXZ'));
    camera.quaternion.copy(car.group.quaternion).multiply(qFlip).multiply(look);
    const speedRatio = clamp(G.v / Math.max(1, path.vmax * KMH), 0, 1);
    camera.fov = 58 + speedRatio * 7;
    if (train.noseGlass) train.noseGlass.visible = false;
  } else {
    const k = snap ? 1 : 1 - Math.exp(-7 * Math.max(0.001, dt));
    if (train.noseGlass) train.noseGlass.visible = true;
    const nose = path.frameAt(G.s);
    const underground = nose.pos.y < -2;
    if (G.camMode === 1) {
      let p;
      if (underground) {
        p = nose.pos.clone().addScaledVector(nose.tan, 13).add(new THREE.Vector3(0, 2.0, 0));
      } else {
        p = nose.pos.clone().addScaledVector(nose.tan, 13).addScaledVector(nose.right, 11).add(new THREE.Vector3(0, 5.2, 0));
      }
      camera.position.lerp(p, k);
      camera.lookAt(nose.pos.clone().add(new THREE.Vector3(0, 2.0, 0)));
      camera.fov = underground ? 66 : 50;
    } else if (G.camMode === 2) {
      const o = G.orbit;
      let p;
      if (underground) {
        p = nose.pos.clone().addScaledVector(nose.tan, 9).addScaledVector(nose.right, 3.6).add(new THREE.Vector3(0, 3.4, 0));
        camera.position.lerp(p, k);
        camera.lookAt(nose.pos.clone().add(new THREE.Vector3(0, 1.9, 0)));
        camera.fov = 68;
      } else {
        p = nose.pos.clone()
          .addScaledVector(nose.tan, Math.cos(o.az) * o.dist)
          .addScaledVector(nose.right, Math.sin(o.az) * o.dist)
          .add(new THREE.Vector3(0, o.el * o.dist, 0));
        camera.position.lerp(p, k);
        camera.lookAt(nose.pos.clone().add(new THREE.Vector3(0, 2.2, 0)));
        camera.fov = 45;
      }
    } else {
      const so = stationObjs[Math.min(G.targetIdx, stationObjs.length - 1)];
      const st = path.stations[Math.min(G.targetIdx, path.stations.length - 1)];
      const base = st.frame.pos.clone()
        .addScaledVector(st.frame.right, -2.0)
        .addScaledVector(st.frame.up, 2.72)
        .addScaledVector(st.frame.tan, -36);
      camera.position.lerp(base, k);
      camera.lookAt(nose.pos.clone().add(new THREE.Vector3(0, 2.0, 0)));
      camera.fov = 50;
    }
    camera.updateProjectionMatrix();
  }
  if (G.camMode === 0 && !snap) camera.updateProjectionMatrix();
}
/* ---------------- 触屏手柄（P4-1） ---------------- */
function setTouchMode(on) {
  G.touchMode = !!on;
  document.body.classList.toggle('touch-mode', G.touchMode);
  if (G.touchMode && typeof updateTouchUI === 'function') updateTouchUI();
}

function updateTouchUI() {
  if (!G.touchMode) return;
  const knob = $('tKnob'), fill = $('tFill'), txt = $('tLeverTxt');
  if (!knob || !fill) return;
  const pct = (clamp(G.lever, -1, 1) + 1) / 2;
  knob.style.left = (pct * 100).toFixed(1) + '%';
  if (G.lever >= 0) {
    fill.style.left = '50%';
    fill.style.width = ((pct - 0.5) * 100).toFixed(1) + '%';
    fill.style.background = 'rgba(140,198,63,.55)';
  } else {
    fill.style.left = (pct * 100).toFixed(1) + '%';
    fill.style.width = ((0.5 - pct) * 100).toFixed(1) + '%';
    fill.style.background = 'rgba(255,107,90,.55)';
  }
  if (txt) txt.textContent = G.eb ? '紧急制动' : G.lever > 0.005 ? `牵引 ${Math.round(G.lever * 100)}%`
    : G.lever < -0.005 ? `制动 ${Math.round(-G.lever * 100)}%` : '0%';
  const d = $('tDoor');
  if (d) d.textContent = G.doorsOpen ? '关门' : '开门';
  const a = $('tAto');
  if (a) a.classList.toggle('on', !!G.ato);
  const e = $('tEb');
  if (e) e.classList.toggle('on', !!G.eb);
  const s = $('tSpeed'), l = $('tLimit');
  if (s) s.textContent = Math.round(G.v * 3.6);
  if (l) l.textContent = Math.round(G.limit || 80);
}

function bindTouch() {
  const box = $('touch');
  if (!box) return;
  const track = $('tTrack');
  let dragging = false;
  const setFromX = clientX => {
    const r = track.getBoundingClientRect();
    if (r.width <= 0) return;
    const t = clamp((clientX - r.left) / r.width, 0, 1);
    G.lever = clamp((t - 0.5) * 2, -1, 1);
    if (G.ato) {
      G.ato = false; G.atoState = 'run';
      toast('司机接管 · ATO 已退出', 'info', 2400);
    }
    updateTouchUI();
  };
  if (track) {
    track.addEventListener('pointerdown', e => {
      if (G.mode !== 'driving') return;
      dragging = true;
      try { track.setPointerCapture(e.pointerId); } catch (err) { /* 部分浏览器不支持 */ }
      setFromX(e.clientX);
      e.preventDefault();
    });
    track.addEventListener('pointermove', e => {
      if (!dragging) return;
      setFromX(e.clientX);
      e.preventDefault();
    });
    const end = () => { dragging = false; };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    track.addEventListener('lostpointercapture', end);
  }
  box.addEventListener('click', e => {
    const b = e.target.closest('button[data-touch]');
    if (!b) return;
    if (G.mode !== 'driving') return;
    const k = b.dataset.touch;
    if (k === 'door') { if (G.ato) toggleATO(false); if (G.doorsOpen) closeDoors(); else openDoors(); }
    else if (k === 'ato') toggleATO();
    else if (k === 'horn') AUDIO.horn();
    else if (k === 'eb') { if (G.eb) releaseEB(); else triggerEB('触屏紧急制动'); }
    else if (k === 'zero') G.lever = 0;
    updateTouchUI();
    e.preventDefault();
  });
  /* 自动识别：粗指针 / 触摸屏 / 窄屏。?touch=1 可强制开启（调试用） */
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
  const forced = /(?:\?|&)touch=1/.test(location.search);
  setTouchMode(forced || coarse || (hasTouch && window.innerWidth < 1100));
}

function bindInput() {
  bindTouch();
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    keys[e.code] = true;
    if (G.mode === 'driving') {
      if (G.walk && G.walk.active) {
        if (e.code === 'KeyF') toggleWalk();
        if (e.code === 'Escape') togglePause(true);
        return;
      }
      if (e.code === 'KeyF') toggleWalk();
      if (e.code === 'KeyO') { if (G.ato) toggleATO(false); openDoors(); }
      if (e.code === 'KeyP') { if (G.ato) toggleATO(false); closeDoors(); }
      if (e.code === 'KeyA') toggleATO();
      if (e.code === 'KeyH') AUDIO.horn();
      if (e.code === 'KeyL') clearFault();
      if (e.code === 'KeyK') toggleSignalMode();
      if (e.code === 'Space') {
        e.preventDefault();
        if (G.eb) releaseEB(); else triggerEB('司机手动施加');
      }
      if (e.code === 'KeyR') {
        if (G.eb) releaseEB();
        else { G.yaw = 0; G.pitch = -0.02; }
      }
      if (e.code === 'KeyC') { G.camMode = (G.camMode + 1) % 4; toast(['司机室视角', '追车视角', '自由环绕', '站台视角'][G.camMode], 'info', 1600); updateCamera(0, true); }
      if (e.code === 'Tab') {
        e.preventDefault();
        ATS.toggle();
      }
      if (e.code === 'F1') {
        e.preventDefault();
        $('hud').classList.toggle('on');
      }
      if (e.code === 'F3') {
        e.preventDefault();
        togglePerfBadge();
      }
      /* F4：逐项关效果做性能诊断（正常/关泛光/关阴影/半分辨率） */
      if (e.code === 'F4') {
        e.preventDefault();
        if (!$('perfBadge').classList.contains('on')) togglePerfBadge();
        cycleDiag();
      }
      if (e.code === 'Escape') togglePause(true);
    } else if (G.mode === 'paused') {
      if (e.code === 'Escape') togglePause(false);
    }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  /* ---------------- 手柄支持（P3-2）----------------
     左摇杆 Y 轴 → 手柄牵引/制动。这是模拟量最自然的输入，
     比键盘的点按更接近真实司控器。
       A(0)  → ATO 开关
       B(1)  → 开/关车门（按停站状态自动判断）
       X(2)  → 鸣笛
       Y(3)  → 视角循环
       LB(4) → 紧急制动施加/缓解
       RB(5) → 切换固定闭塞
     每帧轮询一次；没有手柄时开销可忽略（navigator.getGamepads 返回长度 0）。 */
  G.gamepad = { idx: -1, prev: {}, axis: 0 };
  window.__pollGamepad = (dt) => {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let pad = null;
    for (const p of pads) { if (p && p.connected) { pad = p; break; } }
    G.gamepad.connected = !!pad;
    if (!pad) return;
    if (G.mode !== 'driving') return;

    /* 左摇杆 Y：-1 = 推向上（牵引），+1 = 拉向下（制动）。死区 0.12 */
    const ax = pad.axes[1] != null ? pad.axes[1] : 0;
    const dead = Math.abs(ax) < 0.12 ? 0 : ax;
    if (dead !== 0) {
      /* 摇杆是绝对位置，直接映射手柄位置（-1..1），比增量更直观 */
      G.lever = clamp(-dead, -1, 1);
      G.gamepad.axis = G.lever;
      if (G.ato) { G.ato = false; G.atoState = 'run'; toast('司机接管 · ATO 已退出', 'info', 2600); }
    } else if (G.gamepad.axis !== 0) {
      /* 摇杆回中 → 手柄归零。不回零会让列车一直带着上次的牵引/制动。 */
      G.lever = 0;
      G.gamepad.axis = 0;
    }

    /* 按钮：只在按下沿触发一次 */
    const btn = i => !!(pad.buttons[i] && pad.buttons[i].pressed);
    const edge = (i) => {
      const now = btn(i);
      const was = !!G.gamepad.prev[i];
      G.gamepad.prev[i] = now;
      return now && !was;
    };
    if (edge(0)) toggleATO();
    if (edge(1)) {
      if (G.doorsOpen) closeDoors();
      else openDoors();
    }
    if (edge(2)) AUDIO.horn();
    if (edge(3)) {
      G.camMode = (G.camMode + 1) % 4;
      toast(['司机室视角', '追车视角', '自由环绕', '站台视角'][G.camMode], 'info', 1600);
      updateCamera(0, true);
    }
    if (edge(4)) { if (G.eb) releaseEB(); else triggerEB('手柄施加'); }
    if (edge(5)) toggleSignalMode();
  };

  const transferList = $('transferList');
  if (transferList) transferList.addEventListener('click', e => {
    const b = e.target.closest('button[data-line]');
    if (b) performTransfer(b.dataset.line);
  });
  const transferBack = $('transferBack');
  if (transferBack) transferBack.addEventListener('click', () => {
    if (G.walk) G.walk.tpHidden = true;
    hideTransferPanel();
  });

  const canvas = $('scene');
  canvas.addEventListener('pointerdown', e => {
    G.dragging = true; G.lastX = e.clientX; G.lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!G.dragging || G.mode !== 'driving') return;
    const dx = e.clientX - G.lastX, dy = e.clientY - G.lastY;
    G.lastX = e.clientX; G.lastY = e.clientY;
    if (G.walk && G.walk.active) {
      G.walk.yaw -= dx * 0.0032;
      G.walk.pitch = clamp(G.walk.pitch - dy * 0.0028, -1.1, 1.1);
      return;
    }
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
