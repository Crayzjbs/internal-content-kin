import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type Anthropic from "@anthropic-ai/sdk";
import { HUB_DATA, readJson, writeJson } from "../fsutil";

export type RunStatus = "running" | "done" | "error" | "stopped";

export type Usage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  webSearches: number;
  webFetches: number;
};

export type Run = {
  id: string;
  channel: string;
  agent: string;
  agentLabel: string;
  model: string;
  title: string;
  episode?: string;
  stageId?: string;
  status: RunStatus;
  stopReason?: string;
  error?: string;
  mock?: boolean;
  createdAt: string;
  updatedAt: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  usage: Usage;
  costUsd: number;
  files: { path: string; action: "write" | "edit" }[];
};

export type RunSummary = Omit<Run, "messages">;

export const emptyUsage = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, webSearches: 0, webFetches: 0 });

function dir(channel: string) {
  return path.join(HUB_DATA, "runs", channel);
}

function file(channel: string, id: string) {
  if (!/^[a-z0-9-]+$/i.test(id)) throw new Error("Invalid run id.");
  return path.join(dir(channel), `${id}.json`);
}

export function newRunId(): string {
  const d = new Date();
  const stamp = d.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveRun(run: Run): Promise<void> {
  run.updatedAt = new Date().toISOString();
  await writeJson(file(run.channel, run.id), run);
}

export async function loadRun(channel: string, id: string): Promise<Run | null> {
  try {
    return await readJson<Run | null>(file(channel, id), null);
  } catch {
    return null;
  }
}

export async function listRuns(
  channel: string,
  filter: { agent?: string; episode?: string; limit?: number } = {},
): Promise<RunSummary[]> {
  let names: string[] = [];
  try {
    names = (await fs.readdir(dir(channel))).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  // Ids start with a timestamp, so name order is creation order.
  names.sort().reverse();
  const out: RunSummary[] = [];
  for (const n of names) {
    const r = await readJson<Run | null>(path.join(dir(channel), n), null);
    if (!r) continue;
    if (filter.agent && r.agent !== filter.agent) continue;
    if (filter.episode && r.episode !== filter.episode) continue;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { messages, ...summary } = r;
    out.push(summary);
    if (filter.limit && out.length >= filter.limit) break;
  }
  return out;
}

/** Plain text of the first user message, for run titles. */
export function firstUserText(messages: Anthropic.Beta.BetaMessageParam[]): string {
  const m = messages.find((x) => x.role === "user");
  if (!m) return "";
  if (typeof m.content === "string") return m.content;
  const t = m.content.find((b) => b.type === "text");
  return t && "text" in t ? t.text : "";
}
