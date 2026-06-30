import type { ArmTrackerData, WorkoutExerciseLog } from "./types";

export type Level100RuleId =
  | "legs"
  | "classic"
  | "arms"
  | "weighted_bodyweight"
  | "bodyweight_reps"
  | "one_arm_pull_up"
  | "one_arm_isometry"
  | "isometric_skill"
  | "dynamic_skill"
  | "conditioning"
  | "machine_cable";

export interface Level100Rule {
  id: Level100RuleId;
  label: string;
  formulaLabel: string;
  description: string;
  needsDedicatedMetric?: boolean;
}

export interface Level100ScoreInput {
  exerciseName: string;
  weight: number | null;
  bodyweightKg?: number | null;
  reps?: number | null;
  seconds?: number | null;
}

export interface Level100Exercise {
  exerciseName: string;
  rule: Level100Rule;
  attemptCount: number;
  validRecordCount: number;
  bestValidWeight: number | null;
  bestValidReps: number | null;
  bestValidSeconds: number | null;
  bestValidBodyweightKg: number | null;
  bestValidDate: string | null;
  level: number;
  rawScore: number;
  latestDate: string | null;
}

export interface Level100Dashboard {
  exercises: Level100Exercise[];
  topLevel: number;
  trackedCount: number;
  validatedCount: number;
  averageLevel: number;
}

export interface Level100DashboardOptions {
  bodyweightKg?: number | null;
  limit?: number;
  pinnedExerciseNames?: readonly string[];
}

const level100Rules: Record<Level100RuleId, Level100Rule> = {
  legs: {
    id: "legs",
    label: "Gambe",
    formulaLabel: "kg / 2",
    description: "Squat e stacco: livello = kg / 2."
  },
  classic: {
    id: "classic",
    label: "Classici",
    formulaLabel: "kg x 1",
    description: "Esercizi base a due braccia: livello = kg."
  },
  arms: {
    id: "arms",
    label: "Braccia",
    formulaLabel: "kg x 2",
    description: "Arm wrestling e monolaterali: livello = kg x 2."
  },
  weighted_bodyweight: {
    id: "weighted_bodyweight",
    label: "Corpo libero zavorrato",
    formulaLabel: "(peso + zavorra) / 2",
    description: "Pull up e dips zavorrati: livello = (peso corporeo + zavorra) / 2."
  },
  bodyweight_reps: {
    id: "bodyweight_reps",
    label: "Corpo libero",
    formulaLabel: "peso / 2",
    description: "Corpo libero senza zavorra: livello = peso corporeo / 2, con reps registrate."
  },
  one_arm_pull_up: {
    id: "one_arm_pull_up",
    label: "One Arm Pull Up",
    formulaLabel: "peso corporeo",
    description: "One Arm Pull Up completa: livello = peso corporeo, con almeno una rep."
  },
  one_arm_isometry: {
    id: "one_arm_isometry",
    label: "Isometrie",
    formulaLabel: "peso + zavorra",
    description: "Isometria One Arm valida solo a 10 secondi: livello = peso corporeo + zavorra."
  },
  isometric_skill: {
    id: "isometric_skill",
    label: "Isometrie",
    formulaLabel: "secondi x coefficiente",
    description: "Front lever, back lever, planche, handstand hold, L-sit: serve tracciare i secondi.",
    needsDedicatedMetric: true
  },
  dynamic_skill: {
    id: "dynamic_skill",
    label: "Skill dinamiche",
    formulaLabel: "reps x coefficiente",
    description: "Muscle up, HSPU, dragon flag, toes to bar: serve una formula dedicata per reps e variante.",
    needsDedicatedMetric: true
  },
  conditioning: {
    id: "conditioning",
    label: "Conditioning",
    formulaLabel: "tempo / lavoro",
    description: "Run, double under, Fran e metcon: non sono comparabili con il Livello 100 in kg.",
    needsDedicatedMetric: true
  },
  machine_cable: {
    id: "machine_cable",
    label: "Macchine / cavi",
    formulaLabel: "kg macchina",
    description: "Macchine e cavi hanno pesi non sempre comparabili: vanno separati dai bilancieri.",
    needsDedicatedMetric: true
  }
};

