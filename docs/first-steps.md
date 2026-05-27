# First Steps: Install and Create Your First Campaign

This guide is for new users who want to install D&D Campaign Hub from GitHub and set up their first campaign in Obsidian.

You do not need to know Git, code, or the command line.

## What you need

Before you start, make sure you have:

- Obsidian installed.
- An Obsidian vault open.
- Community plugins enabled in Obsidian.

If Community plugins are still blocked, open **Settings** -> **Community plugins** and turn off **Restricted mode**.

## Install from GitHub

### 1. Download the plugin files

1. Open the D&D Campaign Hub releases page:
   [https://github.com/kmumenthaler/dnd-campaign-hub/releases](https://github.com/kmumenthaler/dnd-campaign-hub/releases)
2. Open the newest release at the top of the page.
3. Under **Assets**, download these three files:
   - `main.js`
   - `manifest.json`
   - `styles.css`

Do not download the source code ZIP for installation. Obsidian needs the three files listed above.

### 2. Open your vault folder

1. In Obsidian, open the vault where you want to use D&D Campaign Hub.
2. In Obsidian's file list, right-click any note or folder.
3. Choose **Show in system explorer** or **Reveal in Finder**.
4. Your computer opens a file explorer window. If it opened a subfolder, go up until you are in the main vault folder.
5. Find the `.obsidian` folder inside your vault.

If you do not see `.obsidian`, your computer may be hiding folders that start with a dot. Turn on hidden files in your file explorer and check again.

### 3. Create the plugin folder

Inside your vault, create this folder:

```text
.obsidian/plugins/dnd-campaign-hub/
```

Then copy the three downloaded files into that folder.

When you are done, the folder should look like this:

```text
Your Vault/
  .obsidian/
    plugins/
      dnd-campaign-hub/
        main.js
        manifest.json
        styles.css
```

Make sure the files are directly inside `dnd-campaign-hub`. They should not be inside another folder such as `dist`, `release`, or `dnd-campaign-hub-main`.

### 4. Reload Obsidian and enable the plugin

1. Close and reopen Obsidian, or open the Command Palette and run **Reload app without saving**.
2. Open **Settings** -> **Community plugins**.
3. Find **D&D Campaign Hub** in the installed plugins list.
4. Turn it on.

If the plugin does not appear, check that the folder is named exactly `dnd-campaign-hub` and that it contains `main.js`, `manifest.json`, and `styles.css`.

On Windows, also make sure the files did not accidentally get renamed to something like `manifest.json.txt`. If file extensions are hidden, Windows can make this hard to see.

## Run the Setup Wizard

Before creating a campaign, run the setup wizard. It prepares the vault folders and helps you create or select a campaign.

1. Open the Command Palette:
   - Windows/Linux: `Ctrl+P`
   - macOS: `Command+P`
2. Search for **D&D Hub: Open Setup Wizard**.
3. Run the command.

The wizard guides you through:

- Initializing the vault folder structure.
- Creating or selecting a campaign.
- Opening optional systems such as music, maps, and parties.

The plugin creates shared folders such as:

- `ttrpgs/` for your campaigns.
- `z_Templates/` for campaign templates.
- `z_Assets/` for images and media.
- `z_Backups/` for migration backups.
- Additional support folders for spells, tables, battlemap templates, databases, and logs.

You can re-run the setup wizard later from the Command Palette or from **Settings** -> **D&D Campaign Hub** -> **Setup**.

## Create your first campaign

If you did not create a campaign through the setup wizard, create one directly.

1. Open the Command Palette again.
2. Run **Create New Campaign**.
3. Fill in the campaign form:
   - **Campaign Name**: the name of your campaign, for example `Lost Mines of Phandelver`.
   - **Your Role**: choose **Game Master / DM** if you are running the game, or **Player** if you are joining someone else's campaign vault.
   - **DM Name**: shown only when you choose **Player**.
   - **Game System**: choose the RPG system you are using.
   - **Fantasy Calendar**: optional. You can leave this as **None** and add a calendar later.
4. Select **Create Campaign**.

D&D Campaign Hub creates a campaign folder under `ttrpgs/` and opens the new `World.md` note.

For a Game Master campaign, the new folder includes:

```text
ttrpgs/
  Your Campaign Name/
    World.md
    House Rules.md
    Adventures/
    Factions/
    Items/
    Modules/
    NPCs/
    PCs/
    Plot/
    fc-calendar/
```

The plugin also creates a party for the campaign automatically, so you can start adding player characters later.

## Open Campaign Home

You can open the main campaign dashboard at any time:

1. Open the Command Palette.
2. Run **D&D Hub: Open Campaign Home**.

Campaign Home shows the active campaign, latest session focus, party status, recent scenes, recent maps, audio status, and suggested next steps.

Use the campaign dropdown in Campaign Home when your vault contains more than one campaign. Actions launched from Campaign Home use that selected campaign.

## Good next steps

Once your first campaign exists, a good setup order is:

1. Open **D&D Hub: Open Campaign Home**.
2. Select your campaign from the dropdown.
3. Use **Create Content** to create player characters, NPCs, adventures, scenes, encounters, or maps.
4. Use **New Session** to create the next session note.
5. Use **D&D Hub: Start Session** when you are ready to play.

For a broader overview of all systems, continue with [Getting started](getting-started.md).
