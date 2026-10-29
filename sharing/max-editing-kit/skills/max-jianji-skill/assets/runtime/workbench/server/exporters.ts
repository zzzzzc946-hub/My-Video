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
import { basename, dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { toVideoUseEdl, validateVideoUseEdl } from "../shared/timeline.js";
import type {
  BackgroundTask,
  FinalVideoExportRequest,
  WorkbenchProject,
} from "../shared/model.js";
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

const safeExportTitle = (title: string) => {
  const cleaned = title
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
  return cleaned || "untitled";
};

export type RenderProgress = (
  update: {
    progress: number;
    phase: NonNullable<BackgroundTask["phase"]>;
    detail: string;
  },
) => Promise<void>;

export const finalVideoOutputPath = async (
  candidateRoot: string,
  project: WorkbenchProject,
  request: FinalVideoExportRequest,
) => {
  const { exports } = await exportDirectory(candidateRoot);
  const id = artifactIdFor(project);
  const destination = request.destinationDirectory ?? exports;
  return safeChildPath(
    destination,
    `${safeExportTitle(request.title)}-${id}.${request.format}`,
  );
};

export const deliveryEncodeArguments = (
  input: string,
  output: string,
  request: FinalVideoExportRequest,
) => {
  const crf = { preview: "28", standard: "20", high: "16" }[request.quality];
  const resolution =
    request.resolution === "1080p"
      ? ["-vf", "scale=-2:1920"]
      : request.resolution === "720p"
        ? ["-vf", "scale=-2:1280"]
        : [];
  const frameRate = request.frameRate === "source" ? [] : ["-r", `${request.frameRate}`];
  const codec =
    request.format === "webm"
      ? ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", crf, "-c:a", "libopus"]
      : ["-c:v", "libx264", "-crf", crf, "-preset", request.quality === "high" ? "slow" : "medium", "-c:a", "aac", "-movflags", "+faststart"];
  return [
    "-y",
    "-i",
    input,
    ...resolution,
    ...frameRate,
    ...codec,
    "-progress",
    "pipe:2",
    "-nostats",
    output,
  ];
};

export const isFastDeliveryRequest = (
  project: WorkbenchProject,
  request: FinalVideoExportRequest,
) =>
  request.format === "mp4" &&
  request.resolution === "1080p" &&
  request.frameRate === "source" &&
  request.quality === "standard" &&
  project.sources.length === 1 &&
  project.timeline.segments.length > 0 &&
  project.timeline.segments.every(
    (segment) => segment.sourceId === project.sources[0]?.id,
  ) &&
  project.assets.length === 0;

export const renderPlanForFinalVideo = (
  project: WorkbenchProject,
  request: FinalVideoExportRequest,
) =>
  isFastDeliveryRequest(project, request)
    ? ({ mode: "fast-delivery", phase: "encoding" } as const)
    : ({ mode: "compatible", phase: "rough-cut" } as const);

const fastDeliveryFilter = (project: WorkbenchProject) => {
  const segments = project.timeline.segments;
  if (!segments.length) throw new Error("Fast delivery requires timeline segments");
  const filters = segments.flatMap((segment, index) => {
    const duration = segment.sourceOut - segment.sourceIn;
    const fadeOut = Math.max(0, duration - 0.03).toFixed(3);
    return [
      `[0:v]trim=start=${segment.sourceIn.toFixed(3)}:end=${segment.sourceOut.toFixed(3)},setpts=PTS-STARTPTS,scale=-2:1920[v${index}]`,
      `[0:a]atrim=start=${segment.sourceIn.toFixed(3)}:end=${segment.sourceOut.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.03,afade=t=out:st=${fadeOut}:d=0.03[a${index}]`,
    ];
  });
  const streams = segments
    .map((_, index) => `[v${index}][a${index}]`)
    .join("");
  return `${filters.join(";")};${streams}concat=n=${segments.length}:v=1:a=1[outv][outa]`;
};

export const fastDeliveryEncodeArguments = (
  project: WorkbenchProject,
  output: string,
) => {
  const source = project.sources[0];
  if (!source) throw new Error("Fast delivery requires one source media file");
  return [
    "-y",
    "-i",
    source.originalPath,
    "-filter_complex",
    fastDeliveryFilter(project),
    "-map",
    "[outv]",
    "-map",
    "[outa]",
    "-c:v",
    "h264_videotoolbox",
    "-b:v",
    "10M",
    "-maxrate",
    "14M",
    "-bufsize",
    "20M",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:2",
    "-nostats",
    output,
  ];
};

const progressFromFfmpegLine = (
  line: string,
  durationSeconds: number,
  start: number,
  end: number,
) => {
  if (line.trim() === "progress=end") return end;
  if (!(durationSeconds > 0)) return undefined;
  const match = /^out_time_(us|ms)=(\d+)$/.exec(line.trim());
  if (!match) return undefined;
  const microseconds =
    match[1] === "ms" ? Number(match[2]) * 1_000 : Number(match[2]);
  if (!Number.isFinite(microseconds)) return undefined;
  return Math.min(
    end,
    Math.round(start + (microseconds / 1_000_000 / durationSeconds) * (end - start)),
  );
};

export const encodingProgressFromLine = (
  line: string,
  durationSeconds: number,
) => progressFromFfmpegLine(line, durationSeconds, 75, 98);

const xml = (value: string) =>
  value.replace(/[<>&"']/g, (character) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[
      character
    ]!,
  );

const fcpxTime = (seconds: number) => {
  const milliseconds = Math.round(seconds * 1_000);
  return milliseconds % 1_000 === 0
    ? `${milliseconds / 1_000}s`
    : `${milliseconds}/1000s`;
};

/**
 * Produce an interchange project for Jianying's documented FCP project import.
 * It deliberately does not pretend to be a native Jianying draft.
 */
export const exportFcpXml = async (
  candidateRoot: string,
  project: WorkbenchProject,
  artifactId?: string,
) => {
  const { exports } = await exportDirectory(candidateRoot);
  const id = artifactIdFor(project, artifactId);
  const path = safeChildPath(exports, `jianying-fcpxml-${id}.fcpxml`);
  const assets = project.sources.map((source, index) => ({
    ...source,
    resourceId: `r${index + 2}`,
  }));
  const bySource = new Map(assets.map((asset) => [asset.id, asset]));
  const totalDuration = project.timeline.segments.at(-1)?.outputOut ?? 0;
  const resourceXml = assets
    .map(
      (asset) =>
        `    <asset id="${asset.resourceId}" name="${xml(asset.id)}" start="0s" duration="${fcpxTime(asset.durationSeconds ?? 0)}" hasVideo="1" hasAudio="1" audioSources="1" audioChannels="2" audioRate="48000" format="r1">
      <media-rep kind="original-media" src="${xml(pathToFileURL(asset.originalPath).href)}"/>
    </asset>`,
    )
    .join("\n");
  const clipXml = project.timeline.segments
    .map((segment) => {
      const source = bySource.get(segment.sourceId);
      if (!source) throw new Error(`FCPXML source missing: ${segment.sourceId}`);
      return `          <asset-clip name="${xml(segment.reason ?? source.id)}" ref="${source.resourceId}" offset="${fcpxTime(segment.outputIn)}" start="${fcpxTime(segment.sourceIn)}" duration="${fcpxTime(segment.sourceOut - segment.sourceIn)}"/>`;
    })
    .join("\n");
  const document = `<?xml version="1.0" encoding="UTF-8"?>
<fcpxml version="1.9">
  <resources>
    <format id="r1" name="FFVideoFormat1080x1920p30" frameDuration="1/30s" width="1080" height="1920"/>
${resourceXml}
  </resources>
  <project name="${xml(project.name)}">
    <sequence format="r1" duration="${fcpxTime(totalDuration)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
      <spine>
${clipXml}
      </spine>
    </sequence>
  </project>
</fcpxml>
`;
  await writeFile(path, document, "utf8");
  return { path, format: "fcpxml" as const };
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
    nativeDraftAdapter: "unsupported",
    versionLocked: false,
    message:
      "Jianying native timelines are encrypted; no verified native draft writer exists.",
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
  onProgress?: RenderProgress,
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
      resolve(__dirname, "../../../video-use/helpers/render.py"),
      edl.path,
      "-o",
      partOutput,
      ...(quality === "preview" ? ["--preview"] : []),
    ];
    await log.appendFile(`python3 ${args.join(" ")}\n`);
    await onProgress?.({
      progress: 0,
      phase: "rough-cut",
      detail: "正在生成粗剪片段",
    });
    const child = spawn(process.env.MAX_VIDEO_PYTHON ?? resolve(__dirname, process.platform === "win32" ? "../../../video-use/.venv/Scripts/python.exe" : "../../../video-use/.venv/bin/python"), args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let pending = "";
    let logWrites = Promise.resolve();
    let progressWrites = Promise.resolve();
    const appendOutput = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      logWrites = logWrites.then(() => log.appendFile(text));
      pending += text;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const segment = /^\s*\[(\d+)\]\s/.exec(line);
        if (!segment || !onProgress) continue;
        const completed = Math.max(0, Number(segment[1]) - 1);
        const total = Math.max(1, project.timeline.segments.length);
        progressWrites = progressWrites.then(() =>
          onProgress({
            progress: Math.round((completed / total) * 75),
            phase: "rough-cut",
            detail: `正在生成粗剪片段（${Math.min(completed + 1, total)}/${total}）`,
          }),
        );
      }
    };
    child.stdout!.on("data", appendOutput);
    child.stderr!.on("data", appendOutput);
    const code = await waitForChild(child);
    await Promise.all([logWrites, progressWrites]);
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
    await onProgress?.({
      progress: 75,
      phase: "rough-cut",
      detail: "粗剪片段生成完成",
    });
    return {
      outputPath: output,
      summary: `${probe.duration.toFixed(3)}s, audio+video verified`,
    };
  } finally {
    await log.close();
    await rm(partOutput, { force: true }).catch(() => undefined);
  }
};

