# Two-Machine Rule Collaboration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fail-closed two-computer workflow in which both machines read one released MAX rule set, the secondary machine can only append candidate PRs, and the primary decision hub alone promotes rules and publishes compatible Skill/workbench versions.

**Architecture:** `CHEN-BRAIN/main` remains the formal rule source and gains candidate schema validation, immutable review batches, release manifests, PR classification, and protected-branch checks. `My-Video/main` remains the released Skill/workbench source and gains snapshot/compatibility contracts plus the already-approved cost ledger lifecycle. Candidate submissions use clean temporary worktrees and server-side diff validation; cross-repository changes activate only when CHEN-BRAIN points at an already-merged compatible My-Video commit.

**Tech Stack:** Git/GitHub CLI, GitHub Actions, CODEOWNERS, Python 3.11 + PyYAML 6.0.2 + `unittest` in CHEN-BRAIN, TypeScript 5.9 + Vitest 4 in My-Video, shell-based temporary clone integration tests.

## Global Constraints

- Current primary computer remains the only decision hub.
- Secondary computer uses a distinct GitHub collaborator identity and has no branch-protection bypass.
- Default editing tool is VideoUse; tool execution and editorial judgment stay decoupled.
- Every review export is 1080P at 30 fps; vertical review export is 1080×1920.
- A video task freezes CHEN-BRAIN SHA, My-Video SHA, and at most three open Candidate IDs until delivery.
- Every video starts a Goal with a default Token Budget of 40,000 unless the user supplies another budget.
- Delivery records actual Token Usage, total duration, human wait, transcription count, render count, rework count, final duration, and Token per finished minute.
- Never modify or commit source media, original EDLs, final renders, transcripts, caches, NAS paths, secrets, or historical products.
- Never use `git add -A`, `push --force`, destructive reset, or automatic conflict resolution in formal rule files.
- NAS receives only an explicit, one-way mirror of an active Git release after the user requests synchronization.
- Each task below is reviewed and verified before the next task begins; do not combine all phases into one commit.

---

## File and Responsibility Map

### CHEN-BRAIN

- `requirements-governance.txt`: pins the only governance dependency, PyYAML.
- `scripts/governance/model.py`: typed candidate, diff, review-batch, and release data models.
- `scripts/governance/frontmatter.py`: safe YAML frontmatter loading and canonical serialization.
- `scripts/governance/candidate.py`: candidate filename/content validation and candidate draft creation.
- `scripts/governance/diff_gate.py`: Git diff classification into candidate, formal-governance, or invalid.
- `scripts/governance/review.py`: immutable review-batch creation and processed-candidate validation.
- `scripts/governance/release.py`: release manifest validation and My-Video commit compatibility checks.
- `scripts/governance/cli.py`: `preflight`, `submit-candidate`, `validate-pr`, `create-review-batch`, and `validate-release` commands.
- `scripts/governance/git_ops.py`: subprocess wrapper with explicit argv, repository checks, temporary worktree lifecycle, PR creation, and no-force policy.
- `tests/governance/`: unit tests for every module plus two-clone concurrency tests.
- `.github/workflows/governance-gate.yml`: required server-side PR check.
- `.github/CODEOWNERS`: decision-hub ownership of formal/governance paths.
- `.githooks/pre-commit`: optional local early rejection using the same validator.
- `config/machine-role.example.json`: tracked role example; `config/machine-role.json` remains ignored.
- `03｜CHEN操盘手系统/03｜MAX剪辑系统/08｜规则候选收件箱/`: updated template, open/processed contract, review batches, immutable releases, and current release pointer.

### My-Video

- `workbench/shared/rule-release.ts`: release manifest and frozen video snapshot types/validation.
- `workbench/server/rule-release.ts`: loads CHEN-BRAIN release, checks Git ancestry, and selects at most three candidates.
- `workbench/tests/rule-release.test.ts`: compatibility, snapshot freezing, and candidate-limit tests.
- `workbench/tests/two-machine-governance-docs.test.ts`: documentation and Skill contract checks.
- `.codex/skills/max-jianji-skill/SKILL.md`: released startup, candidate submission, decision-hub, and cost-closeout route.
- `templates/视频成本台账.md`: remains the human-readable delivery ledger; only missing fields are added.
- `docs/双机同步与NAS目录规范.md`, `docs/双机切换清单.md`, `docs/两机规则库接入指令.md`: replace old direct-push/shared-branch instructions.
- `.github/workflows/quality-gate.yml`: required My-Video lint, test, and build checks.
- `.github/CODEOWNERS`: decision-hub ownership of Skill, workbench, workflow, and release configuration.