const maxReasonableRecordWeight = 500;
const maxLevel100Score = 130;
const defaultBodyweightKg = 90;

export const LEVEL_100_ARMWRESTLING_BASE_EXERCISES = [
  "Side Pressure",
  "Back Pressure",
  "Cupping",
  "Pronation",
  "Supination",
  "Wrist Curl",
  "Rising Belt Curl"
] as const;

const level100ArmwrestlingSidedExercises = LEVEL_100_ARMWRESTLING_BASE_EXERCISES.flatMap((exerciseName) => [
  `${exerciseName} Destro`,
  `${exerciseName} Sinistro`
]);

export const LEVEL_100_TARGET_EXERCISES = [
  "Squat",
  "Stacco da terra",
  "Panca Piana",
  "Military Press",
  "Rematore",
  "Pull Up zavorrato",
  "Dips zavorrati",
  "Pull Up",
  "One Arm Pull Up",
  "One Arm Pull Up Iso",
  ...level100ArmwrestlingSidedExercises,
  "Front Lever",
  "Back Lever",
  "Planche",
  "L-Sit",
  "Handstand Hold"
] as const;

function normalizeExerciseKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function includesAny(value: string, patterns: string[]) {
  return patterns.some((pattern) => value.includes(pattern));
}

function getBodyweight(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : defaultBodyweightKg;
}

