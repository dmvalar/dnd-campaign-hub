# Settings and Reference

## Plugin Settings

Open **Settings** -> **D&D Campaign Hub** to configure the plugin.

The settings page is grouped around workflows so new users can start with the sections they actually need.

### Setup

Use this section when starting a vault, changing onboarding state, or returning to the main campaign workflow.

| Setting | Purpose |
| --- | --- |
| Setup wizard | Re-run first-time setup for campaign structure, starter content, audio, and map/token folders |
| Setup checklist | Mark setup complete or reset it when you want setup to be treated as unfinished |
| Campaign Home | Open the main campaign dashboard |
| Create content | Open the unified creation menu |

The active campaign is selected in **Campaign Home**. Campaign-aware workflows launched from Campaign Home use that selected campaign.

### Audio and Projection

Use this section for live table media.

| Setting | Purpose |
| --- | --- |
| Music and SFX settings | Choose the audio folder, build playlists, configure sound effects, and tune playback |
| Music player | Open the live audio player |
| Session projection | Manage player-facing screens for scenes, handouts, maps, and session information |

### Maps and Encounters

Use this section for battle maps, map rendering, and combat map behaviour.

| Setting | Purpose |
| --- | --- |
| Map Manager | Create and edit maps used by scenes, encounters, and inline map controls |
| Auto-pan to active combatant | Center the projected player map on the active combatant when turns change |
| Vision update mode | Choose whether fog of war updates while dragging tokens or only on drop |
| Map canvas resolution | Adjust overlay sharpness for tokens, fog, and grids |

Higher map canvas values can look sharper but use more memory. Reopen maps after changing this setting.

### Reference Data

Use this section to import optional D&D 5e SRD notes and creature tokens.

| Category | Target folder |
| --- | --- |
| Ability Scores | `z_AbilityScores/` |
| Classes | `z_Classes/` |
| Conditions | `z_Conditions/` |
| Damage Types | `z_DamageTypes/` |
| Equipment | `z_Equipment/` |
| Features | `z_Features/` |
| Languages | `z_Languages/` |
| Magic Schools | `z_MagicSchools/` |
| Proficiencies | `z_Proficiencies/` |
| Races | `z_Races/` |
| Skills | `z_Skills/` |
| Subclasses | `z_Subclasses/` |
| Subraces | `z_Subraces/` |
| Traits | `z_Traits/` |
| Weapon Properties | `z_WeaponProperties/` |

**Import all SRD reference data** creates reference notes for all categories.

**Import SRD creature tokens** creates SRD creature notes and matching battlemap tokens. Existing imported creatures with matching paths may be overwritten.

### Maintenance

| Setting | Purpose |
| --- | --- |
| Migrate campaign files | Update older generated notes to the latest template versions |

Migrations create backups before changing files.

### Danger Zone

| Setting | Purpose |
| --- | --- |
| Purge Vault | Delete all plugin-created folders and files from the current vault |

This action is destructive and requires explicit confirmation.

## Command Reference

All commands are available from the Command Palette. Search for "D&D" or "D&D Hub" to filter.

### Main Workflows

| Command | Description |
| --- | --- |
| D&D Hub: Open Setup Wizard | Run or revisit first-time setup |
| D&D Hub: Open Campaign Home | Open the main campaign dashboard |
| D&D Hub: Create Content | Create common campaign content from one menu |
| D&D Hub: Prepare Next Session | Open the preparation dashboard |
| D&D Hub: Start Session | Open the live run dashboard |
| D&D Hub: Open GM Tools | Open common live-play tools |

### General

| Command | Description |
| --- | --- |
| Open D&D Campaign Hub | Open the legacy hub modal |
| Initialize D&D Campaign Hub | Create the vault folder structure and templates |
| Migrate D&D Hub Files | Run template migration after plugin updates |
| Purge D&D Campaign Hub Data | Delete plugin-created data with confirmation |
| Reset Focus | Fix stuck input fields in modals |

### Campaigns and Sessions

| Command | Description |
| --- | --- |
| Create New Campaign | Open the campaign creation modal |
| Create New Session | Open the session creation modal |
| End Session Here | Record the ending scene for the current session |
| Open Session Prep Dashboard | Open the preparation panel |
| Open Session Run Dashboard | Open the live session panel |
| Session Projection | Open the projection setup modal |
| Start Projection Session | Launch configured projection screens |
| Stop Projection Session | Close all managed projection screens |

### Adventures and Scenes

| Command | Description |
| --- | --- |
| Create New Adventure | Open the adventure creation modal |
| Edit Adventure | Edit the adventure in the current note |
| Delete Adventure | Delete the adventure and its scenes |
| Create New Scene | Open the scene creation modal |
| Edit Scene | Edit the scene in the current note |
| Delete Scene | Delete the current scene note |

### Characters and Creatures

| Command | Description |
| --- | --- |
| Create New PC | Open the PC creation modal |
| Edit PC | Edit the PC in the current note |
| Delete PC | Delete the current PC note |
| Import Existing PC from Another Campaign | Clone or link a PC across campaigns |
| Create New NPC | Open the NPC creation modal |
| Edit NPC | Edit the NPC in the current note |
| Delete NPC | Delete the current NPC note |
| Create New Creature | Open the creature creation modal |
| Edit Creature | Edit the creature in the current note |
| Delete Creature | Delete the current creature note |

### Items, Spells, Traps, and Factions

| Command | Description |
| --- | --- |
| Create New Item | Open the item creation modal |
| Edit Item | Edit the item in the current note |
| Delete Item | Delete the current item note |
| Create New Spell | Open the spell import/creation modal |
| Create New Trap | Open the trap creation modal |
| Edit Trap | Edit the trap in the current note |
| Delete Trap | Delete the current trap note |
| Create New Faction | Open the faction creation modal |

