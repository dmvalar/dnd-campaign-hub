# Template Clarity Audit

Phase 4.2 focuses on reducing visible clutter in newly generated notes while keeping existing notes intact.

## Findings

- Campaign notes had example links that looked like real content before anything was configured.
- Session notes front-loaded long blank checklists and separators before the GM had written a recap or scene plan.
- Adventure notes mixed planning metadata, GM advice, and placeholder checklist content into the first screen.
- Scene notes were compact but ended with an empty divider instead of a clear body prompt.
- Creature/NPC/player notes are more domain-heavy and should be handled in a later, more focused pass.

## Current Pass

- [x] Review generated templates for visible clutter.
- [x] Simplify campaign, session, adventure, and scene note bodies for new notes.
- [x] Keep runtime action blocks (`dnd-hub`, `dnd-hub-view`) as the place for plugin controls.
- [x] Add version-only migrations so existing notes are not rewritten.

## Follow-Up

- Review NPC/player/creature templates separately; they contain useful structure, but too much of it may appear before the first user-authored note.
- Consider runtime-rendered summary cards for campaign/adventure metadata if users still find the generated notes dense.
