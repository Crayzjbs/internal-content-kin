import "server-only";
import { loadRun, Run } from "./agents/runs";
import { isLive } from "./agents/runner";

export type RunView = Run & { live: boolean };

/** A run as the UI sees it. A "running" run with no live process was interrupted (e.g. hub restarted). */
export async function getRunView(channel: string, id: string): Promise<RunView | null> {
  const run = await loadRun(channel, id);
  if (!run) return null;
  const live = isLive(run.id);
  if (run.status === "running" && !live) {
    run.status = "stopped";
    run.error = run.error ?? "Interrupted (the hub was restarted). Continue the thread to resume.";
  }
  return { ...run, live };
}
