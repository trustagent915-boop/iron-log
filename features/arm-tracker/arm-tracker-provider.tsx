"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";

import {
  addWatchlistExerciseMutation,
  createCustomSession,
  deleteWorkoutLogMutation,
  importParsedPlan,
  removeWatchlistExerciseMutation,
  saveWorkoutLogEntry
} from "@/lib/arm-tracker/mutations";
import { fetchRemoteSnapshot, importRemoteArchive, pushRemoteSnapshot } from "@/lib/arm-tracker/remote-sync";
import { getActivePlan, getSessionDetails } from "@/lib/arm-tracker/selectors";
import {
  ARM_TRACKER_STORAGE_EVENT,
  createEmptyArmTrackerData,
  db,
  exportArmTrackerArchive,
  getDataCounts,
  hasStoredArmTrackerData,
  mergeArmTrackerSnapshots
} from "@/lib/arm-tracker/storage";
import type {
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

interface ArmTrackerContextValue {
  data: ArmTrackerData;
  isReady: boolean;
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
  deleteWorkoutLog: (workoutLogId: string) => Promise<void>;
}

export interface ArmTrackerSyncStatus {
  state: "checking" | "ready" | "blocked";
  canWrite: boolean;
  message: string | null;
}

const ArmTrackerContext = createContext<ArmTrackerContextValue | null>(null);

const syncCheckingStatus: ArmTrackerSyncStatus = {
  state: "checking",
  canWrite: false,
  message: "Controllo del cloud in corso: i salvataggi restano bloccati finche la sincronizzazione non e confermata."
};

const syncReadyStatus: ArmTrackerSyncStatus = {
  state: "ready",
  canWrite: true,
  message: null
};

function createBlockedSyncStatus(message: string): ArmTrackerSyncStatus {
  return {
    state: "blocked",
    canWrite: false,
    message
  };
}

export function ArmTrackerProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ArmTrackerData>(createEmptyArmTrackerData());
  const [isReady, setIsReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<ArmTrackerSyncStatus>(syncCheckingStatus);
  const syncEnabledRef = useRef(true);
  const syncInitializedRef = useRef(false);
  const manualCommitInFlightRef = useRef(false);
  const lastSyncedPayloadRef = useRef<string | null>(null);

  // Cloud is the single source of truth. No client-side seeds or hardcoded
  // migrations that would fabricate data before the remote fetch resolves —
  // that was the cause of "old data appearing on Safari" for users whose
  // localStorage is empty on first visit.

  useEffect(() => {
    // Don't flip isReady until the cloud reconcile completes (success or
    // final failure). Otherwise the pages render an empty state during
    // the fetch window and the user thinks the app has lost their data.
    function refreshDataFromStorage() {
      setData(db.getSnapshot());
    }

    const localSnapshot = db.getSnapshot();
    refreshDataFromStorage();

    function handleStorageSync() {
      refreshDataFromStorage();
    }

    window.addEventListener(ARM_TRACKER_STORAGE_EVENT, handleStorageSync);
    window.addEventListener("storage", handleStorageSync);

    const abortController = new AbortController();
    let attemptCount = 0;
    const maxAttempts = 4;
    let lastErrorMessage: string | null = null;
    let hasSettled = false;

    function markSettled() {
      if (hasSettled || abortController.signal.aborted) return;
      hasSettled = true;
      syncInitializedRef.current = true;
      refreshDataFromStorage();
      setIsReady(true);
    }

    async function reconcileRemoteSnapshot() {
      attemptCount += 1;
      try {
        const remote = await fetchRemoteSnapshot(abortController.signal);

        if (!remote.configured) {
          syncEnabledRef.current = false;
          setSyncStatus(createBlockedSyncStatus(
            "Cloud non configurato: puoi leggere ed esportare i dati locali, ma non salvare nuovi allenamenti finche non colleghiamo il database unico."
          ));
          markSettled();
          return;
        }

        const localCounts = getDataCounts(localSnapshot);
        const remoteCounts = remote.snapshot ? getDataCounts(remote.snapshot) : null;
        const localHasData = hasStoredArmTrackerData(localSnapshot);
        const remoteHasData = remote.snapshot ? hasStoredArmTrackerData(remote.snapshot) : false;
        const remoteLooksRicher =
          remoteCounts !== null &&
          Object.values(remoteCounts).reduce((sum, value) => sum + value, 0) >
            Object.values(localCounts).reduce((sum, value) => sum + value, 0);

        if (remoteHasData && (!localHasData || remoteLooksRicher)) {
          const mergedSnapshot = mergeArmTrackerSnapshots(localSnapshot, remote.snapshot!);
          db.setSnapshot(mergedSnapshot);

          if (JSON.stringify(mergedSnapshot) !== JSON.stringify(remote.snapshot)) {
            const pushed = await pushRemoteSnapshot({
              snapshot: mergedSnapshot,
              seedVersion: remote.seedVersion ?? db.getSeedVersion(),
              signal: abortController.signal
            });
            lastSyncedPayloadRef.current = JSON.stringify(pushed.snapshot ?? mergedSnapshot);
          } else {
            lastSyncedPayloadRef.current = JSON.stringify(remote.snapshot);
          }

          setSyncStatus(syncReadyStatus);

          if (remote.seedVersion?.trim()) {
            db.setSeedVersion(remote.seedVersion);
          }
          markSettled();
        } else if (localHasData) {
          const pushed = await pushRemoteSnapshot({
            snapshot: localSnapshot,
            seedVersion: db.getSeedVersion(),
            signal: abortController.signal
          });

          if (pushed.configured) {
            lastSyncedPayloadRef.current = JSON.stringify(localSnapshot);
            setSyncStatus(syncReadyStatus);
          } else {
            syncEnabledRef.current = false;
            setSyncStatus(createBlockedSyncStatus(
              "Cloud non configurato: i salvataggi sono bloccati per evitare dati intrappolati su questo dispositivo."
            ));
          }
          markSettled();
        } else {
          setSyncStatus(syncReadyStatus);
          markSettled();
        }
      } catch (error) {
        lastErrorMessage = error instanceof Error ? error.message : String(error);

        // Automatic retry with exponential backoff for transient network
        // errors — mostly seen on Safari iOS on shaky Wi-Fi or right after
        // waking from lock. Give up only after the last attempt.
        if (attemptCount < maxAttempts && !abortController.signal.aborted) {
          const delayMs = 800 * Math.pow(2, attemptCount - 1);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          if (abortController.signal.aborted) {
            return;
          }
          await reconcileRemoteSnapshot();
          return;
        }

        syncEnabledRef.current = false;
        setSyncStatus(createBlockedSyncStatus(
          `Cloud non raggiungibile: ${lastErrorMessage ?? "errore sconosciuto"}. Tira giu la pagina per ricaricare.`
        ));
        markSettled();
      }
    }

    void reconcileRemoteSnapshot();

    return () => {
      abortController.abort();
      window.removeEventListener(ARM_TRACKER_STORAGE_EVENT, handleStorageSync);
      window.removeEventListener("storage", handleStorageSync);
    };
  }, []);

  useEffect(() => {
    if (
      !isReady ||
      !syncInitializedRef.current ||
      !syncEnabledRef.current ||
      manualCommitInFlightRef.current
    ) {
      return;
    }

    const payload = JSON.stringify(data);

    if (payload === lastSyncedPayloadRef.current) {
      return;
    }

    const abortController = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        const result = await pushRemoteSnapshot({
          snapshot: data,
          seedVersion: db.getSeedVersion(),
          signal: abortController.signal
        });

        if (!result.configured) {
          syncEnabledRef.current = false;
          setSyncStatus(createBlockedSyncStatus(
            "Cloud non configurato: i salvataggi sono bloccati finche non colleghiamo il database unico."
          ));
          return;
        }

        lastSyncedPayloadRef.current = payload;
      } catch {
        syncEnabledRef.current = false;
        setSyncStatus(createBlockedSyncStatus(
          "Ultimo salvataggio cloud non riuscito: i nuovi salvataggi sono bloccati finche la sincronizzazione non torna sana."
        ));
      }
    }, 400);

    return () => {
      abortController.abort();
      window.clearTimeout(timeoutId);
    };
  }, [data, isReady]);

  function refresh() {
    setData(db.getSnapshot());
    setIsReady(true);
  }

  function assertCloudWriteEnabled() {
    if (!syncStatus.canWrite) {
      throw new Error(syncStatus.message ?? "Salvataggio cloud non disponibile.");
    }
  }

  async function commitMutationToCloud<T>(mutation: () => T): Promise<T> {
    assertCloudWriteEnabled();
    const previousSnapshot = db.getSnapshot();
    const seedVersion = db.getSeedVersion();

    manualCommitInFlightRef.current = true;

    try {
      const result = mutation();
      const nextSnapshot = db.getSnapshot();
      const pushed = await pushRemoteSnapshot({
        snapshot: nextSnapshot,
        seedVersion
      });

      if (!pushed.configured) {
        throw new Error("Cloud non configurato: salvataggio annullato.");
      }

      const confirmedSnapshot = pushed.snapshot ?? nextSnapshot;
      lastSyncedPayloadRef.current = JSON.stringify(confirmedSnapshot);
      db.setSnapshot(confirmedSnapshot);
      setSyncStatus(syncReadyStatus);
      refresh();
      return result;
    } catch (error) {
      db.setSnapshot(previousSnapshot);
      syncEnabledRef.current = false;
      setSyncStatus(createBlockedSyncStatus(
        "Salvataggio cloud fallito: ho ripristinato lo stato precedente per evitare dati salvati solo su questo dispositivo."
      ));
      refresh();
      throw error;
    } finally {
      manualCommitInFlightRef.current = false;
    }
  }

  async function importPlan(input: ImportPlanInput) {
    return commitMutationToCloud(() => importParsedPlan(input));
  }

  async function createSession(input: CreateCustomSessionInput) {
    return commitMutationToCloud(() => createCustomSession(input));
  }

  async function saveWorkoutLog(input: SaveWorkoutLogInput) {
    return commitMutationToCloud(() => saveWorkoutLogEntry(input));
  }

  async function addWatchlistExercise(exerciseName: string) {
    await commitMutationToCloud(() => addWatchlistExerciseMutation(exerciseName));
  }

  async function removeWatchlistExercise(exerciseName: string) {
    await commitMutationToCloud(() => removeWatchlistExerciseMutation(exerciseName));
  }

  async function deleteWorkoutLog(workoutLogId: string) {
    await commitMutationToCloud(() => deleteWorkoutLogMutation(workoutLogId));
  }

  function exportArchive() {
    return exportArmTrackerArchive(data);
  }

  async function importArchive(file: File) {
    const lowerName = file.name.toLowerCase();
    let result: ArmTrackerArchiveImportResult;

    if (lowerName.endsWith(".json")) {
      assertCloudWriteEnabled();
      const payload = await file.text();
      const remoteResult = await importRemoteArchive({ payload });

      result = {
        exportedAt: remoteResult.exportedAt,
        counts: remoteResult.counts,
        added: remoteResult.added
      };
      lastSyncedPayloadRef.current = JSON.stringify(remoteResult.snapshot);
      db.setSnapshot(remoteResult.snapshot);
    } else {
      throw new Error("Formato non supportato. Usa un archivio JSON esportato da Iron Log.");
    }

    refresh();
    return result;
  }

  function findSessionDetails(sessionId: string) {
    return getSessionDetails(data, sessionId);
  }

  return (
    <ArmTrackerContext.Provider
      value={{
        data,
        isReady,
        syncStatus,
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
        deleteWorkoutLog
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
