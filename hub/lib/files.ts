import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { Channel, channelRoot } from "./channels";
import { resolveInside, toPosix } from "./sandbox";
import { listAllFiles } from "./agents/tools";
import { readText, today, writeFileAtomic } from "./fsutil";

const TEXT_EXT = /\.(md|txt|json|csv|ya?ml)$/i;

export async function listChannelFiles(channel: Channel): Promise<string[]> {
  const all = await listAllFiles(channelRoot(channel));
  return all.filter((f) => TEXT_EXT.test(f)).sort((a, b) => a.localeCompare(b));
}

export async function readChannelFile(channel: Channel, rel: string): Promise<string | null> {
  const abs = resolveInside(channelRoot(channel), rel, "read", "user");
  return readText(abs);
}

export async function writeChannelFile(channel: Channel, rel: string, content: string): Promise<string> {
  if (!TEXT_EXT.test(rel)) throw new Error("Only text files (.md, .txt, .json, .csv, .yaml) can be edited here.");
  const abs = resolveInside(channelRoot(channel), rel, "write", "user");
  await writeFileAtomic(abs, content);
  return toPosix(path.relative(channelRoot(channel), abs));
}

export async function fileMtime(channel: Channel, rel: string): Promise<string | null> {
  try {
    const abs = resolveInside(channelRoot(channel), rel, "read", "user");
    return (await fs.stat(abs)).mtime.toISOString();
  } catch {
    return null;
  }
}

/** Append a rule to feedback/<agent>-log.md. Agents read this log before every task. */
export async function appendFeedbackRule(channel: Channel, agent: string, rule: string, context?: string): Promise<string> {
  const rel = `feedback/${agent}-log.md`;
  const abs = resolveInside(channelRoot(channel), rel, "write", "user");
  const cur = (await readText(abs)) ?? "";
  const header = cur.trim() ? "" : `# FEEDBACK LOG: ${agent}\n\nRules from Justine. Follow every one.\n\n`;
  const line = `- ${today()}${context ? ` (${context})` : ""}: ${rule.trim().replace(/\s*\n\s*/g, " ")}\n`;
  await writeFileAtomic(abs, cur + (cur && !cur.endsWith("\n") ? "\n" : "") + header + line);
  return rel;
}
