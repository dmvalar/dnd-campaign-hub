import { Modal, TFile } from "obsidian";
import type DndCampaignHubPlugin from "../main";

export type CreationNextStepKind =
  | "session"
  | "scene"
  | "adventure"
  | "pc"
  | "npc"
  | "faction"
  | "encounter"
  | "map"
  | "creature"
  | "trap"
  | "item"
  | "spell";

type NextStepAction = {
  label: string;
  description: string;
  action: () => void | Promise<void>;
};

export class CreationNextStepsModal extends Modal {
  constructor(
    private plugin: DndCampaignHubPlugin,
    private file: TFile | null,
    private kind: CreationNextStepKind,
    private campaignPath: string,
    private fallbackName = ""
  ) {
    super(plugin.app);
  }

  onOpen() {
    this.modalEl.addClass("dnd-creation-next-modal");
    this.titleEl.setText("Created");
    this.render();
  }

  onClose() {
    this.contentEl.empty();
  }

  private render() {
    const { contentEl } = this;
    contentEl.empty();

    const header = contentEl.createDiv({ cls: "dnd-creation-next-header" });
    header.createEl("strong", { text: this.file?.basename || this.fallbackName || "Created item" });
    header.createEl("span", { text: this.getSummary() });

    const grid = contentEl.createDiv({ cls: "dnd-creation-next-actions" });
    for (const action of this.getActions()) {
      const button = grid.createEl("button", { cls: "dnd-creation-next-action" });
      button.createEl("strong", { text: action.label });
      button.createEl("span", { text: action.description });
      button.addEventListener("click", () => {
        this.close();
        void action.action();
      });
    }
  }

  private getSummary(): string {
    switch (this.kind) {
      case "session":
        return "You can prep it, run it, or add scenes while the context is fresh.";
      case "scene":
        return "Scenes become most useful once they are linked to maps, music, or encounters.";
      case "encounter":
        return "Encounters can be loaded into live combat or connected to a scene.";
      case "map":
        return "Maps become most useful when they are connected to encounters, scenes, or projection.";
      case "adventure":
        return "Adventures are easiest to run once they have a first scene and session link.";
      case "pc":
      case "npc":
      case "faction":
        return "Character and faction notes can now be linked into sessions, scenes, and parties.";
      default:
        return "The note is ready. Here are the most common next actions.";
    }
  }

  private getActions(): NextStepAction[] {
    const common: NextStepAction[] = [
      ...(this.file ? [{
        label: "Open Note",
        description: "Return to the note you just created.",
        action: () => this.plugin.app.workspace.openLinkText(this.file!.path, "", false),
      }] : []),
      {
        label: "Campaign Home",
        description: "Go back to the campaign overview.",
        action: () => this.plugin.openCampaignHome(),
      },
    ];

    switch (this.kind) {
      case "session":
        return [
          {
            label: "Start Session",
            description: "Open the live session dashboard for this campaign.",
            action: () => this.plugin.openSessionRunDashboard(this.campaignPath),
          },
          {
            label: "Add Scene",
            description: "Create the next playable moment.",
            action: () => this.plugin.createScene(this.campaignPath),
          },
          ...common,
        ];
      case "scene":
        return [
          {
            label: "Add Encounter",
            description: "Prepare combat using this campaign's party.",
            action: () => this.plugin.createEncounter(this.campaignPath),
          },
          {
            label: "Link Map",
            description: "Create or choose a map for this scene.",
            action: () => this.plugin.openMapManager(),
          },
          {
            label: "Link Music",
            description: "Prepare ambience, scene music, or sound effects.",
            action: () => this.plugin.ensureMusicPlayerOpen(),
          },
          ...common,
        ];
      case "encounter":
        return [
          {
            label: "Load in Combat Tracker",
            description: "Open the combat tracker for live play.",
            action: () => this.plugin.openCombatTracker(),
          },
          {
            label: "Link to Scene",
            description: "Create or open a scene that can reference this encounter.",
            action: () => this.plugin.createScene(this.campaignPath),
          },
          {
            label: "Create Map",
            description: "Prepare a battle map to pair with the encounter.",
            action: () => this.plugin.createMap(this.campaignPath),
          },
          ...common,
        ];
      case "map":
        return [
          {
            label: "Link Encounter",
            description: "Build an encounter that can use this map.",
            action: () => this.plugin.createEncounter(this.campaignPath),
          },
          {
            label: "Open GM Map",
            description: "Open Map Manager to edit or run the map.",
            action: () => this.plugin.openMapManager(),
          },
          {
            label: "Project Player Map",
            description: "Open projection tools for player-facing map display.",
            action: () => this.plugin.openSessionProjectionHub(),
          },
          ...common,
        ];
      case "adventure":
        return [
          {
            label: "Add Scene",
            description: "Create the first scene for this adventure.",
            action: () => this.plugin.createScene(this.campaignPath),
          },
          {
            label: "Create Session",
            description: "Prepare a session that uses this adventure.",
            action: () => this.plugin.createSession(this.campaignPath),
          },
          ...common,
        ];
      default:
        return common;
    }
  }
}
