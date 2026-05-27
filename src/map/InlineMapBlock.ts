import { App, Modal, Notice } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { GM_MAP_VIEW_TYPE } from "../constants";

export interface InlineMapConfig {
  mapId: string;
  name?: string;
}

interface MapEntry {
  mapId: string;
  name: string;
  detail: string;
  isTemplate: boolean;
  lastModified: number;
}

export class InsertMapWidgetModal extends Modal {
  private entries: MapEntry[] = [];
  private filtered: MapEntry[] = [];
  private listContainer: HTMLElement | null = null;
  private selectedIndex = 0;

  constructor(
    app: App,
    private plugin: DndCampaignHubPlugin,
    private onSelect: (config: InlineMapConfig) => void,
  ) {
    super(app);
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("dnd-insert-map-widget-modal");

    contentEl.createEl("h2", { text: "Insert Map Control" });

    const searchInput = contentEl.createEl("input", {
      type: "text",
      placeholder: "Search active maps...",
      cls: "dnd-map-widget-search-input",
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

    this.listContainer = contentEl.createDiv({ cls: "dnd-map-widget-list" });
    await this.loadEntries();
    this.filtered = [...this.entries];
    this.renderList();
    setTimeout(() => searchInput.focus(), 50);
  }

  private async loadEntries() {
    this.entries = [];
    try {
      const annotationDir = `${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}/map-annotations`;
      if (!(await this.app.vault.adapter.exists(annotationDir))) return;

      const listing = await this.app.vault.adapter.list(annotationDir);
      for (const filePath of listing.files) {
        if (!filePath.endsWith(".json")) continue;
        try {
          const raw = await this.app.vault.adapter.read(filePath);
          const data = JSON.parse(raw) as Record<string, unknown>;
          const mapId = typeof data.mapId === "string" ? data.mapId : "";
          if (!mapId) continue;

          const isTemplate = data.isTemplate === true;
          if (isTemplate) continue;

          const name = typeof data.name === "string" && data.name.trim()
            ? data.name.trim()
            : mapId;
          const type = typeof data.type === "string" ? data.type : "map";
          const imageFile = typeof data.imageFile === "string" ? data.imageFile : "";
          const lastModifiedRaw = typeof data.lastModified === "string"
            ? Date.parse(data.lastModified)
            : 0;

          this.entries.push({
            mapId,
            name,
            detail: [type, imageFile].filter(Boolean).join(" - "),
            isTemplate,
            lastModified: Number.isFinite(lastModifiedRaw) ? lastModifiedRaw : 0,
          });
        } catch {
          // skip corrupt map annotation files
        }
      }

      this.entries.sort((a, b) => b.lastModified - a.lastModified || a.name.localeCompare(b.name));
    } catch (error) {
      console.error("[InlineMapBlock] Failed to load maps", error);
    }
  }

  private filterEntries(query: string) {
    const normalized = query.trim().toLowerCase();
    this.selectedIndex = 0;
    this.filtered = normalized
      ? this.entries.filter((entry) =>
        entry.name.toLowerCase().includes(normalized) ||
        entry.detail.toLowerCase().includes(normalized) ||
        entry.mapId.toLowerCase().includes(normalized))
      : [...this.entries];
    this.renderList();
  }

  private renderList() {
    if (!this.listContainer) return;
    this.listContainer.empty();

    if (this.filtered.length === 0) {
      const empty = this.listContainer.createDiv({ cls: "dnd-map-widget-empty" });
      empty.createEl("p", { text: "No active maps found." });
      empty.createEl("p", { text: "Create a map first, then insert a compact note control for it." });
      const createBtn = empty.createEl("button", { text: "Create Map" });
      createBtn.addEventListener("click", () => {
        this.close();
        void this.plugin.createMap();
      });
      return;
    }

    this.filtered.forEach((entry, index) => {
      const row = this.listContainer!.createDiv({ cls: "dnd-map-widget-row" });
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");
      row.createEl("span", { text: "🗺️", cls: "dnd-map-widget-row-icon" });

      const textCol = row.createDiv({ cls: "dnd-map-widget-row-text" });
      textCol.createDiv({ text: entry.name, cls: "dnd-map-widget-row-title" });
      textCol.createDiv({ text: entry.detail || entry.mapId, cls: "dnd-map-widget-row-detail" });

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
    this.listContainer.querySelectorAll<HTMLElement>(".dnd-map-widget-row").forEach((row, index) => {
      row.toggleClass("is-selected", index === this.selectedIndex);
      if (index === this.selectedIndex) row.scrollIntoView({ block: "nearest" });
    });
  }

  private selectEntry(entry: MapEntry) {
    this.onSelect({ mapId: entry.mapId, name: entry.name });
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

export function renderInlineMapWidgets(el: HTMLElement) {
  el.querySelectorAll<HTMLElement>("[data-dnd-map]").forEach((widget) => {
    widget.classList.add("dnd-map-inline-btn");
    if (!widget.getAttribute("role")) widget.setAttribute("role", "button");
    if (!widget.getAttribute("tabindex")) widget.setAttribute("tabindex", "0");
    if (!widget.getAttribute("aria-label")) widget.setAttribute("aria-label", "Open map");
  });
}

export function handleInlineMapInteraction(
  event: MouseEvent | KeyboardEvent,
  plugin: DndCampaignHubPlugin,
): boolean {
  if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return false;

  const target = event.target;
  if (!(target instanceof Element)) return false;

  const control = target.closest<HTMLElement>("[data-dnd-map]");
  if (!control) return false;

  const config = parseMapInlineData(control.getAttribute("data-dnd-map") || "");
  if (!config?.mapId) return false;

  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();

  control.classList.add("playing");
  void openInlineMap(plugin, config).finally(() => {
    setTimeout(() => control.classList.remove("playing"), 400);
  });

  return true;
}

export function buildMapInlineMarkdown(config: InlineMapConfig): string {
  const normalized = normalizeMapConfig(config);
  const label = normalized.name || normalized.mapId;
  const data = escapeHtmlAttribute(encodeMapInlineData(normalized));
  return `<button type="button" class="dnd-map-inline-btn" data-dnd-map="${data}" aria-label="Open map: ${escapeHtmlAttribute(label)}">🗺️ ${escapeHtmlText(label)}</button>`;
}

export function parseMapCodeblockMarkdown(markdown: string): InlineMapConfig | null {
  const trimmed = markdown.trim();
  const match = trimmed.match(/^```dnd-map\s*\n([\s\S]*?)\n?```$/);
  const source = (match?.[1] ?? trimmed).trim();
  if (!source) return null;

  try {
    const parsed = JSON.parse(source) as Partial<InlineMapConfig>;
    const normalized = normalizeMapConfig(parsed);
    return normalized.mapId ? normalized : null;
  } catch {
    const mapId = source.match(/"mapId"\s*:\s*"([^"]+)"/)?.[1];
    return mapId ? normalizeMapConfig({ mapId }) : null;
  }
}

export function parseMapInlineMarkdown(markdown: string): InlineMapConfig | null {
  const htmlData = markdown.trim().match(/data-dnd-map=(?:"([^"]+)"|'([^']+)')/);
  const encodedData = htmlData?.[1] ?? htmlData?.[2];
  return encodedData ? parseMapInlineData(unescapeHtmlAttribute(encodedData)) : null;
}

async function openInlineMap(plugin: DndCampaignHubPlugin, config: InlineMapConfig) {
  const savedData = await plugin.loadMapAnnotations(config.mapId);
  if (!savedData?.imageFile) {
    new Notice("Map data not found. Open Map Manager to review saved maps.");
    plugin.openMapManager();
    return;
  }

  const existingLeaf = plugin.app.workspace.getLeavesOfType(GM_MAP_VIEW_TYPE)
    .find((leaf: any) => leaf.view?.getMapId?.() === config.mapId);

  if (existingLeaf) {
    plugin.app.workspace.setActiveLeaf(existingLeaf);
    new Notice("Map already open");
    return;
  }

  const leaf = plugin.app.workspace.getLeaf(true);
  await leaf.setViewState({
    type: GM_MAP_VIEW_TYPE,
    active: true,
    state: {
      mapId: config.mapId,
      notePath: "",
      sourceConfig: JSON.stringify({ mapId: config.mapId }),
    },
  });
  plugin.app.workspace.setActiveLeaf(leaf);
  new Notice(`Map opened: ${savedData.name || config.name || config.mapId}`);
}

function normalizeMapConfig(config: Partial<InlineMapConfig>): InlineMapConfig {
  const mapId = typeof config.mapId === "string" ? config.mapId.trim() : "";
  const name = typeof config.name === "string" && config.name.trim() ? config.name.trim() : undefined;
  return { mapId, name };
}

function encodeMapInlineData(config: InlineMapConfig): string {
  return encodeURIComponent(JSON.stringify(config));
}

function parseMapInlineData(data: string): InlineMapConfig | null {
  try {
    const parsed = JSON.parse(decodeURIComponent(data)) as Partial<InlineMapConfig>;
    const normalized = normalizeMapConfig(parsed);
    return normalized.mapId ? normalized : null;
  } catch {
    return null;
  }
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