const renderFastFinalVideo = async (
  candidateRoot: string,
  project: WorkbenchProject,
  request: FinalVideoExportRequest,
  logPath: string,
  onProgress?: RenderProgress,
) => {
  const output = await finalVideoOutputPath(candidateRoot, project, request);
  const partOutput = safeChildPath(
    dirname(output),
    `.${basename(output)}.${randomUUID()}.part.${request.format}`,
  );
  const log = await open(logPath, "a");
  try {
    const args = fastDeliveryEncodeArguments(project, partOutput);
    await log.appendFile(`ffmpeg ${args.join(" ")}\n`);
    await onProgress?.({
      progress: 0,
      phase: "encoding",
      detail: "正在使用 Mac 硬件快速导出 MP4",
    });
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    const durationSeconds = project.timeline.segments.at(-1)?.outputOut ?? 0;
    let pending = "";
    let logWrites = Promise.resolve();
    let progressWrites = Promise.resolve();
    child.stderr!.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      logWrites = logWrites.then(() => log.appendFile(text));
      pending += text;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const progress = progressFromFfmpegLine(line, durationSeconds, 0, 98);
        if (progress === undefined || !onProgress) continue;
        progressWrites = progressWrites.then(() =>
          onProgress({
            progress,
            phase: "encoding",
            detail: "正在使用 Mac 硬件快速导出 MP4",
          }),
        );
      }
    });
    const code = await waitForChild(child);
    await Promise.all([logWrites, progressWrites]);
    if (code !== 0) {
      const tail = (await readFile(logPath, "utf8"))
        .split("\n")
        .slice(-20)
        .join("\n");
      throw new Error(`Mac hardware export exited ${code}: ${tail}`);
    }
    await onProgress?.({
      progress: 98,
      phase: "verifying",
      detail: "正在验证快速导出文件",
    });
    const probe = await probeRenderedMedia(partOutput);
    await assertProjectSourcesReadable(project);
    await rename(partOutput, output);
    return {
      outputPath: output,
      summary: `${probe.duration.toFixed(3)}s, MP4 hardware delivery verified`,
    };
  } finally {
    await log.close();
    await rm(partOutput, { force: true }).catch(() => undefined);
  }
};

