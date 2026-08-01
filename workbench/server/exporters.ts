import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  copyFile,
  lstat,
  open,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, relative } from "node:path";
import { toVideoUseEdl, validateVideoUseEdl } from "../shared/timeline.js";
import type { WorkbenchProject } from "../shared/model.js";
import {
  canonicalProjectRoot,
  ensureSecureDirectory,
  isWithin,
  safeChildPath,
} from "./security.js";
import { assertProjectSourcesReadable } from "./source-facts.js";

const writeJson = async (path: string, value: unknown) => {
  const directory = dirname(path);
  const temporary = safeChildPath(
    directory,
    `.${basename(path)}.${randomUUID()}.part`,
  );
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
};

const atomicCopy = async (source: string, target: string) => {
  const temporary = safeChildPath(
    dirname(target),
    `.${basename(target)}.${randomUUID()}.part`,
  );
  try {
    await copyFile(source, temporary, constants.COPYFILE_EXCL);
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
};
const exportDirectory = async (candidateRoot: string) => {
  const root = await canonicalProjectRoot(candidateRoot);
  return {
    root,
    exports: await ensureSecureDirectory(root, "workbench", "exports"),
  };
};
const artifactIdFor = (project: WorkbenchProject, artifactId?: string) => {
  const id = artifactId ?? project.currentVersionId ?? randomUUID();
  if (!/^[a-zA-Z0-9-]+$/.test(id))
    throw new Error("Invalid export artifact ID");
  return id;
};

export const exportVideoUseEdl = async (
  candidateRoot: string,
  project: WorkbenchProject,
  artifactId?: string,
) => {
  const { exports } = await exportDirectory(candidateRoot);
  const edl = toVideoUseEdl(project);
  const validation = validateVideoUseEdl(project, edl);
  if (!validation.ok)
    throw new Error(`EDL validation failed: ${validation.errors.join(", ")}`);
  const path = safeChildPath(
    exports,
    `videouse-edl-${artifactIdFor(project, artifactId)}.json`,
  );
  await writeJson(path, edl);
  return { path, validation };
};

export const exportCapCutPackage = async (
  candidateRoot: string,
  project: WorkbenchProject,
  artifactId?: string,
) => {
  const { root, exports } = await exportDirectory(candidateRoot);
  const packageName = `capcut-delivery-package-${artifactIdFor(project, artifactId)}`;
  const directory = await ensureSecureDirectory(
    root,
    "workbench",
    "exports",
    packageName,
  );
  const decisionsDirectory = await ensureSecureDirectory(
    root,
    "workbench",
    "exports",
    packageName,
    "decisions",
  );
  const edl = toVideoUseEdl(project);
  const validation = validateVideoUseEdl(project, edl);
  if (!validation.ok)
    throw new Error(`EDL validation failed: ${validation.errors.join(", ")}`);
  const decisionEntries: Array<{ label?: string; file: string }> = [];
  for (const decision of project.decisions) {
    const info = await lstat(decision.path);
    const canonical = await realpath(decision.path);
    if (info.isSymbolicLink() || !info.isFile() || !isWithin(root, canonical))
      throw new Error("Decision reference must be a regular project file");
    const digest = createHash("sha256")
      .update(canonical)
      .digest("hex")
      .slice(0, 12);
    const filename = `${digest}-${basename(canonical).replace(/[^\p{L}\p{N}_.-]/gu, "_")}`;
    const target = safeChildPath(decisionsDirectory, filename);
    await atomicCopy(canonical, target);
    decisionEntries.push({
      label: decision.label,
      file: relative(directory, target),
    });
  }
  await writeJson(safeChildPath(directory, "edl.json"), edl);
  await writeJson(safeChildPath(directory, "source-manifest.json"), {
    sources: project.sources.map(
      ({ id, originalPath, fingerprint, durationSeconds }) => ({
        id,
        originalPath,
        fingerprint,
        durationSeconds,
        relinkRequiredOnAnotherMachine: true,
      }),
    ),
  });
  await writeJson(safeChildPath(directory, "decisions.json"), {
    decisions: decisionEntries,
  });
  await writeJson(safeChildPath(directory, "adapter-status.json"), {
    nativeDraftAdapter: "experimental",
    versionLocked: false,
    message: "Stable package only; no universal CapCut draft is claimed.",
  });
  await writeJson(safeChildPath(directory, "project.json"), {
    ...project,
    rootPath: ".",
  });
  await writeJson(safeChildPath(directory, "package-manifest.json"), {
    schemaVersion: 1,
    files: {
      project: "project.json",
      edl: "edl.json",
      sources: "source-manifest.json",
      decisions: "decisions.json",
      adapterStatus: "adapter-status.json",
    },
  });
  return {
    path: directory,
    adapter: "experimental" as const,
    exportsRoot: exports,
  };
};

const waitForChild = (child: ReturnType<typeof spawn>) =>
  new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      signal
        ? reject(new Error(`renderer terminated by ${signal}`))
        : resolve(code ?? -1),
    );
  });

