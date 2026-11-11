/* ------------------------------------------------------------------
   上海地铁 15 号线列车（MTR 资源包 sh15_pth.bbmodel）→ parts/51_sh15_data.js
   用法：node scripts/convert-sh15.js "<资源包目录>"
   - 读取 Blockbench 模型的方块（cube）、分组旋转、面 UV 与 MTR 部件布局
   - 把 8192² 贴图缩到 2048² 并以 base64 内联
   - 输出一个纯数据文件，运行时由 parts/51_sh15.js 构建 Three.js 几何
   ------------------------------------------------------------------ */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const pack = process.argv[2];
if (!pack) { console.error('用法：node scripts/convert-sh15.js "<资源包目录>"'); process.exit(1); }
const dir = path.join(pack, 'assets', 'mtr', 'sh15_pth');
const bb = JSON.parse(fs.readFileSync(path.join(dir, 'sh15_pth.bbmodel'), 'utf8'));
const props = JSON.parse(fs.readFileSync(path.join(dir, 'sh15_pth.json'), 'utf8'));

const byId = {};
bb.elements.forEach(e => { byId[e.uuid] = e; });
const r2 = v => Math.round(v * 100) / 100;
const FACES = ['north', 'east', 'south', 'west', 'up', 'down'];

/* 展开：每个顶层分组 → 其全部后代方块（带分组旋转链，内层在前） */
function collect(node, chain, out) {
  for (const c of node.children || []) {
    if (typeof c === 'string') {
      const e = byId[c];
      if (!e) continue;
      const inf = e.inflate || 0;
      const rec = {
        f: e.from.map(v => r2(v - inf)),
        t: e.to.map(v => r2(v + inf)),
        o: (e.origin || [0, 0, 0]).map(r2),
        r: (e.rotation || [0, 0, 0]).map(r2),
        u: []
      };
      for (const fn of FACES) {
        const fc = e.faces && e.faces[fn];
        if (!fc || fc.texture == null || !fc.uv) rec.u.push(0, 0, 0, 0, 0);
        else rec.u.push(1, ...fc.uv.map(r2));
      }
      // 压缩：只记录有效面
      const us = [];
      for (let i = 0; i < 6; i++) us.push(rec.u.slice(i * 5, i * 5 + 5));
      rec.u = us.map(a => a[0] ? a.slice(1) : null);
      if (rec.r.every(v => v === 0)) delete rec.r;
      if (chain.length) rec.g = chain.slice();
      out.push(rec);
    }
  }
}
/* 分组旋转链按「外层在前」记录，运行时从最内层向外依次施加 */
function collect2(node, chain, out) {
  for (const c of node.children || []) {
    if (typeof c === 'string') {
      const tmp = [];
      collect({ children: [c] }, chain, tmp);
      out.push(...tmp);
    } else {
      const g = [...(c.origin || [0, 0, 0]).map(r2), ...(c.rotation || [0, 0, 0]).map(r2)];
      const hasRot = g[3] || g[4] || g[5];
      collect2(c, hasRot ? chain.concat([g]) : chain, out);
    }
  }
}

const NEED = new Set(props.parts.map(p => p.name));
const models = {};
for (const top of bb.outliner) {
  if (typeof top === 'string') continue;
  if (!NEED.has(top.name)) continue;
  const out = [];
  const g0 = [...(top.origin || [0, 0, 0]).map(r2), ...(top.rotation || [0, 0, 0]).map(r2)];
  collect2(top, (g0[3] || g0[4] || g0[5]) ? [g0] : [], out);
  models[top.name] = out;
}

/* 部件布局 */
const parse = s => String(s || '').split(',').map(x => x.trim()).filter(x => x && !x.startsWith('%')).map(Number);
const parts = props.parts.map(p => ({
  n: p.name, s: p.stage, m: p.mirror ? 1 : 0, d: p.door_offset, c: p.render_condition,
  p: p.positions, w: parse(p.whitelisted_cars), b: parse(p.blacklisted_cars)
}));

/* 贴图：8192² → 2048² */
const tmpPng = path.join(__dirname, '_sh15_tex_full.png');
const smallPng = path.join(__dirname, '_sh15_tex_2048.png');
fs.writeFileSync(tmpPng, Buffer.from(bb.textures[0].source.split(',')[1], 'base64'));
execFileSync('python', ['-c',
  `from PIL import Image\nim=Image.open(r'${tmpPng}').convert('RGBA')\nim.resize((2048,2048),Image.BOX).save(r'${smallPng}',optimize=True)`]);
const b64 = fs.readFileSync(smallPng).toString('base64');
fs.unlinkSync(tmpPng); fs.unlinkSync(smallPng);

const data = {
  res: bb.resolution.width,
  length: props.length, doorMax: props.door_max,
  parts, models
};
const outFile = path.join(__dirname, '..', 'parts', '51_sh15_data.js');
fs.writeFileSync(outFile,
  '/* 由 scripts/convert-sh15.js 从 sh15_pth.bbmodel 生成，勿手改 */\n' +
  'const SH15_DATA = ' + JSON.stringify(data) + ';\n' +
  'const SH15_TEX_B64 = "' + b64 + '";\n');
const cubes = Object.values(models).reduce((a, m) => a + m.length, 0);
console.log('parts', parts.length, 'models', Object.keys(models).length, 'cubes', cubes,
  'out', (fs.statSync(outFile).size / 1024).toFixed(0) + ' KB');
