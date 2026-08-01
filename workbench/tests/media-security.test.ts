import { copyFile, mkdtemp, mkdir, readFile, realpath, rename, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { generateProxy, proxyPathFor } from "../server/media.js";
import { inspectMedia } from "../server/source-facts.js";

const roots: string[] = [];
const execFileAsync = promisify(execFile);
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

it("uses a fixed safe proxy filename for an attacker-controlled source id", async () => {
  const root = await mkdtemp(join(tmpdir(), "videouse-proxy-safe-"));
  roots.push(root);
  const media = join(root, "source.mp4");
  await writeFile(media, "media");
  const path = await proxyPathFor(await realpath(root), { id: "../../escape/源", originalPath: media, durationSeconds: 1, linkState: "linked" });
  expect(path.startsWith(join(await realpath(root), "workbench", "proxies") + "/")).toBe(true);
  expect(path).toMatch(/\/[a-f0-9]{64}\.mp4$/);
  expect(path).not.toContain("escape");
});

it("rejects a proxies directory symlink that escapes the project", async () => {
  const root = await mkdtemp(join(tmpdir(), "videouse-proxy-link-"));
  const outside = await mkdtemp(join(tmpdir(), "videouse-proxy-outside-"));
  roots.push(root, outside);
  await mkdir(join(root, "workbench"));
  await symlink(outside, join(root, "workbench", "proxies"));
  const media = join(root, "source.mp4");
  await writeFile(media, "media");
  await expect(proxyPathFor(await realpath(root), { id: "safe", originalPath: media, durationSeconds: 1, linkState: "linked" })).rejects.toThrow(/proxy|escape|symlink/i);
});

it("does not let a precreated .part symlink redirect ffmpeg outside the proxy directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "videouse-proxy-part-"));
  const outside = await mkdtemp(join(tmpdir(), "videouse-proxy-part-outside-"));
  roots.push(root, outside);
  const media = join(root, "source.mp4");
  await execFileAsync("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=black:s=16x16:d=1", "-f", "lavfi", "-i", "anullsrc=d=1", "-c:v", "libx264", "-c:a", "aac", "-shortest", media]);
  const facts = await inspectMedia(media);
  const source = { id: "safe", originalPath: facts.path, durationSeconds: facts.durationSeconds, fingerprint: facts.fingerprint, linkState: "linked" as const };
  const proxy = await proxyPathFor(await realpath(root), source);
  const outsideFile = join(outside, "do-not-overwrite.mp4");
  await writeFile(outsideFile, "sentinel");
  await symlink(outsideFile, `${proxy}.part`);
  const generated = await generateProxy(root, source, [await realpath(media)]);
  expect(generated.proxyPath).toMatch(/\/workbench\/proxies\/[a-f0-9]{64}\.mp4$/);
  expect(await readFile(outsideFile, "utf8")).toBe("sentinel");
});

it("refuses to start proxy generation from a source replaced after it was fingerprinted", async () => {
  const root = await mkdtemp(join(tmpdir(), "videouse-proxy-toctou-"));
  roots.push(root);
  const media = join(root, "source.mp4");
  await execFileAsync("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=black:s=16x16:d=1", "-f", "lavfi", "-i", "anullsrc=d=1", "-c:v", "libx264", "-c:a", "aac", "-shortest", media]);
  const facts = await inspectMedia(media);
  const source = { id: "source", originalPath: facts.path, durationSeconds: facts.durationSeconds, fingerprint: facts.fingerprint, linkState: "linked" as const };
  const before = await stat(media);
  const replacement = `${media}.replacement`;
  await copyFile(media, replacement);
  await utimes(replacement, before.atime, before.mtime);
  await rename(replacement, media);
  const proxy = await proxyPathFor(root, source);

  await expect(generateProxy(root, source, [facts.path])).rejects.toThrow(/changed/i);
  await expect(stat(proxy)).rejects.toThrow();
});
