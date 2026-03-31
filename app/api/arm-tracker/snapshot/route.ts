import { NextResponse } from "next/server";

import { readSupabaseSnapshot, writeSupabaseSnapshot } from "@/lib/arm-tracker/supabase-sync.server";
import type { ArmTrackerData } from "@/lib/arm-tracker/types";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArmTrackerData(value: unknown): value is ArmTrackerData {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value.plans) &&
    Array.isArray(value.sessions) &&
    Array.isArray(value.exercises) &&
    Array.isArray(value.workoutLogs) &&
    Array.isArray(value.exerciseLogs) &&
    Array.isArray(value.importRuns)
  );
}

export async function GET() {
  try {
    const snapshot = await readSupabaseSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      {
        configured: true,
        snapshot: null,
        seedVersion: null,
        updatedAt: null,
        error: error instanceof Error ? error.message : "Unable to read Supabase snapshot."
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isRecord(body) || !isArmTrackerData(body.snapshot)) {
    return NextResponse.json({ error: "Missing snapshot payload." }, { status: 400 });
  }

  try {
    const snapshot = await writeSupabaseSnapshot({
      snapshot: body.snapshot as ArmTrackerData,
      seedVersion: typeof body.seedVersion === "string" ? body.seedVersion : null
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      {
        configured: true,
        snapshot: null,
        seedVersion: null,
        updatedAt: null,
        error: error instanceof Error ? error.message : "Unable to write Supabase snapshot."
      },
      { status: 500 }
    );
  }
}
