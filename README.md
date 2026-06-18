# D&D Campaign Hub

Manage D&D and TTRPG campaigns inside Obsidian with interactive battle maps, a combat tracker, encounter building, party management, hexcrawl travel, session dashboards, a DM screen, and an ambient music player.

> **Project status: early preview.** Core workflows are under active development and may change without notice. Feedback and issue reports are welcome.

## Features

### Campaign management

- Create and switch between multiple campaigns in the same vault.
- Role-based access: GMs have full creation rights, players get read-only views.
- Supports D&D 5e, Pathfinder 2e, Call of Cthulhu, Savage Worlds, FATE, OSR, and custom systems.
- Fantasy calendar integration through the Calendarium plugin.
- Bundled templates for all campaign elements with safe migration on updates.

### Adventures and scenes

- Three-act adventure structure with nine auto-generated scenes (social, combat, exploration).
- Scene notes include read-aloud text, skill checks, encounters, NPCs, treasure, and post-session recaps.
- Flat or act-based folder layout per adventure.
- Full create, edit, and delete support with cascade deletion.
- `/dnd` slash commands for quick scene content insertion (15+ snippet types).

### Session tracking

- Auto-numbered, date-stamped session notes linked to adventures.
- **Session prep dashboard** — sidebar panel for pre-session planning with adventure and scene overview, readiness score, and actionable checklist.
- **Session run dashboard** — live session panel with named timers, dice history, quick notes, and automatic DM Screen opening.
- **Session projection** — persistent managed player screens with idle content (images, videos, solid colors), automatic transitions between idle, map, and combat states, and saveable projection profiles.

### Interactive battle maps

- Display maps with square, hex (flat-top), hex (pointy-top), or no grid overlay with auto-detection.
- 16 tools across five annotation layers (Player, DM, Background, Elevated, Subterranean).
- Token library with creature size support (Tiny through Gargantuan), images, elevation tracking (flying and burrowing), darkvision override, and token auras.
- Fog of war with brush, circle, rectangle, and polygon reveal and hide modes.
- Six wall types: wall, door, window, secret door, invisible, and terrain.
- Nine light source presets: candle, torch, lantern, bullseye lantern, Light spell, Dancing Lights, Continual Flame, Daylight, and fluorescent.
- Area of effect shapes (circle, cone, square, line) with optional token anchoring.
- GM Map View for editing and Player Map View as a clean popout window with real-time sync.
- Tabletop miniature mode with physical monitor calibration for 25–32 mm miniature bases.
- Two-point grid calibration to align grids with pre-gridded map images.
- Animated map support for video backgrounds (MP4, WebM).
- Battlemap template system with tagging, source linking, and structural sync for reusable map setups.
- Environmental asset library (scatter, doors, traps) with transform handles for resize, rotate, and pivot.
- DM room annotations for private numbered/text labels, linked note-section previews, Markdown notes, and persistent styling defaults.
- Select-tool bulk actions for chosen tokens, including layer changes and D&D RAW grid-size resizing.
- Token submenu Edit shortcut for opening the placed token's edit modal directly from the map.
- Subtle DM-only Magic Darkness hints outside the Background layer, keeping the map readable while still showing the effect exists.

#### Map keyboard shortcuts

| Key | Tool | Notes |
| --- | --- | --- |
| `V` | Pan | Default navigation tool |
| `S` | Select | Token and object selection |
| `H` | Highlight | Grid cell highlighting |
| `P` | POI | Point of Interest (hexcrawl only) |
| `M` | Marker | Token placement |
| `D` | Draw | Freehand drawing |
| `R` | Ruler | Distance measurement |
| `T` | Token Distance | Point-to-token distance |
| `A` | AoE | Area of Effect templates |
| `X` | Eraser | Remove drawings, highlights, and AoE |
| `F` | Fog | Fog of War (Background layer only) |
| `W` | Walls | Wall segments (Background layer only) |
| `L` | Lights | Light sources (Background layer only) |
| `E` | Tile Elevation | Elevation painting (Background layer only) |
| `G` | Move Grid | Grid repositioning (Background layer only) |
| `N` | Env Assets | Environmental assets (Background layer only) |

