# Simple / Advanced Form Pattern

Use this pattern for creation and edit modals that are powerful but visually dense.

## First Targets

- Session creation: keep campaign, session number, title, adventure, and starting scene visible. Put dates, location, and party metadata behind Advanced session details.
- Scene creation: keep adventure, scene name, and scene type visible. Put act, scene number, duration, and difficulty behind Advanced scene details.
- NPC creation: keep name, campaign, motivation, and pursuit visible. Put character detail, token appearance, and combat stats behind collapsible sections.

## Pattern

- Put required fields and the most common decision in the main flow.
- Use `details.dnd-advanced-section` for optional metadata, generated defaults, or fields that mostly matter after the first draft.
- Open advanced sections automatically while editing existing notes so hidden fields do not feel lost.
- Keep defaults unchanged unless the current modal already derives a safer contextual default.
- Do not remove advanced fields; progressive disclosure is a layout change, not a feature cut.

## Next Candidates

- Encounter Builder: separate encounter basics from XP tuning, party overrides, and color/name options.
- Map creation: separate image/template choice from calibration and projection-related options.
