import "server-only";
import { Channel } from "./channels";
import { Episode, Stage, getPipeline, listEpisodes, currentStage } from "./pipeline";
import { isLive } from "./agents/runner";

export type ReviewItem = { episode: Episode; stage: Stage };

/** Episodes with the effective status of each stage (a "running" stage whose run is gone shows as pending). */
export async function loadBoard(channel: Channel) {
  const [stages, episodes] = await Promise.all([getPipeline(channel), listEpisodes(channel)]);
  for (const ep of episodes) {
    for (const s of stages) {
      const st = ep.stages[s.id];
      if (st?.status === "running") {
        const last = st.runIds[st.runIds.length - 1];
        if (!last || !isLive(last)) {
          st.status = "pending";
          st.note = st.note ?? "Run was interrupted.";
        }
      }
    }
  }
  const review: ReviewItem[] = [];
  for (const ep of episodes) {
    for (const s of stages) {
      if (ep.stages[s.id]?.status === "review") review.push({ episode: ep, stage: s });
    }
  }
  const active = episodes.filter((ep) => currentStage(stages, ep) !== null);
  const finished = episodes.filter((ep) => currentStage(stages, ep) === null);
  return { stages, episodes, review, active, finished };
}
