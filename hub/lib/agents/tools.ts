import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { resolveInside, isHidden, toPosix, SandboxError } from "../sandbox";
import { writeFileAtomic } from "../fsutil";

/**
 * File tools for hub agents, named like Claude Code's so the agent prompts read naturally.
 * All paths are confined to the channel root.
 */

export type ToolContext = {
  root: string;
  onFile?: (rel: string, action: "write" | "edit") => void;
};

type ToolImpl = {
  def: Anthropic.Beta.BetaTool;
  schema: z.ZodType;
  run: (input: never, ctx: ToolContext) => Promise<string>;
};

const MAX_READ_CHARS = 120_000;

function rel(ctx: ToolContext, abs: string) {
  return toPosix(path.relative(ctx.root, abs));
}

/** Convert a glob (supports **, *, ?, {a,b}) to a RegExp over posix paths. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  let i = 0;
  let inBrace = false;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        const slash = glob[i + 2] === "/";
        re += slash ? "(?:.*/)?" : ".*";
        i += slash ? 3 : 2;
        continue;
      }
      re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") {
      re += "(?:";
      inBrace = true;
    } else if (c === "}" && inBrace) {
      re += ")";
      inBrace = false;
    } else if (c === "," && inBrace) re += "|";
    else re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
    i++;
  }
  return new RegExp(`^${re}$`, "i");
}

async function walk(root: string, dir = "", out: string[] = [], limit = 5000): Promise<string[]> {
  let entries: import("fs").Dirent[] = [];
  try {
    entries = await fs.readdir(path.join(root, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (out.length >= limit) break;
    if (isHidden(root, dir, e.name)) continue;
    const p = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) await walk(root, p, out, limit);
    else out.push(p);
  }
  return out;
}

export async function listAllFiles(root: string): Promise<string[]> {
  return walk(root);
}

const ReadInput = z.object({
  file_path: z.string(),
  offset: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).optional(),
});
const WriteInput = z.object({ file_path: z.string(), content: z.string() });
const EditInput = z.object({
  file_path: z.string(),
  old_string: z.string(),
  new_string: z.string(),
  replace_all: z.boolean().optional(),
});
const GlobInput = z.object({ pattern: z.string(), path: z.string().optional() });
const GrepInput = z.object({
  pattern: z.string(),
  path: z.string().optional(),
  glob: z.string().optional(),
  output_mode: z.enum(["content", "files_with_matches", "count"]).optional(),
  "-i": z.boolean().optional(),
});

const pathDesc = "Path relative to the channel folder, e.g. episodes/my-episode/brief.md";

