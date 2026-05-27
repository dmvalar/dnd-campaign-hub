import { App, Modal, Notice, TFile } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import type { HandoutContentType } from "./types";

export interface InlineHandoutConfig {
  path: string;
  label?: string;
  contentType?: HandoutContentType;
}

interface HandoutEntry {
  file: TFile;
  label: string;
  contentType: HandoutContentType;
  detail: string;
}

export class InsertHandoutWidgetModal extends Modal {
  private entries: HandoutEntry[] = [];
  private filtered: HandoutEntry[] = [];
  private listContainer: HTMLElement | null = null;
  private selectedIndex = 0;

  constructor(
    app: App,
    private plugin: DndCampaignHubPlugin,
    private onSelect: (config: InlineHandoutConfig) => void,
  ) {
    super(app);
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("dnd-insert-handout-widget-modal");

    contentEl.createEl("h2", { text: "Insert Handout Control" });

    const searchInput = contentEl.createEl("input", {
      type: "text",
      placeholder: "Search handouts, images, PDFs, or notes...",
      cls: "dnd-handout-widget-search-input",
    });

    searchInput.addEventListener("input", () => this.filterEntries(searchInput.value));
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.filtered.length - 1);
        this.highlightSelected();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.highlightSelected();
      } else if (event.key === "Enter") {
        event.preventDefault();
        const selected = this.filtered[this.selectedIndex];
        if (selected) this.selectEntry(selected);
      }
    });

    this.listContainer = contentEl.createDiv({ cls: "dnd-handout-widget-list" });

    await this.loadEntries();
    this.filtered = [...this.entries];
    this.renderList();

    setTimeout(() => searchInput.focus(), 50);
  }

  private async loadEntries() {
    const activeCampaignPath = this.plugin.getActiveCampaignPath?.() || "";
    const files = this.app.vault.getFiles()
      .filter((file) => {
        const contentType = detectHandoutContentType(file.path);
        if (!contentType) return false;
        if (!activeCampaignPath) return true;
        return file.path.startsWith(activeCampaignPath) || contentType !== "note";
      });

    this.entries = files.map((file) => {
      const contentType = detectHandoutContentType(file.path) || "note";
      return {
        file,
        label: file.basename,
        contentType,
        detail: contentType === "note" ? file.path : `${contentType.toUpperCase()} - ${file.path}`,
      };
    }).sort((a, b) => a.label.localeCompare(b.label));
  }

  private filterEntries(query: string) {
    const normalized = query.trim().toLowerCase();
    this.selectedIndex = 0;
    this.filtered = normalized
      ? this.entries.filter((entry) =>
        entry.label.toLowerCase().includes(normalized) ||
        entry.detail.toLowerCase().includes(normalized))
      : [...this.entries];
    this.renderList();
  }

  private renderList() {
    if (!this.listContainer) return;
    this.listContainer.empty();

    if (this.filtered.length === 0) {
      const empty = this.listContainer.createDiv({ cls: "dnd-handout-widget-empty" });
      empty.createEl("p", { text: "No projectable handouts found." });
      empty.createEl("p", { text: "Supported handouts are notes, images, and PDFs." });
      return;
    }

    this.filtered.forEach((entry, index) => {
      const row = this.listContainer!.createDiv({ cls: "dnd-handout-widget-row" });
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");

      row.createEl("span", {
        text: getHandoutIcon(entry.contentType),
        cls: "dnd-handout-widget-row-icon",
      });

      const textCol = row.createDiv({ cls: "dnd-handout-widget-row-text" });
      textCol.createDiv({ text: entry.label, cls: "dnd-handout-widget-row-title" });
      textCol.createDiv({ text: entry.detail, cls: "dnd-handout-widget-row-detail" });

      row.addEventListener("click", () => this.selectEntry(entry));
      row.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        this.selectEntry(entry);
      });

      if (index === this.selectedIndex) row.addClass("is-selected");
    });
  }

  private highlightSelected() {
    if (!this.listContainer) return;
    this.listContainer.querySelectorAll<HTMLElement>(".dnd-handout-widget-row").forEach((row, index) => {
      row.toggleClass("is-selected", index === this.selectedIndex);
      if (index === this.selectedIndex) row.scrollIntoView({ block: "nearest" });
    });
  }

  private selectEntry(entry: HandoutEntry) {
    this.onSelect({
      path: entry.file.path,
      label: entry.label,
      contentType: entry.contentType,
    });
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

export function renderInlineHandoutWidgets(el: HTMLElement) {
  el.querySelectorAll<HTMLElement>("[data-dnd-handout]").forEach((widget) => {
    widget.classList.add("dnd-handout-inline-btn");
    if (!widget.getAttribute("role")) widget.setAttribute("role", "button");
    if (!widget.getAttribute("tabindex")) widget.setAttribute("tabindex", "0");
    if (!widget.getAttribute("aria-label")) widget.setAttribute("aria-label", "Project handout");
  });
}

export function handleInlineHandoutInteraction(
  event: MouseEvent | KeyboardEvent,
  plugin: DndCampaignHubPlugin,
): boolean {
  if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return false;

  const target = event.target;
  if (!(target instanceof Element)) return false;

  const control = target.closest<HTMLElement>("[data-dnd-handout]");
  if (!control) return false;

  const config = parseHandoutInlineData(control.getAttribute("data-dnd-handout") || "");
  if (!config?.path) return false;

  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();

  void projectInlineHandout(plugin, config, control);
  return true;
}

export function buildHandoutInlineMarkdown(config: InlineHandoutConfig): string {
  const normalized = normalizeHandoutConfig(config);
  const label = normalized.label || normalized.path.split("/").pop()?.replace(/\.[^.]+$/, "") || "Handout";
  const data = escapeHtmlAttribute(encodeHandoutInlineData({ ...normalized, label }));
  return `<button type="button" class="dnd-handout-inline-btn" data-dnd-handout="${data}" aria-label="Project handout: ${escapeHtmlAttribute(label)}">${getHandoutIcon(normalized.contentType)} ${escapeHtmlText(label)}</button>`;
}

export function parseHandoutInlineMarkdown(markdown: string): InlineHandoutConfig | null {
  const htmlData = markdown.trim().match(/data-dnd-handout=(?:"([^"]+)"|'([^']+)')/);
  const encodedData = htmlData?.[1] ?? htmlData?.[2];
  return encodedData ? parseHandoutInlineData(unescapeHtmlAttribute(encodedData)) : null;
}

export function detectHandoutContentType(filePath: string): HandoutContentType | null {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (ext === "md") return "note";
  return null;
}

async function projectInlineHandout(
  plugin: DndCampaignHubPlugin,
  config: InlineHandoutConfig,
  control: HTMLElement,
) {
  const normalized = normalizeHandoutConfig(config);
  if (!normalized.contentType) {
    new Notice("This handout file type cannot be projected.");
    return;
  }

  const spm = plugin.sessionProjectionManager;
  if (!spm?.isActive()) {
    plugin.openSessionProjectionHub();
    new Notice("Start a projection session, then project the handout.");
    return;
  }

  const state = spm.getAllScreenStates()[0];
  if (!state) {
    plugin.openSessionProjectionHub();
    new Notice("No projection screen is available for handouts.");
    return;
  }

  control.classList.add("playing");
  try {
    await plugin.projectionManager.projectHandout(normalized.path, normalized.contentType, state.screen);
  } finally {
    setTimeout(() => control.classList.remove("playing"), 400);
  }
}

function normalizeHandoutConfig(config: InlineHandoutConfig): Required<InlineHandoutConfig> {
  const path = typeof config.path === "string" ? config.path.trim() : "";
  const contentType = config.contentType || detectHandoutContentType(path) || "note";
  const label = typeof config.label === "string" ? config.label.trim() : "";
  return { path, label, contentType };
}

function encodeHandoutInlineData(config: InlineHandoutConfig): string {
  return encodeURIComponent(JSON.stringify(config));
}

function parseHandoutInlineData(data: string): InlineHandoutConfig | null {
  try {
    const parsed = JSON.parse(decodeURIComponent(data)) as Partial<InlineHandoutConfig>;
    if (!parsed.path || typeof parsed.path !== "string") return null;
    const contentType = parsed.contentType || detectHandoutContentType(parsed.path);
    if (contentType !== "image" && contentType !== "pdf" && contentType !== "note") return null;
    return {
      path: parsed.path,
      label: typeof parsed.label === "string" ? parsed.label : undefined,
      contentType,
    };
  } catch {
    return null;
  }
}

function getHandoutIcon(contentType: HandoutContentType | undefined): string {
  if (contentType === "image") return "🖼️";
  if (contentType === "pdf") return "📄";
  return "📜";
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function unescapeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
