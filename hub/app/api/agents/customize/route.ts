import { requireChannel } from "@/lib/channels";
import { customizeAgent } from "@/lib/agents/registry";
import { body, fail, ok } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const b = await body<{ channel: string; name: string }>(req);
    const path = await customizeAgent(await requireChannel(b.channel), b.name);
    return ok({ path });
  } catch (e) {
    return fail(e);
  }
}
