/* =====================================================================
   ATS 调度台：全线列车监视 + 调度命令
   ===================================================================== */
const ATS = {
  on: false,
  t: 0,
  listT: 0,
  canvas: null,
  ctx: null,

  init() {
    this.canvas = $('atsCanvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    $('atsBtn').addEventListener('click', () => this.toggle());
    $('atsClose').addEventListener('click', () => this.toggle(false));
    $('atsList').addEventListener('click', e => {
      const b = e.target.closest('button[data-cmd]');
      if (!b) return;
      const no = b.dataset.no, cmd = b.dataset.cmd;
      const ai = aiTrains.find(a => a.carNo === no);
      if (!ai) return;
      /* 命令语义来自 59_atslog.js，避免秒数/文案散落在 UI 里 */
      const act = atsCommand(cmd);
      if (!act) return;
      ai.command(act.cmd, act.secs);
      AUDIO.beep();
      toast(act.text(no), act.level, 2800);
      this.renderList(true);
    });
  },

  toggle(force) {
    this.on = force === undefined ? !this.on : !!force;
    $('ats').classList.toggle('on', this.on);
    $('atsBtn').classList.toggle('on', this.on);
    if (this.on) { this.renderList(true); this.draw(); }
  },

  update(dt) {
    if (!this.on) return;
    this.t += dt;
    if (this.t > 0.1) { this.t = 0; this.draw(); }
    this.listT += dt;
    if (this.listT > 0.7) { this.listT = 0; this.renderList(); }
  },

  /* ---------------- 线路图 ---------------- */
  draw() {
    const cv = this.canvas, ctx = this.ctx;
    if (!cv || !ctx || !path) return;
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);

    const padL = 42, padR = 30;
    const x0 = padL, x1 = W - padR;
    const yU = 86, yD = 196;
    const L = path.length || 1;
    const X = s => x0 + (clamp(s, 0, L) / L) * (x1 - x0);

    // 股道
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.10)';
    ctx.lineWidth = 10;
    for (const y of [yU, yD]) {
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    }
    // 股道标签
    ctx.textAlign = 'left';
    ctx.font = '600 19px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = 'rgba(150,175,190,.55)';
    ctx.fillText('上行', 6, yU - 22);
    ctx.fillText('下行', 6, yD - 22);

    // 车站
    const sts = path.stations;
    sts.forEach((st, i) => {
      const x = X(st.stopS);
      const here = i === G.targetIdx;
      ctx.strokeStyle = here ? 'rgba(201,240,122,.55)' : 'rgba(255,255,255,.18)';
      ctx.lineWidth = here ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(x, yU - 18); ctx.lineTo(x, yD + 18); ctx.stroke();
      // 站名竖排，逐字向下
      ctx.textAlign = 'center';
      ctx.font = here ? '700 17px "Microsoft YaHei",sans-serif' : '500 16px "Microsoft YaHei",sans-serif';
      ctx.fillStyle = here ? '#c9f07a' : 'rgba(168,190,203,.56)';
      const chars = st.zh.split('');
      chars.forEach((ch, k) => ctx.fillText(ch, x, 224 + k * 17));
    });

    // 列车块
    const block = (s, dir, color, label, me) => {
      const x = X(s);
      const y = dir > 0 ? yU : yD;
      const w = 36, h = 17;
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - h / 2, w, h, 4);
      ctx.fillStyle = color;
      ctx.fill();
      if (me) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }
      ctx.textAlign = 'center';
      ctx.font = '700 19px ui-monospace,monospace';
      ctx.fillStyle = me ? '#ffffff' : 'rgba(226,238,245,.86)';
      ctx.fillText(label, x, y - 16);
    };

    for (const ai of aiTrains) {
      if (ai.dead) continue;
      const col = ai.holdT > 0 ? '#ff4d4f' : ai.state === 'dwell' ? '#ffb020' : '#5f9be0';
      block(ai.s, ai.dir, col, ai.carNo, false);
    }

    // 本务
    if (train) {
      const c = line ? line.color : '#8cc63f';
      block(G.s, 1, c, '本务', true);
    }

    // 图例
    ctx.textAlign = 'left';
    ctx.font = '500 18px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#5f9be0'; ctx.fillText('● 运行', 42, 30);
    ctx.fillStyle = '#ffb020'; ctx.fillText('● 停站', 132, 30);
    ctx.fillStyle = '#ff4d4f'; ctx.fillText('● 扣车', 222, 30);
    ctx.fillStyle = line ? line.color : '#8cc63f'; ctx.fillText('● 本务', 312, 30);
  },

  /* ---------------- 列车列表 ---------------- */
  renderList(force) {
    const box = $('atsList');
    if (!box || !path) return;
    const now = G.clock || 0;
    $('atsClock').textContent = fmtClock(now);
    /* 文案与行数据来自 59_atslog.js（纯逻辑，可单测）；这里只拼 HTML */
    $('atsSub').textContent = atsSubtitle({
      line, aiCount: aiTrains.length, pathLen: path.length
    });

    const rows = atsRows({ G, aiTrains, stations: path.stations });

    box.innerHTML = rows.map(r => {
      const { tag, cls } = atsTag(r);
      /* 本务行没有 ops；AI 行按 ops 里的命令名生成按钮 */
      const opsHtml = r.ops === null
        ? '<span style="font-size:9px;color:#5f7280">值乘中</span>'
        : r.ops.map(cmd => {
          const label = cmd === 'hold' ? '扣车' : cmd === 'go' ? '放行' : '跳停';
          const extra = cmd === 'hold' ? ' hold' : cmd === 'skip' ? ' skip' : '';
          return `<button class="ats-btn${extra}" data-no="${r.no}" data-cmd="${cmd}">${label}</button>`;
        }).join('');
      return `<div class="ats-row${r.me ? ' me' : ''}">
        <div class="ats-no">${r.no}<i>${r.sub}</i></div>
        <div class="ats-mid"><b>${r.from} → ${r.to}</b><span>${Math.round(r.v)} km/h · <span class="ats-tag ${cls}">${tag}</span></span></div>
        <div class="ats-ops">${opsHtml}</div>
      </div>`;
    }).join('');
    if (force) this.draw();
  }
};