| Modifier | Action |
| --- | --- |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Escape` | Revert to Select tool / cancel wall drawing |
| `Enter` | Finish wall chain |
| Arrow keys | Tunnel navigation (when token is inside a tunnel) |

### Combat tracker

- **GM sidebar view** — initiative order, round counter, HP/AC/status columns, expandable combatant rows.
- **Player view** — fullscreen projection with HP bar animations, dynamic font sizing, and read-only presentation.
- End-of-combat encounter logs with reusable awards summaries, MVP trophy presentation, and projectable player-facing podium rankings.
- Searchable encounter launcher for saved combats and available encounter notes.
- Defeated enemies are automatically removed from the active turn flow while remaining reviewable.
- Click a PC name to open their Fantasy Statblocks statblock in a split pane.
- HP tracking with current, temporary, and max HP; death save successes and failures.
- Status effects with name, duration in rounds, and GM notes.
- Initiative rolling with automatic sorting and drag-reordering for matching initiative ties.
- Add individual combatants or all creatures from another encounter into the active tracker as mid-combat reinforcements.
- Auto-pan to the active combatant's token on the battle map (optional).
- Vision selector for individual token perspective or combined party view.
- Darkvision override per combatant (0–300 ft in 5 ft increments).
- Elevation support for flying and burrowing.
- Carried light sources affect token vision on the map.

### Party management

- Create, rename, and delete parties with a default party designation.
- Link a party to a campaign folder for automatic PC discovery.
- Add PCs from the vault and add companions (retainers, hirelings).
- Reorder members with drag-and-drop or sidebar move buttons.
- Live stat display (HP, AC, level) read directly from PC note frontmatter.
- Expandable member cards with full detail view (one at a time).
- Sync member names from PC notes and prune orphaned members.
- Initiative configuration: don't roll, roll automatically, or let players roll.
- Long Rest action to heal all party members to full HP.
- Individual healing controls for short rests and manual recovery.
- Level-up and direct stat editing for PC level, AC, max HP, and initiative bonus.
- Changed Party Manager values sync back to linked PC Markdown files.

### Encounter builder

- Survival-ratio difficulty calculation with real-time feedback.
- Improved creature stat parsing for more realistic difficulty estimates.
- Add creatures with count, HP, AC, and CR; supports friendly NPCs and hidden creatures.
- Trap integration: simple and complex traps contribute to encounter difficulty and load with fixed initiative counts.
- Encounter cards can add all creatures to the currently active Combat Tracker encounter.
- Random encounter table generator filtered by environment and party level.
- Load party roster directly from the Party Manager.
- D&D 5e SRD API integration for monster data.

### Hexcrawl wilderness travel

- Hex-by-hex travel tracker with day progression, movement budget, and terrain modifiers.
- 18+ terrain types including forests, mountains, swamps, deserts, arctic, underdark, and more.
- Climate zones, weather generation, survival meter, and ration tracking.
- Exploration roles and configurable travel paces.
- Step-by-step hex procedure modal.
- Terrain painter for drawing terrain directly on hex maps.
- English and German localization for terrain descriptions.

### DM Screen

Tabbed reference panel with eight quick-reference sections: conditions, actions, combat, skills, travel and rest, difficulty classes, damage types, and cover rules.

### Music player

- Dual-layer audio engine with a primary music track and an ambient layer.
- Soundboard for up to eight concurrent one-shot sound effects.
- Playlist management with mood tags, shuffle, repeat, crossfade, and fade controls.
- Audio ducking during sound effects.
- Scene music code blocks to link music to specific scenes.
- Freesound.org integration for searching, previewing, and downloading sound effects.
- Supported formats: MP3, WAV, OGG, M4A, FLAC, WebM, AAC.
- Status bar indicator with playback controls.

### Characters and creatures

- **PC creation** — name, player, class, subclass, level, HP, AC, initiative, speed, passive perception, D&D Beyond link.
- **D&D Beyond import** — paste a character URL or ID to pull stats, abilities, actions, spells, equipment, and AC calculation directly into a PC note with Fantasy Statblocks integration.
- **PDF character sheet import** — drag-and-drop a PDF to auto-fill PC fields. Four profiles auto-detected: WotC Official 5e, D&D Beyond PDF Export, MPMB Automated Sheet, and German (Deutsch) 5e.
- **NPC creation** — name, race, location, faction, motivation, personality.
- **Import PCs** from other campaigns.
- **Creature builder** — full stat block with ability scores, saves, skills, resistances, immunities, traits, actions, legendary actions, and more.
- Tokens auto-created for PCs, NPCs, and creatures with correct grid size.
- Edit and delete commands for all character and creature types.
- Creature notes use stable frontmatter for Edit/Delete note actions while keeping creature classification separate.
- Fantasy Statblocks plugin integration for bestiary management.

### Items, spells, traps, and factions

- **Items** — standard and evolving homebrew items that grow with character level. Supports categories, rarity, and attunement.
- **Spells** — import from the D&D 5e SRD API with search, filter, and detail preview.
- **Traps** — simple and complex types with threat levels, multiple elements, countermeasures, and encounter difficulty contribution.
- **Factions** — type, alignment, goals, resources, territory, allied and enemy faction tracking.
- Edit and delete commands for all entity types.

### Points of interest

- PoI types: settlement, dungeon, landmark, danger, quest, custom.
- Properties include region, tags, danger level, and discovered/visited status.
- Embeddable `dnd-poi` code blocks and map integration with hex coordinates.

### SRD data import

Import all D&D 5e SRD content from the dnd5eapi.co API:

- 15 data categories: ability scores, classes, conditions, damage types, equipment, features, languages, magic schools, proficiencies, races, skills, subclasses, subraces, traits, weapon properties.
- Batch creature token import (334 SRD monsters) with stat block notes, artwork, and correctly sized battlemap tokens.
- Imported SRD data is browsable in the Campaign Hub under a dedicated **SRD Reference** section with search and filtering.

### Embeddable code blocks

| Code block | Purpose |
| --- | --- |
| `` ```dnd-map``` `` | Interactive map with tokens, grids, fog of war, walls, and lights |
| `` ```dnd-encounter``` `` | Encounter card with difficulty calculation |
| `` ```dnd-party``` `` | Party stat block with HP, AC, and levels |
| `` ```dnd-poi``` `` | Point of interest card |
| `` ```dnd-music``` `` | Scene music controls |
| `` ```dnd-sfx``` `` | Inline sound effect trigger |
| `` ```dnd-encounter-table``` `` | Random encounter table with rollable entries |
| `` ```dnd-hub``` `` | Entity action buttons (edit, delete) rendered by the plugin |

## Installation

### From community plugins (recommended)

1. Open **Settings** → **Community plugins** → **Browse**.
2. Search for **D&D Campaign Hub**.
3. Select **Install**, then **Enable**.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/kmumenthaler/dnd-campaign-hub/releases).
2. Create a folder called `dnd-campaign-hub` inside your vault's `.obsidian/plugins/` folder.
3. Copy the three files into that folder.
4. Reload Obsidian.
5. Enable the plugin in **Settings** → **Community plugins**.

## Dependencies

The plugin works standalone with no required dependencies. The following community plugins are recommended for enhanced features:

| Plugin | Purpose |
| --- | --- |
| [Calendarium](https://github.com/javalent/calendarium) | Fantasy calendar integration |
| [Templater](https://github.com/SilentVoid13/Templater) | Template engine for dynamic content |
| [Fantasy Statblocks](https://github.com/javalent/fantasy-statblocks) | Creature and PC stat block rendering |

The plugin checks for missing optional plugins on startup and in **Settings** → **D&D Campaign Hub**.

## Quick start

1. Open the Command Palette (`Ctrl+P` on Windows/Linux, `Command+P` on macOS).
2. Run **D&D Hub: Open Setup Wizard** to create the campaign structure and optional starter content.
3. Run **D&D Hub: Open Campaign Home** and select the active campaign from the dropdown.
4. Use **New Session** or **Create Content** from Campaign Home to prepare the next session.
5. Run **D&D Hub: Start Session** when you are ready to play.

## Commands

Access all commands through the Command Palette (`Ctrl+P`). Search for "D&D Hub" for the main workflows.

### Main workflows

| Command | Description |
| --- | --- |
| D&D Hub: Open Setup Wizard | Run or revisit first-time setup |
| D&D Hub: Open Campaign Home | Open the main campaign dashboard |
| D&D Hub: Create Content | Create sessions, scenes, characters, encounters, maps, and world notes from one menu |
| D&D Hub: Prepare Next Session | Open the preparation dashboard |
| D&D Hub: Start Session | Open the live session dashboard |
| D&D Hub: Open GM Tools | Open common live-play tools |

### Core

| Command | Description |
| --- | --- |
| Open D&D Campaign Hub | Open the legacy hub modal |
| Initialize D&D Campaign Hub | Create vault folder structure and templates |
| Migrate D&D Hub Files | Apply safe file migrations after updates |
| Purge D&D Campaign Hub Data | Remove all plugin data |

### Campaigns and sessions

| Command | Description |
| --- | --- |
| Create New Campaign | Start a new campaign with folder generation |
| Create New Session | Add an auto-numbered session note |
| End Session Here | Record the ending scene for the active session |
| Open Session Prep Dashboard | Open the pre-session planning sidebar |
| Open Session Run Dashboard | Open the live session sidebar |
| Session Projection | Open the projection setup modal for managed player screens |
| Start Projection Session | Launch all configured projection screens |
| Stop Projection Session | Close all managed projection screens |

### Adventures, scenes, and encounters

| Command | Description |
| --- | --- |
| Create New Adventure | Create a three-act adventure with scenes |
| Create New Scene | Add a scene to an existing adventure |
| Create New Encounter | Build an encounter with difficulty calculation |
| Insert Encounter Widget | Embed an encounter card in a note |
| Create Random Encounter Table | Generate an environment-based encounter table |
| Roll Random Encounter | Roll on an existing encounter table |

### Characters and creatures

| Command | Description |
| --- | --- |
| Create New PC | Create a player character note |
| Import Existing PC | Import a PC from another campaign |
| Create New NPC | Create a non-player character note |
| Create New Creature | Build a creature with a full stat block |

### Items, spells, traps, and factions

| Command | Description |
| --- | --- |
| Create New Item | Create a standard or evolving item |
| Create New Spell | Import a spell from the SRD |
| Create New Trap | Build a simple or complex trap |
| Create New Faction | Create a faction with goals and territory |

### Combat

| Command | Description |
| --- | --- |
| Open Combat Tracker | Open the combat tracker sidebar |
| Next Turn | Advance to the next combatant |
| Previous Turn | Go back to the previous combatant |
| Roll Initiative | Roll initiative for all combatants |
| Save Combat State | Persist the current combat state |
| End Combat | End the active encounter |
| Open Combat Awards from Log | Reopen awards from a saved encounter log |

### Maps

| Command | Description |
| --- | --- |
| Create Battle Map | Create a new interactive map |
| Insert Battlemap | Embed a map in the current note |
| Create Battlemap Template | Save a reusable map template |
| Map Manager | Browse, edit, delete, link, and sync maps |

### Party management

| Command | Description |
| --- | --- |
| Manage Parties | Open the party management modal |

### Music

| Command | Description |
| --- | --- |
| Open Music Player | Open the music player sidebar |
| Toggle Music Play/Pause | Start or pause playback |
| Next Track / Previous Track | Skip between tracks |
| Stop All Music | Stop all audio layers |
| Search Freesound | Search and download sounds from Freesound.org |

### Points of interest

| Command | Description |
| --- | --- |
| Edit Point of Interest | Edit the PoI on the current note |
| Delete Point of Interest | Delete the PoI on the current note |
| Insert PoI Code Block | Embed a PoI card in a note |

All campaign entities (adventures, scenes, encounters, PCs, NPCs, creatures, items, traps, factions, PoIs) also have **Edit** and **Delete** commands.

## Settings

Open **Settings** -> **D&D Campaign Hub** to configure the plugin.

| Section | Purpose |
| --- | --- |
| Setup | Re-run setup, reset the setup checklist, open Campaign Home, and open Create Content |
| Audio & Projection | Configure music/SFX, open the music player, and manage projection screens |
| Maps & Encounters | Open Map Manager and tune combat map behaviour |
| Reference Data | Import optional SRD reference notes and creature tokens |
| Maintenance | Run template migrations with backups |
| Danger Zone | Remove all plugin data from the vault |

## Vault structure

When you initialize the plugin, this folder structure is created:

```
ttrpgs/
  <Campaign>/
    <Campaign>.md         Campaign dashboard
    World.md              World info and GM role tracking
    Adventures/           Adventures with scene subfolders
    Factions/             Organizations and groups
    Sessions/             Session notes

