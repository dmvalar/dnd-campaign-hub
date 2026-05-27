# Session Run Dashboard Audit

Phase 3.1 goal: make the run dashboard the GM's live control surface during play.

## Current Capabilities

- Shows current campaign and latest session note.
- Can configure the multi-pane session layout.
- Provides read-only/editable mode toggle.
- Includes timers, dice, quick notes, SRD quick search, projection hub, combat tracker, encounter creation, and session note access.
- Detects open scene music blocks and can load/play them.

## First Improvements Implemented

- Added a Live Scene card near the top of the run dashboard.
- Resolves the current runnable scene from the active campaign's active/planning adventure.
- Shows previous/current/next scene navigation.
- Shows map, music, and encounter link status.
- Provides direct actions for Start Scene, Play/Link Music, Open/Link Map, Start/Add Encounter, and Complete.
- Shows missing-link prompts when the current scene lacks map, music, or encounter data.

## Remaining Gaps

- Handout and SFX links are not yet summarized in the Live Scene card.
- Party state is still visible through Party Manager and Combat Tracker, not directly in the run dashboard.
- Start Encounter opens the linked encounter and combat tracker, but does not yet fully hydrate combat from scene frontmatter.
- Project Handout and Project Linked Map should become one-click actions once the shared inline/control syntax is settled.
