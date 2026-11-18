import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _flushAllPendingSaves,
  _flushMapSave,
  getMapAnnotationPath,
  loadMapAnnotations,
  saveMapAnnotations,
} from "../../src/map/MapPersistence";
import { MAP_SCHEMA_VERSION } from "../../src/map/MapFactory";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function createPluginHarness(existingJson?: Record<string, unknown>) {
  const files = new Map<string, string>();
  const writes: Array<{
    path: string;
    data: any;
    resolve: () => void;
    reject: (reason: Error) => void;
  }> = [];
  const adapter = {
    exists: vi.fn(async (path: string) => files.has(path) || path.endsWith("map-annotations")),
    read: vi.fn(async (path: string) => files.get(path)),
    write: vi.fn(async (path: string, json: string) => {
      const write = deferred<void>();
      writes.push({ path, data: JSON.parse(json), resolve: write.resolve, reject: write.reject });
      await write.promise;
      files.set(path, json);
    }),
    mkdir: vi.fn(async () => {}),
  };
  const plugin: any = {
    manifest: { id: "dnd-campaign-hub" },
    app: { vault: { configDir: ".obsidian", adapter } },
    _pendingSaves: new Map(),
  };
  if (existingJson) files.set(getMapAnnotationPath(plugin, "map-1"), JSON.stringify(existingJson));
  const syncPlayerView = vi.fn();
  const el = { querySelector: () => ({ _syncPlayerView: syncPlayerView }) } as unknown as HTMLElement;

  return {
    adapter,
    plugin,
    writes,
    syncPlayerView,
    save: (config: { mapId: string; name: string; [key: string]: unknown }) => saveMapAnnotations(plugin, config, el),
    flush: (mapId = "map-1") => _flushMapSave(plugin, mapId),
    load: (mapId = "map-1") => loadMapAnnotations(plugin, mapId),
    namesWritten: () => writes.map(({ data }) => data.name),
  };
}

