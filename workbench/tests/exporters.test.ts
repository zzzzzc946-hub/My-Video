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
import {
  deliveryEncodeArguments,
  encodingProgressFromLine,
  exportCapCutPackage,
  exportFcpXml,
  finalVideoOutputPath,
  fastDeliveryEncodeArguments,
  isFastDeliveryRequest,
  renderPlanForFinalVideo,
  renderOutputPath,
} from "../server/exporters.js";
import { createProject } from "../shared/timeline.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ),
);

it("exports an FCPXML import project with the edited source ranges in timeline order", async () => {
  const root = await mkdtemp(join(tmpdir(), "videouse-fcpxml-"));
  roots.push(root);
  const media = join(root, "source clip.mp4");
  await writeFile(media, "media");
  const project = createProject({
    name: "形象是男生最有价值的投资",
    rootPath: root,
    sources: [{ id: "source", originalPath: media, durationSeconds: 10 }],
    segments: [
      { id: "later", sourceId: "source", sourceIn: 5, sourceOut: 8 },
      { id: "hook", sourceId: "source", sourceIn: 1, sourceOut: 3 },
    ],
  });

  const result = await exportFcpXml(root, project, "v001");
  const xml = await readFile(result.path, "utf8");

  expect(result.path).toContain("jianying-fcpxml-v001.fcpxml");
  expect(xml).toContain('<fcpxml version="1.9">');
  expect(xml).toContain('name="形象是男生最有价值的投资"');
  expect(xml).toContain('<media-rep kind="original-media" src="file://');
  expect(xml).toContain("source%20clip.mp4");
  expect(xml).toContain('audioSources="1" audioChannels="2" audioRate="48000"');
  expect(xml).toContain('</resources>\n  <project name="形象是男生最有价值的投资">');
  expect(xml).not.toContain("<library>");
  expect(xml.indexOf('offset="0s" start="5s" duration="3s"')).toBeGreaterThan(-1);
  expect(xml.indexOf('offset="3s" start="1s" duration="2s"')).toBeGreaterThan(
    xml.indexOf('offset="0s" start="5s" duration="3s"'),
  );
});

it("plans a safe named delivery file with the requested 1080P 60fps MP4 settings", async () => {
  const root = await mkdtemp(join(tmpdir(), "videouse-final-export-"));
  roots.push(root);
  const project = createProject({
    name: "fixture",
    rootPath: root,
    sources: [],
    segments: [],
  });
  project.currentVersionId = "v001";
  const request = {
    title: "MAX / 最有价值的投资",
    format: "mp4" as const,
    resolution: "1080p" as const,
    frameRate: 60 as const,
    quality: "standard" as const,
  };

  const path = await finalVideoOutputPath(root, project, request);
  const args = deliveryEncodeArguments("input.mp4", path, request);

  expect(path).toMatch(/workbench\/exports\/MAX_最有价值的投资-v001\.mp4$/);
  expect(args).toContain("scale=-2:1920");
  expect(args).toContain("60");
  expect(args).toContain("libx264");
  expect(args).toEqual(expect.arrayContaining(["-progress", "pipe:2", "-nostats"]));
  expect(args.at(-1)).toBe(path);
});

it("maps FFmpeg machine-readable output time to the delivery encoding range", () => {
  expect(encodingProgressFromLine("out_time_us=5000000", 10)).toBe(87);
  expect(encodingProgressFromLine("out_time_ms=5000", 10)).toBe(87);
  expect(encodingProgressFromLine("progress=end", 10)).toBe(98);
  expect(encodingProgressFromLine("frame=42", 10)).toBeUndefined();
});

it("routes the fixed 1080P 30fps single-source review export through one VideoToolbox encode", () => {
  const project = createProject({
    name: "fixture",
    rootPath: "/tmp/fixture",
    sources: [{ id: "source", originalPath: "/tmp/source.mp4", durationSeconds: 10 }],
    segments: [
      { id: "hook", sourceId: "source", sourceIn: 4, sourceOut: 6 },
      { id: "body", sourceId: "source", sourceIn: 1, sourceOut: 3 },
    ],
  });
  const request = {
    title: "MAX",
    format: "mp4" as const,
    resolution: "1080p" as const,
    frameRate: 30 as const,
    quality: "standard" as const,
  };

  expect(isFastDeliveryRequest(project, request)).toBe(true);
  expect(renderPlanForFinalVideo(project, request)).toEqual({
    mode: "fast-delivery",
    phase: "encoding",
  });
  expect(fastDeliveryEncodeArguments(project, "output.mp4")).toEqual(
    expect.arrayContaining([
      "-filter_complex",
      "h264_videotoolbox",
      "-progress",
      "pipe:2",
    ]),
  );
  expect(fastDeliveryEncodeArguments(project, "output.mp4").join(" ")).toContain(
    "trim=start=4.000:end=6.000",
  );
  expect(fastDeliveryEncodeArguments(project, "output.mp4").join(" ")).toContain(
    "fps=30",
  );
  expect(fastDeliveryEncodeArguments(project, "output.mp4").at(-1)).toBe("output.mp4");
});

it("keeps non-default delivery specifications on the compatible render path", () => {
  const project = createProject({
    name: "fixture",
    rootPath: "/tmp/fixture",
    sources: [{ id: "source", originalPath: "/tmp/source.mp4", durationSeconds: 10 }],
    segments: [{ id: "s1", sourceId: "source", sourceIn: 0, sourceOut: 4 }],
  });
  expect(isFastDeliveryRequest(project, {
    title: "MAX", format: "webm", resolution: "1080p", frameRate: "source", quality: "standard",
  })).toBe(false);
  expect(isFastDeliveryRequest(project, {
    title: "MAX", format: "mp4", resolution: "1080p", frameRate: "source", quality: "standard",
  })).toBe(false);
  expect(renderPlanForFinalVideo(project, {
    title: "MAX", format: "mp4", resolution: "1080p", frameRate: "source", quality: "high",
  })).toEqual({ mode: "compatible", phase: "rough-cut" });
});

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
  expect(manifest.files).toEqual({
    project: "project.json",
    edl: "edl.json",
    sources: "source-manifest.json",
    decisions: "decisions.json",
    adapterStatus: "adapter-status.json",
  });
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
  ).resolves.toContain('"unsupported"');
  await expect(
    readFile(join(result.path, "jianying-import.fcpxml"), "utf8"),
  ).rejects.toMatchObject({ code: "ENOENT" });
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
