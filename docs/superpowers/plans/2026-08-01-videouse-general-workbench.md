# VideoUse General Workbench Implementation Plan

> **For agentic workers:** Execute inline in this isolated worktree. The user explicitly requested no multi-agent work.

**Goal:** Build a local-browser workbench that non-destructively loads VideoUse projects, previews a single A/V EDL timeline, records Codex operations, versions edits, and exports reliable interchange packages.

**Architecture:** `workbench/server` is a loopback-only Node service and filesystem adapter; `workbench/shared` owns the versioned project contract and pure EDL operations. `workbench/web` is a Vite/React UI which communicates through a small JSON HTTP API and EventSource stream. All derived files are placed below the opened VideoUse project's `workbench/` directory.

**Tech Stack:** TypeScript, Node.js HTTP server, React, Vite, Vitest, native filesystem APIs, HTML video.

## Global Constraints

- Never overwrite source media, VideoUse EDL, transcripts, or project files.
- Serve only `127.0.0.1`; reject paths that escape the explicitly opened project root.
- One audio/video-bound rough-cut track in v1; extension types remain data-only.
- Browser proxy playback is virtual and must use original source timecodes for EDL export.
- Native CapCut draft writing is explicitly experimental and is not implemented in v1.
- Do not read or expose `.env` or credentials.

---

### Task 1: Contract and pure timeline engine

**Files:** Create `docs/videouse-workbench-contract.md`, `workbench/shared/model.ts`, `workbench/shared/timeline.ts`, `workbench/tests/timeline.test.ts`.

**Interfaces:** `applyTimelineOperation(project, operation): WorkbenchProject`; `toVideoUseEdl(project): VideoUseEdl`; `validateProject(project): ValidationResult`.

- [ ] Write failing tests for trim, delete/restore, reorder, duration recalculation, and EDL round-trip validation.
- [ ] Implement immutable data types and the smallest pure operation engine that passes the tests.
- [ ] Run `npm run test:workbench -- timeline.test.ts`.

### Task 2: Safe project repository and version store

**Files:** Create `workbench/server/repository.ts`, `workbench/server/version-store.ts`, `workbench/tests/repository.test.ts`.

**Interfaces:** `openProject(root): Promise<WorkbenchProject>`; `saveDraft(project): Promise<void>`; `snapshot(project, summary): Promise<VersionRecord>`; `restoreVersion(root, versionId): Promise<WorkbenchProject>`.

- [ ] Write failing filesystem tests using a temporary VideoUse fixture.
- [ ] Implement project discovery, non-destructive `workbench/` initialization, draft persistence, immutable snapshots and safe path guards.
- [ ] Run the focused repository tests.

### Task 3: Local API, events, and export adapters

**Files:** Create `workbench/server/api.ts`, `workbench/server/index.ts`, `workbench/server/exporters.ts`, `workbench/tests/api.test.ts`.

**Interfaces:** `POST /api/projects/open`, `GET /api/projects/current`, `POST /api/operations`, `POST /api/versions`, `POST /api/export/:kind`, `GET /api/events`.

- [ ] Write failing API tests for project open, operation persistence, SSE operation notification, EDL export validation, and stable CapCut package manifest.
- [ ] Implement loopback API and adapters for workbench JSON, VideoUse EDL, render-job descriptors, and stable CapCut delivery package.
- [ ] Run focused API tests.

### Task 4: Workbench editor shell and synchronized controls

**Files:** Create `workbench/web/*`, `workbench/web/components/*`, `workbench/web/styles.css`.

**Interfaces:** `WorkbenchApi`; `EditorState`; `TimelineView`; `VirtualPlaybackController`.

- [ ] Write component tests for output/source-time mapping and panel-size persistence.
- [ ] Implement dark three-pane editor with 1px dividers/8px drag targets, editable single-track timeline, transcript seek, virtual source switching, and read-only Codex audit log.
- [ ] Run web component tests and production build.

### Task 5: Integration verification and operating docs

**Files:** Modify `package.json`, `README.md`; create `workbench/fixtures/basic-project/` and `workbench/tests/integration.test.ts`.

- [ ] Write an integration test that opens the fixture, applies a timeline operation, creates a version, restores it, and exports EDL/package artifacts.
- [ ] Run minimal integration tests, lint/typecheck, and a production bundle.
- [ ] Document startup, project requirements, implemented scope, deliberate limits, and VideoUse renderer handoff.

## Coverage review

The plan covers loading/opening, proxy metadata and fallback, one-track operations, synchronized views, Codex event display, durable drafts/versions, EDL/render/package exports, safe filesystem boundaries, and extension registries. Actual proxy generation and native CapCut draft writing remain explicit adapters: v1 reports their state and never claims universal native compatibility.
