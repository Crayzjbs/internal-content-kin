import type { Episode, Stage } from "@/lib/pipeline";
import { cx } from "./ui";

const dot: Record<string, string> = {
  pending: "bg-line",
  running: "bg-info animate-pulse",
  review: "bg-warn",
  changes: "bg-warn",
  approved: "bg-ok",
  skipped: "bg-muted/40",
};

/** Compact pipeline progress: one segment per stage. */
export function StageChips({ stages, episode }: { stages: Stage[]; episode: Episode }) {
  const current = stages.find((s) => !["approved", "skipped"].includes(episode.stages[s.id]?.status));
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {stages.map((s) => {
          const st = episode.stages[s.id]?.status ?? "pending";
          return <span key={s.id} title={`${s.label}: ${st}`} className={cx("h-1.5 flex-1 rounded-full", dot[st] ?? "bg-line")} />;
        })}
      </div>
      <span className="text-[12px] text-muted shrink-0 w-28 text-right truncate">
        {current ? `${current.label}: ${episode.stages[current.id]?.status === "review" ? "review" : episode.stages[current.id]?.status}` : "Done"}
      </span>
    </div>
  );
}