### Encounters

| Command | Description |
| --- | --- |
| Create New Encounter | Open the encounter builder modal |
| Edit Encounter | Edit the encounter in the current note |
| Delete Encounter | Delete the current encounter note |
| Insert Encounter Widget | Insert a `dnd-encounter` code block |
| Insert Inline Encounter Control | Insert a compact encounter button into note text |
| Convert Selected Encounter Widget to Inline Control | Convert a selected encounter block or inline control |
| Create Random Encounter Table | Generate a random encounter table |
| Roll Random Encounter | Roll on the encounter table in the current note |
| Insert Encounter Table Code Block | Insert a `dnd-encounter-table` code block |
| Reroll Encounter Table Entry | Reroll a single entry in the current table |
| Edit Encounter Table | Edit the encounter table in the current note |
| Delete Encounter Table | Delete the current encounter table |

### Battle Maps

| Command | Description |
| --- | --- |
| Create Battle Map (from template) | Insert a map from an existing template |
| Create Battlemap Template | Open the map creation modal |
| Map Manager | Open the map manager |
| Insert Inline Map Control | Insert a compact map button into note text |
| Convert Selected Map Block to Inline Control | Convert a selected map block or inline control |

### Music

| Command | Description |
| --- | --- |
| Open Music Player | Open the music player sidebar |
| Toggle Music Play / Pause | Play or pause the primary layer |
| Next Track | Skip to the next track |
| Previous Track | Go to the previous track |
| Stop All Music | Stop both layers and all sound effects |
| Volume Up (+10) | Increase primary layer volume by 10% |
| Volume Down (-10) | Decrease primary layer volume by 10% |
| Toggle Mute | Mute or unmute the primary layer |
| Insert Scene Music Block | Insert a `dnd-music` code block |
| Insert Inline Scene Music | Insert a compact scene music button into note text |
| Convert Selected Scene Music to Inline Widget | Convert selected scene music to an inline control |
| Insert Sound Effect Block | Insert a `dnd-sfx` code block |
| Insert Inline Sound Effect | Insert a compact SFX button into note text |
| Convert Selected Sound Effect to Inline Widget | Convert selected SFX to an inline control |
| Open Music Settings | Open the music configuration modal |
| Search Freesound | Open the Freesound search browser |

### Projection and Handouts

| Command | Description |
| --- | --- |
| Insert Inline Handout Control | Insert a compact handout projection button into note text |
| Convert Selected Handout Control to Inline | Rebuild a selected handout inline control |

## Note Controls

### Code Blocks

| Code block | Description | Documentation |
| --- | --- | --- |
| `dnd-map` | Renders an interactive battle map | [Battle maps](battle-maps.md) |
| `dnd-encounter` | Renders an encounter summary widget | [Encounter builder](encounter-builder.md) |
| `dnd-encounter-table` | Renders a random encounter table widget | [Encounter builder](encounter-builder.md) |
| `dnd-hub` | Renders entity action buttons | Included automatically in generated templates |
| `dnd-music` | Renders a scene music loader card | [Music player](music-player.md) |
| `dnd-sfx` | Renders a sound effect trigger button | [Music player](music-player.md) |
| `dnd-poi` | Renders a list of points of interest | [Items, spells, traps, and factions](items-spells-traps.md) |
| `dnd-hexcrawl` | Renders hexcrawl tracker state | [Hexcrawl tracker](hexcrawl.md) |

### Inline Controls

Inline controls are compact HTML buttons inserted by plugin commands. Use them when a cue belongs naturally inside session text.

| Inline control | Data attribute | Command |
| --- | --- | --- |
| Sound effect | `data-dnd-sfx` | Insert Inline Sound Effect |
| Scene music | `data-dnd-music` | Insert Inline Scene Music |
| Encounter | `data-dnd-encounter` | Insert Inline Encounter Control |
| Handout | `data-dnd-handout` | Insert Inline Handout Control |
| Map | `data-dnd-map` | Insert Inline Map Control |

Prefer the insert commands over hand-writing inline controls because the command stores the required encoded data.

## Slash Commands

Type `/dnd` in any note to open a searchable popup of quick-insert content snippets. See [Adventures and scenes - Scene snippets](adventures-and-scenes.md#scene-snippets) for the full list.

## Keyboard Shortcuts

### Global

| Shortcut | Action |
| --- | --- |
| `Ctrl+Shift+M` / `Cmd+Shift+M` | Open the Campaign Hub modal |

See [Battle maps - Keyboard shortcuts](battle-maps.md#keyboard-shortcuts) for map shortcuts.

## Vault Folder Structure

After initialization, the plugin creates the following top-level folders:

| Folder | Purpose |
| --- | --- |
| `ttrpgs/` | Campaign data, one subfolder per campaign |
| `z_Templates/` | Note templates for all entity types |
| `z_Assets/` | Images, maps, PDFs, and environmental assets |
| `z_BattlemapTemplates/` | Saved battle map templates |
| `z_Beastiarity/` | Creature stat blocks, SRD and custom |
| `z_Encounters/` | Standalone encounter notes |
| `z_Traps/` | Trap notes |
| `z_Spells/` | SRD spell imports |
| `z_Databases/` | Campaign databases |
| `z_Tables/` | Random tables |
| `z_Log/` | Session logs |
| `z_Backups/` | Migration backups |

Each campaign folder under `ttrpgs/` contains subfolders for adventures, sessions, NPCs, PCs, factions, items, spells, and locations.
