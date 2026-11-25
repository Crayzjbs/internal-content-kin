import { startRun, StartInput } from "@/lib/agents/runner";
import { body, fail, ok } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const runId = await startRun(await body<StartInput>(req));
    return ok({ runId });
  } catch (e) {
    return fail(e);
  }
}
