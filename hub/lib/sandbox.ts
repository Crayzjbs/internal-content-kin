import "server-only";
import path from "path";
import { REPO_ROOT } from "./fsutil";

/**
 * Path confinement for agent tools and the Files page.
 * Every path is resolved against a channel root and rejected if it escapes it.
 */

export type Access = "read" | "write";
export type Actor = "agent" | "user";

export class SandboxError extends Error {}

/** Top-level folders that never belong to a channel when the channel root is the repo root. */
const REPO_ONLY = ["hub", "channels", ".hub", ".git", "node_modules"];

function segments(rel: string): string[] {
  return rel.split(/[\\/]+/).filter(Boolean);
}

function isEnvFile(name: string) {
  return name === ".env" || name.startsWith(".env.");
}

/**
 * Resolve `p` (relative to `root`) to an absolute path, or throw SandboxError.
 * Agents may not write inside .claude; users can (to customize agents).
 */
export function resolveInside(root: string, p: string, access: Access, actor: Actor = "agent"): string {
  if (typeof p !== "string" || p.trim() === "") throw new SandboxError("Path is empty.");
  if (p.includes("\0")) throw new SandboxError("Invalid path.");
  const absRoot = path.resolve(root);
  const abs = path.resolve(absRoot, p.replace(/^[/\\]+/, ""));
  const rel = path.relative(absRoot, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new SandboxError(`Path "${p}" is outside the channel folder. Use a path relative to the channel folder.`);
  }
  const segs = segments(rel);
  const first = segs[0] ?? "";
  const isRepoRoot = path.resolve(REPO_ROOT) === absRoot;

  if (segs.includes(".git") || segs.includes("node_modules") || segs.includes(".hub")) {
    throw new SandboxError(`Access to "${p}" is not allowed.`);
  }
  if (isRepoRoot && REPO_ONLY.includes(first)) {
    throw new SandboxError(`"${first}/" is not part of this channel.`);
  }
  if (segs.some(isEnvFile)) throw new SandboxError("Environment files are not accessible.");
  if (access === "write" && actor === "agent" && first === ".claude") {
    throw new SandboxError("Agents cannot change agent definitions. Ask Justine to edit them in the hub.");
  }
  return abs;
}

/** Should a directory entry be hidden from listings (Files tree, Glob)? */
export function isHidden(root: string, relDir: string, name: string): boolean {
  if (name === ".git" || name === "node_modules" || name === ".hub" || name === ".next") return true;
  if (isEnvFile(name)) return true;
  const isRepoRoot = path.resolve(REPO_ROOT) === path.resolve(root);
  if (isRepoRoot && relDir === "" && REPO_ONLY.includes(name)) return true;
  return false;
}

export function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}
