# Sessions and campaigns specialist

Own campaign/session lifecycle, adventure and scene relationships, session prep/run dashboards, and hub campaign orchestration. Follow shared workflow and preservation rules in [../../AGENTS.md](../../AGENTS.md) and [../../CONTRIBUTING.md](../../CONTRIBUTING.md).

## Ownership and entry points

- Session selection and lifecycle rules: [src/session/sessionLifecycle.ts](../../src/session/sessionLifecycle.ts), [SessionCreationModal.ts](../../src/session/SessionCreationModal.ts), [EndSessionModal.ts](../../src/session/EndSessionModal.ts).
- Session/adventure backlinks and notes: [SessionBacklinks.ts](../../src/session/SessionBacklinks.ts), [quickNotes.ts](../../src/session/quickNotes.ts).
- Prep and live-run UI: [SessionPrepDashboardView.ts](../../src/session/SessionPrepDashboardView.ts), [SessionRunDashboardView.ts](../../src/session/SessionRunDashboardView.ts), [UnsavedChangesGuard.ts](../../src/utils/UnsavedChangesGuard.ts).
- Campaign and hub orchestration: [CampaignCreationModal.ts](../../src/campaign/CampaignCreationModal.ts), [CampaignHomeView.ts](../../src/hub/CampaignHomeView.ts), [campaignSearch.ts](../../src/hub/campaignSearch.ts), [DndHubModal.ts](../../src/hub/DndHubModal.ts).
- Adventure/scene creation and campaign utilities: [src/adventure/AdventureCreationModal.ts](../../src/adventure/AdventureCreationModal.ts), [src/scene/SceneCreationModal.ts](../../src/scene/SceneCreationModal.ts), [src/campaign/CampaignSystems.ts](../../src/campaign/CampaignSystems.ts).
- Party roster data is owned by [PartyManager.ts](../../src/party/PartyManager.ts); coordinate when session/campaign UI needs party data instead of duplicating roster state. Combat behavior belongs to the combat specialist.

## Invariants and boundaries

- `selectCurrentSession` ignores archived sessions, then prefers `in-progress`, `planned`, unknown/legacy status, `completed`; ties prefer the higher session number. Preserve this ordering and legacy status fallback when changing campaign “current session” selection.
- A campaign is the broader scope; a session may link one or more adventures. Keep campaign selection separate from the legacy/singular `adventure` field and plural `adventures` links.
- Session edits maintain both sides of adventure relationships: session frontmatter and the adventure's `sessions` backlinks. When links change, update additions and removals without discarding unrelated frontmatter or user-authored YAML.
- `planned_scenes` records the session's explicit scene plan. Keep it distinct from `starting_scene`; retain compatibility for sessions whose adventure/scene information is legacy or absent.
- Use `session/adventureScenes.ts` for campaign-scoped adventure resolution and scene membership in pickers, dashboards, note listings, continuation, and bulk status updates. Explicit adventure/campaign relationships take precedence over directory inference. Legacy folder inference must have one unambiguous owner; a shared parent prefix or a global basename match is insufficient.
- Agent authoring uses the shared pure `sceneAdventurePath` rules over transaction-backed reads, including preceding staged adventures/scenes/maps. Do not rely on metadata-cache updates for batch dependencies. Reject occupied scene/session numbers; agent creation must never silently renumber authored scenes. Relationship updates preserve comments and the authored body with `automation/frontmatter.ts` and commit-time conflict checks.
- Intersect explicit planned scenes with the linked adventures' current membership. A nonempty plan whose links are missing or outside that membership must not expand into all adventure scenes.
- Scene edits merge owned fields into existing frontmatter and preserve handout fields, custom properties, lifecycle/session metadata, and authored body content. In-place edits use `vault.process` against the latest document; invalid YAML must leave the original note intact.
- When a scene edit already persists its encounter link, save encounter data with `linkToScene = false` to avoid a second scene rewrite. Other encounter creation callers retain the default linking behavior.
- Scene renames/renumbering preflight the whole batch and use `fileManager.renameFile`. Reconcile plugin-owned scene references against file identity even when automatic link updates are disabled; ordinary body links follow Obsidian's preference. Stop on failure and recover completed moves without overwriting concurrent edits. Remap stored encounter source paths once per completed batch.
- Session creation/edit unsaved-state comparison includes scene planning as well as other fields. When adding editable state, include it in the guard's snapshot so closing with unsaved changes is handled consistently.
- The run dashboard owns its quick-note updates and timer/display intervals, and tracks workspace leaves it manages. Clean up timers and restore only managed leaf state during teardown; avoid touching unrelated workspace leaves.
- Quick-note saves must capture the original file and draft, update only their section atomically, and finish outgoing edits before switching context. Reject stale loads and detached input callbacks; a failed save must retain a recoverable draft and must not report success. Dashboard opening awaits `setContext` before lifecycle/layout work.
- The hub may coordinate workflows across campaign/session views, but session lifecycle and note relationship rules should remain in their domain modules. Avoid adding combat behavior here.
- Session UI owns when and what to project; the [maps specialist](maps-projection.md) owns projection screen/view lifecycle. Keep that orchestration boundary explicit when changing session startup or handout controls.
- Template/schema changes that add persisted note fields still follow the migration and data-preservation rules in the shared guidance.

## Focused verification

Run only tests relevant to the change; these commands target existing tests:

```powershell
npm run test -- tests/session/sessionLifecycle.test.ts
npm run test -- tests/session/SessionBacklinks.test.ts
npm run test -- tests/session/quickNotes.test.ts
npm run test -- tests/session/SessionRunDashboardView.test.ts
npm run test -- tests/session/adventureScenes.test.ts tests/rendering/ViewRenderer.test.ts
npm run test -- tests/automation
npm run test -- tests/scene/SceneCreationModal.test.ts
npm run test -- tests/migration/session-lifecycle.test.ts
npm run test -- tests/migration/session-multiple-adventures.test.ts
npm run test -- tests/migration/session-scene-plan.test.ts
npm run test -- tests/utils/UnsavedChangesGuard.test.ts
npm run test -- tests/hub/campaignSearch.test.ts
```

For dashboard, relationship, or hub UI changes, manually exercise the affected flow in Obsidian with a legacy note and a current note where relevant. Inspect both sides of edited backlinks and verify dashboard close/teardown restores only managed leaves. Documentation-only changes do not require these checks.

## Handoff

Report changed files, focused commands and results, any manual relationship/dashboard checks, and remaining coordination needed with party data or projection. Leave shared `src/main.ts`, templates, migrations, and styles changes to the coordinator unless explicitly assigned.
