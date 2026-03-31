import {
  differenceInCalendarDays,
  format,
  getISODay,
  getISOWeek,
  getISOWeekYear,
  parseISO,
  startOfISOWeek,
  startOfToday
} from "date-fns";
import { it } from "date-fns/locale";

import type {
  ArmTrackerData,
  Plan,
  PlanExercise,
  PlanSession,
  SessionDetails,
  SessionStatus,
  SessionWithExercises,
  WorkoutExerciseLog,
  WorkoutLog
} from "@/lib/arm-tracker/types";
import { sanitizeText } from "@/lib/utils";

const statusLabels: Record<SessionStatus, string> = {
  planned: "Pianificata",
  completed: "Completata",
  partial: "Parziale",
  skipped: "Saltata"
};

export const skippedNoteToken = "[[skipped]]";

function compareDateAsc(left: string, right: string) {
  return left.localeCompare(right);
}

function compareDateDesc(left: string, right: string) {
  return right.localeCompare(left);
}

function getExerciseVolume(exerciseLog: WorkoutExerciseLog) {
  return (exerciseLog.actualSets ?? 0) * (exerciseLog.actualReps ?? 0) * (exerciseLog.actualWeight ?? 0);
}

function hasExercisePerformance(exerciseLog: WorkoutExerciseLog) {
  return exerciseLog.actualSets !== null || exerciseLog.actualReps !== null || exerciseLog.actualWeight !== null;
}

function getPlannedSnapshot(
  exerciseLog: WorkoutExerciseLog,
  exerciseMap: Map<string, PlanExercise>
) {
  const plannedExercise = exerciseMap.get(exerciseLog.planExerciseId);

  return {
    plannedWeight: exerciseLog.plannedWeightSnapshot ?? plannedExercise?.plannedWeight ?? null,
    plannedReps: exerciseLog.plannedRepsSnapshot ?? plannedExercise?.plannedReps ?? null,
    plannedSets: exerciseLog.plannedSetsSnapshot ?? plannedExercise?.plannedSets ?? null,
    plannedNotes: exerciseLog.plannedNotesSnapshot ?? plannedExercise?.plannedNotes ?? null
  };
}

