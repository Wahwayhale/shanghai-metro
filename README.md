# 上海地铁模拟驾驶 · Shanghai Metro Driver Simulator

基于 Three.js 的**单文件离线**上海地铁模拟驾驶。整个游戏打包成一个 HTML 文件，双击即玩，不需要服务器、不联网。

- 39 条交路：1–18 号线全线、浦江线、市域机场线、磁浮线，以及若干特色交路（浦东段、环线、共线段、大站车等）
- 全手动操作：牵引/制动手柄、屏蔽门、ATP、信号、停站对标
- 车站内可下车步行、进出车厢、就座乘车，换乘通道有双向客流
- 离开驾驶室 1 分钟后 AI 接管并驶离，玩家成为乘客，可在站台等下一列车再接管任意列车

## 直接玩

打开根目录的 **`上海地铁模拟驾驶.html`**（约 1.8 MB）即可。浏览器需要支持 WebGL2，建议桌面 Chrome / Edge。

如果所在平台会拦截「单行压缩脚本」，改用 **`上海地铁模拟驾驶-可读版.html`**（未压缩的 three.js，约 2.5 MB）。

## 操作

| 按键 | 功能 |
|---|---|
| `W` / `S` | 牵引 / 制动（松开保持手柄位置） |
| `A` | ATO 自动运行开关 |
| `O` / `P` | 开门 / 关门 |
| `空格` | 紧急制动 |
| `F` | 下车步行 / 返回驾驶室 |
| `E` | 步行时：进车厢 / 就座 / 站起 |
| `G` | 步行时：打开「接管任意列车」面板 |
| `C` | 切换视角（司机室 / 追车 / 自由环绕 / 站台） |
| `F1` | 显示 / 隐藏 HUD |
| `F3` | 性能徽章（fps / 帧时间 / 渲染分辨率） |
| `F4` | 逐项关效果做性能诊断 |
| `Esc` | 暂停 |

设置里可切换**时段**（白天/黄昏/夜间）、**天气**（晴/雨/雾）、**难度**、**画质**、**自动限速**。

## 从源码构建

```bash
cd shanghai-metro
npm install          # 依赖 three@0.160.1 与 puppeteer-core（回归测试用）
npm run build        # → ../上海地铁模拟驾驶.html
npm run build:readable   # → ../上海地铁模拟驾驶-可读版.html
```

`build2.js` 是一个不依赖 esbuild 的纯 JS 打包器：它把 `parts/*.js` 按文件名顺序拼接，并把 `three.module.min.js` 与用到的 jsm 模块提升到同一个 IIFE 里，最终产出单文件 HTML。

## 目录结构

```
shanghai-metro/
  parts/          游戏源码，按编号顺序拼接（10_data → 80_ui）
    00_head.html    HTML 骨架 + 全部 CSS
    10_data.js      线路/交路/车站数据、车辆常量
    12_network.js   39 条交路与官方运行图（生成文件）
    20_route.js     经纬度 → 世界坐标、样条中心线、纵断面、曲线限速
    30_materials.js 全部程序化贴图与材质、三套主题（日/黄昏/夜）
    40_world.js     轨道、隧道、高架、地面、黄浦江、城市、地标
    42_stations.js  车站（站台、屏蔽门、楼扶梯、导向、灯光）
    43_stationx.js  换乘通道、出入口、PIS 屏
    44_crowd.js     站台乘客与换乘客流
    50_train.js     列车（车体、车门、司机室、车厢内饰、车内乘客）
    51_sh15.js      15 号线列车（移植自 MTR/Blockbench 模型）
    52_ai.js        AI 列车（对向车、同向车、按图运行）
    70_core.js      主循环、渲染管线、画质/动态分辨率
    71_scene.js     场景构建流程
    72_physics.js   动力学、ATP、车门联锁
    73_flow.js      流程控制、步行、换乘、AI 接管
    74_hud.js       HUD
    75_view.js      相机与输入
    80_ui.js        主菜单与设置
  official/       线路数据的生成脚本（从官方里程/时刻表生成 12_network.js）
  scripts/        convert-sh15.js：把 .bbmodel 转成 51_sh15_data.js
  tests/          回归测试（puppeteer-core 驱动真实浏览器）
  build2.js       打包器
```

## 测试

```bash
cd shanghai-metro
npm test              # 全量：单元 + 冒烟 + 模块 + 交路 + 车体 + 金标准
npm run test:ride     # 车厢自由进出 / 就座 / AI 接管
npm run test:passenger # 乘客流程 + 自动限速开关
npm run smoke         # 只跑冒烟
```

测试用 `puppeteer-core` 驱动本机 Edge/Chrome，需要浏览器路径可被 `tests/testenv.js` 自动探测（或用 `BROWSER_PATH` 指定）。

## 已知边界

- 线路走向、站名依据公开资料近似还原，**不用于任何运营或培训用途**。
- 车站与列车是程序化建模 + 少量手工移植资产，不追求逐构件 1:1。
- 帧率受显卡影响较大；内置动态分辨率（DRS）会自动缩放，最低只降到「标准」档，不会自动降到「流畅」。

## 致谢

- [Three.js](https://threejs.org/) 0.160.1
- 15 号线列车模型来自 Minecraft MTR 资源包 `sh15_pth`（Blockbench 制作）
