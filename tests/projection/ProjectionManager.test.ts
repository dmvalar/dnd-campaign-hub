import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectionManager } from '../../src/projection/ProjectionManager';
import { screenKey, type ScreenInfo } from '../../src/utils/ScreenEnumeration';
import {
  PLAYER_MAP_VIEW_TYPE, HANDOUT_PROJECTION_VIEW_TYPE, COMBAT_PLAYER_VIEW_TYPE,
  COMBAT_AWARDS_VIEW_TYPE, PURSUIT_PLAYER_VIEW_TYPE,
} from '../../src/constants';

vi.mock('obsidian', () => ({ Notice: class {}, WorkspaceLeaf: class {} }));
vi.mock('../../src/utils/MonitorPhysicalSize', () => ({
  queryPhysicalMonitorSizes: () => [], matchScreenToPhysical: () => null,
}));

const screen: ScreenInfo = {
  label: 'Table', isPrimary: false, isInternal: false,
  left: 1920, top: 0, width: 1920, height: 1080,
  availLeft: 1920, availTop: 0, availWidth: 1920, availHeight: 1080, devicePixelRatio: 1,
};
const key = screenKey(screen);
type ViewState = { type: string; state?: Record<string, any>; active?: boolean };

/** A leaf creates a new view on each type change, as Obsidian does. */
class FakeLeaf {
  value: ViewState = { type: 'idle', state: {} };
  view: any;
  readyImmediately = true;
  readyCallbacks: Array<() => void> = [];
  detach = vi.fn(() => { this.view.containerEl.isConnected = false; });
  setViewState = vi.fn(async (state: ViewState) => {
    this.value = state;
    this.view = {
      containerEl: { isConnected: true, ownerDocument: { defaultView: window } },
      onMapReady: vi.fn((callback: () => void) => {
        if (this.readyImmediately) callback();
        else this.readyCallbacks.push(callback);
      }),
      fadeInInitial: vi.fn(),
    };
    if (state.type === PLAYER_MAP_VIEW_TYPE) {
      this.view.swapMap = vi.fn((mapId: string, mapConfig: any, imageResourcePath: string,
        ready?: (fadeIn: () => void) => void) => {
        this.value.state = { mapId, mapConfig, imageResourcePath };
        ready?.(() => {});
      });
    }
  });
  getViewState() { return this.value; }
  constructor() {
    this.view = { containerEl: { isConnected: true, ownerDocument: { defaultView: window } } };
  }
}

function setup(managed = false) {
  const leaves: FakeLeaf[] = [];
  const managedLeaf = managed ? new FakeLeaf() : undefined;
  if (managedLeaf) leaves.push(managedLeaf);
  let activeHandout: unknown = null;
  const spm = {
    isActive: () => managed,
    isManagedScreen: (sKey: string) => managed && sKey === key,
    getManagedLeaf: () => managedLeaf,
    hasActiveHandout: () => !!activeHandout,
    setHandoutStatus: vi.fn((_key: string, state: unknown) => { activeHandout = state; }),
    clearHandout: vi.fn(() => { activeHandout = null; }),
    setScreenStatus: vi.fn(),
    transitionToIdle: vi.fn(async () => {
      activeHandout = null;
      await managedLeaf?.setViewState({ type: 'idle', state: { configuredBackground: 'tavern.jpg' } });
    }),
  };
  const plugin = {
    app: { workspace: { openPopoutLeaf: vi.fn(() => {
      const leaf = new FakeLeaf(); leaves.push(leaf); return leaf;
    }) } },
    settings: { projectionTargets: [], tabletopCalibration: null },
    saveSettings: vi.fn(async () => {}), sessionProjectionManager: spm,
  };
  const manager = new ProjectionManager(plugin as any);
  vi.spyOn(manager, 'positionAndFullscreen').mockResolvedValue();
  const project = (id: string, onReady?: () => void) =>
    manager.project(id, { name: id, gridSize: 50 }, `${id}.png`, screen, 'free', onReady);
  const handout = (name = 'letter.png') => manager.projectHandout(name, 'image', screen);
  return { manager, plugin, spm, leaves, project, handout };
}

