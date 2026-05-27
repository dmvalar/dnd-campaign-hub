# Command Palette Audit - Usability Phase 1.2

Date: 2026-05-26

## Summary

The plugin has a large command surface, which is appropriate for power users but difficult for new users to scan. The current direction should be:

- Keep existing command IDs and specific commands stable.
- Add workflow-level `D&D Hub:` commands as the preferred entry points.
- Avoid renaming many legacy commands until replacement workflows have shipped and documentation has caught up.
- Use Phase 2's unified create modal to reduce reliance on dozens of `Create New ...` commands.

## Workflow Commands Added

- `D&D Hub: Open Campaign Home`
- `D&D Hub: Start Session`
- `D&D Hub: Prepare Next Session`
- `D&D Hub: Create Content`
- `D&D Hub: Open GM Tools`

These should be documented and recommended as the first commands new users learn.

## Command Groups Observed

- Setup and maintenance: initialize, migrate templates, purge data, reset focus
- Campaign workflow: Campaign Home, campaign/session creation, prep/run dashboards
- Entity CRUD: NPCs, PCs, adventures, scenes, traps, items, creatures, factions, encounters
- Maps and party: map creation/manager, battlemap templates, Party Manager
- Combat and pursuit: combat state, tracker, turn controls, pursuit tracker
- Music and SFX: music player, scene music, inline SFX, Freesound
- Projection: session projection hub/start/stop
- Encounter tables: create, insert, roll, reroll, edit, delete

## Recommendations

- Keep low-level commands available for advanced users.
- Prefer `D&D Hub:` prefix for new workflow commands.
- Do not rename existing commands in bulk yet; that would disrupt user muscle memory and saved hotkeys.
- For future work, add a unified create modal and route `D&D Hub: Create Content` to that modal instead of the legacy hub.
- Consider adding command aliases later rather than renaming, for example:
  - `D&D Hub: Manage Maps` as an alias for Map Manager
  - `D&D Hub: Manage Party` as an alias for Party Manager
  - `D&D Hub: Manage Music` as an alias for Music Player / Music Settings

## Phase 1.2 Result

Phase 1.2 is complete enough to move forward. New users now have obvious workflow commands, while existing power-user commands remain stable.

