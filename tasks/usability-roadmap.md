# Usability Roadmap - D&D Campaign Hub

This is the working todo list for making the plugin easier to understand, onboard into, and use during real sessions. Keep this file updated as phases move from planning to implementation.

## Guiding Principles

- New users should always have an obvious next action.
- Existing power-user workflows should keep working.
- Advanced options should be available, but not required to complete common tasks.
- The plugin should organize itself around GM workflows, not around implementation subsystems.
- Each phase should be releasable on its own.

## Current Status

- [x] Initial usability roadmap created
- [x] Phase 1 scoped into implementation tickets
- [x] First implementation branch started
- [x] Phases 1-4 implemented and validated
- [x] Phase 5 documentation rewrite implemented
- [x] README and settings/reference docs updated to match the current workflow UI
- [x] Screenshot assets added for final documentation polish

Last validation:
- `npm run check` passed
- `npm run test` passed with 84 tests
- `npm run build` passed
- Built plugin bundle deployed to the Obsidian test vault

## Phase 1 - Orientation and Entry Points

Goal: give the plugin a clear center of gravity and reduce the "what do I do first?" problem.

### 1.1 Campaign Home Dashboard

- [x] Create a dedicated Campaign Home view
- [x] Add command: `D&D Hub: Open Campaign Home`
- [x] Show current campaign, active/next session, party summary, recent scenes, recent maps, and music status
- [x] Add primary action buttons: New Session, Continue Last Session, Add Scene, Build Encounter, Open Party, Open Music, Open Map Manager
- [x] Add empty states with direct actions when campaign/session/party/map/audio data is missing
- [x] Add docs page or update `docs/getting-started.md`

Acceptance criteria:
- A new user can open one command and see the most important next actions.
- Empty vault/plugin states explain what is missing and provide a button to fix it.
- Existing dashboards and commands remain available.

### 1.2 High-Level Command Palette Entries

- [x] Add `D&D Hub: Start Session`
- [x] Add `D&D Hub: Prepare Next Session`
- [x] Add `D&D Hub: Create Content`
- [x] Add `D&D Hub: Open GM Tools`
- [x] Audit existing command names for clarity and grouping

Acceptance criteria:
- Common workflows are discoverable without knowing subsystem names.
- Legacy/specific commands remain usable.

### 1.3 First-Run Setup Wizard

- [x] Provide explicit setup wizard command without auto-opening on startup
- [x] Create wizard modal with steps for campaign folder, audio folder, map/token folders, and optional systems
- [x] Offer starter content creation: campaign note, first session note, party folder
- [x] Store setup completion state in settings
- [x] Add setup wizard command: `D&D Hub: Open Setup Wizard`

Acceptance criteria:
- A new install can reach a usable campaign structure without opening settings manually.
- Users can skip optional systems and revisit setup later.

## Phase 2 - Unified Creation Workflows

Goal: reduce command sprawl and make content creation feel consistent.

### 2.1 Unified Create Modal

- [x] Create `Create Content` modal
- [x] Group creation targets by workflow: Session, Scene, Character, Encounter, Map, World Content, Reference
- [x] Route each selection to the existing specialized modal
- [x] Add contextual descriptions and "recommended next" actions after creation
- [x] Add command: `D&D Hub: Create Content`

Acceptance criteria:
- Users can create any common entity from one entry point.
- Existing individual creation commands still work.

### 2.2 Simple/Advanced Form Pattern

- [x] Identify the first 2-3 high-impact modals: Scene, Session, Encounter, NPC
- [x] Add collapsible advanced sections where forms are currently dense
- [x] Keep required fields visually minimal
- [x] Add defaults for optional metadata where safe
- [x] Document a reusable pattern for future modals

Acceptance criteria:
- A basic Scene or Session can be created with only a small number of obvious choices.
- Advanced fields remain accessible and do not lose existing functionality.

### 2.3 Creation Success Next Steps

- [x] After creating a Session, offer Open Session, Add Scene, or Start Session
- [x] After creating a Scene, offer Link Map, Link Music, Add Encounter, or Open Scene
- [x] After creating an Encounter, offer Link to Scene, Load in Combat Tracker, or Create Map
- [x] After creating a Map, offer Link Encounter, Open GM Map, or Project Player Map

Acceptance criteria:
- Creation flows lead naturally to the next workflow instead of ending at a notice.

## Phase 3 - Runtime Workflow Polish

Goal: make live session usage feel like one coherent control surface.

