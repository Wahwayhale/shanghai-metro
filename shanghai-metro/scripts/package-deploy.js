/* ------------------------------------------------------------------
   一键打包部署产物（P4-4）

   产物优先「可读版」：未压缩的 three 源码 + 正常格式的游戏代码，
   用于绕开部分静态平台对「单行压缩脚本」的误判。
   - 生成 ../上海地铁模拟驾驶-可读版.html
   - 同步到 deploy-readable/index.html（可直接上传/拖拽）
   - 写入 .nojekyll（GitHub Pages）与 _headers（Cloudflare/Netlify）
   - 检查产物是否有外部 http(s) 引用（应为 0）
   ------------------------------------------------------------------ */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(ROOT, '..', 'deploy-readable');
const OUT = path.join(OUT_DIR, 'index.html');

console.log('[deploy] building readable bundle…');
execFileSync(process.execPath, [path.join(ROOT, 'build2.js'), '--readable'], {
  cwd: ROOT, stdio: 'inherit'
});

if (!fs.existsSync(OUT)) {
  console.error('[deploy] 失败：deploy-readable/index.html 未生成');
  process.exit(1);
}
const html = fs.readFileSync(OUT, 'utf8');
const bytes = Buffer.byteLength(html);
if (bytes < 1200 * 1024) {
  console.error(`[deploy] 失败：产物仅 ${(bytes / 1024).toFixed(0)} KB，疑似不完整`);
  process.exit(1);
}
const external = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map(m => m[1]);
if (external.length) {
  console.error('[deploy] 失败：产物含外部引用（离线自包含被破坏）：');
  external.slice(0, 8).forEach(u => console.error('  ' + u));
  process.exit(1);
}

fs.writeFileSync(path.join(OUT_DIR, '.nojekyll'), '');
fs.writeFileSync(path.join(OUT_DIR, '_headers'),
  '/*\n  Cache-Control: public, max-age=600\n  X-Content-Type-Options: nosniff\n');

console.log('');
console.log('[deploy] 完成:', OUT);
console.log('[deploy] 体积:', (bytes / 1024 / 1024).toFixed(2), 'MB · 外部引用: 0');
console.log('');
console.log('上传方式（任选其一）：');
console.log('  Cloudflare Pages: npx wrangler pages deploy deploy-readable --project-name shanghai-metro');
console.log('  GitHub Pages    : 把 deploy-readable 内容推到 gh-pages 分支（见 DEPLOY.md）');
console.log('  上码 upma.cn    : 把 deploy-readable 文件夹拖进上传区');
console.log('  本地验证        : 用浏览器打开 deploy-readable/index.html');
