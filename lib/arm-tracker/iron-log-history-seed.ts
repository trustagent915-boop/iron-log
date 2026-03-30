import historicalSeed from "@/lib/arm-tracker/iron-log-history-seed.json";
import type { ArmTrackerData } from "@/lib/arm-tracker/types";

export const IRON_LOG_HISTORY_SEED_VERSION = historicalSeed.seedVersion;
export function createIronLogHistorySeedData(): ArmTrackerData {
  return historicalSeed.data as ArmTrackerData;
}
