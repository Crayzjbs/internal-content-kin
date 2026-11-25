import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { REPO_ROOT, exists, readJson, readText, writeFileAtomic, writeJson, isSlug } from "./fsutil";

export type Channel = {
  slug: string;
  name: string;
  /** Folder relative to the repo root. KIN uses "." (the repo root). */
  root: string;
  youtubeHandle?: string;
  color?: string;
  description?: string;
  /** Content pillars, offered when creating episodes. */
  pillars?: string[];
};

const REGISTRY = path.join(REPO_ROOT, "channels.json");

export async function listChannels(): Promise<Channel[]> {
  const data = await readJson<{ channels: Channel[] }>(REGISTRY, { channels: [] });
  return data.channels ?? [];
}

export async function getChannel(slug: string): Promise<Channel | null> {
  return (await listChannels()).find((c) => c.slug === slug) ?? null;
}

export async function requireChannel(slug: string): Promise<Channel> {
  const c = await getChannel(slug);
  if (!c) throw new Error(`Unknown channel "${slug}".`);
  return c;
}

export function channelRoot(c: Channel): string {
  return path.resolve(REPO_ROOT, c.root);
}

/** True for the channel whose files live at the repo root (KIN). */
export function isRootChannel(c: Channel): boolean {
  return path.resolve(REPO_ROOT, c.root) === path.resolve(REPO_ROOT);
}

export type NewChannelInput = {
  name: string;
  slug: string;
  youtubeHandle?: string;
  color?: string;
  description?: string;
  format?: string;
  audience?: string;
};

const AGENT_NAMES = ["content-strategist", "scriptwriter", "fact-checker", "copywriter", "social-media-manager"];

/** Pull a "## Heading" section (heading line included) out of a markdown file. */
function section(md: string, heading: string): string {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start < 0) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trim();
}

export async function createChannel(input: NewChannelInput): Promise<Channel> {
  const slug = input.slug.trim();
  if (!isSlug(slug)) throw new Error("Slug must be lowercase letters, numbers and dashes.");
  if (!input.name.trim()) throw new Error("Name is required.");
  const channels = await listChannels();
  if (channels.some((c) => c.slug === slug)) throw new Error(`A channel with slug "${slug}" already exists.`);

  const rootRel = `channels/${slug}`;
  const root = path.join(REPO_ROOT, rootRel);
  if (await exists(root)) throw new Error(`Folder ${rootRel} already exists.`);

  const kinClaude = (await readText(path.join(REPO_ROOT, "CLAUDE.md"))) ?? "";
  const houseRules = section(kinClaude, "House rules") || "## House rules\n- Nothing is published, posted, scheduled or sent without Justine's approval.";
  const folders = section(kinClaude, "Project folders");
  const handoff = section(kinClaude, "Handoff rule");
  const name = input.name.trim();

  const claudeMd = `# ${name.toUpperCase()} YOUTUBE CHANNEL PRODUCTION TEAM

## The channel
- Name: ${name}
- YouTube: ${input.youtubeHandle?.trim() || "[TBD]"}
- Owner: KIN Creatives. Final approver: Justine.
- Format: ${input.format?.trim() || "[TBD by Justine]"}
- Audience: ${input.audience?.trim() || "[TBD by Justine]"}
- Content pillars: [TBD by Justine]
- Style references: [TBD by Justine]
- Visuals: [TBD by Justine]
- Goals: [TBD by Justine]
- Upload cadence: [TBD by Justine]
${input.description?.trim() ? `- Notes: ${input.description.trim()}\n` : ""}
## Team
- Humans: Justine (final approver) and the KIN Creatives team.
- AI agents: content-strategist, scriptwriter, fact-checker, copywriter, social-media-manager.

## Pipeline
content-strategist (brief) > scriptwriter (dossier, script, VO script) > fact-checker (report, run in a fresh session) > scriptwriter (fixes) > production > copywriter (title, description, captions) > social-media-manager (calendar, clips, weekly report) > back to content-strategist.

${houseRules}

${folders}

${handoff}
`;

  const tbd = (title: string, body: string) => `# ${title}\n\nStatus: DRAFT, TBD by Justine.\n\n${body}\n`;
  const files: Record<string, string> = {
    "CLAUDE.md": claudeMd,
    "bible/series-bible.md": tbd(
      `${name.toUpperCase()} SERIES BIBLE`,
      "## The promise\n[TBD]\n\n## Who we make it for\n[TBD]\n\n## Pillars\n[TBD]\n\n## Episode format\n[TBD]\n\n## Visual language\n[TBD]\n\n## Packaging\n[TBD]\n\n## Shorts\n[TBD]",
    ),
    "bible/voice-guide.md": tbd(
      `${name.toUpperCase()} VOICE GUIDE`,
      "## The narrator\n[TBD]\n\n## Tone in one line\n[TBD]\n\n## Sentence rules\n- No em dashes. Use commas, colons, or periods.\n\n## Words and phrases we do not use\n[TBD]",
    ),
    "brand/design-kit.md": tbd(`${name.toUpperCase()} DESIGN KIT`, "## Fonts\n[TBD]\n\n## Color palette\n[TBD]\n\n## Recurring graphic elements\n[TBD]"),
    "strategy/.gitkeep": "",
    "episodes/.gitkeep": "",
    "social/.gitkeep": "",
  };
  for (const a of AGENT_NAMES) files[`feedback/${a}-log.md`] = "";

  for (const [rel, content] of Object.entries(files)) {
    await writeFileAtomic(path.join(root, rel), content);
  }
  // Generic standards carry over from KIN.
  for (const f of ["bible/source-standards.md", "bible/legal-checklist.md"]) {
    const src = await readText(path.join(REPO_ROOT, f));
    if (src !== null) await writeFileAtomic(path.join(root, f), src);
  }

  const channel: Channel = {
    slug,
    name,
    root: rootRel,
    youtubeHandle: input.youtubeHandle?.trim() || "",
    color: input.color || "#6366f1",
    description: input.description?.trim() || "",
    pillars: [],
  };
  await writeJson(REGISTRY, { channels: [...channels, channel] });
  return channel;
}

export async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}
