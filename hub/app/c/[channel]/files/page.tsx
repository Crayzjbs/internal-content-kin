import Link from "next/link";
import { requireChannel } from "@/lib/channels";
import { listChannelFiles, readChannelFile, fileMtime } from "@/lib/files";
import { Card, PageHeader, cx } from "@/components/ui";
import { FileEditor } from "@/components/FileEditor";
import { FileText, Folder } from "lucide-react";

export default async function FilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ channel: string }>;
  searchParams: Promise<{ path?: string; edit?: string }>;
}) {
  const { channel: cs } = await params;
  const sp = await searchParams;
  const channel = await requireChannel(cs);
  const files = await listChannelFiles(channel);
  const selected = sp.path ?? (files.includes("CLAUDE.md") ? "CLAUDE.md" : files[0]);
  let content: string | null = null;
  let error = "";
  if (selected) {
    try {
      content = await readChannelFile(channel, selected);
      if (content === null) error = "This file does not exist yet.";
    } catch (e) {
      error = (e as Error).message;
    }
  }
  const mtime = selected ? await fileMtime(channel, selected) : null;

  // Group by top-level folder for a compact tree.
  const groups = new Map<string, string[]>();
  for (const f of files) {
    const top = f.includes("/") ? f.split("/")[0] : "";
    groups.set(top, [...(groups.get(top) ?? []), f]);
  }
  const order = ["", "bible", "brand", "strategy", "episodes", "social", "feedback", ".claude"];
  const keys = [...groups.keys()].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });

  return (
    <div className="max-w-7xl">
      <PageHeader title="Files" subtitle={`Everything in ${channel.root === "." ? "the repo root" : channel.root}/ for ${channel.name}. Edits save straight to disk.`} />
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="p-2 max-h-[75vh] overflow-y-auto text-[13px] self-start">
          {keys.map((k) => (
            <div key={k || "root"} className="mb-2">
              {k && (
                <div className="flex items-center gap-1.5 px-2 py-1 text-muted font-medium">
                  <Folder className="size-3.5" /> {k}/
                </div>
              )}
              {groups.get(k)!.map((f) => {
                const label = k ? f.slice(k.length + 1) : f;
                return (
                  <Link
                    key={f}
                    href={`/c/${cs}/files?path=${encodeURIComponent(f)}`}
                    className={cx(
                      "flex items-center gap-1.5 rounded px-2 py-1 truncate",
                      k && "pl-6",
                      f === selected ? "bg-subtle font-medium" : "hover:bg-subtle/60",
                    )}
                    title={f}
                  >
                    <FileText className="size-3.5 shrink-0 text-muted" />
                    <span className="truncate">{label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </Card>
        <div className="min-w-0">
          {selected ? (
            <FileEditor
              key={selected + (mtime ?? "")}
              channel={cs}
              path={selected}
              initial={content}
              error={error}
              mtime={mtime}
              startEditing={sp.edit === "1"}
            />
          ) : (
            <Card className="p-6 text-muted">No files.</Card>
          )}
        </div>
      </div>
    </div>
  );
}
