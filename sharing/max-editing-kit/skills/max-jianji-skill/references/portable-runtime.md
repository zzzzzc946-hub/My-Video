# 分享版执行适配

## 路径、规则与权限

所有本文件中的路径均相对本 Skill 目录。原规则的 `00—08` 快照位于 `references/max-system/`。新任务先读取 `00｜MAX剪辑系统入口与读取顺序.md`，再按其中按需路由读取人物、受众、剪辑标准和相关反馈；当前 `SKILL.md` 保留了本机最新校准。存在实质冲突且无法按原裁决规则解决时记录 REVIEW，不静默拼接。

本包的默认顺剪、免常规策略确认和逐版本感知终审，以当前 Skill 入口为准；旧快照中描述的原作者电脑、NAS、正式发布或固定预算仅为原环境记录，不执行这些外部治理动作。不得自动调用 create_goal，不设默认 Token 预算，不自动启动子代理，不复制原作者的长期授权给其他用户。

`references/project/` 是配套 SOP/档案/模板。包装文档只在用户要求包装时应用，默认粗剪不添加字幕、音乐、特效或调色。历史复盘仅是判断参考，引用中的原媒体和全文任务记录没有分发。003/0059 等案例的未核验状态不得升级为 PASS。

## 运行工具

- Python：`assets/video-use/.venv/bin/python`，Windows 为 `.venv/Scripts/python.exe`。
- 新转写：用上述 Python 执行 `assets/video-use/helpers/transcribe.py <原片绝对路径> --edit-dir <任务目录> --language zh`。调用前明确这是接收者委托内的外部音频转写；不复用原作者 Key。
- 词级转写整理：`assets/video-use/helpers/pack_transcripts.py --edit-dir <任务目录>`。
- 切点画面/波形：`assets/video-use/helpers/timeline_view.py <文件> <开始秒> <结束秒>`。只在有判断需要的位置使用，图片不能代替连续音画验收。
- 兼容渲染：`assets/video-use/helpers/render.py <任务目录/edl.json> -o <任务目录/输出.mp4>`。
- 工作台：`scripts/workbench.py` 会启动捆绑的 `assets/runtime`，显式使用本包 Python 环境；代码不依赖原作者用户名或路径。

显式传任务目录，不用工具默认工作目录。EDL 直接引用原片与原始时间码，所有新转写、草稿和输出写入用户的任务目录；原素材不覆盖。复用已有转写前确认其对应同一源片、含词级时间戳且未被替换。

## 兼容 EDL 示例

这只是格式示例，时间码和句子必须来自真实素材，不得照抄为剪辑决定。`ranges` 为保留片段，顺序就是输出顺序：

```json
{
  "version": 1,
  "sources": {"source": "/your/task/source.mp4"},
  "ranges": [
    {"source": "source", "start": 1.2, "end": 5.6, "quote": "真实逐字稿", "reason": "实际删留依据"}
  ],
  "grade": "none",
  "output_fps": 30,
  "overlays": [],
  "total_duration_s": 4.4
}
```

`output_fps: 30` 用于保持固定审片帧率。捆绑渲染器的默认缩放保持源宽高比；标准 9:16 输出 1080×1920、16:9 输出 1920×1080。非标准比例不得硬拉伸，须按任务要求决定裁切或留边并核验实际输出尺寸。工作台中选择 MP4/1080P/30fps走兼容路径；仅支持源帧率的硬件快速路径不满足 MAX 固定帧率条件时不使用。

每个片段由渲染器添加 30ms 音频淡入淡出。最终用 ffprobe 核验实际分辨率、帧率、时长和音视频流。技术探测通过不能代替听审、口型和切点五维检查。

## 工作记录与交付

在接收者选择的任务目录保存 `project.md`、`rough-cut-log.md`、原片 EDL、版本清单、输出文件、用户反馈以及 `final-perceptual-review.md`。输出应明确技术检查、完整听审、连续口型同步各自的实际状态；没有感知能力时保留 NOT VERIFIED，不制造验收结论。

来源规则、相关案例、剪辑假设、每处删留/调序的证据和未解决项均可追溯。复盘保留在接收者自己的任务目录；本包中的原作者规则快照保持为学习参考，不自动回流原系统。