export const renderFinalVideoUse = async (
  candidateRoot: string,
  project: WorkbenchProject,
  request: FinalVideoExportRequest,
  logPath: string,
  onProgress?: RenderProgress,
) => {
  if (isFastDeliveryRequest(project, request))
    return renderFastFinalVideo(
      candidateRoot,
      project,
      request,
      logPath,
      onProgress,
    );
  const intermediate = await renderVideoUse(
    candidateRoot,
    project,
    request.quality === "preview" ? "preview" : "rough-cut",
    logPath,
    onProgress,
  );
  if (!intermediate.outputPath)
    throw new Error("VideoUse renderer did not provide an intermediate file");
  const output = await finalVideoOutputPath(candidateRoot, project, request);
  const partOutput = safeChildPath(
    dirname(output),
    `.${basename(output)}.${randomUUID()}.part.${request.format}`,
  );
  const log = await open(logPath, "a");
  try {
    const args = deliveryEncodeArguments(intermediate.outputPath, partOutput, request);
    await log.appendFile(`ffmpeg ${args.join(" ")}\n`);
    await onProgress?.({
      progress: 75,
      phase: "encoding",
      detail: `正在编码 ${request.format.toUpperCase()} 成片`,
    });
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    const durationSeconds = project.timeline.segments.at(-1)?.outputOut ?? 0;
    let pending = "";
    let logWrites = Promise.resolve();
    let progressWrites = Promise.resolve();
    child.stderr!.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      logWrites = logWrites.then(() => log.appendFile(text));
      pending += text;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const progress = encodingProgressFromLine(line, durationSeconds);
        if (progress === undefined || !onProgress) continue;
        progressWrites = progressWrites.then(() =>
          onProgress({
            progress,
            phase: "encoding",
            detail: `正在编码 ${request.format.toUpperCase()} 成片`,
          }),
        );
      }
    });
    const code = await waitForChild(child);
    await Promise.all([logWrites, progressWrites]);
    if (code !== 0) {
      const tail = (await readFile(logPath, "utf8"))
        .split("\n")
        .slice(-20)
        .join("\n");
      throw new Error(`Delivery encode exited ${code}: ${tail}`);
    }
    await onProgress?.({
      progress: 98,
      phase: "verifying",
      detail: "正在验证导出文件",
    });
    const probe = await probeRenderedMedia(partOutput);
    await assertProjectSourcesReadable(project);
    await rename(partOutput, output);
    return {
      outputPath: output,
      summary: `${probe.duration.toFixed(3)}s, ${request.format.toUpperCase()} delivery verified`,
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
