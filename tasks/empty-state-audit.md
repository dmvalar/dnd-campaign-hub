# Empty State Audit

Phase 4.1 tracks places where the plugin can show little or no data. Empty states should explain what is missing and offer the next useful action.

## High Priority

- Campaign Home: mostly covered. Keep next-step cards as the model for other views.
- Party Manager: no parties and no members should offer direct create/add actions.
- Music Player: no playlists or sound effects should point to Music Settings instead of showing silent controls.
- Map Manager: no templates or active maps should offer create actions directly in the empty state.
- Encounter Builder: no creatures selected should point the user to search/import/manual entry.
- Session dashboards: no campaign, no adventure, no scenes, no party should route to Campaign Home/Create Content/Open Party where possible.

## Current Pass

- [x] Inventory the major empty states in runtime and creation workflows.
- [x] Improve Party Manager no-party state.
- [x] Improve Map Manager no-map/no-template states.
- [x] Improve Music Player no-audio setup state.
- [x] Improve Encounter Builder no-creature state.
- [x] Continue session dashboard empty-state pass in the next Phase 4.1 step.

## Wording Pattern

- State what is missing in one short sentence.
- Add one sentence about why it matters.
- Provide one primary action and, when useful, one secondary action.
