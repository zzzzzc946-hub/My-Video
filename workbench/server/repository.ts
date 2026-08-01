import { randomUUID } from "node:crypto";
import {
  access,
  link,
  lstat,
  readFile,
  readdir,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { createProject, validateProjectTimeline } from "../shared/timeline.js";
import type {
  ExportRecord,
  SourceAuthorization,
  SourceMedia,
  TranscriptReference,
  VersionRecord,
  VideoUseEdl,
  WorkbenchProject,
} from "../shared/model.js";
import { normalizeLayout } from "../shared/layout.js";
import {
  authorizeMediaFile,
  canonicalProjectRoot,
  ensureSecureDirectory,
  isWithin,
  safeChildPath,
  validateMediaCandidatePath,
} from "./security.js";
import { inspectMedia } from "./source-facts.js";
import { proxyPathFor } from "./media.js";

const exists = async (path: string) =>
  access(path)
    .then(() => true)
    .catch(() => false);
const json = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, "utf8")) as T;

const secureJsonRead = async <T>(root: string, path: string) => {
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isFile())
    throw new Error("Project JSON must be a regular file and not a symlink");
  const canonical = await realpath(path);
  if (!isWithin(root, canonical))
    throw new Error("Project JSON escapes the opened project root");
  return json<T>(canonical);
};

const atomicWriteJson = async (
  directory: string,
  filename: string,
  value: unknown,
) => {
  const target = safeChildPath(directory, filename);
  const temporary = safeChildPath(
    directory,
    `.${filename}.${randomUUID()}.part`,
  );
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await rename(temporary, target);
};

const findEdl = async (root: string) => {
  const file = (await readdir(root))
    .filter((entry) => /^edl.*\.json$/i.test(entry))
    .sort()
    .at(-1);
  if (!file) throw new Error("No VideoUse EDL found in selected project");
  const path = safeChildPath(root, file);
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isFile())
    throw new Error(
      "VideoUse EDL must be a regular file inside the project root",
    );
  return realpath(path);
};

const discoverTranscripts = async (
  root: string,
  sourceIds: string[],
): Promise<TranscriptReference[]> => {
  const directory = join(root, "transcripts");
  if (!(await exists(directory))) return [];
  const info = await lstat(directory);
  if (
    info.isSymbolicLink() ||
    !info.isDirectory() ||
    !isWithin(root, await realpath(directory))
  )
    throw new Error("Transcript directory escapes project root");
  const references: TranscriptReference[] = [];
  for (const file of (await readdir(directory))
    .filter((entry) => entry.endsWith(".json"))
    .sort()) {
    const path = safeChildPath(directory, file);
    const fileInfo = await lstat(path);
    if (fileInfo.isSymbolicLink() || !fileInfo.isFile()) continue;
    references.push({
      path: await realpath(path),
      label: file,
      sourceId: sourceIds.find((id) =>
        file.toLowerCase().startsWith(id.toLowerCase()),
      ),
    });
  }
  return references;
};

const directories = async (root: string) => {
  const workbench = await ensureSecureDirectory(root, "workbench");
  const versions = await ensureSecureDirectory(root, "workbench", "versions");
  return { workbench, versions };
};

const versionFilename = /^v(\d{3,})\.json$/;

const discoverVersions = async (root: string, versionsDirectory: string) => {
  const occupied: number[] = [];
  const records: VersionRecord[] = [];
  for (const filename of (await readdir(versionsDirectory)).sort()) {
    const match = versionFilename.exec(filename);
    if (!match) continue;
    const path = safeChildPath(versionsDirectory, filename);
    const info = await lstat(path);
    if (info.isSymbolicLink())
      throw new Error(`Version symlink is not allowed: ${filename}`);
    if (!info.isFile())
      throw new Error(`Version entry must be a regular file: ${filename}`);
    occupied.push(Number(match[1]));
    try {
      const saved = await secureJsonRead<WorkbenchProject>(root, path);
      const id = filename.slice(0, -5);
      const record = saved.versions?.find((candidate) => candidate.id === id);
      if (record) records.push(record);
    } catch {
      // A damaged regular file still reserves its ID, but cannot contribute history metadata.
    }
  }
  records.sort((left, right) => left.id.localeCompare(right.id));
  return { occupied, records };
};

