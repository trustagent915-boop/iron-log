import type { ArmTrackerArchiveImportResult, ArmTrackerData } from "@/lib/arm-tracker/types";

export interface RemoteSnapshotResponse {
  configured: boolean;
  snapshot: ArmTrackerData | null;
  seedVersion: string | null;
  updatedAt: string | null;
}

export interface RemoteArchiveImportResponse extends ArmTrackerArchiveImportResult {
  snapshot: ArmTrackerData;
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

export async function importRemoteArchive(input: {
  payload: string;
  signal?: AbortSignal;
}): Promise<RemoteArchiveImportResponse> {
  const response = await fetch("/api/arm-tracker/import", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      payload: input.payload
    }),
    signal: input.signal
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Import remoto non riuscito (${response.status}).`);
  }

  return (await response.json()) as RemoteArchiveImportResponse;
}
