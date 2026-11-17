# D&D Campaign Hub 0.15.0-beta.1

**Beta / unstable testing release.** Automated checks pass; manual Obsidian display and large-map performance testing remain open. This release is published from `feature/battlemap-stability-performance` for testing before a stable release.

## Highlights

- Fix hidden-token leaks and duplicate tokens during dragging, retaining lightweight previews for simple surface player tokens and normal visibility rendering for complex cases.
- Honor both on-drop and live fog updates.
- Restore the correct map after handouts and retain camera pan, scale, rotation, and calibration targets on managed and unmanaged screens.
- Queue projection transitions through delayed map swaps; clear stale return state when switching content, stopping projections, or closing windows.
- Stabilize auto-pan/zoom, immediately synchronize initiative overlays, and import encounter tokens near the GM viewport without occupying existing token cells.
- Project room-note images directly from battlemap previews.

This build also includes work since the `v0.14.0` tag: multiple-adventure session editing and scene tabs, combat undo, template/background/grid synchronization fixes, campaign evidence notes, and inline sound-effect stop controls. See [CHANGELOG.md](https://github.com/dmvalar/dnd-campaign-hub/blob/v0.15.0-beta.1/CHANGELOG.md) for details.

## Install for testing

Download `main.js`, `manifest.json`, and `styles.css` from this release and copy them into your test vault's `.obsidian/plugins/dnd-campaign-hub/` directory. Reload Obsidian and enable the plugin. The attached `dnd-campaign-hub-0.15.0-beta.1.zip` contains the same three files at its root.

Alternatively, use BRAT's **Add a beta plugin for testing** command, enter `dmvalar/dnd-campaign-hub`, and select the specific release `v0.15.0-beta.1`. Use BRAT or manual installation to switch back to stable or upgrade to the eventual stable release.

## Test checklist

- Drag hidden DM-layer player tokens, Background-layer creatures, and creatures behind walls/fog; confirm the player screen preserves normal visibility rules.
- Drag ordinary player tokens, groups, and tunnel tokens; check for duplicates and verify both fog update modes.
- Project map A, show one or more handouts, then stop the handout; confirm A and its saved camera return on managed and unmanaged screens.
- Project A, show a handout, then project B or combat/pursuit/awards; stopping a stale handout must not restore A. Repeat rapid map-to-handout transitions.
- Stop all projections and close/reopen projection windows; confirm old handouts do not return.
- Check rotated/calibrated maps with auto-pan enabled and disabled, initiative changes, encounter imports, and large-map/popout responsiveness.

Report findings at [GitHub Issues](https://github.com/dmvalar/dnd-campaign-hub/issues), including the beta version, Obsidian version, map size, fog mode, reproduction steps, and relevant console errors.

## Validation

- TypeScript check passed.
- All 162 tests passed across 14 files, including 53 new regressions.
- Production build passed.
