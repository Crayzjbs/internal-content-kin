import Link from "next/link";
import { requireChannel } from "@/lib/channels";
import { loadBoard } from "@/lib/overview";
import { fmtWhen } from "@/lib/format";
import { Card, Empty, LinkButton, PageHeader, SectionTitle } from "@/components/ui";
import { StageChips } from "@/components/StageChips";
import { NewEpisodeForm } from "@/components/NewEpisodeForm";
import { Plus } from "lucide-react";

export default async function Episodes({
  params,
  searchParams,
}: {
  params: Promise<{ channel: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { channel: slug } = await params;
  const sp = await searchParams;
  const channel = await requireChannel(slug);
  const board = await loadBoard(channel);
  const base = `/c/${slug}`;

  const list = (title: string, eps: typeof board.episodes) =>
    eps.length > 0 && (
      <section className="mb-8">
        <SectionTitle>{title}</SectionTitle>
        <Card className="divide-y divide-line">
          {eps.map((ep) => (
            <Link key={ep.slug} href={`${base}/episodes/${ep.slug}`} className="block px-4 py-3 hover:bg-subtle/60">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-medium">{ep.title}</span>
                  {ep.pillar && <span className="ml-2 text-[12px] text-muted">{ep.pillar}</span>}
                </div>
                <span className="text-[12px] text-muted shrink-0">{fmtWhen(ep.updatedAt)}</span>
              </div>
              <StageChips stages={board.stages} episode={ep} />
            </Link>
          ))}
        </Card>
      </section>
    );

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Episodes"
        subtitle={`Each episode moves through ${board.stages.length} stages. Files live in episodes/<slug>/.`}
        actions={
          !sp.new && (
            <LinkButton href={`${base}/episodes?new=1`} variant="primary">
              <Plus className="size-4" /> New episode
            </LinkButton>
          )
        }
      />
      {sp.new && <NewEpisodeForm channel={slug} pillars={channel.pillars ?? []} />}
      {board.episodes.length === 0 && !sp.new && <Empty>No episodes yet.</Empty>}
      {list("In progress", board.active)}
      {list("Finished", board.finished)}
    </div>
  );
}
