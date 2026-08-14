import { randomUUID } from "node:crypto";
import {
  access,
  link,
  lstat,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { createProject, validateProjectTimeline } from "../shared/timeline.js";
import type {
  ExportRecord,
  EdlCandidate,
  ProjectInspection,
  SourceAuthorization,
  SourceMedia,
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
import { discoverTranscriptBindings } from "./transcript.js";

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

const discoverEdlCandidates = async (root: string): Promise<EdlCandidate[]> => {
  const candidates: EdlCandidate[] = [];
  for (const filename of (await readdir(root)).filter((entry) => /^edl.*\.json$/i.test(entry)).sort()) {
    const path = safeChildPath(root, filename);
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error("VideoUse EDL must be a regular file inside the project root");
    const canonical = await realpath(path);
    const edl = await secureJsonRead<VideoUseEdl>(root, canonical);
    const fileStat = await stat(canonical);
    const ranges = Array.isArray(edl.ranges) ? edl.ranges : [];
    candidates.push({
      filename,
      path: canonical,
      modifiedAt: fileStat.mtime.toISOString(),
      sizeBytes: fileStat.size,
      sourceCount: Object.keys(edl.sources ?? {}).length,
      rangeCount: ranges.length,
      durationSeconds: Number.isFinite(edl.total_duration_s)
        ? edl.total_duration_s
        : ranges.reduce((total, range) => total + Math.max(0, Number(range.end) - Number(range.start)), 0),
    });
  }
  if (candidates.length === 0) throw new Error("No VideoUse EDL found in selected project");
  return candidates;
};

const selectEdl = async (root: string, requested?: string) => {
  const candidates = await discoverEdlCandidates(root);
  if (!requested) {
    if (candidates.length !== 1) throw new Error("Select an EDL explicitly before opening this project");
    return candidates[0]!;
  }
  let canonical: string;
  try { canonical = await realpath(requested); } catch { throw new Error("Selected EDL does not exist"); }
  const selected = candidates.find((candidate) => candidate.path === canonical);
  if (!selected) throw new Error("Selected EDL must be one of this project's discovered candidates");
  return selected;
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
  selectedEdl: EdlCandidate,
): Promise<WorkbenchProject> => {
  const edl = await secureJsonRead<VideoUseEdl>(root, selectedEdl.path);
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
  const transcriptBinding = await discoverTranscriptBindings(root, sources);
  project.transcripts = transcriptBinding.references;
  project.authority = {
    selectedEdlPath: selectedEdl.path,
    selectedEdlLabel: selectedEdl.filename,
    draftSource: "selected-edl",
    transcriptBinding: transcriptBinding.status,
    unresolvedTranscripts: transcriptBinding.unresolved,
  };
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
    transcripts: facts.transcripts.map((reference) => {
      const saved = draft.transcripts.find((candidate) => candidate.path === reference.path);
      return reference.sourceId ? reference : (saved ?? reference);
    }),
    layout: normalizeLayout(draft.layout),
    authority: {
      ...facts.authority!,
      draftSource: "working-draft",
      transcriptBinding: facts.authority?.transcriptBinding === "needs-selection" && draft.authority?.transcriptBinding === "manual"
        ? "manual"
        : facts.authority!.transcriptBinding,
    },
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

export const inspectProject = async (candidateRoot: string): Promise<ProjectInspection> => {
  const root = await canonicalProjectRoot(candidateRoot);
  const edlCandidates = await discoverEdlCandidates(root);
  const draftPath = join(root, "workbench", "working-draft.json");
  let draft: WorkbenchProject | undefined;
  if (await exists(draftPath)) draft = await secureJsonRead<WorkbenchProject>(root, draftPath);
  return {
    rootPath: root,
    name: basename(root),
    edlCandidates,
    workingDraft: {
      exists: Boolean(draft),
      selectedEdlPath: draft?.authority?.selectedEdlPath,
      currentVersionId: draft?.currentVersionId,
    },
  };
};

export type OpenProjectOptions = { edlPath?: string; draftMode?: "continue" | "new" };

const archiveDraft = async (root: string, draft: WorkbenchProject) => {
  const drafts = await ensureSecureDirectory(root, "workbench", "drafts");
  const filename = `draft-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.json`;
  await publishImmutableJson(drafts, filename, { ...draft, rootPath: root });
};

export const openProject = async (
  candidateRoot: string,
  options: OpenProjectOptions = {},
): Promise<WorkbenchProject> => {
  const root = await canonicalProjectRoot(candidateRoot);
  const { workbench, versions } = await directories(root);
  const draftPath = safeChildPath(workbench, "working-draft.json");
  const savedDraft = (await exists(draftPath)) ? await secureJsonRead<WorkbenchProject>(root, draftPath) : undefined;
  const requestedEdl = options.edlPath ?? savedDraft?.authority?.selectedEdlPath;
  const selectedEdl = await selectEdl(root, requestedEdl);
  const facts = await fromEdl(root, await readAuthorizations(root, workbench), selectedEdl);
  const draftMode = options.draftMode ?? (savedDraft ? "continue" : "new");
  if (draftMode === "continue" && savedDraft?.authority?.selectedEdlPath && savedDraft.authority.selectedEdlPath !== selectedEdl.path)
    throw new Error("The selected EDL differs from the existing draft; create a new isolated draft instead");
  if (draftMode === "new" && savedDraft) await archiveDraft(root, savedDraft);
  const merged = draftMode === "continue" && savedDraft ? await mergeDraft(facts, savedDraft) : facts;
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

export const bindProjectTranscript = async (
  candidateRoot: string,
  project: WorkbenchProject,
  transcriptPath: string,
  sourceId: string,
) => {
  const root = await canonicalProjectRoot(candidateRoot);
  if (!project.sources.some((source) => source.id === sourceId))
    throw new Error("Unknown transcript source");
  const canonical = await realpath(transcriptPath);
  const transcriptsRoot = await realpath(join(root, "transcripts"));
  if (!isWithin(transcriptsRoot, canonical))
    throw new Error("Transcript must remain inside the project transcript directory");
  const info = await lstat(canonical);
  if (info.isSymbolicLink() || !info.isFile())
    throw new Error("Transcript must be a regular file");
  const updated: WorkbenchProject = {
    ...project,
    transcripts: project.transcripts.map((reference) =>
      reference.path === canonical ? { ...reference, sourceId } : reference,
    ),
    authority: project.authority
      ? {
          ...project.authority,
          transcriptBinding: "manual",
          unresolvedTranscripts: project.authority.unresolvedTranscripts.filter(
            (issue) => issue.path !== canonical,
          ),
        }
      : project.authority,
  };
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
  const selectedEdl = await selectEdl(root, version.authority?.selectedEdlPath);
  const facts = await fromEdl(root, await readAuthorizations(root, workbench), selectedEdl);
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
