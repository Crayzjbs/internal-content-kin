import Link from "next/link";
import { notFound } from "next/navigation";
import { requireChannel } from "@/lib/channels";
import { loadBoard } from "@/lib/overview";
import { currentStage, isStageReady, stageOutputs } from "@/lib/pipeline";
import { listAgents } from "@/lib/agents/registry";
import { listRuns } from "@/lib/agents/runs";
import { fmtCost, fmtWhen } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { StageCard } from "@/components/StageCard";
import { ChevronLeft } from "lucide-react";

export default async function EpisodePage({ params }: { params: Promise<{ channel: string; slug: string }> }) {
  const { channel: cs, slug } = await params;
  const channel = await requireChannel(cs);
  const [board, agents, runs] = await Promise.all([loadBoard(channel), listAgents(channel), listRuns(cs, { episode: slug })]);
  const ep = board.episodes.find((e) => e.slug === slug);
  if (!ep) notFound();
  const current = currentStage(board.stages, ep);
  const outputs = await Promise.all(board.stages.map((s) => stageOutputs(channel, ep, s)));
  const spent = runs.reduce((s, r) => s + r.costUsd, 0);
  const base = `/c/${cs}`;

  return (
    <div className="max-w-4xl">
      <Link href={`${base}/episodes`} className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg mb-3">
        <ChevronLeft className="size-4" /> Episodes
      </Link>
      <PageHeader
        title={ep.title}
        subtitle={
          <span>
            {ep.pillar && <>{ep.pillar} · </>}
            <code className="text-[12px]">episodes/{ep.slug}/</code> · {runs.length} runs · {fmtCost(spent)} · updated {fmtWhen(ep.updatedAt)}
          </span>
        }
      />
      {ep.notes && (
        <Card className="p-4 mb-6">
          <div className="text-[12px] font-medium text-muted mb-1">Notes</div>
          <p className="whitespace-pre-wrap">{ep.notes}</p>
        </Card>
      )}
      <ol className="space-y-3">
        {board.stages.map((s, i) => (
          <StageCard
            key={s.id}
            index={i + 1}
            channel={cs}
            episode={ep.slug}
            stage={s}
            state={ep.stages[s.id]}
            ready={isStageReady(board.stages, ep, s.id)}
            isCurrent={current?.id === s.id}
            agentLabel={agents.find((a) => a.name === s.agent)?.label ?? (s.agent === "human" ? "You and the team" : s.agent)}
            outputs={outputs[i]}
          />
        ))}
      </ol>
      {!current && (
        <Card className="mt-6 p-4 text-center text-ok font-medium">Every stage is approved. This episode is done.</Card>
      )}
    </div>
  );
}
