# MAX 视频项目

这是 MAX 视频包装的独立 Remotion 项目。当前完成的是技术底座，不代表最终 MAX 视觉风格。

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
- `references/max-video-profile.md`
- `iteration/calibration-log.md`

第一条真实 MAX 视频完成后，再把用户确认的视觉、字幕、动画和音频规律写回项目。稳定流程形成后，才升级为 MAX 专属 Skill。
