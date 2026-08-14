# 跨视频剪辑记忆闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每条已完成 MAX 视频留下可检索复盘包，并让下一条视频按主题继承已裁决的历史经验。

**Architecture:** `CHEN-BRAIN/main` 保存复盘归档和轻量索引，`00` 负责启动检索路由，`06` 继续只保存校准裁决，MAX Skill 负责执行与双机权限。新窗口读取正式规则后，只从索引定向读取关联复盘，不全文加载历史日志。

**Tech Stack:** Markdown、GitHub Git、MAX 粗剪 Skill、VideoUse 工作台文档测试。

## Global Constraints

- `CHEN-BRAIN/main` 是知识真源；NAS 只作 Git 已确认版本的单向镜像。
- 当前电脑是正式 `00–07` 规则的唯一写入者；另一台电脑只提交独立复盘候选。
- 不复制、不移动、不修改原片、原始 EDL、成片、逐字稿、渲染缓存或 NAS。
- 未落盘的聊天总结不得猜测补写；仅在用户提供原文或路径后补录。
- 审片文件固定 1080P、30 fps；本计划不发起任何渲染。

---

### Task 1: 建立复盘归档格式与轻量索引

**Files:**
- Create: `/Users/chen.zip/Documents/CHEN BRAIN/03｜CHEN操盘手系统/03｜MAX剪辑系统/07｜视频复盘归档/README.md`
- Create: `/Users/chen.zip/Documents/CHEN BRAIN/03｜CHEN操盘手系统/03｜MAX剪辑系统/07｜视频复盘归档/视频复盘模板.md`
- Create: `/Users/chen.zip/Documents/CHEN BRAIN/03｜CHEN操盘手系统/03｜MAX剪辑系统/07｜视频复盘索引.md`

**Interfaces:**
- Consumes: 每条任务的 `project.md`、`rough-cut-log.md`、`cost-ledger.md`、用户反馈及其规则 SHA。
- Produces: `VR-YYYYMMDD-短标题.md` 归档包和 `07｜视频复盘索引.md` 中一个对应索引项。

- [ ] **Step 1: 写失败的文档契约检查**

在 `workbench/tests/cross-video-memory-docs.test.ts` 写入：

```ts
expect(skill).toContain("复盘包");
expect(entry).toContain("07｜视频复盘索引.md");
expect(template).toContain("继承给下一条视频的提醒");
```

- [ ] **Step 2: 运行检查确认失败**

Run: `npm run test:workbench -- workbench/tests/cross-video-memory-docs.test.ts`

Expected: FAIL，提示索引、模板或启动要求尚不存在。

- [ ] **Step 3: 写最小归档文档**

`README.md` 明确：每条交付视频一个不可覆盖复盘包；索引只存 ID、标签、状态和链接；复盘包不可复制原片/EDL/逐字稿全文。

`视频复盘模板.md` 固定字段：

```md
- 复盘 ID：VR-YYYYMMDD-短标题
- 视频与任务路径：
- 规则 SHA：
- 内容类型 / 主题标签 / 剪辑难点：
- 本次读取的复盘 ID：
- 继承判断与不适用原因：
- 结果与用户反馈：
- 可复用候选 / 反例：
- 裁决与关联 03/06：
- 原始日志位置：
```

`07｜视频复盘索引.md` 明确索引条目格式：

```md
| 复盘 ID | 日期 | 主题标签 | 内容类型 | 剪辑难点 | 裁决状态 | 关联 03/06 | 归档包 |
```

- [ ] **Step 4: 重新运行文档契约检查确认通过**

Run: `npm run test:workbench -- workbench/tests/cross-video-memory-docs.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交知识库归档骨架**

```bash
git -C '/Users/chen.zip/Documents/CHEN BRAIN' add -- \
  '03｜CHEN操盘手系统/03｜MAX剪辑系统/07｜视频复盘归档/README.md' \
  '03｜CHEN操盘手系统/03｜MAX剪辑系统/07｜视频复盘归档/视频复盘模板.md' \
  '03｜CHEN操盘手系统/03｜MAX剪辑系统/07｜视频复盘索引.md'
