"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Anthropic from "@anthropic-ai/sdk";
import { ArrowUp, Brain, ChevronDown, ChevronRight, FilePen, FileSearch, FileText, Globe, History, Plus, Square, Search, AlertTriangle, Sparkles } from "lucide-react";
import type { RunView } from "@/lib/views";
import type { RunEvent } from "@/lib/agents/runner";
import { api, fmtCost, fmtTokens, fmtWhen } from "@/lib/format";
import { Badge, Button, Card, cx, inputCls } from "./ui";
import { Markdown } from "./Markdown";

type Msg = Anthropic.Beta.BetaMessageParam;
type Block = Anthropic.Beta.BetaContentBlockParam;
type Thread = { id: string; title: string; updatedAt: string; status: string; costUsd: number; episode?: string };

type Props = {
  channel: string;
  agent: { name: string; label: string; quickActions: { label: string; prompt: string }[] };
  episodes: { slug: string; title: string }[];
  threads: Thread[];
  initialRun: RunView | null;
  initialEpisode?: string;
  canRun: boolean;
  mock: boolean;
};

export function Console({ channel, agent, episodes, threads, initialRun, initialEpisode, canRun, mock }: Props) {
  const router = useRouter();
  const [run, setRun] = useState<RunView | null>(initialRun);
  const [messages, setMessages] = useState<Msg[]>(initialRun?.messages ?? []);
  const [live, setLive] = useState(initialRun?.live ?? false);
  const [partial, setPartial] = useState({ thinking: "", text: "", activity: "" });
  const [files, setFiles] = useState<RunView["files"]>(initialRun?.files ?? []);
  const [usage, setUsage] = useState({ usage: initialRun?.usage, cost: initialRun?.costUsd ?? 0 });
  const [input, setInput] = useState("");
  const [episode, setEpisode] = useState(initialEpisode ?? initialRun?.episode ?? "");
  const [error, setError] = useState(initialRun?.status === "error" || initialRun?.status === "stopped" ? initialRun?.error ?? "" : "");
  const [busy, setBusy] = useState(false);
  const [showThreads, setShowThreads] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const savedRef = useRef<Msg[]>(initialRun?.messages ?? []);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const base = `/c/${channel}`;

  const refetch = useCallback(
    async (id: string) => {
      try {
        const { run: r } = await api<{ run: RunView }>(`/api/runs/${id}?channel=${channel}`);
        setRun(r);
        setMessages(r.messages);
        savedRef.current = r.messages;
        setFiles(r.files);
        setUsage({ usage: r.usage, cost: r.costUsd });
        setLive(r.live);
        if (r.status === "error" || r.status === "stopped") setError(r.error ?? "");
      } catch {}
    },
    [channel],
  );

  const connect = useCallback(
    (id: string) => {
      esRef.current?.close();
      const es = new EventSource(`/api/runs/${id}/stream`);
      esRef.current = es;
      setLive(true);
      es.onmessage = (ev) => {
        const e = JSON.parse(ev.data) as RunEvent | { t: "gone" };
        switch (e.t) {
          case "status":
            // Events replay from the start of this live session: line up with the saved messages.
            setMessages(savedRef.current.slice(0, e.base));
            break;
          case "text":
            setPartial((p) => ({ ...p, text: p.text + e.d, activity: "" }));
            break;
          case "thinking":
            setPartial((p) => ({ ...p, thinking: p.thinking + e.d }));
            break;
          case "block":
            setPartial((p) => ({ ...p, activity: e.name ? `Using ${toolLabel(e.name)}…` : "Working…" }));
            break;
          case "message":
            setMessages((m) => [...m, e.message]);
            setPartial({ thinking: "", text: "", activity: e.message.role === "user" ? "Thinking…" : "" });
            break;
          case "file":
            setFiles((f) => [...f, { path: e.path, action: e.action }]);
            break;
          case "usage":
            setUsage({ usage: e.usage, cost: e.costUsd });
            break;
          case "done":
          case "gone":
            es.close();
            setLive(false);
            setPartial({ thinking: "", text: "", activity: "" });
            void refetch(id).then(() => router.refresh());
            break;
        }
      };
      es.onerror = () => {
        es.close();
        setLive(false);
        void refetch(id);
      };
    },
    [refetch, router],
  );

  useEffect(() => {
    if (initialRun?.live) connect(initialRun.id);
    return () => esRef.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, partial.text.length > 0, live]);

  async function send() {
    const text = input.trim();
    if (!text || busy || live) return;
    setBusy(true);
    setError("");
    try {
      const { runId } = await api<{ runId: string }>("/api/runs", {
        body: { channel, agent: agent.name, prompt: text, runId: run?.id, episode: run ? undefined : episode || undefined },
      });
      setInput("");
      if (!run) {
        window.history.replaceState(null, "", `${base}/agents/${agent.name}?run=${runId}`);
        setRun({ id: runId, title: text.split(/\n/)[0].slice(0, 90), status: "running" } as RunView);
      }
      const userMsg: Msg = { role: "user", content: text };
      savedRef.current = [...messages, userMsg];
      setMessages(savedRef.current);
      setPartial({ thinking: "", text: "", activity: "Starting…" });
      connect(runId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (run?.id) await api(`/api/runs/${run.id}/stop`, { body: {} }).catch(() => {});
  }

  const results = useMemo(() => {
    const map = new Map<string, { text: string; error: boolean }>();
    for (const m of messages) {
      if (m.role !== "user" || typeof m.content === "string") continue;
      for (const b of m.content) {
        if (b.type === "tool_result") {
          const text = typeof b.content === "string" ? b.content : (b.content ?? []).map((c) => ("text" in c ? c.text : "")).join("\n");
          map.set(b.tool_use_id, { text, error: !!b.is_error });
        }
      }
    }
    return map;
  }, [messages]);

  const empty = messages.length === 0 && !live;
  const fileHref = (p: string) => `${base}/files?path=${encodeURIComponent(p)}`;
  const uniqueFiles = [...new Map(files.map((f) => [f.path, f])).values()];

  return (
    <Card className="flex min-h-[70vh] flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-line px-4 h-12">
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <span className="truncate font-medium">{run?.title || (run ? "Thread" : `New thread with ${agent.label}`)}</span>
          {run?.status && <Badge status={live ? "running" : run.status} />}
          {run?.episode && (
            <Link href={`${base}/episodes/${run.episode}`} className="hidden sm:inline text-[12px] text-muted hover:text-fg truncate">
              {run.episode}
            </Link>
          )}
        </div>
        {usage.usage && (usage.usage.input > 0 || usage.cost > 0) && (
          <span className="hidden xl:inline text-[12px] text-muted whitespace-nowrap" title="Input / output tokens, estimated cost">
            {fmtTokens(usage.usage.input + usage.usage.cacheRead + usage.usage.cacheWrite)} in · {fmtTokens(usage.usage.output)} out · {fmtCost(usage.cost)}
          </span>
        )}
        <div className="relative">
          <Button variant="ghost" onClick={() => setShowThreads((v) => !v)} title="Past threads">
            <History className="size-4" />
          </Button>
          {showThreads && (
            <div className="absolute right-0 top-9 z-20 w-80 max-h-96 overflow-y-auto rounded-lg border border-line bg-panel shadow-lg">
              {threads.length === 0 && <div className="p-4 text-muted text-[13px]">No threads yet.</div>}
              {threads.map((t) => (
                <Link
                  key={t.id}
                  href={`${base}/agents/${agent.name}?run=${t.id}`}
                  onClick={() => setShowThreads(false)}
                  className={cx("block px-3 py-2 hover:bg-subtle border-b border-line last:border-0", t.id === run?.id && "bg-subtle")}
                >
                  <div className="truncate text-[13px]">{t.title}</div>
                  <div className="flex items-center gap-2 text-[11px] text-muted">
                    {fmtWhen(t.updatedAt)} · {fmtCost(t.costUsd)}
                    {t.episode && <span className="truncate">· {t.episode}</span>}
                    <Badge status={t.status} className="ml-auto" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
        {run && (
          <Link href={`${base}/agents/${agent.name}`} className="inline-flex items-center gap-1 h-8 px-2 rounded-md text-[13px] hover:bg-subtle">
            <Plus className="size-4" /> New
          </Link>
        )}
      </div>

      {/* Transcript */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {empty && (
          <div className="max-w-lg mx-auto text-center pt-10">
            <Sparkles className="size-6 mx-auto text-muted" />
            <p className="mt-3 font-medium">Ask {agent.label} for something</p>
            <p className="text-muted text-[13px] mt-1">
              It reads the channel&apos;s CLAUDE.md, bible and feedback log, and saves its work as files you can review.
              {!canRun && " Add ANTHROPIC_API_KEY to hub/.env.local to run agents."}
            </p>
            {agent.quickActions.length > 0 && (
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {agent.quickActions.map((q) => (
                  <button
                    key={q.label}
                    onClick={() => setInput(q.prompt)}
                    className="rounded-full border border-line px-3 py-1 text-[13px] hover:bg-subtle"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((m, i) => (
          <MessageView key={i} msg={m} results={results} fileHref={fileHref} />
        ))}

        {live && (
          <div className="space-y-3">
            {partial.thinking && <Thinking text={partial.thinking} live />}
            {partial.text && <Markdown>{partial.text}</Markdown>}
            <div className="flex items-center gap-2 text-[13px] text-muted">
              <span className="size-1.5 rounded-full bg-info animate-pulse" />
              {partial.activity || (partial.text ? "Writing…" : "Thinking…")}
            </div>
          </div>
        )}

        {error && !live && (
          <div className="flex items-start gap-2 rounded-md bg-bad/10 text-bad px-3 py-2 text-[13px]">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {uniqueFiles.length > 0 && (
        <div className="border-t border-line px-4 py-2 flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-muted">Files changed:</span>
          {uniqueFiles.map((f) => (
            <Link key={f.path} href={fileHref(f.path)} className="inline-flex items-center gap-1 rounded bg-subtle px-1.5 py-0.5 font-mono hover:bg-line">
              <FilePen className="size-3" /> {f.path}
            </Link>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="border-t border-line p-3">
        {!run && episodes.length > 0 && (
          <div className="mb-2 flex items-center gap-2 text-[12px]">
            <span className="text-muted">Episode</span>
            <select value={episode} onChange={(e) => setEpisode(e.target.value)} className="rounded border border-line bg-panel px-1.5 py-0.5">
              <option value="">None</option>
              {episodes.map((e) => (
                <option key={e.slug} value={e.slug}>
                  {e.title}
                </option>
              ))}
            </select>
          </div>
        )}
        {run && !empty && agent.quickActions.length > 0 && !input && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {agent.quickActions.map((q) => (
              <button key={q.label} onClick={() => setInput(q.prompt)} className="rounded-full border border-line px-2.5 py-0.5 text-[12px] text-muted hover:bg-subtle">
                {q.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void send();
              }
            }}
            rows={Math.min(8, Math.max(2, input.split("\n").length))}
            placeholder={live ? `${agent.label} is working…` : run ? "Reply or ask for changes (Ctrl+Enter to send)" : `Message ${agent.label} (Ctrl+Enter to send)`}
            disabled={!canRun}
            className={cx(inputCls, "resize-none")}
          />
          {live ? (
            <Button onClick={stop} title="Stop the run">
              <Square className="size-3.5" /> Stop
            </Button>
          ) : (
            <Button variant="primary" onClick={send} disabled={busy || !input.trim() || !canRun} title="Send (Ctrl+Enter)">
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>
        {mock && <div className="mt-1.5 text-[11px] text-warn">Mock mode: runs are scripted, no API calls or cost.</div>}
      </div>
    </Card>
  );
}

function toolLabel(name: string) {
  return name === "web_search" ? "web search" : name === "web_fetch" ? "web fetch" : name;
}

function MessageView({ msg, results, fileHref }: { msg: Msg; results: Map<string, { text: string; error: boolean }>; fileHref: (p: string) => string }) {
  if (msg.role === "user") {
    const texts = typeof msg.content === "string" ? [msg.content] : msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text);
    if (!texts.length) return null;
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-subtle px-3 py-2 whitespace-pre-wrap text-[13px]">{texts.join("\n")}</div>
      </div>
    );
  }
  const blocks: Block[] = typeof msg.content === "string" ? [{ type: "text", text: msg.content }] : (msg.content ?? []);
  // Server tool results are matched to their server_tool_use by id.
  const serverResults = new Map<string, Block>();
  for (const b of blocks) {
    if ((b.type === "web_search_tool_result" || b.type === "web_fetch_tool_result") && "tool_use_id" in b) serverResults.set(b.tool_use_id, b);
  }
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "thinking":
            return b.thinking ? <Thinking key={i} text={b.thinking} /> : null;
          case "text":
            return b.text ? <Markdown key={i}>{b.text}</Markdown> : null;
          case "tool_use":
            return <ToolCall key={i} name={b.name} input={b.input as Record<string, unknown>} result={results.get(b.id)} fileHref={fileHref} />;
          case "server_tool_use":
            return <ServerCall key={i} name={b.name} input={b.input as Record<string, unknown>} result={serverResults.get(b.id)} />;
          case "fallback":
            return (
              <div key={i} className="text-[12px] text-muted">
                Switched model after a decline.
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

function Thinking({ text, live }: { text: string; live?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-[13px]">
      <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-muted hover:text-fg">
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <Brain className="size-3.5" /> {live ? "Thinking…" : "Thinking"}
      </button>
      {open && <div className="mt-1 ml-5 border-l border-line pl-3 text-muted whitespace-pre-wrap">{text}</div>}
    </div>
  );
}

const TOOL_ICONS: Record<string, typeof FileText> = { Read: FileText, Write: FilePen, Edit: FilePen, Glob: FileSearch, Grep: Search };

function ToolCall({
  name,
  input,
  result,
  fileHref,
}: {
  name: string;
  input: Record<string, unknown>;
  result?: { text: string; error: boolean };
  fileHref: (p: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const Icon = TOOL_ICONS[name] ?? FileText;
  const target = String(input.file_path ?? input.pattern ?? "");
  const isWrite = name === "Write" || name === "Edit";
  return (
    <div className="rounded-md border border-line text-[12px]">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-subtle/60">
        <Icon className={cx("size-3.5 shrink-0", isWrite ? "text-info" : "text-muted")} />
        <span className="font-medium">{name}</span>
        <span className="font-mono truncate text-muted">{target}</span>
        {result?.error && <span className="ml-auto text-bad shrink-0">failed</span>}
        {!result && <span className="ml-auto text-muted shrink-0">running</span>}
      </button>
      {open && (
        <div className="border-t border-line px-2.5 py-2 space-y-2">
          {isWrite && !result?.error && typeof input.file_path === "string" && (
            <Link href={fileHref(input.file_path)} className="text-info underline-offset-2 hover:underline">
              Open {input.file_path}
            </Link>
          )}
          {result && <pre className={cx("whitespace-pre-wrap font-mono text-[11px] max-h-64 overflow-y-auto", result.error ? "text-bad" : "text-muted")}>{result.text.slice(0, 4000)}</pre>}
        </div>
      )}
    </div>
  );
}

function ServerCall({ name, input, result }: { name: string; input: Record<string, unknown>; result?: Block }) {
  const [open, setOpen] = useState(false);
  const label = String(input.query ?? input.url ?? "");
  let links: { title?: string; url: string }[] = [];
  let failed = false;
  if (result && result.type === "web_search_tool_result") {
    const c = result.content as unknown;
    if (Array.isArray(c)) links = c.map((r: { title?: string; url: string }) => ({ title: r.title, url: r.url }));
    else failed = true;
  }
  if (result && result.type === "web_fetch_tool_result") {
    const c = result.content as { type?: string; url?: string };
    if (c?.type === "web_fetch_result" && c.url) links = [{ url: c.url }];
    else failed = true;
  }
  return (
    <div className="rounded-md border border-line text-[12px]">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-subtle/60">
        <Globe className="size-3.5 shrink-0 text-muted" />
        <span className="font-medium">{toolLabel(name)}</span>
        <span className="truncate text-muted">{label}</span>
        <span className="ml-auto shrink-0 text-muted">{failed ? <span className="text-bad">failed</span> : links.length ? `${links.length} result${links.length > 1 ? "s" : ""}` : ""}</span>
      </button>
      {open && links.length > 0 && (
        <ul className="border-t border-line px-2.5 py-2 space-y-1">
          {links.map((l) => (
            <li key={l.url} className="truncate">
              <a href={l.url} target="_blank" rel="noreferrer" className="text-info hover:underline">
                {l.title || l.url}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
