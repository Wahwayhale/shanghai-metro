# 部署说明（P4-4）

产物是**单文件、零外部请求**的离线页面。部署优先使用「可读版」：
未压缩的 three 源码 + 正常格式的游戏代码，避免部分静态平台把单行
压缩脚本误判为混淆代码。

## 一条命令打包

```bash
cd shanghai-metro
npm run package:deploy
```

输出：

| 路径 | 用途 |
|---|---|
| `../上海地铁模拟驾驶-可读版.html` | 可直接双击打开的离线产物 |
| `deploy-readable/index.html` | 上传/拖拽用的目录（含 `.nojekyll`、`_headers`） |

脚本会检查产物体积与外部 `http(s)` 引用，任何一项不满足都会直接失败。

## 部署方式

### Cloudflare Pages

```bash
cd shanghai-metro
npx wrangler pages deploy deploy-readable --project-name shanghai-metro
```

首次会要求登录 Cloudflare；之后同一条命令即可发布。`_headers` 已写入
基础缓存与 `nosniff` 头。

### GitHub Pages

`deploy-readable/` 在 `.gitignore` 里，不能直接 `git subtree`。用独立
worktree 推 `gh-pages`：

```bash
cd ..
git worktree add -B gh-pages ../sm-gh-pages
cp -r shanghai-metro/deploy-readable/. ../sm-gh-pages/
cd ../sm-gh-pages
git add -A
git commit -m "deploy: readable build"
git push origin gh-pages
```

仓库 Settings → Pages → Branch 选 `gh-pages` / root。`.nojekyll` 已随产物
复制，避免下划线文件被 Jekyll 过滤。

> 也可以在网页端把 `deploy-readable/index.html` 直接上传到 Pages 的
> 上传入口（单文件即可运行）。

### 上码 upma.cn

把 `deploy-readable` 文件夹整个拖进上传区，得到 `https://xxx.upma.site`
链接。

## 发布前检查

1. 本地双击 `deploy-readable/index.html`，菜单 39 张线路卡完整。
2. 进入一条线路并开始值乘，控制台无报错。
3. DevTools → Network：除文档本身外应为 0 个请求（无 CDN、无字体外链）。
4. 手机横屏打开：底部触屏手柄出现，能完成一次停站与开门。
5. 首次进入会出现 3 步新手引导；暂停菜单可重看。

## 注意

- 可读版约 1.8 MB（压缩版约 1.3 MB）；传输时建议开启 brotli/gzip。
- 页面首次进入线路仍需 6–10 s 构建线路与城市，这是当前架构的已知开销。
- 本作品为模拟器，不用于运营或培训。
