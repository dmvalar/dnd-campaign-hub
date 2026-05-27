# Campaign management

D&D Campaign Hub supports multiple campaigns in the same vault. Each campaign has its own folder, dashboard, and world note.

## Create a campaign

1. Open the Command Palette and run **D&D Hub: Open Setup Wizard**, or run **Create New Campaign** directly.
2. Fill in the campaign details:
   - **Campaign Name** — the display name and folder name.
   - **Your Role** — Game Master / DM or Player.
   - **DM Name** — visible only when the role is set to Player.
   - **Game System** — D&D 5e, Pathfinder 2e, Call of Cthulhu, Savage Worlds, FATE Core, OSR, or Other/Custom.
   - **Fantasy Calendar** — link an existing Calendarium calendar, create a new one (quick, full, or import), or select None.
   - **Campaign Start Date** — optionally pick a starting in-game date from the linked calendar.
3. Select **Create Campaign**.

The plugin creates:

```
ttrpgs/
  <Campaign Name>/
    <Campaign Name>.md    Campaign dashboard
    World.md              World info and GM role tracking
    Adventures/
    Factions/
    Sessions/
```

## Switch between campaigns

Open **D&D Hub: Open Campaign Home** and choose the active campaign from the dropdown.

Campaign Home is the preferred campaign switcher. Actions launched from Campaign Home, including session creation, encounter building, party tools, and content creation, use the selected campaign.

The plugin still auto-detects campaign context from the note you have open when a workflow is launched outside Campaign Home. If Obsidian cannot determine the campaign from the current file, the plugin prompts you to choose one.

## Roles

The role is stored in `World.md` as a `role` frontmatter field.

- **Game Master / DM** — full access to all creation commands (adventures, scenes, encounters, factions, NPCs, and more).
- **Player** — read-only access. Creation commands are hidden or filtered to prevent accidental changes.

Most creation modals filter the campaign dropdown to show only campaigns where you are the GM.

## Campaign Home and legacy hub

Run **D&D Hub: Open Campaign Home** for the main campaign dashboard.

### Quick actions

Campaign Home shows the active campaign, latest session focus, party status, saved maps, audio status, recent scenes, recent maps, and suggested next steps.

Primary actions include **New Session**, **Continue Last Session**, **Create Content**, **Add Scene**, **Build Encounter**, **Open Party**, **Open Music**, and **Open Map Manager**.

The older hub modal is still available through **Open D&D Campaign Hub** and `Ctrl+Shift+M` / `Command+Shift+M`.

### Browse vault

Below the quick actions, a browse section lets you explore all campaign content by category:

- **Campaign content** — Campaigns, NPCs, PCs, Adventures, Sessions, Factions, Items, Spells, Creatures, Traps.
- **SRD Reference** — Equipment, Classes, Subclasses, Races, Subraces, Features, Traits, Conditions, Skills, Proficiencies, Languages, Ability Scores, Damage Types, Magic Schools, Weapon Properties. This section appears after you import SRD data from the settings page.

Each category shows a result count and expands inline with a search bar. When multiple campaigns exist, results are grouped by campaign with origin labels. Selecting an entry opens the note in the editor.

## Purge campaign data

To remove all plugin data from the vault:

1. Open the Command Palette and run **Purge D&D Campaign Hub Data**.
2. Confirm in the dialog.

This deletes the `ttrpgs/`, `z_Templates/`, `z_Assets/`, and all other plugin-created folders. Use with caution.

## Migrate files after updates

When the plugin is updated, templates and notes may need migration to add new features.

1. Open the Command Palette and run **Migrate D&D Hub Files**.
2. The migration modal shows which files will be updated.
3. Select **Migrate** to apply changes.

Migrations preserve your content and create timestamped backups in `z_Backups/` before making changes.
