const fs = require('fs');
const path = require('path');
const dir = __dirname;
const WORKSPACE = 'C:/Users/35498/.workbuddy/binaries/node/workspace';
const esbuild = require(path.join(WORKSPACE, 'node_modules', 'esbuild'));

const parts = fs.readdirSync(path.join(dir, 'parts')).filter(f => /\.(js|html)$/.test(f)).sort();
let head = '', js = '';
for (const f of parts) {
  const txt = fs.readFileSync(path.join(dir, 'parts', f), 'utf8');
  if (f.endsWith('.html')) head += txt + '\n';
  else js += `\n/* ===== ${f} ===== */\n` + txt + '\n';
}

fs.writeFileSync(path.join(dir, 'entry.js'), js, 'utf8');

(async () => {
  const result = await esbuild.build({
    entryPoints: [path.join(dir, 'entry.js')],
    bundle: true,
    format: 'iife',
    target: ['chrome100'],
    minify: true,
    write: false,
    nodePaths: [path.join(WORKSPACE, 'node_modules')],
    legalComments: 'none'
  });
  const bundle = result.outputFiles[0].text;
  const out = `${head}
<script>
${bundle}
</script>
</body>
</html>
`;
  const target = path.join(dir, '..', '上海地铁模拟驾驶.html');
  fs.writeFileSync(target, out, 'utf8');
  console.log('built', target, (out.length / 1024).toFixed(0) + ' KB', '| bundle', (bundle.length / 1024).toFixed(0) + ' KB');
})().catch(e => { console.error(e); process.exit(1); });
