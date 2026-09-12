/**
 * Isometria come metrica di allenamento: record + volume + target.
 *
 * - RECORD: la migliore tenuta singola di una seduta (`actualSeconds`).
 *   Misura la prestazione massima. Es. 20s, 25s, 18s -> record 25s.
 * - VOLUME: la somma delle tenute della seduta (`actualHoldTotalSeconds`).
 *   Misura il lavoro svolto. Stesso esempio -> 63s.
 * - TARGET: quanto volume serve perche un esercizio conti come allenato, e
 *   opzionalmente un obiettivo di record. Modificabile per esercizio: i
 *   valori iniziali sono provvisori, la fase attuale e di raccolta dati.
 *
 * Tutto in un solo modulo, senza import di valore da altri moduli: il test
 * runner (node --experimental-strip-types) non risolve gli alias.
 */
import type { ArmTrackerData, IsometryTargetConfig } from "./types";

/** Volume di default: 10s accumulati per seduta, comunque spezzati. */
export const isometryTotalTargetSeconds = 10;
/** Record di default per le isometrie pure: 10s di fila, la soglia del Livello 100. */
export const defaultIsometryRecordTargetSeconds = 10;

export type IsometryStatus = "nessun-dato" | "insufficiente" | "vicino" | "raggiunto" | "superato";

export const isometryStatusLabels: Record<IsometryStatus, string> = {
  "nessun-dato": "Nessun dato",
  insufficiente: "Lavoro insufficiente",
  vicino: "Vicino al target",
  raggiunto: "Target raggiunto",
  superato: "Target superato"
};

const skippedNoteToken = "[[skipped]]";

