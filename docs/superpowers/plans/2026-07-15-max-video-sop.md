# MAX 视频项目 SOP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一套从资料接收、时间线装配、Remotion 制作到交付复盘的 MAX 视频包装 SOP，并提供可直接复制使用的模板。

**Architecture:** 使用一个主 SOP 统一阶段门槛和数据流，用三个制作模板承载单条视频数据，用独立技术错题集记录可复现问题。README 和 AGENTS 只提供入口与强制执行点，避免重复维护流程正文。

**Tech Stack:** Markdown、Remotion 4.0.489 项目约定、Git、`rg` 文档校验

## Global Constraints

- `02｜MAX顶层思维系统` 及其他 MAX 源文档保持只读，除非用户明确授权修改。
- 未确认的 MAX 风格保持“未校准”，不得根据参考视频猜测补写。
- 文字、字幕、动画、转场、音频和布局保留为项目内部能力，不拆分独立 Agent。
- 素材放入 `public/`，Remotion 代码通过 `staticFile()` 引用。
- 动画必须由帧驱动，禁止 CSS transition、CSS animation 和 Tailwind animation。
- 用户确认的稳定经验才能进入品牌规则；一次性偏好和技术错误必须分流。

---

### Task 1: 编写主 SOP

**Files:**
- Create: `docs/MAX视频制作SOP.md`
- Reference: `docs/superpowers/specs/2026-07-15-max-video-sop-design.md`
- Reference: `AGENTS.md`

**Interfaces:**
- Consumes: 项目边界、制作数据流、阻塞条件和验收标准
- Produces: 七阶段制作流程，以及模板、品牌档案和错题集之间的链接

- [ ] **Step 1: 创建主 SOP 骨架**

写入目标、适用范围、角色边界、开始条件、阶段 0 至阶段 6、阻塞与返工、完成定义。

- [ ] **Step 2: 写明每个阶段的输入、动作、输出和通过条件**

每个阶段必须具备可检查的出口，不能使用“视情况处理”作为完成条件。

- [ ] **Step 3: 写明反馈分流规则**

明确单条视频修改、技术错题、品牌校准和长期组件参数四条去向。

- [ ] **Step 4: 运行主 SOP 内容校验**

Run:

```bash
rg -n '^## 阶段 [0-6]|public/|staticFile\(\)|Studio|静帧|完整.*渲染|技术错题|品牌校准' docs/MAX视频制作SOP.md
```

Expected: 阶段 0 至阶段 6 全部出现，素材、预览、静帧、成片渲染和反馈分流均有明确条目。

- [ ] **Step 5: 提交主 SOP**

```bash
git add docs/MAX视频制作SOP.md
git commit -m "docs: add MAX video production SOP"
```

### Task 2: 编写制作模板与技术错题集

**Files:**
- Create: `templates/制作需求单.md`
- Create: `templates/时间线装配表.md`
- Create: `templates/交付检查表.md`
- Create: `iteration/technical-errata.md`

**Interfaces:**
- Consumes: `docs/MAX视频制作SOP.md` 各阶段要求
- Produces: 开工输入、时间线交接、交付验收和技术复盘的固定数据结构

- [ ] **Step 1: 创建制作需求单**

字段覆盖项目识别、输出规格、输入文件、包装目标、安全区、素材版权、音频、缺失项和开工确认。

- [ ] **Step 2: 创建时间线装配表**

提供状态枚举、片段级字段说明和可复制表格；每行必须包含时间码、内容目的、画面、素材、动效、文字、音频和检查状态。

- [ ] **Step 3: 创建交付检查表**

按资料完整性、内容对齐、视觉安全、技术正确、音频、输出规格和交付记录分组，全部使用 Markdown 复选框。

- [ ] **Step 4: 创建技术错题集**

写明收录边界、固定记录模板、验证要求以及与 `calibration-log.md` 的区别；初始记录保持为空。

- [ ] **Step 5: 运行模板字段校验**

