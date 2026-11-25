"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/format";
import { Button } from "./ui";

export function CustomizeAgentButton({ channel, name }: { channel: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="pt-1">
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const { path } = await api<{ path: string }>("/api/agents/customize", { body: { channel, name } });
            router.push(`/c/${channel}/files?path=${encodeURIComponent(path)}&edit=1`);
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        Customize for this channel
      </Button>
      <p className="text-[12px] text-muted mt-1">Copies the base agent into this channel so you can tailor it.</p>
      {error && <p className="text-[12px] text-bad">{error}</p>}
    </div>
  );
}
