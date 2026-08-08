# MAX × VideoUse 本地优先同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复双机、本地、Git 与 NAS 之间的规则、媒体和切机同步歧义。

**Architecture:** 本机本地目录承担日常读写；项目文本以 `codex/two-computer-sync` Git 分支为唯一版本源；NAS 仅在明确同步、规则确认或切机前作为镜像。对同一文件的双端变更停止同步并标记 `REVIEW`。

**Tech Stack:** Markdown、JSON、Git、macOS 本地目录、NAS 挂载。

## Global Constraints

- 不复制、移动、删除原片、EDL、缓存、历史交付、密钥或 `.env`。
- 本地媒体根目录固定为 `/Users/chen.zip/Documents/Codex/MAX视频本地资料/原片` 与 `/Users/chen.zip/Documents/Codex/MAX视频本地资料/交付`。
- 唯一共享 Git 分支为 `codex/two-computer-sync`；不合并或修改 `main`。
- NAS 同步仅在用户明确要求、规则确认后或切换电脑前执行；双端冲突必须停止并标记 `REVIEW`。

---

### Task 1: Establish local working roots

**Files:**

- Create directory: `/Users/chen.zip/Documents/Codex/MAX视频本地资料/原片`
- Create directory: `/Users/chen.zip/Documents/Codex/MAX视频本地资料/交付`
- Modify: `config/nas-paths.json`

**Produces:** 本机配置的知识库、媒体和交付路径均为本地工作副本，不进入 Git。

- [x] 创建两个空本地目录；不得从 NAS 复制媒体。
- [x] 将 `config/nas-paths.json` 的 `knowledgeBaseRoot`、`mediaRoot`、`deliveryRoot` 分别设为本地 `CHEN BRAIN`、本地原片、交付目录。
- [x] 用 Node 解析 JSON，并断言三个目标目录存在。

### Task 2: Replace stale dual-computer documentation

**Files:**

- Modify: `README.md`
- Modify: `docs/双机同步与NAS目录规范.md`
- Modify: `docs/双机切换清单.md`
- Modify: `config/README.md`
- Modify: `config/nas-paths.example.json`

**Produces:** 文档明确单一权威、固定分支、阶段镜像、冲突停写、本地媒体目录及切机闸门。

- [x] 将 NAS 从“实时知识库工作源”改为“阶段镜像”；明确本地 `CHEN BRAIN` 的编辑权只属于当前决策中枢。
- [x] 将 Git 文本真源限定为 `codex/two-computer-sync`，并要求新电脑先拉该分支。
- [x] 将同步协议写成：比较本地与 NAS；单端变更可复制；双端同文件变更为 `REVIEW`，不得覆盖。
- [x] 将切机清单写成硬门槛：停止同视频编辑、同步规则和配置、推送/拉取分支、再选择本地媒体副本。
- [x] 将配置模板改为本地工作路径示例，并在配置说明中区分本地工作路径与 NAS 镜像路径。
- [x] 用 `rg -n '本地优先|codex/two-computer-sync|REVIEW|阶段镜像|不得同时'` 复核所有文档。

### Task 3: Validate and publish text-only workflow changes

**Files:**

- Modify: files from Tasks 1–2
- Add: this plan

**Produces:** 可供第二台电脑拉取的同步规范；本机路径配置保持忽略。

- [x] 运行 `git diff --check` 和 `git status --short`，确认暂存范围没有媒体、EDL、缓存、交付或凭据。
- [ ] 运行 `git add README.md docs/ config/nas-paths.example.json`，提交 `docs: enforce local-first sync workflow`。
- [ ] 推送 `origin/codex/two-computer-sync`；不创建或改写 `main`。
