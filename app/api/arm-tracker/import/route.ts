import { NextResponse } from "next/server";

import { readSupabaseSnapshot, writeSupabaseSnapshot } from "@/lib/arm-tracker/supabase-sync.server";
import { isAuthorizedSnapshotRequest } from "@/lib/arm-tracker/snapshot-auth.server";
import { createEmptyArmTrackerData, getDataCounts } from "@/lib/arm-tracker/storage";
import type { ArmTrackerArchive, ArmTrackerData } from "@/lib/arm-tracker/types";

export const dynamic = "force-dynamic";

const maxArchivePayloadBytes = 15_000_000;

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

function parseArchivePayload(body: unknown) {
  if (!isRecord(body)) {
    throw new Error("Richiesta import non valida.");
  }

  const rawArchive = typeof body.payload === "string" ? body.payload : body.archive;

  if (typeof rawArchive === "string" && rawArchive.length > maxArchivePayloadBytes) {
    throw new Error("Backup troppo grande per l'import sicuro.");
  }

  const parsedArchive = typeof rawArchive === "string" ? JSON.parse(rawArchive) : rawArchive;

  if (!isRecord(parsedArchive)) {
    throw new Error("Il backup non contiene un archivio Iron Log valido.");
  }

  if ("app" in parsedArchive && parsedArchive.app !== "iron-log") {
    throw new Error("Questo archivio non appartiene a Iron Log.");
  }

  const data = isRecord(parsedArchive.data) ? parsedArchive.data : parsedArchive;

  if (!isArmTrackerData(data)) {
    throw new Error("Il backup non contiene tutti i dati Iron Log richiesti.");
  }

  return {
    snapshot: data,
    exportedAt: typeof parsedArchive.exportedAt === "string" ? parsedArchive.exportedAt : null
  } satisfies {
    snapshot: ArmTrackerArchive["data"];
    exportedAt: string | null;
  };
}

export async function POST(request: Request) {
  if (!isAuthorizedSnapshotRequest(request)) {
    return NextResponse.json(
      {
        error: "Backup imports require an authenticated cloud session."
      },
      { status: 401 }
    );
  }

  let parsedPayload: ReturnType<typeof parseArchivePayload>;

  try {
    parsedPayload = parseArchivePayload(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Backup non valido."
      },
      { status: 400 }
    );
  }

  try {
    const before = await readSupabaseSnapshot();
    const beforeSnapshot = before.snapshot ?? createEmptyArmTrackerData();
    const beforeCounts = getDataCounts(beforeSnapshot);
    const result = await writeSupabaseSnapshot({
      snapshot: parsedPayload.snapshot,
      seedVersion: before.seedVersion
    });
    const mergedSnapshot = result.snapshot ?? createEmptyArmTrackerData();
    const nextCounts = getDataCounts(mergedSnapshot);

    return NextResponse.json({
      exportedAt: parsedPayload.exportedAt,
      counts: nextCounts,
      added: {
        plans: Math.max(0, nextCounts.plans - beforeCounts.plans),
        sessions: Math.max(0, nextCounts.sessions - beforeCounts.sessions),
        exercises: Math.max(0, nextCounts.exercises - beforeCounts.exercises),
        workoutLogs: Math.max(0, nextCounts.workoutLogs - beforeCounts.workoutLogs),
        exerciseLogs: Math.max(0, nextCounts.exerciseLogs - beforeCounts.exerciseLogs),
        importRuns: Math.max(0, nextCounts.importRuns - beforeCounts.importRuns)
      },
      snapshot: mergedSnapshot,
      seedVersion: result.seedVersion,
      updatedAt: result.updatedAt
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Import cloud non riuscito."
      },
      { status: 500 }
    );
  }
}
