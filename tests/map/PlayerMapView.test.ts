import { describe, expect, it, vi } from "vitest";

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
    view.drawFogOfWar(ctx, 500, 500, payload);
    expect(view._computeFogDigest).not.toHaveBeenCalled();
    expect(ctx.drawImage).toHaveBeenCalledWith(atlas, 0, 0);
    view.plugin.settings.visionUpdateMode = "while-dragging";
    view.drawFogOfWar(ctx, 500, 500, payload);
    expect(view._computeFogDigest).toHaveBeenCalledTimes(1);
    expect(view._dragLastFogCol).toBe(1);
    view.drawFogOfWar(ctx, 500, 500, payload);
    expect(view._computeFogDigest).toHaveBeenCalledTimes(1);
    payload.markers[0].position.x = 150;
    view.drawFogOfWar(ctx, 500, 500, payload);
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

describe("player map camera state", () => {
  it("round trips framing, rotation and calibrated target coordinates", async () => {
    const view = makeView();
    Object.assign(view, { tabletopMode: false, tabletopPanX: -45, tabletopPanY: 17, tabletopScale: 1.7, tabletopRotation: 90, tabletopTargetX: 123, tabletopTargetY: 456, tabletopTargetViewportX: 40, tabletopTargetViewportY: null });
    const state = view.getState();
    const restored = makeView();
    await restored.setState(state, {});
    expect(restored.getState().camera).toEqual(state.camera);
  });
  it("applies restored framing to the sled before media-ready callbacks", async () => {
    vi.useFakeTimers();
    const frames: Array<() => void> = [];
    const raf = (callback: () => void) => { frames.push(callback); return frames.length; };
    let doc: any;
    class Element {
      style: Record<string, string> = {};
      children: Element[] = [];
      className = "";
      classList = { add: vi.fn(), remove: vi.fn() };
      listeners: Record<string, () => void> = {};
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
      addEventListener(name: string, callback: () => void) { this.listeners[name] = callback; }
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
