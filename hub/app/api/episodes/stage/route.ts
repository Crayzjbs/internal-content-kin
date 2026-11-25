import { stageAction, StageAction } from "@/lib/stage-actions";
import { body, fail, ok } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const b = await body<{ channel: string; slug: string; stageId: string; action: StageAction; note?: string; saveRule?: boolean }>(req);
    return ok(await stageAction(b));
  } catch (e) {
    return fail(e);
  }
}
