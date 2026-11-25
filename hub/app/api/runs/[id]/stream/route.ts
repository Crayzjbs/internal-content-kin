import { subscribe, RunEvent } from "@/lib/agents/runner";

export const dynamic = "force-dynamic";

/** Server-sent events for a live run. Replays buffered events, then follows. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const send = (e: RunEvent | { t: "gone" }) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
          if (e.t === "done" || e.t === "gone") {
            unsubscribe?.();
            controller.close();
          }
        } catch {
          unsubscribe?.();
        }
      };
      unsubscribe = subscribe(id, send);
      if (!unsubscribe) send({ t: "gone" });
      req.signal.addEventListener("abort", () => {
        unsubscribe?.();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      unsubscribe?.();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
