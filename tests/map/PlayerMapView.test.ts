import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  ItemView: class {
    containerEl = { children: [] };
    async setState() {}
  },
  Notice: vi.fn(),
  TFile: class {},
  TFolder: class {},
  Modal: class {},
}));

import { PlayerMapView } from "../../src/map-views/PlayerMapView";
import type { EnvAssetInstance } from "../../src/envasset/EnvAssetTypes";

function makeView(mode = "on-drop") {
  const markerLibrary = { getMarker: (id: string) => ({ type: id === "pc" ? "player" : "creature" }) };
  const view = new PlayerMapView({} as any, { settings: { visionUpdateMode: mode, mapCanvasScale: 1 }, markerLibrary } as any) as any;
  const ctx = { setTransform: vi.fn(), clearRect: vi.fn() };
  view.canvas = { getContext: () => ctx };
  view.dragOverlayCanvas = { width: 500, height: 500, getContext: () => ctx };
  view.mapConfig = {};
  view.clearMapFadeOverlays = vi.fn();
  view.redrawAnnotations = vi.fn();
  view.drawMarker = vi.fn();
  view.drawDragRuler = vi.fn();
  view.renderInitiativeOverlay = vi.fn();
  view.ensureFlickerLoop = vi.fn();
  return view;
}

function config(marker: any) {
  return { markers: [marker], draggingMarkerId: marker.id, gridSize: 70 };
}