function getPlanExercisesForSession(data: ArmTrackerData, sessionId: string) {
  return data.exercises
    .filter((exercise) => exercise.sessionId === sessionId)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

export function isCustomSession(session: Pick<PlanSession, "kind">) {
  return session.kind === "custom";
}

export function parseInputNumber(value: string) {
  const normalizedValue = value.trim().replace(",", ".");

  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

export function normalizeQuery(value: string) {
  return sanitizeText(value, 120)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function cleanExerciseLabel(value: string) {
  return sanitizeText(value, 120)
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function extractExerciseCandidates(value: string) {
  const cleanedValue = cleanExerciseLabel(value);
  const bracketMatches = [...cleanedValue.matchAll(/\[([^\]]+)\]/g)]
    .map((match) => cleanExerciseLabel(match[1] ?? ""))
    .filter(Boolean);
  const withoutParentheses = cleanExerciseLabel(cleanedValue.replace(/\([^)]*\)/g, " "));
  const withoutBrackets = cleanExerciseLabel(cleanedValue.replace(/\[[^\]]*\]/g, " "));
  const withoutDecorators = cleanExerciseLabel(
    cleanedValue
      .replace(/^\d+\s*-\s*[^[]+\[\s*/i, "")
      .replace(/^(back|chest|core|pulling|pushing|extras|saturday wl)\s*\[\s*/i, "")
      .replace(/\]$/g, "")
  );

  return [...new Set(
    [cleanedValue, withoutParentheses, withoutBrackets, withoutDecorators, ...bracketMatches]
      .map((candidate) => cleanExerciseLabel(candidate))
      .filter(Boolean)
  )];
}

function includesAny(value: string, patterns: string[]) {
  return patterns.some((pattern) => value.includes(pattern));
}

function isWeightOnlyCandidate(candidate: string) {
  return /^\d+\s*(kg|kgs|kgx.*)?$/i.test(candidate.trim());
}

function isNoiseExerciseCandidate(candidate: string) {
  const normalized = normalizeQuery(candidate);

  if (!normalized) {
    return true;
  }

  if (
    normalized === "esercizio" ||
    normalized.startsWith("allenamento ") ||
    normalized.startsWith("http") ||
    normalized.includes("my-personaltrainer") ||
    normalized.includes("circonferenze") ||
    normalized.includes("plicometria") ||
    normalized.includes("miglioramento %") ||
    normalized.includes("recupero attivo") ||
    normalized.includes("riposo")
  ) {
    return true;
  }

  if (
    /^(back|chest|core|pulling|pushing|extras|saturday wl)$/.test(normalized) ||
    /^(back|chest|core|pulling|pushing|extras|saturday wl)\s*\[/.test(normalized) ||
    /^\d+\s*-\s*(tirata|spinta|leve e gambe|misto)/.test(normalized)
  ) {
    return true;
  }

  return false;
}

function isFilteredCanonicalExerciseName(name: string) {
  const normalized = normalizeQuery(name);
  return !normalized || normalized === "esercizio" || normalized === "altro";
}

function getExerciseCandidateScore(candidate: string) {
  const normalized = normalizeQuery(candidate);
  let score = candidate.length;

  if (/[\[\]()]/.test(candidate)) {
    score += 20;
  }

  if (/\d/.test(candidate)) {
    score += 10;
  }

  if (/^(back|chest|core|pulling|pushing|extras|saturday wl)\s*\[/.test(normalized)) {
    score += 20;
  }

  if (/^\d+\s*-/.test(normalized)) {
    score += 20;
  }

  if (normalized.includes("obiettivo") || normalized.includes("min.") || normalized.includes("xmax")) {
    score += 10;
  }

  return score;
}

function pickFallbackExerciseCandidate(candidates: string[]) {
  return [...candidates].sort((left, right) => {
    const scoreDifference = getExerciseCandidateScore(left) - getExerciseCandidateScore(right);

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return left.length - right.length;
  })[0] ?? null;
}

function canonicalizeExerciseName(rawName: string) {
  const candidates = extractExerciseCandidates(rawName);
  const normalizedRawName = normalizeQuery(rawName);
  const meaningfulCandidates = candidates.filter((candidate) => !isNoiseExerciseCandidate(candidate));
  const canonicalCandidates = meaningfulCandidates.length ? meaningfulCandidates : candidates;
  const normalizedCandidates = canonicalCandidates.map((candidate) => normalizeQuery(candidate));
  const hasPattern = (...patterns: string[]) =>
    normalizedCandidates.some((candidate) => includesAny(candidate, patterns));

  if (
    hasPattern("pull up zavorrato", "trazione classica zavorrata", "pullups weight") ||
    ((hasPattern("trazioni", "trazione", "pull up") && hasPattern("kg")) || hasPattern("weighted pull up"))
  ) {
    return "Pull Up zavorrato";
  }

  if (
    (
      hasPattern(
        "pull up libero",
        "pull up",
        "trazioni libero",
        "pull&chin ups",
        "pull up pf anelli",
        "libero trazioni"
      ) ||
      (hasPattern("trazioni", "trazione") && hasPattern("libero"))
    ) &&
    !hasPattern("zavorr", "kg", "weighted")
  ) {
    return "Pull Up";
  }

  if (/^trazioni?\s*\[/.test(normalizedRawName)) {
    return hasPattern("kg") ? "Pull Up zavorrato" : "Pull Up";
  }

  if (normalizedRawName.includes("pulling [") && hasPattern("pu")) {
    return "Pull Up";
  }

  if (
    hasPattern("dips zavorrati", "dips zavorrate", "dip weighted") ||
    (hasPattern("dips", "dip") && hasPattern("kg"))
  ) {
    return "Dips zavorrati";
  }

  if (hasPattern("military press")) {
    return "Military Press";
  }

  if (hasPattern("arnold press")) {
    return "Arnold Press";
  }

  if (hasPattern("alzate laterali", "lateral raise")) {
    return "Alzate Laterali";
  }

  if (hasPattern("face pull")) {
    return "Face Pull";
  }

  if (hasPattern("verticale", "free handstand")) {
    return "Handstand";
  }

  if (hasPattern("handstand push up", "supported handstand push up", "hspu")) {
    return "Handstand Push Up";
  }

  if (hasPattern("handstand push holds")) {
    return "Handstand Hold";
  }

  if (hasPattern("free handstand")) {
    return "Handstand";
  }

  if (hasPattern("shoulder press da seduto", "shoulder press")) {
    return "Shoulder Press da seduto";
  }

  if (hasPattern("panca piana")) {
    return "Panca Piana";
  }

  if (hasPattern("panca inclinata manubri", "panca inclinata")) {
    return "Panca Inclinata Manubri";
  }

  if (hasPattern("rematore con bilanciere", "bent over rows", "rematore")) {
    return "Rematore con Bilanciere";
  }

  if (hasPattern("stacco da terra", "stacco hex bar", "stacco")) {
    return "Stacco da terra";
  }

  if (hasPattern("squat 1l", "squat")) {
    return "Squat";
  }

  if (hasPattern("affondi")) {
    return "Affondi";
  }

  if (hasPattern("reverse nordic")) {
    return "Reverse Nordic Curl";
  }

  if (hasPattern("nordic hamstring")) {
    return "Nordic Hamstring Curls";
  }

  if (hasPattern("jump squat", "jump power", "jump")) {
    return "Jump Squat";
  }

  if (hasPattern("muscle up", "mu anelli")) {
    return "Muscle Up";
  }

  if (hasPattern("oap", "assistito")) {
    return "One Arm Pull Up";
  }

  if (
    hasPattern(
      "assisted one arm pull up",
      "one arm pull up",
      "pull up hold 1hand",
      "negative one arm pull up"
    )
  ) {
    return "One Arm Pull Up";
  }

  if (hasPattern("one arm push up", "flessioni 1 mano")) {
    return "One Arm Push Up";
  }

  if (hasPattern("australian row")) {
    return "Australian Row";
  }

  if (hasPattern("tuck planche push up", "tucked planche pu", "planche pu", "pseudo push up")) {
    return "Planche Push Up";
  }

  if (hasPattern("tuck planche hold", "tucked planche hold", "planche lean", "forward leans")) {
    return "Planche";
  }

  if (
    hasPattern(
      "front lever",
      "tucked front lever",
      "tucked fl hold",
      "fl row",
      "front 1 leg",
      "maker front 1 leg",
      "row l-tucked"
    )
  ) {
    return "Front Lever";
  }

  if (hasPattern("back lever")) {
    return "Back Lever";
  }

  if (hasPattern("dead hang", "pull up hold max")) {
    return "Dead Hang";
  }

  if (hasPattern("l sit")) {
    return "L-Sit";
  }

  if (hasPattern("weighted sit ups", "weighted sit up", "sit up", "crunch completo")) {
    return "Weighted Sit Ups";
  }

  if (hasPattern("crunch", "crunches")) {
    return "Crunch";
  }

  if (hasPattern("hanging leg raise", "leg raises")) {
    return "Hanging Leg Raise";
  }

  if (hasPattern("windshield wipers")) {
    return "Windshield Wipers";
  }

  if (hasPattern("triceps extension", "tricep extension", "french press", "tricep extension sbarra")) {
    return "Triceps Extension";
  }

  if (hasPattern("tricipi al cavo")) {
    return "Triceps Extension";
  }

  if (hasPattern("reverse curl")) {
    return "Reverse Curl";
  }

  if (hasPattern("hammer curl")) {
    return "Hammer Curl";
  }

  if (hasPattern("curl bilanc", "x100 curl", "curl ")) {
    return "Curl";
  }

  if (hasPattern("abs wheel")) {
    return "Abs Wheel";
  }

  if (hasPattern("wrist roller")) {
    return "Wrist Roller";
  }

  if (hasPattern("dead hang", "dead 1 hand hang", "hand hang")) {
    return "Dead Hang";
  }

  if (hasPattern("push up") && !hasPattern("one arm", "handstand", "planche", "dip")) {
    return "Push Ups";
  }

  if (hasPattern("flessioni")) {
    return "Push Ups";
  }

  if (hasPattern("one hand pu")) {
    return "One Arm Push Up";
  }

  if (hasPattern("dip") && !hasPattern("kg", "weighted", "zavorr")) {
    return "Dip";
  }

  if (hasPattern("pronation", "pronazione")) {
    return "Pronation";
  }

  if (hasPattern("supination", "supinazione")) {
    return "Supination";
  }

  if (hasPattern("cupping")) {
    return "Cupping";
  }

  if (hasPattern("side pressure")) {
    return "Side Pressure";
  }

  if (hasPattern("back pressure")) {
    return "Back Pressure";
  }

  if (hasPattern("shrugs hex bar")) {
    return "Shrugs Hex Bar";
  }

  if (hasPattern("toes to bar")) {
    return "Toes to Bar";
  }

  if (hasPattern("iso dragon flag", "dragon flag")) {
    return "Dragon Flag";
  }

  if (hasPattern("planche hold")) {
    return "Planche";
  }

  const fallbackCandidate =
    pickFallbackExerciseCandidate(
      canonicalCandidates.filter(
        (candidate) => !isWeightOnlyCandidate(candidate) && !isNoiseExerciseCandidate(candidate)
      )
    ) ??
    pickFallbackExerciseCandidate(canonicalCandidates.filter((candidate) => !isWeightOnlyCandidate(candidate))) ??
    cleanExerciseLabel(rawName);

  return isNoiseExerciseCandidate(fallbackCandidate) ? "Altro" : fallbackCandidate;
}

function getExerciseKey(rawName: string) {
  return normalizeQuery(canonicalizeExerciseName(rawName));
}

export function formatDateLabel(dateString: string | null, pattern = "d MMM yyyy") {
  if (!dateString) {
    return "Data non disponibile";
  }

  try {
    return format(parseISO(dateString), pattern, { locale: it });
  } catch {
    return dateString;
  }
}

export function formatSessionStatus(status: SessionStatus) {
  return statusLabels[status];
}

export function formatCompactWeight(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `${Number.isInteger(value) ? value : value.toFixed(1)} kg`;
}

export function formatCompactNumber(value: number | null) {
  if (value === null) {
    return "-";
  }

  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

export function formatVolume(volume: number) {
  if (volume >= 1000) {
    return `${(volume / 1000).toFixed(volume >= 10000 ? 0 : 1)}k`;
  }

  return `${Math.round(volume)}`;
}

export function formatExercisePrescription(exercise: PlanExercise) {
  const pieces = [
    exercise.plannedSets !== null ? `${exercise.plannedSets}x${exercise.plannedReps ?? "-"}` : null,
    exercise.plannedWeight !== null ? `@ ${formatCompactWeight(exercise.plannedWeight)}` : null
  ].filter(Boolean);

  if (!pieces.length && exercise.plannedNotes) {
    return exercise.plannedNotes;
  }

  return pieces.join(" ");
}

export function getActivePlan(data: ArmTrackerData) {
  return data.plans.find((plan) => plan.status === "active") ?? null;
}

export function getSessionDetails(data: ArmTrackerData, sessionId: string): SessionDetails | null {
  const session = data.sessions.find((item) => item.id === sessionId);

  if (!session) {
    return null;
  }

  const workoutLog = data.workoutLogs
    .filter((item) => item.planSessionId === sessionId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .at(-1) ?? null;

  return {
    session,
    plan: data.plans.find((plan) => plan.id === session.planId) ?? null,
    exercises: getPlanExercisesForSession(data, sessionId),
    workoutLog,
    exerciseLogs: workoutLog
      ? data.exerciseLogs
          .filter((exerciseLog) => exerciseLog.workoutLogId === workoutLog.id)
          .sort((left, right) => left.performedOrder - right.performedOrder)
      : []
  };
}

export function getPlanSessions(
  data: ArmTrackerData,
  planId: string,
  options?: { includeCustom?: boolean }
) {
  return data.sessions
    .filter(
      (session) =>
        session.planId === planId && (options?.includeCustom ? true : !isCustomSession(session))
    )
    .sort((left, right) => compareDateAsc(left.sessionDate, right.sessionDate));
}

export function getPlanSessionsWithExercises(
  data: ArmTrackerData,
  planId: string,
  options?: { includeCustom?: boolean }
): SessionWithExercises[] {
  return getPlanSessions(data, planId, options).map((session) => ({
    ...session,
    exercises: getPlanExercisesForSession(data, session.id)
  }));
}

export function getCustomSessionsWithExercises(data: ArmTrackerData, planId: string) {
  return getPlanSessionsWithExercises(data, planId, { includeCustom: true }).filter(isCustomSession);
}

export function getUpcomingSession(data: ArmTrackerData) {
  const activePlan = getActivePlan(data);

  if (!activePlan) {
    return null;
  }

  const today = startOfToday().toISOString().slice(0, 10);

  return getPlanSessionsWithExercises(data, activePlan.id).find(
    (session) => session.status === "planned" && session.sessionDate >= today
  ) ?? null;
}

export function isSkippedExerciseLog(exerciseLog: WorkoutExerciseLog) {
  return exerciseLog.notes?.startsWith(skippedNoteToken) ?? false;
}

export function stripSkippedToken(notes: string | null) {
  if (!notes) {
    return null;
  }

  return notes.replace(skippedNoteToken, "").trim() || null;
}

export function getWeeklyVolume(data: ArmTrackerData, referenceDate = new Date()) {
  const currentWeek = getISOWeek(referenceDate);
  const currentYear = getISOWeekYear(referenceDate);
  const workoutLogMap = new Map(data.workoutLogs.map((log) => [log.id, log]));

  return data.exerciseLogs.reduce((totalVolume, exerciseLog) => {
    const workoutLog = workoutLogMap.get(exerciseLog.workoutLogId);

    if (!workoutLog) {
      return totalVolume;
    }

    const performedDate = parseISO(workoutLog.performedDate);

    if (getISOWeek(performedDate) !== currentWeek || getISOWeekYear(performedDate) !== currentYear) {
      return totalVolume;
    }

    return totalVolume + getExerciseVolume(exerciseLog);
  }, 0);
}

export function getMostFrequentExercise(data: ArmTrackerData) {
  const frequency = new Map<string, number>();

  data.exerciseLogs.forEach((exerciseLog) => {
    const label = canonicalizeExerciseName(exerciseLog.exerciseNameSnapshot);
    const key = getExerciseKey(exerciseLog.exerciseNameSnapshot);

    if (!label || isFilteredCanonicalExerciseName(label)) {
      return;
    }

    frequency.set(`${key}|${label}`, (frequency.get(`${key}|${label}`) ?? 0) + 1);
  });

  const winner = [...frequency.entries()].sort((left, right) => right[1] - left[1])[0];

  if (!winner) {
    return null;
  }

  return winner[0].split("|")[1];
}

export function getLastWorkoutDate(data: ArmTrackerData) {
  const latestWorkout = [...data.workoutLogs].sort((left, right) => compareDateDesc(left.performedDate, right.performedDate))[0];
  return latestWorkout?.performedDate ?? null;
}

export function getHistoryDateRange(data: ArmTrackerData) {
  if (!data.workoutLogs.length) {
    return null;
  }

  const orderedDates = data.workoutLogs
    .map((log) => log.performedDate)
    .sort(compareDateAsc);

  return {
    start: orderedDates[0] ?? null,
    end: orderedDates.at(-1) ?? null
  };
}

export interface HistoryEntry {
  log: WorkoutLog;
  session: PlanSession | null;
  plan: Plan | null;
  exerciseLogs: WorkoutExerciseLog[];
  exerciseNames: string[];
}

export function getHistoryEntries(data: ArmTrackerData): HistoryEntry[] {
  return [...data.workoutLogs]
    .sort((left, right) => compareDateDesc(left.performedDate, right.performedDate))
    .map((log) => {
      const session = data.sessions.find((item) => item.id === log.planSessionId) ?? null;
      const plan = session ? data.plans.find((item) => item.id === session.planId) ?? null : null;
      const exerciseLogs = data.exerciseLogs
        .filter((item) => item.workoutLogId === log.id)
        .sort((leftExercise, rightExercise) => leftExercise.performedOrder - rightExercise.performedOrder);

      return {
        log,
        session,
        plan,
        exerciseLogs,
        exerciseNames: [...new Set(
          exerciseLogs
            .map((exerciseLog) => canonicalizeExerciseName(exerciseLog.exerciseNameSnapshot))
            .filter((name) => !isFilteredCanonicalExerciseName(name))
        )]
      };
    });
}

export function getAvailableHistoryYears(data: ArmTrackerData) {
  return [...new Set(
    data.workoutLogs
      .map((log) => Number.parseInt(log.performedDate.slice(0, 4), 10))
      .filter((year) => Number.isFinite(year))
  )].sort((left, right) => right - left);
}

export function filterHistoryEntriesByYear(entries: HistoryEntry[], year: number | "all") {
  if (year === "all") {
    return entries;
  }

  return entries.filter((entry) => entry.log.performedDate.startsWith(`${year}-`));
}

export function filterDataByYear(data: ArmTrackerData, year: number | "all") {
  if (year === "all") {
    return data;
  }

  const workoutLogs = data.workoutLogs.filter((log) => log.performedDate.startsWith(`${year}-`));
  const workoutLogIds = new Set(workoutLogs.map((log) => log.id));
  const exerciseLogs = data.exerciseLogs.filter((exerciseLog) => workoutLogIds.has(exerciseLog.workoutLogId));
  const sessionIds = new Set(workoutLogs.map((log) => log.planSessionId));
  const sessions = data.sessions.filter((session) => sessionIds.has(session.id));
  const planIds = new Set(sessions.map((session) => session.planId));
  const exercises = data.exercises.filter((exercise) => sessionIds.has(exercise.sessionId));
  const importRuns = data.importRuns.filter((importRun) => {
    const importYear = Number.parseInt(importRun.createdAt.slice(0, 4), 10);
    return importYear === year || planIds.size > 0;
  });

  return {
    plans: data.plans.filter((plan) => planIds.has(plan.id) || plan.status === "active"),
    sessions,
    exercises,
    workoutLogs,
    exerciseLogs,
    importRuns
  };
}

export function filterHistoryEntries(entries: HistoryEntry[], query: string) {
  const normalizedQuery = normalizeQuery(query);

  if (!normalizedQuery) {
    return entries;
  }

  return entries.filter((entry) => {
    const haystack = [
      entry.log.performedDate,
      entry.session?.dayLabel ?? "",
      ...entry.exerciseNames
    ]
      .map((item) => normalizeQuery(item))
      .join(" ");

    return haystack.includes(normalizedQuery);
  });
}

export function groupSessionsByWeek(sessions: SessionWithExercises[]) {
  const groups = new Map<string, { title: string; sessions: SessionWithExercises[] }>();

  sessions.forEach((session) => {
    const key = session.weekNumber !== null ? `week-${session.weekNumber}` : "week-null";
    const title = session.weekNumber !== null ? `Settimana ${session.weekNumber}` : "Sessioni senza settimana";
    const existingGroup = groups.get(key);

    if (existingGroup) {
      existingGroup.sessions.push(session);
      return;
    }

    groups.set(key, { title, sessions: [session] });
  });

  return [...groups.values()];
}

export function getExerciseLibraryOptions(data: ArmTrackerData) {
  return [
    ...new Set(
      [
        ...data.exercises.map((exercise) => exercise.exerciseName),
        ...data.exerciseLogs.map((log) => log.exerciseNameSnapshot)
      ]
        .map((name) => canonicalizeExerciseName(name))
        .filter((name): name is string => Boolean(name) && !isFilteredCanonicalExerciseName(name))
    )
  ].sort((left, right) => left.localeCompare(right, "it"));
}

export function getExerciseOptions(data: ArmTrackerData) {
  return [...new Set(
    data.exerciseLogs
      .map((exerciseLog) => canonicalizeExerciseName(exerciseLog.exerciseNameSnapshot))
      .filter((name): name is string => Boolean(name) && !isFilteredCanonicalExerciseName(name))
  )].sort((left, right) => left.localeCompare(right, "it"));
}

export function buildExerciseTrend(data: ArmTrackerData, exerciseName: string) {
  const normalizedExerciseName = getExerciseKey(exerciseName);
  const exerciseMap = new Map(data.exercises.map((exercise) => [exercise.id, exercise]));
  const workoutLogMap = new Map(data.workoutLogs.map((log) => [log.id, log]));

  return data.exerciseLogs
    .filter((exerciseLog) => getExerciseKey(exerciseLog.exerciseNameSnapshot) === normalizedExerciseName)
    .map((exerciseLog) => {
      const workoutLog = workoutLogMap.get(exerciseLog.workoutLogId);
      const plannedSnapshot = getPlannedSnapshot(exerciseLog, exerciseMap);

      if (!workoutLog) {
        return null;
      }

      return {
        date: workoutLog.performedDate,
        dateLabel: formatDateLabel(workoutLog.performedDate, "d MMM"),
        plannedSets: plannedSnapshot.plannedSets,
        actualSets: exerciseLog.actualSets,
        plannedWeight: plannedSnapshot.plannedWeight,
        actualWeight: exerciseLog.actualWeight,
        plannedReps: plannedSnapshot.plannedReps,
        actualReps: exerciseLog.actualReps,
        plannedVolume:
          (plannedSnapshot.plannedSets ?? 0) *
          (plannedSnapshot.plannedReps ?? 0) *
          (plannedSnapshot.plannedWeight ?? 0),
        actualVolume: getExerciseVolume(exerciseLog),
        adherence: getExerciseAdherenceScore(exerciseLog, exerciseMap)
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((left, right) => compareDateAsc(left.date, right.date));
}

export function buildWeeklyVolumeData(data: ArmTrackerData) {
  const workoutLogMap = new Map(data.workoutLogs.map((log) => [log.id, log]));
  const buckets = new Map<string, { weekLabel: string; volume: number; sortKey: string }>();

  data.exerciseLogs.forEach((exerciseLog) => {
    const workoutLog = workoutLogMap.get(exerciseLog.workoutLogId);

    if (!workoutLog) {
      return;
    }

    const performedDate = parseISO(workoutLog.performedDate);
    const isoWeek = getISOWeek(performedDate);
    const isoYear = getISOWeekYear(performedDate);
    const weekKey = `${isoYear}-${String(isoWeek).padStart(2, "0")}`;
    const existingBucket = buckets.get(weekKey);
    const volume = getExerciseVolume(exerciseLog);

    if (existingBucket) {
      existingBucket.volume += volume;
      return;
    }

    buckets.set(weekKey, {
      weekLabel: `W${isoWeek}`,
      volume,
      sortKey: weekKey
    });
  });

  return [...buckets.values()]
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
    .map(({ weekLabel, volume }) => ({ weekLabel, volume }));
}

export function buildYearlyVolumeData(data: ArmTrackerData) {
  const workoutLogMap = new Map(data.workoutLogs.map((log) => [log.id, log]));
  const buckets = new Map<number, { year: number; volume: number; workouts: Set<string> }>();

  data.exerciseLogs.forEach((exerciseLog) => {
    const workoutLog = workoutLogMap.get(exerciseLog.workoutLogId);

    if (!workoutLog) {
      return;
    }

    const year = Number.parseInt(workoutLog.performedDate.slice(0, 4), 10);

    if (!Number.isFinite(year)) {
      return;
    }

    const volume = getExerciseVolume(exerciseLog);
    const bucket = buckets.get(year);

    if (bucket) {
      bucket.volume += volume;
      bucket.workouts.add(workoutLog.id);
      return;
    }

    buckets.set(year, {
      year,
      volume,
      workouts: new Set([workoutLog.id])
    });
  });

  return [...buckets.values()]
    .sort((left, right) => left.year - right.year)
    .map((bucket) => ({
      yearLabel: `${bucket.year}`,
      volume: bucket.volume,
      workoutCount: bucket.workouts.size
    }));
}

function getExerciseAdherenceScore(
  exerciseLog: WorkoutExerciseLog,
  exerciseMap: Map<string, PlanExercise>
) {
  const plannedSnapshot = getPlannedSnapshot(exerciseLog, exerciseMap);
  const ratios = [
    plannedSnapshot.plannedSets && exerciseLog.actualSets !== null
      ? exerciseLog.actualSets / plannedSnapshot.plannedSets
      : null,
    plannedSnapshot.plannedReps && exerciseLog.actualReps !== null
      ? exerciseLog.actualReps / plannedSnapshot.plannedReps
      : null,
    plannedSnapshot.plannedWeight && exerciseLog.actualWeight !== null
      ? exerciseLog.actualWeight / plannedSnapshot.plannedWeight
      : null
  ].filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);

  if (!ratios.length) {
    return null;
  }

  const averageRatio = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
  return Math.round(Math.min(1.4, averageRatio) * 100);
}

export function getAverageAdherence(data: ArmTrackerData) {
  const exerciseMap = new Map(data.exercises.map((exercise) => [exercise.id, exercise]));
  const adherenceScores = data.exerciseLogs
    .map((exerciseLog) => getExerciseAdherenceScore(exerciseLog, exerciseMap))
    .filter((score): score is number => score !== null);

  if (!adherenceScores.length) {
    return null;
  }

  return Math.round(adherenceScores.reduce((sum, score) => sum + score, 0) / adherenceScores.length);
}

export function buildMonthlyHistoryData(data: ArmTrackerData) {
  const exerciseMap = new Map(data.exercises.map((exercise) => [exercise.id, exercise]));
  const exerciseLogsByWorkoutId = new Map<string, WorkoutExerciseLog[]>();

  data.exerciseLogs.forEach((exerciseLog) => {
    const existingLogs = exerciseLogsByWorkoutId.get(exerciseLog.workoutLogId);

    if (existingLogs) {
      existingLogs.push(exerciseLog);
      return;
    }

    exerciseLogsByWorkoutId.set(exerciseLog.workoutLogId, [exerciseLog]);
  });

  const buckets = new Map<
    string,
    {
      monthKey: string;
      monthLabel: string;
      volume: number;
      workoutCount: number;
      completedCount: number;
      adherenceTotal: number;
      adherenceCount: number;
    }
  >();

  data.workoutLogs.forEach((workoutLog) => {
    const monthKey = workoutLog.performedDate.slice(0, 7);

    if (!monthKey) {
      return;
    }

    const existingBucket = buckets.get(monthKey);
    const exerciseLogs = exerciseLogsByWorkoutId.get(workoutLog.id) ?? [];
    const volume = exerciseLogs.reduce((sum, exerciseLog) => sum + getExerciseVolume(exerciseLog), 0);
    const adherenceScores = exerciseLogs
      .map((exerciseLog) => getExerciseAdherenceScore(exerciseLog, exerciseMap))
      .filter((score): score is number => score !== null);

    if (existingBucket) {
      existingBucket.volume += volume;
      existingBucket.workoutCount += 1;
      existingBucket.completedCount += workoutLog.completionStatus === "completed" ? 1 : 0;
      existingBucket.adherenceTotal += adherenceScores.reduce((sum, score) => sum + score, 0);
      existingBucket.adherenceCount += adherenceScores.length;
      return;
    }

    buckets.set(monthKey, {
      monthKey,
      monthLabel: formatDateLabel(`${monthKey}-01`, "MMM yy"),
      volume,
      workoutCount: 1,
      completedCount: workoutLog.completionStatus === "completed" ? 1 : 0,
      adherenceTotal: adherenceScores.reduce((sum, score) => sum + score, 0),
      adherenceCount: adherenceScores.length
    });
  });

  return [...buckets.values()]
    .sort((left, right) => left.monthKey.localeCompare(right.monthKey))
    .map((bucket) => ({
      monthKey: bucket.monthKey,
      monthLabel: bucket.monthLabel,
      volume: bucket.volume,
      workoutCount: bucket.workoutCount,
      adherence: bucket.adherenceCount ? Math.round(bucket.adherenceTotal / bucket.adherenceCount) : null,
      completionRate: bucket.workoutCount
        ? Math.round((bucket.completedCount / bucket.workoutCount) * 100)
        : 0
    }));
}

export function buildWeekdayPatternData(data: ArmTrackerData) {
  const dayLabels = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
  const workoutLogsById = new Map(data.workoutLogs.map((workoutLog) => [workoutLog.id, workoutLog]));
  const buckets = dayLabels.map((dayLabel, index) => ({
    dayLabel,
    isoDay: index + 1,
    workoutCount: 0,
    volume: 0
  }));

  data.workoutLogs.forEach((workoutLog) => {
    const isoDay = getISODay(parseISO(workoutLog.performedDate));
    const bucket = buckets[isoDay - 1];

    if (!bucket) {
      return;
    }

    bucket.workoutCount += 1;
  });

  data.exerciseLogs.forEach((exerciseLog) => {
    const workoutLog = workoutLogsById.get(exerciseLog.workoutLogId);

    if (!workoutLog) {
      return;
    }

    const isoDay = getISODay(parseISO(workoutLog.performedDate));
    const bucket = buckets[isoDay - 1];

    if (!bucket) {
      return;
    }

    bucket.volume += getExerciseVolume(exerciseLog);
  });

  return buckets;
}

export function buildStatusDistributionData(data: ArmTrackerData) {
  const distribution = new Map<WorkoutLog["completionStatus"], number>([
    ["completed", 0],
    ["partial", 0],
    ["skipped", 0]
  ]);

  data.workoutLogs.forEach((workoutLog) => {
    distribution.set(workoutLog.completionStatus, (distribution.get(workoutLog.completionStatus) ?? 0) + 1);
  });

  return [
    {
      key: "completed",
      label: statusLabels.completed,
      value: distribution.get("completed") ?? 0,
      fill: "#2eb3a3"
    },
    {
      key: "partial",
      label: statusLabels.partial,
      value: distribution.get("partial") ?? 0,
      fill: "#ffb020"
    },
    {
      key: "skipped",
      label: statusLabels.skipped,
      value: distribution.get("skipped") ?? 0,
      fill: "#ef4444"
    }
  ].filter((entry) => entry.value > 0);
}

export function buildExerciseLeaderboard(data: ArmTrackerData, limit = 8) {
  const workoutLogMap = new Map(data.workoutLogs.map((workoutLog) => [workoutLog.id, workoutLog]));
  const exerciseMap = new Map(data.exercises.map((exercise) => [exercise.id, exercise]));
  const leaderboard = new Map<
    string,
    {
      exerciseName: string;
      volume: number;
      workoutIds: Set<string>;
      bestWeight: number;
      adherenceTotal: number;
      adherenceCount: number;
    }
  >();

  data.exerciseLogs.forEach((exerciseLog) => {
    const normalizedName = getExerciseKey(exerciseLog.exerciseNameSnapshot);
    const exerciseName = canonicalizeExerciseName(exerciseLog.exerciseNameSnapshot);

    if (!normalizedName || !exerciseName || isFilteredCanonicalExerciseName(exerciseName)) {
      return;
    }

    const bucket =
      leaderboard.get(normalizedName) ??
      {
        exerciseName,
        volume: 0,
        workoutIds: new Set<string>(),
        bestWeight: 0,
        adherenceTotal: 0,
        adherenceCount: 0
      };

    bucket.volume += getExerciseVolume(exerciseLog);

    const workoutLog = workoutLogMap.get(exerciseLog.workoutLogId);

    if (workoutLog) {
      bucket.workoutIds.add(workoutLog.id);
    }

    if ((exerciseLog.actualWeight ?? 0) > bucket.bestWeight) {
      bucket.bestWeight = exerciseLog.actualWeight ?? 0;
    }

    const adherenceScore = getExerciseAdherenceScore(exerciseLog, exerciseMap);

    if (adherenceScore !== null) {
      bucket.adherenceTotal += adherenceScore;
      bucket.adherenceCount += 1;
    }

    leaderboard.set(normalizedName, bucket);
  });

  return [...leaderboard.values()]
    .map((entry) => ({
      exerciseName: entry.exerciseName,
      volume: Math.round(entry.volume),
      workoutCount: entry.workoutIds.size,
      bestWeight: entry.bestWeight || null,
      adherence: entry.adherenceCount ? Math.round(entry.adherenceTotal / entry.adherenceCount) : null
    }))
    .sort((left, right) => {
      if (right.volume === left.volume) {
        return right.workoutCount - left.workoutCount;
      }

      return right.volume - left.volume;
    })
    .slice(0, limit);
}

export function computeCompletionSummary(session: PlanSession, exerciseLogs: WorkoutExerciseLog[]) {
  const skippedCount = exerciseLogs.filter(isSkippedExerciseLog).length;
  const completedCount = exerciseLogs.filter(
    (exerciseLog) => !isSkippedExerciseLog(exerciseLog) && hasExercisePerformance(exerciseLog)
  ).length;

  return {
    label: formatSessionStatus(session.status),
    skippedCount,
    completedCount
  };
}

export interface PersonalRecord {
  exerciseName: string;
  category: "weight" | "reps" | "volume";
  value: number;
  date: string;
  label: string;
}

export interface GamificationBadge {
  id: string;
  title: string;
  description: string;
  current: number;
  target: number;
  unlocked: boolean;
}

export interface GamificationSummary {
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  levelProgress: number;
  currentWeekStreak: number;
  longestWeekStreak: number;
  totalWorkouts: number;
  completedWorkouts: number;
  customWorkoutsLogged: number;
  totalVolume: number;
  recordBreakCount: number;
  personalRecords: PersonalRecord[];
  badges: GamificationBadge[];
}

function getLevelMetrics(totalXp: number) {
  let level = 1;
  let spentXp = 0;
  let currentThreshold = 120;

  while (totalXp >= spentXp + currentThreshold) {
    spentXp += currentThreshold;
    level += 1;
    currentThreshold = 120 + (level - 1) * 35;
  }

  return {
    level,
    xpIntoLevel: totalXp - spentXp,
    xpForNextLevel: currentThreshold,
    levelProgress: Math.round(((totalXp - spentXp) / currentThreshold) * 100)
  };
}

function getWeekStreaks(workoutLogs: WorkoutLog[]) {
  const uniqueWeekStarts = [...new Set(workoutLogs.map((log) => startOfISOWeek(parseISO(log.performedDate)).toISOString()))]
    .map((value) => parseISO(value))
    .sort((left, right) => left.getTime() - right.getTime());

  if (!uniqueWeekStarts.length) {
    return { currentWeekStreak: 0, longestWeekStreak: 0 };
  }

  let longestWeekStreak = 1;
  let currentChain = 1;

  for (let index = 1; index < uniqueWeekStarts.length; index += 1) {
    const difference = differenceInCalendarDays(uniqueWeekStarts[index], uniqueWeekStarts[index - 1]);

    if (difference === 7) {
      currentChain += 1;
      longestWeekStreak = Math.max(longestWeekStreak, currentChain);
    } else {
      currentChain = 1;
    }
  }

  const currentWeekStart = startOfISOWeek(new Date());
  const lastLoggedWeekStart = uniqueWeekStarts.at(-1) ?? null;

  if (!lastLoggedWeekStart || differenceInCalendarDays(currentWeekStart, lastLoggedWeekStart) > 7) {
    return { currentWeekStreak: 0, longestWeekStreak };
  }

  let currentWeekStreak = 1;

  for (let index = uniqueWeekStarts.length - 1; index > 0; index -= 1) {
    const difference = differenceInCalendarDays(uniqueWeekStarts[index], uniqueWeekStarts[index - 1]);

    if (difference === 7) {
      currentWeekStreak += 1;
      continue;
    }

    break;
  }

  return { currentWeekStreak, longestWeekStreak };
}

function getPersonalRecordSummary(data: ArmTrackerData) {
  const workoutLogMap = new Map(data.workoutLogs.map((log) => [log.id, log]));
  const exerciseLogs = [...data.exerciseLogs].sort((left, right) => {
    const leftDate = workoutLogMap.get(left.workoutLogId)?.performedDate ?? "";
    const rightDate = workoutLogMap.get(right.workoutLogId)?.performedDate ?? "";

    if (leftDate === rightDate) {
      return left.performedOrder - right.performedOrder;
    }

    return leftDate.localeCompare(rightDate);
  });
  const bestWeightByExercise = new Map<string, number>();
  const bestRepsByExercise = new Map<string, number>();
  const bestVolumeByExercise = new Map<string, number>();
  const personalRecords = new Map<string, PersonalRecord>();
  let recordBreakCount = 0;

  exerciseLogs.forEach((exerciseLog) => {
    if (isSkippedExerciseLog(exerciseLog)) {
      return;
    }

    const workoutLog = workoutLogMap.get(exerciseLog.workoutLogId);

    if (!workoutLog) {
      return;
    }

    const normalizedName = getExerciseKey(exerciseLog.exerciseNameSnapshot);
    const volume = getExerciseVolume(exerciseLog);

    if (exerciseLog.actualWeight !== null) {
      const previousBestWeight = bestWeightByExercise.get(normalizedName) ?? Number.NEGATIVE_INFINITY;

      if (exerciseLog.actualWeight > previousBestWeight) {
        bestWeightByExercise.set(normalizedName, exerciseLog.actualWeight);
        personalRecords.set(`${normalizedName}-weight`, {
          exerciseName: canonicalizeExerciseName(exerciseLog.exerciseNameSnapshot),
          category: "weight",
          value: exerciseLog.actualWeight,
          date: workoutLog.performedDate,
          label: `${formatCompactWeight(exerciseLog.actualWeight)}`
        });

        if (previousBestWeight !== Number.NEGATIVE_INFINITY) {
          recordBreakCount += 1;
        }
      }
    }

    if (exerciseLog.actualReps !== null) {
      const previousBestReps = bestRepsByExercise.get(normalizedName) ?? Number.NEGATIVE_INFINITY;

      if (exerciseLog.actualReps > previousBestReps) {
        bestRepsByExercise.set(normalizedName, exerciseLog.actualReps);
        personalRecords.set(`${normalizedName}-reps`, {
          exerciseName: canonicalizeExerciseName(exerciseLog.exerciseNameSnapshot),
          category: "reps",
          value: exerciseLog.actualReps,
          date: workoutLog.performedDate,
          label: `${formatCompactNumber(exerciseLog.actualReps)} reps`
        });

        if (previousBestReps !== Number.NEGATIVE_INFINITY) {
          recordBreakCount += 1;
        }
      }
    }

    if (volume > 0) {
      const previousBestVolume = bestVolumeByExercise.get(normalizedName) ?? Number.NEGATIVE_INFINITY;

      if (volume > previousBestVolume) {
        bestVolumeByExercise.set(normalizedName, volume);
        personalRecords.set(`${normalizedName}-volume`, {
          exerciseName: canonicalizeExerciseName(exerciseLog.exerciseNameSnapshot),
          category: "volume",
          value: volume,
          date: workoutLog.performedDate,
          label: `${formatVolume(volume)} vol`
        });

        if (previousBestVolume !== Number.NEGATIVE_INFINITY) {
          recordBreakCount += 1;
        }
      }
    }
  });

  return {
    recordBreakCount,
    personalRecords: [...personalRecords.values()].sort((left, right) => compareDateDesc(left.date, right.date))
  };
}

function getGamificationBadges({
  totalWorkouts,
  currentWeekStreak,
  longestWeekStreak,
  recordBreakCount,
  customWorkoutsLogged,
  totalVolume
}: {
  totalWorkouts: number;
  currentWeekStreak: number;
  longestWeekStreak: number;
  recordBreakCount: number;
  customWorkoutsLogged: number;
  totalVolume: number;
}) {
  const badges: GamificationBadge[] = [
    {
      id: "first-log",
      title: "Ignition",
      description: "Salva il primo allenamento nello storico.",
      current: totalWorkouts,
      target: 1,
      unlocked: totalWorkouts >= 1
    },
    {
      id: "streak-builder",
      title: "Week Streak",
      description: "Resta attivo per 4 settimane consecutive.",
      current: Math.max(currentWeekStreak, longestWeekStreak),
      target: 4,
      unlocked: Math.max(currentWeekStreak, longestWeekStreak) >= 4
    },
    {
      id: "pr-hunter",
      title: "PR Hunter",
      description: "Rompi 5 record personali nel tempo.",
      current: recordBreakCount,
      target: 5,
      unlocked: recordBreakCount >= 5
    },
    {
      id: "free-agent",
      title: "Free Agent",
      description: "Registra 3 custom workout nel tuo storico.",
      current: customWorkoutsLogged,
      target: 3,
      unlocked: customWorkoutsLogged >= 3
    },
    {
      id: "volume-engine",
      title: "Volume Engine",
      description: "Accumula 10k di volume totale registrato.",
      current: Math.round(totalVolume),
      target: 10000,
      unlocked: totalVolume >= 10000
    }
  ];

  return badges;
}

export function getGamificationSummary(data: ArmTrackerData): GamificationSummary {
  const sessionMap = new Map(data.sessions.map((session) => [session.id, session]));
  const workoutLogMap = new Map(data.workoutLogs.map((log) => [log.id, log]));
  const totalWorkouts = data.workoutLogs.length;
  const completedWorkouts = data.workoutLogs.filter((log) => log.completionStatus === "completed").length;
  const customWorkoutsLogged = data.workoutLogs.filter((log) => sessionMap.get(log.planSessionId)?.kind === "custom").length;
  const totalVolume = data.exerciseLogs.reduce((sum, exerciseLog) => sum + getExerciseVolume(exerciseLog), 0);
  const { currentWeekStreak, longestWeekStreak } = getWeekStreaks(data.workoutLogs);
  const { recordBreakCount, personalRecords } = getPersonalRecordSummary(data);
  const baseXp = data.workoutLogs.reduce((sum, workoutLog) => {
    const exerciseLogs = data.exerciseLogs.filter((exerciseLog) => exerciseLog.workoutLogId === workoutLog.id);
    const completedExercises = exerciseLogs.filter(
      (exerciseLog) => !isSkippedExerciseLog(exerciseLog) && hasExercisePerformance(exerciseLog)
    ).length;
    const volume = exerciseLogs.reduce((exerciseTotal, exerciseLog) => exerciseTotal + getExerciseVolume(exerciseLog), 0);
    const completionXp =
      workoutLog.completionStatus === "completed"
        ? 90
        : workoutLog.completionStatus === "partial"
          ? 60
          : 25;

    return sum + completionXp + completedExercises * 12 + Math.min(60, Math.floor(volume / 250));
  }, 0);
  const totalXp = baseXp + recordBreakCount * 25;
  const levelMetrics = getLevelMetrics(totalXp);
  const badges = getGamificationBadges({
    totalWorkouts,
    currentWeekStreak,
    longestWeekStreak,
    recordBreakCount,
    customWorkoutsLogged,
    totalVolume
  });

  return {
    totalXp,
    level: levelMetrics.level,
    xpIntoLevel: levelMetrics.xpIntoLevel,
    xpForNextLevel: levelMetrics.xpForNextLevel,
    levelProgress: levelMetrics.levelProgress,
    currentWeekStreak,
    longestWeekStreak,
    totalWorkouts,
    completedWorkouts,
    customWorkoutsLogged,
    totalVolume,
    recordBreakCount,
    personalRecords: personalRecords.slice(0, 6).map((record) => ({
      ...record,
      date: workoutLogMap.size ? record.date : record.date
    })),
    badges
  };
}
