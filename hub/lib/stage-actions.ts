import "server-only";
import { requireChannel } from "./channels";
import { getEpisode, getPipeline, updateStage, fillPrompt, isStageReady } from "./pipeline";
import { startRun, isLive } from "./agents/runner";
import { appendFeedbackRule } from "./files";

export type StageAction = "run" | "approve" | "skip" | "reset" | "request-changes";

export async function stageAction(input: {
  channel: string;
  slug: string;
  stageId: string;
  action: StageAction;
  note?: string;
  saveRule?: boolean;
}): Promise<{ runId?: string; ruleFile?: string }> {
  const channel = await requireChannel(input.channel);
  const ep = await getEpisode(channel, input.slug);
  if (!ep) throw new Error("Episode not found.");
  const stages = await getPipeline(channel);
  const stage = stages.find((s) => s.id === input.stageId);
  if (!stage) throw new Error("Unknown stage.");
  const state = ep.stages[stage.id];
  const lastRun = state.runIds[state.runIds.length - 1];
  if (lastRun && isLive(lastRun) && input.action !== "reset") throw new Error("This stage is running. Stop the run first.");

  switch (input.action) {
    case "approve":
      await updateStage(channel, ep.slug, stage.id, { status: "approved", note: input.note || undefined });
      return {};
    case "skip":
      await updateStage(channel, ep.slug, stage.id, { status: "skipped", note: input.note || undefined });
      return {};
    case "reset":
      await updateStage(channel, ep.slug, stage.id, { status: "pending", note: undefined });
      return {};
    case "run": {
      if (stage.agent === "human") throw new Error("This is a manual step. Mark it done when it is finished.");
      if (!isStageReady(stages, ep, stage.id)) throw new Error("Approve the earlier stages first.");
      const prompt = fillPrompt(stage.prompt ?? `Work on stage "${stage.label}" for episode {slug}.`, ep);
      const runId = await startRun({ channel: channel.slug, agent: stage.agent, prompt, episode: ep.slug, stageId: stage.id });
      return { runId };
    }
    case "request-changes": {
      if (stage.agent === "human") throw new Error("Manual steps have no agent to send changes to.");
      const note = input.note?.trim();
      if (!note) throw new Error("Write what should change.");
      let ruleFile: string | undefined;
      if (input.saveRule) ruleFile = await appendFeedbackRule(channel, stage.agent, note, `${ep.slug}, ${stage.label}`);
      const outputs = (stage.outputs ?? []).map((o) => `episodes/${ep.slug}/${o}`).join(", ");
      const prompt = `Justine reviewed your work and requested changes:\n\n${note}\n\nUpdate ${outputs || "your output"} accordingly and summarize what you changed.${ruleFile ? ` This was also saved as a rule in ${ruleFile}.` : ""}`;
      const runId = await startRun({
        channel: channel.slug,
        agent: stage.agent,
        prompt,
        runId: lastRun,
        episode: ep.slug,
        stageId: stage.id,
      });
      return { runId, ruleFile };
    }
  }
}
