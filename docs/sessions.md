# Sessions

Session notes track what happens at each game table meeting. D&D Campaign Hub auto-numbers sessions, links them to adventures and scenes, and provides two sidebar dashboards for preparation and live play.

## Create a session

1. Open **D&D Hub: Open Campaign Home**, select the active campaign, and choose **New Session**. You can also run **Create New Session** directly from the Command Palette.
2. Fill in the fields:
   - **Session Number** — auto-incremented based on existing sessions (read-only).
   - **Session Title** — for example, "The Goblin Ambush".
   - **Adventure** — select an adventure from the dropdown, or choose **None**.
   - **Starting Scene** — auto-populated from the selected adventure. Scenes that are in progress appear first, followed by scenes that have not started. Each entry shows its status label.
   - **Session Date** — the real-world date. Toggle the custom date option to enter a different date.
   - **In-Game Calendar** — when a Calendarium calendar is linked, the start date is auto-filled from the previous session's end date. Select **Pick End Date** to open the calendar date picker.
   - **Location** — where the session takes place in the game world.
3. Select **Create Session**.

After creation, the plugin optionally prompts you to update scene statuses — marking prior scenes as completed and the starting scene as in progress.

## End a session

1. Open an active session note.
2. Run **End Session Here** from the Command Palette.
3. Select the ending scene from the adventure.
4. The plugin records the ending scene in the session frontmatter and optionally updates scene statuses.

## Session Prep Dashboard

The Session Prep Dashboard is a sidebar panel for pre-session planning.

### Open the dashboard

Run **D&D Hub: Prepare Next Session** from the Command Palette. The panel opens in the left sidebar.

### Sections

- **Adventure Progress** — shows adventure cards with status badges, progress bars (scenes completed out of total), the next upcoming scene with its duration, type, and difficulty, and a list of remaining scenes.
- **Readiness Score** — a 0–100 readiness indicator based on five criteria:
  - Active adventure selected (30 pts)
  - Party members exist (25 pts)
  - Session notes prepared (20 pts)
  - NPCs available (10 pts)
  - Next scene has a goal (15 pts)
  Each item shows a check or cross with a hint. Incomplete items include an action button (e.g. **Create Adventure**, **Manage Parties**, **Create Session**, **Add NPCs**) that opens the relevant creation modal.
- **Quick Actions** — creation buttons for sessions, scenes, encounters, adventures, NPCs, PCs, creatures, factions, items, spells, and traps.
- **Party Overview** — PC cards with name, HP bars (color-coded green, orange, or red based on health percentage), and AC.
- **Recent NPCs** — the eight most recently modified NPCs as clickable links.
- **Last Session** — a link to the previous session with a summary excerpt.

The dashboard auto-refreshes every 30 seconds and when the Obsidian window regains focus. While the dashboard is active, open notes are switched to editing (source) mode for quick prep work.

## Session Run Dashboard

The Session Run Dashboard is a sidebar panel for live play.

### Open the dashboard

Run **D&D Hub: Start Session** from the Command Palette.

### Sections

- **Current Scene** — navigate prepared scenes and open linked maps, encounters, music, sound effects, handouts, and party context.
- **Missing Link Prompts** — add useful links when a scene is missing maps, encounters, music, handouts, or party data.
- **Timers** — create named timers for tracking combat rounds, rest periods, or any timed event. Each timer shows hours, minutes, and seconds with resume, pause, and remove controls.
- **Dice Roller** — buttons for d4, d6, d8, d10, d12, d20, and d100. Results appear in a history list of the last ten rolls.
- **Scene Music and SFX** — play linked scene music and trigger sound effects through the music player.
- **Encounter and Map Controls** — start linked encounters and open linked GM maps.
- **Handouts** — open projection controls for linked handouts.
- **Quick Notes** — a text area that auto-saves every 30 seconds to the session note's "Quick Notes" section. Select **Save Now** to save immediately.
- **SRD Quick Search** — search across imported SRD data (spells, equipment, classes). Results appear as cards with a type badge, name, and preview text. Select a result to open it in a new tab.

## Session Projection

The session projection system manages persistent player-facing screens across multiple displays, automatically transitioning between idle, map, and combat states.

### Set up projection

1. Run **Session Projection** from the Command Palette to open the GM setup modal.
2. Configure each screen:
   - **Idle content** — choose solid black, a custom color, a static image, or a looping video. Use the media picker to browse vault images and videos with thumbnail previews.
   - **Mode** — "battle" for auto-calibrated grid alignment or "free" for manual pan and zoom.
3. Optionally save the configuration as a **projection profile** for quick loading in future sessions.
4. Select **Start** or run **Start Projection Session** from the Command Palette.

During a session, the plugin automatically switches projected screens between the idle content, the active battle map, and the combat tracker player view as needed.

### Commands

| Command | Description |
| --- | --- |
| Session Projection | Open the projection setup modal |
| Start Projection Session | Launch all configured screens |
| Stop Projection Session | Close all managed projection screens |
