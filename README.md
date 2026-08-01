# MAX 视频项目

## VideoUse 通用剪辑工作台

工作台是独立的本地浏览器界面：它读取任意包含 `edl*.json` 的 VideoUse 项目，并只在该项目下创建 `workbench/`（草稿、版本、事件和导出）。源素材和原 VideoUse 文件不会被覆盖。

```bash
npm run workbench       # API: http://127.0.0.1:4317
npm run workbench:web   # UI:  http://127.0.0.1:5173
```

使用其他本机 Web 端口时，必须精确配置来源，例如 `WORKBENCH_ALLOWED_ORIGINS=http://127.0.0.1:5181 WORKBENCH_PORT=4318 npm run workbench`；API 不接受通配 CORS。Web 可用 `?api=http://127.0.0.1:4318` 指向该明确实例。

在 UI 输入 VideoUse 项目的绝对路径并打开。v1 支持单条音画绑定轨的删除/恢复/调序、跨素材连续播放、时间线缩放与定位、自动草稿、版本快照/恢复、持久事件审计、后台代理与 VideoUse 粗剪渲染任务、VideoUse EDL 导出和稳定剪映交付包。代理与渲染先写 `.part`，媒体验证通过后才原子发布最终文件。

代理生成和真正的 VideoUse 渲染由 VideoUse 后端执行，工作台以持久任务记录、日志、SSE 状态和可查询终态呈现过程。剪映原生草稿适配器刻意未作为“通用导入”实现：本机没有可验证的剪映应用版本与版本锁定草稿夹具，因此稳定包只交付相对引用清单、EDL、来源清单、决策引用和明确的实验性适配器状态。只有取得安装版本、对应原生草稿样本与导入回归夹具后才重新启用该适配器。

这是 MAX 视频包装的独立 Remotion 项目。当前完成的是技术底座，不代表最终 MAX 视觉风格。

## 制作 SOP

制作 MAX 视频时，从[《MAX 视频制作 SOP》](docs/MAX视频制作SOP.md)开始，并为每条视频复制相应模板：

- [制作需求单](templates/制作需求单.md)：开工前确认平台、规格、输入文件、包装目标、安全区和缺失项。
- [时间线装配表](templates/时间线装配表.md)：把口播、画面、素材、动效、字幕和音效对齐到时间码。
- [交付检查表](templates/交付检查表.md)：完成 Studio、静帧、完整成片和输出规格检查。
- [技术错题集](iteration/technical-errata.md)：只记录根因明确且修复已经验证的技术问题。

MAX 长期品牌规则继续保存在 `references/max-video-profile.md`，用户确认的校准结论保存在 `iteration/calibration-log.md`。单条视频偏好和技术错误不得自动写入长期品牌规则。

## 项目位置

```text
/Users/chen.zip/Documents/Codex/MAX视频项目
```

## 启动预览

进入项目目录后运行：

```bash
npm run dev
```

等价命令：

```bash
npx remotion studio
```

Remotion Studio 会在浏览器中打开。关闭终端中的服务请按 `Control + C`。

## 素材位置

把图片、视频、字体、音乐和音效放入 `public/`。在 Remotion 代码中使用 `staticFile()` 引用。

## 本地验证

```bash
npm run lint
npx remotion compositions
npx remotion still MyComp out/validation-frame.png --frame=0 --scale=0.25
npx remotion render MyComp out/validation.mp4 --frames=0-29
```

## 以后如何使用

在 Codex 中单独打开这个项目文件夹，然后提出具体视频需求。每次开始前先读取：

- `AGENTS.md`
- `docs/MAX视频制作SOP.md`
- `references/max-video-profile.md`
- `iteration/calibration-log.md`

开工时复制制作需求单和时间线装配表，交付前复制交付检查表。第一条真实 MAX 视频完成后，再把用户确认的视觉、字幕、动画和音频规律写回项目。稳定流程形成后，才升级为 MAX 专属 Skill。