const probeRenderedMedia = async (path: string) => {
  const child = spawn(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type,width,height,avg_frame_rate",
      "-of",
      "json",
      path,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout!.on("data", (chunk) => stdout.push(chunk));
  child.stderr!.on("data", (chunk) => stderr.push(chunk));
  const code = await waitForChild(child);
  if (code !== 0)
    throw new Error(
      `ffprobe failed (${code}): ${Buffer.concat(stderr).toString("utf8").trim()}`,
    );
  const probe = JSON.parse(Buffer.concat(stdout).toString("utf8")) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type?: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
    }>;
  };
  const duration = Number(probe.format?.duration);
  if (
    !(duration > 0) ||
    !probe.streams?.some((stream) => stream.codec_type === "video") ||
    !probe.streams.some((stream) => stream.codec_type === "audio")
  )
    throw new Error(
      "Rendered media failed validation: non-zero audio and video streams required",
    );
  return { duration, streams: probe.streams };
};

export const renderVideoUse = async (
  candidateRoot: string,
  project: WorkbenchProject,
  quality: "preview" | "rough-cut",
  logPath: string,
) => {
  await assertProjectSourcesReadable(project);
  const { root, exports } = await exportDirectory(candidateRoot);
  const artifactId = artifactIdFor(project);
  const edl = await exportVideoUseEdl(root, project, artifactId);
  const output = safeChildPath(exports, `${quality}-${artifactId}.mp4`);
  const partOutput = `${output}.${randomUUID()}.part.mp4`;
  const log = await open(logPath, "a");
  try {
    const args = [
      "/Users/chen.zip/.codex/skills/video-use/helpers/render.py",
      edl.path,
      "-o",
      partOutput,
      ...(quality === "preview" ? ["--preview"] : []),
    ];
    await log.appendFile(`python3 ${args.join(" ")}\n`);
    const child = spawn("python3", args, {
      cwd: root,
      stdio: ["ignore", log.fd, log.fd],
    });
    const code = await waitForChild(child);
    if (code !== 0) {
      const tail = (await readFile(logPath, "utf8"))
        .split("\n")
        .slice(-20)
        .join("\n");
      throw new Error(`VideoUse renderer exited ${code}: ${tail}`);
    }
    const probe = await probeRenderedMedia(partOutput);
    await assertProjectSourcesReadable(project);
    await rename(partOutput, output);
    return {
      outputPath: output,
      summary: `${probe.duration.toFixed(3)}s, audio+video verified`,
    };
  } finally {
    await log.close();
    await rm(partOutput, { force: true }).catch(() => undefined);
  }
};

export const renderOutputPath = async (
  candidateRoot: string,
  project: WorkbenchProject,
  quality: "preview" | "rough-cut",
) => {
  const { exports } = await exportDirectory(candidateRoot);
  return safeChildPath(exports, `${quality}-${artifactIdFor(project)}.mp4`);
};