---

### Task 0: Freeze the approved governance documents

**Files:**
- Modify: `docs/superpowers/specs/2026-08-14-two-machine-rule-collaboration-design.md`
- Create: `docs/superpowers/plans/2026-08-14-two-machine-rule-collaboration.md`

**Interfaces:**
- Produces: one reviewed commit containing the exact approved specification and implementation plan before repository history changes begin.

- [ ] **Step 1: Wait for explicit implementation and Git authorization**

Do not commit merely because this plan exists. Start this task only after the user chooses an execution mode and explicitly authorizes implementation and Git commits.

- [ ] **Step 2: Verify the documentation-only diff**

```bash
git diff --check
git status --short
git diff -- docs/superpowers/specs/2026-08-14-two-machine-rule-collaboration-design.md docs/superpowers/plans/2026-08-14-two-machine-rule-collaboration.md
```

Expected: only the final spec and this plan are included in the intended commit; unrelated user changes remain unstaged.

- [ ] **Step 3: Commit only the approved documents**

```bash
git add docs/superpowers/specs/2026-08-14-two-machine-rule-collaboration-design.md docs/superpowers/plans/2026-08-14-two-machine-rule-collaboration.md
git diff --cached --name-only
git commit -m "docs: finalize two-machine rule collaboration"
```

Expected: staged paths are exactly the two documentation files and the worktree is safe to use for the unification branch.

---

### Task 1: Preserve and unify My-Video history without force-pushing

**Files:**
- Modify only after inventory: `AGENTS.md`, `iteration/calibration-log.md`, `workbench/tests/editor.test.ts`
- Preserve shared versions: `.gitignore`, `README.md`, `package.json`, `package-lock.json`, `docs/videouse-workbench-contract.md`, `.codex/skills/max-jianji-skill/SKILL.md`, `workbench/server/exporters.ts`, `workbench/web/App.tsx`
- Create: `docs/repository-unification-record.md`

**Interfaces:**
- Consumes: local `main`, `codex/two-computer-sync`, and `origin/main` commit graphs.
- Produces: one integration branch that is a descendant of `origin/main`, contains both histories, preserves the shared 1080P/30fps implementation, and can enter `main` through a normal PR.

- [ ] **Step 1: Capture immutable preflight evidence**

Run SHA, merge-base, status, ignored-file, and disk-size checks for all three lines of history. Write exact results and a per-file disposition table to `docs/repository-unification-record.md`. The table must classify every dirty or untracked path as `preserve`, `shared-wins`, `backup-only`, or `excluded`.

Run:

```bash
git rev-parse main codex/two-computer-sync origin/main
git merge-base main codex/two-computer-sync
git merge-base codex/two-computer-sync origin/main || true
git status --short
git ls-files --others --exclude-standard
du -sh 制作记录 graphify-out .superpowers 2>/dev/null || true
```

Expected: evidence records the current SHAs; no file is staged or modified by these commands.

- [ ] **Step 2: Create recoverable backup refs and targeted patches**

Create dated local backup branches for all three commit tips. Use `git diff --binary` only for the explicit `preserve` paths; do not include excluded directories.

```bash
git branch backup/pre-unify-local-main-20260814 main
git branch backup/pre-unify-shared-20260814 codex/two-computer-sync
git branch backup/pre-unify-origin-main-20260814 origin/main
git -C '/Users/chen.zip/Documents/Codex/MAX视频项目' diff --binary HEAD -- AGENTS.md iteration/calibration-log.md workbench/tests/editor.test.ts > /tmp/my-video-preserve-20260814.patch
```

Expected: all backup refs resolve; patch contains only listed paths.

- [ ] **Step 3: Create the clean integration branch**

From the shared branch, create `codex/unify-my-video-main`. Apply only reviewed preserve hunks with `git apply --index --3way`; if a hunk conflicts, stop and resolve that one file from the disposition record.

```bash
git switch -c codex/unify-my-video-main codex/two-computer-sync
git apply --index --3way /tmp/my-video-preserve-20260814.patch
git diff --cached --name-only
```

Expected: staged paths equal the preserve list; no media, graphify output, `.superpowers`, source-FPS review implementation, or old Skill is staged.