Run:

```bash
rg -n '平台|比例|分辨率|帧率|目标时长|交付格式|未提供|未校准' templates/制作需求单.md
rg -n '起始时间码|结束时间码|口播|片段目的|素材|动效|字幕|音效|状态' templates/时间线装配表.md
rg -n '\- \[ \]' templates/交付检查表.md
rg -n '现象|根因|修复方式|防复发检查|是否已验证|calibration-log' iteration/technical-errata.md
```

Expected: 四条命令均返回对应字段，且交付检查表包含可勾选项目。

- [ ] **Step 6: 提交模板与错题集**

```bash
git add templates/制作需求单.md templates/时间线装配表.md templates/交付检查表.md iteration/technical-errata.md
git commit -m "docs: add MAX video workflow templates"
```

### Task 3: 接入项目入口

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: 主 SOP、三个制作模板和技术错题集的稳定路径
- Produces: 人类和 Codex 都能在开工前发现并执行 SOP 的入口

- [ ] **Step 1: 更新 README**

增加“制作 SOP”段落，链接主 SOP、制作需求单、时间线装配表、交付检查表和技术错题集；保留现有启动、素材与验证命令。

- [ ] **Step 2: 更新 AGENTS**

在每次制作流程中明确：开工先复制并填写需求单，制作前完成装配表，交付前执行检查表，已验证技术问题写入错题集。不得在 AGENTS 中重复完整 SOP。

- [ ] **Step 3: 验证入口完整**

Run:

```bash
rg -n 'MAX视频制作SOP|制作需求单|时间线装配表|交付检查表|technical-errata' README.md AGENTS.md
```

Expected: README 包含五个入口；AGENTS 至少包含 SOP 与制作阶段所需模板入口。

- [ ] **Step 4: 提交入口更新**

```bash
git add README.md AGENTS.md
git commit -m "docs: connect MAX workflow SOP"
```

### Task 4: 全局一致性与边界验证

**Files:**
- Verify: `docs/MAX视频制作SOP.md`
- Verify: `templates/制作需求单.md`
- Verify: `templates/时间线装配表.md`
- Verify: `templates/交付检查表.md`
- Verify: `iteration/technical-errata.md`
- Verify: `README.md`
- Verify: `AGENTS.md`

**Interfaces:**
- Consumes: 前三个任务的全部文档
- Produces: 可交付的完整 SOP 文档集和验证证据

- [ ] **Step 1: 检查所有链接目标存在**

Run:

```bash
for f in docs/MAX视频制作SOP.md templates/制作需求单.md templates/时间线装配表.md templates/交付检查表.md iteration/technical-errata.md references/max-video-profile.md iteration/calibration-log.md; do test -f "$f" || exit 1; done
```

Expected: 命令退出码为 0。

- [ ] **Step 2: 检查未定义内容和边界违规**

Run:

```bash
rg -n 'TBD|TODO|自动写入长期规则|修改.*02｜MAX顶层思维系统|CSS transition|CSS animation|Tailwind animation' docs/MAX视频制作SOP.md templates iteration/technical-errata.md README.md AGENTS.md
```

Expected: 只允许出现明确的禁止性说明；不得出现未完成占位符或授权修改只读源文档的语句。

- [ ] **Step 3: 检查 Markdown 与 Git 差异**

Run:

```bash
git diff --check
git status --short
```

Expected: `git diff --check` 无输出；工作区没有本计划之外的未提交修改。

- [ ] **Step 4: 对照设计规格逐项复核**

检查 `docs/superpowers/specs/2026-07-15-max-video-sop-design.md` 的“验收标准”和“暂不包含”，确认每项都有对应实现且没有越界内容。

- [ ] **Step 5: 提交必要的验证修正**

仅当验证发现文档问题时执行：

```bash
git add docs/MAX视频制作SOP.md templates iteration/technical-errata.md README.md AGENTS.md
git commit -m "docs: refine MAX video SOP validation"
```
