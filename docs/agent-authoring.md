# Agent content authoring

Available from v0.15.0-beta.4.

Agents can create plugin-native monsters, NPCs, adventures, scenes, encounters, maps, and sessions without opening creation forms. All transports call the same versioned API inside Obsidian. No AI subscription or model is built into the plugin; use your existing agents.

## Setup

1. Install v0.15.0-beta.4 or a newer build and reload Obsidian.
2. In **D&D Campaign Hub → Setup**, enable **Agent content requests**. Keep the target vault open.
3. Choose file requests, the CLI, or the local MCP bridge below.

The plugin creates `.dnd-hub/agent/README.md` with instructions you can give to content agents. This is separate from the repository's developer `AGENTS.md`. Existing copies of the vault guide are preserved.

The command **D&D Campaign Hub: Process agent content requests** processes queued requests on demand without enabling automatic polling. Automatic polling checks every five seconds. It does not open notes or interrupt the DM with creation forms.

## Connection options

### Any agent with vault file access

Write a complete UTF-8 request to `.dnd-hub/agent/requests/<requestId>.json`; read the reply from `.dnd-hub/agent/results/<requestId>.json`. Publish complete files using a temporary file and rename, and never modify a published request. The request ID must match the filename, use letters/digits/hyphens/underscores, start with a letter or digit, and be at most 100 characters.

Start by asking the agent to read `.dnd-hub/agent/README.md`. It can request schemas and discover paths through the same file interface.

### CLI

Clone this repository and run `npm ci` with Node.js 18 or newer. From its root:

```powershell
node tools/dnd-hub-agent.mjs --vault "C:/path/to/TTRPG Vault" --request "examples/agent-authoring/adventure-batch.json"
```

Edit the example's campaign and image paths before sending it. The example is a preview. For creation, choose a fresh request ID and set `dryRun` to `false`.

### MCP

After `npm ci`, add a **local stdio MCP server** in your agent client's configuration. Use its configuration format with this command and arguments:

```json
{
  "command": "node",
  "args": [
    "C:/path/to/dnd-campaign-hub/tools/dnd-hub-agent.mjs",
    "--vault",
    "C:/path/to/TTRPG Vault"
  ]
}
```

Use absolute paths. This bridge uses the official MCP SDK and exchanges requests through the vault; it does not open a network port. The local filesystem must support hard links for the bridge's exclusive request-file publishing. Direct file requests remain available independently.

Six MCP tools keep automatic tool discovery small:

| Tool | Purpose |
| --- | --- |
| `dnd_hub_describe` | List capabilities, or fetch one operation's exact input schema with `operation`. |
| `dnd_hub_list_campaigns` | Find existing campaign folders. |
| `dnd_hub_search` | Find existing content by name/path and optional entity type. |
| `dnd_hub_read_note` | Read a campaign or shared bestiary note. |
| `dnd_hub_list_assets` | Find existing vault image paths. |
| `dnd_hub_create_batch` | Preview or create linked content in one batch. |

Fetch only the schemas needed for the task. The bridge generates request IDs when omitted, but supplying an explicit ID makes interrupted calls easier to identify. A timeout stops waiting; it does not cancel the queued request.

## Authoring operations

The source of the machine-readable input schemas is [schemas.json](../src/automation/schemas.json). Runtime validation also checks relationships, collisions, images, party membership and statblock values.

| Operation | Required input | Result and behavior |
| --- | --- | --- |
| `create_monster` | `name`, `statblock`, `token.imagePath` | Creates `z_Beastiarity/<name>.md`, complete statblock data, a readable Markdown summary, an inline statblock, and a reusable image-backed creature token. Returns `notePath`, `tokenId`. |
| `create_npc` | `name` | Uses the NPC template and registers a token. Story fields, image appearance and the same full `statblock` schema are optional. Returns `notePath`, `tokenId`. |
| `create_adventure` | `name` | Creates the canonical adventure folder note. Accepts problem, level range, expected sessions and descriptive Markdown. |
| `create_scene` | `name`, `adventurePath`, `sceneNumber` | Uses canonical adventure membership and scene layout. Accepts goal, description, act/type/duration/difficulty, `npcPaths` and `mapPaths`. Maps render as native `dnd-map` blocks. |
| `create_encounter` | `name`, `creatures` | Uses linked monster/NPC statblocks and the plugin's difficulty calculation. Supports count, fixed initiative including zero, current/temp HP, friendly/hidden state, selected party, and an optional scene link. Registers the stored encounter. |
| `create_map` | `name`, `imagePath` | Creates a native annotation record and map note. Accepts grid, scale and paired image width/height. Starts with blank annotations. Returns `notePath`, `mapId`. |
| `create_session` | No fields required inside `input` | Creates the next planned session in the explicit campaign. Supports date/title/number, linked adventures, planned scenes, starting scene, party, location and prep text; updates relevant backlinks. |