- [ ] **Step 4: Commit preserved local work**

```bash
git commit -m "chore: preserve primary-only video project changes"
```

Expected: one focused commit; working tree is clean except known excluded user files.

- [ ] **Step 5: Merge the unrelated remote history**

```bash
git merge --no-ff --allow-unrelated-histories origin/main
```

Resolve only reported add/add conflicts using the disposition record. For the six previously observed bootstrap conflicts—`.gitignore`, `README.md`, the two 2026-07-15 plan/spec files, `package.json`, and `package-lock.json`—retain the shared branch versions unless the new preflight proves the file set changed.

Expected: merge commit has both parents; `git merge-base HEAD origin/main` succeeds.

- [ ] **Step 6: Verify the unified repository**

```bash
npm test --if-present
npm run test:workbench
npm run lint
npm run build
git diff --exit-code origin/main...HEAD -- 制作记录 graphify-out .superpowers
```

Expected: all declared scripts pass; excluded directories have no tracked diff; review-export tests assert 1080P/30fps.

- [ ] **Step 7: Push integration branch and open a normal PR**

```bash
git push -u origin codex/unify-my-video-main
gh pr create --repo zzzzzc946-hub/My-Video --base main --head codex/unify-my-video-main --title "Unify My-Video histories and release branch" --body-file docs/repository-unification-record.md
```

Expected: PR reports an ordinary merge path into `main`; if GitHub requires force or cannot find `origin/main` ancestry, stop.

---

### Task 2: Define and validate the CHEN-BRAIN candidate schema

**Files:**
- Create: `requirements-governance.txt`
- Create: `scripts/__init__.py`
- Create: `scripts/governance/__init__.py`
- Create: `scripts/governance/model.py`
- Create: `scripts/governance/frontmatter.py`
- Create: `scripts/governance/candidate.py`
- Create: `tests/governance/test_candidate.py`
- Modify: `03｜CHEN操盘手系统/03｜MAX剪辑系统/08｜规则候选收件箱/规则候选模板.md`

**Interfaces:**
- Produces: `Candidate.from_path(path: Path) -> Candidate`, `validate_candidate(candidate: Candidate, path: Path) -> list[str]`, and `candidate_filename(candidate: Candidate) -> str`.
- Candidate fields and enum values exactly match the approved spec.

- [ ] **Step 0: Create the governance bootstrap branch**

```bash
git switch -c codex/bootstrap-rule-governance origin/main
```

Expected: branch starts at current CHEN-BRAIN main; existing ignored/generated Graphify changes remain unstaged and are never included.

- [ ] **Step 1: Write failing schema tests**

Create tests that load one complete candidate and reject missing fields, `status: open`, duplicate IDs, malformed filenames, absolute paths, `.env` text, and more than three `candidate_snapshot_ids`.

```python
def test_valid_candidate_matches_filename(self):
    candidate = Candidate.from_path(self.fixture("valid.md"))
    self.assertEqual(validate_candidate(candidate, self.fixture("valid.md")), [])

def test_rejects_absolute_log_path(self):
    errors = validate_candidate(Candidate.from_path(self.fixture("absolute-path.md")), self.fixture("absolute-path.md"))
    self.assertIn("machine absolute path is forbidden", errors)
```

- [ ] **Step 2: Run tests and confirm failure**

```bash
python3 -m unittest tests.governance.test_candidate -v
```

Expected: FAIL because `scripts.governance.candidate` does not exist.

- [ ] **Step 3: Implement minimal typed parsing and validation**

Pin `PyYAML==6.0.2`. Use `yaml.safe_load`; require the frontmatter to be a mapping; reject YAML tags and non-string IDs. Define enums `OPEN_UNTRIED`, `OPEN_VERIFIED_ONCE`, and `REVIEW`. Do not read linked logs or media.

- [ ] **Step 4: Update the tracked candidate template**

Replace old `rule_sha/status: open` fields with the exact approved schema. Use logical video IDs and relative evidence references; include empty arrays for `duplicate_of` and `conflicts_with` rather than placeholder prose.

- [ ] **Step 5: Run focused and full governance tests**

```bash
python3 -m pip install -r requirements-governance.txt
python3 -m unittest discover -s tests/governance -v
```

Expected: PASS with no network or Git mutation after dependency installation.

