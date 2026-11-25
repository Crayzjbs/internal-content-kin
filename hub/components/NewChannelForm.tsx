"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/format";
import { Button, Card, Field, inputCls } from "./ui";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export function NewChannelForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", slug: "", youtubeHandle: "", color: "#6366f1", format: "", audience: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const slug = f.slug || slugify(f.name);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New channel
      </Button>
    );
  }

  return (
    <Card className="p-4">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const { channel } = await api<{ channel: { slug: string } }>("/api/channels", { body: { ...f, slug } });
            router.push(`/c/${channel.slug}/files?path=CLAUDE.md`);
            router.refresh();
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <Field label="Channel name">
          <input required autoFocus className={inputCls} value={f.name} onChange={set("name")} />
        </Field>
        <Field label="Slug" hint={`Folder: channels/${slug || "…"}/`}>
          <input className={inputCls} value={slug} onChange={set("slug")} />
        </Field>
        <Field label="YouTube handle">
          <input className={inputCls} value={f.youtubeHandle} onChange={set("youtubeHandle")} placeholder="@handle" />
        </Field>
        <Field label="Color">
          <input type="color" className="h-8 w-16 rounded border border-line bg-panel" value={f.color} onChange={set("color")} />
        </Field>
        <Field label="Format" hint="e.g. 10 minute explainers, talking head, faceless Shorts only">
          <input className={inputCls} value={f.format} onChange={set("format")} />
        </Field>
        <Field label="Audience">
          <input className={inputCls} value={f.audience} onChange={set("audience")} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Notes">
            <textarea rows={2} className={inputCls} value={f.description} onChange={set("description")} />
          </Field>
        </div>
        <p className="sm:col-span-2 text-[12px] text-muted">
          Creates channels/{slug || "…"}/ with a CLAUDE.md, a TBD bible and voice guide, copies of the source standards and legal checklist, and empty
          strategy, episodes, social, brand and feedback folders. Fill in the TBD parts before running agents.
        </p>
        <div className="sm:col-span-2 flex items-center gap-2">
          <Button type="submit" variant="primary" disabled={busy || !f.name.trim()}>
            {busy ? "Creating…" : "Create channel"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {error && <span className="text-[13px] text-bad">{error}</span>}
        </div>
      </form>
    </Card>
  );
}
