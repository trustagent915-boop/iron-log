import { createEmptyArmTrackerData, mergeArmTrackerSnapshots } from "@/lib/arm-tracker/storage";
import type { ArmTrackerData } from "@/lib/arm-tracker/types";

interface SupabaseSyncConfig {
  url: string;
  serviceRoleKey: string;
  ownerKey: string;
}

interface SnapshotRow {
  owner_key: string;
  snapshot: ArmTrackerData;
  seed_version: string | null;
  updated_at: string | null;
}

export interface SupabaseSnapshotResult {
  configured: boolean;
  snapshot: ArmTrackerData | null;
  seedVersion: string | null;
  updatedAt: string | null;
}

function getConfig(): SupabaseSyncConfig | null {
  const url = cleanEnvValue(process.env.SUPABASE_URL);
  const serviceRoleKey = cleanEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const ownerKey = cleanEnvValue(process.env.ARM_TRACKER_OWNER_KEY);

  if (!url || !serviceRoleKey || !ownerKey) {
    return null;
  }

  return {
    url: url.replace(/\/+$/, ""),
    serviceRoleKey,
    ownerKey
  };
}

function cleanEnvValue(value: string | undefined) {
  return value
    ?.trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\r/g, "")
    .replace(/\\n/g, "")
    .trim() ?? "";
}

function createHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`
  };
}

function toSnapshotResult(row: SnapshotRow | null): SupabaseSnapshotResult {
  return {
    configured: true,
    snapshot: row?.snapshot ?? null,
    seedVersion: row?.seed_version ?? null,
    updatedAt: row?.updated_at ?? null
  };
}

function hasSnapshotData(snapshot: ArmTrackerData) {
  return (
    snapshot.plans.length > 0 ||
    snapshot.sessions.length > 0 ||
    snapshot.exercises.length > 0 ||
    snapshot.workoutLogs.length > 0 ||
    snapshot.exerciseLogs.length > 0 ||
    snapshot.importRuns.length > 0 ||
    (snapshot.level100Watchlist?.length ?? 0) > 0
  );
}

function mergeSnapshotsForZeroLoss(current: ArmTrackerData, incoming: ArmTrackerData): ArmTrackerData {
  return mergeArmTrackerSnapshots(current, incoming);
}

async function insertSnapshotVersion(
  config: SupabaseSyncConfig,
  input: {
    snapshot: ArmTrackerData;
    seedVersion: string | null;
    source: "pre-write-cloud" | "incoming-write";
  }
) {
  if (!hasSnapshotData(input.snapshot)) {
    return;
  }

  const response = await fetch(`${config.url}/rest/v1/arm_tracker_snapshot_versions`, {
    method: "POST",
    headers: {
      ...createHeaders(config.serviceRoleKey),
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      {
        owner_key: config.ownerKey,
        snapshot: input.snapshot,
        seed_version: input.seedVersion,
        source: input.source
      }
    ]),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Supabase snapshot version write failed (${response.status}).`);
  }
}

export function getSupabaseSyncStatus() {
  return {
    configured: Boolean(getConfig())
  };
}

export async function readSupabaseSnapshot(): Promise<SupabaseSnapshotResult> {
  const config = getConfig();

  if (!config) {
    return {
      configured: false,
      snapshot: null,
      seedVersion: null,
      updatedAt: null
    };
  }

  const params = new URLSearchParams({
    select: "owner_key,snapshot,seed_version,updated_at",
    owner_key: `eq.${config.ownerKey}`,
    limit: "1"
  });

  const response = await fetch(`${config.url}/rest/v1/arm_tracker_snapshots?${params.toString()}`, {
    headers: {
      ...createHeaders(config.serviceRoleKey),
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Supabase read failed (${response.status}).`);
  }

  const rows = (await response.json()) as SnapshotRow[];
  return toSnapshotResult(rows[0] ?? null);
}

export async function writeSupabaseSnapshot(input: {
  snapshot: ArmTrackerData;
  seedVersion: string | null;
}): Promise<SupabaseSnapshotResult> {
  const config = getConfig();

  if (!config) {
    return {
      configured: false,
      snapshot: null,
      seedVersion: null,
      updatedAt: null
    };
  }

  const existingSnapshot = await readSupabaseSnapshot();
  const incomingSnapshot = input.snapshot ?? createEmptyArmTrackerData();
  const currentSnapshot = existingSnapshot.snapshot ?? createEmptyArmTrackerData();
  const mergedSnapshot = mergeSnapshotsForZeroLoss(currentSnapshot, incomingSnapshot);

  await insertSnapshotVersion(config, {
    snapshot: currentSnapshot,
    seedVersion: existingSnapshot.seedVersion,
    source: "pre-write-cloud"
  });
  await insertSnapshotVersion(config, {
    snapshot: incomingSnapshot,
    seedVersion: input.seedVersion,
    source: "incoming-write"
  });

  const response = await fetch(
    `${config.url}/rest/v1/arm_tracker_snapshots?on_conflict=owner_key`,
    {
      method: "POST",
      headers: {
        ...createHeaders(config.serviceRoleKey),
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify([
        {
          owner_key: config.ownerKey,
          snapshot: mergedSnapshot,
          seed_version: input.seedVersion
        }
      ]),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(`Supabase write failed (${response.status}).`);
  }

  const rows = (await response.json()) as SnapshotRow[];
  return toSnapshotResult(rows[0] ?? null);
}
