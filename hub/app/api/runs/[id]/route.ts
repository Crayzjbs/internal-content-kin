import { getRunView } from "@/lib/views";
import { fail, ok } from "@/lib/http";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const channel = new URL(req.url).searchParams.get("channel") ?? "";
    const run = await getRunView(channel, id);
    if (!run) return fail("Run not found.", 404);
    return ok({ run });
  } catch (e) {
    return fail(e);
  }
}
