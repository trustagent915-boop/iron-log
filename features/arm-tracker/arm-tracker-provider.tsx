"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";

import {
  addWatchlistExerciseMutation,
  resetIsometryTargetMutation,
  setIsometryTargetMutation,
  updateDashboardConfigMutation,
  createCustomSession,
  deleteWorkoutLogMutation,
  importParsedPlan,
  logArmwrestlingSessionMutation,
  removeWatchlistExerciseMutation,
  saveWorkoutLogEntry,
  type LogArmwrestlingSessionInput
} from "@/lib/arm-tracker/mutations";
import { fetchRemoteSnapshot, importRemoteArchive, pushRemoteSnapshot } from "@/lib/arm-tracker/remote-sync";
import { getActivePlan, getSessionDetails } from "@/lib/arm-tracker/selectors";
import {
  ARM_TRACKER_STORAGE_EVENT,
  createEmptyArmTrackerData,
  db,
  diffArmTrackerSnapshots,
  exportArmTrackerArchive,
  isEmptyArmTrackerDiff,
  mergeArmTrackerSnapshots,
  normalizeArmTrackerSnapshot,
  stableSerializeArmTrackerData
} from "@/lib/arm-tracker/storage";
import type {
  DashboardConfig,
  IsometryTargetConfig,
  ArmTrackerData,
  ArmTrackerArchiveExport,
  ArmTrackerArchiveImportResult,
  CreateCustomSessionInput,
  CreateCustomSessionResult,
  ImportPlanInput,
  ImportPlanResult,
  SaveWorkoutLogInput,
  SessionDetails
} from "@/lib/arm-tracker/types";

// Kept for backwards compatibility with pages that still read syncStatus.
// Always "ready" now — the app treats the cloud like any other REST
// backend: attempt the request, on failure retry silently, never surface
// a blocking barrier that stops the user from working.
export interface ArmTrackerSyncStatus {
  state: "checking" | "ready" | "blocked";
  canWrite: boolean;
  message: string | null;
}

const alwaysReady: ArmTrackerSyncStatus = {
  state: "ready",
  canWrite: true,
  message: null
};

interface ArmTrackerContextValue {
  data: ArmTrackerData;
  isReady: boolean;
  cloudReachable: boolean;
  syncStatus: ArmTrackerSyncStatus;
  activePlan: ReturnType<typeof getActivePlan>;
  refresh: () => void;
  importPlan: (input: ImportPlanInput) => Promise<ImportPlanResult>;
  createCustomSession: (input: CreateCustomSessionInput) => Promise<CreateCustomSessionResult>;
  saveWorkoutLog: (input: SaveWorkoutLogInput) => Promise<ReturnType<typeof saveWorkoutLogEntry>>;
  exportArchive: () => ArmTrackerArchiveExport;
  importArchive: (file: File) => Promise<ArmTrackerArchiveImportResult>;
  findSessionDetails: (sessionId: string) => SessionDetails | null;
  addWatchlistExercise: (exerciseName: string) => Promise<void>;
  removeWatchlistExercise: (exerciseName: string) => Promise<void>;
  updateDashboardConfig: (update: (config: DashboardConfig) => DashboardConfig) => Promise<DashboardConfig>;
  setIsometryTarget: (
    exerciseName: string,
    input: { volumeTargetSeconds: number; recordTargetSeconds?: number | null }
  ) => Promise<IsometryTargetConfig>;
  resetIsometryTarget: (exerciseName: string) => Promise<void>;
  deleteWorkoutLog: (workoutLogId: string) => Promise<void>;
  logArmwrestlingSession: (
    input: LogArmwrestlingSessionInput
  ) => Promise<ReturnType<typeof logArmwrestlingSessionMutation>>;
}

const ArmTrackerContext = createContext<ArmTrackerContextValue | null>(null);

// Silent background push. Optimistic UI: state already updated before
// this runs. Fire and forget. Retries once on transient failure so a
// flaky mobile connection self-heals; no toast on eventual failure so
// the interface stays clean. The next successful save will resync.
// The payload is a DIFF (only what this device changed), never the whole
// snapshot: see diffArmTrackerSnapshots. Returns the merged cloud snapshot
// on success, null on failure.
async function pushSnapshotBestEffort(snapshot: ArmTrackerData, seedVersion: string | null) {
  const attempt = async () => {
    return pushRemoteSnapshot({ snapshot, seedVersion });
  };
  try {
    return (await attempt()).snapshot ?? null;
  } catch {
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return (await attempt()).snapshot ?? null;
    } catch {
      // swallowed — see comment above
      return null;
    }
  }
}

