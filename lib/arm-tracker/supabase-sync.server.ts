import { createEmptyArmTrackerData } from "@/lib/arm-tracker/storage";
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
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const ownerKey = process.env.ARM_TRACKER_OWNER_KEY?.trim();

  if (!url || !serviceRoleKey || !ownerKey) {
    return null;
  }

  return {
    url: url.replace(/\/+$/, ""),
    serviceRoleKey,
    ownerKey
  };
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
          snapshot: input.snapshot ?? createEmptyArmTrackerData(),
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
