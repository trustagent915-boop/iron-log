import type { ArmTrackerData } from "@/lib/arm-tracker/types";

export interface RemoteSnapshotResponse {
  configured: boolean;
  snapshot: ArmTrackerData | null;
  seedVersion: string | null;
  updatedAt: string | null;
}

export async function fetchRemoteSnapshot(signal?: AbortSignal): Promise<RemoteSnapshotResponse> {
  const response = await fetch("/api/arm-tracker/snapshot", {
    method: "GET",
    cache: "no-store",
    signal
  });

  if (!response.ok) {
    throw new Error(`Snapshot remoto non disponibile (${response.status}).`);
  }

  return (await response.json()) as RemoteSnapshotResponse;
}

export async function pushRemoteSnapshot(input: {
  snapshot: ArmTrackerData;
  seedVersion: string | null;
  signal?: AbortSignal;
}): Promise<RemoteSnapshotResponse> {
  const response = await fetch("/api/arm-tracker/snapshot", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      snapshot: input.snapshot,
      seedVersion: input.seedVersion
    }),
    signal: input.signal
  });

  if (!response.ok) {
    throw new Error(`Salvataggio remoto non riuscito (${response.status}).`);
  }

  return (await response.json()) as RemoteSnapshotResponse;
}
