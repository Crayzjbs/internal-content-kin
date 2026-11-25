"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, Clapperboard, Bot, FolderOpen, History, Settings, ChevronsUpDown, Menu, X, FlaskConical } from "lucide-react";
import { cx } from "./ui";

type Ch = { slug: string; name: string; color?: string };

const NAV = [
  { href: "", label: "Overview", icon: LayoutDashboard },
  { href: "/episodes", label: "Episodes", icon: Clapperboard },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/files", label: "Files", icon: FolderOpen },
  { href: "/runs", label: "Runs", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  channels,
  current,
  agents,
  mock,
  reviewCount,
}: {
  channels: Ch[];
  current: string;
  agents: { name: string; label: string }[];
  mock: boolean;
  reviewCount: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const base = `/c/${current}`;
  const ch = channels.find((c) => c.slug === current);

  const isActive = (href: string) => {
    const full = base + href;
    return href === "" ? pathname === base : pathname === full || pathname.startsWith(full + "/");
  };

  const body = (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="flex items-center gap-2 px-1 pt-1">
        <div className="size-6 rounded bg-fg text-bg grid place-items-center text-[11px] font-bold">K</div>
        <span className="font-semibold tracking-tight">KIN Hub</span>
        {mock && (
          <span title="HUB_MOCK_AGENTS=1: agents run a scripted mock, no API calls" className="ml-auto inline-flex items-center gap-1 rounded bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold text-warn">
            <FlaskConical className="size-3" /> MOCK
          </span>
        )}
      </div>

      <label className="relative block">
        <span className="sr-only">Channel</span>
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-2.5 rounded-full" style={{ background: ch?.color ?? "var(--accent)" }} />
        <select
          value={current}
          onChange={(e) => {
            const next = e.target.value;
            if (next === "__new") router.push(`${base}/settings#new-channel`);
            else router.push(pathname.replace(base, `/c/${next}`).split("/").slice(0, 4).join("/"));
          }}
          className="w-full appearance-none rounded-md border border-line bg-panel py-1.5 pl-7 pr-7 text-[13px] font-medium focus:outline-none"
        >
          {channels.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
          <option value="__new">+ New channel…</option>
        </select>
        <ChevronsUpDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 size-3.5 text-muted" />
      </label>

      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={label}
            href={base + href}
            onClick={() => setOpen(false)}
            className={cx(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px]",
              isActive(href) ? "bg-subtle font-medium" : "text-muted hover:text-fg hover:bg-subtle/60",
            )}
          >
            <Icon className="size-4" />
            {label}
            {label === "Overview" && reviewCount > 0 && (
              <span className="ml-auto rounded bg-warn/15 px-1.5 text-[11px] font-semibold text-warn">{reviewCount}</span>
            )}
          </Link>
        ))}
      </nav>

      <div>
        <div className="px-2 mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Agents</div>
        <div className="flex flex-col gap-0.5">
          {agents.map((a) => (
            <Link
              key={a.name}
              href={`${base}/agents/${a.name}`}
              onClick={() => setOpen(false)}
              className={cx(
                "rounded-md px-2 py-1 text-[13px]",
                pathname.startsWith(`${base}/agents/${a.name}`) ? "bg-subtle font-medium" : "text-muted hover:text-fg hover:bg-subtle/60",
              )}
            >
              {a.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="md:hidden sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-bg/90 backdrop-blur px-4 h-12">
        <button aria-label="Open menu" onClick={() => setOpen(true)} className="-ml-1 p-1">
          <Menu className="size-5" />
        </button>
        <span className="font-semibold">{ch?.name ?? "KIN Hub"}</span>
      </div>
      {open && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-line bg-bg">
            <button aria-label="Close menu" onClick={() => setOpen(false)} className="absolute right-2 top-2 p-1">
              <X className="size-4" />
            </button>
            {body}
          </aside>
        </div>
      )}
      <aside className="hidden md:block w-56 shrink-0 border-r border-line sticky top-0 h-screen overflow-y-auto">{body}</aside>
    </>
  );
}
