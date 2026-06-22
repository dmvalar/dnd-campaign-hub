import { AbstractInputSuggest, App, Modal, Notice, Setting, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";

type EvidenceStatus = "new" | "reviewed" | "verified" | "disputed" | "resolved";
type EvidenceCategory = "clue" | "document" | "testimony" | "object" | "location" | "digital" | "other";

export class EvidenceCreationModal extends Modal {
  private evidenceName = "";
  private category: EvidenceCategory = "clue";
  private status: EvidenceStatus = "new";
  private source = "";
  private locationFound = "";
  private discoveredDate = "";
  private related = "";
  private summary = "";
  private details = "";
  private interpretation = "";
  private followUp = "";
  private isEdit = false;
  private originalPath = "";
  private originalName = "";
  private campaignPath = "";

  constructor(
    app: App,
    private plugin: DndCampaignHubPlugin,
    evidencePath?: string,
    campaignPath?: string,
  ) {
    super(app);
    this.campaignPath = campaignPath || plugin.resolveCampaign();
    if (evidencePath) {
      this.isEdit = true;
      this.originalPath = evidencePath;
    }
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    if (this.isEdit) {
      await this.loadEvidenceData();
    }

    contentEl.createEl("h2", { text: this.isEdit ? "Edit Evidence" : "Create Evidence" });

    new Setting(contentEl)
      .setName("Evidence Title")
      .setDesc("Short name shown in searches and evidence lists.")
      .addText((text) => {
        text
          .setPlaceholder("Bloody receipt, witness statement, strange symbol...")
          .setValue(this.evidenceName)
          .onChange((value) => {
            this.evidenceName = value;
          });
        if (!this.isEdit) text.inputEl.focus();
      });

    new Setting(contentEl)
      .setName("Category")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("clue", "Clue")
          .addOption("document", "Document")
          .addOption("testimony", "Testimony")
          .addOption("object", "Object")
          .addOption("location", "Location")
          .addOption("digital", "Digital")
          .addOption("other", "Other")
          .setValue(this.category)
          .onChange((value) => {
            this.category = value as EvidenceCategory;
          }),
      );

    new Setting(contentEl)
      .setName("Status")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("new", "New")
          .addOption("reviewed", "Reviewed")
          .addOption("verified", "Verified")
          .addOption("disputed", "Disputed")
          .addOption("resolved", "Resolved")
          .setValue(this.status)
          .onChange((value) => {
            this.status = value as EvidenceStatus;
          }),
      );

    new Setting(contentEl)
      .setName("Source")
      .setDesc("Who or what provided this evidence?")
      .addText((text) =>
        text
          .setPlaceholder("Witness, archive, crime scene...")
          .setValue(this.source)
          .onChange((value) => {
            this.source = value;
          }),
      );

    new Setting(contentEl)
      .setName("Location Found")
      .addText((text) =>
        text
          .setPlaceholder("Where it was discovered")
          .setValue(this.locationFound)
          .onChange((value) => {
            this.locationFound = value;
          }),
      );

    new Setting(contentEl)
      .setName("Discovered Date")
      .addText((text) =>
        text
          .setPlaceholder("In-game or real date")
          .setValue(this.discoveredDate)
          .onChange((value) => {
            this.discoveredDate = value;
          }),
      );

    new Setting(contentEl)
      .setName("Related")
      .setDesc("People, places, scenes, or other clues. Markdown links are fine.")
      .addText((text) => {
        text
          .setPlaceholder("[[NPC]], [[Scene]], case thread...")
          .setValue(this.related)
          .onChange((value) => {
            this.related = value;
          });
        text.inputEl.style.width = "100%";
        new EvidenceRelatedSuggest(this.app, text.inputEl, () => this.campaignPath);
      });

    this.addTextArea(contentEl, "Summary", "One or two sentences describing the clue.", this.summary, (value) => {
      this.summary = value;
    }, 3);
    this.addTextArea(contentEl, "Details", "Full evidence text, image notes, witness quote, or object description.", this.details, (value) => {
      this.details = value;
    }, 7);
    this.addTextArea(contentEl, "Interpretation", "What this might mean, including wrong leads or uncertainty.", this.interpretation, (value) => {
      this.interpretation = value;
    }, 5);
    this.addTextArea(contentEl, "Follow-up Questions", "What should the investigators check next?", this.followUp, (value) => {
      this.followUp = value;
    }, 4);

    const campaigns = this.plugin.getAllCampaigns().filter((campaign) => this.plugin.isHowToBeAHeroCampaign(campaign.path));
    if (campaigns.length === 0) {
      contentEl.createEl("p", {
        text: "No How to be a Hero campaign found. Change a campaign's system first.",
        cls: "mod-warning",
      });
      return;
    }

    const initialCampaign = campaigns.some((campaign) => campaign.path === this.campaignPath)
      ? this.campaignPath
      : campaigns[0]?.path || "";
    let selectedCampaign = initialCampaign;
    this.campaignPath = selectedCampaign;

    contentEl.createEl("h3", { text: "Save Location" });
    new Setting(contentEl)
      .setName("Campaign")
      .setDesc("Evidences are only available for How to be a Hero campaigns.")
      .addDropdown((dropdown) => {
        campaigns.forEach((campaign) => dropdown.addOption(campaign.path, campaign.name));
        dropdown
          .setValue(selectedCampaign)
          .onChange((value) => {
            selectedCampaign = value;
            this.campaignPath = value;
          });
      });

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText(this.isEdit ? "Update Evidence" : "Create Evidence")
          .setCta()
          .onClick(async () => {
            await this.saveEvidence(selectedCampaign);
          }),
      );
  }

  private addTextArea(
    container: HTMLElement,
    name: string,
    desc: string,
    value: string,
    onChange: (value: string) => void,
    rows: number,
  ) {
    new Setting(container)
      .setName(name)
      .setDesc(desc)
      .addTextArea((text) => {
        text
          .setValue(value)
          .onChange(onChange);
        text.inputEl.rows = rows;
        text.inputEl.style.width = "100%";
      });
  }

  private async loadEvidenceData() {
    const file = this.app.vault.getAbstractFileByPath(this.originalPath);
    if (!(file instanceof TFile)) {
      new Notice("Evidence file not found.");
      return;
    }

    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
    const parts = file.path.split("/");
    if (parts.length >= 2 && parts[0] === "ttrpgs") {
      this.campaignPath = `${parts[0]}/${parts[1]}`;
    }
    this.evidenceName = fm.name || file.basename;
    this.originalName = this.evidenceName;
    this.category = fm.category || "clue";
    this.status = fm.status || "new";
    this.source = fm.source || "";
    this.locationFound = fm.location_found || "";
    this.discoveredDate = fm.discovered || "";
    this.related = Array.isArray(fm.related) ? fm.related.join(", ") : (fm.related || "");

    const content = await this.app.vault.read(file);
    this.summary = this.extractSection(content, "Summary");
    this.details = this.extractSection(content, "Details");
    this.interpretation = this.extractSection(content, "Interpretation");
    this.followUp = this.extractSection(content, "Follow-up Questions");
  }

  private extractSection(content: string, heading: string): string {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = content.match(new RegExp(`##\\s*${escaped}\\s*\\n\\n([\\s\\S]*?)(?=\\n##\\s|$)`));
    return match?.[1]?.trim() || "";
  }

  private async saveEvidence(campaignPath: string) {
    if (!this.evidenceName.trim()) {
      new Notice("Please enter an evidence title.");
      return;
    }
    if (!this.plugin.isHowToBeAHeroCampaign(campaignPath)) {
      new Notice("Evidences can only be created in How to be a Hero campaigns.");
      return;
    }

    await this.ensureEvidenceFolder(campaignPath);

    let path = this.originalPath;
    let file: TFile | null = null;

    if (this.isEdit) {
      file = this.app.vault.getAbstractFileByPath(this.originalPath) as TFile;
      if (!file) {
        new Notice("Original evidence file not found.");
        return;
      }
      if (this.evidenceName !== this.originalName) {
        const folder = path.substring(0, path.lastIndexOf("/"));
        const newPath = `${folder}/${this.evidenceName}.md`;
        if (await this.app.vault.adapter.exists(newPath)) {
          new Notice(`Evidence named "${this.evidenceName}" already exists.`);
          return;
        }
        await this.app.fileManager.renameFile(file, newPath);
        path = newPath;
        file = this.app.vault.getAbstractFileByPath(path) as TFile;
      }
    } else {
      path = `${campaignPath}/Evidences/${this.evidenceName}.md`;
      if (await this.app.vault.adapter.exists(path)) {
        new Notice(`Evidence named "${this.evidenceName}" already exists.`);
        return;
      }
    }

    const content = this.createEvidenceContent(campaignPath);
    if (this.isEdit && file) {
      await this.app.vault.modify(file, content);
      new Notice(`Evidence "${this.evidenceName}" updated.`);
    } else {
      file = await this.app.vault.create(path, content);
      new Notice(`Evidence "${this.evidenceName}" created.`);
    }

    this.close();
    await this.app.workspace.openLinkText(file.path, "", false);
  }

  private async ensureEvidenceFolder(campaignPath: string) {
    const folderPath = `${campaignPath}/Evidences`;
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) {
      await this.plugin.ensureFolderExists(folderPath);
    }
  }

  private createEvidenceContent(campaignPath: string): string {
    const campaignName = campaignPath.split("/").pop() || "";
    const relatedItems = this.related
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const yamlList = relatedItems.length > 0
      ? `\nrelated:\n${relatedItems.map((item) => `  - ${JSON.stringify(item)}`).join("\n")}`
      : "\nrelated: []";

    return `---
type: evidence
template_version: 1.0.0
name: ${JSON.stringify(this.evidenceName)}
campaign: ${JSON.stringify(campaignName)}
system: how-to-be-a-hero
category: ${this.category}
status: ${this.status}
source: ${JSON.stringify(this.source)}
location_found: ${JSON.stringify(this.locationFound)}
discovered: ${JSON.stringify(this.discoveredDate)}${yamlList}
---

# ${this.evidenceName}

\`\`\`dnd-hub
\`\`\`

## Summary

${this.summary}

## Details

${this.details}

## Interpretation

${this.interpretation}

## Follow-up Questions

${this.followUp}
`;
  }

  onClose() {
    this.contentEl.empty();
  }
}

