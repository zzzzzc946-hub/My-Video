/* eslint-disable @remotion/warn-native-media-tag */
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AuditEvent,
  BackgroundTask,
  LayoutState,
  TimelineOperation,
  TimelineSegment,
  WorkbenchProject,
} from "../shared/model.js";
import { DEFAULT_LAYOUT } from "../shared/layout.js";
import { outputToSourceTime, playbackProgress } from "./playback.js";
import { resolveWorkbenchApiOrigin } from "./api-origin.js";
import { snapTime } from "./editor.js";
import type { TranscriptCue } from "../server/transcript.js";

declare global {
  interface Window {
    __WORKBENCH_API__?: string;
  }
}
const API = `${resolveWorkbenchApiOrigin(window.__WORKBENCH_API__)}/api`;
const post = async <T,>(path: string, body?: unknown) =>
  (
    await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
  ).json() as Promise<T>;
const duration = (project: WorkbenchProject) =>
  project.timeline.segments.at(-1)?.outputOut ?? 0;

export const App = () => {
  const [project, setProject] = useState<WorkbenchProject | null>(null);
  const [root, setRoot] = useState("");
  const [playhead, setPlayhead] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [layout, setLayout] = useState<LayoutState>(DEFAULT_LAYOUT);
  const layoutRef = useRef(layout);
  const [message, setMessage] = useState("等待打开 VideoUse 项目");
  const [cues, setCues] = useState<TranscriptCue[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [taskLogs, setTaskLogs] = useState<Record<string, string>>({});
  const [relinkPaths, setRelinkPaths] = useState<Record<string, string>>({});
  const [undoStack, setUndoStack] = useState<WorkbenchProject[]>([]);
  const [redoStack, setRedoStack] = useState<WorkbenchProject[]>([]);
  const [draggedSegmentId, setDraggedSegmentId] = useState<string | null>(null);
  const [trimPreview, setTrimPreview] = useState<
    Record<string, Pick<TimelineSegment, "sourceIn" | "sourceOut">>
  >({});
  const video = useRef<HTMLVideoElement>(null);
  const continueAcrossCut = useRef(false);
  const mapped = useMemo(
    () => project && outputToSourceTime(project.timeline.segments, playhead),
    [project, playhead],
  );
  const projectId = project?.projectId;

  const updateLayout = (next: LayoutState) => {
    layoutRef.current = next;
    setLayout(next);
  };
  const persistLayout = async () => {
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
          update(
            axis === "x"
              ? pointer.clientX / innerWidth
              : pointer.clientY / innerHeight,
          ),
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

  useEffect(() => {
    const stream = new EventSource(`${API}/events`);
    stream.addEventListener("project.updated", (event) =>
      setProject(JSON.parse((event as MessageEvent).data)),
    );
    stream.addEventListener("audit", (event) => {
      const item = JSON.parse((event as MessageEvent).data) as AuditEvent;
      setEvents((current) =>
        current.some((saved) => saved.id === item.id)
          ? current
          : [...current, item],
      );
    });
    stream.addEventListener("task.updated", (event) => {
      const item = JSON.parse((event as MessageEvent).data) as BackgroundTask;
      setTasks((current) => [
        ...current.filter((task) => task.id !== item.id),
        item,
      ]);
      setMessage(
        `${item.kind}：${item.status}${item.error ? ` · ${item.error}` : ""}`,
      );
    });
    return () => stream.close();
  }, []);
  useEffect(() => {
    if (projectId)
      fetch(`${API}/transcript`)
        .then((response) => (response.ok ? response.json() : []))
        .then(setCues)
        .catch(() => setCues([]));
  }, [projectId]);
  useEffect(() => {
    if (projectId)
      fetch(`${API}/events/history`)
        .then((response) => (response.ok ? response.json() : []))
        .then(setEvents)
        .catch(() => setEvents([]));
  }, [projectId]);
  useEffect(() => {
    if (projectId)
      fetch(`${API}/tasks`)
        .then((response) => (response.ok ? response.json() : []))
        .then(setTasks)
        .catch(() => setTasks([]));
  }, [projectId]);
  useEffect(() => {
    if (!mapped || !video.current) return;
    video.current.currentTime = mapped.sourceTime;
    if (continueAcrossCut.current) {
      continueAcrossCut.current = false;
      void video.current.play();
    }
  }, [mapped]);

  const open = async () => {
    const result = await post<WorkbenchProject | { error: string }>(
      "/projects/open",
      { root },
    );
    if ("error" in result) setMessage(result.error);
    else {
      setProject(result);
      setUndoStack([]);
      setRedoStack([]);
      updateLayout(result.layout);
      setRelinkPaths(
        Object.fromEntries(
          result.sources.map((source) => [source.id, source.originalPath]),
        ),
      );
      setMessage("已打开并建立工作台草稿");
    }
  };
  const operate = async (
    operation: TimelineOperation,
    recordHistory = true,
  ) => {
    const before = project;
    const result = await post<WorkbenchProject | { error: string }>(
      "/operations",
      { operation },
    );
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
    const result = await post<WorkbenchProject | { error: string }>(
      "/operations",
      {
        operation: {
          type: "replace",
          segments: target.timeline.segments,
          deletedSegments: target.deletedSegments,
        },
      },
    );
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
        project.sources.find((source) => source.id === segment.sourceId)
          ?.durationSeconds ?? segment.sourceOut;
      const candidates = project.timeline.segments
        .filter(
          (item) =>
            item.sourceId === segment.sourceId && item.id !== segment.id,
        )
        .flatMap((item) => [item.sourceIn, item.sourceOut]);
      let next = { sourceIn: segment.sourceIn, sourceOut: segment.sourceOut };
      const move = (pointer: PointerEvent) => {
        const delta = (pointer.clientX - startX) / pixelsPerSecond;
        if (edge === "in")
          next = {
            ...next,
            sourceIn: snapTime(
              Math.max(
                0,
                Math.min(segment.sourceOut - 0.01, segment.sourceIn + delta),
              ),
              candidates,
              8 / pixelsPerSecond,
            ),
          };
        else
          next = {
            ...next,
            sourceOut: snapTime(
              Math.min(
                sourceDuration,
                Math.max(segment.sourceIn + 0.01, segment.sourceOut + delta),
              ),
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
        if (
          next.sourceIn !== segment.sourceIn ||
          next.sourceOut !== segment.sourceOut
        )
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
    setTasks((current) => [
      ...current.filter((saved) => saved.id !== task.id),
      task,
    ]);
  const exportKind = async (kind: string) => {
    const result = await post<
      BackgroundTask | { path?: string; error?: string }
    >(`/export/${kind}`);
    if ("kind" in result) {
      rememberTask(result);
      setMessage(`任务 ${result.id}：${result.status}`);
    } else setMessage(result.error ?? `已生成：${result.path}`);
  };
  const startProxies = async () => {
    const task = await post<BackgroundTask | { error: string }>(
      "/proxies/generate",
    );
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
  const loadTaskLog = async (taskId: string) => {
    const response = await fetch(`${API}/tasks/${taskId}/log`);
    const result = (await response.json()) as {
      summary?: string;
      error?: string;
    };
    setTaskLogs((current) => ({
      ...current,
      [taskId]: result.summary ?? result.error ?? "日志为空",
    }));
  };

  if (!project)
    return (
      <main className="launcher">
        <h1>VideoUse Workbench</h1>
        <p>本地只读审阅台与非破坏性粗剪编辑器</p>
        <input
          aria-label="项目路径"
          value={root}
          onChange={(event) => setRoot(event.target.value)}
          placeholder="输入 VideoUse 项目绝对路径"
        />
        <button onClick={open}>打开项目</button>
        <small>{message}</small>
      </main>
    );
  const total = duration(project);
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
      <header>
        <strong>{project.name}</strong>
        <span>本机已连接 · {project.currentVersionId ?? "草稿"}</span>
        <button
          aria-label="撤销"
          disabled={undoStack.length === 0}
          onClick={() => void undo()}
        >
          撤销
        </button>
        <button
          aria-label="重做"
          disabled={redoStack.length === 0}
          onClick={() => void redo()}
        >
          重做
        </button>
        <button onClick={startProxies}>生成代理</button>
        <button
          onClick={() =>
            post("/versions", { summary: "手动检查点" }).then(() =>
              setMessage("已创建检查点"),
            )
          }
        >
          保存版本
        </button>
        <button onClick={() => exportKind("videouse-edl")}>导出 EDL</button>
        <button onClick={() => exportKind("render-preview")}>
          低清预览任务
        </button>
        <button onClick={() => exportKind("render-rough-cut")}>生成粗剪</button>
        <button onClick={() => exportKind("capcut-package")}>剪映交付包</button>
        <button onClick={resetLayout}>恢复默认布局</button>
      </header>
      <aside className="auditor" data-panel="auditor">
        <h2>AI 剪辑师</h2>
        <p>只读操作留痕</p>
        <article>
          <b>当前输出时间</b>
          <br />
          <output data-testid="playhead">{playhead.toFixed(2)}</output>s{" "}
          {mapped
            ? `→ ${mapped.sourceId} ${mapped.sourceTime.toFixed(2)}s`
            : ""}
        </article>
        <article>
          <b>真实事件</b>
          {events.slice(-8).map((event) => (
            <div key={event.id}>
              <small>
                {event.actor} · {event.type}
              </small>
              <br />
              {event.summary}
            </div>
          ))}
        </article>
        <article>
          <b>后台任务</b>
          {tasks.slice(-5).map((task) => (
            <div
              key={task.id}
              className="task-card"
              data-task-kind={task.kind}
              data-task-status={task.status}
            >
              <small>{task.kind}</small>
              <br />
              <b>{task.status}</b>
              {task.summary ? <span> · {task.summary}</span> : null}
              {task.outputPath ? (
                <small data-task-output>{task.outputPath}</small>
              ) : null}
              {task.error ? (
                <small className="error">{task.error}</small>
              ) : null}
              <button onClick={() => loadTaskLog(task.id)}>查看日志</button>
              {taskLogs[task.id] ? (
                <pre data-task-log>{taskLogs[task.id]}</pre>
              ) : null}
            </div>
          ))}
        </article>
        <article>
          <b>状态</b>
          <br />
          {message}
        </article>
        <h3>逐字稿</h3>
        <div data-testid="transcript">
          {cues.length ? (
            cues.map((cue, index) => (
              <button
                data-cue-index={index}
                data-cue-start={cue.start}
                key={`${cue.sourceId}-${index}`}
                onClick={() => {
                  const segment = project.timeline.segments.find(
                    (item) =>
                      item.sourceId === cue.sourceId &&
                      cue.start >= item.sourceIn &&
                      cue.start < item.sourceOut,
                  );
                  if (segment)
                    setPlayhead(
                      segment.outputIn + cue.start - segment.sourceIn,
                    );
                }}
              >
                {cue.text}{" "}
              </button>
            ))
          ) : (
            <p className="muted">未发现可引用逐字稿</p>
          )}
        </div>
      </aside>
      <div
        aria-label="左栏分隔线"
        role="separator"
        className="divider vertical left"
        onDoubleClick={resetLayout}
        onPointerDown={drag("x", (fraction) => ({
          ...layoutRef.current,
          leftRatio: Math.max(0.16, Math.min(0.38, fraction)),
        }))}
      />
      <section className="upper">
        <section className="media" data-panel="media">
          <h2>素材</h2>
          <div className="source-list">
            {project.sources.map((source) => (
              <div
                key={source.id}
                data-source-id={source.id}
                data-link-state={source.linkState}
              >
                <b>{source.id}</b>
                <span>{source.proxyPath ? "代理就绪" : source.linkState}</span>
                <small>{source.originalPath}</small>
                {source.linkState !== "linked" ? (
                  <>
                    <input
                      aria-label={`${source.id} 重新链接路径`}
                      value={relinkPaths[source.id] ?? source.originalPath}
                      onChange={(event) =>
                        setRelinkPaths((current) => ({
                          ...current,
                          [source.id]: event.target.value,
                        }))
                      }
                    />
                    <button onClick={() => authorizeSource(source.id)}>
                      授权并重新链接
                    </button>
                  </>
                ) : null}
              </div>
            ))}
          </div>
          <h3>已删除片段</h3>
          {project.deletedSegments.map((segment) => (
            <button
              key={segment.id}
              onClick={() =>
                operate({ type: "restore", segmentId: segment.id })
              }
            >
              恢复 {segment.id}
            </button>
          ))}
          <h3>版本</h3>
          {project.versions.map((version) => (
            <button
              key={version.id}
              onClick={async () => {
                const restored = await post<WorkbenchProject>(
                  `/versions/${version.id}`,
                );
                setProject(restored);
                setUndoStack([]);
                setRedoStack([]);
                setMessage(`已恢复 ${version.id}`);
              }}
            >
              恢复版本 {version.id}
            </button>
          ))}
        </section>
        <div
          aria-label="素材播放器分隔线"
          role="separator"
          className="divider vertical middle"
          onDoubleClick={resetLayout}
          onPointerDown={drag("x", (fraction) => {
            const upperStart = layoutRef.current.leftRatio;
            const available = 1 - upperStart;
            return {
              ...layoutRef.current,
              mediaRatio: Math.max(
                0.2,
                Math.min(0.7, (fraction - upperStart) / available),
              ),
            };
          })}
        />
        <section className="player" data-panel="player">
          <h2>播放器</h2>
          <div className="screen">
            {mapped ? (
              (() => {
                const source = project.sources.find(
                  (item) => item.id === mapped.sourceId,
                );
                return source?.linkState === "linked" ? (
                  <video
                    data-testid="player-video"
                    ref={video}
                    key={mapped.sourceId}
                    controls
                    src={`${API}/media/${encodeURIComponent(mapped.sourceId)}`}
                    onTimeUpdate={(event) => {
                      const wasPlaying = !event.currentTarget.paused;
                      const progress = playbackProgress(
                        project.timeline.segments,
                        mapped.segmentId,
                        event.currentTarget.currentTime,
                      );
                      if (progress) {
                        if (
                          progress.reachedCut &&
                          progress.nextSegmentId &&
                          wasPlaying
                        )
                          continueAcrossCut.current = true;
                        setPlayhead(progress.outputTime);
                      }
                    }}
                  />
                ) : (
                  <strong data-testid="source-unavailable">
                    素材待授权或重新链接
                  </strong>
                );
              })()
            ) : (
              <strong>空时间线</strong>
            )}
          </div>
          <input
            aria-label="时间线播放头"
            className="scrub"
            type="range"
            min="0"
            max={Math.max(total, 0.01)}
            step="0.01"
            value={playhead}
            onChange={(event) => setPlayhead(Number(event.target.value))}
          />
        </section>
      </section>
      <div
        aria-label="时间线分隔线"
        role="separator"
        className="divider horizontal"
        onDoubleClick={resetLayout}
        onPointerDown={drag("y", (fraction) => ({
          ...layoutRef.current,
          timelineRatio: Math.max(0.2, Math.min(0.58, 1 - fraction)),
        }))}
      />
      <section className="timeline" data-panel="timeline">
        <div>
          <h2>时间线 · A/V 主轨</h2>
          <label>
            缩放{" "}
            <input
              type="range"
              min="0.5"
              max="4"
              step="0.1"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
          </label>
        </div>
        <div
          className="ruler"
          style={{ minWidth: `${Math.max(100, total * 80 * zoom)}px` }}
        >
          {project.timeline.segments.map((segment) => {
            const preview = trimPreview[segment.id] ?? segment;
            const canSplit =
              playhead > segment.outputIn + 0.01 &&
              playhead < segment.outputOut - 0.01;
            return (
              <article
                aria-label={`片段 ${segment.id}`}
                data-segment-id={segment.id}
                data-dragging={draggedSegmentId === segment.id || undefined}
                key={segment.id}
                className="clip"
                style={{
                  width: `${(preview.sourceOut - preview.sourceIn) * 80 * zoom}px`,
                }}
                onClick={() => setPlayhead(segment.outputIn)}
                onPointerDown={beginClipDrag(segment.id)}
              >
                <button
                  className="trim-handle in"
                  aria-label={`${segment.id} 入点手柄`}
                  onPointerDown={beginTrim(segment, "in")}
                />
                <b>{segment.sourceId}</b>
                <small>
                  {preview.sourceIn.toFixed(2)}–{preview.sourceOut.toFixed(2)}
                </small>
                <div className="clip-actions">
                  <button
                    disabled={!canSplit}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!canSplit) return;
                      const raw =
                        segment.sourceIn + playhead - segment.outputIn;
                      const cuePoints = cues
                        .filter((cue) => cue.sourceId === segment.sourceId)
                        .flatMap((cue) => [cue.start, cue.end]);
                      void operate({
                        type: "split",
                        segmentId: segment.id,
                        sourceTime: snapTime(raw, cuePoints, 8 / (80 * zoom)),
                      });
                    }}
                  >
                    切分
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      void operate({
                        type: "delete",
                        segmentId: segment.id,
                        reason: "manual",
                      });
                    }}
                  >
                    删除
                  </button>
                </div>
                <button
                  className="trim-handle out"
                  aria-label={`${segment.id} 出点手柄`}
                  onPointerDown={beginTrim(segment, "out")}
                />
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
};
