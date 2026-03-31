"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";

import { createCustomSession, importParsedPlan, saveWorkoutLogEntry } from "@/lib/arm-tracker/mutations";
import { readWorkbook } from "@/lib/arm-tracker/excel-parser";
import { parseHistoricalWorkbook } from "@/lib/arm-tracker/historical-workbook";
import {
  createIronLogHistorySeedData,
  IRON_LOG_HISTORY_SEED_VERSION
} from "@/lib/arm-tracker/iron-log-history-seed";
import { fetchRemoteSnapshot, pushRemoteSnapshot } from "@/lib/arm-tracker/remote-sync";
import { getActivePlan, getSessionDetails } from "@/lib/arm-tracker/selectors";
import {
  ARM_TRACKER_STORAGE_EVENT,
  createEmptyArmTrackerData,
  db,
  exportArmTrackerArchive,
  getDataCounts,
  hasStoredArmTrackerData,
  importArmTrackerArchive,
  importArmTrackerSnapshot
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
  activePlan: ReturnType<typeof getActivePlan>;
  refresh: () => void;
  importPlan: (input: ImportPlanInput) => ImportPlanResult;
  createCustomSession: (input: CreateCustomSessionInput) => CreateCustomSessionResult;
  saveWorkoutLog: (input: SaveWorkoutLogInput) => ReturnType<typeof saveWorkoutLogEntry>;
  exportArchive: () => ArmTrackerArchiveExport;
  importArchive: (file: File) => Promise<ArmTrackerArchiveImportResult>;
  findSessionDetails: (sessionId: string) => SessionDetails | null;
}

const ArmTrackerContext = createContext<ArmTrackerContextValue | null>(null);

export function ArmTrackerProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ArmTrackerData>(createEmptyArmTrackerData());
  const [isReady, setIsReady] = useState(false);
  const syncEnabledRef = useRef(true);
  const syncInitializedRef = useRef(false);
  const lastSyncedPayloadRef = useRef<string | null>(null);

  function applySeedIfNeeded() {
    const snapshot = db.getSnapshot();
    const hasUserData = db.hasUserData(snapshot);
    const hasCurrentSeed = db.getSeedVersion() === IRON_LOG_HISTORY_SEED_VERSION;

    if (!hasCurrentSeed && !hasUserData) {
      db.setSnapshot(createIronLogHistorySeedData());
      db.setSeedVersion(IRON_LOG_HISTORY_SEED_VERSION);
      return db.getSnapshot();
    }

    if (!hasCurrentSeed && hasUserData) {
      importArmTrackerSnapshot(createIronLogHistorySeedData());
      db.setSeedVersion(IRON_LOG_HISTORY_SEED_VERSION);
      return db.getSnapshot();
    }

    return snapshot;
  }

  useEffect(() => {
    function syncFromStorage() {
      setData(db.getSnapshot());
      setIsReady(true);
    }

    const localSnapshot = applySeedIfNeeded();
    syncFromStorage();

    function handleStorageSync() {
      syncFromStorage();
    }

    window.addEventListener(ARM_TRACKER_STORAGE_EVENT, handleStorageSync);
    window.addEventListener("storage", handleStorageSync);

    const abortController = new AbortController();

    async function reconcileRemoteSnapshot() {
      try {
        const remote = await fetchRemoteSnapshot(abortController.signal);

        if (!remote.configured) {
          syncEnabledRef.current = false;
          syncInitializedRef.current = true;
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
          lastSyncedPayloadRef.current = JSON.stringify(remote.snapshot);
          db.setSnapshot(remote.snapshot!);

          if (remote.seedVersion?.trim()) {
            db.setSeedVersion(remote.seedVersion);
          }
        } else if (localHasData) {
          const pushed = await pushRemoteSnapshot({
            snapshot: localSnapshot,
            seedVersion: db.getSeedVersion(),
            signal: abortController.signal
          });

          if (pushed.configured) {
            lastSyncedPayloadRef.current = JSON.stringify(localSnapshot);
          } else {
            syncEnabledRef.current = false;
          }
        }
      } catch {
        syncEnabledRef.current = false;
      } finally {
        syncInitializedRef.current = true;
        syncFromStorage();
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
    if (!isReady || !syncInitializedRef.current || !syncEnabledRef.current) {
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
          return;
        }

        lastSyncedPayloadRef.current = payload;
      } catch {
        syncEnabledRef.current = false;
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

  function importPlan(input: ImportPlanInput) {
    const result = importParsedPlan(input);
    refresh();
    return result;
  }

  function createSession(input: CreateCustomSessionInput) {
    const result = createCustomSession(input);
    refresh();
    return result;
  }

  function saveWorkoutLog(input: SaveWorkoutLogInput) {
    const result = saveWorkoutLogEntry(input);
    refresh();
    return result;
  }

  function exportArchive() {
    return exportArmTrackerArchive(data);
  }

  async function importArchive(file: File) {
    const lowerName = file.name.toLowerCase();
    let result: ArmTrackerArchiveImportResult;

    if (lowerName.endsWith(".json")) {
      const payload = await file.text();
      result = importArmTrackerArchive(payload);
    } else if (lowerName.endsWith(".xls") || lowerName.endsWith(".xlsx")) {
      const buffer = await file.arrayBuffer();
      const workbook = readWorkbook(buffer);
      result = importArmTrackerSnapshot(parseHistoricalWorkbook(workbook));
    } else {
      throw new Error("Formato non supportato. Usa un archivio JSON o un workbook storico Iron Log.");
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
        activePlan: getActivePlan(data),
        refresh,
        importPlan,
        createCustomSession: createSession,
        saveWorkoutLog,
        exportArchive,
        importArchive,
        findSessionDetails
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
