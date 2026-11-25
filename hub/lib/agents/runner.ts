import "server-only";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { readText, today } from "../fsutil";
import { Channel, channelRoot, isRootChannel, requireChannel } from "../channels";
import { Agent, getAgent } from "./registry";
import { buildToolList, executeTool, TOOLS } from "./tools";
import { Run, emptyUsage, loadRun, newRunId, saveRun } from "./runs";
import { costOf } from "./pricing";
import { getEpisode, getPipeline, updateStage } from "../pipeline";
import { runMock } from "./mock";

/** Events streamed to the browser while a run is live. */
export type RunEvent =
  | { t: "status"; status: Run["status"]; base: number }
  | { t: "text"; d: string }
  | { t: "thinking"; d: string }
  | { t: "block"; kind: string; name?: string }
  | { t: "message"; message: Anthropic.Beta.BetaMessageParam }
  | { t: "file"; path: string; action: "write" | "edit" }
  | { t: "usage"; usage: Run["usage"]; costUsd: number }
  | { t: "done"; status: Run["status"]; error?: string; stopReason?: string };

type Live = {
  events: RunEvent[];
  listeners: Set<(e: RunEvent) => void>;
  abort: AbortController;
  done: boolean;
};

// Survives Next.js dev module reloads.
const g = globalThis as unknown as { __hubLive?: Map<string, Live> };
const LIVE = (g.__hubLive ??= new Map<string, Live>());

export function isLive(runId: string): boolean {
  const l = LIVE.get(runId);
  return !!l && !l.done;
}

export function subscribe(runId: string, fn: (e: RunEvent) => void): (() => void) | null {
  const l = LIVE.get(runId);
  if (!l) return null;
  for (const e of l.events) fn(e);
  if (l.done) return () => {};
  l.listeners.add(fn);
  return () => l.listeners.delete(fn);
}

export function stopRun(runId: string): boolean {
  const l = LIVE.get(runId);
  if (!l || l.done) return false;
  l.abort.abort();
  return true;
}

export function mockMode(): boolean {
  return process.env.HUB_MOCK_AGENTS === "1";
}