Every batch requires an existing, indexed campaign folder in `campaignPath`. Campaign content uses its existing `World.md`; campaign creation is outside this API version. The bestiary is shared, matching the existing plugin convention, including the historical folder spelling `z_Beastiarity`.

Monster statblocks require size, creature type, AC, HP, speed, six ability scores in STR/DEX/CON/INT/WIS/CHA order, and CR. They also support saves, skills, hit dice, senses, languages, vulnerabilities/resistances/immunities, traits, actions, bonus actions, reactions and legendary actions. Omit optional fields instead of supplying empty strings. Text is safely serialized as YAML, including quotes and multiline descriptions.

Token images must already exist as indexed raster files in the vault. Agents can generate/download artwork separately and put it into the vault first, then discover it using `list_assets`. The creation API does not generate images, download URLs or read arbitrary external files. Token sizing, image fit, colors and senses use the normal marker library. Fantasy Statblocks is optional: its supported registration is used when available, while existing same-name entries are preserved with a warning. The note also embeds its full statblock.

Maps accept existing raster images. Supply both `width` and `height` when automatic media dimensions are unavailable. This version creates blank maps; automatic wall drawing, fog editing and token placement are not exposed by the batch API.

## Batch references and preview

```json
{
  "schemaVersion": 1,
  "requestId": "keep-preview-001",
  "campaignPath": "ttrpgs/My Campaign",
  "dryRun": true,
  "operations": [
    {
      "id": "adventure",
      "type": "create_adventure",
      "input": { "name": "The Keep", "problem": "A missing patrol" }
    },
    {
      "id": "scene",
      "type": "create_scene",
      "input": {
        "name": "The Gate",
        "adventurePath": { "$ref": "adventure.notePath" },
        "sceneNumber": 1
      }
    }
  ]
}
```

References identify a preceding operation's result field. Full relationship paths include `.md` and are passed without wikilink wrappers; the plugin generates its own links. Put dependencies first: monster/NPC and adventure/map, then scene, encounter and session. Preview IDs are provisional; use references instead of copying IDs out of a preview.

`dryRun` validates the whole batch without creating content, registering tokens, changing backlinks, or saving maps/encounters. File/MCP transports still write request/result records. After validation, submit the intended creation batch using `dryRun: false` and a fresh request ID under the user's existing authorization.

Requests support at most 100 operations and 2 MiB. Unknown fields, invalid paths, missing images, invalid statblocks, cross-campaign relationships, duplicate scene/session numbers and occupied note destinations are rejected. No active-campaign fallback is used. An encounter's party is included only when explicitly requested; disabled and absent PCs remain excluded.

## Results, retries and failures

- `preview`: inspect `results`, planned `files`, and `warnings`.
- `completed`: `results.<operationId>` contains actual paths/IDs.
- `failed`: inspect `error`. The plugin attempts rollback of its new notes, tokens, annotations, stored encounters and relationship edits.
- `interrupted`: completion could not be confirmed after a crash or receipt failure. Inspect `files` and `plannedResults` before creating replacement content.

Creation batches share one mutation queue. Entire batches are validated before content is written. Existing relationship updates compare the latest note bytes before writing; concurrent edits are preserved. Authored YAML comments, BOM/line endings and body content survive backlink/encounter-link updates. Rollback removes only unchanged content owned by the request. Nonempty `recoveryErrors` identifies content that needs inspection rather than silently overwriting DM changes.

Completed request IDs replay their stored outcomes, including after reload. Reusing an ID with different content is rejected. Corrected requests use a new ID. Crash-interrupted requests are deliberately not replayed automatically: file and third-party plugin storage cannot form one crash-atomic transaction. New notes carry `dnd_hub_authoring` metadata for recovery.

Keep receipts in `.dnd-hub/agent/receipts` while relying on replay protection. Removing a receipt removes its retry history. Old completed request/result files may be archived together once agents no longer need their acknowledgements. This API version is create-only; arbitrary edits, renames, deletions and bulk repair of existing agent-written notes are separate work.

## In-process API

Other code running inside Obsidian can access the loaded plugin's `agentContentApi`:

```javascript
const hub = app.plugins.getPlugin("dnd-campaign-hub");
const result = await hub.agentContentApi.execute(request);
```

This uses the same schemas, queue, preview, receipts and services as file/MCP creation. It does not automate modal elements. `describe`, `listCampaigns`, `search` and `read` are available for discovery. The instruction guides and templates remain the compatibility source; API schema version 1 is separate from the plugin release version.

## Verification

```powershell
npm run check
npm run test -- tests/automation
npm run test
npm run build
```

Automated tests cover a full linked batch, launch in the real tracker, image-token registration, native map persistence, preview/no-write behavior, reload-safe replay, actual stdio MCP negotiation/calls, malformed requests, failed/partial writes, external/concurrent edits and conditional recovery. Visual statblock/token/map rendering and real-vault use still need Obsidian acceptance testing before release.
