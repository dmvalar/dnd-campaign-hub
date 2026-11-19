export const VAULT_AGENT_GUIDE = `# D&D Campaign Hub: content-agent instructions

Use the plugin's authoring API to create compatible content. Do not write marker,
map-annotation, party or third-party plugin JSON yourself.

Obsidian must be open, D&D Campaign Hub loaded, and Agent content requests enabled
in the plugin settings. Alternatively the DM can run Process agent content requests.

Write complete UTF-8 JSON requests to:
.dnd-hub/agent/requests/<requestId>.json

Read acknowledgements from:
.dnd-hub/agent/results/<requestId>.json

Use a new requestId containing letters/digits/hyphens/underscores for each new
request. The JSON requestId must match its filename. Write a temporary file first,
then publish the complete JSON file. Do not modify a published request.

Discover the existing campaigns:
{"schemaVersion":1,"requestId":"find-campaigns-001","action":"list_campaigns"}

Find existing token/map images:
{"schemaVersion":1,"requestId":"find-images-001","action":"list_assets","query":"goblin"}

Get exactly one operation's input schema before creating content:
{"schemaVersion":1,"requestId":"monster-schema-001","action":"describe","operation":"create_monster"}

Supported operations: create_monster, create_npc, create_adventure, create_scene,
create_encounter, create_map, create_session. Monsters require a complete structured
statblock and token.imagePath pointing to an existing vault image. NPCs optionally
accept that same statblock schema and an image token. Artwork generation or copying
images into the vault is a separate step. URLs and arbitrary local paths are rejected.

Batch format:
{"schemaVersion":1,"requestId":"my-batch-preview-001","campaignPath":"ttrpgs/My Campaign","dryRun":true,"operations":[{"id":"adventure","type":"create_adventure","input":{"name":"The Haunted Keep","problem":"A missing patrol"}},{"id":"scene","type":"create_scene","input":{"name":"The Gate","adventurePath":{"$ref":"adventure.notePath"},"sceneNumber":1}}]}

Use explicit full vault-relative .md paths, not wikilink strings, for relationships.
Use {"$ref":"previousOperationId.notePath"} for notes created earlier in the same
batch. References cannot point forward. Other returned IDs such as mapId/tokenId
are available through the same syntax. Preview IDs are provisional.

Preview to validate, then submit the intended batch with dryRun false and a fresh
requestId under the user's original authorization. Only content is simulated:
file/MCP transports still create request/result records. A batch is limited to 100
operations and 2 MiB. Existing notes are never replaced by create requests. Scope
relationships to the explicit campaign and adventure. Duplicate scene/session
numbers are rejected, never silently renumbered.

On completed, use results.<operationId>.notePath, tokenId and mapId. Inspect warnings.
Reusing the identical committed requestId replays its stored outcome without
duplicating content. Corrected requests need a fresh requestId.

On failed, inspect error and recoveryErrors. The plugin attempts conditional rollback,
preserving concurrent DM changes. On interrupted or nonempty recoveryErrors, inspect
files and plannedResults before creating replacement content. Never assume a timeout
means the request was canceled. New notes have dnd_hub_authoring metadata identifying
their request and operation. Crash recovery deliberately blocks automatic replay.

MCP/CLI bridge, source setup and full examples:
https://github.com/dmvalar/dnd-campaign-hub/blob/dev/docs/agent-authoring.md
`;
