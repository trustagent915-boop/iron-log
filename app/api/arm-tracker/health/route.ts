import { NextResponse } from "next/server";

import { readSupabaseSnapshot } from "@/lib/arm-tracker/supabase-sync.server";
import { isAuthorizedSnapshotRequest } from "@/lib/arm-tracker/snapshot-auth.server";
import { createEmptyArmTrackerData, getDataCounts } from "@/lib/arm-tracker/storage";

export const dynamic = "force-dynamic";

function cleanEnvValue(value: string | undefined) {
  return value
    ?.trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\r/g, "")
    .replace(/\\n/g, "")
    .trim() ?? "";
}

async function readSnapshotVersionsCount(): Promise<number | null> {
  const url = cleanEnvValue(process.env.SUPABASE_URL).replace(/\/+$/, "");
  const serviceRoleKey = cleanEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const ownerKey = cleanEnvValue(process.env.ARM_TRACKER_OWNER_KEY);

  if (!url || !serviceRoleKey || !ownerKey) {
    return null;
  }

  const params = new URLSearchParams({
    select: "id",
    owner_key: `eq.${ownerKey}`
  });

  const response = await fetch(
    `${url}/rest/v1/arm_tracker_snapshot_versions?${params.toString()}`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: "count=exact",
        Range: "0-0"
      },
      cache: "no-store"
    }
  );

  if (!response.ok) {
    return null;
  }

  const contentRange = response.headers.get("content-range") ?? "";
  const total = Number.parseInt(contentRange.split("/").pop() ?? "", 10);

  return Number.isFinite(total) ? total : null;
}

export async function GET(request: Request) {
  if (!isAuthorizedSnapshotRequest(request)) {
    return NextResponse.json(
      { error: "Health check requires an authenticated cloud session." },
      { status: 401 }
    );
  }

  try {
    const snapshotResult = await readSupabaseSnapshot();

    if (!snapshotResult.configured) {
      return NextResponse.json(
        {
          configured: false,
          counts: getDataCounts(createEmptyArmTrackerData()),
          watchlistCount: 0,
          tombstoneCounts: {
            plans: 0,
            sessions: 0,
            exercises: 0,
            workoutLogs: 0,
            exerciseLogs: 0,
            importRuns: 0
          },
          seedVersion: null,
          updatedAt: null,
          versionsCount: null
        },
        { status: 200 }
      );
    }

    const snapshot = snapshotResult.snapshot ?? createEmptyArmTrackerData();
    const counts = getDataCounts(snapshot);
    const watchlistCount = snapshot.level100Watchlist?.length ?? 0;
    const tombstoneCounts = {
      plans: snapshot.deletedIds?.plans?.length ?? 0,
      sessions: snapshot.deletedIds?.sessions?.length ?? 0,
      exercises: snapshot.deletedIds?.exercises?.length ?? 0,
      workoutLogs: snapshot.deletedIds?.workoutLogs?.length ?? 0,
      exerciseLogs: snapshot.deletedIds?.exerciseLogs?.length ?? 0,
      importRuns: snapshot.deletedIds?.importRuns?.length ?? 0
    };
    const versionsCount = await readSnapshotVersionsCount();

    return NextResponse.json({
      configured: true,
      counts,
      watchlistCount,
      tombstoneCounts,
      seedVersion: snapshotResult.seedVersion,
      updatedAt: snapshotResult.updatedAt,
      versionsCount
    });
  } catch (error) {
    return NextResponse.json(
      {
        configured: true,
        error: error instanceof Error ? error.message : "Health check failed."
      },
      { status: 500 }
    );
  }
}
