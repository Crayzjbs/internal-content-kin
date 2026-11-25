import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-fg text-bg hover:opacity-90",
  secondary: "bg-panel border border-line hover:bg-subtle",
  ghost: "hover:bg-subtle",
  danger: "bg-panel border border-line text-bad hover:bg-subtle",
};

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-md px-3 h-8 text-[13px] font-medium transition disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

export function Button({ variant = "secondary", className, ...p }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button {...p} className={cx(base, variants[variant], className)} />;
}

export function LinkButton({
  variant = "secondary",
  className,
  ...p
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link {...p} className={cx(base, variants[variant], className)} />;
}

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div {...p} className={cx("rounded-lg border border-line bg-panel", className)} />;
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted">{children}</h2>
      {right}
    </div>
  );
}

export const inputCls =
  "w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-[13px] placeholder:text-muted/70 focus:outline-none focus:border-fg/40";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[12px] text-muted mt-1">{hint}</span>}
    </label>
  );
}

const statusStyles: Record<string, string> = {
  pending: "text-muted bg-subtle",
  running: "text-info bg-info/10",
  review: "text-warn bg-warn/10",
  changes: "text-warn bg-warn/10",
  approved: "text-ok bg-ok/10",
  skipped: "text-muted bg-subtle line-through",
  done: "text-ok bg-ok/10",
  error: "text-bad bg-bad/10",
  stopped: "text-muted bg-subtle",
};

const statusLabels: Record<string, string> = {
  review: "needs review",
  changes: "changes requested",
};

export function Badge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium capitalize",
        statusStyles[status] ?? "bg-subtle text-muted",
        className,
      )}
    >
      {status === "running" && <span className="size-1.5 rounded-full bg-info animate-pulse" />}
      {statusLabels[status] ?? status}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line p-6 text-center text-muted">{children}</div>;
}
