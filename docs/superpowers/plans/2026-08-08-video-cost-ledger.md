# MAX 视频成本台账 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为每条 MAX 视频提供带 40,000 Token Budget 的 Goal 启动、可审计成本卡和交付成本复盘。

**Architecture:** MAX Skill 负责创建、关闭和读取 Goal；`templates/视频成本台账.md` 定义单条数据结构；每个实际视频将模板复制到 `制作记录/<视频名>/cost-ledger.md`。不新增运行时服务或汇总数据库。

**Tech Stack:** Markdown、Codex Goal、MAX Skill。

## Global Constraints

- 默认 Goal Token Budget 为 **40,000**；用户明确指令可覆盖。
- Goal 是预算、实际 Token Usage 与状态的唯一权威；缺失数据写“未采集”，不得估算。
- 只有真实交付时关闭 Goal；取消或未交付任务不计算每分钟成片 Token 成本。
- 不创建当前窗口的 Goal，不转写、不渲染、不修改任何视频、EDL、素材或工作台数据。

---

### Task 1: Add reusable cost-ledger template

**Files:**

- Create: `templates/视频成本台账.md`

**Produces:** 每条视频可复制的成本台账，定义数据来源、计数口径和条件计算公式。

- [x] 创建模板，包含项目/Goal、时间、次数、最终成片、Token 与数据完整性字段。
- [x] 明确：转写与渲染按真实发起次数计；返工只计交付候选后的实际修改循环；人工等待不计入净制作耗时。
- [x] 写明公式：`每分钟成片 Token 成本 = 实际 Token Usage ÷ (最终成片时长秒 ÷ 60)`，只在已交付、Usage 已采集、时长大于零时计算。
- [x] 用 `rg -n '40,000|人工等待|转写次数|渲染次数|返工次数|每分钟成片' templates/视频成本台账.md` 验证字段与公式。

### Task 2: Add Goal and cost-card lifecycle to MAX Skill

**Files:**

- Modify: `.codex/skills/max-jianji-skill/SKILL.md`

**Produces:** 每条视频在工具调用前创建 Goal，在真实交付后完成 Goal 并记录实际成本。

- [x] 在固定启动顺序中加入：创建 40,000 Token Budget Goal，并复制成本卡到本条 `制作记录/<视频名>/cost-ledger.md`；记录 Goal ID 和启动时间。
- [x] 在可审阅过程或交付规则中加入：转写、渲染、人工等待、返工的记录口径；不得把内部首次 QA 修复计为返工。
- [x] 加入交付关闭步骤：从 Goal 读取实际 Usage、写入总耗时/等待/净耗时/次数/最终时长、条件计算每分钟成本，然后将 Goal 标记完成。
- [x] 加入未交付路径：Goal 保持未完成或标明取消，成本卡不计算每分钟成片成本。
- [x] 用 `rg -n '40,000|Token Budget|Goal|cost-ledger|人工等待|每分钟成片|未交付' .codex/skills/max-jianji-skill/SKILL.md` 验证启动与交付闭环。

### Task 3: Validate and publish workflow text

**Files:**

- Create: `templates/视频成本台账.md`
- Modify: `.codex/skills/max-jianji-skill/SKILL.md`
- Add: this plan

**Produces:** 可由第二台电脑拉取的统一成本复盘流程。

- [x] 运行 `git diff --check` 与 `git status --short`，确认变更仅为模板、Skill 和计划。
- [ ] 运行 `git add templates/视频成本台账.md .codex/skills/max-jianji-skill/SKILL.md docs/superpowers/plans/2026-08-08-video-cost-ledger.md`，提交 `docs: add per-video cost ledger`。
- [ ] 推送 `origin/codex/two-computer-sync`，不修改 `main`。