class EvidenceRelatedSuggest extends AbstractInputSuggest<TFile> {
  constructor(
    app: App,
    private inputEl: HTMLInputElement,
    private getCampaignPath: () => string,
  ) {
    super(app, inputEl);
  }

  getSuggestions(query: string): TFile[] {
    const term = this.currentToken(query).toLowerCase();
    if (!term) return [];

    const campaignPath = this.getCampaignPath();
    return this.app.vault.getMarkdownFiles()
      .filter((file) => !campaignPath || file.path.startsWith(`${campaignPath}/`))
      .filter((file) => {
        const haystack = `${file.basename} ${file.path}`.toLowerCase();
        return haystack.includes(term);
      })
      .slice(0, 12);
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.createEl("div", { text: file.basename });
    el.createEl("small", { text: file.path });
  }

  selectSuggestion(file: TFile): void {
    const value = this.inputEl.value;
    const cursor = this.inputEl.selectionStart ?? value.length;
    const beforeCursor = value.slice(0, cursor);
    const afterCursor = value.slice(cursor);
    const lastComma = beforeCursor.lastIndexOf(",");
    const prefix = lastComma >= 0 ? `${beforeCursor.slice(0, lastComma + 1)} ` : "";
    const suffixComma = afterCursor.indexOf(",");
    const suffix = suffixComma >= 0 ? afterCursor.slice(suffixComma) : "";
    const link = `[[${file.path.replace(/\.md$/i, "")}|${file.basename}]]`;
    this.inputEl.value = `${prefix}${link}${suffix}`;
    this.inputEl.trigger("input");
    this.inputEl.trigger("change");
  }

  private currentToken(value: string): string {
    const cursor = this.inputEl.selectionStart ?? value.length;
    const beforeCursor = value.slice(0, cursor);
    const raw = beforeCursor.slice(beforeCursor.lastIndexOf(",") + 1).trim();
    return raw.replace(/^\[\[/, "").replace(/\]\]$/, "");
  }
}
