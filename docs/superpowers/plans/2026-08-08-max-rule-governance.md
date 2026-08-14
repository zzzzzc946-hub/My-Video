# MAX 剪辑规则写入闸门 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每次视频反馈在写入 MAX 长期知识前强制检索、去重、冲突裁决和最小化归档，并让执行 Skill 随 Git 分支同步到第二台电脑。

**Architecture:** NAS 中的 `03` 是稳定规则正文，`06` 是证据和升级状态，`00` 定义检索与裁决。项目 Git 仓库新增受版本控制的 `.codex/skills/max-jianji-skill/SKILL.md`，只描述执行闸门与同步关系。单条视频日志保留完整过程，长期系统只留下裁决摘要和关联编号。

**Tech Stack:** Markdown、Git、NAS 挂载的 CHEN BRAIN、Codex project skill。

## Global Constraints

- 不修改原片、EDL、预览、交付片或工作台草稿。
- 不把单条时长、时间码、话题结构或一次性偏好升级为长期规则。
- `03` 是稳定粗剪规则唯一正文；`06` 不重复抄写规则；Skill 不复制 MAX 判断库。
- 每次拟写入长期知识，必须先检索相关 `03`、`06` 和 Skill。
- 当前工程唯一同步分支为 `codex/two-computer-sync`；不合并或重写 `main`。

---

### Task 1: Add the NAS rule-governance gate

**Files:**

- Modify: `/Users/chen.zip/Documents/CHEN BRAIN/03｜CHEN操盘手系统/03｜MAX剪辑系统/00｜MAX剪辑系统入口与读取顺序.md`
- Modify: `/Users/chen.zip/Documents/CHEN BRAIN/03｜CHEN操盘手系统/03｜MAX剪辑系统/06｜MAX剪辑反馈与校准库.md`

**Produces:** 强制的预写入检索、五种唯一写入动作、冲突裁决与极简记录格式。

- [ ] 在 `00` 的反馈回流路由中加入：写入长期知识前，必须定向检索相关 `03`、`06` 和 Skill，并明确裁决为“不写入 / 合并证据 / 新建F1 / 修订或升级 / 本条经验”之一。
- [ ] 在 `06` 增加写入闸门：同义反馈更新既有 CAL；执行失败回到单条日志；与硬边界冲突或证据不足标记 `REVIEW`。
- [ ] 在 `06` 增加六字段极简格式：裁决、可执行判断、证据、适用范围与例外、关联、状态。
- [ ] 运行 `rg -n '先检索|五种|合并证据|裁决|REVIEW|不写入'` 检查两个 NAS 文档，确认关键门槛可检索。

### Task 2: Version the MAX execution Skill

**Files:**

- Create: `.codex/skills/max-jianji-skill/SKILL.md`
- Source only: `/Users/chen.zip/Documents/Codex/MAX视频项目/.codex/skills/max-jianji-skill/SKILL.md`

**Produces:** Git 跟踪的执行 Skill，供两台电脑从 `codex/two-computer-sync` 分支得到同一版本。

- [ ] 只复制当前 `SKILL.md` 文本到受版本控制的位置；不得复制 `.env`、hooks、缓存、项目记录或任何其他未跟踪内容。
- [ ] 加入“视频后规则写入闸门”：分类反馈，检索 `03`、`06` 与 Skill，选择五种唯一裁决，写入极简摘要，优先合并既有 CAL，完整过程只留在单条日志。
- [ ] 加入唯一来源说明：NAS 的 `00–07` 管理 MAX 知识，`03` 管理稳定规则，`06` 管理证据；Skill 只管理执行步骤和工具路由。
- [ ] 运行 `git ls-files '.codex/skills/max-jianji-skill/SKILL.md'` 与 `rg -n '先检索|不写入|合并|本条经验|03|06' .codex/skills/max-jianji-skill/SKILL.md`。

### Task 3: Verify and publish the tracked workflow change

**Files:**

- Modify: NAS authority documents from Task 1
- Add: project Skill from Task 2

**Produces:** 私有 Git 分支中的共享 Skill；NAS 规则仍由挂载知识库即时共享。

- [ ] 运行 `git diff --check` 和 `git status --short`，确认没有视频、EDL、媒体或凭据进入变更范围。
- [ ] 运行 `git add .codex/skills/max-jianji-skill/SKILL.md`，再执行 `git commit -m 'docs: add MAX rule governance gate'`。
- [ ] 执行 `git push`，确认只更新 `origin/codex/two-computer-sync`，不修改 `main`。
