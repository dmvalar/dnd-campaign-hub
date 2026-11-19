# Maps and projection specialist

Own map rendering, map persistence, player visibility, markers, projection screens, and handout projection. Follow shared workflow and preservation rules in [../../AGENTS.md](../../AGENTS.md) and [../../CONTRIBUTING.md](../../CONTRIBUTING.md).

## Ownership and entry points

- Map model, construction, persistence, and assets: [src/map/types.ts](../../src/map/types.ts), [MapFactory.ts](../../src/map/MapFactory.ts), [MapPersistence.ts](../../src/map/MapPersistence.ts), [resourcePath.ts](../../src/map/resourcePath.ts), [MapManager.ts](../../src/map/MapManager.ts).
- Interactive editor and host view: [MapController.ts](../../src/map/MapController.ts), [renderMapView.ts](../../src/map-views/renderMapView.ts), [GmMapView.ts](../../src/map-views/GmMapView.ts).
- Player-side rendering/visibility: [PlayerMapView.ts](../../src/map-views/PlayerMapView.ts), [playerMapDigest.ts](../../src/map-views/playerMapDigest.ts), [tunnelUtils.ts](../../src/map-views/tunnelUtils.ts).
- Marker data and storage: [MarkerTypes.ts](../../src/marker/MarkerTypes.ts), [MarkerLibrary.ts](../../src/marker/MarkerLibrary.ts).
- Environmental assets on maps: [EnvAssetTypes.ts](../../src/envasset/EnvAssetTypes.ts), [EnvAssetLibrary.ts](../../src/envasset/EnvAssetLibrary.ts), with editor/render integration in [renderMapView.ts](../../src/map-views/renderMapView.ts).
- Projection lifecycle and screens: [ProjectionManager.ts](../../src/projection/ProjectionManager.ts), [SessionProjectionManager.ts](../../src/projection/SessionProjectionManager.ts), [types.ts](../../src/projection/types.ts), [HandoutProjectionView.ts](../../src/projection/HandoutProjectionView.ts), [InlineHandoutBlock.ts](../../src/projection/InlineHandoutBlock.ts).
- `renderMapView` registers the live map handle with `MapController`; its teardown unregisters that exact handle. Consumers call the controller's typed methods, which own history/redraw/sync/save effects. Renderer config objects are shared and mutable: detect relevant value changes instead of comparing object identity.

## Invariants and boundaries

- `MapController` represents one currently active map. Consumers must handle no active map and must not retain assumptions about a handle after its view closes.
- Map saves serialize per plugin/map, capture each write before asynchronous I/O, and acknowledge only that pending revision. Drain newer edits after an older attempt; retain the latest failed revision for retry. Flush-all joins active writes with bounded retry attempts and leaves persistent failures to their retry timers.
- Agent-created maps use `prepareMapAnnotationCreate`, sharing the annotation mutation queue without a live renderer, debounce or retry timer. Token creation uses `MarkerLibrary.prepareMarkerCreate` with strict persistence and conditional rollback. Preview/planning must not write either store. Image paths identify indexed vault raster files; they are never arbitrary URLs or local paths. Marker storage follows `vault.configDir`, preserving a legacy default-folder library when adopting a custom directory.
- Removing a map code block must stay within a complete fenced block whose parsed top-level `mapId` matches exactly. Preserve other maps, examples, and surrounding note bytes; apply removal against the latest document with `vault.process`.
- Player visibility depends on map state beyond token positions: fog regions/settings, walls and door state, lights, vision settings, elevation, and tunnels feed rendering/digests. Include visibility-relevant fields when changing state or cache keys; stale digests can preserve an old fog frame.
- Fog, daylight occlusion, token visibility, and door-icon sight checks share effective blocking walls, including transformed scatter. Scatter height defaults only when missing; zero remains explicit. Hash fractional blocker geometry and height semantics, and materialize new wall arrays when state changes because the shared wall fingerprint memoizes immutable render arrays.
- Token groups render as a collapsed visible token for vision calculations; do not let hidden group members grant sight from positions the visible group marker has not reached.
- In the player renderer, foreground order matters: ordinary enemy markers remain below fog; player vision tokens and eligible door icons follow the canonical renderer's intentional above-fog rules. Preserve DM-layer hiding and the existing tunnel exceptions; do not make visibility unconditional in a preview.
- Tunnel geometry, token tunnel state, depth, visibility, and cleanup are shared between GM and player rendering. Use [tunnelUtils.ts](../../src/map-views/tunnelUtils.ts) rather than creating divergent geometry rules.
- `PlayerMapView.onMapReady` is the view's readiness boundary for work that needs its map state/canvas installed. Respect it rather than assuming a workspace leaf has rendered synchronously.
- `PlayerMapView` persists tabletop camera values in view state and increments `cameraCommandVersion` as user/programmatic camera actions occur. Delayed fit/orient work must check the captured command version before applying, so it cannot replace a newer camera action.
- `ProjectionManager` serializes operations per screen (`runOnScreen`) and tracks active projections separately from temporary handout leaves/return state. Preserve per-screen ordering and leaf identity checks when altering transitions.
- A handout overlay captures a return state only from primary content, never from another handout. On stop it restores that primary view state when the same leaf is still valid; do not chain handout snapshots as return destinations.
- Keep projection state and map rendering behind `ProjectionManager` / `MapController` APIs. Combat and encounter features may request token placement or controlled awards projection; they do not own renderer closures or projection internals.
- The [sessions specialist](sessions-campaigns.md) owns session decisions about what to show; this specialist owns screen/view transitions. Coordinate shared session-projection changes rather than implementing competing orchestration.
- Any lightweight map display must preserve the canonical player renderer's visibility semantics. If it cannot render fog, walls, lights, or token visibility equivalently, route through the canonical `PlayerMapView` path rather than approximating visibility.

## Focused verification

Run only tests relevant to the change; these commands target existing tests:

```powershell
npm run test -- tests/map/PlayerMapView.test.ts
npm run test -- tests/projection/ProjectionManager.test.ts
npm run test -- tests/map/MapFactory.test.ts
npm run test -- tests/map/MapPersistence.test.ts
npm run test -- tests/map/DeleteMapConfirmModal.test.ts
npm run test -- tests/map/playerMapDigest.test.ts
npm run test -- tests/map/playerMapWalls.test.ts
npm run test -- tests/utils/VisibilityCache.test.ts
npm run test -- tests/map/resourcePath.test.ts
npm run test -- tests/automation/markerPersistence.test.ts tests/automation/AgentContentApi.test.ts
```

For projection or visibility changes, manually inspect GM and player views plus each intended projected screen. Check one fog/wall/light case, a tunnel or grouped-token case when touched, and handout return behavior when transitions changed. Do not report performance measurements unless measured.

## Handoff

Report changed files, the exact focused commands run and results, which render/projection paths were manually inspected, and any unresolved interaction with [combat token placement](encounters-combat.md) or session projection. Coordinate shared-file edits with the primary agent unless the assignment already includes exclusive ownership of those files.
