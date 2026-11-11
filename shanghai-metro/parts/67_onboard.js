/* =====================================================================
   新手引导（P4-2）
   ---------------------------------------------------------------------
   首次进入驾驶时给出 3 步操作指引：起步 / 制动对位 / 开门。
   引导打开期间冻结主循环，避免玩家还在读字车就动了。
   `sm_onboarded` 记录已看过；暂停菜单可随时重看。
   ===================================================================== */

const ONBOARD_KEY = 'sm_onboarded';

function onboardStepText(i) {
  const touch = !!G.touchMode;
  if (i === 0) {
    return touch
      ? '看屏幕底部的触屏手柄。把中间的圆钮向右拖到「牵引」区，列车就会起动；松手后手柄会停在原位。'
      : '按住 W 给牵引，松开后手柄保持；按 S 回零或制动。列车起动后注意前方信号与限速。';
  }
  if (i === 1) {
    return touch
      ? '看左上角「停车标」的距离。提前把圆钮向左拖到「制动」区，让列车在停车标前停稳；偏差 0.35 m 内满分。'
      : '看左上角「停车标」的距离。提前按 S 制动，让列车在停车标前停稳；偏差 0.35 m 内满分。';
  }
  return touch
    ? '停稳后点「开门」。车门打开后才能办理乘降；关门后牵引联锁才会解除。'
    : '停稳后按 O 开门、按 P 关门。车门未关闭时牵引会被联锁锁定。';
}

function onboardRender() {
  const i = Math.max(0, Math.min(2, G.onboardStep || 0));
  const title = ['起步', '制动对位', '开门办客'][i];
  $('obTitle').textContent = `${i + 1} / 3 · ${title}`;
  $('obText').textContent = onboardStepText(i);
  const dots = $('obDots');
  if (dots) [...dots.children].forEach((d, k) => d.classList.toggle('on', k <= i));
  $('obNext').textContent = i >= 2 ? '开始值乘' : '下一步';
}

function onboardShow(force) {
  if (!force && G.exam) return false;
  if (!force) {
    try { if (localStorage.getItem(ONBOARD_KEY)) return false; } catch (e) { /* 忽略 */ }
  }
  if (G.mode !== 'driving' && !force) return false;
  G.onboardStep = 0;
  G.onboardOpen = true;
  onboardRender();
  $('onboard').classList.remove('hidden');
  return true;
}

function onboardFinish() {
  G.onboardOpen = false;
  $('onboard').classList.add('hidden');
  try { localStorage.setItem(ONBOARD_KEY, '1'); } catch (e) { /* 忽略 */ }
  if (G.mode === 'driving') { clock.getDelta(); }
}

function onboardNext() {
  G.onboardStep = (G.onboardStep || 0) + 1;
  if (G.onboardStep >= 3) { onboardFinish(); return; }
  onboardRender();
}

function bindOnboard() {
  const next = $('obNext'), skip = $('obSkip');
  if (next) next.addEventListener('click', () => { AUDIO.beep(); onboardNext(); });
  if (skip) skip.addEventListener('click', () => onboardFinish());
  const guide = $('pGuide');
  if (guide) guide.addEventListener('click', () => {
    $('pause').classList.add('hidden');
    G.mode = 'driving';
    clock.getDelta();
    onboardShow(true);
  });
}

/* 首次进入驾驶时调用；force 时无视 sm_onboarded 重播 */
function maybeShowOnboard(force) {
  return onboardShow(!!force);
}