export function normalizeIsometryKey(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Esercizi che SONO un isometria (la tenuta e il gesto, non una chiusura). */
export function isIsometryExerciseName(name: string) {
  const normalized = normalizeIsometryKey(name);

  return (
    normalized.includes("iso") ||
    normalized.includes("hold") ||
    normalized.includes("tenuta") ||
    normalized.includes("front lever") ||
    normalized.includes("back lever") ||
    normalized.includes("planche") ||
    normalized.includes("l-sit") ||
    normalized.includes("l sit") ||
    normalized.includes("handstand")
  );
}

export interface ResolvedIsometryTarget {
  volumeTargetSeconds: number;
  recordTargetSeconds: number | null;
  /** true se il target viene da una configurazione dell utente, false se e il default. */
  isCustom: boolean;
}

export function resolveIsometryTarget(
  targets: Record<string, IsometryTargetConfig> | null | undefined,
  exerciseName: string
): ResolvedIsometryTarget {
  const custom = targets?.[normalizeIsometryKey(exerciseName)];

  if (custom && Number.isFinite(custom.volumeTargetSeconds) && custom.volumeTargetSeconds > 0) {
    return {
      volumeTargetSeconds: custom.volumeTargetSeconds,
      recordTargetSeconds:
        custom.recordTargetSeconds !== null && Number.isFinite(custom.recordTargetSeconds)
          ? custom.recordTargetSeconds
          : null,
      isCustom: true
    };
  }

  return {
    volumeTargetSeconds: isometryTotalTargetSeconds,
    recordTargetSeconds: isIsometryExerciseName(exerciseName) ? defaultIsometryRecordTargetSeconds : null,
    isCustom: false
  };
}

export function getIsometryTargetSeconds(
  targets?: Record<string, IsometryTargetConfig> | null,
  exerciseName?: string
): number {
  return exerciseName
    ? resolveIsometryTarget(targets, exerciseName).volumeTargetSeconds
    : isometryTotalTargetSeconds;
}

export function hasReachedIsometryTarget(
  actualSeconds: number | null,
  targetSeconds: number = isometryTotalTargetSeconds
) {
  return actualSeconds !== null && Number.isFinite(actualSeconds) && actualSeconds >= targetSeconds;
}

export interface IsometryCompletion {
  percent: number;
  status: IsometryStatus;
}

/** Quanto del volume target e stato fatto. Le soglie sono provvisorie. */
export function getIsometryCompletion(
  volumeSeconds: number | null,
  targetSeconds: number
): IsometryCompletion {
  if (
    volumeSeconds === null ||
    !Number.isFinite(volumeSeconds) ||
    volumeSeconds <= 0 ||
    targetSeconds <= 0
  ) {
    return { percent: 0, status: "nessun-dato" };
  }

  const percent = Math.round((volumeSeconds / targetSeconds) * 100);

  if (percent < 50) return { percent, status: "insufficiente" };
  if (percent < 100) return { percent, status: "vicino" };
  if (percent < 125) return { percent, status: "raggiunto" };
  return { percent, status: "superato" };
}

export interface IsometryTrendPoint {
  date: string;
  seconds: number;
}

export interface IsometrySummary {
  exerciseName: string;
  target: ResolvedIsometryTarget;
  /** Miglior tenuta singola di sempre. */
  recordSeconds: number | null;
  recordDate: string | null;
  /** Volume della seduta piu recente in cui l isometria e stata registrata. */
  lastVolumeSeconds: number | null;
  lastVolumeDate: string | null;
  bestVolumeSeconds: number | null;
  completion: IsometryCompletion;
  recordTrend: IsometryTrendPoint[];
  volumeTrend: IsometryTrendPoint[];
  sessionsWithIsometry: number;
}

/**
 * Riepilogo isometrico di un esercizio. Il match e sul nome esatto
 * normalizzato: la canonicalizzazione del Livello 100 accorpa varianti che
 * qui vanno tenute separate.
 */
export function getIsometrySummary(
  data: ArmTrackerData,
  exerciseName: string,
  options: { trendLength?: number } = {}
): IsometrySummary {
  const trendLength = options.trendLength ?? 8;
  const key = normalizeIsometryKey(exerciseName);
  const target = resolveIsometryTarget(data.isometryTargets, exerciseName);
  const workoutLogs = new Map(data.workoutLogs.map((log) => [log.id, log]));

  const points = data.exerciseLogs
    .filter(
      (log) =>
        normalizeIsometryKey(log.exerciseNameSnapshot) === key &&
        !(log.notes ?? "").startsWith(skippedNoteToken)
    )
    .map((log) => ({
      date: workoutLogs.get(log.workoutLogId)?.performedDate ?? null,
      order: log.performedOrder,
      record: log.actualSeconds,
      volume: log.actualHoldTotalSeconds ?? null
    }))
    .filter((point): point is typeof point & { date: string } => point.date !== null)
    .sort((left, right) => left.date.localeCompare(right.date) || left.order - right.order);

  let recordSeconds: number | null = null;
  let recordDate: string | null = null;
  let bestVolumeSeconds: number | null = null;
  let lastVolumeSeconds: number | null = null;
  let lastVolumeDate: string | null = null;
  const recordTrend: IsometryTrendPoint[] = [];
  const volumeTrend: IsometryTrendPoint[] = [];
  let sessionsWithIsometry = 0;

  for (const point of points) {
    if (point.record !== null || point.volume !== null) {
      sessionsWithIsometry += 1;
    }

    if (point.record !== null && point.record > 0) {
      recordTrend.push({ date: point.date, seconds: point.record });
      if (recordSeconds === null || point.record > recordSeconds) {
        recordSeconds = point.record;
        recordDate = point.date;
      }
    }

    if (point.volume !== null && point.volume > 0) {
      volumeTrend.push({ date: point.date, seconds: point.volume });
      lastVolumeSeconds = point.volume;
      lastVolumeDate = point.date;
      if (bestVolumeSeconds === null || point.volume > bestVolumeSeconds) {
        bestVolumeSeconds = point.volume;
      }
    }
  }

  return {
    exerciseName,
    target,
    recordSeconds,
    recordDate,
    lastVolumeSeconds,
    lastVolumeDate,
    bestVolumeSeconds,
    completion: getIsometryCompletion(lastVolumeSeconds, target.volumeTargetSeconds),
    recordTrend: recordTrend.slice(-trendLength),
    volumeTrend: volumeTrend.slice(-trendLength),
    sessionsWithIsometry
  };
}
