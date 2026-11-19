import { planAdventure } from "./adventureAuthoring";
import { planScene } from "./sceneAuthoring";
import { planNpc } from "./npcAuthoring";
import { planMonster } from "./monsterAuthoring";
import { planEncounter } from "./encounterAuthoring";
import { planMap } from "./mapAuthoring";
import { planSession } from "./sessionAuthoring";
import type { AuthoringOperationType, AuthoringPlanner } from "./types";

export const AUTHORING_PLANNERS: Record<AuthoringOperationType, AuthoringPlanner> = {
  create_adventure: planAdventure, create_scene: planScene, create_npc: planNpc,
  create_monster: planMonster, create_encounter: planEncounter, create_map: planMap, create_session: planSession,
};
