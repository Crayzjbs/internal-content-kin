"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ChevronDown, ChevronRight, FileText, Play, RotateCcw, SkipForward, MessageSquareWarning, User, ExternalLink } from "lucide-react";
import type { Stage, StageState } from "@/lib/pipeline";
import { api } from "@/lib/format";
import { Badge, Button, Card, cx, inputCls } from "./ui";
import { Markdown } from "./Markdown";

type Output = { path: string; exists: boolean; content: string };

export function StageCard({
  index,
  channel,
  episode,
  stage,
  state,
  ready,
  isCurrent,
  agentLabel,
  outputs,
}: {
  index: number;
  channel: string;
  episode: string;
  stage: Stage;
  state: StageState;
  ready: boolean;
  isCurrent: boolean;
  agentLabel: string;
  outputs: Output[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [changes, setChanges] = useState(false);
  const [note, setNote] = useState("");
  const [saveRule, setSaveRule] = useState(false);
  const [openFile, setOpenFile] = useState<string | null>(
    state.status === "review" ? outputs.find((o) => o.exists)?.path ?? null : null,
  );
  const human = stage.agent === "human";
  const lastRun = state.runIds[state.runIds.length - 1];
  const base = `/c/${channel}`;

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      const res = await api<{ runId?: string; ruleFile?: string }>("/api/episodes/stage", {
        body: { channel, slug: episode, stageId: stage.id, action, ...extra },
      });
      if (res.runId) {
        router.push(`${base}/agents/${stage.agent}?run=${res.runId}`);
        return;
      }
      router.refresh();
      setChanges(false);
      setNote("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const status = state.status;
  const done = status === "approved" || status === "skipped";

  return (
    <li id={stage.id} className="scroll-mt-6">
      <Card className={cx("p-4", isCurrent && "ring-1 ring-fg/15", done && "opacity-80")}>
        <div className="flex flex-wrap items-start gap-3">
          <div
            className={cx(
              "size-6 shrink-0 rounded-full grid place-items-center text-[11px] font-semibold",
              done ? "bg-ok/15 text-ok" : isCurrent ? "bg-fg text-bg" : "bg-subtle text-muted",
            )}
          >
            {done ? <Check className="size-3.5" /> : index}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{stage.label}</span>
              <Badge status={status} />
              {stage.optional && <span className="text-[11px] text-muted">optional</span>}
            </div>
            <div className="text-[12px] text-muted flex items-center gap-1 mt-0.5">
              {human ? <User className="size-3" /> : null}
              {human ? (
                agentLabel
              ) : (
                <Link href={`${base}/agents/${stage.agent}`} className="hover:text-fg underline-offset-2 hover:underline">
                  {agentLabel}
                </Link>
              )}
              {stage.description && <span>· {stage.description}</span>}
            </div>
            {state.note && <div className="text-[12px] text-warn mt-1">{state.note}</div>}
          </div>

          <div className="flex flex-wrap gap-2">
            {lastRun && !human && (
              <Link
                href={`${base}/agents/${stage.agent}?run=${lastRun}`}
                className="inline-flex items-center gap-1 h-8 px-2 text-[13px] text-muted hover:text-fg"
              >
                {status === "running" ? "Watch live" : "Open thread"} <ExternalLink className="size-3.5" />
              </Link>
            )}
            {!human && (status === "pending" || status === "changes") && (
              <Button variant={isCurrent ? "primary" : "secondary"} disabled={busy || !ready} onClick={() => act("run")} title={ready ? "" : "Approve the earlier stages first"}>
                <Play className="size-3.5" /> Run {agentLabel}
              </Button>
            )}
            {human && !done && (
              <Button variant={isCurrent ? "primary" : "secondary"} disabled={busy || !ready} onClick={() => act("approve")}>
                <Check className="size-3.5" /> Mark done
              </Button>
            )}
            {status === "review" && (
              <>
                <Button variant="primary" disabled={busy} onClick={() => act("approve")}>
                  <Check className="size-3.5" /> Approve
                </Button>
                <Button disabled={busy} onClick={() => setChanges((v) => !v)}>
                  <MessageSquareWarning className="size-3.5" /> Request changes
                </Button>
              </>
            )}
            {!done && status !== "running" && (stage.optional || status === "pending") && !(human && !ready) && (
              <Button variant="ghost" disabled={busy} onClick={() => act("skip")} title="Skip this stage">
                <SkipForward className="size-3.5" />
              </Button>
            )}
            {(done || status === "review") && (
              <Button variant="ghost" disabled={busy} onClick={() => act("reset")} title="Reopen this stage">
                <RotateCcw className="size-3.5" />
              </Button>
            )}
          </div>
        </div>

        {changes && (
          <div className="mt-3 sm:ml-9 space-y-2">
            <textarea
              autoFocus
              rows={3}
              className={inputCls}
              placeholder={`What should ${agentLabel} change?`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" disabled={busy || !note.trim()} onClick={() => act("request-changes", { note, saveRule })}>
                Send to {agentLabel}
              </Button>
              <label className="flex items-center gap-1.5 text-[13px] text-muted">
                <input type="checkbox" checked={saveRule} onChange={(e) => setSaveRule(e.target.checked)} />
                Also save as a rule in feedback/{stage.agent}-log.md
              </label>
            </div>
          </div>
        )}

        {error && <div className="mt-2 sm:ml-9 text-[13px] text-bad">{error}</div>}

        {outputs.length > 0 && (
          <div className="mt-3 sm:ml-9 space-y-1.5">
            {outputs.map((o) => (
              <div key={o.path}>
                <button
                  disabled={!o.exists}
                  onClick={() => setOpenFile(openFile === o.path ? null : o.path)}
                  className={cx("flex items-center gap-1.5 text-[13px]", o.exists ? "hover:text-fg" : "text-muted/60")}
                >
                  {o.exists ? (openFile === o.path ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />) : <FileText className="size-3.5" />}
                  <span className="font-mono text-[12px]">{o.path.split("/").pop()}</span>
                  {!o.exists && <span className="text-[12px]">not written yet</span>}
                </button>
                {openFile === o.path && (
                  <div className="mt-2 rounded-md border border-line bg-bg p-4 max-h-[60vh] overflow-y-auto">
                    <div className="flex justify-end -mt-1 mb-2">
                      <Link href={`${base}/files?path=${encodeURIComponent(o.path)}`} className="text-[12px] text-muted hover:text-fg">
                        Open in Files to edit
                      </Link>
                    </div>
                    <Markdown>{o.content || "_Empty file._"}</Markdown>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </li>
  );
}
