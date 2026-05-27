# Smart Note Action Bar Audit

Phase 3.2 working notes for `dnd-hub` runtime action bars.

## Current Coverage

- `world`: creation shortcuts for core campaign content.
- `player` / `pc`, `npc`, `creature`, `trap`, `item`, `spell`, `faction`, `point-of-interest`: edit/delete actions.
- `adventure`: create scene, create trap, create session, edit/delete.
- `scene`: edit/delete only before this pass.
- `encounter`: combat tracker and combat-state actions, edit/delete.
- `encounter-table`: roll/regenerate/edit/delete.

## Gaps

- `session` notes did not include a `dnd-hub` block, so they had no runtime action bar.
- `campaign` notes did not include a `dnd-hub` block, so they had no runtime action bar.
- `scene` notes did not expose runtime workflow actions even though they are commonly opened during prep/play.
- Map and handout actions are not first-class note entity actions yet. They should be handled through dedicated inline controls or projection context menus, not generic unclear note buttons.

## First Pass Scope

- Add runtime action bars to new and migrated session/campaign notes.
- Add restrained workflow actions to scenes.
- Keep old notes compatible through migrations where a new `dnd-hub` block is required.
- Avoid adding vague buttons whose behavior is not obvious from the note context.

## Follow-Up Decision

- Map and handout actions remain out of generic note action bars for now.
- Map controls belong either in `dnd-map` rendering or a future inline map control.
- Handout projection belongs in context menus or a future inline handout projection control.
- Action bars should prefer workflow entry points with obvious outcomes: open dashboard, create content, start scene/session, edit/delete.
