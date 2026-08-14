# MAX VideoUse 双机同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让同一套 MAX × VideoUse × Codex 工程可在两台电脑间稳定复用，使用 GitHub 同步规则与代码、使用 NAS 提供个人知识库和大素材，并保留每台电脑独立的缓存与运行环境。

**Architecture:** Git 仓库作为规则、Skill、工作台源码和文本决策的单一真源；NAS 作为知识库、原片和交付资产的共享存储；代理、转写缓存、`node_modules` 和临时渲染产物留在当前电脑。项目通过一个不含凭据的路径配置文件声明 NAS 挂载点，VideoUse 工作台继续要求在每台电脑上显式授权和重新链接源素材。

**Tech Stack:** Git/GitHub、macOS NAS 挂载、Node.js、VideoUse Workbench、Markdown 配置。

## Global Constraints

- 不提交 API Key、`.env`、原片或含隐私的素材。
- 不修改原片、原始 EDL、历史预览和既有交付文件。
- 不把 NAS 缓存目录作为两台电脑同时写入的工作目录。
- 不上传 GitHub；远端仓库地址和 NAS 挂载路径由用户后续配置。
- 不宣称换电脑后可自动恢复源素材授权；每台电脑需重新链接并验证源文件。

### Task 1: Define the portable/shared boundary

**Files:**
- Create: `docs/双机同步与NAS目录规范.md`
- Modify: `.gitignore`

- [ ] 写明 GitHub、NAS、本机缓存三层边界，并列出建议目录。
- [ ] 将 VideoUse `workbench/` 的项目状态、源路径和指纹重链接要求写入迁移说明。
- [ ] 补充 Git 忽略规则，覆盖本地缓存、代理、渲染输出和凭据文件，但不忽略可复用的文本决策与工作台源码。
- [ ] 用 `git diff --check` 检查格式。

### Task 2: Add a non-secret NAS configuration template

**Files:**
- Create: `config/nas-paths.example.json`
- Create: `config/README.md`

- [ ] 定义 `knowledgeBaseRoot`、`mediaRoot`、`deliveryRoot` 三个路径字段。
- [ ] 使用挂载路径占位符，不写入当前机器的个人绝对路径和凭据。
- [ ] 说明复制为本机配置文件后不提交 Git，并注明路径变更后需要重新链接工作台项目。

### Task 3: Document the two-computer operating procedure

**Files:**
- Modify: `README.md`
- Create: `docs/双机切换清单.md`

- [ ] 写明电脑 A/B 的同步顺序：先提交/拉取 Git，再确认 NAS 挂载，再打开工作台。
- [ ] 写明只允许一个设备同时编辑同一个工程草稿，避免 `working-draft.json`、`events.jsonl` 和版本冲突。
- [ ] 写明新电脑初始化、日常切换、素材重新链接和故障回退步骤。
- [ ] 不引入上传、部署或自动清理动作。

### Task 4: Verify the repository changes

**Files:**
- Test: `git diff --check`
- Test: `git status --short`

- [ ] 确认新增文件不含 `API_KEY`、`ELEVENLABS_API_KEY` 或真实凭据。
- [ ] 确认现有视频、EDL 和工作台实现文件没有被修改。
- [ ] 输出变更摘要；不执行 Git commit 或 push。
