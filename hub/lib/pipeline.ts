import "server-only";
import path from "path";
import { promises as fs } from "fs";
import { REPO_ROOT, readJson, readText, writeJson, exists, isSlug, slugify } from "./fsutil";
import { Channel, channelRoot } from "./channels";

export type Stage = {
  id: string;
  label: string;
  /** Agent name, or "human" for a manual step. */
  agent: string;
  outputs?: string[];
  gate?: boolean;
  optional?: boolean;
  /** Always start a new thread (fact-checker independence). */
  freshThread?: boolean;
  description?: string;
  prompt?: string;
};

export type StageStatus = "pending" | "running" | "review" | "changes" | "approved" | "skipped";

export type StageState = {
  status: StageStatus;
  runIds: string[];
  updatedAt?: string;
  note?: string;
};

export type Episode = {
  slug: string;
  title: string;
  pillar?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  stages: Record<string, StageState>;
};

export async function getPipeline(channel: Channel): Promise<Stage[]> {
  const own = path.join(channelRoot(channel), "pipeline.json");
  const file = (await exists(own)) ? own : path.join(REPO_ROOT, "pipeline.json");
  const data = await readJson<{ stages: Stage[] }>(file, { stages: [] });
  return data.stages ?? [];
}

function episodesDir(channel: Channel) {
  return path.join(channelRoot(channel), "episodes");
}

function episodeFile(channel: Channel, slug: string) {
  return path.join(episodesDir(channel), slug, "episode.json");
}

function blankStages(stages: Stage[]): Record<string, StageState> {
  return Object.fromEntries(stages.map((s) => [s.id, { status: "pending" as StageStatus, runIds: [] }]));
}

/** Fill in stages that were added to the pipeline after the episode was created. */
function normalize(ep: Episode, stages: Stage[]): Episode {
  const merged = { ...blankStages(stages), ...ep.stages };
  return { ...ep, stages: merged };
}

export async function listEpisodes(channel: Channel): Promise<Episode[]> {
  const stages = await getPipeline(channel);
  let dirs: string[] = [];
  try {
    dirs = (await fs.readdir(episodesDir(channel), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
  const out: Episode[] = [];
  for (const slug of dirs) {
    const ep = await readJson<Episode | null>(episodeFile(channel, slug), null);
    if (ep) {
      out.push(normalize({ ...ep, slug }, stages));
    } else {
      // Episode folder created outside the hub (e.g. in Claude Code): show it anyway.
      const stat = await fs.stat(path.join(episodesDir(channel), slug));
      out.push(
        normalize(
          { slug, title: slug, createdAt: stat.birthtime.toISOString(), updatedAt: stat.mtime.toISOString(), stages: {} },
          stages,
        ),
      );
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getEpisode(channel: Channel, slug: string): Promise<Episode | null> {
  if (!isSlug(slug)) return null;
  const stages = await getPipeline(channel);
  const dir = path.join(episodesDir(channel), slug);
  if (!(await exists(dir))) return null;
  const ep = await readJson<Episode | null>(episodeFile(channel, slug), null);
  const now = new Date().toISOString();
  return normalize(ep ? { ...ep, slug } : { slug, title: slug, createdAt: now, updatedAt: now, stages: {} }, stages);
}

export async function saveEpisode(channel: Channel, ep: Episode): Promise<void> {
  ep.updatedAt = new Date().toISOString();
  await writeJson(episodeFile(channel, ep.slug), ep);
}

export async function createEpisode(
  channel: Channel,
  input: { title: string; slug?: string; pillar?: string; notes?: string },
): Promise<Episode> {
  const title = input.title.trim();
  if (!title) throw new Error("Title is required.");
  const slug = (input.slug?.trim() || slugify(title)).trim();
  if (!isSlug(slug)) throw new Error("Slug must be lowercase letters, numbers and dashes.");
  if (await exists(path.join(episodesDir(channel), slug))) throw new Error(`Episode "${slug}" already exists.`);
  const now = new Date().toISOString();
  const ep: Episode = {
    slug,
    title,
    pillar: input.pillar?.trim() || "",
    notes: input.notes?.trim() || "",
    createdAt: now,
    updatedAt: now,
    stages: blankStages(await getPipeline(channel)),
  };
  await saveEpisode(channel, ep);
  return ep;
}

export async function updateStage(
  channel: Channel,
  slug: string,
  stageId: string,
  patch: Partial<StageState> & { addRunId?: string },
): Promise<Episode> {
  const ep = await getEpisode(channel, slug);
  if (!ep) throw new Error(`Episode "${slug}" not found.`);
  const cur = ep.stages[stageId] ?? { status: "pending", runIds: [] };
  const { addRunId, ...rest } = patch;
  ep.stages[stageId] = {
    ...cur,
    ...rest,
    runIds: addRunId ? [...cur.runIds.filter((r) => r !== addRunId), addRunId] : rest.runIds ?? cur.runIds,
    updatedAt: new Date().toISOString(),
  };
  await saveEpisode(channel, ep);
  return ep;
}

/** A stage is ready when every earlier non-optional stage is approved or skipped. */
export function isStageReady(stages: Stage[], ep: Episode, stageId: string): boolean {
  for (const s of stages) {
    if (s.id === stageId) return true;
    const st = ep.stages[s.id]?.status;
    if (st === "approved" || st === "skipped") continue;
    if (s.optional && st === "pending") continue;
    return false;
  }
  return false;
}

/** The stage to work on next: the first one not approved/skipped. */
export function currentStage(stages: Stage[], ep: Episode): Stage | null {
  for (const s of stages) {
    const st = ep.stages[s.id]?.status;
    if (st === "approved" || st === "skipped") continue;
    return s;
  }
  return null;
}

export function fillPrompt(template: string, ep: Episode): string {
  return template
    .replaceAll("{slug}", ep.slug)
    .replaceAll("{title}", ep.title)
    .replaceAll("{pillar}", ep.pillar || "not set")
    .replaceAll("{notes}", ep.notes || "none");
}

export async function stageOutputs(channel: Channel, ep: Episode, stage: Stage) {
  const root = channelRoot(channel);
  return Promise.all(
    (stage.outputs ?? []).map(async (f) => {
      const rel = `episodes/${ep.slug}/${f}`;
      const text = await readText(path.join(root, rel));
      return { path: rel, exists: text !== null, content: text ?? "" };
    }),
  );
}
