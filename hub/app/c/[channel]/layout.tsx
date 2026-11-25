import { notFound } from "next/navigation";
import { getChannel, listChannels } from "@/lib/channels";
import { listAgents } from "@/lib/agents/registry";
import { mockMode } from "@/lib/agents/runner";
import { loadBoard } from "@/lib/overview";
import { Sidebar } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function ChannelLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ channel: string }>;
}) {
  const { channel: slug } = await params;
  const channel = await getChannel(slug);
  if (!channel) notFound();
  const [channels, agents, board] = await Promise.all([listChannels(), listAgents(channel), loadBoard(channel)]);
  return (
    <div className="md:flex min-h-screen" style={{ ["--accent" as string]: channel.color || undefined }}>
      <Sidebar
        channels={channels.map((c) => ({ slug: c.slug, name: c.name, color: c.color }))}
        current={channel.slug}
        agents={agents.map((a) => ({ name: a.name, label: a.label }))}
        mock={mockMode()}
        reviewCount={board.review.length}
      />
      <main className="flex-1 min-w-0 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
