# MAX × VideoUse 双机同步与 NAS 目录规范

## 真源与边界

| 内容 | 唯一发布真源 | 写入权限 |
| --- | --- | --- |
| MAX 正式规则与发布清单 | `CHEN-BRAIN/main` | 仅决策中枢通过正式治理 PR |
| Skill、工作台、模板与项目文档 | `My-Video/main` | 仅决策中枢通过普通 PR |
| 规则候选 | `CHEN-BRAIN/main` 的 `08/open/` | 次电脑只能新增一个 candidate PR |
| NAS | active release 的单向镜像 | 不参与写入、合并或裁决 |
| 原片、原始 EDL、历史交付、缓存、密钥 | 本机 | 不进入 Git 或规则镜像 |

每条视频开始前，两台电脑都快进同步两个 `main`，读取 CHEN-BRAIN 的 `current-release.yaml`，确认其中 `minimum_my_video_commit` 是本机 My-Video `HEAD` 的祖先。失败即停止启动并同步，不回退猜测执行。

任务启动时冻结：正式规则 SHA、My-Video SHA、release ID，以及按相关性选出的**最多 3 条候选**。任务中远端变化不会改写这份冻结判断基础。

## 两台电脑

- **主电脑 / decision-hub**：审阅候选、创建审阅批次、更新正式规则、移动 processed、创建 release、合并正式 PR。
- **次电脑 / editor**：读取 active release 与冻结候选；视频结束后只通过治理命令准备一个新的 candidate PR。不得改写正式 `00–07`、processed、release、Skill、工作台或 NAS 正文。
- 两台电脑不同时编辑同一视频工作台草稿、同一原片副本或同一正式规则文件。

## NAS

只有用户明确说“把现有所有配置和规则同步到 NAS”时，才从已确认 active release 的 Git SHA 生成单向镜像。镜像记录 release ID、两仓 SHA、相对路径与校验和；NAS 漂移标记 `REVIEW`，绝不反向覆盖 Git。

所有面向 MAX 审看的输出固定为 **1080P、30 fps**；该要求不改变原片、原始 EDL 或用户明确要求的母版规格。