z_Templates/              Reusable note templates
z_Assets/                 Images and assets
z_Beastiarity/            Creature stat blocks and images
z_BattlemapTemplates/     Reusable battlemap setups
z_Spells/                 Imported SRD spell notes
z_Backups/                Timestamped backups from migrations
z_Databases/              Campaign databases
z_Tables/                 Random tables
z_Log/                    Session logs
z_ITEncounterLog/         Initiative Tracker encounter logs
```

Additional SRD data folders (ability scores, classes, conditions, equipment, and more) are created when you import SRD content from the settings tab.

## Documentation

See the [docs/](docs/) folder for detailed guides:

- [First steps: install and create your first campaign](docs/first-steps.md)
- [Getting started](docs/getting-started.md)
- [Prepare a session](docs/prepare-a-session.md)
- [Run a session](docs/run-a-session.md)
- [Build a scene with map, encounter, and music](docs/build-scene-map-encounter-music.md)
- [Recover or continue a session](docs/recover-continue-session.md)
- [Campaign management](docs/campaign-management.md)
- [Sessions](docs/sessions.md)
- [Adventures and scenes](docs/adventures-and-scenes.md)
- [Characters and creatures](docs/characters-and-creatures.md)
- [Items, spells, and traps](docs/items-spells-traps.md)
- [Battle maps](docs/battle-maps.md)
- [Combat tracker](docs/combat-tracker.md)
- [Encounter builder](docs/encounter-builder.md)
- [Encounter system](docs/encounter-system.md)
- [Hexcrawl tracker](docs/hexcrawl.md)
- [Party management](docs/party-management.md)
- [Music player](docs/music-player.md)
- [DM screen](docs/dm-screen.md)
- [Map Manager](docs/map-manager.md)
- [Marker system](docs/marker-system.md)
- [Environmental assets](docs/envasset.md)
- [Templates and migration](docs/templates.md)
- [Settings and reference](docs/settings-and-reference.md)

## Development

### Build from source

```bash
npm install
npm run build
npm run dev
```

### Project structure

```
src/
  main.ts               Plugin entry point and command registration
  templates.ts          Bundled note templates
  types.ts              Shared type definitions
  constants.ts          Plugin constants
  styles.css            Plugin styles
  adventure/            Adventure creation modal
  campaign/             Campaign creation and calendar modals
  character/            PC, NPC, and import modals
  combat/               Combat tracker, player view, and types
  creature/             Creature builder modal
  dm-screen/            DM Screen reference view
  encounter/            Encounter builder, generator, SRD API client
  envasset/             Environmental asset library
  faction/              Faction creation modal
  hexcrawl/             Hexcrawl tracker, terrain painter, climate system
  hub/                  Main hub modal and purge confirmation
  item/                 Item creation modal
  map/                  Map manager, grid overlay, wall tools, lighting, persistence
  map-views/            GM and Player map views, tabletop calibration
  marker/               Marker library and picker modals
  migration/            Version migration manager
  music/                Music player, playlists, Freesound integration
  party/                Party manager and party management modal
  poi/                  Point of interest editing and rendering
  projection/           Session projection manager and media picker
  rendering/            Shared render utilities
  scene/                Scene creation and slash command snippets
  session/              Session dashboards (prep and run), readiness checklist
  settings/             Settings tab with SRD import
  spell/                Spell import and detail modals
  srd/                  SRD data import utilities
  trap/                 Trap creation modal
  utils/                Shared utility functions
```

## Contributing

Contributions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Submit a pull request.

## Support

- [GitHub Issues](https://github.com/kmumenthaler/dnd-campaign-hub/issues)
- [GitHub Discussions](https://github.com/kmumenthaler/dnd-campaign-hub/discussions)

## Credits

Special thanks to the creators of [Calendarium](https://github.com/javalent/calendarium), [Templater](https://github.com/SilentVoid13/Templater), and [Fantasy Statblocks](https://github.com/javalent/fantasy-statblocks).

## License

MIT License. See [LICENSE](LICENSE) for details.
