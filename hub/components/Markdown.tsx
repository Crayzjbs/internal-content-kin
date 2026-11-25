"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cx } from "./ui";

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cx("md", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
