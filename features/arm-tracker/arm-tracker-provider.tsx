"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { createCustomSession, importParsedPlan, saveWorkoutLogEntry } from "@/lib/arm-tracker/mutations";
import { readWorkbook } from "@/lib/arm-tracker/excel-parser";
import { parseHistoricalWorkbook } from "@/lib/arm-tracker/historical-workbook";
import {
  createIronLogHistorySeedData,
  IRON_LOG_HISTORY_SEED_VERSION
} from "@/lib/arm-tracker/iron-log-history-seed";
import { getActivePlan, getSessionDetails } from "@/lib/arm-tracker/selectors";
import {
  ARM_TRACKER_STORAGE_EVENT,
  createEmptyArmTrackerData,
  db,
  exportArmTrackerArchive,
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

  useEffect(() => {
    function syncFromStorage() {
      setData(db.getSnapshot());
      setIsReady(true);
    }

    const snapshot = db.getSnapshot();
    const hasUserData = db.hasUserData(snapshot);
    const hasCurrentSeed = db.getSeedVersion() === IRON_LOG_HISTORY_SEED_VERSION;

    if (!hasCurrentSeed && !hasUserData) {
      db.setSnapshot(createIronLogHistorySeedData());
      db.setSeedVersion(IRON_LOG_HISTORY_SEED_VERSION);
    } else if (!hasCurrentSeed && hasUserData) {
      importArmTrackerSnapshot(createIronLogHistorySeedData());
      db.setSeedVersion(IRON_LOG_HISTORY_SEED_VERSION);
    }

    syncFromStorage();

    function handleStorageSync() {
      syncFromStorage();
    }

    window.addEventListener(ARM_TRACKER_STORAGE_EVENT, handleStorageSync);
    window.addEventListener("storage", handleStorageSync);

    return () => {
      window.removeEventListener(ARM_TRACKER_STORAGE_EVENT, handleStorageSync);
      window.removeEventListener("storage", handleStorageSync);
    };
  }, []);

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
