/* ------------------------------------------------------------------
   回归/截图脚本的公共环境：路径与浏览器一律动态解析，不写死绝对路径。
   项目搬家后这些脚本应自动跟随，不需要逐个改。
   ------------------------------------------------------------------ */
const path = require('path');
const fs = require('fs');

const SM = path.resolve(__dirname, '..');   // shanghai-metro/（本文件位于 tests/ 下）
const ROOT = path.resolve(SM, '..');        // 项目根目录
const HTML = path.join(ROOT, '上海地铁模拟驾驶.html');
const PAGE_URL = 'file:///' + HTML.replace(/\\/g, '/');

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.BROWSER_PATH
].filter(Boolean);

const CHROME = BROWSERS.find(p => fs.existsSync(p));
if (!CHROME) {
  throw new Error('未找到 Edge/Chrome，可设置环境变量 BROWSER_PATH 指向浏览器可执行文件');
}

/* 统一启动参数：软件渲染，无头，1280×720 */
function launchArgs(extra) {
  return ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'].concat(extra || []);
}

module.exports = { SM, ROOT, HTML, PAGE_URL, CHROME, EDGE: CHROME, launchArgs };