export function apiKeyPresent(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

const MAX_TURNS = Number(process.env.HUB_MAX_TURNS ?? 40) || 40;

async function systemPrompt(channel: Channel, agent: Agent): Promise<string> {
  const root = channelRoot(channel);
  const claudeMd = (await readText(path.join(root, "CLAUDE.md"))) ?? "(This channel has no CLAUDE.md yet.)";
  const custom = agent.tools.filter((t) => TOOLS[t]);
  const web = agent.tools.filter((t) => t === "WebSearch" || t === "WebFetch");
  const lines = [
    agent.prompt,
    "",
    "---",
    "# Hub environment",
    "You are running inside the KIN Content Production Hub, a local dashboard Justine uses to run the production team. You are not in Claude Code.",
    `- Channel: ${channel.name} (slug: ${channel.slug}). Every file path is relative to this channel's folder, for example bible/series-bible.md or episodes/<slug>/brief.md.`,
    `- Your file tools: ${custom.join(", ") || "none"}.${web.length ? ` Web tools: ${web.map((w) => (w === "WebSearch" ? "web_search" : "web_fetch")).join(", ")}.` : " You have no web access."}`,
    "- Save deliverables as files with your tools. Justine reviews them in the hub. Keep your chat reply short: what you did, open questions, and the HANDOFF block.",
    "- If key information is missing, ask up to 3 short questions in your reply and stop. Justine answers in the same thread.",
    `- Today's date: ${today()}.`,
  ];
  if (!isRootChannel(channel)) {
    lines.push(
      `- You are working for the ${channel.name} channel, not KIN. This channel's CLAUDE.md, bible and voice guide override any KIN-specific details in your role description (channel name, format, pillars, length, style references, visuals).`,
    );
  }
  lines.push("", "# Channel instructions (CLAUDE.md)", claudeMd);
  return lines.join("\n");
}

export type StartInput = {
  channel: string;
  agent: string;
  prompt: string;
  runId?: string;
  episode?: string;
  stageId?: string;
};

export async function startRun(input: StartInput): Promise<string> {
  const channel = await requireChannel(input.channel);
  const agent = await getAgent(channel, input.agent);
  if (!agent) throw new Error(`Unknown agent "${input.agent}".`);
  const mock = mockMode();
  if (!mock && !apiKeyPresent()) {
    throw new Error("No ANTHROPIC_API_KEY. Add it to hub/.env.local and restart the hub, or set HUB_MOCK_AGENTS=1 to test.");
  }
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("Write a message first.");

  let run: Run;
  if (input.runId) {
    const existing = await loadRun(channel.slug, input.runId);
    if (!existing) throw new Error("Run not found.");
    if (isLive(existing.id)) throw new Error("This run is still working. Stop it or wait for it to finish.");
    if (existing.mock && !mock) throw new Error("This thread was a mock run. Start a new thread for a real run.");
    run = existing;
    run.status = "running";
    run.error = undefined;
    run.stopReason = undefined;
    if (input.stageId) run.stageId = input.stageId;
  } else {
    const now = new Date().toISOString();
    run = {
      id: newRunId(),
      channel: channel.slug,
      agent: agent.name,
      agentLabel: agent.label,
      model: agent.model,
      title: prompt.split("\n")[0].slice(0, 90),
      episode: input.episode,
      stageId: input.stageId,
      status: "running",
      mock,
      createdAt: now,
      updatedAt: now,
      messages: [],
      usage: emptyUsage(),
      costUsd: 0,
      files: [],
    };
  }
  const userText =
    input.episode && !input.runId
      ? `${prompt}\n\n(Episode: ${input.episode}. Its folder is episodes/${input.episode}/.)`
      : prompt;
  // If the last turn ended with tool calls that never got results (run stopped or crashed),
  // answer them first so the conversation stays valid.
  const last = run.messages[run.messages.length - 1];
  const dangling =
    last?.role === "assistant" && Array.isArray(last.content)
      ? last.content.filter((b) => b.type === "tool_use").map((b) => (b as Anthropic.Beta.BetaToolUseBlockParam).id)
      : [];
  run.messages.push({
    role: "user",
    content: dangling.length
      ? [
          ...dangling.map((id) => ({
            type: "tool_result" as const,
            tool_use_id: id,
            content: "This tool call did not run because the run was interrupted.",
            is_error: true,
          })),
          { type: "text" as const, text: userText },
        ]
      : userText,
  });
  await saveRun(run);

  if (run.episode && run.stageId) {
    await updateStage(channel, run.episode, run.stageId, { status: "running", addRunId: run.id, note: undefined });
  }

  const live: Live = { events: [], listeners: new Set(), abort: new AbortController(), done: false };
  LIVE.set(run.id, live);
  const emit = (e: RunEvent) => {
    live.events.push(e);
    for (const fn of live.listeners) fn(e);
  };
  // `base` = messages saved before this live session, so a page that connects later can line up the replay.
  emit({ t: "status", status: "running", base: run.messages.length });

  void (async () => {
    try {
      if (mock) await runMock(run, channel, agent, emit, live.abort.signal);
      else await runLoop(run, channel, agent, emit, live.abort.signal);
      if (run.status === "running") run.status = "done";
    } catch (e) {
      if (live.abort.signal.aborted) {
        run.status = "stopped";
      } else {
        run.status = "error";
        run.error = describeError(e);
      }
    }
    await saveRun(run);
    if (run.episode && run.stageId) {
      await finishStage(channel, run).catch(() => {});
    }
    emit({ t: "done", status: run.status, error: run.error, stopReason: run.stopReason });
    live.done = true;
    live.listeners.clear();
    // Keep finished buffers briefly so a reconnecting page can replay them.
    setTimeout(() => LIVE.delete(run.id), 60_000);
  })();

  return run.id;
}

async function finishStage(channel: Channel, run: Run) {
  const ep = await getEpisode(channel, run.episode!);
  if (!ep) return;
  const stages = await getPipeline(channel);
  if (!stages.some((s) => s.id === run.stageId)) return;
  if (run.status === "done") {
    await updateStage(channel, ep.slug, run.stageId!, { status: "review" });
  } else {
    await updateStage(channel, ep.slug, run.stageId!, {
      status: "pending",
      note: run.status === "stopped" ? "Run was stopped." : `Run failed: ${run.error ?? "unknown error"}`,
    });
  }
}

function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "The API key was rejected. Check ANTHROPIC_API_KEY in hub/.env.local.";
  if (e instanceof Anthropic.PermissionDeniedError) return `Permission denied by the API: ${e.message}`;
  if (e instanceof Anthropic.RateLimitError) return "Rate limited by the API. Wait a minute and continue the thread.";
  if (e instanceof Anthropic.BadRequestError) return `The API rejected the request: ${e.message}`;
  if (e instanceof Anthropic.APIError) return `API error${e.status ? ` ${e.status}` : ""}: ${e.message}`;
  return (e as Error)?.message ?? String(e);
}

