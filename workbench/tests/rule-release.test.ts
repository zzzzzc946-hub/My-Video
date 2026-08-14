import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import {
  calculateTokenPerFinishedMinute,
  createFrozenRuleSnapshot,
} from "../shared/rule-release.js";
import { loadActiveRuleRelease } from "../server/rule-release.js";

const sha = "a".repeat(40);

it("freezes one formal SHA and at most three candidates", () => {
  const snapshot = createFrozenRuleSnapshot({
    formalSha: sha,
    myVideoSha: "b".repeat(40),
    releaseId: "MAX-RULES-20260814-001",
    candidateIds: ["CR-1", "CR-2", "CR-3"],
  });

  expect(snapshot).toEqual({
    formalSha: sha,
    myVideoSha: "b".repeat(40),
    releaseId: "MAX-RULES-20260814-001",
    candidateIds: ["CR-1", "CR-2", "CR-3"],
  });
  expect(() => createFrozenRuleSnapshot({ ...snapshot, candidateIds: ["A", "B", "C", "D"] }))
    .toThrow("at most 3");
});

it("calculates token cost only from actual usage and positive duration", () => {
  expect(calculateTokenPerFinishedMinute(40_000, 300)).toBe(8_000);
  expect(() => calculateTokenPerFinishedMinute(-1, 300)).toThrow("actual non-negative");
  expect(() => calculateTokenPerFinishedMinute(40_000, 0)).toThrow("positive final duration");
});

it("loads the active release only when its My-Video commit is an ancestor", async () => {
  const root = await mkdtemp(join(tmpdir(), "max-rule-release-"));
  const brain = join(root, "brain");
  const myVideo = join(root, "my-video");
  await mkdir(brain);
  await mkdir(myVideo);
  for (const repo of [brain, myVideo]) {
    execFileSync("git", ["init", "--initial-branch=main"], { cwd: repo });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repo });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: repo });
  }
  await writeFile(join(myVideo, "README.md"), "base\n");
  execFileSync("git", ["add", "README.md"], { cwd: myVideo });
  execFileSync("git", ["commit", "-m", "base"], { cwd: myVideo });
  const myVideoSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: myVideo, encoding: "utf8" }).trim();
  const governance = join(brain, "03｜CHEN操盘手系统", "03｜MAX剪辑系统", "08｜规则候选收件箱", "governance");
  await mkdir(join(governance, "releases"), { recursive: true });
  await writeFile(join(governance, "current-release.yaml"), "release_id: MAX-RULES-20260814-001\n");
  await writeFile(join(governance, "releases", "MAX-RULES-20260814-001.yaml"), [
    "schema_version: 1",
    "release_id: MAX-RULES-20260814-001",
    "status: active",
    "rules_schema: 1",
    "skill_impact: none",
    `minimum_my_video_commit: ${myVideoSha}`,
    "previous_release_id: BOOTSTRAP",
    "review_batch_id: RB-20260814-bootstrap",
    "",
  ].join("\n"));
  execFileSync("git", ["add", "."], { cwd: brain });
  execFileSync("git", ["commit", "-m", "release"], { cwd: brain });

  const active = await loadActiveRuleRelease(brain, myVideo);

  expect(active.releaseId).toBe("MAX-RULES-20260814-001");
  expect(active.myVideoSha).toBe(myVideoSha);
  expect(active.formalSha).toMatch(/^[0-9a-f]{40}$/);
});