function getExternalWeight(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function getArmwrestlingSideLabel(normalizedName: string) {
  const tokens = new Set(normalizedName.split(" "));

  if (tokens.has("destro") || tokens.has("destra") || tokens.has("dx") || tokens.has("right")) {
    return "Destro";
  }

  if (tokens.has("sinistro") || tokens.has("sinistra") || tokens.has("sx") || tokens.has("left")) {
    return "Sinistro";
  }

  return null;
}

function formatArmwrestlingExerciseName(baseName: string, normalizedName: string) {
  const sideLabel = getArmwrestlingSideLabel(normalizedName);

  return sideLabel ? `${baseName} ${sideLabel}` : baseName;
}

export function canonicalizeLevel100ExerciseName(rawName: string) {
  const normalized = normalizeExerciseKey(rawName);

  if (includesAny(normalized, ["one arm pull up iso", "one arm hold", "oap iso", "pull up hold 1hand"])) {
    return "One Arm Pull Up Iso";
  }

  if (includesAny(normalized, ["one arm pull up", "oap", "assisted one arm pull up"])) {
    return "One Arm Pull Up";
  }

  if (includesAny(normalized, ["panca piana", "bench press"])) {
    return "Panca Piana";
  }

  if (includesAny(normalized, ["squat"])) {
    return "Squat";
  }

  if (includesAny(normalized, ["stacco", "deadlift"])) {
    return "Stacco da terra";
  }

  if (includesAny(normalized, ["military press"])) {
    return "Military Press";
  }

  if (includesAny(normalized, ["shoulder press"])) {
    return "Shoulder Press";
  }

  if (includesAny(normalized, ["rematore", "bent over row"])) {
    return "Rematore";
  }

  if (
    includesAny(normalized, ["pull up zavorr", "weighted pull up", "trazioni zavorr"]) ||
    (includesAny(normalized, ["trazioni", "pull up"]) && includesAny(normalized, ["kg"]))
  ) {
    return "Pull Up zavorrato";
  }

  if (includesAny(normalized, ["trazioni", "pull up"])) {
    return "Pull Up";
  }

  if (includesAny(normalized, ["dips zavorr", "dip weighted"])) {
    return "Dips zavorrati";
  }

  if (includesAny(normalized, ["dips", "dip"])) {
    return "Dip";
  }

  if (includesAny(normalized, ["side pressure"])) {
    return formatArmwrestlingExerciseName("Side Pressure", normalized);
  }

  if (includesAny(normalized, ["back pressure"])) {
    return formatArmwrestlingExerciseName("Back Pressure", normalized);
  }

  if (includesAny(normalized, ["cupping"])) {
    return formatArmwrestlingExerciseName("Cupping", normalized);
  }

  if (includesAny(normalized, ["pronation", "pronazione"])) {
    return formatArmwrestlingExerciseName("Pronation", normalized);
  }

  if (includesAny(normalized, ["supination", "supinazione"])) {
    return formatArmwrestlingExerciseName("Supination", normalized);
  }

  if (includesAny(normalized, ["wrist curl", "wrist roller", "front wrist"])) {
    return formatArmwrestlingExerciseName("Wrist Curl", normalized);
  }

  if (includesAny(normalized, ["rising belt curl", "belt curl"])) {
    return formatArmwrestlingExerciseName("Rising Belt Curl", normalized);
  }

  if (includesAny(normalized, ["front lever"])) {
    return "Front Lever";
  }

  if (includesAny(normalized, ["back lever"])) {
    return "Back Lever";
  }

  if (includesAny(normalized, ["planche"])) {
    return "Planche";
  }

  if (includesAny(normalized, ["handstand hold", "verticale"])) {
    return "Handstand Hold";
  }

  if (includesAny(normalized, ["l sit", "lsit"])) {
    return "L-Sit";
  }

  if (includesAny(normalized, ["muscle up", "mu anelli"])) {
    return "Muscle Up";
  }

  if (includesAny(normalized, ["handstand push up", "hspu"])) {
    return "Handstand Push Up";
  }

  if (includesAny(normalized, ["dragon flag"])) {
    return "Dragon Flag";
  }

  if (includesAny(normalized, ["fran", "double under", "run", "corsa"])) {
    return rawName.replace(/\s+/g, " ").trim();
  }

  if (includesAny(normalized, ["lat machine", "pulley", "cavo", "cable", "tricipiti al cavo"])) {
    return rawName.replace(/\s+/g, " ").trim();
  }

  if (includesAny(normalized, ["curl"])) {
    return "Curl";
  }

  return rawName
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function getLevel100ExerciseRule(exerciseName: string): Level100Rule {
  const normalized = normalizeExerciseKey(exerciseName);

  if (includesAny(normalized, ["one arm pull up iso", "one arm hold", "oap iso"])) {
    return level100Rules.one_arm_isometry;
  }

  if (includesAny(normalized, ["one arm pull up", "oap"])) {
    return level100Rules.one_arm_pull_up;
  }

  if (includesAny(normalized, ["pull up zavorr", "dips zavorr", "weighted pull up", "dip weighted"])) {
    return level100Rules.weighted_bodyweight;
  }

  if (includesAny(normalized, ["pull up", "trazioni", "dip"])) {
    return level100Rules.bodyweight_reps;
  }

  if (includesAny(normalized, ["squat", "stacco", "deadlift"])) {
    return level100Rules.legs;
  }

  if (
    includesAny(normalized, [
      "side pressure",
      "back pressure",
      "cupping",
      "pronation",
      "supination",
      "wrist",
      "rising belt curl"
    ])
  ) {
    return level100Rules.arms;
  }

  if (includesAny(normalized, ["front lever", "back lever", "planche", "handstand hold", "l sit"])) {
    return level100Rules.isometric_skill;
  }

  if (includesAny(normalized, ["muscle up", "handstand push up", "hspu", "dragon flag", "toes to bar"])) {
    return level100Rules.dynamic_skill;
  }

  if (includesAny(normalized, ["fran", "double under", "run", "corsa", "metcon"])) {
    return level100Rules.conditioning;
  }

  if (includesAny(normalized, ["lat machine", "pulley", "cavo", "cable", "tricipiti al cavo"])) {
    return level100Rules.machine_cable;
  }

  return level100Rules.classic;
}

function getRawLevel100Score(input: Level100ScoreInput) {
  const rule = getLevel100ExerciseRule(input.exerciseName);
  const bodyweightKg = getBodyweight(input.bodyweightKg);
  const externalWeight = getExternalWeight(input.weight);

  if (rule.id === "legs") {
    return Math.round(externalWeight / 2);
  }

  if (rule.id === "classic") {
    return Math.round(externalWeight);
  }

  if (rule.id === "arms") {
    return Math.round(externalWeight * 2);
  }

  if (rule.id === "weighted_bodyweight") {
    return Math.round((bodyweightKg + externalWeight) / 2);
  }

  if (rule.id === "bodyweight_reps") {
    return (input.reps ?? 0) > 0 ? Math.round(bodyweightKg / 2) : 0;
  }

  if (rule.id === "one_arm_pull_up") {
    return (input.reps ?? 0) > 0 ? Math.round(bodyweightKg) : 0;
  }

  if (rule.id === "one_arm_isometry") {
    return (input.seconds ?? 0) >= 10 ? Math.round(bodyweightKg + externalWeight) : 0;
  }

  return 0;
}

export function getLevel100Score(input: Level100ScoreInput) {
  return Math.min(maxLevel100Score, getRawLevel100Score(input));
}

function isValidLevel100Record(exerciseLog: WorkoutExerciseLog, bodyweightKg: number) {
  const rule = getLevel100ExerciseRule(exerciseLog.exerciseNameSnapshot);
  const weightIsReasonable =
    exerciseLog.actualWeight === null ||
    (Number.isFinite(exerciseLog.actualWeight) &&
      exerciseLog.actualWeight >= 0 &&
      exerciseLog.actualWeight <= maxReasonableRecordWeight);

  if (!weightIsReasonable) {
    return false;
  }

  if (rule.id === "one_arm_isometry") {
    return (exerciseLog.actualSeconds ?? 0) >= 10 && bodyweightKg > 0;
  }

  if (rule.needsDedicatedMetric) {
    return false;
  }

  if (rule.id === "bodyweight_reps") {
    return (exerciseLog.actualReps ?? 0) >= 3 && bodyweightKg > 0;
  }

  if (rule.id === "one_arm_pull_up") {
    return (exerciseLog.actualReps ?? 0) >= 1 && bodyweightKg > 0;
  }

  return (
    exerciseLog.actualWeight !== null &&
    Number.isFinite(exerciseLog.actualWeight) &&
    exerciseLog.actualWeight > 0 &&
    exerciseLog.actualWeight <= maxReasonableRecordWeight &&
    (exerciseLog.actualReps ?? 0) >= 3
  );
}

export function buildLevel100Dashboard(
  data: ArmTrackerData,
  optionsOrLimit: Level100DashboardOptions | number = {}
): Level100Dashboard {
  const options =
    typeof optionsOrLimit === "number" ? { limit: optionsOrLimit } : optionsOrLimit;
  const limit = Math.max(options.limit ?? 18, options.pinnedExerciseNames?.length ?? 0);
  const bodyweightKg = getBodyweight(options.bodyweightKg);
  const workoutLogMap = new Map(data.workoutLogs.map((workoutLog) => [workoutLog.id, workoutLog]));
  const buckets = new Map<
    string,
    {
      exerciseName: string;
      attemptCount: number;
      validRecordCount: number;
      bestValidWeight: number | null;
      bestValidReps: number | null;
      bestValidSeconds: number | null;
      bestValidBodyweightKg: number | null;
      bestValidDate: string | null;
      latestDate: string | null;
    }
  >();

  data.exerciseLogs.forEach((exerciseLog) => {
    const exerciseName = canonicalizeLevel100ExerciseName(exerciseLog.exerciseNameSnapshot);
    const key = normalizeExerciseKey(exerciseName);

    if (!key || exerciseName.toLowerCase() === "esercizio") {
      return;
    }

    const workoutLog = workoutLogMap.get(exerciseLog.workoutLogId);
    const performedDate = workoutLog?.performedDate ?? null;
    const bucket =
      buckets.get(key) ??
      {
        exerciseName,
        attemptCount: 0,
        validRecordCount: 0,
        bestValidWeight: null,
        bestValidReps: null,
        bestValidSeconds: null,
        bestValidBodyweightKg: null,
        bestValidDate: null,
        latestDate: null
      };

    bucket.attemptCount += 1;

    if (performedDate && (!bucket.latestDate || performedDate > bucket.latestDate)) {
      bucket.latestDate = performedDate;
    }

    const recordBodyweightKg = getBodyweight(workoutLog?.bodyweightKg ?? bodyweightKg);

    if (isValidLevel100Record(exerciseLog, recordBodyweightKg)) {
      const score = getLevel100Score({
        exerciseName,
        weight: exerciseLog.actualWeight,
        bodyweightKg: recordBodyweightKg,
        reps: exerciseLog.actualReps,
        seconds: exerciseLog.actualSeconds
      });
      const currentBestScore = getLevel100Score({
        exerciseName,
        weight: bucket.bestValidWeight,
        bodyweightKg: bucket.bestValidBodyweightKg ?? bodyweightKg,
        reps: bucket.bestValidReps,
        seconds: bucket.bestValidSeconds
      });

      bucket.validRecordCount += 1;

      if (score > currentBestScore) {
        bucket.bestValidWeight = exerciseLog.actualWeight;
        bucket.bestValidReps = exerciseLog.actualReps;
        bucket.bestValidSeconds = exerciseLog.actualSeconds;
        bucket.bestValidBodyweightKg = recordBodyweightKg;
        bucket.bestValidDate = performedDate;
      }
    }

    buckets.set(key, bucket);
  });

  options.pinnedExerciseNames?.forEach((rawExerciseName) => {
    const exerciseName = canonicalizeLevel100ExerciseName(rawExerciseName);
    const key = normalizeExerciseKey(exerciseName);

    if (!key || buckets.has(key)) {
      return;
    }

    buckets.set(key, {
      exerciseName,
      attemptCount: 0,
      validRecordCount: 0,
      bestValidWeight: null,
      bestValidReps: null,
      bestValidSeconds: null,
      bestValidBodyweightKg: null,
      bestValidDate: null,
      latestDate: null
    });
  });

  const allExercises = [...buckets.values()]
    .map((bucket) => {
      const rule = getLevel100ExerciseRule(bucket.exerciseName);

      return {
        ...bucket,
        rule,
        level: getLevel100Score({
          exerciseName: bucket.exerciseName,
          weight: bucket.bestValidWeight,
          bodyweightKg: bucket.bestValidBodyweightKg ?? bodyweightKg,
          reps: bucket.bestValidReps,
          seconds: bucket.bestValidSeconds
        }),
        rawScore: getRawLevel100Score({
          exerciseName: bucket.exerciseName,
          weight: bucket.bestValidWeight,
          bodyweightKg: bucket.bestValidBodyweightKg ?? bodyweightKg,
          reps: bucket.bestValidReps,
          seconds: bucket.bestValidSeconds
        })
      };
    })
    .sort((left, right) => {
      if (right.attemptCount !== left.attemptCount) {
        return right.attemptCount - left.attemptCount;
      }

      if (right.level !== left.level) {
        return right.level - left.level;
      }

      return left.exerciseName.localeCompare(right.exerciseName, "it");
    });

  const exercises = options.pinnedExerciseNames?.length
    ? (() => {
        const exerciseByKey = new Map(
          allExercises.map((exercise) => [normalizeExerciseKey(exercise.exerciseName), exercise])
        );
        const pinnedKeys = new Set<string>();
        const pinnedExercises = options.pinnedExerciseNames
          .map((rawExerciseName) => {
            const key = normalizeExerciseKey(canonicalizeLevel100ExerciseName(rawExerciseName));

            if (pinnedKeys.has(key)) {
              return null;
            }

            pinnedKeys.add(key);
            return exerciseByKey.get(key) ?? null;
          })
          .filter((exercise): exercise is Level100Exercise => exercise !== null);
        const otherExercises = allExercises.filter(
          (exercise) => !pinnedKeys.has(normalizeExerciseKey(exercise.exerciseName))
        );

        return [...pinnedExercises, ...otherExercises].slice(0, limit);
      })()
    : allExercises.slice(0, limit);

  const validatedExercises = exercises.filter((exercise) => exercise.validRecordCount > 0);
  const totalLevel = validatedExercises.reduce((sum, exercise) => sum + exercise.level, 0);

  return {
    exercises,
    topLevel: validatedExercises.reduce((maxLevel, exercise) => Math.max(maxLevel, exercise.level), 0),
    trackedCount: exercises.length,
    validatedCount: validatedExercises.length,
    averageLevel: validatedExercises.length ? Math.round(totalLevel / validatedExercises.length) : 0
  };
}
