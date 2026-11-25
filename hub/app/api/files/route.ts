import { requireChannel } from "@/lib/channels";
import { readChannelFile, writeChannelFile } from "@/lib/files";
import { body, fail, ok } from "@/lib/http";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const channel = await requireChannel(u.searchParams.get("channel") ?? "");
    const content = await readChannelFile(channel, u.searchParams.get("path") ?? "");
    if (content === null) return fail("File not found.", 404);
    return ok({ content });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: Request) {
  try {
    const b = await body<{ channel: string; path: string; content: string }>(req);
    const channel = await requireChannel(b.channel);
    const path = await writeChannelFile(channel, b.path, b.content);
    return ok({ path });
  } catch (e) {
    return fail(e);
  }
}
