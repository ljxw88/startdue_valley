import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { type NextRequest, NextResponse } from "next/server";

import { parseWorldSnapshot } from "@/simulation";

const SNAPSHOT_DIRECTORY = path.join(process.cwd(), ".data", "snapshots");
const SNAPSHOT_FILE_PATH = path.join(SNAPSHOT_DIRECTORY, "latest.json");

export const runtime = "nodejs";

export async function GET() {
  try {
    const payload = await readFile(SNAPSHOT_FILE_PATH, "utf-8");
    const parsed = parseWorldSnapshot(JSON.parse(payload));
    if (!parsed) {
      return NextResponse.json({ error: "Stored snapshot is invalid" }, { status: 500 });
    }
    return NextResponse.json({ snapshot: parsed }, { status: 200 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ snapshot: null }, { status: 200 });
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { snapshot?: unknown } | null;
  const snapshot = parseWorldSnapshot(body?.snapshot);
  if (!snapshot) {
    return NextResponse.json({ error: "Request must include a valid snapshot" }, { status: 400 });
  }

  await mkdir(SNAPSHOT_DIRECTORY, { recursive: true });
  await writeFile(SNAPSHOT_FILE_PATH, JSON.stringify(snapshot, null, 2), "utf-8");
  return NextResponse.json({ ok: true }, { status: 200 });
}