const publishImmutableJson = async (
  directory: string,
  filename: string,
  value: unknown,
) => {
  const target = safeChildPath(directory, filename);
  const temporary = safeChildPath(
    directory,
    `.${filename}.${randomUUID()}.part`,
  );
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  try {
    await link(temporary, target);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
};

const readAuthorizations = async (
  root: string,
  workbench: string,
): Promise<SourceAuthorization[]> => {
  const path = safeChildPath(workbench, "source-authorizations.json");
  if (!(await exists(path))) return [];
  const document = await secureJsonRead<{
    schemaVersion: 1;
    sources: SourceAuthorization[];
  }>(root, path);
  if (document.schemaVersion !== 1 || !Array.isArray(document.sources))
    throw new Error("Invalid source authorization document");
  return document.sources.filter(
    (entry) =>
      entry &&
      typeof entry.id === "string" &&
      typeof entry.path === "string" &&
      typeof entry.fingerprint === "string" &&
      typeof entry.durationSeconds === "number" &&
      typeof entry.authorizedAt === "string",
  );
};

const canonicalMissingPath = async (candidate: string) => {
  try {
    return join(await realpath(dirname(candidate)), basename(candidate));
  } catch {
    return candidate;
  }
};

const unresolvedSource = (
  id: string,
  path: string,
  linkState: "missing" | "relink-required",
): SourceMedia => ({ id, originalPath: path, linkState });

const scanSource = async (
  root: string,
  id: string,
  edlPath: string,
  authorization?: SourceAuthorization,
): Promise<SourceMedia> => {
  const selectedPath = authorization?.path ?? edlPath;
  try {
    validateMediaCandidatePath(selectedPath);
  } catch {
    return unresolvedSource(id, selectedPath, "relink-required");
  }
  let canonical: string;
  try {
    canonical = await authorizeMediaFile(selectedPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return unresolvedSource(
        id,
        await canonicalMissingPath(selectedPath),
        "missing",
      );
    return unresolvedSource(id, selectedPath, "relink-required");
  }
  const projectMedia = isWithin(root, canonical);
  if (!projectMedia && (!authorization || authorization.path !== canonical))
    return unresolvedSource(id, canonical, "relink-required");
  const facts = await inspectMedia(canonical);
  const changed =
    authorization && authorization.fingerprint !== facts.fingerprint;
  return {
    id,
    originalPath: facts.path,
    durationSeconds: facts.durationSeconds,
    fingerprint: facts.fingerprint,
    linkState: changed ? "changed" : "linked",
    authorization: projectMedia ? "project" : "explicit",
  };
};

const fromEdl = async (
  root: string,
  authorizations: SourceAuthorization[],
): Promise<WorkbenchProject> => {
  const edl = await secureJsonRead<VideoUseEdl>(root, await findEdl(root));
  const sourceIds = Object.keys(edl.sources ?? {});
  if (sourceIds.length === 0) throw new Error("VideoUse EDL has no sources");
  const authorizationById = new Map(
    authorizations.map((entry) => [entry.id, entry]),
  );
  const sources = await Promise.all(
    sourceIds.map((id) =>
      scanSource(root, id, edl.sources[id]!, authorizationById.get(id)),
    ),
  );
  const project = createProject({
    name: basename(root),
    rootPath: root,
    sources,
    segments: edl.ranges.map((range, index) => ({
      id: `segment-${index + 1}-${randomUUID().slice(0, 8)}`,
      sourceId: range.source,
      sourceIn: range.start,
      sourceOut: range.end,
      reason: range.reason,
    })),
  });
  project.transcripts = await discoverTranscripts(root, sourceIds);
  return project;
};

const trustedProxyPath = async (
  root: string,
  source: SourceMedia,
  saved?: SourceMedia,
) => {
  if (
    !saved?.proxyPath ||
    !source.fingerprint ||
    saved.fingerprint !== source.fingerprint ||
    source.linkState !== "linked"
  )
    return undefined;
  try {
    const proxies = await ensureSecureDirectory(root, "workbench", "proxies");
    const info = await lstat(saved.proxyPath);
    if (info.isSymbolicLink() || !info.isFile()) return undefined;
    const canonical = await realpath(saved.proxyPath);
    const expected = await proxyPathFor(root, source);
    return isWithin(proxies, canonical) && canonical === expected
      ? canonical
      : undefined;
  } catch {
    return undefined;
  }
};

const mergeDraft = async (
  facts: WorkbenchProject,
  draft: WorkbenchProject,
): Promise<WorkbenchProject> => {
  const sources = await Promise.all(
    facts.sources.map(async (source) => {
      const saved = draft.sources.find(
        (candidate) => candidate.id === source.id,
      );
      const replaced =
        source.linkState === "linked" &&
        saved?.fingerprint &&
        saved.fingerprint !== source.fingerprint;
      const mergedSource: SourceMedia = {
        ...source,
        linkState: replaced ? "changed" : source.linkState,
      };
      return {
        ...mergedSource,
        proxyPath: await trustedProxyPath(facts.rootPath, mergedSource, saved),
      };
    }),
  );
  const merged: WorkbenchProject = {
    ...draft,
    schemaVersion: 1,
    projectId:
      typeof draft.projectId === "string" ? draft.projectId : facts.projectId,
    name: facts.name,
    rootPath: facts.rootPath,
    sources,
    transcripts: facts.transcripts,
    layout: normalizeLayout(draft.layout),
  };
  validateProjectTimeline(merged);
  return merged;
};

export const saveDraft = async (
  candidateRoot: string,
  project: WorkbenchProject,
) => {
  const root = await canonicalProjectRoot(candidateRoot);
  const { workbench } = await directories(root);
  const safeProject = { ...project, rootPath: root };
  validateProjectTimeline(safeProject);
  await atomicWriteJson(workbench, "working-draft.json", safeProject);
  await atomicWriteJson(workbench, "ui-state.json", safeProject.layout);
};

export const openProject = async (
  candidateRoot: string,
): Promise<WorkbenchProject> => {
  const root = await canonicalProjectRoot(candidateRoot);
  const { workbench, versions } = await directories(root);
  const facts = await fromEdl(root, await readAuthorizations(root, workbench));
  const draftPath = safeChildPath(workbench, "working-draft.json");
  const merged = (await exists(draftPath))
    ? await mergeDraft(
        facts,
        await secureJsonRead<WorkbenchProject>(root, draftPath),
      )
    : facts;
  const discovered = await discoverVersions(root, versions);
  const currentVersionId = discovered.records.some(
    (record) => record.id === merged.currentVersionId,
  )
    ? merged.currentVersionId
    : (discovered.records.at(-1)?.id ?? null);
  const project = { ...merged, versions: discovered.records, currentVersionId };
  await saveDraft(root, project);
  await atomicWriteJson(workbench, "project.json", project);
  return project;
};

export const authorizeProjectSource = async (
  candidateRoot: string,
  project: WorkbenchProject,
  sourceId: string,
  candidatePath: string,
) => {
  const root = await canonicalProjectRoot(candidateRoot);
  const { workbench } = await directories(root);
  const source = project.sources.find((entry) => entry.id === sourceId);
  if (!source) throw new Error("Unknown project source");
  const facts = await inspectMedia(candidatePath);
  const record: SourceAuthorization = {
    id: sourceId,
    path: facts.path,
    fingerprint: facts.fingerprint,
    durationSeconds: facts.durationSeconds,
    authorizedAt: new Date().toISOString(),
  };
  const existing = await readAuthorizations(root, workbench);
  await atomicWriteJson(workbench, "source-authorizations.json", {
    schemaVersion: 1,
    sources: [...existing.filter((entry) => entry.id !== sourceId), record],
  });
  const updated: WorkbenchProject = {
    ...project,
    sources: project.sources.map((entry) =>
      entry.id === sourceId
        ? {
            ...entry,
            originalPath: facts.path,
            durationSeconds: facts.durationSeconds,
            fingerprint: facts.fingerprint,
            linkState: "linked",
            authorization: isWithin(root, facts.path) ? "project" : "explicit",
            proxyPath: undefined,
          }
        : entry,
    ),
  };
  validateProjectTimeline(updated);
  await saveDraft(root, updated);
  return updated;
};

export const snapshot = async (
  candidateRoot: string,
  project: WorkbenchProject,
  summary: string,
) => {
  const root = await canonicalProjectRoot(candidateRoot);
  const { versions } = await directories(root);
  const discovered = await discoverVersions(root, versions);
  const id = `v${String(Math.max(0, ...discovered.occupied) + 1).padStart(3, "0")}`;
  const record = {
    id,
    name: `${id}｜${summary}`,
    parentVersionId: project.currentVersionId,
    createdAt: new Date().toISOString(),
    summary,
    durationSeconds: project.timeline.segments.at(-1)?.outputOut ?? 0,
  };
  const snapshotProject: WorkbenchProject = {
    ...project,
    rootPath: root,
    versions: [...discovered.records, record],
    currentVersionId: id,
  };
  validateProjectTimeline(snapshotProject);
  await publishImmutableJson(versions, `${id}.json`, snapshotProject);
  await saveDraft(root, snapshotProject);
  return record;
};

export const restoreVersion = async (
  candidateRoot: string,
  versionId: string,
): Promise<WorkbenchProject> => {
  const root = await canonicalProjectRoot(candidateRoot);
  if (!/^v\d{3,}$/.test(versionId)) throw new Error("Invalid version ID");
  const { workbench, versions } = await directories(root);
  const version = await secureJsonRead<WorkbenchProject>(
    root,
    safeChildPath(versions, `${versionId}.json`),
  );
  const facts = await fromEdl(root, await readAuthorizations(root, workbench));
  const restored = await mergeDraft(facts, {
    ...version,
    rootPath: root,
    currentVersionId: versionId,
  });
  await saveDraft(root, restored);
  return restored;
};

export const upsertExportRecord = async (
  candidateRoot: string,
  record: ExportRecord,
) => {
  const project = await openProject(candidateRoot);
  const updated = {
    ...project,
    exportHistory: [
      ...project.exportHistory.filter((entry) => entry.id !== record.id),
      record,
    ],
  };
  await saveDraft(candidateRoot, updated);
  return updated;
};
