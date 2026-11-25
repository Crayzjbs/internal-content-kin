import Link from "next/link";
import { requireChannel } from "@/lib/channels";
import { listRuns } from "@/lib/agents/runs";
import { isLive } from "@/lib/agents/runner";
import { listAgents } from "@/lib/agents/registry";
import { fmtCost, fmtTokens, fmtWhen } from "@/lib/format";
import { Badge, Card, Empty, PageHeader, cx } from "@/components/ui";

export default async function RunsPage({
  params,
  searchParams,
}: {
  params: Promise<{ channel: string }>;
  searchParams: Promise<{ agent?: string }>;
}) {
  const { channel: cs } = await params;
  const sp = await searchParams;
  const channel = await requireChannel(cs);
  const [runs, agents] = await Promise.all([listRuns(cs, { agent: sp.agent, limit: 200 }), listAgents(channel)]);
  const total = runs.reduce((s, r) => s + r.costUsd, 0);

  return (
    <div className="max-w-6xl">
      <PageHeader title="Runs" subtitle={`${runs.length} runs · ${fmtCost(total)} estimated. Transcripts are saved in .hub/runs/ (not committed).`} />
      <div className="mb-4 flex flex-wrap gap-1.5 text-[13px]">
        <FilterLink href={`/c/${cs}/runs`} active={!sp.agent}>
          All
        </FilterLink>
        {agents.map((a) => (
          <FilterLink key={a.name} href={`/c/${cs}/runs?agent=${a.name}`} active={sp.agent === a.name}>
            {a.label}
          </FilterLink>
        ))}
      </div>
      {runs.length === 0 ? (
        <Empty>No runs yet.</Empty>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-left text-[12px] text-muted border-b border-line">
              <tr>
                <th className="px-4 py-2 font-medium">Run</th>
                <th className="px-4 py-2 font-medium">Agent</th>
                <th className="px-4 py-2 font-medium">Episode</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="hidden xl:table-cell px-4 py-2 font-medium text-right">Tokens</th>
                <th className="px-4 py-2 font-medium text-right">Cost</th>
                <th className="px-4 py-2 font-medium text-right">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {runs.map((r) => {
                const status = r.status === "running" && !isLive(r.id) ? "stopped" : r.status;
                return (
                  <tr key={r.id} className="hover:bg-subtle/60">
                    <td className="px-4 py-2 max-w-[260px]">
                      <Link href={`/c/${cs}/agents/${r.agent}?run=${r.id}`} className="block truncate hover:underline">
                        {r.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{r.agentLabel}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {r.episode ? (
                        <Link href={`/c/${cs}/episodes/${r.episode}`} className="text-muted hover:text-fg">
                          {r.episode}
                        </Link>
                      ) : (
                        <span className="text-muted">·</span>
                      )}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <Badge status={status} />
                      {r.mock && <span className="ml-1 text-[11px] text-warn">mock</span>}
                    </td>
                    <td className="hidden xl:table-cell px-4 py-2 text-right text-muted whitespace-nowrap">
                      {fmtTokens(r.usage.input + r.usage.cacheRead + r.usage.cacheWrite)} / {fmtTokens(r.usage.output)}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">{fmtCost(r.costUsd)}</td>
                    <td className="px-4 py-2 text-right text-muted whitespace-nowrap">{fmtWhen(r.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={cx("rounded-full border px-2.5 py-0.5", active ? "border-fg bg-fg text-bg" : "border-line hover:bg-subtle")}>
      {children}
    </Link>
  );
}
