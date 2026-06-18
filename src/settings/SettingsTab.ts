import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { MapManagerModal } from "../map/MapManagerModal";
import { PurgeConfirmModal } from "../hub/PurgeConfirmModal";
import { MusicSettingsModal } from "../music/MusicSettingsModal";
import type { MusicSettings } from "../music/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a collapsible section with a chevron toggle and smooth animation. */
function addSection(
  parent: HTMLElement,
  title: string,
  description: string,
  opts: { startOpen?: boolean; cls?: string } = {},
): HTMLElement {
  const open = opts.startOpen ?? false;
  const section = parent.createDiv({ cls: `dnd-settings-section ${opts.cls ?? ""}` });

  const header = section.createDiv({ cls: "dnd-settings-section-header" });
  header.setAttribute("role", "button");
  header.setAttribute("tabindex", "0");
  header.setAttribute("aria-expanded", String(open));

  const chevron = header.createEl("span", { cls: "dnd-settings-chevron" });
  chevron.textContent = "▶";
  header.createEl("span", { text: title, cls: "dnd-settings-section-title" });

  if (description) {
    section.createEl("p", { text: description, cls: "dnd-settings-section-desc" });
  }

  const body = section.createDiv({ cls: "dnd-settings-section-body" });

  const toggle = () => {
    const expanding = !body.hasClass("is-open");
    body.toggleClass("is-open", expanding);
    chevron.toggleClass("is-open", expanding);
    header.setAttribute("aria-expanded", String(expanding));
  };

  if (open) {
    body.addClass("is-open");
    chevron.addClass("is-open");
  }

  header.addEventListener("click", toggle);
  header.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  });

  return body;
}

// ─── Settings Tab ───────────────────────────────────────────────────────────

