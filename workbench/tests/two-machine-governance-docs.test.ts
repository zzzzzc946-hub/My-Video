import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const files = [
  "docs/双机同步与NAS目录规范.md",
  "docs/双机切换清单.md",
  "docs/两机规则库接入指令.md",
  "config/README.md",
  ".codex/skills/max-jianji-skill/SKILL.md",
];

it("routes both machines through released mains and frozen rule snapshots", async () => {
  const contents = await Promise.all(files.map((file) => readFile(resolve(file), "utf8")));
  const combined = contents.join("\n");

  expect(combined).toContain("current-release.yaml");
  expect(combined).toContain("最多 3 条候选");
  expect(combined).toContain("冻结");
  expect(combined).toContain("candidate PR");
  expect(combined).toContain("1080P、30 fps");
  expect(combined).toContain("NAS 只");
  expect(combined).not.toContain("codex/two-computer-sync");
  expect(combined).not.toContain("提交并推送");
});