- [ ] **Step 6: Commit schema work in CHEN-BRAIN**

```bash
git add requirements-governance.txt scripts tests '03｜CHEN操盘手系统/03｜MAX剪辑系统/08｜规则候选收件箱/规则候选模板.md'
git commit -m "feat: define append-only MAX rule candidates"
```

---

### Task 3: Build the fail-closed candidate submission transaction

**Files:**
- Create: `scripts/governance/git_ops.py`
- Create: `scripts/governance/cli.py`
- Create: `tests/governance/test_git_ops.py`
- Create: `config/machine-role.example.json`
- Modify: `.gitignore`
- Modify: `03｜CHEN操盘手系统/03｜MAX剪辑系统/08｜规则候选收件箱/README.md`

**Interfaces:**
- Produces: `submit_candidate(repo: Path, draft: Path, role: MachineRole, remote: str = "origin") -> SubmissionResult`.
- `SubmissionResult` contains `candidate_id`, `branch`, `commit_sha`, and `pr_url`.
- All subprocess calls use argument arrays and `check=True`; no command string contains shell interpolation.

- [ ] **Step 1: Write failing temporary-repository tests**

Tests must prove that submission copies exactly one candidate into a worktree based on `origin/main`, rejects `decision-hub`/unknown remote mismatches, preserves the source draft until merge, and never stages an unrelated dirty file.

```python
def test_submission_stages_only_one_new_open_candidate(self):
    result = prepare_candidate_commit(self.repo, self.draft, self.editor_role)
    self.assertEqual(result.changed_paths, [self.expected_open_path])
    self.assertEqual(result.change_types, ["A"])
```

- [ ] **Step 2: Run tests and confirm failure**

```bash
python3 -m unittest tests.governance.test_git_ops -v
```

Expected: FAIL because submission interfaces do not exist.

- [ ] **Step 3: Implement preflight and temporary worktree preparation**

Implement explicit checks for repository URL `zzzzzc946-hub/CHEN-BRAIN`, role `editor`, `origin/main`, unique branch `candidate/<machine-id>/<candidate-id>`, one added path, and no deletions/renames. Keep network push and PR creation behind `--push`; dry-run is the default.

- [ ] **Step 4: Implement push and PR creation**

Use `git push -u origin <branch>`, then `gh pr create`, then `gh pr merge --auto --squash`. If any command fails, return the branch/commit and leave the draft and worktree recoverable. Never call force push.

- [ ] **Step 5: Add local role example and ignore real role config**

Track the example files for `decision-hub` and `editor`; add only `config/machine-role.json` to `.gitignore`.

- [ ] **Step 6: Verify dry-run and test suite**

```bash
python3 -m scripts.governance.cli preflight
python3 -m scripts.governance.cli submit-candidate --draft /tmp/valid-candidate.md --dry-run
python3 -m unittest discover -s tests/governance -v
```

Expected: dry-run reports one `A` change under open; tests pass; no remote branch or PR is created.

- [ ] **Step 7: Commit candidate transaction**

```bash
git add .gitignore config scripts tests '03｜CHEN操盘手系统/03｜MAX剪辑系统/08｜规则候选收件箱/README.md'
git commit -m "feat: add fail-closed candidate submission"
```

---

### Task 4: Add PR classification, CODEOWNERS, Hook, and governance CI

**Files:**
- Create: `scripts/governance/diff_gate.py`
- Create: `tests/governance/test_diff_gate.py`
- Create: `.github/workflows/governance-gate.yml`
- Create: `.github/CODEOWNERS`
- Create: `.githooks/pre-commit`
- Modify: `scripts/governance/cli.py`

**Interfaces:**
- Produces: `classify_changes(changes: list[GitChange]) -> ChangeClass` where class is `candidate`, `formal_governance`, or `invalid`.
- CLI: `python -m scripts.governance.cli validate-pr --base <sha> --head <sha>` exits 0 only for a complete valid class.

- [ ] **Step 1: Write adversarial diff tests**

Cover one valid candidate addition and reject: two files, formal edit disguised with candidate, candidate modification, rename, deletion, workflow edit, symlink, video/audio, `.env`, absolute path, duplicate Candidate ID, and unknown path. Add formal-governance fixtures that require batch, processed disposition, release, and rule linkage.

- [ ] **Step 2: Run tests and confirm failure**

```bash
python3 -m unittest tests.governance.test_diff_gate -v
```

