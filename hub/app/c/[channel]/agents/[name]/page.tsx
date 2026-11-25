import Link from "next/link";
import { notFound } from "next/navigation";
import { requireChannel, isRootChannel } from "@/lib/channels";
import { getAgent } from "@/lib/agents/registry";
import { listRuns } from "@/lib/agents/runs";
import { getPipeline, listEpisodes } from "@/lib/pipeline";
import { getRunView } from "@/lib/views";
import { apiKeyPresent, mockMode } from "@/lib/agents/runner";
import { Console } from "@/components/Console";
import { CustomizeAgentButton } from "@/components/CustomizeAgentButton";
import { ChevronLeft } from "lucide-react";

export default async function AgentPage({
  params,
  searchParams,
}: {
  params: Promise<{ channel: string; name: string }>;
  searchParams: Promise<{ run?: string; episode?: string }>;
}) {
  const { channel: cs, name } = await params;
  const sp = await searchParams;
  const channel = await requireChannel(cs);
  const agent = await getAgent(channel, name);
  if (!agent) notFound();
  const [threads, episodes, stages] = await Promise.all([
    listRuns(cs, { agent: name, limit: 30 }),
    listEpisodes(channel),
    getPipeline(channel),
  ]);
  const run = sp.run ? await getRunView(cs, sp.run) : null;
  const steps = stages.map((s, i) => ({ ...s, n: i + 1 })).filter((s) => s.agent === name);
  const fileHref = (p: string) => `/c/${cs}/files?path=${encodeURIComponent(p)}`;
  const agentFile = `.claude/agents/${agent.name}.md`;

  return (
    <div className="max-w-7xl">
      <Link href={`/c/${cs}/agents`} className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg mb-3">
        <ChevronLeft className="size-4" /> Agents
      </Link>
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="order-last lg:order-none space-y-5 min-w-0 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto pr-1">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{agent.label}</h1>
            <div className="text-muted text-[13px]">{agent.meta.role}</div>
            <p className="mt-3 text-[13px] leading-relaxed">{agent.meta.purpose ?? agent.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
              <span className="rounded bg-subtle px-1.5 py-0.5 font-medium">{agent.model}</span>
              <span className="rounded bg-subtle px-1.5 py-0.5">effort {agent.effort}</span>
              {agent.tools.map((t) => (
                <span key={t} className="rounded bg-subtle px-1.5 py-0.5 text-muted">
                  {t}
                </span>
              ))}
            </div>
          </div>

          {agent.meta.capabilities?.length ? (
            <Info title="Capabilities">
              <ul className="space-y-1">
                {agent.meta.capabilities.map((c) => (
                  <li key={c} className="flex gap-2">
                    <span className="text-muted">·</span>
                    {c}
                  </li>
                ))}
              </ul>
            </Info>
          ) : null}
          {agent.meta.inputs?.length ? (
            <Info title="Inputs">
              <ul className="space-y-1">{agent.meta.inputs.map((c) => <li key={c}>{c}</li>)}</ul>
            </Info>
          ) : null}
          {agent.meta.outputs?.length ? (
            <Info title="Outputs">
              <ul className="space-y-1 font-mono text-[12px]">{agent.meta.outputs.map((c) => <li key={c}>{c}</li>)}</ul>
            </Info>
          ) : null}
          <Info title="Workflow">
            {steps.length ? (
              <ul className="space-y-1">
                {steps.map((s) => (
                  <li key={s.id}>
                    Stage {s.n} of {stages.length}: {s.label}
                    {s.optional ? " (optional)" : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-muted">Not part of the pipeline. Run it on its own.</span>
            )}
          </Info>
          <Info title="Definition">
            <div className="space-y-1">
              {isRootChannel(channel) || agent.source === "channel" ? (
                <Link className="block underline-offset-2 hover:underline font-mono text-[12px]" href={fileHref(agentFile)}>
                  {agentFile}
                </Link>
              ) : (
                <div className="text-[12px] text-muted">Shared base agent from the repo&apos;s .claude/agents/.</div>
              )}
              <Link className="block underline-offset-2 hover:underline font-mono text-[12px]" href={fileHref(`feedback/${agent.name}-log.md`)}>
                feedback/{agent.name}-log.md
              </Link>
              {!isRootChannel(channel) && agent.source === "base" && <CustomizeAgentButton channel={cs} name={agent.name} />}
              {agent.source === "channel" && <div className="text-[12px] text-info">Using this channel&apos;s own version.</div>}
            </div>
          </Info>
        </aside>

        <Console
          key={run?.id ?? "new"}
          channel={cs}
          agent={{ name: agent.name, label: agent.label, quickActions: agent.meta.quickActions ?? [] }}
          episodes={episodes.map((e) => ({ slug: e.slug, title: e.title }))}
          threads={threads.map((t) => ({ id: t.id, title: t.title, updatedAt: t.updatedAt, status: t.status, costUsd: t.costUsd, episode: t.episode }))}
          initialRun={run}
          initialEpisode={sp.episode}
          canRun={mockMode() || apiKeyPresent()}
          mock={mockMode()}
        />
      </div>
    </div>
  );
}

function Info({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="text-[13px]">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5">{title}</h2>
      {children}
    </section>
  );
}
