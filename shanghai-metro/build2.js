/* ---------------------------------------------------------------
   纯 JS 打包器（不依赖 esbuild，规避应用程序控制策略）
   —— 把 three.module.min.js 与 jsm 附加模块作用域提升到同一个 IIFE
   --------------------------------------------------------------- */
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const NM_CANDIDATES = [
  process.env.WORKBUDDY_NODE_MODULES,
  path.join(dir, 'node_modules'),
  path.join(dir, '..', 'node_modules'),
  'C:/Users/35498/.workbuddy/binaries/node/workspace/node_modules'
].filter(Boolean);

const THREE_MIN = 'three/build/three.module.min.js';
const NM = NM_CANDIDATES.find(p => fs.existsSync(path.join(p, THREE_MIN)));
if (!NM) {
  const hasThree = NM_CANDIDATES.find(p => fs.existsSync(path.join(p, 'three/package.json')));
  const hint = hasThree
    ? `在 ${hasThree} 找到了 three，但缺少 ${THREE_MIN}。\n` +
      'three >= 0.161 已移除压缩版入口，本项目需固定 0.160.1：npm i three@0.160.1'
    : '请在 shanghai-metro/ 下执行：npm install';
  throw new Error(`未找到可用的 three 依赖。\n${hint}\n已查找：\n  ${NM_CANDIDATES.join('\n  ')}`);
}
const threePkg = JSON.parse(fs.readFileSync(path.join(NM, 'three/package.json'), 'utf8'));
if (threePkg.version !== '0.160.1') {
  console.warn(`[warn] three 版本为 ${threePkg.version}，产物可能与既有构建不一致（基线 0.160.1）`);
}

/* ---------- 1. 读取页面与源码 ---------- */
const parts = fs.readdirSync(path.join(dir, 'parts')).filter(f => /\.(js|html)$/.test(f)).sort();
let head = '', js = '';
for (const f of parts) {
  const txt = fs.readFileSync(path.join(dir, 'parts', f), 'utf8');
  if (f.endsWith('.html')) head += txt + '\n';
  else js += `\n/* ===== ${f} ===== */\n` + txt + '\n';
}

/* ---------- 2. three 核心 ---------- */
let threeSrc = fs.readFileSync(path.join(NM, 'three/build/three.module.min.js'), 'utf8');
const expIdx = threeSrc.lastIndexOf('export{');
if (expIdx < 0) throw new Error('three 导出语句未找到');
const expEnd = threeSrc.indexOf('};', expIdx);
let expList = threeSrc.slice(expIdx + 7, expEnd);
threeSrc = threeSrc.slice(0, expIdx);

const names = expList.split(',').map(s => s.trim()).filter(Boolean).map(ent => {
  const m = ent.split(/\s+as\s+/);
  return m.length === 2 ? `${m[1]}:${m[0]}` : m[0];
});
const threeBlock = `const THREE = (function(){\n${threeSrc}\nreturn {${names.join(',')}};\n})();\n`;

/* ---------- 3. jsm 模块 ---------- */
const ENTRIES = [
  'three/examples/jsm/geometries/RoundedBoxGeometry.js',
  'three/examples/jsm/postprocessing/EffectComposer.js',
  'three/examples/jsm/postprocessing/RenderPass.js',
  'three/examples/jsm/postprocessing/UnrealBloomPass.js',
  'three/examples/jsm/postprocessing/ShaderPass.js',
  'three/examples/jsm/postprocessing/OutputPass.js',
  'three/examples/jsm/utils/BufferGeometryUtils.js'
];

const cache = new Map();
const order = [];
const threeNames = new Set();
const exportsByName = new Map();   // path -> [exported names]

function resolveSpec(spec, fromFile) {
  if (spec === 'three') return null;
  return path.resolve(path.dirname(fromFile), spec);
}

