"use client";

import {
  ArrowRight,
  BadgeCheck,
  Crown,
  Dumbbell,
  History,
  Plus,
  Medal,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  Weight
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { LoadingPanel } from "@/features/arm-tracker/loading-panel";
import { StatusBadge } from "@/features/arm-tracker/status-badge";
import { useArmTracker } from "@/features/arm-tracker/arm-tracker-provider";
import {
  LEVEL_100_ARMWRESTLING_BASE_EXERCISES,
  LEVEL_100_TARGET_EXERCISES,
  buildLevel100Dashboard,
  canonicalizeLevel100ExerciseName,
  getLevel100Score,
  type Level100Exercise
} from "@/lib/arm-tracker/level-100";
import {
  formatDateLabel,
  formatExercisePrescription,
  formatVolume,
  getCustomSessionsWithExercises,
  getExerciseLibraryOptions,
  getExerciseOptions,
  getGamificationSummary,
  getHistoryEntries,
  getLastWorkoutDate,
  getMostFrequentExercise,
  getPlanSessionsWithExercises,
  getUpcomingSession,
  getWeeklyVolume
} from "@/lib/arm-tracker/selectors";

const level100WatchlistStorageKey = "iron_log_level_100_watchlist";
const level100ManualRecordsStorageKey = "iron_log_level_100_manual_records";
const level100WatchlistMigrationStorageKey = "iron_log_level_100_watchlist_isometries_v1";
const level100ArmwrestlingSidesMigrationStorageKey = "iron_log_level_100_armwrestling_sides_v1";
const level100StatsExercisesMigrationStorageKey = "iron_log_level_100_stats_exercises_v1";
const level100RisingBeltCurlMigrationStorageKey = "iron_log_level_100_rising_belt_curl_v1";
const level100DefaultIsometryExercises = ["Back Lever", "L-Sit", "Handstand Hold"] as const;
const level100RisingBeltCurlExercises = ["Rising Belt Curl Destro", "Rising Belt Curl Sinistro"] as const;
const level100ArmwrestlingBaseExerciseSet = new Set<string>(LEVEL_100_ARMWRESTLING_BASE_EXERCISES);

interface Level100ManualRecord {
  exerciseName: string;
  bodyweightKg: number | null;
  weight: number | null;
  reps: number | null;
  seconds: number | null;
  date: string | null;
}

type Level100ClassFilter = "all" | "classic" | "calisthenics" | "isometrics" | "armwrestling";

const level100ClassFilters: Array<{ id: Level100ClassFilter; label: string }> = [
  { id: "all", label: "Tutti" },
  { id: "classic", label: "Classici" },
  { id: "calisthenics", label: "Calisthenics" },
  { id: "isometrics", label: "Isometrie" },
  { id: "armwrestling", label: "Armwrestling" }
];

function formatRecordMeta(exercise: Level100Exercise) {
  if (exercise.validRecordCount === 0) {
    return "Da segnare";
  }

  if (exercise.bestValidWeight !== null) {
    return `${exercise.bestValidWeight} kg`;
  }

  if (exercise.bestValidReps !== null) {
    return `${exercise.bestValidReps} reps`;
  }

  if (exercise.bestValidSeconds !== null) {
    return `${exercise.bestValidSeconds}s`;
  }

  return "Record valido";
}

function getExerciseClassFilter(exercise: Level100Exercise): Exclude<Level100ClassFilter, "all"> {
  if (exercise.rule.id === "one_arm_isometry" || exercise.rule.id === "isometric_skill") {
    return "isometrics";
  }

  if (
    exercise.rule.id === "weighted_bodyweight" ||
    exercise.rule.id === "bodyweight_reps" ||
    exercise.rule.id === "one_arm_pull_up" ||
    exercise.rule.id === "dynamic_skill"
  ) {
    return "calisthenics";
  }

  if (exercise.rule.id === "arms") {
    return "armwrestling";
  }

  return "classic";
}

function getLevelNumberClassName(level: number) {
  if (level > 100) {
    return "text-fuchsia-300 drop-shadow-[0_0_14px_rgba(217,70,239,0.95)]";
  }

  if (level >= 80) {
    return "text-emerald-400";
  }

  if (level >= 60) {
    return "text-orange-400";
  }

  return "text-red-400";
}

function getLevelBarClassName(level: number) {
  if (level > 100) {
    return "bg-fuchsia-300 shadow-[0_0_18px_rgba(217,70,239,0.95)]";
  }

  if (level >= 80) {
    return "bg-emerald-400";
  }

  if (level >= 60) {
    return "bg-orange-400";
  }

  return "bg-red-400";
}

function getLevelTierLabel(level: number) {
  if (level > 100) {
    return "Neon";
  }

  if (level >= 80) {
    return "Pronto";
  }

  if (level >= 60) {
    return "In corsa";
  }

  return "Da migliorare";
}

function getLevelProgressPercent(level: number) {
  return Math.min(100, Math.round((Math.max(0, level) / 130) * 100));
}

function formatRecordDate(value: string | null) {
  return value ? formatDateLabel(value, "d MMM yyyy") : "-";
}

function normalizeWatchlistName(value: string) {
  return canonicalizeLevel100ExerciseName(value).trim();
}

function getDashboardExerciseKey(value: string) {
  return normalizeWatchlistName(value).toLowerCase();
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatNumberInputValue(value: number | null) {
  return value === null ? "" : String(value);
}

function parseNumberInputValue(value: string) {
  const parsed = Number(value.replace(",", "."));

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeManualRecords(value: unknown): Record<string, Level100ManualRecord> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.values(value)
      .filter((record): record is Partial<Level100ManualRecord> =>
        Boolean(record && typeof record === "object" && "exerciseName" in record)
      )
      .map((record) => {
        const exerciseName = normalizeWatchlistName(String(record.exerciseName ?? ""));

        return [
          getDashboardExerciseKey(exerciseName),
          {
            exerciseName,
            bodyweightKg:
              typeof record.bodyweightKg === "number" && Number.isFinite(record.bodyweightKg)
                ? record.bodyweightKg
                : null,
            weight: typeof record.weight === "number" && Number.isFinite(record.weight) ? record.weight : null,
            reps: typeof record.reps === "number" && Number.isFinite(record.reps) ? record.reps : null,
            seconds: typeof record.seconds === "number" && Number.isFinite(record.seconds) ? record.seconds : null,
            date: typeof record.date === "string" && record.date ? record.date : null
          }
        ] as const;
      })
      .filter(([, record]) => Boolean(record.exerciseName))
  );
}

function applyManualRecordsToExercises(
  exercises: Level100Exercise[],
  manualRecords: Record<string, Level100ManualRecord>,
  bodyweightKg: number
) {
  return exercises.map((exercise) => {
    const manualRecord = manualRecords[getDashboardExerciseKey(exercise.exerciseName)];

    if (!manualRecord) {
      return exercise;
    }

    const level = getLevel100Score({
      exerciseName: exercise.exerciseName,
      weight: manualRecord.weight,
      bodyweightKg: manualRecord.bodyweightKg ?? bodyweightKg,
      reps: manualRecord.reps,
      seconds: manualRecord.seconds
    });

    return {
      ...exercise,
      bestValidWeight: manualRecord.weight,
      bestValidReps: manualRecord.reps,
      bestValidSeconds: manualRecord.seconds,
      bestValidBodyweightKg: manualRecord.bodyweightKg,
      bestValidDate: manualRecord.date,
      latestDate: manualRecord.date,
      level,
      rawScore: level,
      attemptCount: Math.max(1, exercise.attemptCount),
      validRecordCount: Math.max(1, exercise.validRecordCount)
    };
  });
}

function dedupeWatchlist(names: readonly string[]) {
  const seen = new Set<string>();

  return names
    .map(normalizeWatchlistName)
    .filter((name) => {
      const key = name.toLowerCase();

      if (!name || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function expandArmwrestlingWatchlistSides(names: readonly string[]) {
  return names.flatMap((rawName) => {
    const exerciseName = normalizeWatchlistName(rawName);

    if (!level100ArmwrestlingBaseExerciseSet.has(exerciseName)) {
      return [exerciseName];
    }

    return [`${exerciseName} Destro`, `${exerciseName} Sinistro`];
  });
}

function Level100ExercisePicker({
  value,
  exerciseOptions,
  onChange,
  onAdd
}: {
  value: string;
  exerciseOptions: string[];
  onChange: (value: string) => void;
  onAdd: () => void;
}) {
  const selectValue = exerciseOptions.includes(value) ? value : "";

  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <Input
          list="level-100-exercise-library"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAdd();
            }
          }}
          placeholder="Cerca o scrivi esercizio"
          aria-label="Aggiungi esercizio Livello 100"
        />
        <Button
          type="button"
          className="h-12 w-12 shrink-0 px-0"
          aria-label="Aggiungi esercizio"
          onClick={onAdd}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <Select
        value={selectValue}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Menu esercizi disponibili"
      >
        <option value="">Scegli dal menu esercizi disponibili</option>
        {exerciseOptions.map((exerciseName) => (
          <option key={exerciseName} value={exerciseName}>
            {exerciseName}
          </option>
        ))}
      </Select>
      <datalist id="level-100-exercise-library">
        {exerciseOptions.map((exerciseName) => (
          <option key={exerciseName} value={exerciseName} />
        ))}
      </datalist>
    </div>
  );
}

function Level100CompactRow({
  exercise,
  rank,
  isSelected,
  onSelect,
  onRemove
}: {
  exercise: Level100Exercise;
  rank: number;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={[
        "group relative flex h-full flex-col gap-3 rounded-lg border bg-white/[0.025] p-3 transition",
        isSelected
          ? "border-primary/45 bg-primary/10"
          : "border-white/[0.06] hover:border-white/[0.14] hover:bg-white/[0.05]"
      ].join(" ")}
    >
      <button
        type="button"
        className="flex w-full flex-col gap-3 text-left"
        onClick={onSelect}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.04] font-mono text-[11px] font-semibold text-muted-foreground">
              {rank}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{exercise.exerciseName}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {exercise.rule.label} · {exercise.rule.formulaLabel}
              </p>
            </div>
          </div>
          <p
            className={`font-mono text-2xl font-semibold leading-none ${getLevelNumberClassName(exercise.level)}`}
          >
            {exercise.level}
          </p>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
          <div
            className={`h-full rounded-full ${getLevelBarClassName(exercise.level)}`}
            style={{ width: `${getLevelProgressPercent(exercise.level)}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 font-medium text-muted-foreground">
            {getLevelTierLabel(exercise.level)}
          </span>
          <span className="truncate text-muted-foreground">{formatRecordMeta(exercise)}</span>
        </div>
      </button>

      <button
        type="button"
        className="absolute right-2 top-2 hidden h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100 lg:flex"
        aria-label={`Elimina ${exercise.exerciseName}`}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function Level100Podium({
  exercises,
  onSelect
}: {
  exercises: Level100Exercise[];
  onSelect: (exerciseName: string) => void;
}) {
  if (!exercises.length) {
    return null;
  }

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {exercises.map((exercise, index) => {
        const isWinner = index === 0;

        return (
          <button
            key={exercise.exerciseName}
            type="button"
            className={[
              "rounded-[26px] border bg-white/[0.04] p-4 text-left transition hover:border-primary/45 hover:bg-white/[0.07]",
              isWinner ? "border-primary/45 shadow-[0_0_36px_rgba(139,92,246,0.16)]" : "border-white/[0.08]"
            ].join(" ")}
            onClick={() => onSelect(exercise.exerciseName)}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
                {isWinner ? <Crown className="h-5 w-5" /> : <Medal className="h-5 w-5" />}
              </span>
              <span className="data-chip">#{index + 1}</span>
            </div>
            <p className="mt-4 truncate font-medium text-foreground">{exercise.exerciseName}</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className={`font-mono text-4xl font-semibold ${getLevelNumberClassName(exercise.level)}`}>
                {exercise.level}
              </p>
              <p className="pb-1 text-xs text-muted-foreground">{formatRecordMeta(exercise)}</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={`h-full rounded-full ${getLevelBarClassName(exercise.level)}`}
                style={{ width: `${getLevelProgressPercent(exercise.level)}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Level100CategorySummary({
  exercises
}: {
  exercises: Level100Exercise[];
}) {
  const categoryStats = Object.values(
    exercises.reduce<Record<string, { label: string; total: number; count: number; top: number }>>(
      (accumulator, exercise) => {
        const current = accumulator[exercise.rule.label] ?? {
          label: exercise.rule.label,
          total: 0,
          count: 0,
          top: 0
        };

        current.total += exercise.level;
        current.count += 1;
        current.top = Math.max(current.top, exercise.level);
        accumulator[exercise.rule.label] = current;
        return accumulator;
      },
      {}
    )
  )
    .map((entry) => ({
      ...entry,
      average: entry.count ? Math.round(entry.total / entry.count) : 0
    }))
    .sort((left, right) => right.average - left.average)
    .slice(0, 4);

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {categoryStats.map((entry) => (
        <div key={entry.label} className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-medium text-foreground">{entry.label}</p>
            <p className={`font-mono text-xl font-semibold ${getLevelNumberClassName(entry.average)}`}>
              {entry.average}
            </p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Top {entry.top} - {entry.count} esercizi
          </p>
        </div>
      ))}
    </div>
  );
}

function Level100RecordDetail({
  exercise,
  manualRecord,
  onSave,
  onClear,
  canSave,
  syncMessage
}: {
  exercise: Level100Exercise | null;
  manualRecord: Level100ManualRecord | null;
  onSave: (record: Level100ManualRecord) => void;
  onClear: (exerciseName: string) => void;
  canSave: boolean;
  syncMessage: string | null;
}) {
  const [weightInput, setWeightInput] = useState("");
  const [recordBodyweightInput, setRecordBodyweightInput] = useState("");
  const [repsInput, setRepsInput] = useState("");
  const [secondsInput, setSecondsInput] = useState("");
  const [dateInput, setDateInput] = useState(getTodayDate());

  useEffect(() => {
    if (!exercise) {
      return;
    }

    setWeightInput(formatNumberInputValue(manualRecord?.weight ?? exercise.bestValidWeight));
    setRecordBodyweightInput(
      formatNumberInputValue(manualRecord?.bodyweightKg ?? exercise.bestValidBodyweightKg)
    );
    setRepsInput(formatNumberInputValue(manualRecord?.reps ?? exercise.bestValidReps));
    setSecondsInput(formatNumberInputValue(manualRecord?.seconds ?? exercise.bestValidSeconds));
    setDateInput(manualRecord?.date ?? exercise.bestValidDate ?? getTodayDate());
  }, [exercise, manualRecord]);

  if (!exercise) {
    return (
      <div className="list-row">
        <p className="font-medium text-foreground">Seleziona un esercizio</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Clicca una riga della Dashboard per vedere regola, record valido e distanza dal livello
          100.
        </p>
      </div>
    );
  }

  const activeExercise = exercise;
  const missingLevel = Math.max(0, 100 - activeExercise.level);
  const isManual = Boolean(manualRecord);

  function saveRecord() {
    if (!canSave) {
      return;
    }

    const nextRecord = {
      exerciseName: activeExercise.exerciseName,
      bodyweightKg: parseNumberInputValue(recordBodyweightInput),
      weight: parseNumberInputValue(weightInput),
      reps: parseNumberInputValue(repsInput),
      seconds: parseNumberInputValue(secondsInput),
      date: dateInput || getTodayDate()
    };

    if (
      nextRecord.weight === null &&
      nextRecord.reps === null &&
      nextRecord.seconds === null
    ) {
      onClear(activeExercise.exerciseName);
      return;
    }

    onSave(nextRecord);
  }

  return (
    <div className="list-row space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">{exercise.exerciseName}</p>
          <p className="mt-1 text-sm text-muted-foreground">{exercise.rule.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isManual ? <span className="data-chip">Modifica manuale</span> : null}
          <span className={`data-chip ${getLevelNumberClassName(exercise.level)}`}>
            Lv {exercise.level}/130
          </span>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Record</p>
          <p className="mt-1 text-sm text-foreground">{formatRecordMeta(exercise)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Data</p>
          <p className="mt-1 text-sm text-foreground">{formatRecordDate(exercise.bestValidDate)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Validazioni</p>
          <p className="mt-1 text-sm text-foreground">
            {exercise.validRecordCount}/{exercise.attemptCount}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Manca a 100</p>
          <p className="mt-1 text-sm text-foreground">{missingLevel}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Peso corporeo
          </label>
          <Input
            inputMode="decimal"
            value={recordBodyweightInput}
            onChange={(event) => setRecordBodyweightInput(event.target.value)}
            placeholder="es. 90"
            aria-label={`Peso corporeo record ${exercise.exerciseName}`}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Kg / zavorra
          </label>
          <Input
            inputMode="decimal"
            value={weightInput}
            onChange={(event) => setWeightInput(event.target.value)}
            placeholder="es. 100"
            aria-label={`Kg record ${exercise.exerciseName}`}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Reps
          </label>
          <Input
            inputMode="decimal"
            value={repsInput}
            onChange={(event) => setRepsInput(event.target.value)}
            placeholder="min 3"
            aria-label={`Reps record ${exercise.exerciseName}`}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Secondi iso
          </label>
          <Input
            inputMode="decimal"
            value={secondsInput}
            onChange={(event) => setSecondsInput(event.target.value)}
            placeholder="es. 10"
            aria-label={`Secondi record ${exercise.exerciseName}`}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Data
          </label>
          <Input
            type="date"
            value={dateInput}
            onChange={(event) => setDateInput(event.target.value)}
            aria-label={`Data record ${exercise.exerciseName}`}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={saveRecord} disabled={!canSave}>
          Salva record
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onClear(exercise.exerciseName)}
          disabled={!canSave}
        >
          Ripristina import
        </Button>
      </div>
      {!canSave ? (
        <p className="text-sm leading-6 text-muted-foreground">
          {syncMessage ??
            "Il record non viene salvato nel browser: serve il database cloud attivo per renderlo persistente su tutti i dispositivi."}
        </p>
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  const {
    data,
    activePlan,
    isReady,
    syncStatus,
    addWatchlistExercise: addWatchlistExerciseRemote,
    removeWatchlistExercise: removeWatchlistExerciseRemote
  } = useArmTracker();
  const [bodyweightInput, setBodyweightInput] = useState("90");
  const [newExerciseName, setNewExerciseName] = useState("");
  const [selectedExerciseName, setSelectedExerciseName] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<Level100ClassFilter>("all");
  const [manualRecords, setManualRecords] = useState<Record<string, Level100ManualRecord>>({});

  const cloudWatchlist = data.level100Watchlist;
  const watchlistNames = useMemo(
    () => (cloudWatchlist.length ? dedupeWatchlist(cloudWatchlist) : dedupeWatchlist(LEVEL_100_TARGET_EXERCISES)),
    [cloudWatchlist]
  );

  const availableLevel100ExerciseOptions = useMemo(
    () =>
      dedupeWatchlist([
        ...LEVEL_100_TARGET_EXERCISES,
        ...getExerciseLibraryOptions(data),
        ...watchlistNames
      ]).sort((left, right) => left.localeCompare(right, "it")),
    [data, watchlistNames]
  );
  const level100StatsExerciseOptions = useMemo(
    () => dedupeWatchlist(expandArmwrestlingWatchlistSides(getExerciseOptions(data))),
    [data]
  );

  // One-shot migration: read legacy localStorage watchlist + apply old migrations,
  // then push the whole list into the cloud snapshot. Idempotent via the
  // existing migration flags so we never push twice.
  useEffect(() => {
    if (!isReady || !syncStatus.canWrite) {
      return;
    }

    if (cloudWatchlist.length > 0) {
      return;
    }

    let storedNames: string[] = [];

    try {
      const storedValue = window.localStorage.getItem(level100WatchlistStorageKey);

      if (storedValue) {
        const parsedValue = JSON.parse(storedValue);

        if (Array.isArray(parsedValue)) {
          storedNames = parsedValue.filter((name): name is string => typeof name === "string");
        }
      }
    } catch {
      window.localStorage.removeItem(level100WatchlistStorageKey);
    }

    const shouldAddIsometryDefaults = !window.localStorage.getItem(level100WatchlistMigrationStorageKey);
    const shouldExpandArmwrestlingSides = !window.localStorage.getItem(level100ArmwrestlingSidesMigrationStorageKey);
    const shouldSeedStatsExercises = !window.localStorage.getItem(level100StatsExercisesMigrationStorageKey);
    const shouldSeedRisingBeltCurl = !window.localStorage.getItem(level100RisingBeltCurlMigrationStorageKey);

    const baseNames = shouldExpandArmwrestlingSides
      ? expandArmwrestlingWatchlistSides(storedNames)
      : storedNames;

    const merged = dedupeWatchlist([
      ...baseNames,
      ...LEVEL_100_TARGET_EXERCISES,
      ...(shouldAddIsometryDefaults ? level100DefaultIsometryExercises : []),
      ...(shouldSeedStatsExercises ? level100StatsExerciseOptions : []),
      ...(shouldSeedRisingBeltCurl ? level100RisingBeltCurlExercises : [])
    ]);

    if (!merged.length) {
      return;
    }

    void (async () => {
      for (const exerciseName of merged) {
        try {
          await addWatchlistExerciseRemote(exerciseName);
        } catch {
          return;
        }
      }

      window.localStorage.setItem(level100WatchlistMigrationStorageKey, "done");
      window.localStorage.setItem(level100ArmwrestlingSidesMigrationStorageKey, "done");
      window.localStorage.setItem(level100StatsExercisesMigrationStorageKey, "done");
      window.localStorage.setItem(level100RisingBeltCurlMigrationStorageKey, "done");
    })();
  }, [
    addWatchlistExerciseRemote,
    cloudWatchlist.length,
    isReady,
    level100StatsExerciseOptions,
    syncStatus.canWrite
  ]);

  useEffect(() => {
    if (!watchlistNames.length) {
      setSelectedExerciseName(null);
      return;
    }

    if (!selectedExerciseName || !watchlistNames.some((name) => name === selectedExerciseName)) {
      setSelectedExerciseName(watchlistNames[0] ?? null);
    }
  }, [selectedExerciseName, watchlistNames]);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(level100ManualRecordsStorageKey);

      if (storedValue) {
        setManualRecords(normalizeManualRecords(JSON.parse(storedValue)));
      }
    } catch {
      window.localStorage.removeItem(level100ManualRecordsStorageKey);
    }
  }, []);

  async function addWatchlistExercise() {
    const exerciseName = normalizeWatchlistName(newExerciseName);

    if (!exerciseName) {
      return;
    }

    try {
      await addWatchlistExerciseRemote(exerciseName);
      setSelectedExerciseName(exerciseName);
      setNewExerciseName("");
    } catch {
      // commit fails leave the user input intact so they can retry
    }
  }

  async function removeWatchlistExercise(exerciseName: string) {
    try {
      await removeWatchlistExerciseRemote(exerciseName);
      setManualRecords((currentRecords) => {
        const nextRecords = { ...currentRecords };

        delete nextRecords[getDashboardExerciseKey(exerciseName)];

        return nextRecords;
      });
    } catch {
      // commit fails: leave UI as is
    }
  }

  function saveManualRecord(record: Level100ManualRecord) {
    if (!syncStatus.canWrite) {
      return;
    }

    const exerciseName = normalizeWatchlistName(record.exerciseName);

    setManualRecords((currentRecords) => ({
      ...currentRecords,
      [getDashboardExerciseKey(exerciseName)]: {
        ...record,
        exerciseName
      }
    }));
  }

  function clearManualRecord(exerciseName: string) {
    if (!syncStatus.canWrite) {
      return;
    }

    setManualRecords((currentRecords) => {
      const nextRecords = { ...currentRecords };

      delete nextRecords[getDashboardExerciseKey(exerciseName)];

      return nextRecords;
    });
  }

  if (!isReady) {
    return <LoadingPanel />;
  }

  const parsedBodyweight = Number(bodyweightInput.replace(",", "."));
  const bodyweightKg = Number.isFinite(parsedBodyweight) && parsedBodyweight > 0 ? parsedBodyweight : 90;
  const level100 = buildLevel100Dashboard(data, {
    bodyweightKg,
    limit: Math.max(36, watchlistNames.length),
    pinnedExerciseNames: watchlistNames
  });
  const level100MainExercises = applyManualRecordsToExercises(
    level100.exercises.slice(0, watchlistNames.length),
    manualRecords,
    bodyweightKg
  );
  const level100FilteredExercises =
    classFilter === "all"
      ? level100MainExercises
      : level100MainExercises.filter((exercise) => getExerciseClassFilter(exercise) === classFilter);
  const level100FilterCounts = level100ClassFilters.reduce<Record<Level100ClassFilter, number>>(
    (counts, filter) => {
      counts[filter.id] =
        filter.id === "all"
          ? level100MainExercises.length
          : level100MainExercises.filter((exercise) => getExerciseClassFilter(exercise) === filter.id).length;

      return counts;
    },
    {
      all: 0,
      classic: 0,
      calisthenics: 0,
      isometrics: 0,
      armwrestling: 0
    }
  );
  const level100RankedExercises = [...level100FilteredExercises].sort((left, right) => {
    if (right.level !== left.level) {
      return right.level - left.level;
    }

    if (right.validRecordCount !== left.validRecordCount) {
      return right.validRecordCount - left.validRecordCount;
    }

    return left.exerciseName.localeCompare(right.exerciseName, "it");
  });
  const level100PodiumExercises = level100RankedExercises.slice(0, 3);
  const level100ValidatedExercises = level100FilteredExercises.filter((exercise) => exercise.validRecordCount > 0);
  const level100TotalLevel = level100ValidatedExercises.reduce((sum, exercise) => sum + exercise.level, 0);
  const level100Summary = {
    averageLevel: level100ValidatedExercises.length
      ? Math.round(level100TotalLevel / level100ValidatedExercises.length)
      : 0,
    topLevel: level100ValidatedExercises.reduce((maxLevel, exercise) => Math.max(maxLevel, exercise.level), 0),
    trackedCount: level100FilteredExercises.length,
    validatedCount: level100ValidatedExercises.length
  };
  const selectedLevel100Exercise =
    level100MainExercises.find((exercise) => exercise.exerciseName === selectedExerciseName) ??
    level100MainExercises[0] ??
    null;
  const selectedManualRecord = selectedLevel100Exercise
    ? manualRecords[getDashboardExerciseKey(selectedLevel100Exercise.exerciseName)] ?? null
    : null;
  const pendingMetricCount = level100.exercises.filter((exercise) => exercise.rule.needsDedicatedMetric).length;

  if (!activePlan) {
    return (
      <div className="page-enter space-y-8">
        <PageHeader
          eyebrow="Dashboard"
          title="Dashboard Livello 100"
          description="Gli esercizi principali sono gia pronti da monitorare. Importa il programma quando vuoi collegare storico, sedute e nuovi record."
        />

        <Card className="overflow-hidden">
          <div className="grid gap-0 xl:grid-cols-[1.05fr_0.95fr]">
            <CardContent className="space-y-6 p-6 pt-6 sm:p-8 sm:pt-8">
              <div className="space-y-3">
                <p className="eyebrow">Dashboard Livello 100</p>
                <h2 className="text-3xl font-semibold text-foreground sm:text-4xl">
                  Parti dai fondamentali, poi aggiorna il livello a ogni nuovo record.
                </h2>
                <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                  Target 100, massimo 130. Gambe divise per due, classici in kg diretti,
                  braccia moltiplicate per due e corpo libero calcolato da peso corporeo e
                  zavorra.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
                <div className="space-y-2">
                  <label
                    htmlFor="level-100-bodyweight"
                    className="text-sm font-medium text-foreground"
                  >
                    Peso corporeo
                  </label>
                  <Input
                    id="level-100-bodyweight"
                    inputMode="decimal"
                    value={bodyweightInput}
                    onChange={(event) => setBodyweightInput(event.target.value)}
                    aria-label="Peso corporeo"
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="list-row">
                    <p className="text-sm text-muted-foreground">Livello medio</p>
                    <p className={`mt-1 font-mono text-2xl font-semibold ${getLevelNumberClassName(level100Summary.averageLevel)}`}>
                      {level100Summary.averageLevel}
                    </p>
                  </div>
                  <div className="list-row">
                    <p className="text-sm text-muted-foreground">Top level</p>
                    <p className={`mt-1 font-mono text-2xl font-semibold ${getLevelNumberClassName(level100Summary.topLevel)}`}>
                      {level100Summary.topLevel}
                    </p>
                  </div>
                  <div className="list-row">
                    <p className="text-sm text-muted-foreground">Da configurare</p>
                    <p className="mt-1 font-mono text-2xl font-semibold text-foreground">
                      {pendingMetricCount}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link href={"/import" as Route}>Importa programma</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={"/program" as Route}>Esplora la struttura</Link>
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="data-chip">Gambe: kg / 2</span>
                <span className="data-chip">Classici: kg x 1</span>
                <span className="data-chip">Braccia: kg x 2</span>
                <span className="data-chip">Corpo libero: peso + zavorra</span>
                <span className="data-chip">Isometrie: secondi / tenuta</span>
                <span className="data-chip">Target 100 - Max 130</span>
              </div>
            </CardContent>

            <div className="panel-divider order-first bg-white/[0.03] p-6 sm:p-8 xl:order-none xl:border-l xl:border-t-0">
              <div className="space-y-4">
                <p className="eyebrow">Esercizi principali</p>
                <Level100ExercisePicker
                  value={newExerciseName}
                  exerciseOptions={availableLevel100ExerciseOptions}
                  onChange={setNewExerciseName}
                  onAdd={addWatchlistExercise}
                />
                <div className="flex flex-wrap gap-2">
                  {level100ClassFilters.map((filter) => (
                    <Button
                      key={filter.id}
                      type="button"
                      size="sm"
                      variant={classFilter === filter.id ? "default" : "outline"}
                      className="gap-2"
                      onClick={() => setClassFilter(filter.id)}
                    >
                      {filter.label}
                      <span className="font-mono text-xs opacity-75">{level100FilterCounts[filter.id]}</span>
                    </Button>
                  ))}
                </div>
                <Level100Podium
                  exercises={level100PodiumExercises}
                  onSelect={setSelectedExerciseName}
                />
                <Level100CategorySummary exercises={level100FilteredExercises} />
                <div className="flex items-center justify-between gap-3">
                  <p className="eyebrow">Classifica completa</p>
                  <span className="data-chip">{level100Summary.validatedCount}/{level100Summary.trackedCount} validi</span>
                </div>
                {!level100RankedExercises.length ? (
                  <div className="list-row">
                    <p className="font-medium text-foreground">Nessun esercizio in questo filtro</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Aggiungi un esercizio o passa a una categoria diversa della classifica.
                    </p>
                  </div>
                ) : null}
                <div className="space-y-3">
                  {level100RankedExercises.map((exercise, index) => {
                    const isSelected = exercise.exerciseName === selectedLevel100Exercise?.exerciseName;

                    return (
                      <div key={exercise.exerciseName} className="space-y-3">
                        <Level100CompactRow
                          exercise={exercise}
                          rank={index + 1}
                          isSelected={isSelected}
                          onSelect={() => setSelectedExerciseName(exercise.exerciseName)}
                          onRemove={() => removeWatchlistExercise(exercise.exerciseName)}
                        />
                        {isSelected ? (
                          <Level100RecordDetail
                            exercise={selectedLevel100Exercise}
                            manualRecord={selectedManualRecord}
                            onSave={saveManualRecord}
                            onClear={clearManualRecord}
                            canSave={syncStatus.canWrite}
                            syncMessage={syncStatus.message}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const plannedSessions = getPlanSessionsWithExercises(data, activePlan.id);
  const customSessions = getCustomSessionsWithExercises(data, activePlan.id);
  const completedSessions = plannedSessions.filter((session) => session.status === "completed").length;
  const completionRate = plannedSessions.length
    ? Math.round((completedSessions / plannedSessions.length) * 100)
    : 0;
  const weeklyVolume = getWeeklyVolume(data);
  const frequentExercise = getMostFrequentExercise(data);
  const lastWorkoutDate = getLastWorkoutDate(data);
  const upcomingSession = getUpcomingSession(data);
  const recentHistory = getHistoryEntries(data).slice(0, 4);
  const nextSessions = plannedSessions.filter((session) => session.status === "planned").slice(0, 3);
  const gamification = getGamificationSummary(data);
  const unlockedBadges = gamification.badges.filter((badge) => badge.unlocked);
  const featuredBadges = gamification.badges.slice(0, 3);

  return (
    <div className="page-enter space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4 lg:col-span-1">
          <label
            htmlFor="level-100-bodyweight"
            className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
          >
            Peso corporeo
          </label>
          <div className="mt-2 flex items-baseline gap-1">
            <Input
              id="level-100-bodyweight"
              inputMode="decimal"
              value={bodyweightInput}
              onChange={(event) => setBodyweightInput(event.target.value)}
              aria-label="Peso corporeo"
              className="h-9 border-white/[0.08] bg-white/[0.03] font-mono text-lg"
            />
            <span className="text-sm text-muted-foreground">kg</span>
          </div>
        </div>
        <MetricCard
          label="Livello medio"
          value={level100Summary.averageLevel}
          hint="Media sugli esercizi validati."
          icon={<Medal className="h-4 w-4" />}
        />
        <MetricCard
          label="Top level"
          value={level100Summary.topLevel}
          hint="Miglior livello raggiunto."
          icon={<Trophy className="h-4 w-4" />}
        />
        <MetricCard
          label="Validati"
          value={`${level100Summary.validatedCount}/${level100Summary.trackedCount}`}
          hint="Con almeno un record valido."
          icon={<BadgeCheck className="h-4 w-4" />}
        />
        <MetricCard
          label="Volume settimana"
          value={formatVolume(weeklyVolume)}
          hint={`${completedSessions}/${plannedSessions.length || 0} sessioni completate`}
          icon={<Weight className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="surface p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Filtra categoria
              </p>
              <span className="ml-auto text-xs text-muted-foreground">
                {level100RankedExercises.length} esercizi mostrati
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {level100ClassFilters.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setClassFilter(filter.id)}
                  className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                    classFilter === filter.id
                      ? "border-primary/40 bg-primary/15 text-foreground"
                      : "border-white/[0.06] bg-white/[0.02] text-muted-foreground hover:border-white/[0.12] hover:text-foreground"
                  }`}
                >
                  {filter.label}
                  <span className="font-mono opacity-70">{level100FilterCounts[filter.id]}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 border-t border-white/[0.06] pt-3">
              <Level100ExercisePicker
                value={newExerciseName}
                exerciseOptions={availableLevel100ExerciseOptions}
                onChange={setNewExerciseName}
                onAdd={addWatchlistExercise}
              />
            </div>
          </div>

          {!level100RankedExercises.length ? (
            <div className="surface p-6 text-center">
              <p className="text-sm font-medium text-foreground">
                Nessun esercizio in questa categoria
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Aggiungine uno con il selettore qui sopra o passa a un&apos;altra categoria.
              </p>
            </div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {level100RankedExercises.map((exercise, index) => {
                const isSelected =
                  exercise.exerciseName === selectedLevel100Exercise?.exerciseName;

                return (
                  <Level100CompactRow
                    key={exercise.exerciseName}
                    exercise={exercise}
                    rank={index + 1}
                    isSelected={isSelected}
                    onSelect={() => setSelectedExerciseName(exercise.exerciseName)}
                    onRemove={() => removeWatchlistExercise(exercise.exerciseName)}
                  />
                );
              })}
            </div>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-[4.5rem] lg:self-start">
          {selectedLevel100Exercise ? (
            <Level100RecordDetail
              exercise={selectedLevel100Exercise}
              manualRecord={selectedManualRecord}
              onSave={saveManualRecord}
              onClear={clearManualRecord}
              canSave={syncStatus.canWrite}
              syncMessage={syncStatus.message}
            />
          ) : (
            <div className="surface p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Dettaglio esercizio
              </p>
              <p className="mt-2 text-sm text-foreground">
                Clicca un esercizio a sinistra per vederne il record, la regola di calcolo e
                segnare un nuovo PR.
              </p>
              <div className="mt-3 flex flex-col gap-1.5 text-[11px] text-muted-foreground">
                <span><span className="font-mono text-foreground">Gambe</span> · kg / 2</span>
                <span><span className="font-mono text-foreground">Classici</span> · kg × 1</span>
                <span><span className="font-mono text-foreground">Braccia</span> · kg × 2</span>
                <span><span className="font-mono text-foreground">Corpo libero</span> · (peso + zavorra) / 2</span>
                <span><span className="font-mono text-foreground">Isometria</span> · ≥ 10s · peso + zavorra</span>
              </div>
            </div>
          )}

          <div className="surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Progressione globale
              </p>
              <span className="font-mono text-xs text-foreground">
                Lv {gamification.level}
              </span>
            </div>
            <Progress value={gamification.levelProgress} />
            <p className="mt-2 text-[11px] text-muted-foreground">
              {gamification.xpIntoLevel}/{gamification.xpForNextLevel} XP · Streak{" "}
              {gamification.currentWeekStreak} sett. · PR {gamification.recordBreakCount}
            </p>
          </div>

          <div className="surface p-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Azioni rapide
            </p>
            <div className="space-y-1.5">
              <Button asChild size="sm" className="w-full justify-between">
                <Link href={"/custom-workout/new" as Route}>
                  Segna nuovo record
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="w-full justify-between">
                <Link href={"/stats" as Route}>
                  Statistiche
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="w-full justify-between">
                <Link href={"/history" as Route}>
                  Storico
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </aside>
      </div>

      {level100PodiumExercises.length ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Podio attuale · {level100FilteredExercises[0]?.rule.label ?? "Tutti"}
            </p>
            <span className="text-xs text-muted-foreground">Top 3 del filtro corrente</span>
          </div>
          <Level100Podium
            exercises={level100PodiumExercises}
            onSelect={setSelectedExerciseName}
          />
        </section>
      ) : null}

      <Level100CategorySummary exercises={level100FilteredExercises} />

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Ultimi log
            </p>
            <History className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            {recentHistory.length ? (
              recentHistory.map((entry) => (
                <Link
                  key={entry.log.id}
                  href={(entry.session ? `/history/${entry.session.id}` : "/history") as Route}
                  className="flex items-start justify-between gap-3 rounded-md border border-white/[0.06] bg-white/[0.02] p-2.5 transition hover:border-white/[0.12] hover:bg-white/[0.04]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {formatDateLabel(entry.log.performedDate)}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {entry.session?.dayLabel ?? "Seduta"} · {entry.exerciseNames.length} esercizi
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {entry.exerciseNames.join(", ")}
                    </p>
                  </div>
                  <StatusBadge status={entry.log.completionStatus} />
                </Link>
              ))
            ) : (
              <p className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-muted-foreground">
                Nessun allenamento registrato. Il primo log apparirà qui.
              </p>
            )}
          </div>
        </div>

        <div className="surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Prossime sessioni
            </p>
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            {nextSessions.length ? (
              nextSessions.map((session) => (
                <div
                  key={session.id}
                  className="rounded-md border border-white/[0.06] bg-white/[0.02] p-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {session.dayLabel ?? formatDateLabel(session.sessionDate)}
                    </p>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {formatDateLabel(session.sessionDate, "d MMM")}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {session.exercises.length} esercizi ·{" "}
                    {session.exercises
                      .slice(0, 2)
                      .map((exercise) => exercise.exerciseName)
                      .join(", ")}
                  </p>
                </div>
              ))
            ) : (
              <div className="space-y-2 rounded-md border border-white/[0.06] bg-white/[0.02] p-3">
                <p className="text-xs text-muted-foreground">
                  Nessuna sessione programmata. Aggiungi un workout extra.
                </p>
                <Button asChild size="sm" variant="outline" className="w-full">
                  <Link href={"/custom-workout/new" as Route}>Crea sessione extra</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
