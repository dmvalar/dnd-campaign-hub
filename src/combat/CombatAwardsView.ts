import { ItemView, WorkspaceLeaf } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { COMBAT_AWARDS_VIEW_TYPE } from "../constants";
import type { CombatRunActorRef, CombatState } from "./types";

type AwardEntry = { actor: CombatRunActorRef; value: number };
type AwardDefinition = { title: string; unit: string; entries: AwardEntry[] };

export class CombatAwardsView extends ItemView {
  plugin: DndCampaignHubPlugin;
  private combatState: CombatState | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: DndCampaignHubPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return COMBAT_AWARDS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Combat Awards";
  }

  getIcon(): string {
    return "trophy";
  }

  async setState(state: Record<string, unknown>, result: any): Promise<void> {
    await super.setState(state, result);
    this.combatState = (state.combatState as CombatState | undefined) || null;
    this.render();
  }

  async onOpen() {
    this.render();
  }

  private render() {
    const container = this.containerEl.children[1] as HTMLElement;
    if (!container) return;
    container.empty();
    container.addClass("dnd-ct-awards-view");

    if (!this.combatState) {
      const empty = container.createDiv({ cls: "dnd-ct-awards-empty" });
      empty.createEl("h1", { text: "Encounter Awards" });
      empty.createEl("p", { text: "No finished encounter selected." });
      return;
    }

    const summary = this.plugin.combatTracker.summarizeCombatRun(this.combatState);
    const awards: AwardDefinition[] = [
      { title: "Most Enemies Defeated", entries: summary.enemiesDefeated, unit: "defeated" },
      { title: "Most Damage Dealt", entries: summary.damageDealt, unit: "damage" },
      { title: "Most Damage Taken", entries: summary.damageTaken, unit: "damage" },
      { title: "Best Healer", entries: summary.healingDone, unit: "healing" },
    ];

    const header = container.createDiv({ cls: "dnd-ct-awards-hero" });
    header.createEl("div", { cls: "dnd-ct-awards-kicker", text: "Encounter Complete" });
    header.createEl("h1", { text: this.combatState.encounterName });
    header.createEl("div", {
      cls: "dnd-ct-awards-round",
      text: `Round ${this.combatState.round} results`,
    });

    if (summary.mvp) {
      const mvp = container.createDiv({ cls: "dnd-ct-awards-mvp" });
      mvp.createDiv({ cls: "dnd-ct-awards-mvp-trophy", text: "🏆" });
      this.renderPortrait(mvp, summary.mvp.actor, "dnd-ct-awards-mvp-portrait");
      const text = mvp.createDiv({ cls: "dnd-ct-awards-mvp-text" });
      text.createDiv({ cls: "dnd-ct-awards-mvp-label", text: "MVP of the Encounter" });
      text.createDiv({ cls: "dnd-ct-awards-mvp-name", text: summary.mvp.actor.display });
      text.createDiv({ cls: "dnd-ct-awards-mvp-reasons", text: summary.mvp.reasons.join(" · ") });
    }

    const grid = container.createDiv({ cls: "dnd-ct-awards-board" });
    awards.forEach((award) => this.renderAwardPodium(grid, award));
  }

  private renderAwardPodium(parent: HTMLElement, award: AwardDefinition) {
    const card = parent.createDiv({ cls: "dnd-ct-awards-podium-card" });
    card.createEl("h2", { text: award.title });

    if (award.entries.length === 0) {
      card.createDiv({ cls: "dnd-ct-awards-no-score", text: "No score this time" });
      return;
    }

    const podium = card.createDiv({ cls: "dnd-ct-awards-podium" });
    const placements = [
      { place: 2, entry: award.entries[1], cls: "second" },
      { place: 1, entry: award.entries[0], cls: "first" },
      { place: 3, entry: award.entries[2], cls: "third" },
    ];

    placements.forEach((slot) => {
      const step = podium.createDiv({ cls: `dnd-ct-awards-step dnd-ct-awards-step-${slot.cls}` });
      if (!slot.entry) {
        step.createDiv({ cls: "dnd-ct-awards-empty-place", text: String(slot.place) });
        return;
      }

      this.renderPortrait(step, slot.entry.actor);
      step.createDiv({ cls: "dnd-ct-awards-rank", text: `#${slot.place}` });
      step.createDiv({ cls: "dnd-ct-awards-name", text: slot.entry.actor.display });
      step.createDiv({ cls: "dnd-ct-awards-score", text: `${slot.entry.value} ${award.unit}` });
    });
  }

  private renderPortrait(parent: HTMLElement, actor: CombatRunActorRef, extraClass = "") {
    const portrait = parent.createDiv({ cls: `dnd-ct-awards-portrait ${extraClass}`.trim() });
    const imageResourcePath = this.plugin.combatTracker.getCombatantPortraitResourcePath(actor);
    if (imageResourcePath) {
      const img = portrait.createEl("img");
      img.src = imageResourcePath;
      img.alt = "";
    } else {
      const initials = actor.display
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || "")
        .join("") || "?";
      portrait.createEl("span", { text: initials });
    }
  }
}