Expected: FAIL because classifier is absent.

- [ ] **Step 3: Implement the classifier once**

Both Hook and CI invoke `validate-pr`; do not duplicate path rules in shell. Candidate classification requires exactly one `A` path matching the full open directory. Formal classification rejects unowned mixed changes and requires all governance artifacts.

- [ ] **Step 4: Add CODEOWNERS and workflow**

CODEOWNERS assigns formal 00–07, processed, governance, `.github`, `.githooks`, and `scripts/governance` to the decision-hub GitHub account. `governance-gate.yml` checks out full history, installs the pinned requirements, and runs unit tests plus `validate-pr` against the PR base/head SHAs.

- [ ] **Step 5: Add and install the local Hook**

The Hook runs the same validator against `HEAD` and the index. Add CLI command `install-hooks` that executes `git config core.hooksPath .githooks` and verifies the resolved value. A missing Hook is a warning in preflight, never a server-side exemption.

- [ ] **Step 6: Verify locally**

```bash
python3 -m unittest discover -s tests/governance -v
python3 -m scripts.governance.cli install-hooks
test "$(git config --get core.hooksPath)" = ".githooks"
```

Expected: tests pass and Hook path is exactly `.githooks`.

- [ ] **Step 7: Commit CI boundary**

```bash
git add .github .githooks scripts tests
git commit -m "feat: enforce MAX rule governance in pull requests"
```

---

### Task 5: Implement immutable review batches and cross-repository releases

**Files:**
- Create: `scripts/governance/review.py`
- Create: `scripts/governance/release.py`
- Create: `tests/governance/test_review.py`
- Create: `tests/governance/test_release.py`
- Create: `03｜CHEN操盘手系统/03｜MAX剪辑系统/08｜规则候选收件箱/governance/review-batches/.gitkeep`
- Create: `03｜CHEN操盘手系统/03｜MAX剪辑系统/08｜规则候选收件箱/governance/releases/.gitkeep`
- Create: `03｜CHEN操盘手系统/03｜MAX剪辑系统/08｜规则候选收件箱/governance/current-release.yaml`

**Interfaces:**
- Produces: `create_review_batch(repo, candidate_ids) -> ReviewBatch`, `validate_processed(batch, changes) -> list[str]`, and `validate_release(release, my_video_repo) -> list[str]`.
- `ReviewBatch` freezes Candidate ID and Git blob SHA.
- `Release` requires `schema_version`, `release_id`, `status`, `rules_schema`, `skill_impact`, `minimum_my_video_commit`, `previous_release_id`, and `review_batch_id`.

- [ ] **Step 1: Write failing immutability and compatibility tests**

Tests reject a changed candidate blob after batching, moving an unbatched candidate, rewriting an old processed file, duplicate release IDs, missing previous release, a nonexistent My-Video commit, and a commit not ancestral to My-Video HEAD.

- [ ] **Step 2: Run tests and confirm failure**

```bash
python3 -m unittest tests.governance.test_review tests.governance.test_release -v
```

Expected: FAIL because review/release modules are absent.

- [ ] **Step 3: Implement immutable batches and processed validation**

Batch generation reads each open candidate with `git rev-parse HEAD:<path>` and writes `RB-YYYYMMDD-<shortcode>.yaml`. Processed validation requires the original candidate body to remain byte-identical and permits only one appended decision block.

- [ ] **Step 4: Implement release validation**

Validate 40-hex commit format and run `git -C <my-video> cat-file -e <sha>^{commit}` plus `git merge-base --is-ancestor <sha> HEAD`. For `skill_impact: required`, reject unchanged `minimum_my_video_commit` relative to the previous release unless an explicit `compatibility_only: true` explanation exists.

- [ ] **Step 5: Create the bootstrap release**

After Task 1 merges, create `MAX-RULES-20260814-001.yaml` referencing the unified My-Video main SHA and point `current-release.yaml` at it. Mark `skill_impact: none` and use a bootstrap review batch with no candidates.

- [ ] **Step 6: Run full governance tests and commit**

```bash
python3 -m unittest discover -s tests/governance -v
python3 -m scripts.governance.cli validate-release --my-video '/Users/chen.zip/Documents/Codex/MAX视频项目'
git add scripts tests '03｜CHEN操盘手系统/03｜MAX剪辑系统/08｜规则候选收件箱/governance'
git commit -m "feat: add immutable MAX rule releases"
```