function addUsage(run: Run, model: string, u: Anthropic.Beta.BetaUsage) {
  const delta = {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
    webSearches: u.server_tool_use?.web_search_requests ?? 0,
    webFetches: u.server_tool_use?.web_fetch_requests ?? 0,
  };
  for (const k of Object.keys(delta) as (keyof typeof delta)[]) run.usage[k] += delta[k];
  run.costUsd += costOf(model, { ...delta });
}

async function runLoop(
  run: Run,
  channel: Channel,
  agent: Agent,
  emit: (e: RunEvent) => void,
  signal: AbortSignal,
) {
  const client = new Anthropic();
  const root = channelRoot(channel);
  const system = await systemPrompt(channel, agent);
  const tools = buildToolList(agent.tools);
  let jsonRetries = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const stream = client.beta.messages.stream(
      {
        model: agent.model,
        max_tokens: 64000,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        cache_control: { type: "ephemeral" },
        messages: run.messages,
        tools,
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort: agent.effort },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      },
      { signal },
    );

    let message: Anthropic.Beta.BetaMessage;
    try {
      for await (const ev of stream) {
        if (ev.type === "content_block_start") {
          const b = ev.content_block;
          if (b.type === "tool_use" || b.type === "server_tool_use") emit({ t: "block", kind: b.type, name: b.name });
        } else if (ev.type === "content_block_delta") {
          if (ev.delta.type === "text_delta") emit({ t: "text", d: ev.delta.text });
          else if (ev.delta.type === "thinking_delta") emit({ t: "thinking", d: ev.delta.thinking });
        }
      }
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // Unparseable streamed tool input or a dropped connection: re-issue the turn.
      if (signal.aborted || err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
      continue;
    }

    run.model = message.model ?? run.model;
    addUsage(run, message.model ?? agent.model, message.usage);
    const assistant: Anthropic.Beta.BetaMessageParam = { role: "assistant", content: message.content as Anthropic.Beta.BetaContentBlockParam[] };
    run.messages.push(assistant);
    emit({ t: "message", message: assistant });
    emit({ t: "usage", usage: run.usage, costUsd: run.costUsd });
    await saveRun(run);

    const stop = message.stop_reason;
    const hasToolUse = message.content.some((b) => b.type === "tool_use");
    if (stop === "pause_turn") continue;
    // A refusal can cut a tool call off mid-input: never run that turn's tools.
    if (stop === "refusal") {
      run.stopReason = stop;
      run.error = "The model declined this request.";
      return;
    }
    if (stop === "max_tokens" && hasToolUse) {
      // The tool input was cut off. Tell the agent and let it retry in smaller pieces.
      const results = message.content
        .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
        .map((b) => ({
          type: "tool_result" as const,
          tool_use_id: b.id,
          content: "Your tool call was cut off by the output length limit and did not run. Split the content into smaller writes (Write a first part, then Edit to append).",
          is_error: true,
        }));
      const user: Anthropic.Beta.BetaMessageParam = { role: "user", content: results };
      run.messages.push(user);
      emit({ t: "message", message: user });
      continue;
    }
    if (stop !== "tool_use") {
      run.stopReason = stop ?? undefined;
      if (stop === "max_tokens") run.error = "The reply hit the length limit. Continue the thread to let it finish.";
      return;
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const block of message.content) {
      if (block.type !== "tool_use") continue;
      const [text, isError] = await executeTool(block.name, block.input, {
        root,
        onFile: (p, action) => {
          run.files.push({ path: p, action });
          emit({ t: "file", path: p, action });
        },
      });
      results.push({ type: "tool_result", tool_use_id: block.id, content: text, is_error: isError || undefined });
    }
    if (!results.length) return;
    const user: Anthropic.Beta.BetaMessageParam = { role: "user", content: results };
    run.messages.push(user);
    emit({ t: "message", message: user });
    await saveRun(run);
  }
  run.stopReason = "max_turns";
  run.error = `Stopped after ${MAX_TURNS} tool turns. Continue the thread to keep going.`;
}

export { newRunId };
