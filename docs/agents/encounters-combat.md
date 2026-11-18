# Encounters and combat specialist

Own encounter construction/difficulty, combat state and views, traps, and combat integration with party data. Follow shared workflow and preservation rules in [../../AGENTS.md](../../AGENTS.md) and [../../CONTRIBUTING.md](../../CONTRIBUTING.md).

## Ownership and entry points

- Combat engine and state types: [src/combat/CombatTracker.ts](../../src/combat/CombatTracker.ts), [src/combat/types.ts](../../src/combat/types.ts), [CombatTrackerView.ts](../../src/combat/CombatTrackerView.ts), [CombatPlayerView.ts](../../src/combat/CombatPlayerView.ts), [CombatAwardsView.ts](../../src/combat/CombatAwardsView.ts).
- Encounter building and math: [src/encounter/EncounterBuilder.ts](../../src/encounter/EncounterBuilder.ts), [EncounterBuilderModal.ts](../../src/encounter/EncounterBuilderModal.ts), [DifficultyMath.ts](../../src/encounter/DifficultyMath.ts), [EncounterGenerator.ts](../../src/encounter/EncounterGenerator.ts).
- Trap authoring and initiative conversion: [src/trap/TrapCreationModal.ts](../../src/trap/TrapCreationModal.ts).
- Party roster and stored encounter integration: [src/party/PartyManager.ts](../../src/party/PartyManager.ts), [PartyTypes.ts](../../src/party/PartyTypes.ts).
- Map interaction boundary: [src/map/MapController.ts](../../src/map/MapController.ts). Use its public methods for token queries/placement; do not access `renderMapView` closure state. Map and projection implementation belongs to the maps specialist.

## Invariants and boundaries

- `CombatTracker.getState()` copies combatants, status arrays, and death-save objects, but does not deep-clone every nested value (status entries are shared). Treat returned state as read-only and change combat through tracker methods. A throwing listener is logged and must not prevent other listeners receiving updates.
- Undo stores cloned pre-action combat state (up to 25 entries) and sort direction. Add undo snapshots before mutating state, and keep undo records out of public combat state.
- Damage consumes temporary HP first, then current HP. Damage at zero HP updates death-save failures (critical damage counts twice); preserve massive-damage/death behavior and the event's source attribution when changing combat resolution.
- Turns skip disabled and defeated hostile combatants, while friendly/player combatants at zero HP are not classified as defeated hostiles by that predicate. Preserve eligibility semantics in turn advancement.
- Traps can supply fixed initiative values. Keep fixed initiative values distinct from rolled initiative when importing trap combatants; trap state also carries hidden/enabled/defeated visibility/turn behavior through combatant fields.
- Encounter and trap notes are user data. When persisting changes, preserve unrelated note content/frontmatter; schema additions must follow shared migration guidance.
- Encounter/trap edits update owned fields against the latest document and preserve authored sections. Check destination collisions before changing notes or statblocks, use `fileManager.renameFile` for renames, and never delete the source note to rename it. Keep the original edit path usable after a failed save.
- Combat owns awards data and content; the [maps specialist](maps-projection.md) owns projection lifecycle. Route display through `ProjectionManager` interfaces instead of reaching into projection view/leaf internals.
- Keep encounter calculations in `DifficultyMath`/builder interfaces and map operations behind `MapController`; avoid cross-system closure access or importing map-view internals.
- PartyManager treats PC note frontmatter as the source of truth for stats and also stores party/encounter data. Coordinate any party schema change with that ownership boundary.
- Stored encounters can use a scene as their source `notePath`. `remapEncounterNotePaths` updates only those source paths, applies each mapping once, and propagates persistence failure; combatant and party-member note paths remain separate. Party persistence writes share one queue.

## Focused verification

Run only tests relevant to the change; these commands target existing tests:

```powershell
npm run test -- tests/combat/CombatTracker.test.ts
npm run test -- tests/encounter/DifficultyMath.test.ts
npm run test -- tests/encounter/EncounterBuilderModal.test.ts tests/trap/TrapCreationModal.test.ts
npm run test -- tests/party/PartyManager.test.ts
npm run test -- tests/migration/encounter-migration.test.ts
```

For UI or integration changes, manually check combat start/import, turn movement, damage/healing and undo as applicable; check player-facing hidden/defeated visibility when those fields change. When integrating with maps, verify through the controller-backed UI path. Documentation-only changes do not require these checks.

## Handoff

Report changed files, exact focused commands and results, manual combat/map/projection checks relevant to the change, and any unresolved boundary with party persistence or maps/projection. Leave shared `src/main.ts`, templates, migrations, and styles changes to the coordinator unless explicitly assigned.
