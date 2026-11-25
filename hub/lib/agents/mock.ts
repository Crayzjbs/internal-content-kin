import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { Channel } from "../channels";
import { channelRoot } from "../channels";
import type { Agent } from "./registry";
import type { Run } from "./runs";
import type { RunEvent } from "./runner";
import { executeTool } from "./tools";
import { getPipeline } from "../pipeline";
import { today } from "../fsutil";

/**
 * Scripted agent run for HUB_MOCK_AGENTS=1. No API calls, no cost.
 * It goes through the real tool executor, so file writes and the sandbox are exercised:
 * one read is deliberately outside the channel folder and must be rejected.
 */

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    });
  });

async function streamText(text: string, kind: "text" | "thinking", emit: (e: RunEvent) => void, signal: AbortSignal) {
  for (let i = 0; i < text.length; i += 12) {
    emit({ t: kind, d: text.slice(i, i + 12) });
    await sleep(15, signal);
  }
}

export async function runMock(run: Run, channel: Channel, agent: Agent, emit: (e: RunEvent) => void, signal: AbortSignal) {
  const root = channelRoot(channel);
  let target = `strategy/mock-${agent.name}-${today()}.md`;
  if (run.episode && run.stageId) {
    const stage = (await getPipeline(channel)).find((s) => s.id === run.stageId);
    if (stage?.outputs?.[0]) target = `episodes/${run.episode}/${stage.outputs[0]}`;
  }
  const turnNo = run.messages.filter((m) => m.role === "assistant").length;

  const turns: { thinking: string; text: string; tools: { name: string; input: Record<string, unknown> }[] }[] = [
    {
      thinking: `Mock run for ${agent.label}. First I read the channel rules and my feedback log.`,
      text: "Reading the channel rules and my feedback log first.",
      tools: [
        { name: "Read", input: { file_path: "CLAUDE.md", limit: 20 } },
        { name: "Read", input: { file_path: `feedback/${agent.name}-log.md` } },
        { name: "Read", input: { file_path: "../outside-the-channel.txt" } },
      ],
    },
    {
      thinking: "The sandbox rejected the path outside the channel, as expected. Now I write the deliverable.",
      text: `Writing the draft to ${target}.`,
      tools: [
        {
          name: "Write",
          input: {
            file_path: target,
            content: `# MOCK OUTPUT: ${agent.label}\n\nThis file was written by a mock run (HUB_MOCK_AGENTS=1). No API was called.\n\n- Channel: ${channel.name}\n- Episode: ${run.episode ?? "none"}\n- Stage: ${run.stageId ?? "none"}\n- Date: ${today()}\n- Turn: ${turnNo + 2}\n\n## Request\n${lastUserText(run)}\n\nHANDOFF\n- Done: mock output saved to ${target}\n- Open: none, this is a test\n- Next: Justine reviews in the hub\n`,
          },
        },
      ],
    },
    {
      thinking: "Done. Summarize with a HANDOFF block.",
      text: `Mock run finished. I saved the draft to ${target}.\n\nHANDOFF\n- Done: ${target}\n- Open: nothing, this was a mock run\n- Next: Justine reviews and approves in the hub`,
      tools: [],
    },
  ];

  for (const turn of turns) {
    await streamText(turn.thinking, "thinking", emit, signal);
    await streamText(turn.text, "text", emit, signal);
    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      { type: "thinking", thinking: turn.thinking, signature: "mock" },
      { type: "text", text: turn.text },
    ];
    const ids: string[] = [];
    for (const tool of turn.tools) {
      const id = `toolu_mock_${Math.random().toString(36).slice(2, 10)}`;
      ids.push(id);
      emit({ t: "block", kind: "tool_use", name: tool.name });
      content.push({ type: "tool_use", id, name: tool.name, input: tool.input });
    }
    const assistant: Anthropic.Beta.BetaMessageParam = { role: "assistant", content };
    run.messages.push(assistant);
    emit({ t: "message", message: assistant });
    run.usage.input += 1200;
    run.usage.output += 300;
    emit({ t: "usage", usage: run.usage, costUsd: run.costUsd });
    if (!turn.tools.length) break;

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (let i = 0; i < turn.tools.length; i++) {
      const [text, isError] = await executeTool(turn.tools[i].name, turn.tools[i].input, {
        root,
        onFile: (p, action) => {
          run.files.push({ path: p, action });
          emit({ t: "file", path: p, action });
        },
      });
      results.push({ type: "tool_result", tool_use_id: ids[i], content: text, is_error: isError || undefined });
    }
    const user: Anthropic.Beta.BetaMessageParam = { role: "user", content: results };
    run.messages.push(user);
    emit({ t: "message", message: user });
    await sleep(150, signal);
  }
  run.stopReason = "end_turn";
}

function lastUserText(run: Run): string {
  for (let i = run.messages.length - 1; i >= 0; i--) {
    const m = run.messages[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    const t = m.content.find((b) => b.type === "text");
    if (t && "text" in t) return t.text;
  }
  return "";
}
