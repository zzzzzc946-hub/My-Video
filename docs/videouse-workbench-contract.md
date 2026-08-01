# VideoUse Workbench Data Contract (v1)

All state below is stored under `<video-use-project>/workbench/`; no source asset or existing VideoUse file is overwritten.

## Canonical project

```ts
type WorkbenchProject = {
  schemaVersion: 1;
  projectId: string;
  name: string;
  rootPath: string;
  sources: SourceMedia[];
  timeline: { trackId: "av-main"; segments: TimelineSegment[] };
  deletedSegments: DeletedSegment[];
  transcripts: TranscriptReference[];
  decisions: FileReference[];
  assets: ExternalAsset[];
  versions: VersionRecord[];
  currentVersionId: string | null;
  layout: LayoutState;
  exportHistory: ExportRecord[];
};
```

`TimelineSegment` always contains a `sourceId`, `sourceIn`, `sourceOut`, `outputIn`, and `outputOut`. Output time is recalculated from segment order, never manually trusted. `DeletedSegment` retains its original placement and deletion reason. `SourceMedia` has `originalPath`, optional `proxyPath`, duration, fingerprint and link state.

## Files

`project.json` is the canonical initialized project; `working-draft.json` is the autosaved current edit; `versions/vNNN.json` is immutable; `events.jsonl` appends visible Codex/user/system facts; `ui-state.json` holds panel ratios. `tasks/*.json` and `tasks/logs/*.log` persist background proxy/render lifecycle. `exports/` holds generated EDLs, atomically published render results and delivery packages.

The canonical realpath supplied by the current open request is authoritative. Serialized `rootPath`, source metadata, transcript facts and unsafe proxy paths are never trusted as draft authority. Sources inside the opened project are authorized as project media; external EDL sources remain blocked until the user explicitly authorizes their exact canonical path and fingerprint. Missing, changed and relink-required sources remain unreadable until explicit authorization. Every media read and every proxy/render process boundary revalidates the source fingerprint. Proxy names are fixed SHA-256 encodings and every proxy read/write is constrained to the canonical `workbench/proxies/` directory.

## Operations

`trim`, `delete`, `restore`, `reorder`, `split`, and validated whole-timeline replacement for session undo/redo are checked before persistence against authoritative probed source duration; timecodes must be finite numbers, non-negative and have positive duration. The editor supports clip drag reorder, draggable in/out handles, edit-point snapping, playhead split and session undo/redo. Mutating operations record an event, save the draft, and publish an SSE `project.updated` event. Layout updates use the same persistence/audit path. A snapshot copies the canonical draft and has a parent version ID; restoring only creates a new draft and never rewrites a historical snapshot.

## Interchange

`toVideoUseEdl()` emits the established `sources`, `ranges`, `grade`, `overlays`, `subtitles`, and `total_duration_s` fields. Export validation compares count, source order, source timecodes and expected duration before writing. Every EDL, delivery-package, preview or rough-cut export first creates an immutable version; the export record and any background task reference that frozen version. Artifact filenames/directories include that version ID, so later or concurrent exports cannot overwrite an earlier record's target. Background completion always writes back to the project root captured when the task started. The CapCut exporter creates a stable package containing the EDL, a source manifest, decision references and an adapter status file whose `nativeDraftAdapter` is `experimental`.