export const TOOLS: Record<string, ToolImpl> = {
  Read: {
    schema: ReadInput,
    def: {
      name: "Read",
      description: "Read a text file from the channel folder. Returns numbered lines. Use offset/limit for long files.",
      eager_input_streaming: true,
      input_schema: {
        type: "object",
        properties: {
          file_path: { type: "string", description: pathDesc },
          offset: { type: "integer", description: "1-based line to start from" },
          limit: { type: "integer", description: "Number of lines to read" },
        },
        required: ["file_path"],
      },
    },
    run: async (input: z.infer<typeof ReadInput>, ctx) => {
      const abs = resolveInside(ctx.root, input.file_path, "read");
      let text: string;
      try {
        text = await fs.readFile(abs, "utf8");
      } catch {
        return `File not found: ${input.file_path}`;
      }
      if (text === "") return `${input.file_path} exists but is empty.`;
      const lines = text.split(/\r?\n/);
      const start = (input.offset ?? 1) - 1;
      const slice = lines.slice(start, input.limit ? start + input.limit : undefined);
      let out = slice.map((l, i) => `${String(start + i + 1).padStart(5)}\t${l}`).join("\n");
      if (out.length > MAX_READ_CHARS) out = out.slice(0, MAX_READ_CHARS) + "\n[truncated: use offset and limit to read the rest]";
      return out;
    },
  },
  Write: {
    schema: WriteInput,
    def: {
      name: "Write",
      description: "Create or overwrite a file in the channel folder with the given content. Parent folders are created.",
      eager_input_streaming: true,
      input_schema: {
        type: "object",
        properties: { file_path: { type: "string", description: pathDesc }, content: { type: "string" } },
        required: ["file_path", "content"],
      },
    },
    run: async (input: z.infer<typeof WriteInput>, ctx) => {
      const abs = resolveInside(ctx.root, input.file_path, "write");
      await writeFileAtomic(abs, input.content);
      ctx.onFile?.(rel(ctx, abs), "write");
      return `Wrote ${rel(ctx, abs)} (${input.content.length} characters).`;
    },
  },
  Edit: {
    schema: EditInput,
    def: {
      name: "Edit",
      description:
        "Replace an exact string in a file. old_string must match exactly and be unique unless replace_all is true.",
      eager_input_streaming: true,
      input_schema: {
        type: "object",
        properties: {
          file_path: { type: "string", description: pathDesc },
          old_string: { type: "string" },
          new_string: { type: "string" },
          replace_all: { type: "boolean" },
        },
        required: ["file_path", "old_string", "new_string"],
      },
    },
    run: async (input: z.infer<typeof EditInput>, ctx) => {
      const abs = resolveInside(ctx.root, input.file_path, "write");
      let text: string;
      try {
        text = await fs.readFile(abs, "utf8");
      } catch {
        return `File not found: ${input.file_path}`;
      }
      const count = text.split(input.old_string).length - 1;
      if (count === 0) return "old_string was not found in the file. Read the file and copy the exact text.";
      if (count > 1 && !input.replace_all) return `old_string appears ${count} times. Add more context or set replace_all.`;
      const next = input.replace_all
        ? text.split(input.old_string).join(input.new_string)
        : text.replace(input.old_string, () => input.new_string);
      await writeFileAtomic(abs, next);
      ctx.onFile?.(rel(ctx, abs), "edit");
      return `Edited ${rel(ctx, abs)} (${input.replace_all ? count : 1} replacement${count > 1 && input.replace_all ? "s" : ""}).`;
    },
  },
  Glob: {
    schema: GlobInput,
    def: {
      name: "Glob",
      description: "Find files in the channel folder by glob pattern, e.g. episodes/**/*.md or strategy/*.md.",
      input_schema: {
        type: "object",
        properties: {
          pattern: { type: "string" },
          path: { type: "string", description: "Folder to search in, relative to the channel folder" },
        },
        required: ["pattern"],
      },
    },
    run: async (input: z.infer<typeof GlobInput>, ctx) => {
      const base = input.path ? rel(ctx, resolveInside(ctx.root, input.path, "read")) : "";
      const re = globToRegExp(input.pattern);
      const files = (await listAllFiles(ctx.root))
        .filter((f) => !base || f === base || f.startsWith(base + "/"))
        .filter((f) => re.test(base ? f.slice(base.length + 1) : f) || re.test(f));
      if (files.length === 0) return "No files matched.";
      return files.slice(0, 300).join("\n") + (files.length > 300 ? `\n[${files.length - 300} more]` : "");
    },
  },
  Grep: {
    schema: GrepInput,
    def: {
      name: "Grep",
      description: "Search file contents in the channel folder with a regular expression.",
      input_schema: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "JavaScript regular expression" },
          path: { type: "string", description: "File or folder to search, relative to the channel folder" },
          glob: { type: "string", description: "Only search files matching this glob, e.g. *.md" },
          output_mode: { type: "string", enum: ["content", "files_with_matches", "count"] },
          "-i": { type: "boolean", description: "Case insensitive" },
        },
        required: ["pattern"],
      },
    },
    run: async (input: z.infer<typeof GrepInput>, ctx) => {
      let re: RegExp;
      try {
        re = new RegExp(input.pattern, input["-i"] ? "i" : "");
      } catch (e) {
        return `Invalid regular expression: ${(e as Error).message}`;
      }
      const base = input.path ? rel(ctx, resolveInside(ctx.root, input.path, "read")) : "";
      const globRe = input.glob ? globToRegExp(input.glob.includes("/") ? input.glob : `**/${input.glob}`) : null;
      const files = (await listAllFiles(ctx.root))
        .filter((f) => !base || f === base || f.startsWith(base + "/"))
        .filter((f) => !globRe || globRe.test(f))
        .filter((f) => /\.(md|txt|json|csv|ya?ml)$/i.test(f));
      const mode = input.output_mode ?? "files_with_matches";
      const out: string[] = [];
      for (const f of files) {
        const text = await fs.readFile(path.join(ctx.root, f), "utf8").catch(() => "");
        const lines = text.split(/\r?\n/);
        const hits = lines.map((l, i) => [i + 1, l] as const).filter(([, l]) => re.test(l));
        if (!hits.length) continue;
        if (mode === "files_with_matches") out.push(f);
        else if (mode === "count") out.push(`${f}:${hits.length}`);
        else for (const [n, l] of hits.slice(0, 50)) out.push(`${f}:${n}:${l}`);
        if (out.length > 400) break;
      }
      return out.length ? out.join("\n") : "No matches.";
    },
  },
};

export const SERVER_TOOLS: Record<string, Anthropic.Beta.BetaToolUnion> = {
  WebSearch: { type: "web_search_20260209", name: "web_search", max_uses: 15 },
  WebFetch: { type: "web_fetch_20260209", name: "web_fetch", max_uses: 30 },
};

export function buildToolList(agentTools: string[]): Anthropic.Beta.BetaToolUnion[] {
  const list: Anthropic.Beta.BetaToolUnion[] = [];
  for (const t of agentTools) {
    if (TOOLS[t]) list.push(TOOLS[t].def);
    else if (SERVER_TOOLS[t]) list.push(SERVER_TOOLS[t]);
  }
  return list;
}

/** Validate and run a custom tool. Returns [text, isError]. */
export async function executeTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<[string, boolean]> {
  const impl = TOOLS[name];
  if (!impl) return [`Unknown tool "${name}".`, true];
  const parsed = impl.schema.safeParse(rawInput);
  if (!parsed.success) {
    return [`INVALID_INPUT: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, true];
  }
  try {
    return [await impl.run(parsed.data as never, ctx), false];
  } catch (e) {
    if (e instanceof SandboxError) return [e.message, true];
    return [`Tool failed: ${(e as Error).message}`, true];
  }
}
