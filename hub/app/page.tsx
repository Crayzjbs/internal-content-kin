import { redirect } from "next/navigation";
import { listChannels } from "@/lib/channels";

export const dynamic = "force-dynamic";

export default async function Home() {
  const channels = await listChannels();
  if (!channels.length) {
    return (
      <main className="p-10 max-w-lg">
        <h1 className="text-xl font-semibold">No channels</h1>
        <p className="text-muted mt-2">Add a channel to channels.json at the repo root.</p>
      </main>
    );
  }
  redirect(`/c/${channels[0].slug}`);
}
