import {
  lstat,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { exportCapCutPackage, renderOutputPath } from "../server/exporters.js";
import { createProject } from "../shared/timeline.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ),
);

it("exports a stable handoff package with EDL, source manifest, decision references, and adapter status", async () => {
  const root = await mkdtemp(join(tmpdir(), "videouse-capcut-package-"));
  roots.push(root);
  const media = join(root, "source.mp4");
  const decision = join(root, "rough_cut_decisions.md");
  await writeFile(media, "media");
  await writeFile(decision, "# Decision evidence");
  const project = createProject({
    name: "fixture",
    rootPath: root,
    sources: [{ id: "source", originalPath: media, durationSeconds: 10 }],
    segments: [{ id: "s1", sourceId: "source", sourceIn: 1, sourceOut: 5 }],
  });
  project.decisions = [{ path: decision, label: "rough cut" }];
  const result = await exportCapCutPackage(root, project);
  const manifest = JSON.parse(
    await readFile(join(result.path, "package-manifest.json"), "utf8"),
  ) as { files: Record<string, string> };
  expect(Object.values(manifest.files).every((path) => !isAbsolute(path))).toBe(
    true,
  );
  await expect(
    readFile(join(result.path, manifest.files.edl!), "utf8"),
  ).resolves.toContain('"ranges"');
  await expect(
    readFile(join(result.path, manifest.files.sources!), "utf8"),
  ).resolves.toContain('"source"');
  await expect(
    readFile(join(result.path, manifest.files.decisions!), "utf8"),
  ).resolves.toContain("rough_cut_decisions");
  await expect(
    readFile(join(result.path, manifest.files.adapterStatus!), "utf8"),
  ).resolves.toContain('"experimental"');
});

it("atomically replaces a planted package symlink without writing outside the package", async () => {
  const root = await mkdtemp(join(tmpdir(), "videouse-capcut-symlink-"));
  const outside = await mkdtemp(join(tmpdir(), "videouse-capcut-outside-"));
  roots.push(root, outside);
  const media = join(root, "source.mp4");
  const decision = join(root, "decision.md");
  await writeFile(media, "media");
  await writeFile(decision, "decision");
  const project = createProject({
    name: "fixture",
    rootPath: root,
    sources: [{ id: "source", originalPath: media, durationSeconds: 10 }],
    segments: [{ id: "s1", sourceId: "source", sourceIn: 1, sourceOut: 5 }],
  });
  project.decisions = [{ path: decision }];
  const first = await exportCapCutPackage(root, project, "v001");
  const sentinel = join(outside, "sentinel.json");
  await writeFile(sentinel, "do-not-overwrite");
  const packageEdl = join(first.path, "edl.json");
  await rm(packageEdl);
  await symlink(sentinel, packageEdl);
  await exportCapCutPackage(root, project, "v001");
  expect(await readFile(sentinel, "utf8")).toBe("do-not-overwrite");
  expect((await lstat(packageEdl)).isSymbolicLink()).toBe(false);
});

it("uses the frozen version in render output paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "videouse-render-path-"));
  roots.push(root);
  const first = createProject({
    name: "fixture",
    rootPath: root,
    sources: [],
    segments: [],
  });
  const second = { ...first, currentVersionId: "v002" };
  first.currentVersionId = "v001";
  expect(await renderOutputPath(root, first, "preview")).not.toBe(
    await renderOutputPath(root, second, "preview"),
  );
});
