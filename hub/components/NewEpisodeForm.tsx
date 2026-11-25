"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/format";
import { Button, Card, Field, inputCls } from "./ui";

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function NewEpisodeForm({ channel, pillars, onClose }: { channel: string; pillars: string[]; onClose?: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [pillar, setPillar] = useState(pillars[0] ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { episode } = await api<{ episode: { slug: string } }>("/api/episodes", {
        body: { channel, title, slug: slugTouched ? slug : slugify(title), pillar, notes },
      });
      router.push(`/c/${channel}/episodes/${episode.slug}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 mb-6">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Working title">
          <input
            autoFocus
            required
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="The Rise and Fall of …"
          />
        </Field>
        <Field label="Slug" hint={`Folder: episodes/${slugTouched ? slug : slugify(title) || "…"}/`}>
          <input
            className={inputCls}
            value={slugTouched ? slug : slugify(title)}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
          />
        </Field>
        <Field label="Pillar">
          <input list="pillars" className={inputCls} value={pillar} onChange={(e) => setPillar(e.target.value)} placeholder="Optional" />
          <datalist id="pillars">
            {pillars.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <Field label="Notes for the strategist" hint="Topic angle, sources, anything the brief should cover.">
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="sm:col-span-2 flex items-center gap-2">
          <Button type="submit" variant="primary" disabled={busy || !title.trim()}>
            {busy ? "Creating…" : "Create episode"}
          </Button>
          {onClose && (
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          )}
          {error && <span className="text-bad text-[13px]">{error}</span>}
        </div>
      </form>
    </Card>
  );
}
