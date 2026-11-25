import "server-only";
import { NextResponse } from "next/server";

export function ok(data: unknown = { ok: true }) {
  return NextResponse.json(data);
}

export function fail(e: unknown, status = 400) {
  const message = e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: message }, { status });
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new Error("Invalid JSON body.");
  }
}
