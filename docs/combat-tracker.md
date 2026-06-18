
# Combat Tracker

The Combat Tracker manages initiative order, combatant state, and integration with battle map tokens. It provides a full GM sidebar view and a read-only Player view for projection to external screens.

## Open the Combat Tracker

Run **Open Combat Tracker** from the Command Palette. The tracker opens as a sidebar panel.

## GM view

The GM sidebar shows:

- **Initiative order** — combatants sorted by initiative roll with round counter.
- **Encounter launcher** — when no combat is active, search saved combat states and all encounter notes from one list, then resume or run the selected encounter.
- **Combatant rows** — each row displays name, HP (current / max), AC, and active status effects. Rows are expandable for detailed editing.
- **Tie ordering** — when two or more combatants share the same initiative, drag one row onto another row with that initiative to swap their order.
- **HP tracking** — current, temporary, and max HP. Death save successes and failures for PCs at 0 HP.
- **Source/target overrides** — damage and healing default to the active combatant as source, but the HP modal lets you quickly override source and target for reactions, traps, hazards, and off-turn effects.
- **Status effects** — add named effects with duration in rounds and optional GM notes.
- **Defeated enemies** — hostile combatants at 0 HP or marked dead are collapsed out of the main turn flow so advancing turns does not require repeatedly skipping them.
- **PC statblocks** — click a PC name to open their Fantasy Statblocks statblock in a split pane. If Fantasy Statblocks is not installed, the PC note opens instead.

## Player view

The Player view is a fullscreen projection window designed for an external monitor or projector:

- HP bar animations with color-coded health.
- Dynamic font sizing based on combatant count.
- Hidden combatants and sensitive GM data (exact HP values, notes) are not shown.

The session projection system can automatically display the Player view during active combat. See [Sessions — Session Projection](sessions.md#session-projection).

## Encounter logs and awards

When combat ends, the tracker can write an encounter log note to the configured log folder. The default folder is `z_ITEncounterLog`.

Encounter logs include:

- start/end time, round count, participant state, and a combat event timeline
- rankings for most enemies defeated, most damage dealt, most damage taken, and best healer
- an **MVP of the Encounter** trophy calculated from the visible award rankings
- hidden replay data so the awards screen can be reopened later

The end-of-combat awards modal can also be projected to a player screen. New log notes include an **Open Awards** action button, so the DM can reopen and re-project the awards after closing the original popup.

## Running combat

1. Select **Start Combat** to begin a new encounter.
2. Add combatants manually or import from an encounter note.
3. Select **Roll Initiative** to roll for all combatants with automatic sorting.
4. Use **Next Turn** and **Previous Turn** to advance through the initiative order.
5. Select **End Combat** when the encounter is resolved.

## Adding participants mid-combat

Use the tracker toolbar **⋮** menu to add participants while combat is already running:

- **Add Creature to Encounter** — add a vault creature or manual creature to the active tracker. If the tracker was started from an encounter note, leave **Save to Encounter** enabled to append it to that encounter note.
- **Add Party Member to Encounter** — add a PC from a Party Manager party. With **Save to Encounter** enabled, the selected PC is also stored in the encounter note's `party_members`.

Encounter cards also support reinforcements: select **Add to Active Encounter** on another encounter card to add all of that encounter's creatures to the currently active tracker at once.

## Map integration

- Combatants linked to a `token_id` are highlighted on the active battle map.
- **Auto-pan** (optional) — the player map view centers on the active combatant's token each turn.
- **Vision selector** — switch between individual token perspective or combined party view.
- **Darkvision override** — set per-combatant darkvision range (0–300 ft in 5 ft increments).
- **Elevation** — flying and burrowing states are tracked and shown on map tokens.
- **Carried light sources** — tokens with light sources affect the vision system on the map.

## Commands

| Command | Description |
| --- | --- |
| Open Combat Tracker | Open the combat tracker sidebar |
| Next Turn | Advance to the next combatant |
| Previous Turn | Go back to the previous combatant |
| Roll Initiative | Roll initiative for all combatants |
| Save Combat State | Persist the current combat state |
| End Combat | End the active encounter |
| Open Combat Awards from Log | Reopen the awards screen from the active encounter log note |

## Related docs

- [Marker system](marker-system.md)
- [Map Manager](map-manager.md)
- [Encounter system](encounter-system.md)
- [Encounter builder](encounter-builder.md)