Expected: active release points to an existing ancestor of My-Video HEAD.

- [ ] **Step 7: Push the complete CHEN-BRAIN bootstrap branch**

```bash
git push -u origin codex/bootstrap-rule-governance
```

Expected: ordinary branch push succeeds; `main` is unchanged until Task 8 opens and merges the bootstrap PR.

---

### Task 6: Wire frozen rule snapshots and cost closeout into My-Video

**Files:**
- Create: `workbench/shared/rule-release.ts`
- Create: `workbench/server/rule-release.ts`
- Create: `workbench/tests/rule-release.test.ts`
- Modify: `workbench/shared/model.ts`
- Modify: `templates/视频成本台账.md`
- Modify: `.codex/skills/max-jianji-skill/SKILL.md`

**Interfaces:**
- Produces: `loadActiveRuleRelease(brainRoot: string, myVideoRoot: string): Promise<ActiveRuleRelease>`.
- Produces: `createFrozenRuleSnapshot(input: SnapshotInput): Promise<FrozenRuleSnapshot>` with `formalSha`, `myVideoSha`, `releaseId`, and `candidateIds` of length 0–3.
- Produces: `calculateTokenPerFinishedMinute(tokenUsage: number, finalDurationSeconds: number): number`.

- [ ] **Step 0: Start from unified My-Video main**

After Task 1's PR merges, update `origin/main` and create `codex/two-machine-governance-runtime`. Do not continue from the old shared branch.

```bash
git fetch origin
git switch -c codex/two-machine-governance-runtime origin/main
```

- [ ] **Step 1: Write failing Vitest contracts**

```ts
it("freezes one formal SHA and at most three candidates", async () => {
  const snapshot = await createFrozenRuleSnapshot(fixtureInput({ candidateIds: ["A", "B", "C"] }));
  expect(snapshot.candidateIds).toEqual(["A", "B", "C"]);
  await expect(createFrozenRuleSnapshot(fixtureInput({ candidateIds: ["A", "B", "C", "D"] }))).rejects.toThrow("at most 3");
});

it("calculates token cost only from actual usage and positive duration", () => {
  expect(calculateTokenPerFinishedMinute(40000, 300)).toBe(8000);
});
```

Also reject missing active release, missing My-Video commit, non-ancestor commit, mid-task mutation, zero duration, and estimated Token Usage.

- [ ] **Step 2: Run tests and confirm failure**

```bash
npx vitest run --config workbench/vitest.config.ts workbench/tests/rule-release.test.ts
```

Expected: FAIL because release interfaces do not exist.

- [ ] **Step 3: Implement release and frozen snapshot types**

Use `execFile` with explicit Git argv. Parse the small release YAML with an isolated parser or JSON-compatible YAML subset; do not execute shell or load arbitrary tags. Snapshot objects are immutable after creation and are written into the per-video task card, not global config.

- [ ] **Step 4: Align Skill and cost template**

Change startup routing from direct branch assumptions to: sync both mains, validate active release, freeze SHA/maximum-three candidates, then create Goal. Change secondary closeout to candidate PR submission. Keep Goal default 40,000 and all approved actual-cost fields.

- [ ] **Step 5: Run focused and full My-Video checks**

```bash
npx vitest run --config workbench/vitest.config.ts workbench/tests/rule-release.test.ts
npm run test:workbench
npm run lint
npm run build
```

Expected: all pass; existing 1080P/30fps export tests remain unchanged and passing.

- [ ] **Step 6: Commit the frozen lifecycle**

```bash
git add workbench templates .codex/skills/max-jianji-skill/SKILL.md
git commit -m "feat: freeze released rules for each video task"
```

---

### Task 7: Replace obsolete dual-machine documentation and add contract tests

**Files:**
- Create: `workbench/tests/two-machine-governance-docs.test.ts`
- Modify: `docs/双机同步与NAS目录规范.md`
- Modify: `docs/双机切换清单.md`
- Modify: `docs/两机规则库接入指令.md`
- Modify: `config/README.md`
- Modify: `.codex/skills/max-jianji-skill/SKILL.md`

**Interfaces:**
- Consumes: commands and paths from Tasks 3–6.
- Produces: one unambiguous instruction set for primary and secondary computers; no document authorizes direct main push or continued use of `codex/two-computer-sync` as a release source.

- [ ] **Step 1: Write failing documentation contract tests**