git -C '/Users/chen.zip/Documents/CHEN BRAIN' commit -m 'docs: add video retrospective archive'
```

### Task 2: 将定向历史检索与写入闸门写入正式入口

**Files:**
- Modify: `/Users/chen.zip/Documents/CHEN BRAIN/03｜CHEN操盘手系统/03｜MAX剪辑系统/00｜MAX剪辑系统入口与读取顺序.md:301-313`
- Modify: `/Users/chen.zip/Documents/CHEN BRAIN/03｜CHEN操盘手系统/03｜MAX剪辑系统/00｜MAX剪辑系统入口与读取顺序.md:451-475`
- Modify: `/Users/chen.zip/Documents/CHEN BRAIN/03｜CHEN操盘手系统/03｜MAX剪辑系统/06｜MAX剪辑反馈与校准库.md:250-302`

**Interfaces:**
- Consumes: `07｜视频复盘索引.md` 与本条视频的主题、内容类型、难点和用户反馈。
- Produces: 任务日志中的“已读取复盘 ID / 继承判断”，以及 `03/06` 与归档包之间的可追溯关联。

- [ ] **Step 1: 扩展失败的文档契约测试**

在同一测试增加：

```ts
expect(entry).toContain("定向检索07｜视频复盘索引");
expect(entry).toContain("不得全文加载历史复盘");
expect(calibration).toContain("复盘 ID");
```

- [ ] **Step 2: 运行检查确认失败**

Run: `npm run test:workbench -- workbench/tests/cross-video-memory-docs.test.ts`

Expected: FAIL，提示正式入口与校准闸门尚未引用复盘索引。

- [ ] **Step 3: 修改 `00` 与 `06`**

在 `00` 的运行检索顺序中加入：完成当前素材独立分析和 `06` 检索后，依据主题、内容类型、剪辑难点与反馈类型，从 `07` 索引取少量相关复盘；记录复盘 ID、继承判断和不适用原因；不得全文加载历史复盘，复盘不得覆盖 `01–03`。

在 `06` 的写入闸门加入：裁决前检索相关复盘索引；裁决摘要的关联字段必须包含复盘 ID；同主题归档与既有 CAL 重复时合并证据，不重复建立规则。

- [ ] **Step 4: 重新运行文档契约检查确认通过**

Run: `npm run test:workbench -- workbench/tests/cross-video-memory-docs.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交入口与校准规则**

```bash
git -C '/Users/chen.zip/Documents/CHEN BRAIN' add -- \
  '03｜CHEN操盘手系统/03｜MAX剪辑系统/00｜MAX剪辑系统入口与读取顺序.md' \
  '03｜CHEN操盘手系统/03｜MAX剪辑系统/06｜MAX剪辑反馈与校准库.md'
git -C '/Users/chen.zip/Documents/CHEN BRAIN' commit -m 'docs: route new videos through retrospective memory'
```

### Task 3: 将新窗口启动与视频收尾变成 Skill 强制步骤

**Files:**
- Modify: `.codex/skills/max-jianji-skill/SKILL.md:固定启动口令与首步顺序`
- Modify: `.codex/skills/max-jianji-skill/SKILL.md:视频后规则写入闸门`
- Modify: `/Users/chen.zip/Documents/Codex/MAX视频项目/.codex/skills/max-jianji-skill/SKILL.md:对应章节`
- Modify: `workbench/tests/cross-video-memory-docs.test.ts`

**Interfaces:**
- Consumes: Git 拉取后的规则 SHA、`07` 索引和本条任务日志。
- Produces: 启动时的定向历史经验读取记录，以及交付后的一份复盘包/索引候选。

- [ ] **Step 1: 增加失败断言**

```ts
expect(skill).toContain("读取的复盘 ID");
expect(skill).toContain("没有复盘包不得称为已完成记忆回流");
expect(skill).toContain("另一台电脑");
```

