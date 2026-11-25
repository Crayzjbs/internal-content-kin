import Link from "next/link";
import { requireChannel } from "@/lib/channels";
import { listAgents } from "@/lib/agents/registry";
import { listRuns } from "@/lib/agents/runs";
import { apiKeyPresent, mockMode } from "@/lib/agents/runner";
import { loadBoard } from "@/lib/overview";
import { fmtCost, fmtWhen } from "@/lib/format";
import { Badge, Card, Empty, LinkButton, PageHeader, SectionTitle } from "@/components/ui";
import { StageChips } from "@/components/StageChips";
import { ArrowRight, KeyRound, Plus } from "lucide-react";

export default async function Overview({ params }: { params: Promise<{ channel: string }> }) {
  const { channel: slug } = await params;
  const channel = await requireChannel(slug);
  const [board, agents, runs] = await Promise.all([loadBoard(channel), listAgents(channel), listRuns(slug, { limit: 8 })]);
  const base = `/c/${slug}`;
  const spend30 = (await listRuns(slug))
    .filter((r) => Date.now() - new Date(r.createdAt).getTime() < 30 * 86400_000)
    .reduce((s, r) => s + r.costUsd, 0);

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={channel.name}
        subtitle={channel.description || "Channel overview"}
        actions={
          <LinkButton href={`${base}/episodes?new=1`} variant="primary">
            <Plus className="size-4" /> New episode
          </LinkButton>
        }
      />

      {!apiKeyPresent() && !mockMode() && (
        <Card className="mb-6 flex items-start gap-3 p-4 border-warn/40">
          <KeyRound className="size-4 mt-0.5 text-warn shrink-0" />
          <div>
            <div className="font-medium">Add your Claude API key to run agents</div>
            <p className="text-muted">
              Copy <code>hub/.env.example</code> to <code>hub/.env.local</code>, set <code>ANTHROPIC_API_KEY</code>, then restart the hub. Everything else works without it.
            </p>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-4 mb-8">
        <Stat label="Waiting for you" value={board.review.length} tone={board.review.length ? "warn" : undefined} />
        <Stat label="Episodes in progress" value={board.active.length} />
        <Stat label="Finished episodes" value={board.finished.length} />
        <Stat label="Agent spend, 30 days" value={fmtCost(spend30)} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-8 min-w-0">
          <section>
            <SectionTitle>Waiting for your review</SectionTitle>
            {board.review.length === 0 ? (
              <Empty>Nothing to review.</Empty>
            ) : (
              <Card className="divide-y divide-line">
                {board.review.map(({ episode, stage }) => (
                  <Link
                    key={episode.slug + stage.id}
                    href={`${base}/episodes/${episode.slug}#${stage.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-subtle/60"
                  >
                    <Badge status="review" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{episode.title}</div>
                      <div className="text-muted text-[12px]">
                        {stage.label} by {agents.find((a) => a.name === stage.agent)?.label ?? stage.agent}
                      </div>
                    </div>
                    <ArrowRight className="size-4 text-muted" />
                  </Link>
                ))}
              </Card>
            )}
          </section>

          <section>
            <SectionTitle right={<Link href={`${base}/episodes`} className="text-[12px] text-muted hover:text-fg">All episodes</Link>}>
              In progress
            </SectionTitle>
            {board.active.length === 0 ? (
              <Empty>
                No episodes yet. <Link className="underline" href={`${base}/episodes?new=1`}>Create one</Link> to start the pipeline.
              </Empty>
            ) : (
              <Card className="divide-y divide-line">
                {board.active.slice(0, 8).map((ep) => (
                  <Link key={ep.slug} href={`${base}/episodes/${ep.slug}`} className="block px-4 py-3 hover:bg-subtle/60">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium truncate">{ep.title}</span>
                      <span className="text-[12px] text-muted shrink-0">{fmtWhen(ep.updatedAt)}</span>
                    </div>
                    <StageChips stages={board.stages} episode={ep} />
                  </Link>
                ))}
              </Card>
            )}
          </section>
        </div>

        <div className="space-y-8">
          <section>
            <SectionTitle>Agents</SectionTitle>
            <Card className="divide-y divide-line">
              {agents.map((a) => (
                <Link key={a.name} href={`${base}/agents/${a.name}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-subtle/60">
                  <span className="font-medium">{a.label}</span>
                  <span className="text-[12px] text-muted">{a.modelAlias}</span>
                </Link>
              ))}
            </Card>
          </section>
          <section>
            <SectionTitle right={<Link href={`${base}/runs`} className="text-[12px] text-muted hover:text-fg">All runs</Link>}>
              Recent runs
            </SectionTitle>
            {runs.length === 0 ? (
              <Empty>No runs yet.</Empty>
            ) : (
              <Card className="divide-y divide-line">
                {runs.map((r) => (
                  <Link key={r.id} href={`${base}/agents/${r.agent}?run=${r.id}`} className="block px-4 py-2.5 hover:bg-subtle/60">
                    <div className="truncate">{r.title}</div>
                    <div className="flex items-center gap-2 text-[12px] text-muted mt-0.5">
                      <span>{r.agentLabel}</span>·<span>{fmtWhen(r.updatedAt)}</span>·<span>{fmtCost(r.costUsd)}</span>
                      <Badge status={r.status} className="ml-auto" />
                    </div>
                  </Link>
                ))}
              </Card>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "warn" }) {
  return (
    <Card className="px-4 py-3">
      <div className="text-[12px] text-muted">{label}</div>
      <div className={`text-2xl font-semibold tracking-tight ${tone === "warn" ? "text-warn" : ""}`}>{value}</div>
    </Card>
  );
}