Tests assert all startup documents contain `main`, `current-release.yaml`, maximum three candidates, frozen SHA, candidate PR, decision hub, NAS one-way mirror, and 1080P/30fps. Tests reject phrases authorizing direct `main` push, NAS writeback, or released Skill reads from `codex/two-computer-sync`.

- [ ] **Step 2: Run test and confirm failure**

```bash
npx vitest run --config workbench/vitest.config.ts workbench/tests/two-machine-governance-docs.test.ts
```

Expected: FAIL on the existing shared-branch/direct-push instructions.

- [ ] **Step 3: Rewrite the four operational documents**

Provide exact primary startup, secondary startup, candidate submission, decision review, release compatibility, failure-stop, and user-triggered NAS mirror commands. Keep machine-specific paths in ignored config rather than prose.

- [ ] **Step 4: Run documentation and full checks**

```bash
npx vitest run --config workbench/vitest.config.ts workbench/tests/two-machine-governance-docs.test.ts workbench/tests/cross-video-memory-docs.test.ts
npm run test:workbench
npm run lint
```

Expected: all pass and no tracked instruction names the shared branch as a release source.

- [ ] **Step 5: Commit documentation migration**

```bash
git add docs config .codex/skills/max-jianji-skill/SKILL.md workbench/tests/two-machine-governance-docs.test.ts
git commit -m "docs: route both editors through protected releases"
```

---

### Task 8: Bootstrap both protected main branches

**Files:**
- Create: `My-Video/.github/workflows/quality-gate.yml`
- Create: `My-Video/.github/CODEOWNERS`
- Use existing: `CHEN-BRAIN/.github/workflows/governance-gate.yml`
- Use existing: `CHEN-BRAIN/.github/CODEOWNERS`

**Interfaces:**
- Produces: GitHub-enforced PR-only `main` branches with no force/delete/bypass, required checks, and CODEOWNER control of formal paths.

- [ ] **Step 1: Add and test My-Video quality gate on a branch**

Workflow runs `npm ci`, `npm run test:workbench`, `npm run lint`, and `npm run build`. CODEOWNERS assigns `.github`, `.codex/skills`, `workbench`, and release configuration to the primary account.

- [ ] **Step 2: Open and merge bootstrap PRs before enabling required checks**

Open the CHEN-BRAIN PR from `codex/bootstrap-rule-governance` and the My-Video PR from `codex/two-machine-governance-runtime`. Merge them normally after their available checks pass. Confirm checks appear by exact names `governance-gate` and `quality-gate` before configuring them as required.

- [ ] **Step 3: Apply branch protection with explicit JSON**

Use `gh api --method PUT` for each repository. Configuration requires PRs, required checks, code-owner review where matching, enforced admins, no force pushes, no deletions, and no bypass actor. Save redacted API responses under `/tmp`, not in either repository.

- [ ] **Step 4: Verify protection from both identities**

```bash
gh api repos/zzzzzc946-hub/CHEN-BRAIN/branches/main/protection
gh api repos/zzzzzc946-hub/My-Video/branches/main/protection
```

From the secondary account, attempt a no-op formal-path branch/PR and verify CODEOWNER approval is required. Attempt direct main push from a disposable clone and verify GitHub rejects it. Do not alter real formal content.

- [ ] **Step 5: Record protection evidence**

Append check names, ruleset IDs, account roles, verification date, and disposable test PR URLs to `docs/repository-unification-record.md`; do not record tokens.

---

### Task 9: Add explicit NAS active-release mirroring

**Files:**
- Create: `scripts/nas/sync-active-release.ts`
- Create: `workbench/tests/nas-release-sync.test.ts`
- Modify: `config/nas-paths.example.json`
- Modify: `docs/双机同步与NAS目录规范.md`

**Interfaces:**
- Produces: `planNasReleaseSync(config, release): Promise<NasSyncPlan>` and CLI `npm run sync:nas-rules -- --dry-run|--apply`.
- Apply mode requires exact user-trigger phrase state passed by the caller; default is dry-run.

- [ ] **Step 1: Write failing plan-only tests**

Tests require active release, clean committed source SHAs, allowlisted text/config paths, checksum manifest, and destination below the configured NAS root. Reject dirty formal files, inactive releases, root destinations, media extensions, and reverse-copy direction.

- [ ] **Step 2: Run tests and confirm failure**

