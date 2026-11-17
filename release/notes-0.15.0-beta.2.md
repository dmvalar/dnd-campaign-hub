# D&D Campaign Hub 0.15.0-beta.2

**Beta / unstable testing release from `dev`.** This build combines the battlemap work from beta.1 with the integrated session and usability changes. Manual Obsidian acceptance testing remains open before a stable release.

## New since beta.1

- Session lifecycle handling for planned, in-progress, completed, and archived sessions, plus archive/delete controls.
- Session-focused preparation and per-session scene planning, with fallback when a planned scene is stale.
- Linked-adventure support in live sessions, clearer adventure selection, preserved completion state, and reconciled session backlinks after edits.
- Unsaved-change protection in major creation/editing modals, including scene-plan changes.
- Unified campaign content search, preserved core shortcuts, clearer workflow language, and actionable empty states.
- Isolation of the session run-dashboard workspace state.
- Manual player-map panning and rotation now cancel stale delayed centering.

All beta.1 battlemap, fog/drag, handout restoration, camera persistence, auto-pan/zoom, initiative-overlay, and encounter-import improvements are included. The dice-roller feature was abandoned and is not part of this release.

## Install or update

Download `main.js`, `manifest.json`, and `styles.css` from this release and copy them into your test vault's `.obsidian/plugins/dnd-campaign-hub/` directory. Reload Obsidian and enable the plugin. The attached `dnd-campaign-hub-0.15.0-beta.2.zip` contains the same three files at its root.

Alternatively, use BRAT to install `dmvalar/dnd-campaign-hub` at the specific version `v0.15.0-beta.2`. If your installation is pinned to beta.1, select beta.2 explicitly. Use BRAT or manual installation to move to the eventual stable release.

## Test checklist

- Create, start, finish, and archive sessions. Check current-session selection, session-focused preparation, and preserved completion state. Verify delete controls using a disposable test session.
- Plan scenes for a session, edit linked adventures/scenes, and verify backlink updates and fallback when a planned scene is missing.
- Change a major modal and attempt to close it; verify keep-editing/discard choices and that saved forms close normally. Include scene-plan edits.
- Run a session linked to multiple adventures; verify scene selection, dashboard navigation, and quick-note/workspace behavior across sessions.
- Search campaign content and check keyboard interaction, existing shortcuts, empty results, and opening a selected result.
- Check hidden DM-layer player tokens, Background-layer creatures, walls/fog, groups, tunnels, duplicate-free dragging, and both fog update modes.
- Project map A, show successive handouts, and stop them; confirm the correct map and calibrated/rotated camera return on managed and unmanaged screens.
- Replace a handout with map B or combat/pursuit/awards, stop all projections, and close/reopen windows; confirm old handouts do not return.
- Pan and rotate the player map immediately after opening it; confirm delayed initial centering does not override manual control. Check auto-pan enabled/disabled, encounter imports, initiative updates, and large-map/popout responsiveness.

Report findings at [GitHub Issues](https://github.com/dmvalar/dnd-campaign-hub/issues), including `0.15.0-beta.2`, the Obsidian version, reproduction steps, relevant console errors, and map size/fog mode where applicable.

## Validation and follow-ups

- TypeScript check, all 186 tests across 21 files, and production build passed.
- 24 tests were added since beta.1.
- Manual visual and performance checks above remain pending.
- The development dependency audit follow-up is recorded in [tasks/todo.md](https://github.com/dmvalar/dnd-campaign-hub/blob/v0.15.0-beta.2/tasks/todo.md). The November 17 production-only audit reported zero findings; development tooling has nine findings pending review.

See the [changelog](https://github.com/dmvalar/dnd-campaign-hub/blob/v0.15.0-beta.2/CHANGELOG.md) and [changes since beta.1](https://github.com/dmvalar/dnd-campaign-hub/compare/v0.15.0-beta.1...v0.15.0-beta.2).
