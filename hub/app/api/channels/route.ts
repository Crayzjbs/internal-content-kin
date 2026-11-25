import { createChannel, NewChannelInput } from "@/lib/channels";
import { body, fail, ok } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const channel = await createChannel(await body<NewChannelInput>(req));
    return ok({ channel });
  } catch (e) {
    return fail(e);
  }
}
