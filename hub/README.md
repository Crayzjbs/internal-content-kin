# KIN Hub

A local dashboard for running the KIN AI production team across several YouTube channels. It's a personal tool: it runs on your PC at `http://127.0.0.1:3100` and has no login.

The hub reads and writes the same markdown files as Claude Code (`CLAUDE.md`, `bible/`, `episodes/`, `feedback/`, and so on), so you can switch between the two whenever you like.

## Start it

```powershell
cd hub
npm install
copy .env.example .env.local   # then put your ANTHROPIC_API_KEY in .env.local
npm run dev
```

Open http://127.0.0.1:3100.

- `npm run dev:mock` runs every agent as a scripted mock. There are no API calls and no cost, which is useful for trying the UI.
- Node 20.17 or newer. Tailwind is pinned to 4.1 because 4.3 needs Node 20.19+.

## What's in it

| Page | What it does |
|---|---|
| Overview | What's waiting for your review, episodes in progress, recent runs, and 30-day spend. |
| Episodes | Create an episode, then move it through the pipeline. Each stage has **Run**, **Approve**, **Request changes** (with an optional "save as rule" to the agent's feedback log), **Skip** and **Reopen**. |
| Agents | One page per agent: purpose, capabilities, inputs, outputs and its place in the pipeline. A chat console streams the reply, the tool activity and the files it changed. Threads can be continued. |
| Files | Browse and edit the channel's markdown files (bible, briefs, logs and so on). |
| Runs | Every agent run, with tokens and estimated cost. |
| Settings | API key status, channels (create new ones), the agents in use and the pipeline. |

## How agents run

- **Prompt:** the agent's `.claude/agents/<name>.md` body, plus a short "hub environment" note and the channel's `CLAUDE.md`.
- **Model:** frontmatter `model: opus` becomes `claude-opus-5-5`, `sonnet` becomes `claude-sonnet-5-5`.
  - Thinking is adaptive, and effort comes from `agents.json` (default `high`).
  - Server-side refusal fallbacks are on (`fallbacks: "default"`).
- **Tools:** the agent's frontmatter `tools` decide what it gets.
  - `Read`, `Write`, `Edit`, `Glob` and `Grep` work only inside the channel folder. Agents can't touch `.git`, `.env*`, `hub/`, other channels, or `.claude/` (writes).
  - `WebSearch` and `WebFetch` become the Claude API web search and fetch tools.
- **Limits:** each run stops after `HUB_MAX_TURNS` tool turns (default 40). You can stop any run from the console.
- **Storage:** transcripts are saved to `.hub/runs/<channel>/` (gitignored). Deliverables are normal files in the channel folder.
- **Approvals:** nothing is ever posted or published. Stages wait for your approval.

## Extending it

| To add | Do this |
|---|---|
| An agent | Add `.claude/agents/<name>.md` (same format as the others). Optionally describe it in `agents.json` (label, purpose, capabilities, inputs, outputs, quick actions, effort). |
| A channel | Settings, then New channel. It creates `channels/<slug>/` with its own `CLAUDE.md`, bible, brand, feedback logs and folders, and registers it in `channels.json`. |
| A channel-specific agent | On the agent's page in that channel, click "Customize for this channel". It copies the agent to `channels/<slug>/.claude/agents/`. |
| A pipeline step | Edit `pipeline.json` (stages: `id`, `label`, `agent` or `"human"`, `outputs`, `prompt`, `optional`, `freshThread`). A channel can have its own `pipeline.json`. |

## Code map

- `lib/channels.ts`: channel registry and new-channel scaffolding
- `lib/agents/registry.ts`: loads agents from `.claude/agents/` and `agents.json`
- `lib/agents/runner.ts`: agent loop (streaming, tools, stop, cost), live event buffer
- `lib/agents/tools.ts`: sandboxed file tools; `lib/sandbox.ts` holds the path rules
- `lib/agents/mock.ts`: scripted mock runs
- `lib/pipeline.ts`, `lib/stage-actions.ts`: episodes and stage transitions
- `app/c/[channel]/…`: pages; `app/api/…`: JSON and SSE endpoints