### 3.1 Session Run Dashboard as Live Control Surface

- [x] Audit `SessionRunDashboardView` for current capabilities and gaps
- [x] Show current scene with quick navigation to next/previous scenes
- [x] Show linked map, encounter, music, SFX, handouts, and party state in one place
- [x] Add quick actions for Start Scene, Play Scene Music, Start Encounter, Project Handout
- [x] Add "missing link" prompts when a scene lacks map/music/encounter/handout/party data

Acceptance criteria:
- During play, the GM can run the core session loop mostly from the Session Run Dashboard.

### 3.2 Smart Note Action Bars

- [x] Review existing `dnd-hub` action buttons by entity type
- [x] Add workflow-specific actions to campaign, session, scene, adventure, and encounter notes
- [x] Keep map and handout controls out of generic note action bars until dedicated inline/projection controls exist
- [x] Ensure action bars expose "what can I do with this note?" clearly
- [x] Keep action rendering runtime-based so old notes do not require migration for button-only changes

Acceptance criteria:
- Opening a generated note makes the available actions obvious.

### 3.3 Inline Smart Controls

- [x] Inline sound effect widgets
- [x] Inline scene music control
- [x] Inline encounter start control
- [x] Inline handout projection control
- [x] Inline map open control; projection remains explicit inside the opened GM map view
- [x] Decide shared syntax and renderer pattern for inline controls

Acceptance criteria:
- GMs can embed small controls naturally inside session notes without using large code blocks.

## Phase 4 - Progressive Disclosure and Empty States

Goal: teach the plugin through the UI itself.

### 4.1 Empty State Audit

- [x] List all views/modals that can show no data
- [x] Add action-oriented empty states to Campaign Home, Party Manager, Music Player, Map Manager, Encounter Builder, Session dashboards
- [x] Use consistent wording and button patterns

Acceptance criteria:
- Empty states explain the situation and provide at least one useful next action.

### 4.2 Template Clarity

- [x] Review generated templates for visible clutter
- [x] Move machine-oriented complexity into frontmatter or runtime-rendered action blocks where possible
- [x] Keep note bodies readable for humans
- [x] Avoid migrations for action-only improvements

Acceptance criteria:
- New notes are less intimidating and more readable immediately after creation.

### 4.3 Settings Simplification

- [x] Group settings by workflow rather than subsystem where practical
- [x] Add "Setup" section for core folders and feature toggles
- [x] Add reset/re-run wizard controls
- [x] Improve descriptions for audio, projection, maps, and migration settings
- [x] Update `docs/settings-and-reference.md` to match the new settings layout

Acceptance criteria:
- Users can configure common paths and features without understanding every subsystem.

## Phase 5 - Documentation and Onboarding

Goal: support the improved UI with concise docs that match actual workflows.

### 5.1 Quickstart Rewrite

- [x] Update `docs/getting-started.md` around workflows: setup, prepare, run, review
- [x] Add screenshots once Campaign Home and setup wizard exist
- [x] Add "first 15 minutes" guide
- [x] Update README quick start to use Setup Wizard, Campaign Home, Create Content, and Start Session

Acceptance criteria:
- A new user can follow one page and run a minimal session.

### 5.2 Workflow Guides

- [x] Add "Prepare a Session" guide
- [x] Add "Run a Session" guide
- [x] Add "Build a Scene with Map, Encounter, and Music" guide
- [x] Add "Recover/continue from last session" guide
- [x] Link workflow guides from README and `docs/getting-started.md`
- [x] Refresh campaign/session docs to prefer Campaign Home and high-level workflow commands

Acceptance criteria:
- Docs mirror the high-level commands and dashboards.

## Implementation Order Completed

1. [x] Campaign Home Dashboard skeleton
2. [x] High-level command entries
3. [x] Unified Create modal
4. [x] First-run setup wizard
5. [x] Session Run Dashboard workflow polish
6. [x] Note action bar improvements
7. [x] Empty state audit
8. [x] Template clarity pass
9. [x] Settings simplification
10. [x] Documentation refresh

## Resume Notes

- Usability roadmap is complete. Future work should come from new user feedback or manual smoke-test findings.
- Prefer Campaign Home as the active-campaign source for new workflow work.
- Do not remove existing legacy commands until replacement workflows have shipped and been tested.
- Keep command IDs stable where possible; new command IDs should use workflow names.
- Validate each implementation with `npm run check`, `npm run test`, and `npm run build`.
