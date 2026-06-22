import { App, Modal, Notice, Setting, TFile } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { updateYamlFrontmatter } from "../utils/YamlFrontmatter";
import {
  CAMPAIGN_SYSTEM_OPTIONS,
  getCampaignSystemLabel,
  isHowToBeAHeroSystem,
  normalizeCampaignSystem,
} from "./CampaignSystems";

export class CampaignSystemModal extends Modal {
  private system: string;

  constructor(
    app: App,
    private plugin: DndCampaignHubPlugin,
    private campaignPath: string,
  ) {
    super(app);
    this.system = normalizeCampaignSystem(plugin.getCampaignSystem(campaignPath));
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    const campaignName = this.campaignPath.split("/").pop() || this.campaignPath;
    contentEl.createEl("h2", { text: "Change Campaign System" });
    contentEl.createEl("p", {
      text: `Campaign: ${campaignName}`,
      cls: "setting-item-description",
    });

    new Setting(contentEl)
      .setName("Game System")
      .setDesc("Future system-specific tools will use this value to decide which campaign features are available.")
      .addDropdown((dropdown) => {
        CAMPAIGN_SYSTEM_OPTIONS.forEach((option) => dropdown.addOption(option.id, option.label));
        dropdown
          .setValue(this.system)
          .onChange((value) => {
            this.system = value;
          });
      });

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText("Save")
          .setCta()
          .onClick(async () => {
            await this.save();
          }),
      )
      .addButton((button) =>
        button
          .setButtonText("Cancel")
          .onClick(() => this.close()),
      );
  }

  private async save() {
    const targets = this.getCampaignSystemFiles();
    if (targets.length === 0) {
      new Notice("No campaign files found to update.");
      return;
    }

    for (const file of targets) {
      const content = await this.app.vault.read(file);
      const updated = updateYamlFrontmatter(content, (fm) => ({
        ...fm,
        system: this.system,
      }));
      await this.app.vault.modify(file, updated);
    }
    if (isHowToBeAHeroSystem(this.system)) {
      await this.plugin.ensureFolderExists(`${this.campaignPath}/Evidences`);
    }

    this.close();
    new Notice(`Campaign system set to ${getCampaignSystemLabel(this.system)}.`);
  }

  private getCampaignSystemFiles(): TFile[] {
    const seen = new Set<string>();
    const files: TFile[] = [];
    const add = (path: string) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile && !seen.has(file.path)) {
        seen.add(file.path);
        files.push(file);
      }
    };

    const campaignName = this.campaignPath.split("/").pop() || "";
    add(`${this.campaignPath}/World.md`);
    if (campaignName) add(`${this.campaignPath}/${campaignName}.md`);

    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile?.path.startsWith(`${this.campaignPath}/`)) {
      const type = this.app.metadataCache.getFileCache(activeFile)?.frontmatter?.type;
      if (type === "campaign" || type === "world") add(activeFile.path);
    }

    return files;
  }

  onClose() {
    this.contentEl.empty();
  }
}
