import { requireChannel } from "@/lib/channels";
import { createEpisode } from "@/lib/pipeline";
import { body, fail, ok } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const b = await body<{ channel: string; title: string; slug?: string; pillar?: string; notes?: string }>(req);
    const channel = await requireChannel(b.channel);
    const episode = await createEpisode(channel, b);
    return ok({ episode });
  } catch (e) {
    return fail(e);
  }
}