export function ArmTrackerProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ArmTrackerData>(createEmptyArmTrackerData());
  const [isReady, setIsReady] = useState(false);
  // false quando il cloud non ha risposto dopo tutti i tentativi: quello che
  // si vede e solo la copia salvata sul dispositivo (anche vuota).
  const [cloudReachable, setCloudReachable] = useState(true);
  const seedVersionRef = useRef<string | null>(null);
  // Cresce a ogni modifica locale: una risposta del cloud arrivata dopo una
  // modifica piu recente non deve sovrascriverla.
  const mutationCounterRef = useRef(0);

  const applySnapshot = useCallback((snapshot: ArmTrackerData) => {
    db.setSnapshot(snapshot);
    setData(db.getSnapshot());
  }, []);

  // On mount: pull cloud, show data, done. No state machine, no auth,
  // no "blocked" fallback. If the fetch fails we retry a few times and
  // then just render whatever local snapshot exists (usually empty on
  // a fresh device — user sees the empty dashboard and can tap refresh
  // or wait for the next background attempt).
  useEffect(() => {
    let cancelled = false;

    async function loadFromCloud() {
      const maxAttempts = 4;
      let attempt = 0;
      while (!cancelled && attempt < maxAttempts) {
        attempt += 1;
        try {
          const remote = await fetchRemoteSnapshot();
          if (cancelled) return;

          const cloudSnapshot = remote.snapshot ?? createEmptyArmTrackerData();
          const localSnapshot = db.getSnapshot();
          const merged = mergeArmTrackerSnapshots(localSnapshot, cloudSnapshot);

          seedVersionRef.current = remote.seedVersion ?? seedVersionRef.current;
          if (remote.seedVersion?.trim()) db.setSeedVersion(remote.seedVersion);

          applySnapshot(merged);

          // Confronto a chiavi ordinate contro il cloud normalizzato: jsonb
          // riordina le chiavi e un JSON.stringify diretto risultava sempre
          // diverso, con una riscrittura da 3 MB a ogni apertura di pagina.
          // Si invia solo cio che il dispositivo ha in piu del cloud (per
          // esempio un salvataggio fatto offline), mai l'intero snapshot.
          const normalizedCloud = normalizeArmTrackerSnapshot(cloudSnapshot);
          if (stableSerializeArmTrackerData(merged) !== stableSerializeArmTrackerData(normalizedCloud)) {
            const diff = diffArmTrackerSnapshots(normalizedCloud, merged);
            if (!isEmptyArmTrackerDiff(diff)) {
              void pushSnapshotBestEffort(diff, seedVersionRef.current);
            }
          }
          setCloudReachable(true);
          setIsReady(true);
          return;
        } catch {
          if (attempt >= maxAttempts) break;
          await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
        }
      }
      // Cloud unreachable after retries. Show whatever we have locally
      // (empty on a fresh device is fine — they land on the dashboard
      // instead of on a blocking scarecrow).
      if (!cancelled) {
        setData(db.getSnapshot());
        setCloudReachable(false);
        setIsReady(true);
      }
    }

    void loadFromCloud();

    function handleStorageSync() {
      setData(db.getSnapshot());
    }

    // L'app lasciata aperta sul telefono resta indietro: quando torna in
    // primo piano riscarica il cloud, cosi non si registra su un programma
    // vecchio.
    let refreshing = false;
    function handleVisibility() {
      if (document.visibilityState !== "visible" || refreshing) return;
      refreshing = true;
      void loadFromCloud().finally(() => {
        refreshing = false;
      });
    }

    window.addEventListener(ARM_TRACKER_STORAGE_EVENT, handleStorageSync);
    window.addEventListener("storage", handleStorageSync);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener(ARM_TRACKER_STORAGE_EVENT, handleStorageSync);
      window.removeEventListener("storage", handleStorageSync);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [applySnapshot]);

  const refresh = useCallback(() => {
    setData(db.getSnapshot());
  }, []);

  // A "mutate then push" wrapper. Applies the change locally
  // immediately (optimistic) and syncs to cloud in the background. If
  // the cloud push errors, the state stays as-is locally and the next
  // successful save resyncs.
  async function commitMutation<T>(mutation: () => T): Promise<T> {
    // Copia profonda: alcune mutazioni potrebbero toccare gli oggetti in
    // memoria, e serve lo stato di prima per sapere cosa e cambiato.
    const before = structuredClone(db.getSnapshot());
    const result = mutation();
    const nextSnapshot = db.getSnapshot();
    setData(nextSnapshot);
    mutationCounterRef.current += 1;
    const mutationId = mutationCounterRef.current;
    const diff = diffArmTrackerSnapshots(before, nextSnapshot);
    void pushSnapshotBestEffort(diff, seedVersionRef.current ?? db.getSeedVersion()).then((cloud) => {
      // Il server risponde con lo stato unito: lo si adotta (vince il cloud)
      // solo se nel frattempo non e arrivata un'altra modifica locale.
      if (cloud && mutationId === mutationCounterRef.current) {
        applySnapshot(mergeArmTrackerSnapshots(db.getSnapshot(), cloud));
      }
    });
    return result;
  }

  async function importPlan(input: ImportPlanInput) {
    return commitMutation(() => importParsedPlan(input));
  }

  async function createSession(input: CreateCustomSessionInput) {
    return commitMutation(() => createCustomSession(input));
  }

  async function saveWorkoutLog(input: SaveWorkoutLogInput) {
    return commitMutation(() => saveWorkoutLogEntry(input));
  }

  async function addWatchlistExercise(exerciseName: string) {
    await commitMutation(() => addWatchlistExerciseMutation(exerciseName));
  }

  async function removeWatchlistExercise(exerciseName: string) {
    await commitMutation(() => removeWatchlistExerciseMutation(exerciseName));
  }

  async function updateDashboardConfig(update: (config: DashboardConfig) => DashboardConfig) {
    return commitMutation(() => updateDashboardConfigMutation(update));
  }

  async function setIsometryTarget(
    exerciseName: string,
    input: { volumeTargetSeconds: number; recordTargetSeconds?: number | null }
  ) {
    return commitMutation(() => setIsometryTargetMutation(exerciseName, input));
  }

  async function resetIsometryTarget(exerciseName: string) {
    await commitMutation(() => resetIsometryTargetMutation(exerciseName));
  }

  async function deleteWorkoutLog(workoutLogId: string) {
    await commitMutation(() => deleteWorkoutLogMutation(workoutLogId));
  }

  async function logArmwrestlingSession(input: LogArmwrestlingSessionInput) {
    return commitMutation(() => logArmwrestlingSessionMutation(input));
  }

  function exportArchive() {
    return exportArmTrackerArchive(data);
  }

  async function importArchive(file: File) {
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".json")) {
      throw new Error("Formato non supportato. Usa un archivio JSON esportato da Iron Log.");
    }
    const payload = await file.text();
    const remoteResult = await importRemoteArchive({ payload });
    applySnapshot(remoteResult.snapshot);
    return {
      exportedAt: remoteResult.exportedAt,
      counts: remoteResult.counts,
      added: remoteResult.added
    };
  }

  function findSessionDetails(sessionId: string) {
    return getSessionDetails(data, sessionId);
  }

  return (
    <ArmTrackerContext.Provider
      value={{
        data,
        isReady,
        cloudReachable,
        syncStatus: alwaysReady,
        activePlan: getActivePlan(data),
        refresh,
        importPlan,
        createCustomSession: createSession,
        saveWorkoutLog,
        exportArchive,
        importArchive,
        findSessionDetails,
        addWatchlistExercise,
        removeWatchlistExercise,
        updateDashboardConfig,
        setIsometryTarget,
        resetIsometryTarget,
        deleteWorkoutLog,
        logArmwrestlingSession
      }}
    >
      {children}
    </ArmTrackerContext.Provider>
  );
}

export function useArmTracker() {
  const context = useContext(ArmTrackerContext);

  if (!context) {
    throw new Error("useArmTracker deve essere usato dentro ArmTrackerProvider.");
  }

  return context;
}
