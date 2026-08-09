import { createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import { lstat, realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { applyTimelineOperation } from "../shared/timeline.js";
import { normalizeLayout } from "../shared/layout.js";
import type {
  AuditEvent,
  BackgroundTask,
  ExportRecord,
  FinalVideoExportRequest,
  SourceMedia,
  TimelineOperation,
  WorkbenchProject,
} from "../shared/model.js";
import {
  exportCapCutPackage,
  exportVideoUseEdl,
  renderFinalVideoUse,
  renderVideoUse,
} from "./exporters.js";
import {
  authorizeProjectSource,
  bindProjectTranscript,
  inspectProject,
  openProject,
  restoreVersion,
  saveDraft,
  snapshot,
  upsertExportRecord,
} from "./repository.js";
import { generateProxy, mediaContentType } from "./media.js";
import { parseScribeTranscript } from "./transcript.js";
import { appendAuditEvent, readAuditEvents } from "./audit.js";
import { TaskRegistry } from "./tasks.js";
import { authorizeProxyFile, ensureSecureDirectory, isWithin } from "./security.js";
import {
  assertProjectSourcesReadable,
  fingerprintMedia,
  sourceIsReadable,
} from "./source-facts.js";
import { recordFeedback } from "./feedback.js";

const readBody = async (request: AsyncIterable<Buffer>) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<
    string,
    unknown
  >;
};
const respond = (
  response: import("node:http").ServerResponse,
  status: number,
  body: unknown,
  origin?: string,
) => {
  response.writeHead(status, {
    "content-type": "application/json",
    ...(origin
      ? { "access-control-allow-origin": origin, vary: "Origin" }
      : {}),
  });
  response.end(JSON.stringify(body));
};
const cors = (origin?: string) =>
  origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {};
const isLoopbackAddress = (address?: string) =>
  address === "127.0.0.1" ||
  address === "::1" ||
  address === "::ffff:127.0.0.1";
const isLoopbackHost = (host?: string) => {
  if (!host) return false;
  const hostname = host.startsWith("[")
    ? host.slice(1, host.indexOf("]"))
    : host.split(":", 1)[0];
  return (
    hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1"
  );
};
const parseRange = (header: string, size: number) => {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const length = Number(match[2]);
    if (!Number.isInteger(length) || length <= 0) return null;
    return { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  const end = Math.min(requestedEnd, size - 1);
  return Number.isInteger(start) &&
    Number.isInteger(requestedEnd) &&
    start >= 0 &&
    start < size &&
    end >= start
    ? { start, end }
    : null;
};

type TaskServices = {
  generateProxies: (
    project: WorkbenchProject,
    root: string,
  ) => Promise<WorkbenchProject>;
  render: (
    project: WorkbenchProject,
    root: string,
    quality: "preview" | "rough-cut",
    logPath: string,
  ) => Promise<{ outputPath?: string; summary?: string }>;
  renderFinalVideo: (
    project: WorkbenchProject,
    root: string,
    request: FinalVideoExportRequest,
    logPath: string,
    update: (next: {
      progress: number;
      phase: NonNullable<BackgroundTask["phase"]>;
      detail: string;
    }) => Promise<void>,
  ) => Promise<{ outputPath?: string; summary?: string }>;
  chooseExportDirectory: () => Promise<string | null>;
  revealInFinder: (path: string) => Promise<void>;
};

const revealInFinder = (path: string) =>
  new Promise<void>((resolve, reject) => {
    if (process.platform !== "darwin")
      return reject(new Error("Finder reveal is only available on macOS"));
    const child = spawn("open", ["-R", path], { stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("Finder could not reveal this export")),
    );
  });

const chooseMacExportDirectory = () =>
  new Promise<string | null>((resolve, reject) => {
    if (process.platform !== "darwin")
      return reject(new Error("Directory chooser is only available on macOS"));
    const child = spawn("osascript", [
      "-e",
      'POSIX path of (choose folder with prompt "选择导出位置")',
    ], { stdio: ["ignore", "pipe", "pipe"] });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout!.on("data", (chunk) => output.push(chunk));
    child.stderr!.on("data", (chunk) => errors.push(chunk));
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) return resolve(Buffer.concat(output).toString("utf8").trim() || null);
      const message = Buffer.concat(errors).toString("utf8").trim();
      if (message.includes("User canceled")) return resolve(null);
      reject(new Error(message || "Directory chooser did not complete"));
    });
  });

