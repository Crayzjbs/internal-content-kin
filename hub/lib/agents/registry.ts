import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { REPO_ROOT, readJson, readText, writeFileAtomic, exists } from "../fsutil";
import { Channel, channelRoot, isRootChannel } from "../channels";

export type QuickAction = { label: string; prompt: string };

export type AgentMeta = {
  label?: string;
  role?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  purpose?: string;
  capabilities?: string[];
  inputs?: string[];
  outputs?: string[];
  quickActions?: QuickAction[];
};

export type Agent = {
  name: string;
  label: string;
  description: string;
  tools: string[];
  modelAlias: string;
  model: string;
  effort: NonNullable<AgentMeta["effort"]>;
  prompt: string;
  meta: AgentMeta;
  /** "base" = repo .claude/agents, "channel" = channel override. */
  source: "base" | "channel";
  file: string;
};

const BASE_DIR = path.join(REPO_ROOT, ".claude", "agents");

const MODEL_MAP: Record<string, string> = {
  opus: "claude-opus-5-5",
  sonnet: "claude-sonnet-5-5",
  haiku: "claude-haiku-5-5",
  fable: "claude-fable-5-2",
};

export function resolveModel(alias: string | undefined): string {
  if (!alias || alias === "inherit") return MODEL_MAP.opus;
  if (MODEL_MAP[alias]) return MODEL_MAP[alias];
  if (alias.startsWith("claude-")) return alias;
  return MODEL_MAP.opus;
}

/** Minimal frontmatter parser: `key: value` lines between --- fences. */
export function parseAgentFile(text: string): { fm: Record<string, string>; body: string } {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: text };
  const fm: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { fm, body: m[2].trim() };
}

async function loadMeta(): Promise<Record<string, AgentMeta>> {
  const data = await readJson<{ agents: Record<string, AgentMeta> }>(path.join(REPO_ROOT, "agents.json"), { agents: {} });
  return data.agents ?? {};
}

async function mdFiles(dir: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir)).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return [];
  }
}

function overrideDir(channel: Channel) {
  return path.join(channelRoot(channel), ".claude", "agents");
}

function titleCase(name: string) {
  return name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function build(file: string, text: string, meta: Record<string, AgentMeta>, source: Agent["source"]): Agent {
  const { fm, body } = parseAgentFile(text);
  const name = fm.name || path.basename(file, ".md");
  const m = meta[name] ?? {};
  return {
    name,
    label: m.label ?? titleCase(name),
    description: fm.description ?? "",
    tools: (fm.tools ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    modelAlias: fm.model ?? "opus",
    model: resolveModel(fm.model),
    effort: m.effort ?? "high",
    prompt: body,
    meta: m,
    source,
    file,
  };
}

/** Agents for a channel: base agents, with channel overrides winning, plus any channel-only agents. */
export async function listAgents(channel: Channel): Promise<Agent[]> {
  const meta = await loadMeta();
  const byName = new Map<string, Agent>();
  for (const f of await mdFiles(BASE_DIR)) {
    const file = path.join(BASE_DIR, f);
    const a = build(file, (await readText(file)) ?? "", meta, "base");
    byName.set(a.name, a);
  }
  if (!isRootChannel(channel)) {
    const dir = overrideDir(channel);
    for (const f of await mdFiles(dir)) {
      const file = path.join(dir, f);
      const a = build(file, (await readText(file)) ?? "", meta, "channel");
      byName.set(a.name, a);
    }
  }
  // Keep pipeline order for the known agents, then anything new alphabetically.
  const order = Object.keys(meta);
  return [...byName.values()].sort((a, b) => {
    const ia = order.indexOf(a.name);
    const ib = order.indexOf(b.name);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.name.localeCompare(b.name);
  });
}

export async function getAgent(channel: Channel, name: string): Promise<Agent | null> {
  return (await listAgents(channel)).find((a) => a.name === name) ?? null;
}

/** Copy the base agent into the channel's own .claude/agents so it can be tailored. */
export async function customizeAgent(channel: Channel, name: string): Promise<string> {
  if (isRootChannel(channel)) throw new Error("This channel already uses the base agent files directly.");
  const base = path.join(BASE_DIR, `${name}.md`);
  const text = await readText(base);
  if (text === null) throw new Error(`No base agent named "${name}".`);
  const target = path.join(overrideDir(channel), `${name}.md`);
  if (await exists(target)) throw new Error("This channel already has its own version of this agent.");
  await writeFileAtomic(target, text);
  return path.relative(channelRoot(channel), target).split(path.sep).join("/");
}