describe("map/MapPersistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("preserves template link metadata when a stale open map config saves blank values", async () => {
    const map = createPluginHarness({
      mapId: "map-1",
      name: "Linked map",
      templateSourceId: "template-1",
      templateSourceName: "Base template",
      templateSyncedAt: "2026-07-09T08:00:00.000Z",
    });
    map.save({
      mapId: "map-1",
      name: "Linked map",
      templateSourceId: "",
      templateSourceName: "",
      templateSyncedAt: "",
    });

    const flush = map.flush();
    await vi.advanceTimersByTimeAsync(0);
    map.writes[0]!.resolve();
    await flush;

    expect(map.writes[0]!.data).toMatchObject({
      templateSourceId: "template-1",
      templateSourceName: "Base template",
      templateSyncedAt: "2026-07-09T08:00:00.000Z",
    });
  });

  it("coalesces edits during a write and exposes the newest pending state to loads", async () => {
    const map = createPluginHarness();
    const config = { mapId: "map-1", name: "A", fogOfWar: { enabled: false, regions: [] } };
    map.save(config);
    expect(map.syncPlayerView).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(map.writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(map.namesWritten()).toEqual(["A"]);

    config.name = "B";
    map.save(config);
    config.name = "C";
    config.fogOfWar.enabled = true;
    map.save(config);
    expect(map.syncPlayerView).toHaveBeenCalledTimes(3);
    const pending = await map.load();
    expect(pending).toMatchObject({ name: "C", fogOfWar: { enabled: true }, schemaVersion: MAP_SCHEMA_VERSION });
    pending.fogOfWar.enabled = false;
    expect(map.adapter.read).not.toHaveBeenCalled();

    map.writes[0]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(map.namesWritten()).toEqual(["A", "C"]);
    expect(map.writes[1]!.data.fogOfWar.enabled).toBe(true);
    map.writes[1]!.resolve();
    await vi.advanceTimersByTimeAsync(2000);
    expect(map.namesWritten()).toEqual(["A", "C"]);
    expect(map.plugin._pendingSaves.size).toBe(0);
    expect((await map.load()).name).toBe("C");
  });

  it("snapshots nested annotations before the first adapter await", async () => {
    const map = createPluginHarness();
    const exists = deferred<boolean>();
    map.adapter.exists.mockReturnValueOnce(exists.promise);
    const config = { mapId: "map-1", name: "A", walls: [{ points: [{ x: 1, y: 2 }] }] };
    map.save(config);
    const flush = map.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(map.adapter.exists).toHaveBeenCalledTimes(1);
    config.name = "B";
    config.walls[0]!.points[0]!.x = 3;
    map.save(config);
    exists.resolve(false);

    await vi.advanceTimersByTimeAsync(0);
    expect(map.writes[0]!.data).toMatchObject({ name: "A", walls: [{ points: [{ x: 1, y: 2 }] }] });
    map.writes[0]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(map.writes[1]!.data).toMatchObject({ name: "B", walls: [{ points: [{ x: 3, y: 2 }] }] });
    map.writes[1]!.resolve();
    await flush;
  });

  it("joins overlapping explicit flushes and a debounce timer firing during a write", async () => {
    const map = createPluginHarness();
    const finished = vi.fn();
    map.save({ mapId: "map-1", name: "A" });
    const first = map.flush().then(finished);
    const second = map.flush().then(finished);
    await vi.advanceTimersByTimeAsync(0);
    map.save({ mapId: "map-1", name: "B" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(map.namesWritten()).toEqual(["A"]);
    expect(finished).not.toHaveBeenCalled();

    const third = map.flush().then(finished);
    map.writes[0]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(map.namesWritten()).toEqual(["A", "B"]);
    expect(finished).not.toHaveBeenCalled();
    map.writes[1]!.resolve();
    await Promise.all([first, second, third]);
    expect(finished).toHaveBeenCalledTimes(3);
  });

  it("starts a new drain for an explicit flush queued as a previous drain finishes", async () => {
    const map = createPluginHarness();
    const pending = map.plugin._pendingSaves as Map<string, unknown>;
    const remove = pending.delete.bind(pending);
    const done = deferred<void>();
    vi.spyOn(pending, "delete").mockImplementationOnce((mapId) => {
      const removed = remove(mapId);
      void Promise.resolve().then(async () => {
        map.save({ mapId, name: "B" });
        await map.flush(mapId);
        done.resolve();
      });
      return removed;
    });
    map.save({ mapId: "map-1", name: "A" });
    const first = map.flush();
    await vi.advanceTimersByTimeAsync(0);
    map.writes[0]!.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(map.namesWritten()).toEqual(["A", "B"]);
    map.writes[1]!.resolve();
    await Promise.all([first, done.promise]);
    expect((await map.load()).name).toBe("B");
  });

  it("writes the newer revision after an older attempt fails", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const map = createPluginHarness();
    map.save({ mapId: "map-1", name: "A" });
    const flush = map.flush();
    await vi.advanceTimersByTimeAsync(0);
    map.save({ mapId: "map-1", name: "B" });
    map.writes[0]!.reject(new Error("Write failed"));
    await vi.advanceTimersByTimeAsync(0);

    expect(map.namesWritten()).toEqual(["A", "B"]);
    expect((await map.load()).name).toBe("B");
    map.writes[1]!.resolve();
    await flush;
    expect(vi.getTimerCount()).toBe(0);
    expect(errorLog).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed revision pending and retries until it succeeds", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const map = createPluginHarness();
    map.save({ mapId: "map-1", name: "A" });
    await vi.advanceTimersByTimeAsync(1000);
    map.writes[0]!.reject(new Error("First failure"));
    await vi.advanceTimersByTimeAsync(1999);
    expect(map.namesWritten()).toEqual(["A"]);
    expect((await map.load()).name).toBe("A");

    await vi.advanceTimersByTimeAsync(1);
    expect(map.namesWritten()).toEqual(["A", "A"]);
    map.writes[1]!.reject(new Error("Second failure"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(map.namesWritten()).toEqual(["A", "A", "A"]);
    map.writes[2]!.resolve();
    await vi.advanceTimersByTimeAsync(2000);

    expect(map.namesWritten()).toEqual(["A", "A", "A"]);
    expect((await map.load()).name).toBe("A");
    expect(map.plugin._pendingSaves.size).toBe(0);
    expect(errorLog).toHaveBeenCalledTimes(2);
  });

  it("allows independent writes for different maps and plugin instances", async () => {
    const map = createPluginHarness();
    const other = createPluginHarness();
    map.save({ mapId: "map-1", name: "A" });
    map.save({ mapId: "map-2", name: "B" });
    other.save({ mapId: "map-1", name: "C" });
    const flushes = [map.flush(), map.flush("map-2"), other.flush()];
    await vi.advanceTimersByTimeAsync(0);

    expect(map.namesWritten()).toEqual(["A", "B"]);
    expect(map.writes.map(({ path }) => path)).toEqual([
      getMapAnnotationPath(map.plugin, "map-1"),
      getMapAnnotationPath(map.plugin, "map-2"),
    ]);
    expect(other.namesWritten()).toEqual(["C"]);
    map.writes[1]!.resolve();
    other.writes[0]!.resolve();
    map.writes[0]!.resolve();
    await Promise.all(flushes);
  });

  it("flushes active and newly queued maps before flush-all completes", async () => {
    const map = createPluginHarness();
    map.save({ mapId: "map-1", name: "A" });
    const active = map.flush();
    await vi.advanceTimersByTimeAsync(0);
    const flushAll = _flushAllPendingSaves(map.plugin);
    map.save({ mapId: "map-1", name: "B" });
    map.save({ mapId: "map-2", name: "C" });
    map.writes[0]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(map.namesWritten()).toEqual(["A", "B"]);
    map.writes[1]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(map.namesWritten()).toEqual(["A", "B", "C"]);

    map.save({ mapId: "map-1", name: "D" });
    map.writes[2]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(map.namesWritten()).toEqual(["A", "B", "C", "D"]);
    map.writes[3]!.resolve();
    await Promise.all([active, flushAll]);
    expect(map.plugin._pendingSaves.size).toBe(0);
  });

  it("lets a failed flush-all write retry later while other maps finish", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const map = createPluginHarness();
    map.save({ mapId: "map-1", name: "A" });
    map.save({ mapId: "map-2", name: "B" });
    const flushAll = _flushAllPendingSaves(map.plugin);
    await vi.advanceTimersByTimeAsync(0);
    map.writes[0]!.reject(new Error("Write failed"));
    await vi.advanceTimersByTimeAsync(0);
    map.writes[1]!.resolve();
    await flushAll;

    expect(map.namesWritten()).toEqual(["A", "B"]);
    expect(map.plugin._pendingSaves.size).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(map.namesWritten()).toEqual(["A", "B", "A"]);
    map.writes[2]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(map.plugin._pendingSaves.size).toBe(0);
  });

  it("joins a retry that starts while flush-all waits on another map", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const map = createPluginHarness();
    const finished = vi.fn();
    map.save({ mapId: "map-1", name: "A" });
    map.save({ mapId: "map-2", name: "B" });
    const flushAll = _flushAllPendingSaves(map.plugin).then(finished);
    await vi.advanceTimersByTimeAsync(0);
    map.writes[0]!.reject(new Error("Write failed"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(map.namesWritten()).toEqual(["A", "B", "A"]);

    map.writes[1]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(finished).not.toHaveBeenCalled();
    map.writes[2]!.resolve();
    await flushAll;
    expect(map.plugin._pendingSaves.size).toBe(0);
  });

  it("finishes flush-all when persistently failing maps have staggered retries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("Persistent write failure");
    const map = createPluginHarness();
    const finished = vi.fn();
    map.save({ mapId: "map-1", name: "A" });
    map.save({ mapId: "map-2", name: "B" });
    const flushAll = _flushAllPendingSaves(map.plugin).then(finished);
    await vi.advanceTimersByTimeAsync(0);
    map.writes[0]!.reject(failure);
    await vi.advanceTimersByTimeAsync(2000);
    expect(map.namesWritten()).toEqual(["A", "B", "A"]);

    map.writes[1]!.reject(failure);
    await vi.advanceTimersByTimeAsync(2000);
    expect(map.namesWritten()).toEqual(["A", "B", "A", "B"]);
    map.writes[2]!.reject(failure);
    await vi.advanceTimersByTimeAsync(2000);
    expect(map.namesWritten()).toEqual(["A", "B", "A", "B", "A"]);
    expect(finished).not.toHaveBeenCalled();

    map.writes[3]!.reject(failure);
    await vi.advanceTimersByTimeAsync(0);
    expect(finished).toHaveBeenCalledTimes(1);
    await flushAll;
    map.writes[4]!.reject(failure);
    await vi.advanceTimersByTimeAsync(0);
    expect(map.plugin._pendingSaves.size).toBe(2);
    expect(vi.getTimerCount()).toBe(2);
  });
});
