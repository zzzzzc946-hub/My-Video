/* eslint-disable @remotion/warn-native-media-tag */
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AuditEvent,
  BackgroundTask,
  LayoutState,
  ProjectInspection,
  TimelineOperation,
  TimelineSegment,
  WorkbenchProject,
} from "../shared/model.js";
import type { TranscriptCue } from "../server/transcript.js";
import { DEFAULT_LAYOUT } from "../shared/layout.js";
import { outputToSourceTime, playbackProgress } from "./playback.js";
import { resolveWorkbenchApiOrigin } from "./api-origin.js";
import { snapTime } from "./editor.js";

declare global {
  interface Window {
    __WORKBENCH_API__?: string;
  }
}

const API_ORIGIN = resolveWorkbenchApiOrigin(window.__WORKBENCH_API__);
const API = `${API_ORIGIN}/api`;
const post = async <T,>(path: string, body?: unknown) => {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return response.json() as Promise<T>;
};
const projectDuration = (project: WorkbenchProject) =>
  project.timeline.segments.at(-1)?.outputOut ?? 0;
const formatTime = (seconds: number) => {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, "0")}:${String(Math.floor(safe % 60)).padStart(2, "0")}:${String(Math.floor((safe % 1) * 100)).padStart(2, "0")}`;
};
const filename = (path: string) => path.split(/[\\/]/).at(-1) ?? path;
const Icon = ({ name, alt = "" }: { name: string; alt?: string }) => (
  <img className="icon" src={`/icons/${name}.svg`} alt={alt} />
);
export const naturalEvent = (event: AuditEvent) => {
  const names: Record<string, string> = {
    "project.opened": "已打开项目并确认工作草稿",
    "source.authorized": "已授权并重新链接源素材",
    "transcript.bound": "已完成转写与素材绑定",
    "timeline.trim": "已修剪片段边界",
    "timeline.delete": "已从时间线移除片段",
    "timeline.restore": "已恢复删除的片段",
    "timeline.reorder": "已调整片段顺序",
    "timeline.split": "已在播放头处分割片段",
    "timeline.replace": "已恢复时间线编辑状态",
    "version.created": "已保存一个可回退检查点",
    "version.restored": "已恢复历史版本",
    "export.completed": "已生成稳定交付文件",
    "render.started": "已启动粗剪后台任务",
    "layout.updated": "已调整并保存工作区布局",
  };
  return names[event.type] ?? event.summary;
};
type TranscriptRow = {
  sourceId: string;
  start: number;
  end: number;
  text: string;
  firstCueIndex: number;
};
const sentenceRows = (cues: TranscriptCue[]) => {
  const rows: TranscriptRow[] = [];
  let current: TranscriptRow | null = null;
  cues.forEach((cue, index) => {
    if (!current || current.sourceId !== cue.sourceId) {
      if (current) rows.push(current);
      current = {
        sourceId: cue.sourceId,
        start: cue.start,
        end: cue.end,
        text: cue.text,
        firstCueIndex: index,
      };
      return;
    }
    current.text += cue.text;
    current.end = cue.end;
    if (/[。！？!?]$/.test(cue.text) || current.text.length >= 24) {
      rows.push(current);
      current = null;
    }
  });
  if (current) rows.push(current);
  return rows;
};

export const App = () => {
  const [project, setProject] = useState<WorkbenchProject | null>(null);
  const [root, setRoot] = useState(() => localStorage.getItem("videouse:last-root") ?? "");
  const [inspection, setInspection] = useState<(ProjectInspection & { inspectionDurationMs?: number }) | null>(null);
  const [selectedEdl, setSelectedEdl] = useState("");
  const [draftMode, setDraftMode] = useState<"continue" | "new" | "">("");
  const [health, setHealth] = useState<{ instanceId: string; projectRoot: string | null } | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [layout, setLayout] = useState<LayoutState>(DEFAULT_LAYOUT);
  const layoutRef = useRef(layout);
  const [message, setMessage] = useState("等待检测 VideoUse 项目");
  const [cues, setCues] = useState<TranscriptCue[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [taskLogs, setTaskLogs] = useState<Record<string, string>>({});
  const [relinkPaths, setRelinkPaths] = useState<Record<string, string>>({});
  const [bindingSources, setBindingSources] = useState<Record<string, string>>({});
  const [undoStack, setUndoStack] = useState<WorkbenchProject[]>([]);
  const [redoStack, setRedoStack] = useState<WorkbenchProject[]>([]);
  const [draggedSegmentId, setDraggedSegmentId] = useState<string | null>(null);
  const [trimPreview, setTrimPreview] = useState<
    Record<string, Pick<TimelineSegment, "sourceIn" | "sourceOut">>
  >({});
  const [activeTab, setActiveTab] = useState<"media" | "library" | "transcript">("media");
  const [search, setSearch] = useState("");
  const [playing, setPlaying] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const continueAcrossCut = useRef(false);
  const mapped = useMemo(
    () => project && outputToSourceTime(project.timeline.segments, playhead),
    [project, playhead],
  );
  const projectId = project?.projectId;
  const transcriptRows = useMemo(() => sentenceRows(cues), [cues]);

  const hydrateProject = (next: WorkbenchProject) => {
    setProject(next);
    setUndoStack([]);
    setRedoStack([]);
    layoutRef.current = next.layout;
    setLayout(next.layout);
    setRelinkPaths(Object.fromEntries(next.sources.map((source) => [source.id, source.originalPath])));
    setBindingSources(
      Object.fromEntries(
        (next.authority?.unresolvedTranscripts ?? []).map((issue) => [
          issue.path,
          issue.candidateSourceIds[0] ?? "",
        ]),
      ),
    );
  };

  useEffect(() => {
    fetch(`${API}/health`)
      .then(async (response) => {
        if (!response.ok) throw new Error("无法连接当前工作台实例");
        const next = (await response.json()) as { instanceId: string; projectRoot: string | null };
        setHealth(next);
        if (next.projectRoot) {
          const current = await fetch(`${API}/projects/current`);
          if (current.ok) {
            const opened = (await current.json()) as WorkbenchProject;
            setRoot(opened.rootPath);
            hydrateProject(opened);
            setMessage("已恢复当前实例绑定的项目");
          }
        }
      })
      .catch((error: Error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    const stream = new EventSource(`${API}/events`);
    stream.addEventListener("project.updated", (event) =>
      setProject(JSON.parse((event as MessageEvent).data) as WorkbenchProject),
    );
    stream.addEventListener("audit", (event) => {
      const item = JSON.parse((event as MessageEvent).data) as AuditEvent;
      setEvents((current) =>
        current.some((saved) => saved.id === item.id) ? current : [...current, item],
      );
    });
    stream.addEventListener("task.updated", (event) => {
      const item = JSON.parse((event as MessageEvent).data) as BackgroundTask;
      setTasks((current) => [...current.filter((task) => task.id !== item.id), item]);
      setMessage(`${item.kind}：${item.status}${item.error ? ` · ${item.error}` : ""}`);
    });
    return () => stream.close();
  }, []);

  useEffect(() => {
    if (!projectId) return;
    void Promise.all([
      fetch(`${API}/transcript`).then((response) => (response.ok ? response.json() : [])),
      fetch(`${API}/events/history`).then((response) => (response.ok ? response.json() : [])),
      fetch(`${API}/tasks`).then((response) => (response.ok ? response.json() : [])),
    ])
      .then(([nextCues, nextEvents, nextTasks]) => {
        setCues(nextCues as TranscriptCue[]);
        setEvents(nextEvents as AuditEvent[]);
        setTasks(nextTasks as BackgroundTask[]);
      })
      .catch(() => undefined);
  }, [projectId]);

  useEffect(() => {
    if (!mapped || !video.current) return;
    if (Math.abs(video.current.currentTime - mapped.sourceTime) > 0.08)
      video.current.currentTime = mapped.sourceTime;
    if (continueAcrossCut.current) {
      continueAcrossCut.current = false;
      void video.current.play();
    }
  }, [mapped]);

  const updateLayout = (next: LayoutState) => {
    layoutRef.current = next;
    setLayout(next);
  };
  const persistLayout = async () => {
    if (!project) return;
    const result = await post<WorkbenchProject | { error: string }>("/layout", {
      layout: layoutRef.current,
    });
    if ("error" in result) setMessage(result.error);
    else setProject(result);
  };
  const drag =
    (axis: "x" | "y", update: (fraction: number) => LayoutState) =>
    (event: React.PointerEvent) => {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const move = (pointer: PointerEvent) =>
        updateLayout(
          update(axis === "x" ? pointer.clientX / innerWidth : pointer.clientY / innerHeight),
        );
      const up = () => {
        removeEventListener("pointermove", move);
        removeEventListener("pointerup", up);
        void persistLayout();
      };
      addEventListener("pointermove", move);
      addEventListener("pointerup", up);
    };
  const resetLayout = () => {
    updateLayout(DEFAULT_LAYOUT);
    void persistLayout();
  };

  const inspect = async () => {
    setMessage("正在读取项目事实…");
    const result = await post<(ProjectInspection & { inspectionDurationMs?: number }) | { error: string }>(
      "/projects/inspect",
      { root },
    );
    if ("error" in result) {
      setMessage(result.error);
      return;
    }
    setInspection(result);
    setSelectedEdl("");
    setDraftMode(result.workingDraft.exists ? "" : "new");
    setMessage(`发现 ${result.edlCandidates.length} 个 EDL，请明确选择`);
  };
  const open = async () => {
    if (!inspection || !selectedEdl || !draftMode) {
      setMessage("请先选择 EDL 和草稿处理方式");
      return;
    }
    const result = await post<WorkbenchProject | { error: string }>("/projects/open", {
      root: inspection.rootPath,
      edlPath: selectedEdl,
      draftMode,
    });
    if ("error" in result) {
      setMessage(result.error);
      return;
    }
    localStorage.setItem("videouse:last-root", result.rootPath);
    hydrateProject(result);
    setMessage(draftMode === "continue" ? "已继续现有草稿" : "已创建新的隔离工作副本");
    const nextHealth = await fetch(`${API}/health`).then((response) => response.json()) as {
      instanceId: string;
      projectRoot: string | null;
    };
    setHealth(nextHealth);
  };

  const operate = async (operation: TimelineOperation, recordHistory = true) => {
    const before = project;
    const result = await post<WorkbenchProject | { error: string }>("/operations", { operation });
    if ("error" in result) setMessage(result.error);
    else {
      if (recordHistory && before) {
        setUndoStack((current) => [...current, before]);
        setRedoStack([]);
      }
      setProject(result);
    }
  };
  const restoreTimelineState = async (target: WorkbenchProject) => {
    const result = await post<WorkbenchProject | { error: string }>("/operations", {
      operation: {
        type: "replace",
        segments: target.timeline.segments,
        deletedSegments: target.deletedSegments,
      },
    });
    if ("error" in result) {
      setMessage(result.error);
      return null;
    }
    setProject(result);
    return result;
  };
  const undo = async () => {
    if (!project || undoStack.length === 0) return;
    const target = undoStack.at(-1)!;
    if (await restoreTimelineState(target)) {
      setUndoStack((current) => current.slice(0, -1));
      setRedoStack((current) => [...current, project]);
      setMessage("已撤销上一步时间线编辑");
    }
  };
  const redo = async () => {
    if (!project || redoStack.length === 0) return;
    const target = redoStack.at(-1)!;
    if (await restoreTimelineState(target)) {
      setRedoStack((current) => current.slice(0, -1));
      setUndoStack((current) => [...current, project]);
      setMessage("已重做时间线编辑");
    }
  };
  const beginTrim =
    (segment: TimelineSegment, edge: "in" | "out") =>
    (event: React.PointerEvent) => {
      if (!project) return;
      event.stopPropagation();
      event.preventDefault();
      const startX = event.clientX;
      const pixelsPerSecond = 80 * zoom;
      const sourceDuration =
        project.sources.find((source) => source.id === segment.sourceId)?.durationSeconds ??
        segment.sourceOut;
      const candidates = project.timeline.segments
        .filter((item) => item.sourceId === segment.sourceId && item.id !== segment.id)
        .flatMap((item) => [item.sourceIn, item.sourceOut]);
      let next = { sourceIn: segment.sourceIn, sourceOut: segment.sourceOut };
      const move = (pointer: PointerEvent) => {
        const delta = (pointer.clientX - startX) / pixelsPerSecond;
        next = edge === "in"
          ? {
              ...next,
              sourceIn: snapTime(
                Math.max(0, Math.min(segment.sourceOut - 0.01, segment.sourceIn + delta)),
                candidates,
                8 / pixelsPerSecond,
              ),
            }
          : {
              ...next,
              sourceOut: snapTime(
                Math.min(sourceDuration, Math.max(segment.sourceIn + 0.01, segment.sourceOut + delta)),
                candidates,
                8 / pixelsPerSecond,
              ),
            };
        setTrimPreview((current) => ({ ...current, [segment.id]: next }));
      };
      const up = () => {
        removeEventListener("pointermove", move);
        removeEventListener("pointerup", up);
        setTrimPreview((current) => {
          const copy = { ...current };
          delete copy[segment.id];
          return copy;
        });
        if (next.sourceIn !== segment.sourceIn || next.sourceOut !== segment.sourceOut)
          void operate({ type: "trim", segmentId: segment.id, ...next });
      };
      addEventListener("pointermove", move);
      addEventListener("pointerup", up);
    };
  const beginClipDrag =
    (segmentId: string) => (event: React.PointerEvent<HTMLElement>) => {
      if (!project || (event.target as HTMLElement).closest("button")) return;
      event.preventDefault();
      setDraggedSegmentId(segmentId);
      const up = (pointer: PointerEvent) => {
        removeEventListener("pointerup", up);
        setDraggedSegmentId(null);
        const target = document
          .elementFromPoint(pointer.clientX, pointer.clientY)
          ?.closest<HTMLElement>("[data-segment-id]");
        const index = target
          ? project.timeline.segments.findIndex(
              (segment) => segment.id === target.dataset.segmentId,
            )
          : -1;
        if (index >= 0 && target?.dataset.segmentId !== segmentId)
          void operate({ type: "reorder", segmentId, index });
      };
      addEventListener("pointerup", up);
    };
  const rememberTask = (task: BackgroundTask) =>
    setTasks((current) => [...current.filter((saved) => saved.id !== task.id), task]);
  const exportKind = async (kind: string) => {
    const result = await post<BackgroundTask | { path?: string; error?: string }>(`/export/${kind}`);
    if ("kind" in result) {
      rememberTask(result);
      setMessage(`任务 ${result.id}：${result.status}`);
    } else setMessage(result.error ?? `已生成：${result.path}`);
  };
  const startProxies = async () => {
    const task = await post<BackgroundTask | { error: string }>("/proxies/generate");
    if ("id" in task) {
      rememberTask(task);
      setMessage(`任务 ${task.id}：${task.status}`);
    } else setMessage(task.error);
  };
  const authorizeSource = async (sourceId: string) => {
    const result = await post<WorkbenchProject | { error: string }>(
      `/sources/${encodeURIComponent(sourceId)}/authorize`,
      { path: relinkPaths[sourceId] },
    );
    if ("error" in result) setMessage(result.error);
    else {
      setProject(result);
      setMessage(`${sourceId} 已授权并重新链接`);
    }
  };
  const bindTranscript = async (path: string) => {
    const sourceId = bindingSources[path];
    if (!sourceId) return;
    const result = await post<WorkbenchProject | { error: string }>("/transcripts/bind", {
      path,
      sourceId,
    });
    if ("error" in result) setMessage(result.error);
    else {
      setProject(result);
      setMessage(`逐字稿已绑定到 ${sourceId}`);
    }
  };
  const loadTaskLog = async (taskId: string) => {
    const response = await fetch(`${API}/tasks/${taskId}/log`);
    const result = (await response.json()) as { summary?: string; error?: string };
    setTaskLogs((current) => ({
      ...current,
      [taskId]: result.summary ?? result.error ?? "日志为空",
    }));
  };
  const seekTranscript = (row: TranscriptRow) => {
    if (!project) return;
    const segment = project.timeline.segments.find(
      (item) =>
        item.sourceId === row.sourceId && row.start >= item.sourceIn && row.start < item.sourceOut,
    );
    if (segment) setPlayhead(segment.outputIn + row.start - segment.sourceIn);
  };

  if (!project)
    return (
      <main className="launcher-shell">
        <section className="launcher-card">
          <div className="launcher-brand"><Icon name="sparkles" /><span>VideoUse</span></div>
          <h1>打开剪辑工作台</h1>
          <p>读取项目事实后，由你明确选择 EDL 和草稿分支。源素材不会被覆盖。</p>
          <label className="path-field">
            <span>VideoUse 项目目录</span>
            <div>
              <input
                aria-label="项目路径"
                value={root}
                onChange={(event) => setRoot(event.target.value)}
                placeholder="输入 VideoUse 项目绝对路径"
              />
              <button className="secondary" onClick={() => void inspect()}>检测项目</button>
            </div>
          </label>
          {inspection ? (
            <div className="onboarding-grid">
              <section>
                <h2>选择 EDL</h2>
                <div className="choice-list">
                  {inspection.edlCandidates.map((candidate) => (
                    <label key={candidate.path} className={selectedEdl === candidate.path ? "choice selected" : "choice"}>
                      <input
                        type="radio"
                        name="edl"
                        value={candidate.path}
                        checked={selectedEdl === candidate.path}
                        onChange={() => setSelectedEdl(candidate.path)}
                      />
                      <span><b>{candidate.filename}</b><small>{candidate.rangeCount} 个片段 · {formatTime(candidate.durationSeconds)} · {candidate.sourceCount} 个源</small></span>
                    </label>
                  ))}
                </div>
              </section>
              <section>
                <h2>工作副本</h2>
                {inspection.workingDraft.exists ? (
                  <div className="choice-list">
                    <label className={draftMode === "continue" ? "choice selected" : "choice"}>
                      <input type="radio" name="draft" checked={draftMode === "continue"} onChange={() => setDraftMode("continue")} />
                      <span><b>继续现有草稿</b><small>保留时间线编辑与版本历史</small></span>
                    </label>
                    <label className={draftMode === "new" ? "choice selected" : "choice"}>
                      <input type="radio" name="draft" checked={draftMode === "new"} onChange={() => setDraftMode("new")} />
                      <span><b>从选定 EDL 新建</b><small>先归档旧草稿，再建立隔离副本</small></span>
                    </label>
                  </div>
                ) : <p className="empty-note">未发现旧草稿，将创建新的隔离工作副本。</p>}
              </section>
              <button className="primary launch" disabled={!selectedEdl || !draftMode} onClick={() => void open()}>
                进入工作台
              </button>
            </div>
          ) : null}
          <footer>
            <span className={health ? "status-dot online" : "status-dot"} />
            {health ? `实例 ${health.instanceId.slice(0, 8)} · ${API_ORIGIN}` : "正在连接本机实例"}
            <output>{message}</output>
          </footer>
        </section>
      </main>
    );

  const total = projectDuration(project);
  const pixelsPerSecond = 80 * zoom;
  const timelineWidth = Math.max(980, total * pixelsPerSecond);
  const currentSource = mapped
    ? project.sources.find((source) => source.id === mapped.sourceId)
    : undefined;
  const filteredRows = transcriptRows.filter((row) =>
    `${row.text}${formatTime(row.start)}`.toLowerCase().includes(search.toLowerCase()),
  );
  const ticks = Array.from(
    { length: Math.ceil(total / Math.max(10, Math.ceil(total / 8))) + 1 },
    (_, index) => index * Math.max(10, Math.ceil(total / 8)),
  ).filter((tick) => tick <= total);

  return (
    <main
      className="app"
      data-testid="workbench"
      style={
        {
          "--left": `${layout.leftRatio * 100}%`,
          "--media": `${layout.mediaRatio * 100}%`,
          "--top": `${(1 - layout.timelineRatio) * 100}%`,
        } as React.CSSProperties
      }
    >
      <header className="project-bar">
        <div className="project-heading">
          <strong>{project.name}</strong>
          <span>{project.currentVersionId ?? "工作草稿"}</span>
        </div>
        <div className="header-status">
          <span className="status-dot online" />
          <span>实例 {health?.instanceId.slice(0, 8) ?? "连接中"}</span>
          <span className="status-separator" />
          <span>{project.sources.every((source) => source.linkState === "linked") ? "媒体已连接" : "需要重新链接"}</span>
        </div>
        <div className="header-controls">
          <button className="icon-button" aria-label="撤销" title="撤销" disabled={undoStack.length === 0} onClick={() => void undo()}><Icon name="undo-2" /></button>
          <button className="icon-button" aria-label="重做" title="重做" disabled={redoStack.length === 0} onClick={() => void redo()}><Icon name="redo-2" /></button>
          <button className="quiet-button" onClick={() => void startProxies()}><Icon name="film" />生成代理</button>
          <button className="quiet-button" onClick={() => post("/versions", { summary: "手动检查点" }).then(() => setMessage("已创建检查点"))}><Icon name="save" />保存检查点</button>
          <details className="more-menu">
            <summary>更多</summary>
            <div>
              <button onClick={() => void exportKind("render-preview")}>低清预览任务</button>
              <button onClick={() => void exportKind("render-rough-cut")}>生成粗剪</button>
              <button onClick={() => void exportKind("capcut-package")}>稳定剪映交付包</button>
              <button onClick={resetLayout}><Icon name="rotate-ccw" />恢复默认布局</button>
            </div>
          </details>
          <button className="primary export" onClick={() => void exportKind("videouse-edl")}>导出</button>
        </div>
      </header>

      <aside className="auditor" data-panel="auditor">
        <div className="panel-title ai-title"><span className="ai-mark"><Icon name="sparkles" /></span><div><h2>AI 剪辑师</h2><p>审阅摘要与操作留痕</p></div></div>
        <section className="ai-summary">
          <span className="eyebrow">本轮剪辑摘要</span>
          <h3>粗剪工作副本已就绪</h3>
          <p>当前由 {project.timeline.segments.length} 个片段组成，成片约 {formatTime(total)}。所有修改均写入隔离草稿，可通过检查点回退。</p>
          <div className="summary-stats">
            <span><b>{project.timeline.segments.length}</b>保留片段</span>
            <span><b>{project.deletedSegments.length}</b>已删除</span>
            <span><b>{project.versions.length}</b>检查点</span>
          </div>
        </section>
        <section className="event-feed">
          <div className="section-heading"><h3>最近调整</h3><span>{events.length} 条记录</span></div>
          {events.length ? events.slice(-12).reverse().map((event) => (
            <article key={event.id} className="event-item">
              <span className={`event-dot ${event.actor}`} />
              <div><b>{naturalEvent(event)}</b><small>{new Date(event.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</small></div>
            </article>
          )) : <p className="empty-note">操作后会在这里生成可读摘要。</p>}
        </section>
        {tasks.length ? (
          <section className="task-list">
            <div className="section-heading"><h3>后台任务</h3></div>
            {tasks.slice(-4).reverse().map((task) => (
              <article key={task.id} className="task-card" data-task-kind={task.kind} data-task-status={task.status}>
                <div><b>{task.kind === "proxy" ? "代理视频" : "粗剪输出"}</b><span className={`task-status ${task.status}`}>{task.status}</span></div>
                <p>{task.summary ?? task.error ?? "任务已进入队列"}</p>
                {task.outputPath ? <small data-task-output>{task.outputPath}</small> : null}
                <button onClick={() => void loadTaskLog(task.id)}>查看详细日志</button>
                {taskLogs[task.id] ? <pre data-task-log>{taskLogs[task.id]}</pre> : null}
              </article>
            ))}
          </section>
        ) : null}
        <details className="technical-log">
          <summary>详细日志与权威状态</summary>
          <dl>
            <dt>项目根</dt><dd>{project.rootPath}</dd>
            <dt>选定 EDL</dt><dd>{project.authority?.selectedEdlLabel ?? "旧草稿未记录"}</dd>
            <dt>草稿来源</dt><dd>{project.authority?.draftSource ?? "working-draft"}</dd>
            <dt>转写绑定</dt><dd>{project.authority?.transcriptBinding ?? "未记录"}</dd>
            <dt>当前输出</dt><dd><output data-testid="playhead">{playhead.toFixed(2)}</output>s {mapped ? `→ ${mapped.sourceId} ${mapped.sourceTime.toFixed(2)}s` : ""}</dd>
          </dl>
          {events.slice(-6).map((event) => <pre key={event.id}>{JSON.stringify(event, null, 2)}</pre>)}
        </details>
        <div className="codex-prompt"><span>在 Codex 中告诉我如何调整</span><small>网页仅用于观看、理解和操作留痕</small></div>
      </aside>

      <div aria-label="左栏分隔线" role="separator" className="divider vertical left" onDoubleClick={resetLayout} onPointerDown={drag("x", (fraction) => ({ ...layoutRef.current, leftRatio: Math.max(0.22, Math.min(0.36, fraction)) }))} />

      <section className="upper">
        <section className="media-panel" data-panel="media">
          <nav className="tabs" aria-label="素材面板">
            <button className={activeTab === "media" ? "active" : ""} onClick={() => setActiveTab("media")}>我的素材</button>
            <button className={activeTab === "library" ? "active" : ""} onClick={() => setActiveTab("library")}>资源库</button>
            <button className={activeTab === "transcript" ? "active" : ""} onClick={() => setActiveTab("transcript")}>逐字稿</button>
          </nav>
          <label className="search-field"><Icon name="search" /><input aria-label="搜索素材或逐字稿" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={activeTab === "transcript" ? "搜索逐字稿" : "搜索素材"} /></label>
          <div className="tab-content">
            {activeTab === "media" ? (
              <div className="source-list">
                {project.sources.filter((source) => `${source.id}${source.originalPath}`.toLowerCase().includes(search.toLowerCase())).map((source) => (
                  <article key={source.id} data-source-id={source.id} data-link-state={source.linkState} className="source-card">
                    <div className="media-thumb">{source.linkState === "linked" ? <video muted preload="metadata" src={`${API}/media/${encodeURIComponent(source.id)}`} /> : <Icon name="film" />}<span>{source.originalPath.split(".").at(-1)?.toUpperCase()}</span></div>
                    <div className="source-meta"><b>{filename(source.originalPath)}</b><small>{source.durationSeconds ? formatTime(source.durationSeconds) : "时长待重新链接"}</small><span className={`link-state ${source.linkState}`}>{source.proxyPath ? "代理就绪" : source.linkState === "linked" ? "源媒体已连接" : "需要重新链接"}</span></div>
                    {source.linkState !== "linked" ? <div className="relink-box"><input aria-label={`${source.id} 重新链接路径`} value={relinkPaths[source.id] ?? source.originalPath} onChange={(event) => setRelinkPaths((current) => ({ ...current, [source.id]: event.target.value }))} /><button onClick={() => void authorizeSource(source.id)}>授权并重新链接</button></div> : null}
                  </article>
                ))}
              </div>
            ) : null}
            {activeTab === "library" ? <div className="library-empty"><Icon name="film" /><b>资源库扩展端口</b><p>为后续 B-roll、贴纸和品牌资产预留，本版不伪造在线资源。</p></div> : null}
            {activeTab === "transcript" ? (
              <div className="transcript-list" data-testid="transcript">
                {(project.authority?.unresolvedTranscripts ?? []).map((issue) => (
                  <article key={issue.path} className="binding-card"><b>{issue.label}</b><p>无法自动判断对应素材，请明确选择。</p><select aria-label={`${issue.label} 绑定素材`} value={bindingSources[issue.path] ?? ""} onChange={(event) => setBindingSources((current) => ({ ...current, [issue.path]: event.target.value }))}><option value="">选择素材</option>{issue.candidateSourceIds.map((sourceId) => <option key={sourceId}>{sourceId}</option>)}</select><button onClick={() => void bindTranscript(issue.path)}>确认绑定</button></article>
                ))}
                {filteredRows.length ? filteredRows.map((row, index) => (
                  <button className="transcript-row" data-cue-index={row.firstCueIndex} data-cue-start={row.start} key={`${row.sourceId}-${row.start}-${index}`} onClick={() => seekTranscript(row)}><time>{formatTime(row.start)}</time><span>{row.text}</span></button>
                )) : <p className="empty-note">未发现匹配的逐字稿句段。</p>}
              </div>
            ) : null}
          </div>
        </section>

        <div aria-label="素材播放器分隔线" role="separator" className="divider vertical middle" onDoubleClick={resetLayout} onPointerDown={drag("x", (fraction) => { const available = 1 - layoutRef.current.leftRatio; return { ...layoutRef.current, mediaRatio: Math.max(0.25, Math.min(0.46, (fraction - layoutRef.current.leftRatio) / available)) }; })} />

        <section className="player" data-panel="player">
          <div className="player-heading"><div><span className="eyebrow">预览</span><h2>{mapped ? project.timeline.segments.find((segment) => segment.id === mapped.segmentId)?.reason ?? filename(currentSource?.originalPath ?? "当前片段") : "空时间线"}</h2></div><span>{formatTime(playhead)} / {formatTime(total)}</span></div>
          <div className="screen">
            {mapped && currentSource?.linkState === "linked" ? (
              <video
                data-testid="player-video"
                ref={video}
                key={mapped.sourceId}
                src={`${API}/media/${encodeURIComponent(mapped.sourceId)}`}
                playsInline
                preload="metadata"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={(event) => {
                  const wasPlaying = !event.currentTarget.paused;
                  const progress = playbackProgress(project.timeline.segments, mapped.segmentId, event.currentTarget.currentTime);
                  if (!progress) return;
                  if (progress.reachedCut && progress.nextSegmentId && wasPlaying) continueAcrossCut.current = true;
                  setPlayhead(progress.outputTime);
                }}
              />
            ) : <div className="source-unavailable" data-testid="source-unavailable"><Icon name="film" /><strong>{mapped ? "素材待授权或重新链接" : "空时间线"}</strong></div>}
          </div>
          <div className="player-controls">
            <button className="play-button" aria-label={playing ? "暂停" : "播放"} onClick={() => { if (!video.current) return; if (video.current.paused) void video.current.play(); else video.current.pause(); }}>{playing ? "暂停" : "播放"}</button>
            <input aria-label="时间线播放头" className="scrub" type="range" min="0" max={Math.max(total, 0.01)} step="0.01" value={playhead} onChange={(event) => setPlayhead(Number(event.target.value))} />
            <span>{zoom.toFixed(1)}×</span>
          </div>
        </section>
      </section>

      <div aria-label="时间线分隔线" role="separator" className="divider horizontal" onDoubleClick={resetLayout} onPointerDown={drag("y", (fraction) => ({ ...layoutRef.current, timelineRatio: Math.max(0.24, Math.min(0.56, 1 - fraction)) }))} />

      <section className="timeline" data-panel="timeline">
        <div className="timeline-toolbar">
          <div className="tool-group"><button className="tool active" title="选择工具">选择</button><button className="tool" title="在播放头处分割" onClick={() => { if (!mapped) return; const segment = project.timeline.segments.find((item) => item.id === mapped.segmentId); if (!segment || playhead <= segment.outputIn + 0.01 || playhead >= segment.outputOut - 0.01) return; void operate({ type: "split", segmentId: segment.id, sourceTime: segment.sourceIn + playhead - segment.outputIn }); }}><Icon name="scissors" />分割</button></div>
          <div className="timeline-time"><b>{formatTime(playhead)}</b><span>输出时间</span></div>
          <div className="zoom-controls"><button aria-label="缩小时间线" onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))))}><Icon name="zoom-out" /></button><input aria-label="时间线缩放" type="range" min="0.5" max="4" step="0.1" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><button aria-label="放大时间线" onClick={() => setZoom((value) => Math.min(4, Number((value + 0.25).toFixed(2))))}><Icon name="zoom-in" /></button></div>
        </div>
        <div className="timeline-scroll">
          <div className="timeline-stage" style={{ width: `${timelineWidth + 88}px` }}>
            <div className="ruler-row"><div className="ruler-head" /><div className="time-ruler" style={{ width: `${timelineWidth}px` }}>{ticks.map((tick) => <span key={tick} style={{ left: `${tick * pixelsPerSecond}px` }}>{formatTime(tick).slice(0, 5)}</span>)}</div></div>
            <div className="track-row video-track"><div className="track-head"><b>V1</b><span>视频 1</span></div><div className="track-content" style={{ width: `${timelineWidth}px` }}>{project.timeline.segments.map((segment) => { const preview = trimPreview[segment.id] ?? segment; return <article aria-label={`片段 ${segment.id}`} data-segment-id={segment.id} data-dragging={draggedSegmentId === segment.id || undefined} key={segment.id} className="clip video-clip" style={{ width: `${(preview.sourceOut - preview.sourceIn) * pixelsPerSecond}px` }} onClick={() => setPlayhead(segment.outputIn)} onPointerDown={beginClipDrag(segment.id)}><button className="trim-handle in" aria-label={`${segment.id} 入点手柄`} onPointerDown={beginTrim(segment, "in")} /><b>{segment.reason ?? segment.sourceId}</b><small>{formatTime(preview.sourceIn)}–{formatTime(preview.sourceOut)}</small><div className="clip-actions"><button title="删除片段" onClick={(event) => { event.stopPropagation(); void operate({ type: "delete", segmentId: segment.id, reason: "manual" }); }}><Icon name="trash-2" /></button></div><button className="trim-handle out" aria-label={`${segment.id} 出点手柄`} onPointerDown={beginTrim(segment, "out")} /></article>; })}</div></div>
            <div className="track-row audio-track"><div className="track-head"><b>A1</b><span>音频 1</span></div><div className="track-content" style={{ width: `${timelineWidth}px` }}>{project.timeline.segments.map((segment) => <article key={segment.id} className="clip audio-clip" style={{ width: `${(segment.sourceOut - segment.sourceIn) * pixelsPerSecond}px` }}><b>{segment.sourceId}</b></article>)}</div></div>
            <div className="playhead-line" style={{ left: `${88 + playhead * pixelsPerSecond}px` }}><span /></div>
          </div>
        </div>
        <div className="timeline-footer">
          <div className="deleted-strip"><b>已删除</b>{project.deletedSegments.length ? project.deletedSegments.map((segment) => <button key={segment.id} onClick={() => void operate({ type: "restore", segmentId: segment.id })}>恢复 {segment.reason ?? segment.id}</button>) : <span>暂无</span>}</div>
          <div className="version-strip"><b>版本</b>{project.versions.slice(-4).map((version) => <button key={version.id} onClick={async () => { const restored = await post<WorkbenchProject>(`/versions/${version.id}`); hydrateProject(restored); setMessage(`已恢复 ${version.id}`); }}>恢复 {version.id}</button>)}</div>
        </div>
      </section>
    </main>
  );
};
