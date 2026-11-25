import Link from "next/link";
import { requireChannel } from "@/lib/channels";
import { listAgents } from "@/lib/agents/registry";
import { getPipeline } from "@/lib/pipeline";
import { Card, PageHeader } from "@/components/ui";
import { ArrowRight, Globe, FilePen } from "lucide-react";

export default async function AgentsPage({ params }: { params: Promise<{ channel: string }> }) {
  const { channel: slug } = await params;
  const channel = await requireChannel(slug);
  const [agents, stages] = await Promise.all([listAgents(channel), getPipeline(channel)]);

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Agents"
        subtitle="Run any agent on its own, or through an episode's pipeline. Agent files live in .claude/agents/."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {agents.map((a) => {
          const steps = stages.filter((s) => s.agent === a.name).map((s) => s.label);
          const web = a.tools.some((t) => t.startsWith("Web"));
          const writes = a.tools.includes("Write") || a.tools.includes("Edit");
          return (
            <Link key={a.name} href={`/c/${slug}/agents/${a.name}`} className="group">
              <Card className="h-full p-4 transition group-hover:border-fg/25">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{a.label}</div>
                    <div className="text-[12px] text-muted">{a.meta.role ?? a.name}</div>
                  </div>
                  <ArrowRight className="size-4 text-muted opacity-0 group-hover:opacity-100 transition" />
                </div>
                <p className="mt-3 text-[13px] leading-relaxed">{a.meta.purpose ?? a.description}</p>
                <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="rounded bg-subtle px-1.5 py-0.5 font-medium">{a.model}</span>
                  {web && (
                    <span className="inline-flex items-center gap-1 rounded bg-subtle px-1.5 py-0.5">
                      <Globe className="size-3" /> web
                    </span>
                  )}
                  {writes && (
                    <span className="inline-flex items-center gap-1 rounded bg-subtle px-1.5 py-0.5">
                      <FilePen className="size-3" /> writes files
                    </span>
                  )}
                  {a.source === "channel" && <span className="rounded bg-info/10 text-info px-1.5 py-0.5">custom for {channel.name}</span>}
                </div>
                {steps.length > 0 && <div className="mt-3 text-[12px] text-muted">Pipeline: {steps.join(", ")}</div>}
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
