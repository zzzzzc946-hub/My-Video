# MAX 视频项目

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