- [ ] **Step 2: 运行检查确认失败**

Run: `npm run test:workbench -- workbench/tests/cross-video-memory-docs.test.ts`

Expected: FAIL，提示 Skill 还没有强制启动读取与收尾归档。

- [ ] **Step 3: 写入最小 Skill 规则**

在启动顺序中要求：读取 `00/03/06` 后再定向检索 `07`，将复盘 ID 与继承判断写入任务卡。

在收尾闸门中要求：交付前或交付后形成复盘包，先检索再裁决；当前电脑可更新索引和正式规则，另一台电脑只新增候选复盘包，等待决策中枢处理。将同样规则写入实际项目 Skill，保证本机即时生效。

- [ ] **Step 4: 重新运行文档契约检查确认通过**

Run: `npm run test:workbench -- workbench/tests/cross-video-memory-docs.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交 Skill 与测试**

```bash
git add .codex/skills/max-jianji-skill/SKILL.md workbench/tests/cross-video-memory-docs.test.ts
git commit -m 'feat: require cross-video retrospective memory'
```

### Task 4: 归集已落盘历史复盘并发布双机可用版本

**Files:**
- Create: `/Users/chen.zip/Documents/CHEN BRAIN/03｜CHEN操盘手系统/03｜MAX剪辑系统/07｜视频复盘归档/VR-*.md`（仅由已落盘来源生成）
- Modify: `/Users/chen.zip/Documents/CHEN BRAIN/03｜CHEN操盘手系统/03｜MAX剪辑系统/07｜视频复盘索引.md`
- Modify: `/Users/chen.zip/Documents/CHEN BRAIN/03｜CHEN操盘手系统/03｜MAX剪辑系统/06｜MAX剪辑反馈与校准库.md`（仅在裁决为合并证据/新建F1/修订或升级时）

**Interfaces:**
- Consumes: 用户提供的历史复盘文件/路径；不得读取未提供的聊天记录作为证据。
- Produces: 标记为“历史补录”的归档包、索引条目，以及必要的去重裁决。

- [ ] **Step 1: 收集可验证的已落盘来源**

Run: `rg --files -g 'rough-cut-log.md' -g 'project.md' -g '*复盘*.md' -g '*总结*.md' <用户指定目录>`

Expected: 只返回用户指定范围内实际存在的文件；若无结果，记录“无可补录来源”，不创建虚构复盘。

- [ ] **Step 2: 为每个来源建立候选归档**

每个归档必须填写来源路径、规则 SHA（无法取得则写“历史未采集”）、主题标签、可验证结果与“历史补录”状态；未能判断的字段写“未采集”。

- [ ] **Step 3: 对每条候选执行裁决**

逐条检索 `03`、`06`、索引和同主题归档，并将结果写为：不写入、合并证据、新建F1、修订或升级或本条经验。没有直接证据时保留本条经验或 REVIEW。

- [ ] **Step 4: 验证索引完整性**

Run: `rg -n '^\| VR-' '/Users/chen.zip/Documents/CHEN BRAIN/03｜CHEN操盘手系统/03｜MAX剪辑系统/07｜视频复盘索引.md'`

Expected: 每个新增归档正好有一条索引项，且 ID 与文件名相同。

- [ ] **Step 5: 提交并推送两个真源**

```bash
git -C '/Users/chen.zip/Documents/CHEN BRAIN' add -- \
  '03｜CHEN操盘手系统/03｜MAX剪辑系统/07｜视频复盘归档' \
  '03｜CHEN操盘手系统/03｜MAX剪辑系统/07｜视频复盘索引.md' \
  '03｜CHEN操盘手系统/03｜MAX剪辑系统/06｜MAX剪辑反馈与校准库.md'
git -C '/Users/chen.zip/Documents/CHEN BRAIN' commit -m 'docs: archive verified video retrospectives'
git -C '/Users/chen.zip/Documents/CHEN BRAIN' push origin main
git push origin codex/two-computer-sync
```
