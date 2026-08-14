import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { execFile } from "node:child_process";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { createApiServer } from "../server/api.js";

const cleanups: Array<() => Promise<void>> = [];
const execFileAsync = promisify(execFile);
afterEach(async () =>
  Promise.all(cleanups.splice(0).map((cleanup) => cleanup())),
);

const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "videouse-api-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const media = join(root, "a.mp4");
  await execFileAsync("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=16x16:d=6",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=48000:cl=stereo:d=6",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    media,
  ]);
  await writeFile(
    join(root, "edl.json"),
    JSON.stringify({
      version: 1,
      sources: { a: media },
      ranges: [{ source: "a", start: 0, end: 6 }],
      grade: "none",
      overlays: [],
      total_duration_s: 6,
    }),
  );
  return root;
};

const waitFor = async <T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
) => {
  for (let attempt = 0; attempt < 50; attempt++) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("condition not reached");
};

describe("loopback API", () => {
  it("allows only default or explicitly configured browser origins and handles preflight", async () => {
    const server = createApiServer(["http://127.0.0.1:5181"]);
    const address = await server.listen();
    cleanups.push(() => server.close());
    for (const origin of ["http://127.0.0.1:5173", "http://127.0.0.1:5181"]) {
      const response = await fetch(`${address}/api/health`, {
        headers: { origin },
      });
      expect(response.headers.get("access-control-allow-origin")).toBe(origin);
      expect(response.headers.get("vary")).toContain("Origin");
    }
    const preflight = await fetch(`${address}/api/health`, {
      method: "OPTIONS",
      headers: {
        origin: "http://127.0.0.1:5181",
        "access-control-request-method": "GET",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(
      "http://127.0.0.1:5181",
    );
    expect(preflight.headers.get("access-control-allow-methods")).toContain(
      "GET",
    );
    for (const origin of [
      "http://127.0.0.1:5182",
      "null",
      "file://",
      "https://example.com",
    ]) {
      const response = await fetch(`${address}/api/health`, {
        headers: { origin },
      });
      expect(response.status).toBe(403);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    }
  });

  it("rejects hostile simple POST requests before body parsing or any state mutation", async () => {
    const root = await fixture();
    const server = createApiServer(["http://127.0.0.1:5181"], {
      generateProxies: async (project) => project,
    });
    const address = await server.listen();
    cleanups.push(() => server.close());
    const opened = (await fetch(`${address}/api/projects/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root }),
    }).then((response) => response.json())) as {
      timeline: { segments: Array<{ id: string }> };
    };
    const initialDraft = await readFile(
      join(root, "workbench", "working-draft.json"),
      "utf8",
    );
    const attacks = [
      {
        path: "/api/operations",
        body: {
          operation: {
            type: "trim",
            segmentId: opened.timeline.segments[0]!.id,
            sourceIn: 1,
            sourceOut: 5,
          },
        },
      },
      { path: "/api/versions", body: { summary: "csrf" } },
      { path: "/api/export/videouse-edl", body: {} },
      { path: "/api/proxies/generate", body: {} },
    ];
    for (const attack of attacks) {
      const response = await fetch(`${address}${attack.path}`, {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "content-type": "text/plain",
        },
        body: JSON.stringify(attack.body),
      });
      expect(response.status).toBe(403);
    }
    const nullOrigin = await fetch(`${address}/api/versions`, {
      method: "POST",
      headers: { origin: "null", "content-type": "text/plain" },
      body: "{}",
    });
    expect(nullOrigin.status).toBe(403);
    expect(
      await readFile(join(root, "workbench", "working-draft.json"), "utf8"),
    ).toBe(initialDraft);
    expect(
      await fetch(`${address}/api/tasks`).then((response) => response.json()),
    ).toEqual([]);
    await expect(
      access(join(root, "workbench", "versions", "v001.json")),
    ).rejects.toThrow();
    await expect(
      access(join(root, "workbench", "exports", "videouse-edl.json")),
    ).rejects.toThrow();
  });

  it("rejects an originless request whose Host is not loopback", async () => {
    const server = createApiServer();
    const address = await server.listen();
    cleanups.push(() => server.close());
    const url = new URL(address);
    const status = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(
        {
          hostname: url.hostname,
          port: url.port,
          path: "/api/health",
          headers: { host: "evil.example" },
        },
        (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        },
      );
      request.once("error", reject);
      request.end();
    });
    expect(status).toBe(403);
  });

  it("serves bounded and suffix media ranges and rejects ranges outside the file", async () => {
    const root = await fixture();
    const server = createApiServer();
    const address = await server.listen();
    cleanups.push(() => server.close());
    const project = (await fetch(`${address}/api/projects/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root }),
    }).then((response) => response.json())) as {
      sources: Array<{ id: string }>;
    };
    const url = `${address}/api/media/${project.sources[0]!.id}`;
    const first = await fetch(url, { headers: { range: "bytes=0-9" } });
    expect(first.status).toBe(206);
    expect(first.headers.get("content-range")).toMatch(/^bytes 0-9\/\d+$/);
    expect(first.headers.get("content-length")).toBe("10");
    const suffix = await fetch(url, { headers: { range: "bytes=-10" } });
    expect(suffix.status).toBe(206);
    expect(Number(suffix.headers.get("content-length"))).toBe(10);
    const invalid = await fetch(url, {
      headers: { range: "bytes=999999-1000000" },
    });
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get("content-range")).toMatch(/^bytes \*\/\d+$/);
  });

  it("uses the real source MIME type for full and Range responses", async () => {
    const root = await mkdtemp(join(tmpdir(), "videouse-mov-"));
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    const media = join(root, "clip.mov");
    await execFileAsync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=16x16:d=1",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=d=1",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-shortest",
      media,
    ]);
    await writeFile(
      join(root, "edl.json"),
      JSON.stringify({
        version: 1,
        sources: { clip: media },
        ranges: [{ source: "clip", start: 0, end: 1 }],
        grade: "none",
        overlays: [],
        total_duration_s: 1,
      }),
    );
    const server = createApiServer();
    const address = await server.listen();
    cleanups.push(() => server.close());
    await fetch(`${address}/api/projects/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root }),
    });
    expect(
      (await fetch(`${address}/api/media/clip`)).headers.get("content-type"),
    ).toBe("video/quicktime");
    const ranged = await fetch(`${address}/api/media/clip`, {
      headers: { range: "bytes=0-9" },
    });
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get("content-type")).toBe("video/quicktime");
  });

  it("revalidates media at read time and refuses a source replaced by a symlink", async () => {
    const root = await fixture();
    const server = createApiServer();
    const address = await server.listen();
    cleanups.push(() => server.close());
    const project = (await fetch(`${address}/api/projects/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root }),
    }).then((response) => response.json())) as {
      sources: Array<{ id: string; originalPath: string }>;
    };
    const external = await mkdtemp(join(tmpdir(), "videouse-secret-"));
    cleanups.push(() => rm(external, { recursive: true, force: true }));
    const secret = join(external, "secret.mp4");
    await writeFile(secret, "DO_NOT_LEAK");
    await rm(project.sources[0]!.originalPath);
    await symlink(secret, project.sources[0]!.originalPath);
    const response = await fetch(
      `${address}/api/media/${project.sources[0]!.id}`,
    );
    expect(response.status).not.toBe(200);
    expect(await response.text()).not.toContain("DO_NOT_LEAK");
  });

  it("revalidates the source fingerprint before serving an existing proxy", async () => {
    const root = await fixture();
    const media = join(root, "a.mp4");
    const proxy = join(root, "workbench", "proxies", "proxy.mp4");
    const server = createApiServer([], {
      generateProxies: async (project) => {
        await mkdir(join(root, "workbench", "proxies"), { recursive: true });
        await writeFile(proxy, "PROXY-SENTINEL");
        return {
          ...project,
          sources: project.sources.map((source) => ({
            ...source,
            proxyPath: proxy,
          })),
        };
      },
    });
    const address = await server.listen();
    cleanups.push(() => server.close());
    await fetch(`${address}/api/projects/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root }),
    });
    const task = (await fetch(`${address}/api/proxies/generate`, {
      method: "POST",
    }).then((response) => response.json())) as { id: string };
    await waitFor(
      async () =>
        fetch(`${address}/api/tasks/${task.id}`).then((response) =>
          response.json(),
        ) as Promise<{ status: string }>,
      (value) => value.status === "complete",
    );
    const unchanged = await fetch(`${address}/api/media/a`);
    expect(unchanged.status).toBe(200);
    expect(await unchanged.text()).toBe("PROXY-SENTINEL");
    const before = await stat(media);
    const replacement = `${media}.replacement`;
    await copyFile(media, replacement);
    await utimes(replacement, before.atime, before.mtime);
    await rename(replacement, media);
    expect((await fetch(`${address}/api/media/a`)).status).toBe(409);
    expect((await fetch(`${address}/api/media/a`)).status).toBe(409);
    const current = (await fetch(`${address}/api/projects/current`).then(
      (response) => response.json(),
    )) as { sources: Array<{ linkState: string; proxyPath?: string }> };
    expect(current.sources[0]?.linkState).toBe("changed");
    expect(current.sources[0]?.proxyPath).toBeUndefined();
  });

  it("requires explicit user authorization for an external EDL source before media, proxy, or render", async () => {
    const root = await mkdtemp(join(tmpdir(), "videouse-external-project-"));
    const external = await mkdtemp(join(tmpdir(), "videouse-external-source-"));
    cleanups.push(
      () => rm(root, { recursive: true, force: true }),
      () => rm(external, { recursive: true, force: true }),
    );
    const media = join(external, "outside.mp4");
    await execFileAsync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=16x16:d=2",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=d=2",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-shortest",
      media,
    ]);
    await writeFile(
      join(root, "edl.json"),
      JSON.stringify({
        version: 1,
        sources: { outside: media },
        ranges: [{ source: "outside", start: 0, end: 1 }],
        grade: "none",
        overlays: [],
        total_duration_s: 1,
      }),
    );
    let proxyRuns = 0;
    let renderRuns = 0;
    const server = createApiServer([], {
      generateProxies: async (project) => {
        proxyRuns++;
        return project;
      },
      render: async () => {
        renderRuns++;
        return { outputPath: join(root, "render.mp4") };
      },
    });
    const address = await server.listen();
    cleanups.push(() => server.close());
    const opened = await fetch(`${address}/api/projects/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root }),
    });
    expect(opened.status).toBe(200);
    expect(
      ((await opened.json()) as { sources: Array<{ linkState: string }> })
        .sources[0]!.linkState,
    ).toBe("relink-required");
    expect((await fetch(`${address}/api/media/outside`)).status).toBe(409);
    expect(
      (await fetch(`${address}/api/proxies/generate`, { method: "POST" }))
        .status,
    ).toBe(409);
    expect(
      (await fetch(`${address}/api/export/render-preview`, { method: "POST" }))
        .status,
    ).toBe(409);
    expect({ proxyRuns, renderRuns }).toEqual({ proxyRuns: 0, renderRuns: 0 });

    const authorized = await fetch(`${address}/api/sources/outside/authorize`, {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify({ path: media }),
    });
    expect(authorized.status).toBe(200);
    expect(
      ((await authorized.json()) as { sources: Array<{ linkState: string }> })
        .sources[0]!.linkState,
    ).toBe("linked");
    expect((await fetch(`${address}/api/media/outside`)).status).toBe(200);
    const authorization = JSON.parse(
      await readFile(
        join(root, "workbench", "source-authorizations.json"),
        "utf8",
      ),
    ) as { sources: Array<{ id: string; path: string }> };
    expect(authorization.sources).toEqual([
      expect.objectContaining({
        id: "outside",
        path: await (await import("node:fs/promises")).realpath(media),
      }),
    ]);
    const reopened = await fetch(`${address}/api/projects/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root }),
    });
    expect(
      ((await reopened.json()) as { sources: Array<{ linkState: string }> })
        .sources[0]!.linkState,
    ).toBe("linked");
  });

  it("opens a missing-source project without reading or probing the absent file", async () => {
    const root = await fixture();
    await rm(join(root, "a.mp4"));
    const server = createApiServer();
    const address = await server.listen();
    cleanups.push(() => server.close());
    const opened = await fetch(`${address}/api/projects/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root }),
    });
    expect(opened.status).toBe(200);
    const project = (await opened.json()) as {
      sources: Array<{ linkState: string }>;
      timeline: { segments: unknown[] };
    };
    expect(project.sources[0]!.linkState).toBe("missing");
    expect(project.timeline.segments).toHaveLength(1);
  });

  it("opens a project, persists an operation, and exports a validated EDL", async () => {
    const root = await fixture();
    const server = createApiServer();
    const address = await server.listen();
    cleanups.push(() => server.close());
    const open = await fetch(`${address}/api/projects/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root }),
    });
    const project = (await open.json()) as {
      timeline: { segments: Array<{ id: string }> };
    };
    expect(open.status).toBe(200);
    const operation = await fetch(`${address}/api/operations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: {
          type: "trim",
          segmentId: project.timeline.segments[0]!.id,
          sourceIn: 1,
          sourceOut: 5,
        },
      }),
    });
    expect(operation.status).toBe(200);
    const exported = await fetch(`${address}/api/export/videouse-edl`, {
      method: "POST",
    });
    expect(exported.status).toBe(200);
    const result = (await exported.json()) as {
      validation: { ok: boolean };
      versionId?: string;
    };
    expect(result.validation.ok).toBe(true);
    expect(result.versionId).toMatch(/^v\d{3}$/);
    const current = (await fetch(`${address}/api/projects/current`).then(
      (response) => response.json(),
    )) as {
      versions: Array<{ id: string }>;
      exportHistory: Array<{
        kind: string;
        versionId?: string;
        status: string;
      }>;
    };
    expect(current.versions.map((version) => version.id)).toContain(
      result.versionId,
    );
    expect(current.exportHistory).toContainEqual(
      expect.objectContaining({
        kind: "videouse-edl",
        versionId: result.versionId,
        status: "ready",
      }),
    );
    await expect(
      access(join(root, "workbench", "versions", `${result.versionId}.json`)),
    ).resolves.toBeUndefined();
  });

  it("freezes a version before CapCut and render exports and traces queued tasks to it", async () => {
    const root = await fixture();
    const server = createApiServer([], {
      render: async () => ({
        outputPath: join(root, "workbench", "exports", "preview.mp4"),
      }),
    });
    const address = await server.listen();
    cleanups.push(() => server.close());
    await fetch(`${address}/api/projects/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root }),
    });

    const packaged = (await fetch(`${address}/api/export/capcut-package`, {
      method: "POST",
    }).then((response) => response.json())) as { versionId?: string; path: string };
    expect(packaged.versionId).toMatch(/^v\d{3}$/);
    const packageManifest = JSON.parse(
      await readFile(join(packaged.path, "package-manifest.json"), "utf8"),
    ) as { files: Record<string, string> };
    expect(packageManifest.files.jianyingImport).toBeUndefined();
    await expect(
      access(join(packaged.path, "jianying-import.fcpxml")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    const renderTask = (await fetch(`${address}/api/export/render-preview`, {
      method: "POST",
    }).then((response) => response.json())) as {
      id: string;
      versionId?: string;
    };
    expect(renderTask.versionId).toMatch(/^v\d{3}$/);
    await waitFor(
      async () =>
        fetch(`${address}/api/tasks/${renderTask.id}`).then((response) =>
          response.json(),
        ) as Promise<{ status: string }>,
      (task) => task.status === "complete",
    );

    const current = (await fetch(`${address}/api/projects/current`).then(
      (response) => response.json(),
    )) as {
      exportHistory: Array<{
        kind: string;
        versionId?: string;
        status: string;
      }>;
    };
    expect(current.exportHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "capcut-package",
          versionId: packaged.versionId,
          status: "ready",
        }),
        expect.objectContaining({
          kind: "render-job",
          versionId: renderTask.versionId,
          status: "ready",
        }),
      ]),
    );
  });

  it("queues a configured final-video export from a frozen version", async () => {
    const root = await fixture();
    let received: Record<string, unknown> | undefined;
    const progressUpdates: Array<{ progress: number; phase: string }> = [];
    const server = createApiServer([], {
      chooseExportDirectory: async () => root,
      renderFinalVideo: async (_project, _root, request, _logPath, update) => {
        received = request as unknown as Record<string, unknown>;
        await update({ progress: 42, phase: "encoding", detail: "正在编码 MP4" });
        progressUpdates.push({ progress: 42, phase: "encoding" });
        return {
          outputPath: join(root, "workbench", "exports", "MAX.mp4"),
          summary: "delivery encoded",
        };
      },
    });
    const address = await server.listen();
    cleanups.push(() => server.close());
    await fetch(`${address}/api/projects/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root }),
    });
    const selectedDirectory = await fetch(
      `${address}/api/export/choose-directory`,
      { method: "POST" },
    );
    expect(selectedDirectory.status).toBe(200);
    const selected = (await selectedDirectory.json()) as { path: string };

    const queued = await fetch(`${address}/api/export/final-video`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        request: {
          title: "MAX",
          format: "mp4",
          resolution: "1080p",
          frameRate: 60,
          quality: "standard",
          destinationDirectory: selected.path,
        },
      }),
    });
    expect(queued.status).toBe(202);
    const task = (await queued.json()) as { id: string; versionId?: string };
    await waitFor(
      async () =>
        fetch(`${address}/api/tasks/${task.id}`).then((response) =>
          response.json(),
        ) as Promise<{ status: string }>,
      (current) => current.status === "complete",
    );
    expect(task.versionId).toMatch(/^v\d{3}$/);
    expect(progressUpdates).toEqual([{ progress: 42, phase: "encoding" }]);
    expect(received).toMatchObject({
      title: "MAX",
      format: "mp4",
      resolution: "1080p",
      frameRate: 60,
      quality: "standard",
      destinationDirectory: selected.path,
    });
  });

  it("reveals only a generated project export in Finder", async () => {
    const root = await fixture();
    let revealedPath = "";
    const server = createApiServer([], {
      revealInFinder: async (path) => {
        revealedPath = path;
      },
    });
    const address = await server.listen();
    cleanups.push(() => server.close());
    await fetch(`${address}/api/projects/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root }),
    });
    const generated = join(root, "workbench", "exports", "jianying-package");
    await mkdir(generated, { recursive: true });

    const response = await fetch(`${address}/api/exports/reveal`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: generated }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(revealedPath).toMatch(/workbench\/exports\/jianying-package$/);
  });

  it("keeps immutable export artifacts for separate frozen versions", async () => {
    const root = await fixture();
    const server = createApiServer();
    const address = await server.listen();
    cleanups.push(() => server.close());
    const opened = (await fetch(`${address}/api/projects/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root }),
    }).then((response) => response.json())) as {
      timeline: { segments: Array<{ id: string }> };
    };
    const first = (await fetch(`${address}/api/export/videouse-edl`, {
      method: "POST",
    }).then((response) => response.json())) as { path: string };
    const firstContents = await readFile(first.path, "utf8");
    await fetch(`${address}/api/operations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: {
          type: "trim",
          segmentId: opened.timeline.segments[0]!.id,
          sourceIn: 1,
          sourceOut: 5,
        },
      }),
    });
    const second = (await fetch(`${address}/api/export/videouse-edl`, {
      method: "POST",
    }).then((response) => response.json())) as { path: string };
    expect(second.path).not.toBe(first.path);
    expect(await readFile(first.path, "utf8")).toBe(firstContents);

    const packageOne = (await fetch(`${address}/api/export/capcut-package`, {
      method: "POST",
    }).then((response) => response.json())) as { path: string };
    const packageTwo = (await fetch(`${address}/api/export/capcut-package`, {
      method: "POST",
    }).then((response) => response.json())) as { path: string };
    expect(packageTwo.path).not.toBe(packageOne.path);
  });

  it("finishes a render into its original project after another project is opened", async () => {
    const rootA = await fixture();
    const rootB = await fixture();
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const server = createApiServer([], {
      render: async (_project, root) => {
        await gate;
        return {
          outputPath: join(root, "workbench", "exports", "preview-v001.mp4"),
        };
      },
    });
    const address = await server.listen();
    cleanups.push(() => server.close());
    await fetch(`${address}/api/projects/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root: rootA }),
    });
    const task = (await fetch(`${address}/api/export/render-preview`, {
      method: "POST",
    }).then((response) => response.json())) as { id: string };
    await fetch(`${address}/api/projects/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root: rootB }),
    });
    finish();
    await waitFor(
      async () =>
        JSON.parse(
          await readFile(
            join(rootA, "workbench", "tasks", `${task.id}.json`),
            "utf8",
          ),
        ) as { status: string },
      (value) => value.status === "complete",
    );
    const draftA = JSON.parse(
      await readFile(join(rootA, "workbench", "working-draft.json"), "utf8"),
    ) as { exportHistory: Array<{ id: string; status: string }> };
    const draftB = JSON.parse(
      await readFile(join(rootB, "workbench", "working-draft.json"), "utf8"),
    ) as { exportHistory: Array<{ id: string }> };
    expect(draftA.exportHistory).toContainEqual(
      expect.objectContaining({ id: task.id, status: "ready" }),
    );
    expect(draftB.exportHistory).not.toContainEqual(
      expect.objectContaining({ id: task.id }),
    );
  });

  it("persists structured user/version/export events and replays them from history and SSE", async () => {
    const root = await fixture();
    const server = createApiServer();
    const address = await server.listen();
    cleanups.push(() => server.close());
    const opened = await fetch(`${address}/api/projects/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root }),
    });
    const project = (await opened.json()) as {
      timeline: { segments: Array<{ id: string }> };
    };
    await fetch(`${address}/api/operations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: {
          type: "trim",
          segmentId: project.timeline.segments[0]!.id,
          sourceIn: 0.1,
          sourceOut: 5.9,
        },
      }),
    });
    await fetch(`${address}/api/versions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ summary: "checkpoint" }),
    });
    await fetch(`${address}/api/export/videouse-edl`, { method: "POST" });
    const history = (await fetch(`${address}/api/events/history`).then(
      (response) => response.json(),
    )) as Array<{ type: string; actor: string }>;
    expect(history.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "project.opened",
        "timeline.trim",
        "version.created",
        "export.completed",
      ]),
    );
    expect(history.every((event) => typeof event.actor === "string")).toBe(
      true,
    );
    const lines = (
      await readFile(join(root, "workbench", "events.jsonl"), "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string });
    expect(lines.map((event) => event.type)).toEqual(
      history.map((event) => event.type),
    );

    const controller = new AbortController();
    const sse = await fetch(`${address}/api/events`, {
      signal: controller.signal,
    });
    const firstChunk = await sse.body!.getReader().read();
    controller.abort();
    expect(new TextDecoder().decode(firstChunk.value)).toContain(
      "project.opened",
    );
  });

  it("starts proxy work in the background and exposes reliable task status", async () => {
    const root = await fixture();
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const server = createApiServer([], {
      generateProxies: async (project) => {
        await gate;
        return project;
      },
    });
    const address = await server.listen();
    cleanups.push(() => server.close());
    await fetch(`${address}/api/projects/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root }),
    });
    const started = await fetch(`${address}/api/proxies/generate`, {
      method: "POST",
    });
    expect(started.status).toBe(202);
    const task = (await started.json()) as { id: string; status: string };
    expect(["queued", "running"]).toContain(task.status);
    const active = (await fetch(`${address}/api/tasks/${task.id}`).then(
      (response) => response.json(),
    )) as { status: string };
    expect(["queued", "running"]).toContain(active.status);
    finish();
    const completed = await waitFor(
      async () =>
        fetch(`${address}/api/tasks/${task.id}`).then((response) =>
          response.json(),
        ) as Promise<{ status: string }>,
      (value) => value.status === "complete",
    );
    expect(completed.status).toBe("complete");
  });

  it("merges completed proxy facts without overwriting timeline edits made while the task ran", async () => {
    const root = await fixture();
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const server = createApiServer([], {
      generateProxies: async (project) => {
        await gate;
        return {
          ...project,
          sources: project.sources.map((source) => ({
            ...source,
            proxyPath: join(root, "workbench", "proxies", "done.mp4"),
          })),
        };
      },
    });
    const address = await server.listen();
    cleanups.push(() => server.close());
    const opened = (await fetch(`${address}/api/projects/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root }),
    }).then((response) => response.json())) as {
      timeline: { segments: Array<{ id: string }> };
    };
    const task = (await fetch(`${address}/api/proxies/generate`, {
      method: "POST",
    }).then((response) => response.json())) as { id: string };
    await fetch(`${address}/api/operations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: {
          type: "trim",
          segmentId: opened.timeline.segments[0]!.id,
          sourceIn: 1,
          sourceOut: 5,
        },
      }),
    });
    finish();
    await waitFor(
      async () =>
        fetch(`${address}/api/tasks/${task.id}`).then((response) =>
          response.json(),
        ) as Promise<{ status: string }>,
      (value) => value.status === "complete",
    );
    const current = (await fetch(`${address}/api/projects/current`).then(
      (response) => response.json(),
    )) as {
      timeline: { segments: Array<{ sourceIn: number }> };
      sources: Array<{ proxyPath?: string }>;
    };
    expect(current.timeline.segments[0]!.sourceIn).toBe(1);
    expect(current.sources[0]!.proxyPath).toContain("done.mp4");
  });

  it("persists validated panel layout and restores it when the project reopens", async () => {
    const root = await fixture();
    const server = createApiServer();
    const address = await server.listen();
    cleanups.push(() => server.close());
    await fetch(`${address}/api/projects/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root }),
    });
    const layout = { leftRatio: 0.31, mediaRatio: 0.48, timelineRatio: 0.41 };
    const saved = await fetch(`${address}/api/layout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ layout }),
    });
    expect(saved.status).toBe(200);
    expect(((await saved.json()) as { layout: typeof layout }).layout).toEqual(
      layout,
    );
    const reopened = await fetch(`${address}/api/projects/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root }),
    });
    expect(
      ((await reopened.json()) as { layout: typeof layout }).layout,
    ).toEqual(layout);
  });

  it("records a failed render task without publishing a final output", async () => {
    const root = await fixture();
    const server = createApiServer([], {
      render: async () => {
        throw new Error("renderer exploded");
      },
    });
    const address = await server.listen();
    cleanups.push(() => server.close());
    await fetch(`${address}/api/projects/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root }),
    });
    const started = await fetch(`${address}/api/export/render-preview`, {
      method: "POST",
    });
    expect(started.status).toBe(202);
    const task = (await started.json()) as { id: string };
    const failed = await waitFor(
      async () =>
        fetch(`${address}/api/tasks/${task.id}`).then((response) =>
          response.json(),
        ) as Promise<{ status: string; error?: string; outputPath?: string }>,
      (value) => value.status === "failed",
    );
    expect(failed.error).toContain("renderer exploded");
    expect(failed.outputPath).toBeUndefined();
  });

  it("exposes a bounded persisted log summary for a render task", async () => {
    const root = await fixture();
    const outputPath = join(root, "workbench", "exports", "rough-cut.mp4");
    const server = createApiServer([], {
      render: async (_project, _root, _quality, logPath) => {
        await writeFile(
          logPath,
          "renderer started\nframe=42\nrenderer complete\n",
        );
        return { outputPath, summary: "rough cut ready" };
      },
    });
    const address = await server.listen();
    cleanups.push(() => server.close());
    await fetch(`${address}/api/projects/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root }),
    });
    const started = (await fetch(`${address}/api/export/render-rough-cut`, {
      method: "POST",
    }).then((response) => response.json())) as { id: string };
    const completed = await waitFor(
      async () =>
        fetch(`${address}/api/tasks/${started.id}`).then((response) =>
          response.json(),
        ) as Promise<{ status: string; summary?: string; outputPath?: string }>,
      (value) => value.status === "complete",
    );
    expect(completed).toEqual(
      expect.objectContaining({ summary: "rough cut ready", outputPath }),
    );
    const log = await fetch(`${address}/api/tasks/${started.id}/log`);
    expect(log.status).toBe(200);
    expect(await log.json()).toEqual(
      expect.objectContaining({
        taskId: started.id,
        summary: expect.stringContaining("renderer complete"),
      }),
    );
  });

  it("reloads terminal background-task status from the project task journal", async () => {
    const root = await fixture();
    const first = createApiServer([], {
      generateProxies: async (project) => project,
    });
    const firstAddress = await first.listen();
    await fetch(`${firstAddress}/api/projects/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root }),
    });
    const task = (await fetch(`${firstAddress}/api/proxies/generate`, {
      method: "POST",
    }).then((response) => response.json())) as { id: string };
    await waitFor(
      async () =>
        fetch(`${firstAddress}/api/tasks/${task.id}`).then((response) =>
          response.json(),
        ) as Promise<{ status: string }>,
      (value) => value.status === "complete",
    );
    await first.close();
    const second = createApiServer();
    const secondAddress = await second.listen();
    cleanups.push(() => second.close());
    await fetch(`${secondAddress}/api/projects/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root }),
    });
    const restored = await fetch(`${secondAddress}/api/tasks/${task.id}`);
    expect(restored.status).toBe(200);
    expect(((await restored.json()) as { status: string }).status).toBe(
      "complete",
    );
  });
});
