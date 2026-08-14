# My-Video 仓库统一记录

**日期：** 2026-08-14
**目的：** 将主电脑本地 `main`、共享规则分支和 GitHub `origin/main` 合为可发布的单一历史，同时不覆盖素材、历史产物或未确认的本地工作。

## 执行前提交点

| 名称 | SHA | 说明 |
| --- | --- | --- |
| 本机 `main` | `e91de93ccaeedccc1c53b8364ef584b73aa21d31` | 主电脑工作目录基础 |
| `codex/two-computer-sync` | `a2e7c7fa1af41cd8147001b27bdd73364da7a6ad` | 含最终规格与工作台共享演进 |
| `origin/main` | `812fb4bab99e5b527bb9ae033db9f99a3112d9a7` | 远端初始历史 |

`main` 是共享分支的祖先；`origin/main` 与共享分支无共同祖先，必须通过一次普通的 `--allow-unrelated-histories` 合并保留两套历史。共享分支相对本机 `main` 领先 24 个提交，相对 `origin/main` 有 3 个远端独有提交和 36 个共享分支独有提交。所有数字在实际合并前重新检查；不把本表的值当作常量。

## 明确排除

- `制作记录/`：约 4.3GB，包含素材副本、工作台草稿、转写、预览和渲染产物。
- `graphify-out/`：约 5.8MB，生成图谱。
- `.superpowers/`：本机运行状态。
- `.codex/hooks.json`：本机 Codex 配置。

以上内容不暂存、不复制、不移动，也不通过 `git add -A` 或未跟踪文件 stash 处理。

## 本机已修改文件裁决

| 路径或范围 | 裁决 | 原因 |
| --- | --- | --- |
| `AGENTS.md` 的 Graphify 13 行规则 | 保全 | 与共享规则不冲突，补充检索与生成物处理边界。 |
| `iteration/calibration-log.md` 的 2026-07-29 与 2026-08-06 校准 | 保全 | 是 MAX 真实视频的可追溯经验，未被共享分支等价记录覆盖。 |
| `.gitattributes` 的 `graphify-out/graph.json merge=graphify` | 保全 | 仅声明生成图谱的合并驱动，不影响视频素材。 |
| `tests/test_shared_video_use_contract.py` | 保全 | 只验证共享凭证不回显、工具选择与清理边界；不读取或提交凭证值。 |
| 本机 `workbench/server/*`、`workbench/web/*`、`workbench/shared/model.ts`、同名测试 | 共享分支胜出 | 本机修改包含源帧率/60fps 导出；共享分支已有 `6217337`，将审片锁定为 1080P/30fps，并含后续工作台测试。 |
| `.codex/skills/max-jianji-skill/SKILL.md` 本机副本 | 共享分支胜出 | 共享版本已有跨视频记忆、成本台账和固定审片规格。 |
| `docs/videouse-workbench-contract.md` 本机版本 | 共享分支胜出 | 本机版本仍允许源帧率；共享版本与固定审片规格一致。 |
| `workbench/web/export-form.ts` 与对应测试 | 共享分支胜出 | 本机版本与共享版本不同，统一后以已测试的共享版本为准。 |
| `iteration/technical-errata.md`、交互/导出相关同内容未跟踪文件 | 无操作 | 与共享分支内容一致。 |

## 本机独有文档的处置

下列文档或旧计划不直接发布为现行规则，因为包含已过期流程、机器绝对路径或与最终双机规格冲突的表述。它们由备份引用与定向补丁保全，后续只可由决策中枢检索后提炼：

- `docs/MAX-VideoUse-存储与凭证决策.md`
- `docs/MAX-剪辑工作流与工具路由.md`
- `docs/剪辑决策中枢-交接记忆.md`
- `docs/视频项目剪辑上层Agent-理解文档.md`
- 2026-07-31 至 2026-08-06 的本机独有设计与计划文档

这些资料不得因为历史价值而绕过新的 CHEN-BRAIN 正式规则、active release、候选 PR 或 1080P/30fps 约束。

## 已知初始化冲突裁决

若实际合并仍出现以下六个历史模拟冲突，默认采用共享分支版本：

- `.gitignore`
- `README.md`
- `docs/superpowers/plans/2026-07-15-max-video-sop.md`
- `docs/superpowers/specs/2026-07-15-max-video-sop-design.md`
- `package.json`
- `package-lock.json`

任何新增冲突都必须写入本记录并单独说明“本机保全”或“共享分支胜出”的理由；不能按文件更新时间、体积或名称猜测解决。

## 实际合并新增冲突

实际合并还产生了 `AGENTS.md` 与 `iteration/calibration-log.md` 的 add/add 冲突。远端版本分别只包含基础项目规则和“暂无”占位；整合分支版本包含原有基础内容以及本机保全的 Graphify 规则和真实校准记录。因此两者均采用整合分支版本，而非拼接冲突标记或按时间戳覆盖。
