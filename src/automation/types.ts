import type { App } from "obsidian";
import type DndCampaignHubPlugin from "../main";

export interface AuthoringEffect {
  key: string;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/** Planning only: writes and effects are applied by the batch transaction. */
export interface AuthoringContext {
  app: App;
  plugin: DndCampaignHubPlugin;
  campaignPath: string;
  operationId: string;
  now: number;
  id(prefix: string): string;
  readNote(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  listNotes(folder: string): string[];
  stageNote(path: string, content: string): Promise<void>;
  stageUpdate(path: string, transform: (content: string) => string): Promise<void>;
  stageEffect(effect: AuthoringEffect): void;
  warn(message: string): void;
}

export interface AuthoringResult {
  notePath: string;
  tokenId?: string;
  mapId?: string;
  [key: string]: unknown;
}

export type AuthoringOperationType = "create_monster" | "create_npc" | "create_adventure"
  | "create_scene" | "create_encounter" | "create_map" | "create_session";

export interface AuthoringOperation {
  id: string;
  type: AuthoringOperationType;
  input: Record<string, unknown>;
}

export interface AuthoringRequest {
  schemaVersion: 1;
  requestId: string;
  campaignPath: string;
  dryRun?: boolean;
  operations: AuthoringOperation[];
}

export interface AuthoringResponse {
  schemaVersion: 1;
  requestId: string;
  status: "preview" | "completed" | "failed" | "interrupted";
  results: Record<string, AuthoringResult>;
  files: Array<{ path: string; action: "create" | "update" }>;
  warnings: string[];
  error?: string;
  recoveryErrors?: string[];
  /** Intended outputs for inspecting an interrupted or incompletely recovered batch. */
  plannedResults?: Record<string, AuthoringResult>;
}

export type AuthoringPlanner = (context: AuthoringContext, input: unknown) => Promise<AuthoringResult>;
