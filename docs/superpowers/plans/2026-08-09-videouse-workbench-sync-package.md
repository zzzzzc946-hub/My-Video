# VideoUse 工作台同步包 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将主电脑已验证的 VideoUse 工作台快速最终导出能力以可测试、可运行的最小完整包推送到 `codex/two-computer-sync`。

**Architecture:** 在现有 `workbench/` 中迁入模型、任务 API、导出器和网页界面。单源纯粗剪由 `renderFinalVideoUse()` 使用一次 filtergraph 合成与 `h264_videotoolbox`；其余请求使用兼容导出。

**Tech Stack:** TypeScript、Node.js、Vitest、Vite、FFmpeg、macOS VideoToolbox。

## Global Constraints

- 仅同步 `workbench/` 运行代码、测试、MAX Skill 与工作台契约。
- 不同步 NAS 原片、个人知识库、制作记录、EDL、缓存、成片或无关设计草稿。
- 从主电脑逐文件应用差异；不整体复制或覆盖目录。
- 快速导出仅适用于单源、删留或调序、无字幕/调色/外部素材/包装且保持源帧率的最终候选。
- 快速导出保持既有 EDL、词级切点和 30ms 音频淡入淡出；条件或硬件编码不成立时回退兼容导出。
- 验证不启动真实渲染，不改动 NAS 原片。

---

### Task 1: 先迁入导出行为测试

**Files:** 修改 `workbench/tests/exporters.test.ts`、`api.test.ts`、`tasks.test.ts`、`playback.test.ts`、`docs/videouse-workbench-contract.md`；新增 `export-form.test.ts`、`export-interaction.test.ts`、`export-message.test.ts`、`zoom.test.ts`。

**Interfaces:** 产生对 `renderFinalVideoUse()`、`isFastDeliveryRequest()`、最终导出请求、进度事件和网页交互的测试约束。

- [ ] 用 apply_patch 从主电脑逐文件迁入测试和契约，不迁入实现。
- [ ] 运行 `npm run test:workbench -- workbench/tests/exporters.test.ts workbench/tests/api.test.ts workbench/tests/tasks.test.ts workbench/tests/playback.test.ts workbench/tests/export-form.test.ts workbench/tests/export-interaction.test.ts workbench/tests/export-message.test.ts workbench/tests/zoom.test.ts`；预期因缺少最终导出接口或网页模块失败。
- [ ] 保存首个确定性失败输出，作为 Task 2 的对照。

### Task 2: 迁入快速最终导出与网页实现

**Files:** 修改 `workbench/shared/model.ts`、`workbench/server/exporters.ts`、`api.ts`、`tasks.ts`、`workbench/web/App.tsx`、`editor.ts`、`playback.ts`、`styles.css`；新增 `export-form.ts`、`export-interaction.ts`、`export-message.ts`、`zoom.ts`。

**Interfaces:** 实现 `isFastDeliveryRequest(project, request)`、`renderPlanForFinalVideo(project, request)`、`fastDeliveryEncodeArguments(project, output)`、`renderFinalVideoUse(candidateRoot, project, request, logPath, onProgress?)` 与可见导出状态。

- [ ] 逐文件比较主电脑与隔离分支，并只用 apply_patch 迁入上述实现。
- [ ] 重跑 Task 1 的测试命令，预期 PASS。
- [ ] 运行 `npm run lint` 和 `npm run workbench:build`，预期均以 0 退出且不启动真实渲染。

### Task 3: 对齐规则、发布并生成接入指令

**Files:** `.codex/skills/max-jianji-skill/SKILL.md`、`docs/videouse-workbench-contract.md` 与本规格、计划。

**Interfaces:** 另一台 Codex 的工具路由：纯粗剪最终候选从工作台发起；复杂项目回退常规路径。

- [ ] 用 `rg` 检查 Skill、契约和导出器均声明快速条件、最终视频导出、`h264_videotoolbox` 与兼容回退。
- [ ] 用 `git diff --check` 与 `git status --short` 确认没有素材、制作记录或 NAS 路径进入待提交集。
- [ ] 提交并推送工作台、Skill、契约、规格和计划到 `origin/codex/two-computer-sync`。
- [ ] 输出另一台电脑指令，仅允许克隆、检出、创建被忽略 NAS 配置、运行测试和启动工作台；禁止真实渲染和改动 NAS 原片。

## Plan Self-Review

- Task 1 覆盖测试契约，Task 2 覆盖导出与界面实现及验证，Task 3 覆盖规则对齐、范围检查和发布。
- 没有未定义的后续工作。
- Task 2 的 `renderFinalVideoUse` 与 `isFastDeliveryRequest` 是 Task 1 测试和 Task 3 路由的同一接口。
