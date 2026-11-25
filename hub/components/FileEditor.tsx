"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Save, X } from "lucide-react";
import { api, fmtWhen } from "@/lib/format";
import { Button, Card, cx } from "./ui";
import { Markdown } from "./Markdown";

export function FileEditor({
  channel,
  path,
  initial,
  error,
  mtime,
  startEditing,
}: {
  channel: string;
  path: string;
  initial: string | null;
  error: string;
  mtime: string | null;
  startEditing?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!!startEditing && initial !== null);
  const [text, setText] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const isMd = path.endsWith(".md");
  const dirty = text !== (initial ?? "");

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      await api("/api/files", { method: "PUT", body: { channel, path, content: text } });
      setEditing(false);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 h-11">
        <span className="font-mono text-[12px] truncate flex-1">{path}</span>
        {mtime && <span className="hidden sm:inline text-[12px] text-muted">saved {fmtWhen(mtime)}</span>}
        {initial !== null &&
          (editing ? (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setText(initial ?? "");
                  setEditing(false);
                }}
              >
                <X className="size-3.5" /> Cancel
              </Button>
              <Button variant="primary" onClick={save} disabled={saving || !dirty}>
                <Save className="size-3.5" /> {saving ? "Saving…" : "Save"}
              </Button>
            </>
          ) : (
            <Button onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" /> Edit
            </Button>
          ))}
      </div>
      {msg && <div className="px-4 py-2 text-[13px] text-bad border-b border-line">{msg}</div>}
      {error ? (
        <div className="p-6 text-muted">{error}</div>
      ) : editing ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              if (dirty) void save();
            }
          }}
          spellCheck={false}
          className="block w-full min-h-[65vh] resize-y bg-panel p-4 font-mono text-[12.5px] leading-relaxed focus:outline-none"
        />
      ) : (
        <div className={cx("p-5 max-h-[75vh] overflow-y-auto")}>
          {initial === "" ? (
            <p className="text-muted">Empty file.</p>
          ) : isMd ? (
            <Markdown>{initial ?? ""}</Markdown>
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-[12.5px]">{initial}</pre>
          )}
        </div>
      )}
    </Card>
  );
}
