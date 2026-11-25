import { stopRun } from "@/lib/agents/runner";
import { ok } from "@/lib/http";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return ok({ stopped: stopRun(id) });
}
