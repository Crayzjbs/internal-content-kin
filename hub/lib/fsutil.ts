import "server-only";
import { promises as fs } from "fs";
import path from "path";

/** Repo root: the hub lives in <repo>/hub. Override with HUB_REPO_ROOT. */
export const REPO_ROOT = path.resolve(process.env.HUB_REPO_ROOT ?? path.join(process.cwd(), ".."));

/** Hub runtime data (run transcripts). Gitignored. */
export const HUB_DATA = path.join(REPO_ROOT, ".hub");

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readText(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

export async function readJson<T>(p: string, fallback: T): Promise<T> {
  const text = await readText(p);
  if (text === null) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** Write via a temp file and rename, so a crash never leaves half a file. */
export async function writeFileAtomic(p: string, data: string): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, data, "utf8");
  await fs.rename(tmp, p);
}

export async function writeJson(p: string, value: unknown): Promise<void> {
  await writeFileAtomic(p, JSON.stringify(value, null, 2) + "\n");
}

export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function isSlug(s: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,59}$/.test(s);
}
