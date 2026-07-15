# MAX 视频项目协作规则

## 当前职责

本项目只负责 MAX 视频包装。先读取 `docs/MAX视频制作SOP.md`、`references/max-video-profile.md` 和 `iteration/calibration-log.md`，再设计或修改视频。

## 边界

- `02｜MAX顶层思维系统` 及其他 MAX 源文档只读，除非用户明确授权修改。
- 不根据猜测补写 MAX 风格；缺失规则保持未定义，并通过真实成片反馈校准。
- 文字、字幕、动画、转场、音频和布局先作为本项目内部能力，不拆分独立 Agent。
- 素材放入 `public/`，代码通过 Remotion 的 `staticFile()` 引用。
- 动画必须由帧驱动，禁止依赖 CSS transition、CSS animation 或 Tailwind animation。

## 每次制作流程

1. 复制并填写 `templates/制作需求单.md`，确认视频比例、时长、平台、脚本、素材和交付格式。
2. 读取品牌规则、禁用项、案例和最近校准记录；未确认内容保持“未校准”。
3. 复制并完成 `templates/时间线装配表.md`，再进入 Remotion 制作。
4. 在 Remotion Studio 预览关键帧和完整时间线。
5. 使用 `templates/交付检查表.md` 完成静帧检查与完整成片渲染后再交付。
6. 根因明确且修复已验证的技术问题写入 `iteration/technical-errata.md`。
7. 用户确认的稳定经验写入品牌规则、组件参数、案例或校准记录；一次性偏好不得自动升级为长期规则。
