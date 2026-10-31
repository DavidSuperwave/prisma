# Hermes runtime audit (HERMES_HOME, SOUL.md, skills, MCP)

This document audits how Prisma synchronizes per-workspace state into the Hermes
runtime versus what upstream Hermes expects, based on the [Hermes Agent docs](https://hermes-agent.nousresearch.com/docs/).
It is the source of truth for the "chat-first Hermes UX" rollout: the Operadores
builder writes structured fields in Supabase, and those fields must be projected
into each workspace's Hermes home so the runtime sees them.

## TL;DR

| Concern | Hermes expects | Prisma writes today | Gap |
| --- | --- | --- | --- |
| Persona / SOUL.md | `$HERMES_HOME/SOUL.md` (system-prompt slot #1) | `workspace_agents.soul_md` only; chat route inlines it; no file is written. | High — runtime never sees SOUL.md, only the Next.js chat route does. |
| Skills directory | `$HERMES_HOME/skills/` and `external_dirs` registered in `config.yaml`; each skill is a directory containing `SKILL.md` (`agentskills.io` spec). | `lib/hermesHome.ts` mirrors built-in skills under `skills/external/prisma/<slug>/SKILL.md`, promoted local skills under `skills/external/prisma-promoted`, and registers the dirs in `config.yaml`. | Acceptable — directory layout matches. Promotion model is Prisma-specific but doesn't violate the spec. |
| Skill state metadata | Hermes does not require state files. | We persist `.prisma-state.json` next to skills to track disabled built-in / promoted local. | OK — non-conflicting. |
| MCP servers | `mcp_servers` block in `config.yaml`; can be filtered per agent. | `config.yaml` writes `mcp_servers: {}` and never updates it. Per-agent MCP scope lives in `workspace_agents.mcp_tools_include` but isn't projected. | High — runtime has no MCP servers configured even if a Prisma admin set them up via the UI. |
| Memory provider | Configurable via `memory.provider`. | We pin `provider: honcho` with the workspace id. | OK — matches a documented option. |
| Context files (AGENTS.md) | Documented as a separate, layered context file. | Not written. | Optional — out of scope until we want repo-style instructions per workspace. |
| Cron / automations | Hermes itself doesn't ship cron; we run it via the shim and Supabase. | `cron/` directory is created but only used as a placeholder; jobs live in `workspace_workflows`. | Acceptable — Prisma owns scheduling. |
| Env passthrough / secrets | Documented under Security; sensitive values should not be in `config.yaml`. | `.env` per workspace stores `PRISMA_WORKSPACE_*` only; agent API keys live in `workspace_integrations` (encrypted) and the agent's `channel_config.apiCredentials`. | OK. |

## Detailed findings

### 1. SOUL.md is never persisted to the workspace home

**Hermes:** The [Personality & SOUL.md](https://hermes-agent.nousresearch.com/docs/user-guide/features/personality)
page makes clear that `$HERMES_HOME/SOUL.md` is the agent's primary identity and
is loaded as the first slot in the system prompt by Hermes itself. It is not
read from the current working directory.

**Prisma today:** `workspace_agents.soul_md` is stored in Supabase. The chat
route (`app/api/chat/route.ts`) inlines that text into the model prompt for the
direct OpenRouter / OpenAI path. The shim (`services/hermes-shim/app/main.py`)
proxies the request without touching `SOUL.md`. `lib/hermesHome.ts` creates
`$HOME/skills/...`, a `.env`, and a `config.yaml`, but never writes any
`SOUL.md` file.

**Impact:** Any time we route through the Hermes shim/runtime path (e.g. once
per-workspace runtime sessions land), the agent will boot **without** its
persona, even though the Operadores builder UI claims to have saved it.

**Recommendation:**

1. In `ensureWorkspaceHermesHome`, also write `SOUL.md` from the agent row(s)
   we want to expose. Two viable shapes:
   - **Workspace-level:** concatenate the active workspace's `soul_md` rows with
     headings (`# Agent: <name>`) so a single Hermes session can context-switch.
   - **Per-agent:** create a sub-home keyed by `agent_id`. This matches the
     Hermes single-agent model better but requires the shim to address the
     correct home per chat call.
2. When the Operadores `builder-turn` updates `soul_md`, re-run the sync so the
   file is rewritten before the next request.

### 2. MCP server configuration is not projected into Hermes

**Hermes:** `mcp_servers` belongs in `config.yaml` and per-agent tool filters
should narrow what each agent can call ([MCP guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp)).

**Prisma today:** `lib/hermesHome.ts` writes `mcp_servers: {}` once and never
revisits it. Per-agent MCP allowlists live in `workspace_agents.mcp_tools_include`
and the dedicated `app/api/workspaces/[workspaceSlug]/agents/[agentId]/mcp-config/route.ts`
endpoint, but neither is reflected in `config.yaml`.

**Impact:** Even if an admin adds an MCP server through the lab UI, Hermes
won't see it.

**Recommendation:**

1. Extend `ensureWorkspaceHermesHome` (or add a `syncWorkspaceMcpServers`
   helper) to read `workspace_integrations` rows of `auth_type = 'mcp'` plus
   any agent-specific MCP config and rewrite the `mcp_servers` block on every
   sync.
2. Apply the per-agent `mcp_tools_include` allowlist when the shim routes a
   chat request — either by writing per-agent config files, or by sending the
   filter list with the upstream request.

### 3. SOUL.md edits are decoupled from runtime sessions

The chat route currently treats `soul_md` as inline system-prompt text. When we
fully migrate to the shim, we need a sync step that:

1. Persists `soul_md` updates to disk (see #1).
2. Tells the shim to invalidate any in-memory cached config so the next request
   reloads the file.

For now (single shared Hermes endpoint mode), this is invisible to operators,
but it will surface the moment we move per-workspace runtime sessions onto the
shim.

### 4. AGENTS.md / context files are not used per-workspace

[Context files](https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files)
are layered (workspace, project, repo) and explicitly distinct from SOUL.md.
We don't write any. Operadores currently conflates persona-level and
project-level instructions inside `soul_md`. If we want repo-style guidance
(e.g. CRM-specific rules that should not be in persona text), we should add an
explicit `AGENTS.md` writer to `ensureWorkspaceHermesHome` and surface it as a
separate field in the builder.

### 5. Skills layout is correct but undocumented

The directory tree we generate matches the Hermes [Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills):
`SKILL.md` per skill, registered via `external_dirs`. The `agentskills.io`
front-matter (`name`, `description`, `required_environment_variables`) is
present in our generated skills. Worth documenting in
`hermes-integrations-runbook.md` so contributors know the format is intentional
rather than ad hoc.

## Action items

These are the suggested follow-ups; none are required by the chat-first UX
plan but each closes a real gap exposed by the audit.

1. `lib/hermesHome.ts` → `writeSoulMdForWorkspace(workspaceId)` that picks the
   right SOUL.md content per agent (or per workspace) and writes
   `$HERMES_HOME/SOUL.md`. Call from `ensureWorkspaceHermesHome` and from the
   `builder-turn` route after a successful `soul_md` update.
2. `lib/hermesHome.ts` → `syncWorkspaceMcpServers(workspaceId)` that builds the
   `mcp_servers` block from Supabase and rewrites `config.yaml`.
3. Document the skills/`SKILL.md` contract in
   `docs/hermes-integrations-runbook.md` so the layout is normative.
4. Decide on per-agent vs workspace-shared SOUL.md once we move sessions onto
   the shim; whichever we pick, the shim should pass the correct home path with
   each request.