const parseFinalVideoExportRequest = (value: unknown): FinalVideoExportRequest | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const format = candidate.format;
  const resolution = candidate.resolution;
  const frameRate = candidate.frameRate;
  const quality = candidate.quality;
  if (!title || title.length > 160) return null;
  if (!["mp4", "webm", "mov"].includes(String(format))) return null;
  if (!["source", "1080p", "720p"].includes(String(resolution))) return null;
  if (frameRate !== "source" && frameRate !== 30 && frameRate !== 60) return null;
  if (!["preview", "standard", "high"].includes(String(quality))) return null;
  const destinationDirectory =
    typeof candidate.destinationDirectory === "string"
      ? candidate.destinationDirectory
      : undefined;
  return {
    title,
    format: format as FinalVideoExportRequest["format"],
    resolution: resolution as FinalVideoExportRequest["resolution"],
    frameRate: frameRate as FinalVideoExportRequest["frameRate"],
    quality: quality as FinalVideoExportRequest["quality"],
    ...(destinationDirectory ? { destinationDirectory } : {}),
  };
};

export const createApiServer = (
  allowedOrigins = ["http://127.0.0.1:5173"],
  serviceOverrides: Partial<TaskServices> = {},
) => {
  const configuredOrigins = new Set([
    "http://127.0.0.1:5173",
    ...allowedOrigins,
  ]);
  const instanceId = crypto.randomUUID();
  let current: WorkbenchProject | null = null;
  let currentRoot: string | null = null;
  const approvedExportDirectories = new Set<string>();
  let taskRegistry: TaskRegistry | null = null;
  const subscribers = new Set<import("node:http").ServerResponse>();
  const publish = (type: string, payload: unknown) =>
    subscribers.forEach((response) =>
      response.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`),
    );
  const audit = async (event: Omit<AuditEvent, "id" | "timestamp">) => {
    if (!currentRoot) throw new Error("No project open");
    const persisted = await appendAuditEvent(currentRoot, event);
    publish("audit", persisted);
    return persisted;
  };
  const feedback = async (input: Parameters<typeof recordFeedback>[1]) => {
    if (currentRoot) await recordFeedback(currentRoot, input).catch(() => undefined);
  };
  const persistSourceState = async (
    source: SourceMedia,
    linkState: "missing" | "changed" | "relink-required",
    facts?: Awaited<ReturnType<typeof fingerprintMedia>>,
  ) => {
    if (!current || !currentRoot) throw new Error("No project open");
    current = {
      ...current,
      sources: current.sources.map((entry) =>
        entry.id === source.id
          ? {
              ...entry,
              ...(facts
                ? { originalPath: facts.path, fingerprint: facts.fingerprint }
                : { fingerprint: undefined }),
              proxyPath: undefined,
              linkState,
            }
          : entry,
      ),
    };
    await saveDraft(currentRoot, current);
    await audit({
      type: `source.${linkState}`,
      actor: "system",
      summary: `${source.id} is ${linkState}`,
      payload: { sourceId: source.id },
    });
    publish("project.updated", current);
  };
  const revalidateCurrentSource = async (source: SourceMedia) => {
    if (!sourceIsReadable(source)) {
      if (source.proxyPath)
        await persistSourceState(
          source,
          source.linkState === "missing" ? "missing" : "relink-required",
        );
      throw new Error(
        `Source requires authorization or relinking: ${source.id}`,
      );
    }
    let facts: Awaited<ReturnType<typeof fingerprintMedia>>;
    try {
      facts = await fingerprintMedia(source.originalPath);
    } catch (error) {
      const linkState =
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? "missing"
          : "relink-required";
      await persistSourceState(source, linkState);
      throw error;
    }
    if (facts.fingerprint !== source.fingerprint) {
      await persistSourceState(source, "changed", facts);
      throw new Error(`Source changed after project open: ${source.id}`);
    }
    return facts.path;
  };
  const revalidateCurrentProjectSources = async () => {
    if (!current) throw new Error("No project open");
    for (const source of [...current.sources])
      await revalidateCurrentSource(source);
  };
  const freezeForExport = async (kind: string) => {
    if (!current || !currentRoot) throw new Error("No project open");
    const version = await snapshot(currentRoot, current, `export ${kind}`);
    current = await openProject(currentRoot);
    await audit({
      type: "version.created",
      actor: "system",
      summary: version.name,
      payload: { versionId: version.id, exportKind: kind },
    });
    publish("project.updated", current);
    return { versionId: version.id, project: current };
  };
  const recordExport = async (
    record: ExportRecord,
    targetRoot = currentRoot,
  ) => {
    if (!targetRoot) throw new Error("No project open");
    if (current && currentRoot === targetRoot) {
      current = {
        ...current,
        exportHistory: [
          ...current.exportHistory.filter((entry) => entry.id !== record.id),
          record,
        ],
      };
      await saveDraft(targetRoot, current);
      publish("project.updated", current);
    } else {
      await upsertExportRecord(targetRoot, record);
    }
  };
  const http = createServer(async (request, response) => {
    const requestOrigin =
      typeof request.headers.origin === "string"
        ? request.headers.origin
        : undefined;
    const origin =
      requestOrigin && configuredOrigins.has(requestOrigin)
        ? requestOrigin
        : undefined;
    if (requestOrigin !== undefined && !origin)
      return respond(response, 403, { error: "Origin is not allowed" });
    if (
      requestOrigin === undefined &&
      (!isLoopbackAddress(request.socket.remoteAddress) ||
        !isLoopbackHost(request.headers.host))
    )
      return respond(response, 403, {
        error: "Originless requests require a loopback client and Host",
      });
    try {
      const reply = (status: number, body: unknown) =>
        respond(response, status, body, origin);
      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          ...(origin
            ? { "access-control-allow-origin": origin, vary: "Origin" }
            : {}),
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "content-type",
        });
        return response.end();
      }
      if (request.method === "GET" && request.url === "/api/events") {
        response.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
          ...cors(origin),
        });
        if (currentRoot)
          for (const event of await readAuditEvents(currentRoot))
            response.write(`event: audit\ndata: ${JSON.stringify(event)}\n\n`);
        subscribers.add(response);
        request.on("close", () => subscribers.delete(response));
        return;
      }
      if (request.method === "GET" && request.url === "/api/events/history")
        return reply(
          currentRoot ? 200 : 409,
          currentRoot
            ? await readAuditEvents(currentRoot)
            : { error: "No project open" },
        );
      if (request.method === "GET" && request.url === "/api/tasks")
        return reply(
          taskRegistry ? 200 : 409,
          taskRegistry?.list() ?? { error: "No project open" },
        );
      if (
        request.method === "GET" &&
        /^\/api\/tasks\/[0-9a-f-]{36}\/log$/i.test(request.url ?? "")
      ) {
        const taskId = request.url!.split("/").at(-2)!;
        const log = await taskRegistry?.readLogSummary(taskId);
        return reply(log ? 200 : 404, log ?? { error: "Unknown task" });
      }
      if (request.method === "GET" && request.url?.startsWith("/api/tasks/")) {
        const task = taskRegistry?.get(request.url.split("/").at(-1)!);
        return reply(task ? 200 : 404, task ?? { error: "Unknown task" });
      }
      if (request.method === "GET" && request.url === "/api/projects/current")
        return reply(
          current ? 200 : 404,
          current ?? { error: "No project open" },
        );
      if (request.method === "GET" && request.url === "/api/health")
        return reply(200, { ok: true, instanceId, projectRoot: currentRoot });
      if (request.method === "GET" && request.url?.startsWith("/api/media/")) {
        if (!current) return reply(409, { error: "No project open" });
        const source = current.sources.find(
          (item) =>
            item.id === decodeURIComponent(request.url!.split("/").at(-1)!),
        );
        if (!source) return reply(404, { error: "Unknown source" });
        let path: string;
        try {
          const originalPath = await revalidateCurrentSource(source);
          path = source.proxyPath
            ? await authorizeProxyFile(currentRoot!, source.proxyPath)
            : originalPath;
        } catch (error) {
          return reply(409, {
            error:
              error instanceof Error ? error.message : "Source is unavailable",
          });
        }
        const size = (await stat(path)).size;
        const range = request.headers.range;
        const contentType = mediaContentType(path);
        if (range) {
          const parsed = parseRange(range, size);
          if (!parsed) {
            response.writeHead(416, {
              "content-type": "application/json",
              "content-range": `bytes */${size}`,
              ...cors(origin),
            });
            return response.end(JSON.stringify({ error: "Invalid range" }));
          }
          const { start, end } = parsed;
          response.writeHead(206, {
            "content-type": contentType,
            "accept-ranges": "bytes",
            "content-range": `bytes ${start}-${end}/${size}`,
            "content-length": end - start + 1,
            ...cors(origin),
          });
          return createReadStream(path, { start, end }).pipe(response);
        }
        response.writeHead(200, {
          "content-type": contentType,
          "content-length": size,
          "accept-ranges": "bytes",
          ...cors(origin),
        });
        return createReadStream(path).pipe(response);
      }
      if (request.method === "GET" && request.url === "/api/transcript") {
        if (!current) return reply(409, { error: "No project open" });
        const cues = (
          await Promise.all(
            current.transcripts.map(async (reference) => {
              const source = current!.sources.find(
                (item) => item.id === reference.sourceId,
              );
              if (!source) return [];
              const { readFile } = await import("node:fs/promises");
              return parseScribeTranscript(
                source.id,
                JSON.parse(await readFile(reference.path, "utf8")),
              );
            }),
          )
        ).flat();
        return reply(200, cues);
      }
      const body = await readBody(request);
      if (request.method === "POST" && request.url === "/api/projects/inspect") {
        const startedAt = performance.now();
        const inspection = await inspectProject(String(body.root));
        return reply(200, {
          ...inspection,
          inspectionDurationMs: Math.round(performance.now() - startedAt),
        });
      }
      if (request.method === "POST" && request.url === "/api/projects/open") {
        const startedAt = performance.now();
        const inspection = await inspectProject(String(body.root));
        current = await openProject(String(body.root), {
          edlPath: typeof body.edlPath === "string" ? body.edlPath : undefined,
          draftMode:
            body.draftMode === "continue" || body.draftMode === "new"
              ? body.draftMode
              : undefined,
        });
        currentRoot = current.rootPath;
        approvedExportDirectories.clear();
        const openedRoot = currentRoot;
        taskRegistry = await TaskRegistry.create(openedRoot, async (task) => {
          const event = await appendAuditEvent(openedRoot, {
            type: `task.${task.status}`,
            actor: "system",
            summary: `${task.kind} ${task.status}`,
            payload: {
              taskId: task.id,
              kind: task.kind,
              status: task.status,
              outputPath: task.outputPath,
              error: task.error,
              versionId: task.versionId,
            },
          });
          await recordFeedback(openedRoot, {
            type: `task.${task.kind}`,
            status: task.status,
            error: task.error,
          }).catch(() => undefined);
          if (currentRoot === openedRoot) {
            publish("task.updated", task);
            publish("audit", event);
          }
        });
        await audit({
          type: "project.opened",
          actor: "user",
          summary: `Opened ${current.name}`,
        });
        await feedback({
          type: "project.opened",
          durationMs: Math.round(performance.now() - startedAt),
          edl: current.authority?.selectedEdlLabel,
          draftEncountered: inspection.workingDraft.exists,
          transcriptBinding: current.authority?.transcriptBinding,
        });
        publish("project.updated", current);
        return reply(200, current);
      }
      if (!current || !currentRoot)
        return reply(409, { error: "No project open" });
      if (request.method === "POST" && request.url === "/api/exports/reveal") {
        const candidate = typeof body.path === "string" ? body.path : "";
        const exports = await ensureSecureDirectory(
          currentRoot,
          "workbench",
          "exports",
        );
        if (!candidate) return reply(400, { error: "Missing export path" });
        const info = await lstat(candidate).catch(() => undefined);
        if (!info || info.isSymbolicLink() || (!info.isFile() && !info.isDirectory()))
          return reply(404, { error: "Generated export was not found" });
        const canonical = await realpath(candidate);
        if (
          !isWithin(exports, canonical) &&
          ![...approvedExportDirectories].some((directory) =>
            isWithin(directory, canonical),
          )
        )
          return reply(403, { error: "Only current-project exports can be revealed" });
        await (serviceOverrides.revealInFinder ?? revealInFinder)(canonical);
        await audit({
          type: "export.revealed",
          actor: "user",
          summary: "Revealed generated export in Finder",
          payload: { path: canonical },
        });
        return reply(200, { ok: true });
      }
      if (request.method === "POST" && request.url === "/api/events") {
        const actor = body.actor as AuditEvent["actor"];
        const event = await audit({
          type: String(body.type),
          actor,
          summary: String(body.summary),
          payload:
            typeof body.payload === "object" && body.payload
              ? (body.payload as Record<string, unknown>)
              : undefined,
        });
        return reply(201, event);
      }
      if (
        request.method === "POST" &&
        request.url?.startsWith("/api/sources/") &&
        request.url.endsWith("/authorize")
      ) {
        const sourceId = decodeURIComponent(request.url.split("/").at(-2)!);
        current = await authorizeProjectSource(
          currentRoot,
          current,
          sourceId,
          String(body.path),
        );
        await audit({
          type: "source.authorized",
          actor: "user",
          summary: `Authorized ${sourceId}`,
          payload: {
            sourceId,
            path: current.sources.find((source) => source.id === sourceId)
              ?.originalPath,
          },
        });
        publish("project.updated", current);
        return reply(200, current);
      }
      if (request.method === "POST" && request.url === "/api/transcripts/bind") {
        current = await bindProjectTranscript(
          currentRoot,
          current,
          String(body.path),
          String(body.sourceId),
        );
        await audit({
          type: "transcript.bound",
          actor: "user",
          summary: `已将转写绑定到 ${String(body.sourceId)}`,
          payload: { path: String(body.path), sourceId: String(body.sourceId) },
        });
        await feedback({ type: "operation.transcript-bind" });
        publish("project.updated", current);
        return reply(200, current);
      }
      if (request.method === "POST" && request.url === "/api/operations") {
        const operation = body.operation as TimelineOperation;
        current = applyTimelineOperation(current, operation);
        await saveDraft(currentRoot, current);
        const target =
          "segmentId" in operation ? operation.segmentId : "timeline";
        await audit({
          type: `timeline.${operation.type}`,
          actor: "user",
          summary: `${operation.type} ${target}`,
          payload: operation as unknown as Record<string, unknown>,
        });
        await feedback({ type: `operation.${operation.type}` });
        publish("project.updated", current);
        return reply(200, current);
      }
      if (request.method === "POST" && request.url === "/api/layout") {
        current = { ...current, layout: normalizeLayout(body.layout) };
        await saveDraft(currentRoot, current);
        await audit({
          type: "layout.updated",
          actor: "user",
          summary: "Panel layout updated",
          payload: current.layout as unknown as Record<string, unknown>,
        });
        await feedback({ type: "operation.layout" });
        publish("project.updated", current);
        return reply(200, current);
      }
      if (
        request.method === "POST" &&
        request.url === "/api/proxies/generate"
      ) {
        try {
          await revalidateCurrentProjectSources();
        } catch (error) {
          return reply(409, {
            error:
              error instanceof Error
                ? error.message
                : "Sources require relinking",
          });
        }
        const root = currentRoot;
        const projectAtStart = current;
        const generateProxies =
          serviceOverrides.generateProxies ??
          (async (project: WorkbenchProject, projectRoot: string) => {
            const allowlist = project.sources.map(
              (source) => source.originalPath,
            );
            return {
              ...project,
              sources: await Promise.all(
                project.sources.map((source) =>
                  generateProxy(projectRoot, source, allowlist),
                ),
              ),
            };
          });
        const task = await taskRegistry!.start("proxy", async () => {
          await assertProjectSourcesReadable(projectAtStart);
          const updated = await generateProxies(projectAtStart, root);
          if (currentRoot === root && current) {
            const proxyFacts = new Map(
              updated.sources.map((source) => [source.id, source]),
            );
            current = {
              ...current,
              sources: current.sources.map((source) => {
                const fact = proxyFacts.get(source.id);
                return fact
                  ? {
                      ...source,
                      proxyPath: fact.proxyPath,
                      linkState: fact.linkState,
                    }
                  : source;
              }),
            };
            await saveDraft(root, current);
            publish("project.updated", current);
          }
          return {
            summary: `${updated.sources.filter((source) => source.proxyPath).length}/${updated.sources.length} proxies ready`,
          };
        });
        return reply(202, task);
      }
      if (request.method === "POST" && request.url === "/api/versions") {
        const version = await snapshot(
          currentRoot,
          current,
          String(body.summary ?? "manual checkpoint"),
        );
        current = await openProject(currentRoot);
        await audit({
          type: "version.created",
          actor: "user",
          summary: version.name,
          payload: { versionId: version.id },
        });
        publish("project.updated", current);
        return reply(201, version);
      }
      if (
        request.method === "POST" &&
        request.url?.startsWith("/api/versions/")
      ) {
        const versionId = request.url.split("/").at(-1)!;
        current = await restoreVersion(currentRoot, versionId);
        await audit({
          type: "version.restored",
          actor: "user",
          summary: `Restored ${versionId}`,
          payload: { versionId },
        });
        publish("project.updated", current);
        return reply(200, current);
      }
      if (
        request.method === "POST" &&
        request.url?.startsWith("/api/export/")
      ) {
        const kind = request.url.split("/").at(-1);
        if (kind === "choose-directory") {
          const chosen = await (
            serviceOverrides.chooseExportDirectory ?? chooseMacExportDirectory
          )();
          if (!chosen) return reply(200, { cancelled: true });
          const info = await lstat(chosen);
          if (info.isSymbolicLink() || !info.isDirectory())
            return reply(400, { error: "Selected export location must be a regular folder" });
          const directory = await realpath(chosen);
          approvedExportDirectories.add(directory);
          return reply(200, { path: directory });
        }
        if (kind === "final-video") {
          const exportRequest = parseFinalVideoExportRequest(body.request);
          if (!exportRequest)
            return reply(400, { error: "Invalid final-video export settings" });
          if (
            exportRequest.destinationDirectory &&
            !approvedExportDirectories.has(exportRequest.destinationDirectory)
          )
            return reply(403, { error: "Export location was not selected in this workbench session" });
          try {
            await revalidateCurrentProjectSources();
          } catch (error) {
            return reply(409, {
              error: error instanceof Error ? error.message : "Sources require relinking",
            });
          }
          const root = currentRoot;
          const frozen = await freezeForExport(kind);
          const projectAtStart = frozen.project;
          const render = serviceOverrides.renderFinalVideo ?? ((project: WorkbenchProject, projectRoot: string, settings: FinalVideoExportRequest, logPath: string, update: Parameters<TaskServices["renderFinalVideo"]>[4]) => renderFinalVideoUse(projectRoot, project, settings, logPath, update));
          const taskId = crypto.randomUUID();
          const createdAt = new Date().toISOString();
          await recordExport({ id: taskId, kind: "final-video", createdAt, path: "", status: "queued", versionId: frozen.versionId });
          const task = await taskRegistry!.start(
            "render-final-video",
            async ({ logPath, update }) => {
              try {
                await assertProjectSourcesReadable(projectAtStart);
                const result = await render(projectAtStart, root, exportRequest, logPath, update);
                await recordExport({ id: taskId, kind: "final-video", createdAt, path: result.outputPath ?? "", status: "ready", versionId: frozen.versionId }, root);
                return result;
              } catch (error) {
                await recordExport({ id: taskId, kind: "final-video", createdAt, path: "", status: "failed", versionId: frozen.versionId }, root);
                throw error;
              }
            },
            { id: taskId, versionId: frozen.versionId },
          );
          await audit({ type: "render.started", actor: "user", summary: "final-video started", payload: { taskId: task.id, versionId: frozen.versionId, exportRequest } });
          await feedback({ type: "export.final-video", status: "queued" });
          return reply(202, task);
        }
        if (kind === "render-preview" || kind === "render-rough-cut") {
          try {
            await revalidateCurrentProjectSources();
          } catch (error) {
            return reply(409, {
              error:
                error instanceof Error
                  ? error.message
                  : "Sources require relinking",
            });
          }
          const root = currentRoot;
          const frozen = await freezeForExport(kind);
          const projectAtStart = frozen.project;
          const quality = kind === "render-preview" ? "preview" : "rough-cut";
          const render =
            serviceOverrides.render ??
            ((
              project: WorkbenchProject,
              projectRoot: string,
              selectedQuality: "preview" | "rough-cut",
              logPath: string,
            ) =>
              renderVideoUse(projectRoot, project, selectedQuality, logPath));
          const taskId = crypto.randomUUID();
          const createdAt = new Date().toISOString();
          await recordExport({
            id: taskId,
            kind: "render-job",
            createdAt,
            path: "",
            status: "queued",
            versionId: frozen.versionId,
          });
          const task = await taskRegistry!.start(
            kind as BackgroundTask["kind"],
            async ({ logPath }) => {
              try {
                await assertProjectSourcesReadable(projectAtStart);
                const result = await render(
                  projectAtStart,
                  root,
                  quality,
                  logPath,
                );
                await recordExport(
                  {
                    id: taskId,
                    kind: "render-job",
                    createdAt,
                    path: result.outputPath ?? "",
                    status: "ready",
                    versionId: frozen.versionId,
                  },
                  root,
                );
                return result;
              } catch (error) {
                await recordExport(
                  {
                    id: taskId,
                    kind: "render-job",
                    createdAt,
                    path: "",
                    status: "failed",
                    versionId: frozen.versionId,
                  },
                  root,
                );
                throw error;
              }
            },
            { id: taskId, versionId: frozen.versionId },
          );
          await audit({
            type: "render.started",
            actor: "user",
            summary: `${kind} started`,
            payload: { taskId: task.id, versionId: frozen.versionId },
          });
          await feedback({ type: "export.render", status: "queued" });
          return reply(202, task);
        }
        if (kind !== "videouse-edl" && kind !== "capcut-package")
          return reply(404, { error: "Unknown export" });
        const frozen = await freezeForExport(kind);
        const result =
          kind === "videouse-edl"
            ? await exportVideoUseEdl(
                currentRoot,
                frozen.project,
                frozen.versionId,
              )
            : await exportCapCutPackage(
                currentRoot,
                frozen.project,
                frozen.versionId,
              );
        const record: ExportRecord = {
          id: crypto.randomUUID(),
          kind,
          createdAt: new Date().toISOString(),
          path: result.path,
          status: "ready",
          versionId: frozen.versionId,
        };
        await recordExport(record);
        await audit({
          type: "export.completed",
          actor: "user",
          summary: `${kind} completed`,
          payload: {
            ...result,
            versionId: frozen.versionId,
          } as unknown as Record<string, unknown>,
        });
        await feedback({ type: `export.${kind}`, status: "ready" });
        return reply(200, { ...result, versionId: frozen.versionId });
      }
      return reply(404, { error: "Not found" });
    } catch (error) {
      return respond(
        response,
        500,
        { error: error instanceof Error ? error.message : "Unexpected error" },
        origin,
      );
    }
  });
  return {
    listen: () =>
      new Promise<string>((resolve) =>
        http.listen(0, "127.0.0.1", () => {
          const address = http.address() as AddressInfo;
          resolve(`http://127.0.0.1:${address.port}`);
        }),
      ),
    close: () =>
      new Promise<void>((resolve, reject) =>
        http.close((error) => (error ? reject(error) : resolve())),
      ),
    http,
    instanceId,
  };
};