describe("player map drag rendering", () => {
  it("removes a simple player token from the base and tracks mutable updates", () => {
    const view = makeView();
    const marker = { id: "a", markerId: "pc", position: { x: 10, y: 10 } };
    const payload = config(marker);
    view.previewMarkerDrag(payload);
    expect(view.previewMarkerId).toBe("a");
    expect(view.redrawAnnotations).toHaveBeenCalledTimes(1);
    marker.position.x = 20;
    view.previewMarkerDrag(payload);
    expect(view.redrawAnnotations).toHaveBeenCalledTimes(1);
    expect(view.drawMarker).toHaveBeenLastCalledWith(expect.anything(), marker);
    view.updateMapData({ ...payload, draggingMarkerId: null });
    expect(view.previewMarkerId).toBeNull();
    expect(view.redrawAnnotations).toHaveBeenCalledTimes(2);
  });

  it.each([
    { id: "a", markerId: "pc", layer: "DM" },
    { id: "a", markerId: "creature", layer: "Background" },
    { id: "a", markerId: "creature", layer: "Player" },
    { id: "a", markerId: "pc", tunnelState: { tunnelId: "t" } },
    { id: "a", markerId: "pc", tokenGroup: { members: [{}] } },
  ])("uses normal fog and visibility rendering for $layer $markerId", marker => {
    const view = makeView();
    const update = vi.spyOn(view, "updateMapData").mockImplementation(() => {});
    view.previewMarkerDrag(config({ ...marker, position: { x: 1, y: 2 } }));
    expect(update).toHaveBeenCalledOnce();
    expect(view.drawMarker).not.toHaveBeenCalled();
  });

  it("clears the overlay when a drag becomes complex", () => {
    const view = makeView();
    const marker = { id: "a", markerId: "pc", position: { x: 10, y: 10 }, layer: "Player" };
    const payload = config(marker);
    view.previewMarkerDrag(payload);
    marker.layer = "DM";
    view.previewMarkerDrag(payload);
    expect(view.previewMarkerId).toBeNull();
    expect(view.redrawAnnotations).toHaveBeenCalledTimes(2);
  });

  it("uses a full update when the background changes during a drag", () => {
    const view = makeView();
    view.mapConfig = { imageFile: "old.png" };
    const update = vi.spyOn(view, "updateMapData").mockImplementation(() => {});
    view.previewMarkerDrag({ ...config({ id: "a", markerId: "pc", position: { x: 1, y: 2 } }), imageFile: "new.png" });
    expect(update).toHaveBeenCalledOnce();
    expect(view.drawMarker).not.toHaveBeenCalled();
  });

  it("draws the dragged player only on the overlay and enemies below fog", () => {
    const view = makeView();
    const ctx = { setTransform: vi.fn(), clearRect: vi.fn() };
    view.canvas = { width: 500, height: 500, getContext: () => ctx };
    view.dragOverlayCanvas = { width: 500, height: 500, getContext: () => ctx };
    view.redrawAnnotations = (PlayerMapView.prototype as any).redrawAnnotations.bind(view);
    view.drawEnvAssets = vi.fn();
    view.drawWallDoors = vi.fn();
    view.drawWallDoorIcons = vi.fn();
    const order: string[] = [];
    view.drawFogOfWar = vi.fn(() => order.push("fog"));
    view.drawMarker = vi.fn((_ctx: unknown, marker: any) => order.push(marker.id));
    const player = { id: "pc", markerId: "pc", position: { x: 10, y: 10 } };
    const enemy = { id: "enemy", markerId: "enemy", position: { x: 20, y: 20 } };
    view.previewMarkerDrag({ ...config(player), markers: [enemy, player], fogOfWar: { enabled: true } });
    expect(order).toEqual(["enemy", "fog", "pc"]);
    order.length = 0;
    view.redrawAnnotations(); // a flicker redraw must not paint the old player token
    expect(order).toEqual(["enemy", "fog"]);
  });

  it("hides a DM player and a background creature in normal rendering", () => {
    const view = makeView();
    const ctx = { setTransform: vi.fn(), clearRect: vi.fn() };
    view.canvas = { width: 500, height: 500, getContext: () => ctx };
    view.redrawAnnotations = (PlayerMapView.prototype as any).redrawAnnotations.bind(view);
    view.drawEnvAssets = vi.fn();
    view.drawWallDoors = vi.fn();
    view.drawWallDoorIcons = vi.fn();
    view.mapConfig = { markers: [
      { id: "hidden", markerId: "pc", layer: "DM", position: { x: 10, y: 10 } },
      { id: "background", markerId: "enemy", layer: "Background", position: { x: 20, y: 20 } },
    ] };
    view.redrawAnnotations();
    expect(view.drawMarker).not.toHaveBeenCalled();
  });

  it("freezes the fog atlas on drop mode but updates live vision on cell crossings", () => {
    const view = makeView();
    const atlas = {};
    view._fogAtlasCanvas = atlas;
    view._fogAtlasW = 500;
    view._fogAtlasH = 500;
    view._fogAtlasKey = "unchanged";
    view._computeFogDigest = vi.fn(() => "unchanged");
    const ctx = { drawImage: vi.fn() };
    const payload = config({ id: "a", markerId: "pc", position: { x: 100, y: 20 } });
    const getBlockingWalls = () => [];
    view.drawFogOfWar(ctx, 500, 500, payload, getBlockingWalls);
    expect(view._computeFogDigest).not.toHaveBeenCalled();
    expect(ctx.drawImage).toHaveBeenCalledWith(atlas, 0, 0);
    view.plugin.settings.visionUpdateMode = "while-dragging";
    view.drawFogOfWar(ctx, 500, 500, payload, getBlockingWalls);
    expect(view._computeFogDigest).toHaveBeenCalledTimes(1);
    expect(view._dragLastFogCol).toBe(1);
    view.drawFogOfWar(ctx, 500, 500, payload, getBlockingWalls);
    expect(view._computeFogDigest).toHaveBeenCalledTimes(1);
    payload.markers[0].position.x = 150;
    view.drawFogOfWar(ctx, 500, 500, payload, getBlockingWalls);
    expect(view._computeFogDigest).toHaveBeenCalledTimes(2);
    expect(view._dragLastFogCol).toBe(2);
  });

  it("uses live rendering when vision updates while dragging", () => {
    const view = makeView("while-dragging");
    const update = vi.spyOn(view, "updateMapData").mockImplementation(() => {});
    const payload = config({ id: "a", markerId: "pc", position: { x: 100, y: 20 } });
    view.previewMarkerDrag(payload);
    expect(update).toHaveBeenCalledWith(payload);
  });
});

