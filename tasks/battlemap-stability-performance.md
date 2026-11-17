# Battlemap Stability and Performance

Status: **Implementation and automated validation complete; manual Obsidian verification pending.**

## Tasks ordered by impact and priority

1. **P1 — Prevent visibility leaks during dragging: implemented.** Complex markers use the normal fog, wall, layer, and tunnel renderer. Simple surface player tokens retain a lightweight preview. See [PlayerMapView.ts](../src/map-views/PlayerMapView.ts).
2. **P1 — Clear stale handout return state: implemented.** After map A → handout → map B, the handout is inactive and stopping it leaves B displayed. Return snapshots belong to the original leaf and clear on replacement, stop, and dead-window cleanup. Per-screen operations wait for seamless swaps and recover after callback failures. See [ProjectionManager.ts](../src/projection/ProjectionManager.ts).
3. **P2 — Restore camera and calibration after handout: implemented.** Full primary view state restores on managed and unmanaged screens. Pan, scale, rotation, and camera targets apply after media layout, before readiness callbacks reveal the map. See [ProjectionManager.ts](../src/projection/ProjectionManager.ts) and [PlayerMapView.ts](../src/map-views/PlayerMapView.ts).
4. **P2 — Integrate token dragging: implemented.** The preview token is excluded from the base canvas, survives flicker redraws, and clears on drop or fallback. Live fog updates use the normal renderer; on-drop mode retains frozen fog. See [PlayerMapView.ts](../src/map-views/PlayerMapView.ts).
5. **P2 — Regression tests: complete.** Added 15 player-map, 37 projection-lifecycle, and 1 combat-listener regression tests. **Manual Obsidian verification remains open** below.

## Automated validation

- `npm run check`: passed.
- `npm run test`: 14 test files, 162 tests passed (53 added).
- `npm run build`: passed; output in `dist/`.
- `git diff --check`: passed.

Tests: [PlayerMapView.test.ts](../tests/map/PlayerMapView.test.ts), [ProjectionManager.test.ts](../tests/projection/ProjectionManager.test.ts), [CombatTracker.test.ts](../tests/combat/CombatTracker.test.ts).

Work was split between Terra for player rendering/camera state, Sol for projection lifecycle, and Luna for the task record/combat regression, followed by integration review and the full validation sequence.

## Manual acceptance checklist

- [ ] DM-layer player tokens and Background-layer creatures stay hidden during dragging; creatures remain occluded by fog and walls. Intended tunnel visibility follows the normal renderer.
- [ ] Visibility remains correct across groups and tunnels.
- [ ] Dragging a token never shows a duplicate token on the base.
- [ ] Verify both on-drop and while-dragging fog modes.
- [ ] Project map A → handout → stop handout; confirm A and its camera return. Repeat with successive handouts on managed and unmanaged screens.
- [ ] Project map A → handout → map B; confirm the handout is inactive and stopping it leaves B displayed. Repeat with combat/pursuit/awards replacement, stop all, and close/reopen the projection window.
- [ ] Check a calibrated, rotated view with auto-pan off and on.
- [ ] Check a large map for responsive performance and verify the map popout.

No manual results or performance timings have been recorded yet.
