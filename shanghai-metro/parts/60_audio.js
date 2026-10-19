/* ================================================================
   音频：VVVF 牵引 / 轮轨 / 制动 / 车门 / 鸣笛 / 报站
   ================================================================ */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.65;
    this.voiceOn = true;
    this.zhVoice = null;
    this.vType = 'IGBT';       // 牵引逆变器类型：GTO / IGBT / PM
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
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 20;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.25;
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);

    // 车站/隧道音效回声（系统 TTS 不经过 Web Audio，只作用于音效）
    this.echo = ctx.createDelay(0.6);
    this.echo.delayTime.value = 0.19;
    this.echoFb = ctx.createGain(); this.echoFb.gain.value = 0.28;
    this.echoWet = ctx.createGain(); this.echoWet.gain.value = 0.55;
    this.echoSend = ctx.createGain(); this.echoSend.gain.value = 0;
    this.echoSend.connect(this.echo);
    this.echo.connect(this.echoFb); this.echoFb.connect(this.echo);
    this.echo.connect(this.echoWet); this.echoWet.connect(this.master);

    // 噪声
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    // 牵引：平滑的电机基频 + 二次谐波 + 轻量逆变器高频，不用锯齿/方波
    this.motorGain = ctx.createGain(); this.motorGain.gain.value = 0;
    this.motorFilter = ctx.createBiquadFilter();
    this.motorFilter.type = 'lowpass'; this.motorFilter.frequency.value = 1200; this.motorFilter.Q.value = 0.7;
    this.motorGain.connect(this.motorFilter); this.motorFilter.connect(this.master);
    this.osc1 = ctx.createOscillator(); this.osc1.type = 'triangle'; this.osc1.frequency.value = 70;
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'sine'; this.osc2.frequency.value = 140;
    const g2 = ctx.createGain(); g2.gain.value = 0.32;
    this.osc1.connect(this.motorGain); this.osc2.connect(g2); g2.connect(this.motorGain);
    this.osc1.start(); this.osc2.start();
    // 逆变器高频啸叫（独立很轻的一路）
    this.whineGain = ctx.createGain(); this.whineGain.gain.value = 0;
    this.osc3 = ctx.createOscillator(); this.osc3.type = 'sine'; this.osc3.frequency.value = 280;
    this.osc3.connect(this.whineGain); this.whineGain.connect(this.master);
    this.osc3.start();

    // 轮轨：低频滚动，控制得很轻
    this.rollGain = ctx.createGain(); this.rollGain.gain.value = 0;
    const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 420; rf.Q.value = 0.6;
    const rn = ctx.createBufferSource(); rn.buffer = buf; rn.loop = true;
    rn.connect(rf); rf.connect(this.rollGain); this.rollGain.connect(this.master);
    rn.start();
    this.rollFilter = rf;

    // 制动：柔和的摩擦声
    this.brkGain = ctx.createGain(); this.brkGain.gain.value = 0;
    const bf = ctx.createBiquadFilter(); bf.type = 'highpass'; bf.frequency.value = 1200;
    const bn = ctx.createBufferSource(); bn.buffer = buf; bn.loop = true;
    bn.connect(bf); bf.connect(this.brkGain); this.brkGain.connect(this.master);
    bn.start();

    // 低速制动啸叫（很轻）
    this.sqGain = ctx.createGain(); this.sqGain.gain.value = 0;
    this.sqOsc = ctx.createOscillator(); this.sqOsc.type = 'sine'; this.sqOsc.frequency.value = 2400;
    this.sqOsc.connect(this.sqGain); this.sqGain.connect(this.master); this.sqOsc.start();

    // 车厢环境
    this.ambGain = ctx.createGain(); this.ambGain.gain.value = 0;
    const af = ctx.createBiquadFilter(); af.type = 'lowpass'; af.frequency.value = 220;
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
    // 不同车型 VVVF 音阶不同：GTO 低沉、IGBT 常规、永磁更高更纯
    const vk = this.vType === 'GTO' ? 0.82 : this.vType === 'PM' ? 1.18 : 1.0;
    const f = (70 + spd * 19 + st.traction * 32) * vk;
    this.osc1.frequency.setTargetAtTime(f, t, 0.12);
    this.osc2.frequency.setTargetAtTime(f * 2.003, t, 0.12);
    this.osc3.frequency.setTargetAtTime(f * 3.97, t, 0.12);
    const mg = 0.003 + st.traction * 0.07 + Math.min(0.018, spd * 0.0012);
    this.motorGain.gain.setTargetAtTime(mg, t, 0.12);
    this.motorFilter.frequency.setTargetAtTime((this.vType === 'GTO' ? 800 : this.vType === 'PM' ? 1800 : 1200) + spd * 45 + st.traction * 350, t, 0.15);
    this.whineGain.gain.setTargetAtTime(0.0008 + st.traction * 0.007 + Math.min(0.006, spd * 0.00032), t, 0.12);
    this.rollGain.gain.setTargetAtTime(Math.min(0.028, spd * 0.0012) * (st.inTunnel ? 1.2 : 1), t, 0.2);
    this.rollFilter.frequency.setTargetAtTime(320 + spd * 18, t, 0.2);
    const bg = st.brake * Math.min(0.022, 0.006 + spd * 0.0008);
    this.brkGain.gain.setTargetAtTime(bg, t, 0.15);
    const squeal = st.brake > 0.3 && spd < 10 && spd > 0.4 ? 0.004 * st.brake : 0;
    this.sqGain.gain.setTargetAtTime(squeal, t, 0.2);
    this.sqOsc.frequency.setTargetAtTime(1500 + (10 - Math.min(10, spd)) * 90, t, 0.25);
    this.ambGain.gain.setTargetAtTime(0.007 + (st.inTunnel ? 0.003 : 0), t, 0.4);
    const wet = st.nearStation ? 0.32 : st.inTunnel ? 0.12 : 0.04;
    this.echoSend.gain.setTargetAtTime(wet, t, 0.25);
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
      o.connect(g); g.connect(this.master); g.connect(this.echoSend);
      o.start(t0 + i * 0.19); o.stop(t0 + i * 0.19 + 0.45);
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f / 2;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0, t0 + i * 0.19);
      g2.gain.linearRampToValueAtTime(0.05, t0 + i * 0.19 + 0.02);
      g2.gain.exponentialRampToValueAtTime(0.0006, t0 + i * 0.19 + 0.4);
      o2.connect(g2); g2.connect(this.master); g2.connect(this.echoSend);
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
    s.connect(f); f.connect(g); g.connect(this.master); g.connect(this.echoSend);
    s.start(t); s.stop(t + dur + 0.05);
  }
  /* 活塞风：列车高速进出隧道 / 通过车站时的风压 */
  windGust(strength = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dur = 1.5 + strength * 1.1;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(180, t);
    f.frequency.linearRampToValueAtTime(520 * (0.6 + strength * 0.7), t + dur * 0.35);
    f.frequency.linearRampToValueAtTime(160, t + dur);
    f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05 * strength, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.012 * strength, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0004, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); g.connect(this.echoSend);
    s.start(t); s.stop(t + dur + 0.1);
  }

  thud() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.14, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(this.master); g.connect(this.echoSend); o.start(t); o.stop(t + 0.35);
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
      o.connect(fl); fl.connect(g); g.connect(this.master); g.connect(this.echoSend);
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
      o.connect(g); g.connect(this.master); g.connect(this.echoSend);
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
    } catch (e) { console.warn("[TTS] 降级", e); }
  }
}
const AUDIO = new AudioEngine();