describe("player map scatter visibility", () => {
  function makeCanvas() {
    const ctx = {
      setTransform() {}, clearRect() {}, fillRect() {}, drawImage() {},
      beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, clip() {},
      save() {}, restore() {}, arc() {}, strokeText() {}, fillText: vi.fn(),
      createRadialGradient: () => ({ addColorStop() {} }),
    };
    return { width: 300, height: 150, getContext: () => ctx };
  }

  function makeVisibilityView() {
    const view = makeView();
    view.canvas = makeCanvas();
    view.redrawAnnotations = (PlayerMapView.prototype as any).redrawAnnotations.bind(view);
    view.drawEnvAssets = vi.fn();
    view.drawWallDoors = vi.fn();
    return view;
  }

  function scatter(overrides: Partial<EnvAssetInstance> = {}): EnvAssetInstance {
    return {
      id: "scatter",
      assetId: "debris",
      position: { x: 100, y: 50 },
      width: 36,
      height: 12,
      rotation: 0,
      zIndex: 0,
      placedAt: 0,
      scatterConfig: { blocksVision: true },
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.stubGlobal("document", { createElement: makeCanvas });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([true, false])("updates visibility in place without token movement (fog %s)", fogEnabled => {
    const view = makeVisibilityView();
    const polygons = vi.spyOn(view, "computeVisibilityPolygon");
    const viewer = { id: "viewer", markerId: "pc", position: { x: 50, y: 50 }, darkvision: 200, elevation: { height: 5 } };
    const target = { id: "target", markerId: "creature", position: { x: 150, y: 50 } };
    const asset = scatter();
    const payload = { markers: [viewer, target], envAssets: [] as EnvAssetInstance[], fogOfWar: { enabled: fogEnabled } };

    function expectVisibility(visible: boolean, label: string) {
      polygons.mockClear();
      view.drawMarker.mockClear();
      const lastAtlasKey = view._fogAtlasKey;
      view.updateMapData(payload);
      if (fogEnabled) expect(view._fogAtlasKey, label).not.toBe(lastAtlasKey);

      const rendered = polygons.mock.results[0]?.value;
      if (fogEnabled) expect(rendered, label).toBeDefined();
      const inVisibleArea = rendered
        ? view.pointInPolygon(target.position.x, target.position.y, rendered)
        : true; // Daylight with zero blockers does not draw an occlusion overlay.
      expect(inVisibleArea, label).toBe(visible);
      if (!fogEnabled) {
        expect(view.drawMarker.mock.calls.some(([, marker]: any[]) => marker === target), label).toBe(visible);
      }
    }

    expectVisibility(true, "clear path");
    payload.envAssets.push(asset);
    expectVisibility(false, "added blocker");
    asset.position.y = 65;
    expectVisibility(true, "moved blocker");
    asset.height = 36;
    expectVisibility(false, "taller footprint");
    asset.height = 12;
    expectVisibility(true, "restored footprint");
    asset.rotation = 90;
    expectVisibility(false, "rotated blocker");
    asset.width = 12;
    expectVisibility(true, "narrower footprint");
    asset.width = 36;
    expectVisibility(false, "restored width");
    asset.scatterConfig!.wallHeight = 0;
    expectVisibility(true, "elevated viewer sees over an explicit zero-height blocker");
    delete asset.scatterConfig!.wallHeight;
    expectVisibility(false, "missing height defaults to ten feet");
    asset.scatterConfig!.blocksVision = false;
    expectVisibility(true, "disabled blocking");
  });

  it("reuses the fog atlas across decorative changes and equivalent blocker heights", () => {
    const view = makeVisibilityView();
    const polygons = vi.spyOn(view, "computeVisibilityPolygon");
    const asset = scatter();
    const payload = {
      markers: [{ id: "viewer", markerId: "pc", position: { x: 50, y: 50 }, darkvision: 200 }],
      envAssets: [asset],
      fogOfWar: { enabled: true },
    };
    view.updateMapData(payload);
    const atlasKey = view._fogAtlasKey;
    expect(polygons).toHaveBeenCalled();
    polygons.mockClear();

    asset.scatterConfig!.wallHeight = 10;
    payload.envAssets.push(scatter({ id: "decor", scatterConfig: undefined }));
    view.updateMapData(payload);
    expect(view._fogAtlasKey).toBe(atlasKey);
    expect(polygons).not.toHaveBeenCalled();
  });

  it.each([true, false])("updates cached visibility after a subpixel blocker shift (fog %s)", fogEnabled => {
    const view = makeVisibilityView();
    const polygons = vi.spyOn(view, "computeVisibilityPolygon");
    const asset = scatter();
    const payload = {
      markers: [{ id: "viewer", markerId: "pc", position: { x: 50, y: 50 }, darkvision: 200 }],
      envAssets: [asset],
      fogOfWar: { enabled: fogEnabled },
    };

    view.updateMapData(payload);
    expect(view.pointInPolygon(82.125, 50, polygons.mock.results[0]?.value)).toBe(false);
    polygons.mockClear();
    asset.position.x += 0.25;
    view.updateMapData(payload);
    expect(view.pointInPolygon(82.125, 50, polygons.mock.results[0]?.value)).toBe(true);
  });

  it.each([true, false])("clips light and door icons with the same blockers (fog %s)", fogEnabled => {
    const view = makeVisibilityView();
    const polygons = vi.spyOn(view, "computeVisibilityPolygon");
    const ctx = view.canvas.getContext();
    const viewer = { id: "viewer", markerId: "pc", position: { x: 50, y: 50 }, darkvision: 200 };
    const light = { x: 45, y: 50, bright: 190, dim: 0 };
    const door = { type: "door", start: { x: 150, y: 35 }, end: { x: 150, y: 65 }, open: true };
    const asset = scatter();
    const payload = { markers: [viewer], lightSources: [light], envAssets: [asset], walls: [door], fogOfWar: { enabled: fogEnabled } };

    function expectDoorAndLight(doorVisible: boolean, lightVisible: boolean) {
      polygons.mockClear();
      ctx.fillText.mockClear();
      view.updateMapData(payload);
      const lightIndex = polygons.mock.calls.findIndex(([x, y]) => x === light.x && y === light.y);
      expect(lightIndex).toBeGreaterThanOrEqual(0);
      const lightPolygon = polygons.mock.results[lightIndex]!.value;
      expect(view.pointInPolygon(160, 50, lightPolygon)).toBe(lightVisible);
      if (doorVisible) {
        expect(ctx.fillText).toHaveBeenCalledWith("🚪", 150, 50);
      } else {
        expect(ctx.fillText).not.toHaveBeenCalled();
      }
    }

    expectDoorAndLight(false, false);
    asset.position.y = 100;
    expectDoorAndLight(true, true);
    door.open = false;
    expectDoorAndLight(true, false);
  });

  it("keeps hidden, underground, and collapsed group members out of the surface fog vision", () => {
    const view = makeVisibilityView();
    const polygons = vi.spyOn(view, "computeVisibilityPolygon");
    const group = {
      id: "group", markerId: "pc", visibleToPlayers: true, position: { x: 50, y: 50 },
      tokenGroup: { members: [{ markerId: "pc", position: { x: 170, y: 50 }, darkvision: 200 }] },
    };
    view.updateMapData({
      markers: [
        group,
        { id: "hidden", markerId: "pc", layer: "DM", position: { x: 160, y: 50 }, darkvision: 200 },
        { id: "tunnel", markerId: "pc", tunnelState: { tunnelId: "t" }, position: { x: 180, y: 50 }, darkvision: 200 },
      ],
      envAssets: [scatter()],
      fogOfWar: { enabled: true },
    });
    expect(polygons).toHaveBeenCalled();
    for (const [x, y] of polygons.mock.calls) expect({ x, y }).toEqual(group.position);
    for (const result of polygons.mock.results) expect(view.pointInPolygon(150, 50, result.value)).toBe(false);
  });
});

describe("player map camera state", () => {
  it("round trips framing, rotation and calibrated target coordinates", async () => {
    const view = makeView();
    Object.assign(view, { tabletopMode: false, tabletopPanX: -45, tabletopPanY: 17, tabletopScale: 1.7, tabletopRotation: 90, tabletopTargetX: 123, tabletopTargetY: 456, tabletopTargetViewportX: 40, tabletopTargetViewportY: null });
    const state = view.getState();
    const restored = makeView();
    await restored.setState(state, {});
    expect(restored.getState().camera).toEqual(state.camera);
  });
  it.each(["restored framing", "manual pan", "manual rotation"])("preserves %s on the rendered map", async mode => {
    vi.useFakeTimers();
    const frames: Array<() => void> = [];
    const raf = (callback: () => void) => { frames.push(callback); return frames.length; };
    let doc: any;
    class Element {
      style: Record<string, string> = {};
      children: Element[] = [];
      className = "";
      classList = { add: vi.fn(), remove: vi.fn() };
      listeners: Record<string, (...args: any[]) => void> = {};
      ownerDocument: any;
      complete = false;
      naturalWidth = 1000;
      naturalHeight = 1000;
      width = 0;
      height = 0;
      constructor(public tag = "div") { this.ownerDocument = doc; }
      empty() { this.children = []; }
      addClass() {}
      setText() {}
      toggleClass() {}
      appendChild(child: Element) { this.children.push(child); return child; }
      createDiv(opts: any) { return this.createEl("div", opts); }
      createEl(tag: string, opts: any = {}) {
        const child = new Element(tag);
        child.className = opts.cls || "";
        return this.appendChild(child);
      }
      addEventListener(name: string, callback: (...args: any[]) => void) { this.listeners[name] = callback; }
      removeEventListener() {}
      querySelector(selector: string): Element | null {
        for (const child of this.children) {
          if (selector.startsWith(".") && child.className.split(" ").includes(selector.slice(1))) return child;
          const match = child.querySelector(selector);
          if (match) return match;
        }
        return null;
      }
      getBoundingClientRect() { return { width: 400, height: 300, left: 0, top: 0 }; }
    }
    const win = { requestAnimationFrame: raf, addEventListener: vi.fn(), removeEventListener: vi.fn(), document: null as any };
    doc = { defaultView: win, createElement: (tag: string) => new Element(tag), addEventListener: vi.fn(), removeEventListener: vi.fn() };
    win.document = doc;
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", doc);
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    try {
      const view = makeView();
      const container = new Element();
      view.containerEl = { children: [new Element(), container], win };
      view.register = vi.fn();
      let transformAtReady = "";
      view.onMapReady(() => { transformAtReady = container.querySelector(".dnd-player-map-sled")!.style.transform; });
      await view.setState({ mapConfig: { gridSize: 70 }, camera: {
        tabletopMode: true, panX: -40, panY: -50, scale: 2, rotation: 0,
        targetX: null, targetY: null, targetViewportX: null, targetViewportY: null,
      } }, {});
      const img = container.querySelector(".dnd-player-map-image")!;
      img.complete = true;
      img.listeners.load();
      while (frames.length) frames.shift()!();
      expect(transformAtReady).toBe("translate(-40px, -50px) rotate(0deg) scale(2)");
      expect(container.querySelector(".dnd-player-map-sled")!.style.transform).toBe(transformAtReady);
      const version = view.getCameraCommandVersion();
      if (mode === "manual pan") {
        const wrapper = container.querySelector(".dnd-player-map-wrapper")!;
        wrapper.listeners.mousedown({ clientX: 20, clientY: 30, preventDefault() {} });
        expect(view.getCameraCommandVersion()).toBeGreaterThan(version);
        wrapper.listeners.mousemove({ clientX: 80, clientY: 50 });
        expect(view.getState().camera).toMatchObject({ panX: 20, panY: -30, targetX: null, targetY: null });
        expect(container.querySelector(".dnd-player-map-sled")!.style.transform).toBe("translate(20px, -30px) rotate(0deg) scale(2)");
      } else if (mode === "manual rotation") {
        const toolbar = container.querySelector(".dnd-player-toolbar")!;
        const buttons = toolbar.children.filter(child => child.tag === "button");
        const [left, reset, right] = buttons.slice(-3);
        right!.listeners.click();
        expect(view.getState().camera.rotation).toBe(15);
        expect(view.getCameraCommandVersion()).toBeGreaterThan(version);
        left!.listeners.click();
        expect(view.getState().camera.rotation).toBe(0);
        right!.listeners.click();
        reset!.listeners.click();
        expect(view.getState().camera.rotation).toBe(0);
      }
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("accepts old state without camera and rejects invalid camera numbers", async () => {
    const view = makeView();
    await view.setState({}, {});
    expect(view.getState().camera).toMatchObject({ tabletopMode: true, scale: 1, targetX: null });
    await view.setState({ camera: { scale: -2, panX: NaN, targetX: null } }, {});
    expect(view.getState().camera).toMatchObject({ scale: 1, panX: 0, targetX: null });
  });
});