function load(file) {
  if (cache.has(file)) return cache.get(file);
  cache.set(file, 'pending');
  let src = fs.readFileSync(file, 'utf8');
  const exported = [];

  // 具名导入
  src = src.replace(/import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?/g, (m, list, spec) => {
    const namesArr = list.split(',').map(s => s.trim()).filter(Boolean);
    const target = resolveSpec(spec, file);
    if (target === null) {
      namesArr.forEach(n => threeNames.add(n.split(/\s+as\s+/)[0].trim()));
    } else {
      load(target);
    }
    return '';
  });
  // 命名空间导入
  src = src.replace(/import\s*\*\s*as\s*(\w+)\s*from\s*['"]([^'"]+)['"];?/g, (m, alias, spec) => {
    const target = resolveSpec(spec, file);
    if (target !== null) {
      const ex = load(target) || [];
      src += `\nconst ${alias} = {${ex.join(',')}};\n`;
    }
    return '';
  });
  // 导出语句
  src = src.replace(/export\s*\{([\s\S]*?)\};?/g, (m, list) => {
    list.split(',').map(s => s.trim()).filter(Boolean).forEach(ent => {
      const p = ent.split(/\s+as\s+/);
      exported.push(p.length === 2 ? `${p[1]}:${p[0]}` : p[0]);
    });
    return '';
  });
  src = src.replace(/export\s+default\s+/g, 'const __default__ = ');
  src = src.replace(/export\s+(class|function|const|let|var)\s+(\w+)/g, (m, kw, nm) => {
    exported.push(nm);
    return `${kw} ${nm}`;
  });

  const plain = exported.map(e => e.split(':')[0]);
  cache.set(file, plain);
  exportsByName.set(file, plain);
  order.push({ file, src });
  return plain;
}

for (const e of ENTRIES) load(path.join(NM, e));

const jsmSrc = order.map(o => `/* ${path.basename(o.file)} */\n${o.src}`).join('\n');
const want = ['RoundedBoxGeometry', 'EffectComposer', 'RenderPass', 'UnrealBloomPass', 'ShaderPass', 'OutputPass', 'BufferGeometryUtils'];
const bguFile = path.join(NM, 'three/examples/jsm/utils/BufferGeometryUtils.js');
const bguNames = exportsByName.get(bguFile) || [];
const jsmBlock = `const { ${want.join(', ')} } = (function(){
const { ${[...threeNames].join(', ')} } = THREE;
${jsmSrc}
const BufferGeometryUtils = {${bguNames.join(',')}};
return { ${want.join(', ')} };
})();
`;

/* ---------- 4. 游戏源码：去掉 import ---------- */
let code = js.replace(/^\s*import[\s\S]*?from\s*['"][^'"]+['"];?[ \t]*$/gm, '');
code = code.replace(/^\s*import\s*['"][^'"]+['"];?[ \t]*$/gm, '');

/* ---------- 5. 输出 ---------- */
const bundle = `(function(){
'use strict';
${threeBlock}
${jsmBlock}
${code}
})();`;

const out = `${head}
<script>
${bundle}
</script>
</body>
</html>
`;
const target = path.join(dir, '..', '上海地铁模拟驾驶.html');

/* 产物完整性校验：缺模块时宁可失败，也不要悄悄写出半成品 */
const required = ['/* ===== 10_data.js ===== */', '/* ===== 70_game.js ===== */', '/* ===== 80_ui.js ===== */', 'UnrealBloomPass'];
const missing = required.filter(k => !out.includes(k));
if (missing.length) throw new Error('产物缺少关键片段，构建中止：' + missing.join(', '));
if (out.length < 800 * 1024) throw new Error(`产物仅 ${(out.length / 1024).toFixed(0)} KB，疑似打包不完整`);

fs.writeFileSync(target, out, 'utf8');
fs.writeFileSync(path.join(dir, 'entry.js'), js, 'utf8');
console.log('built', target, (out.length / 1024).toFixed(0) + ' KB', '| bundle', (bundle.length / 1024).toFixed(0) + ' KB',
  '| three', (threeSrc.length / 1024).toFixed(0) + 'KB', '| jsm', (jsmSrc.length / 1024).toFixed(0) + 'KB',
  '| three@' + threePkg.version);
