# MAX 视频项目协作规则

## 当前职责

本项目只负责 MAX 视频包装。先读取 `references/max-video-profile.md` 和 `iteration/calibration-log.md`，再设计或修改视频。

## 边界

- `02｜MAX顶层思维系统` 及其他 MAX 源文档只读，除非用户明确授权修改。
- 不根据猜测补写 MAX 风格；缺失规则保持未定义，并通过真实成片反馈校准。
- 文字、字幕、动画、转场、音频和布局先作为本项目内部能力，不拆分独立 Agent。
- 素材放入 `public/`，代码通过 Remotion 的 `staticFile()` 引用。
- 动画必须由帧驱动，禁止依赖 CSS transition、CSS animation 或 Tailwind animation。

## 每次制作流程

1. 确认视频比例、时长、平台、脚本、素材和交付格式。
2. 读取品牌规则、禁用项、案例和最近校准记录。
3. 在 Remotion Studio 预览关键帧和完整时间线。
4. 完成静帧检查与成片渲染后再交付。
5. 用户确认的稳定经验写入品牌规则、组件参数、案例或校准记录。
