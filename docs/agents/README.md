# Specialist agents

Three specialists share the repository rules in [AGENTS.md](../../AGENTS.md) and [CONTRIBUTING.md](../../CONTRIBUTING.md). Domain knowledge lives in the guides below; tool-specific agent files only route to those guides.

| Domain guide | Codex role | Claude / GitHub agent |
| --- | --- | --- |
| [Maps & Projection](maps-projection.md) | `maps_projection` | `maps-projection` |
| [Sessions & Campaigns](sessions-campaigns.md) | `sessions_campaigns` | `sessions-campaigns` |
| [Encounters & Combat](encounters-combat.md) | `encounters_combat` | `encounters-combat` |

## Use and coordination

- For a contained task, use the matching specialist or read its guide in the primary agent. A small edit does not require spawning another agent.
- For a change spanning domains, the primary agent coordinates. Delegate only when the user or applicable instructions authorize it. Agree on exclusive write scopes before parallel work; file ownership is a coordination convention, not a permission mechanism.
- The primary agent handles shared integration points such as `src/main.ts`, `src/styles.css`, templates/migrations, settings, and cross-system APIs. A specialist may edit these when the assignment explicitly includes them and prevents conflicting edits.
- Keep commits, merges into `dev`, deployment, and releases with the coordinating agent unless the assignment delegates those actions within the user's authorization.
- Start bounded documentation, investigation, or simple test work with a lower-cost model available in the host. Use a capable coding model for rendering, persistence, asynchronous lifecycle, and other complex changes; escalate when evidence shows the task needs it. Review high-impact changes independently before integration.
- Agent files inherit the host's model selection; no provider-specific model, permission, concurrency, or global configuration is forced by this setup.

## Tool entry points

- **Local Codex:** standalone role files in [`.codex/agents/`](../../.codex/agents/), using the documented `name`, `description`, and `developer_instructions` fields. Example request: “Use `maps_projection` to investigate the player-view drag regression.” See the official [custom-agent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents).
- **Claude:** thin agent definitions in [`.claude/agents/`](../../.claude/agents/), alongside the existing `campaign-hub` coordinator.
- **GitHub/editor agents:** thin definitions in [`.github/agents/`](../../.github/agents/), alongside the existing general campaign-hub agent.
- **Other clients or clients without custom-role discovery:** follow the root `AGENTS.md` routing table and read the same shared guide. These files do not change the capabilities exposed by a running session.

## Content-agent integration

The coordinator owns `src/automation` contracts, transaction/receipt handling, transport lifecycle, `main.ts` integration and the MCP/CLI bridge in `tools/dnd-hub-agent.mjs`. Domain specialists own their authoring planners by explicit assignment. Read [the authoring guide](../agent-authoring.md) before extending the versioned API. Input changes must update runtime validation, `src/automation/schemas.json`, tests and examples together. Plans stage writes/effects; they must not mutate plugin state during validation or preview. The transaction overlay is the source for links to preceding batch operations.

## Verification and maintenance

For instruction/configuration changes, check TOML/YAML syntax, role names, guide links, and all referenced source/test paths. Review realistic routing and boundary scenarios. Runtime code changes follow the repository validation workflow; manual display/performance checks remain manual and should be reported accurately.

Update a domain guide when a real invariant, public interface, or relevant regression changes. Add further domains (content/migrations, audio, exploration) when recurring work warrants them.
