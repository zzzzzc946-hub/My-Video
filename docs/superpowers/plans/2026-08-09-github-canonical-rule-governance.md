# GitHub 规则主库与双机治理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立以 GitHub 为唯一真源、当前电脑为唯一正式规则合并者、NAS 为单向镜像的 MAX 双机规则治理系统。

**Architecture:** 新建独立 `zzzzzc946-hub/CHEN-BRAIN` 仓库，其中 `rules/00–07/` 保存正式规则，`inbox/open/` 保存每条视频独立候选，`inbox/processed/` 保存已裁决候选。两台电脑本地克隆该仓库；当前电脑独占正式规则写入，另一台电脑只新增候选；NAS 从 Git 已确认提交单向镜像。

**Tech Stack:** Git、GitHub CLI、Markdown、JSON、macOS 本地目录、NAS 文件挂载。

## Global Constraints

- 当前电脑是长期唯一决策中枢；另一台电脑不得修改 `rules/00–07/`。
- 正式规则与候选文本在本地 clone 中读写，GitHub 默认分支为唯一正式真源。
- 不迁入或提交原片、成片、缓存、代理、EDL、工作台草稿、`.env`、密钥、`node_modules`、机器专属 Obsidian 状态。
- NAS 只接收 Git 已确认版本；禁止 NAS 文件反向覆盖 Git 工作副本。
- 每条视频启动前记录规则提交 SHA；任务期间固定规则快照。
- 禁止强推。正式规则推送失败时停止、拉取、重新检索并裁决。

---

### Task 1: 建立独立规则仓库骨架

**Files:**
- Create: `CHEN-BRAIN/.gitignore`
- Create: `CHEN-BRAIN/README.md`
- Create: `CHEN-BRAIN/rules/00–07/` 的八份正式规则副本
- Create: `CHEN-BRAIN/inbox/open/.gitkeep`, `CHEN-BRAIN/inbox/processed/.gitkeep`
- Create: `CHEN-BRAIN/templates/规则候选模板.md`
- Create: `CHEN-BRAIN/governance/正式规则写入协议.md`

**Interfaces:**
- Consumes: 当前本地 `CHEN BRAIN/03｜CHEN操盘手系统/03｜MAX剪辑系统/` 的 00–07 文档。
- Produces: Git 追踪的正式规则、候选收件箱、候选模板和合并协议。

- [ ] 只读核验源规则恰为 00–07，并记录每个文件的哈希与相对路径。
- [ ] 创建空的本机临时规则仓库目录；目标必须不存在或为空，不能覆盖当前 `CHEN BRAIN`。
- [ ] 用 apply_patch 写入 `.gitignore`，忽略 Obsidian 工作区、媒体、缓存、密钥、EDL、工作台草稿与机器配置。
- [ ] 用 apply_patch 写入候选模板：候选 ID、机器 ID、视频 ID、规则 SHA、目标规则 ID、裁决建议、判断、证据、范围、例外、冲突提示。
- [ ] 将 00–07 文本逐文件复制为 `rules/00–07/`，保留内容和 Unicode 文件名；不改源文件。
- [ ] 使用 `git diff --no-index` 和文件哈希验证八份导入文件与源规则一致。
- [ ] 初始化 Git、创建首个提交，并创建 GitHub 仓库 `zzzzzc946-hub/CHEN-BRAIN` 后推送默认分支。

### Task 2: 建立候选提交与决策中枢闸门

**Files:**
- Create: `CHEN-BRAIN/governance/规则候选生命周期.md`
- Create: `CHEN-BRAIN/governance/决策中枢身份.md`
- Create: `CHEN-BRAIN/governance/nas-mirror-manifest.example.json`
- Modify: `CHEN-BRAIN/README.md`

**Interfaces:**
- Consumes: Task 1 的 `rules/00–07/` 与候选模板。
- Produces: 候选状态、唯一写入者、推送冲突处理和 NAS 镜像来源 SHA 的可审计规则。

- [ ] 写入候选生命周期：`open → merged / rejected / review / evidence-merged`，每个候选只能新增，正式规则只由中枢裁决。
- [ ] 写入决策中枢身份：当前电脑为唯一正式规则合并者；切换身份只能由用户明确授权，且必须先处理未推送变更和 open 候选。
- [ ] 写入推送协议：开始任务 `git pull --ff-only`，候选可提交推送，正式规则修改前再次快进拉取；推送被拒绝时禁止强推。
- [ ] 写入 NAS 单向镜像协议：镜像记录 Git SHA、生成时间与文件哈希；NAS 与 Git 不一致时生成 REVIEW，不从 NAS 回写。
- [ ] 使用 Markdown 链接、路径检查与 `rg` 验证候选模板、正式规则写入者、规则 SHA、NAS 单向镜像和强推禁令均可检索。

### Task 3: 对齐视频工程与两台 Codex 指令

**Files:**
- Modify: `docs/双机同步与NAS目录规范.md`
- Modify: `docs/双机切换清单.md`
- Modify: `config/README.md`
- Modify: `.codex/skills/max-jianji-skill/SKILL.md`
- Create: `docs/两机规则库接入指令.md`

**Interfaces:**
- Consumes: `CHEN-BRAIN` 仓库 URL、Task 2 的候选与裁决协议。
- Produces: 两台 Codex 可执行的启动、候选提交、正式合并与 NAS 镜像边界。

- [ ] 将现有“本地规则同步到 NAS”的表述改为“GitHub 规则真源、本地 clone、NAS 单向镜像”。
- [ ] 将另一台电脑的交付后动作限定为新增候选，禁止其修改正式规则或 NAS 正文。
- [ ] 将当前电脑的决策中枢流程写为：拉取候选、检索去重、裁决、更新正式规则、推送、按需镜像 NAS。
- [ ] 将每条视频的规则 SHA 写入任务卡与候选模板要求。
- [ ] 用 `rg` 检查上述文档和 Skill 对 GitHub 真源、候选、唯一中枢、NAS 单向与禁止强推的表述一致。

### Task 4: 发布与最小双机验证

**Files:**
- Modify: `CHEN-BRAIN/governance/nas-mirror-manifest.example.json`
- Modify: `docs/两机规则库接入指令.md`

**Interfaces:**
- Consumes: GitHub 规则仓库与两台电脑的本地 clone。
- Produces: 不修改真实正式规则的可复现验证结果。

- [ ] 在当前电脑 clone 规则仓库，执行 `git status`、`git pull --ff-only` 并确认规则 SHA。
- [ ] 在测试分支或独立临时 clone 新增一个候选样例，验证其只触及 `inbox/open/`；不改 `rules/00–07/`。
- [ ] 验证第二台电脑指令只要求 clone、拉取、创建候选和报告，不授权正式规则改写、NAS 反向同步或强推。
- [ ] 提交并推送视频工程文档/Skill 到 `codex/two-computer-sync`；规则仓库保持独立提交历史。
- [ ] 输出两台电脑最终使用口令与 NAS 镜像触发口令。

## Plan Self-Review

- Task 1 建立可追溯规则源，Task 2 防止文件与语义静默覆盖，Task 3 将协议接入真实剪辑流程，Task 4 只用候选样例验证双机边界。
- 不包含未定义的迁移步骤；所有正式规则导入均先哈希验证，所有 NAS 写入均在 Git 提交确认之后。
- `rules/00–07/`、`inbox/open/`、`inbox/processed/` 路径在各任务中一致，当前电脑的唯一合并权贯穿全部任务。
