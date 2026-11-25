import Link from "next/link";
import { listChannels, requireChannel, isRootChannel } from "@/lib/channels";
import { listAgents } from "@/lib/agents/registry";
import { apiKeyPresent, mockMode } from "@/lib/agents/runner";
import { getPipeline } from "@/lib/pipeline";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { NewChannelForm } from "@/components/NewChannelForm";
import { CheckCircle2, XCircle } from "lucide-react";

export default async function SettingsPage({ params }: { params: Promise<{ channel: string }> }) {
  const { channel: cs } = await params;
  const channel = await requireChannel(cs);
  const [channels, agents, stages] = await Promise.all([listChannels(), listAgents(channel), getPipeline(channel)]);
  const key = apiKeyPresent();
  const mock = mockMode();

  return (
    <div className="max-w-4xl space-y-10">
      <PageHeader title="Settings" subtitle="Channels, agents and how the hub runs. Config lives in channels.json, agents.json and pipeline.json at the repo root." />

      <section>
        <SectionTitle>Environment</SectionTitle>
        <Card className="divide-y divide-line text-[13px]">
          <Row label="Claude API key">
            {key ? (
              <span className="inline-flex items-center gap-1 text-ok">
                <CheckCircle2 className="size-4" /> Set in hub/.env.local
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-warn">
                <XCircle className="size-4" /> Missing. Add ANTHROPIC_API_KEY to hub/.env.local and restart.
              </span>
            )}
          </Row>
          <Row label="Mock mode">{mock ? <span className="text-warn">On (HUB_MOCK_AGENTS=1): no API calls</span> : "Off"}</Row>
          <Row label="Max tool turns per run">{process.env.HUB_MAX_TURNS ?? "40"}</Row>
        </Card>
      </section>

      <section>
        <SectionTitle>Channels</SectionTitle>
        <Card className="divide-y divide-line text-[13px]">
          {channels.map((c) => (
            <div key={c.slug} className="flex items-center gap-3 px-4 py-3">
              <span className="size-2.5 rounded-full shrink-0" style={{ background: c.color }} />
              <div className="min-w-0 flex-1">
                <Link href={`/c/${c.slug}`} className="font-medium hover:underline">
                  {c.name}
                </Link>
                <div className="text-[12px] text-muted truncate">
                  {c.root === "." ? "repo root" : `${c.root}/`}
                  {c.youtubeHandle ? ` · ${c.youtubeHandle}` : ""}
                  {c.description ? ` · ${c.description}` : ""}
                </div>
              </div>
            </div>
          ))}
        </Card>
        <div id="new-channel" className="mt-4 scroll-mt-6">
          <NewChannelForm />
        </div>
      </section>

      <section>
        <SectionTitle>Agents for {channel.name}</SectionTitle>
        <Card className="divide-y divide-line text-[13px]">
          {agents.map((a) => (
            <div key={a.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
              <Link href={`/c/${cs}/agents/${a.name}`} className="font-medium hover:underline w-44">
                {a.label}
              </Link>
              <span className="text-muted">{a.model}</span>
              <span className="text-muted">effort {a.effort}</span>
              <span className="ml-auto text-[12px] text-muted">
                {a.source === "channel" ? "custom for this channel" : isRootChannel(channel) ? ".claude/agents" : "shared base agent"}
              </span>
            </div>
          ))}
        </Card>
        <p className="mt-2 text-[12px] text-muted">
          To add an agent, drop a new file in .claude/agents/ (same format as the others) and optionally describe it in agents.json. It shows up here automatically.
        </p>
      </section>

      <section>
        <SectionTitle>Pipeline for {channel.name}</SectionTitle>
        <Card className="p-4 text-[13px]">
          <ol className="flex flex-wrap items-center gap-2">
            {stages.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="rounded bg-subtle px-2 py-0.5">
                  {i + 1}. {s.label}
                  <span className="text-muted"> · {s.agent === "human" ? "you" : agents.find((a) => a.name === s.agent)?.label ?? s.agent}</span>
                </span>
                {i < stages.length - 1 && <span className="text-muted">→</span>}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[12px] text-muted">
            Edit pipeline.json at the repo root to change stages for every channel, or add a pipeline.json in a channel folder to override it for that channel.
          </p>
        </Card>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
      <span className="w-44 text-muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}