export class DndCampaignHubSettingTab extends PluginSettingTab {
  plugin: DndCampaignHubPlugin;

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async display(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("dnd-settings-root");

    // ── Header ──────────────────────────────────────────────────────────
    const hero = containerEl.createDiv({ cls: "dnd-settings-hero" });
    hero.createEl("h2", { text: "D&D Campaign Hub" });
    hero.createEl("span", {
      text: `v${this.plugin.manifest.version}`,
      cls: "dnd-settings-version",
    });

    // ── 1. Setup ────────────────────────────────────────────────────────
    const setup = addSection(
      containerEl,
      "Setup",
      "Start or adjust the core workflow: active campaign, starter folders, and first-run choices.",
      { startOpen: true },
    );

    new Setting(setup)
      .setName("Setup wizard")
      .setDesc("Choose the campaign structure, starter content, and optional systems without digging through every setting.")
      .addButton((btn) =>
        btn
          .setButtonText(this.plugin.settings.onboardingSetupComplete ? "Re-run Setup Wizard" : "Open Setup Wizard")
          .setCta()
          .onClick(() => {
            this.plugin.openSetupWizard();
          })
      );

    new Setting(setup)
      .setName("Setup checklist")
      .setDesc(
        this.plugin.settings.onboardingSetupComplete
          ? "The first-run setup is marked complete. Reset this when you want the plugin to treat setup as unfinished again."
          : "The first-run setup is currently marked incomplete."
      )
      .addButton((btn) =>
        btn
          .setButtonText(this.plugin.settings.onboardingSetupComplete ? "Reset Checklist" : "Mark Complete")
          .onClick(async () => {
            this.plugin.settings.onboardingSetupComplete = !this.plugin.settings.onboardingSetupComplete;
            await this.plugin.saveSettings();
            new Notice(
              this.plugin.settings.onboardingSetupComplete
                ? "Setup checklist marked complete."
                : "Setup checklist reset."
            );
            void this.display();
          })
      );

    new Setting(setup)
      .setName("Campaign Home")
      .setDesc("Open the main campaign control surface. The selected campaign there is used by creation workflows.")
      .addButton((btn) =>
        btn
          .setButtonText("Open Campaign Home")
          .onClick(() => {
            void this.plugin.openCampaignHome(this.plugin.getActiveCampaignPath());
          })
      );

    new Setting(setup)
      .setName("Create content")
      .setDesc("Open the unified creation menu for sessions, scenes, characters, encounters, maps, and world notes.")
      .addButton((btn) =>
        btn
          .setButtonText("Create Content")
          .onClick(() => {
            this.plugin.openCreateContent(this.plugin.getActiveCampaignPath());
          })
      );

    // ── 2. Audio & Projection ───────────────────────────────────────────
    const media = addSection(
      containerEl,
      "Audio & Projection",
      "Configure music, sound effects, handouts, and player-facing screens used during sessions.",
    );

    new Setting(media)
      .setName("Music and SFX settings")
      .setDesc("Choose the audio folder, build playlists, configure the soundboard, and tune playback behaviour.")
      .addButton((btn) =>
        btn
          .setButtonText("Open Music Settings")
          .setCta()
          .onClick(() => {
            new MusicSettingsModal(
              this.app,
              this.plugin.settings.musicSettings,
              async (updated: MusicSettings) => {
                this.plugin.settings.musicSettings = updated;
                this.plugin.musicPlayer.reloadSettings(updated);
                await this.plugin.saveSettings();
                new Notice("Music settings saved.");
              },
            ).open();
          })
      );

    new Setting(media)
      .setName("Music player")
      .setDesc("Open the live player for playlists, ambient layers, and sound effects.")
      .addButton((btn) =>
        btn
          .setButtonText("Open Music Player")
          .onClick(() => {
            void this.plugin.ensureMusicPlayerOpen();
          })
      );

    new Setting(media)
      .setName("Session projection")
      .setDesc("Manage player-facing screens for scenes, handouts, maps, and session information.")
      .addButton((btn) =>
        btn
          .setButtonText("Open Projection Hub")
          .onClick(() => {
            this.plugin.openSessionProjectionHub();
          })
      );

    // ── 3. Maps & Encounters ────────────────────────────────────────────
    const maps = addSection(containerEl, "Maps & Encounters", "Map setup, encounter table maps, combat behaviour, and dynamic lighting.");

    new Setting(maps)
      .setName("Map Manager")
      .setDesc("Create and edit maps used by scenes, encounters, and inline map controls.")
      .addButton((btn) =>
        btn
          .setButtonText("Open Map Manager")
          .setCta()
          .onClick(() => {
            new MapManagerModal(this.app, this.plugin, this.plugin.mapManager).open();
          })
      );

    new Setting(maps)
      .setName("Auto-pan to active combatant")
      .setDesc(
        "During combat, smoothly center the projected player map on the active combatant when the turn changes."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.combatAutoPan)
          .onChange(async (value) => {
            this.plugin.settings.combatAutoPan = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(maps)
      .setName("Encounter log folder")
      .setDesc("Completed Initiative Tracker encounter logs are written here.")
      .addText((text) =>
        text
          .setPlaceholder("z_ITEncounterLog")
          .setValue(this.plugin.settings.combatEncounterLogFolder || "z_ITEncounterLog")
          .onChange(async (value) => {
            this.plugin.settings.combatEncounterLogFolder = value.trim() || "z_ITEncounterLog";
            await this.plugin.saveSettings();
          })
      );

    new Setting(maps)
      .setName("Vision update mode")
      .setDesc(
        "Choose whether fog of war updates while dragging tokens or only after dropping them."
      )
      .addDropdown((dd) =>
        dd
          .addOption("on-drop", "Update on drop (fast)")
          .addOption("while-dragging", "Update while dragging (live)")
          .setValue(this.plugin.settings.visionUpdateMode)
          .onChange(async (value) => {
            this.plugin.settings.visionUpdateMode = value as "on-drop" | "while-dragging";
            await this.plugin.saveSettings();
          })
      );

    new Setting(maps)
      .setName("Player view light animations")
      .setDesc(
        "Animate flickering and buzzing light sources in the player map view. Turn this off on slower devices or very large maps."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.playerLightAnimations ?? true)
          .onChange(async (value) => {
            this.plugin.settings.playerLightAnimations = value;
            await this.plugin.saveSettings();
            this.plugin._playerMapViews.forEach((view) => view.refreshLightAnimationSettings());
          })
      );

    new Setting(maps)
      .setName("Map canvas resolution")
      .setDesc(
        "Higher values make tokens, fog, and grids sharper on some maps, but use more memory. Reopen maps after changing this."
      )
      .addDropdown((dd) =>
        dd
          .addOption("1", "1× (native)")
          .addOption("2", "2× (default)")
          .addOption("3", "3× (high)")
          .setValue(String(this.plugin.settings.mapCanvasScale ?? 2))
          .onChange(async (value) => {
            this.plugin.settings.mapCanvasScale = parseInt(value, 10);
            await this.plugin.saveSettings();
          })
      );

    // ── 4. Reference Data ───────────────────────────────────────────────
    const srd = addSection(containerEl, "Reference Data", "Import optional D&D 5e SRD notes and creature tokens for use as campaign reference.");

    new Setting(srd)
      .setName("Import all SRD reference data")
      .setDesc("Creates reference notes for conditions, equipment, races, features, and other SRD categories.")
      .addButton((btn) =>
        btn
          .setButtonText("Import All")
          .setCta()
          .onClick(async () => {
            await this.plugin.importAllSRDData();
          })
      );

    // Individual categories inside a nested collapsible
    const catBody = addSection(srd, "Individual Categories", "Import a single SRD category.");

    const srdCategories: { key: string; folder: string; name: string }[] = [
      { key: "ability-scores", folder: "z_AbilityScores", name: "Ability Scores" },
      { key: "classes", folder: "z_Classes", name: "Classes" },
      { key: "conditions", folder: "z_Conditions", name: "Conditions" },
      { key: "damage-types", folder: "z_DamageTypes", name: "Damage Types" },
      { key: "equipment", folder: "z_Equipment", name: "Equipment" },
      { key: "features", folder: "z_Features", name: "Features" },
      { key: "languages", folder: "z_Languages", name: "Languages" },
      { key: "magic-schools", folder: "z_MagicSchools", name: "Magic Schools" },
      { key: "proficiencies", folder: "z_Proficiencies", name: "Proficiencies" },
      { key: "races", folder: "z_Races", name: "Races" },
      { key: "skills", folder: "z_Skills", name: "Skills" },
      { key: "subclasses", folder: "z_Subclasses", name: "Subclasses" },
      { key: "subraces", folder: "z_Subraces", name: "Subraces" },
      { key: "traits", folder: "z_Traits", name: "Traits" },
      { key: "weapon-properties", folder: "z_WeaponProperties", name: "Weapon Properties" },
    ];

    // Render categories as a compact 2-column grid of buttons
    const catGrid = catBody.createDiv({ cls: "dnd-settings-srd-grid" });
    for (const cat of srdCategories) {
      const cell = catGrid.createEl("button", { text: cat.name, cls: "dnd-settings-srd-btn" });
      cell.addEventListener("click", async () => {
        cell.disabled = true;
        cell.textContent = `⏳ ${cat.name}…`;
        try {
          await this.plugin.importSRDCategory(cat.key, cat.folder, cat.name);
        } finally {
          cell.disabled = false;
          cell.textContent = cat.name;
        }
      });
    }

    // Creature token bulk import
    new Setting(srd)
      .setName("Import SRD creature tokens")
      .setDesc(
        "Creates SRD creature notes and battlemap tokens. Existing imported creatures with matching paths may be overwritten."
      )
      .addButton((btn) => {
        const statusEl = srd.createDiv({ cls: "dnd-settings-import-status" });
        btn
          .setButtonText("Import Creatures")
          .setCta()
          .onClick(async () => {
            btn.setDisabled(true);
            btn.setButtonText("⏳ Importing…");
            statusEl.empty();
            statusEl.createEl("p", { text: "Import in progress — check notices for updates." });
            try {
              const result = await this.plugin.importSRDCreatureTokens();
              statusEl.empty();
              statusEl.createEl("p", {
                text: `✅ ${result.imported} creatures imported, ${result.errors} errors.`,
              });
            } catch (err) {
              statusEl.empty();
              statusEl.createEl("p", {
                text: `❌ Import failed: ${err instanceof Error ? err.message : String(err)}`,
              });
            } finally {
              btn.setDisabled(false);
              btn.setButtonText("Import Creatures");
            }
          });
      });

    // ── 5. Maintenance ──────────────────────────────────────────────────
    const maintenance = addSection(containerEl, "Maintenance", "Update generated notes after plugin/template changes.");

    new Setting(maintenance)
      .setName("Migrate campaign files")
      .setDesc("Update older generated notes to the latest template versions. Backups are created before files are changed.")
      .addButton((btn) =>
        btn
          .setButtonText("Run Migrations")
          .setCta()
          .onClick(() => {
            this.plugin.migrateTemplates();
          })
      );

    // ── 5. Danger Zone ──────────────────────────────────────────────────
    const danger = addSection(containerEl, "Danger Zone", "Destructive actions — use with caution.", { cls: "dnd-settings-danger" });

    new Setting(danger)
      .setName("Purge all plugin data")
      .setDesc("Permanently remove all D&D Campaign Hub folders and files from this vault. This cannot be undone.")
      .addButton((btn) =>
        btn
          .setButtonText("Purge Vault")
          .setWarning()
          .onClick(() => {
            new PurgeConfirmModal(this.app, this.plugin).open();
          })
      );
  }
}