```bash
npx vitest run --config workbench/vitest.config.ts workbench/tests/nas-release-sync.test.ts
```

Expected: FAIL because NAS planner does not exist.

- [ ] **Step 3: Implement dry-run planner and guarded apply**

Use explicit resolved paths, reject symlink escapes, copy only from temporary archives produced by `git archive <sha>`, and write a manifest containing release ID, both SHAs, timestamp, relative paths, sizes, and SHA-256 checksums. Never read NAS files as Git input.

- [ ] **Step 4: Verify using a temporary fake NAS root**

```bash
npm run sync:nas-rules -- --dry-run --config /tmp/nas-test.json
npx vitest run --config workbench/vitest.config.ts workbench/tests/nas-release-sync.test.ts
```

Expected: only allowlisted committed files appear in the plan; no real NAS path is touched.

- [ ] **Step 5: Commit mirror tooling**

```bash
git add scripts/nas workbench/tests/nas-release-sync.test.ts config/nas-paths.example.json docs/双机同步与NAS目录规范.md package.json
git commit -m "feat: mirror only active rule releases to NAS"
```

---

### Task 10: Run adversarial two-clone acceptance and real-machine bootstrap

**Files:**
- Create: `CHEN-BRAIN/tests/governance/test_concurrency.py`
- Create: `My-Video/docs/two-machine-acceptance-record.md`
- Modify only if a test exposes a defect: files owned by the failing component's prior task

**Interfaces:**
- Produces: evidence for all 19 acceptance criteria in the approved spec and a final go/no-go decision.

- [ ] **Step 1: Automate local two-clone concurrency tests**

Create a temporary bare remote and two clones. Submit two unique candidate branches concurrently; merge them in opposite order; verify both files survive. Test duplicate ID, modified candidate, deleted candidate, formal edit, unbatched processed move, stale release, and missing My-Video ancestor.

- [ ] **Step 2: Run all local suites**

```bash
python3 -m unittest discover -s tests/governance -v
npm run test:workbench
npm run lint
npm run build
```

Expected: every suite passes with no real NAS or media mutation.

- [ ] **Step 3: Validate the primary computer**

Confirm `decision-hub` role, both protected mains, active release ancestry, Hook installation, frozen snapshot generation, candidate retrieval cap, Goal/cost template, and 1080P/30fps review export contract.

- [ ] **Step 4: Validate the secondary computer**

Confirm collaborator identity, `editor` role, read-only My-Video main, active release ancestry, a disposable valid candidate PR, and rejection of a disposable formal-path PR. Delete only disposable remote branches after their PRs close; retain audit links.

- [ ] **Step 5: Test interrupted cross-repository publication**

Publish a compatibility-only My-Video test branch without activating CHEN-BRAIN and verify old rules still start. Point a test release fixture at a missing My-Video SHA and verify startup stops. Do not alter the active production pointer for this test.

- [ ] **Step 6: Record final evidence and decide go/no-go**

For each of the 19 acceptance criteria, record command, observed result, commit/PR URL, and PASS/FAIL in `docs/two-machine-acceptance-record.md`. Status is GO only when all 19 pass. Any failure leaves the old documentation boundary in effect and creates a focused follow-up task; do not declare completion.

- [ ] **Step 7: Commit the acceptance record after GO**

```bash
git add docs/two-machine-acceptance-record.md
git commit -m "test: certify two-machine rule collaboration"
```

---

## Final Release Gate

Before declaring the system active:

```bash
git -C '/Users/chen.zip/Documents/CHEN BRAIN' status --short --branch
git -C '/Users/chen.zip/Documents/Codex/MAX视频项目' status --short --branch
gh api repos/zzzzzc946-hub/CHEN-BRAIN/branches/main/protection
gh api repos/zzzzzc946-hub/My-Video/branches/main/protection
python3 -m unittest discover -s '/Users/chen.zip/Documents/CHEN BRAIN/tests/governance' -v
npm --prefix '/Users/chen.zip/Documents/Codex/MAX视频项目' run test:workbench
npm --prefix '/Users/chen.zip/Documents/Codex/MAX视频项目' run lint
npm --prefix '/Users/chen.zip/Documents/Codex/MAX视频项目' run build
```

Required result: protected branches verified, all suites pass, active release ancestry passes on both computers, no media/NAS/history path is staged, and the acceptance record shows 19/19 PASS.