let managers: ProjectionManager[];
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', {});
  managers = [];
});
afterEach(() => {
  managers.forEach(manager => manager.destroy());
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fixture(managed = false) {
  const result = setup(managed); managers.push(result.manager); return result;
}

describe.each([false, true])('handout lifecycle (managed=%s)', managed => {
  it('does not restore map A after the handout was replaced by map B', async () => {
    const { manager, leaves, project, handout } = fixture(managed);
    await project('A');
    await handout();
    await project('B');
    await manager.stopHandout(key);
    expect(manager.activeProjections.get(key)?.mapId).toBe('B');
    expect(leaves[0]!.value.state?.mapId).toBe('B');
    expect(manager.hasActiveHandout(key)).toBe(false);
    expect(leaves[0]!.detach).not.toHaveBeenCalled();
    expect(leaves).toHaveLength(1);
  });

  it('preserves the first primary state through repeated handouts, including camera', async () => {
    const { manager, leaves, project, handout } = fixture(managed);
    await project('A');
    const leaf = leaves[0]!;
    leaf.value.state!.camera = { tabletopMode: true, panX: 321, panY: -41, scale: 2, rotation: 90 };
    const original = structuredClone(leaf.value.state);
    await handout('one.png');
    await handout('two.png');
    await manager.stopHandout(key);
    expect(leaf.value.type).toBe(PLAYER_MAP_VIEW_TYPE);
    expect(leaf.value.state).toEqual(original);
    expect(leaf.detach).not.toHaveBeenCalled();
  });

  it.each(['combat', 'awards', 'pursuit'] as const)('forgets the old map when switching to %s', async type => {
    const { manager, leaves, project, handout } = fixture(managed);
    await project('A'); await handout();
    const expected = type === 'combat' ? COMBAT_PLAYER_VIEW_TYPE
      : type === 'awards' ? COMBAT_AWARDS_VIEW_TYPE : PURSUIT_PLAYER_VIEW_TYPE;
    if (type === 'combat') await manager.projectCombatView(screen);
    else if (type === 'awards') await manager.projectCombatAwardsView(screen, { round: 7 } as any);
    else await manager.projectPursuitView(screen);
    await manager.stopHandout(key);
    expect(leaves[0]!.value.type).toBe(expected);
    expect(manager.hasActiveHandout(key)).toBe(false);
    expect(leaves[0]!.detach).not.toHaveBeenCalled();
  });

  it('restores awards with their complete finished combat payload', async () => {
    const { manager, leaves, handout } = fixture(managed);
    const combatState = { round: 7, combatants: [{ id: 'dead-dragon', xp: 5000 }] } as any;
    await manager.projectCombatAwardsView(screen, combatState);
    await handout(); await manager.stopHandout(key);
    expect(leaves[0]!.value).toMatchObject({ type: COMBAT_AWARDS_VIEW_TYPE, state: { combatState } });
  });

  it.each([true, false])('runs restored map callback after readiness (immediate=%s)', async immediate => {
    const { manager, leaves, project, handout } = fixture(managed);
    const onReady = vi.fn();
    await project('A', onReady);
    await handout();
    leaves[0]!.readyImmediately = immediate;
    await manager.stopHandout(key);
    expect(onReady).toHaveBeenCalledTimes(immediate ? 1 : 0);
    expect(leaves[0]!.view.fadeInInitial).toHaveBeenCalledTimes(immediate ? 1 : 0);
    leaves[0]!.readyCallbacks.forEach(callback => callback());
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(leaves[0]!.view.fadeInInitial).toHaveBeenCalledTimes(1);
  });

  it('ignores a restored map readiness callback after the screen changes again', async () => {
    const { manager, leaves, project, handout } = fixture(managed);
    const onReady = vi.fn();
    await project('A', onReady); await handout();
    leaves[0]!.readyImmediately = false;
    await manager.stopHandout(key);
    await manager.projectCombatView(screen);
    leaves[0]!.readyCallbacks.forEach(callback => callback());
    expect(onReady).not.toHaveBeenCalled();
  });

  it('clears the return destination on stop-all and never resurrects it', async () => {
    const { manager, leaves, project, handout, spm } = fixture(managed);
    await project('A'); await handout();
    await manager.stopAllProjections();
    await manager.stopHandout(key);
    expect(manager.activeProjections.size).toBe(0);
    expect(manager.hasActiveHandout(key)).toBe(false);
    if (managed) expect(spm.transitionToIdle).toHaveBeenCalledOnce();
    else expect(leaves[0]!.detach).toHaveBeenCalledOnce();
    expect((manager as any).handoutReturnStates.size).toBe(0);
  });

  it('preserves the return snapshot if a replacement transition fails', async () => {
    const { manager, leaves, project, handout } = fixture(managed);
    await project('A'); await handout();
    const crossfade = vi.spyOn(manager, 'crossfadeOnLeaf').mockRejectedValueOnce(new Error('swap failed'));
    await expect(manager.projectCombatView(screen)).rejects.toThrow('swap failed');
    crossfade.mockRestore();
    await manager.stopHandout(key);
    expect(leaves[0]!.value.state?.mapId).toBe('A');
  });
});

it('closes a repeated standalone handout instead of restoring its previous file', async () => {
  const { manager, leaves, handout } = fixture();
  await handout('one.png'); await handout('two.png');
  await manager.stopHandout(key);
  expect(leaves).toHaveLength(1);
  expect(leaves[0]!.detach).toHaveBeenCalledOnce();
  expect((manager as any).handoutReturnStates.size).toBe(0);
});

it('reuses a standalone handout leaf for new primary content without later detaching it', async () => {
  const { manager, leaves, handout, project } = fixture();
  await handout(); await project('B'); await manager.stopHandout(key);
  expect(leaves).toHaveLength(1);
  expect(leaves[0]!.value.state?.mapId).toBe('B');
  expect(leaves[0]!.detach).not.toHaveBeenCalled();
});

it('returns a managed handout without primary content to configured idle', async () => {
  const { manager, leaves, handout, spm } = fixture(true);
  await handout('one.png'); await handout('two.png'); await manager.stopHandout(key);
  expect(spm.transitionToIdle).toHaveBeenCalledOnce();
  expect(leaves[0]!.value).toMatchObject({ type: 'idle', state: { configuredBackground: 'tavern.jpg' } });
});

it.each(['disconnected', 'closed-window'] as const)('prunes %s handouts before reopening that screen', async failure => {
  const { manager, leaves, project, handout } = fixture();
  await project('A'); await handout();
  if (failure === 'disconnected') leaves[0]!.view.containerEl.isConnected = false;
  else leaves[0]!.view.containerEl.ownerDocument.defaultView = { closed: true };
  expect(manager.isProjectionAliveOnScreen(key)).toBe(false);
  expect(manager.hasActiveHandout(key)).toBe(false);
  expect((manager as any).handoutReturnStates.size).toBe(0);
  await handout('new.png');
  await manager.stopHandout(key);
  expect(leaves).toHaveLength(2);
  expect(leaves[1]!.detach).toHaveBeenCalledOnce();
});

it('notifies when the health check prunes a standalone handout', async () => {
  const { manager, leaves, handout } = fixture();
  await handout();
  const changed = vi.fn(); manager.onChange(changed);
  leaves[0]!.view.containerEl.isConnected = false;
  await vi.advanceTimersByTimeAsync(3000);
  expect(changed).toHaveBeenCalledOnce();
  expect(manager.hasActiveHandout(key)).toBe(false);
});

it('queues simultaneous transitions and includes pending screens in stop-all', async () => {
  const { manager, leaves, project, handout } = fixture();
  const a = project('A');
  const h = handout();
  const b = project('B');
  const stopped = manager.stopAllProjections();
  await Promise.all([a, h, b, stopped]);
  expect(manager.activeProjections.size).toBe(0);
  expect(manager.hasActiveHandout(key)).toBe(false);
  expect(leaves[0]!.detach).toHaveBeenCalledOnce();
});

it('does not run delayed initial map fitting after switching to a handout', async () => {
  const { manager, handout } = fixture();
  const fit = vi.spyOn(manager as any, 'autoOrientAndFit');
  const onReady = vi.fn();
  await manager.project('A', { gridSize: 50 }, 'A.png', screen, 'battle', onReady);
  await handout();
  await vi.advanceTimersByTimeAsync(300);
  expect(fit).not.toHaveBeenCalled();
  expect(onReady).not.toHaveBeenCalled();
});

it('checks map identity again after fullscreen positioning awaits', async () => {
  const { manager, handout } = fixture();
  let release!: () => void;
  vi.mocked(manager.positionAndFullscreen).mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
  const fit = vi.spyOn(manager as any, 'autoOrientAndFit');
  await manager.project('A', { gridSize: 50 }, 'A.png', screen, 'battle');
  await vi.advanceTimersByTimeAsync(300);
  await handout(); release(); await Promise.resolve();
  expect(fit).not.toHaveBeenCalled();
});

it('invalidates an older timer when reprojecting the same map on the same leaf', async () => {
  const { manager, project } = fixture();
  const fit = vi.spyOn(manager as any, 'autoOrientAndFit');
  await manager.project('A', { gridSize: 50 }, 'A.png', screen, 'battle');
  await project('A');
  await vi.advanceTimersByTimeAsync(300);
  expect(fit).not.toHaveBeenCalled();
});

it('waits for a seamless map swap to install B before a queued handout snapshots it', async () => {
  const { manager, leaves, project, handout } = fixture();
  await project('A');
  const leaf = leaves[0]!;
  let finishSwap!: () => void;
  leaf.view.swapMap.mockImplementation((mapId: string, mapConfig: any, imageResourcePath: string,
    ready: (fadeIn: () => void) => void) => {
    finishSwap = () => {
      leaf.value.state = { mapId, mapConfig, imageResourcePath };
      ready(() => {});
    };
  });
  const swap = project('B');
  const overlay = handout();
  await Promise.resolve(); await Promise.resolve();
  expect(leaf.value.state?.mapId).toBe('A');
  finishSwap();
  await Promise.all([swap, overlay]);
  await manager.stopHandout(key);
  expect(leaf.value.state?.mapId).toBe('B');
  expect(manager.activeProjections.get(key)?.mapId).toBe('B');
});

it('does not execute queued screen operations after destruction', async () => {
  const { manager, plugin, project, handout } = fixture();
  const a = project('A'); const h = handout();
  manager.destroy();
  await Promise.all([a, h]);
  expect(plugin.app.workspace.openPopoutLeaf).not.toHaveBeenCalled();
  expect(manager.activeProjections.size).toBe(0);
});

it('reveals a restored map after readiness even when it has no framing callback', async () => {
  const { manager, leaves, project, handout } = fixture();
  await project('A'); await handout();
  leaves[0]!.readyImmediately = false;
  await manager.stopHandout(key);
  expect(leaves[0]!.view.fadeInInitial).not.toHaveBeenCalled();
  leaves[0]!.readyCallbacks.forEach(callback => callback());
  expect(leaves[0]!.view.fadeInInitial).toHaveBeenCalledOnce();
});

it('does not restore or detach the old primary when a managed monitor reopens on another leaf', async () => {
  const { manager, leaves, project, handout, spm } = fixture(true);
  await project('A'); await handout();
  const replacement = new FakeLeaf(); leaves.push(replacement);
  spm.getManagedLeaf = () => replacement;
  await handout('new.png');
  await manager.stopHandout(key);
  expect(manager.activeProjections.size).toBe(0);
  expect(spm.transitionToIdle).toHaveBeenCalledOnce();
  expect(replacement.detach).not.toHaveBeenCalled();
  expect(leaves[0]!.detach).not.toHaveBeenCalled();
});

it('continues the screen queue after a seamless swap readiness callback throws', async () => {
  const { manager, leaves, project, handout } = fixture();
  await project('A');
  const swapped = project('B', () => { throw new Error('framing failed'); });
  const overlay = handout();
  await expect(swapped).rejects.toThrow('framing failed');
  await overlay;
  expect(leaves[0]!.value.type).toBe(HANDOUT_PROJECTION_VIEW_TYPE);
  // The installed map B remains the actual destination after the callback error.
  manager.activeProjections.get(key)!.onReady = undefined;
  await manager.stopHandout(key);
  expect(leaves[0]!.value.state?.mapId).toBe('B');
});

it('leaves a newer camera command intact when delayed centering retries', async () => {
  const { manager } = fixture();
  let version = 0;
  let viewportWidth = 0;
  const transformed = vi.fn();
  const completed = vi.fn();
  const view = {
    getCameraCommandVersion: () => version,
    mapImage: { naturalWidth: 1000, naturalHeight: 1000 },
    mapContainer: { getBoundingClientRect: () => ({ width: viewportWidth, height: 300 }) },
    tabletopScale: 1, tabletopRotation: 0, tabletopPanX: 0, tabletopPanY: 0,
    applyTabletopTransform: transformed,
  };
  (manager as any).centerMapInViewport(view, completed);
  view.tabletopPanX = 123;
  view.tabletopPanY = -45;
  version++;
  viewportWidth = 400;
  await vi.advanceTimersByTimeAsync(100);
  expect(view.tabletopPanX).toBe(123);
  expect(view.tabletopPanY).toBe(-45);
  expect(transformed).not.toHaveBeenCalled();
  expect(completed).toHaveBeenCalledOnce();
});
