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
const level100DefaultIsometryExercises = ["Back Lever", "L-Sit", "Handstand Hold"] as const;
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
        "list-row flex items-center justify-between gap-3",
        isSelected ? "border-primary/45 bg-primary/10" : ""
      ].join(" ")}
    >
      <button
        type="button"
        className="grid min-w-0 flex-1 gap-3 text-left md:grid-cols-[36px_1fr_auto]"
        onClick={onSelect}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] font-mono text-sm font-semibold text-muted-foreground">
          {rank}
        </span>
        <div className="min-w-0 space-y-2">
          <div>
            <p className="truncate font-medium text-foreground">{exercise.exerciseName}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {exercise.rule.label} - {exercise.rule.formulaLabel}
            </p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className={`h-full rounded-full ${getLevelBarClassName(exercise.level)}`}
              style={{ width: `${getLevelProgressPercent(exercise.level)}%` }}
            />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="flex items-center justify-end gap-2">
            <span className="data-chip">{getLevelTierLabel(exercise.level)}</span>
            <p className={`font-mono text-3xl font-semibold ${getLevelNumberClassName(exercise.level)}`}>
              {exercise.level}
            </p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatRecordMeta(exercise)}
          </p>
        </div>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-9 w-9 shrink-0 px-0 text-muted-foreground hover:text-destructive"
        aria-label={`Elimina ${exercise.exerciseName}`}
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
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
  onClear
}: {
  exercise: Level100Exercise | null;
  manualRecord: Level100ManualRecord | null;
  onSave: (record: Level100ManualRecord) => void;
  onClear: (exerciseName: string) => void;
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
        <Button type="button" size="sm" onClick={saveRecord}>
          Salva record
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onClear(exercise.exerciseName)}>
          Ripristina import
        </Button>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data, activePlan, isReady } = useArmTracker();
  const [bodyweightInput, setBodyweightInput] = useState("90");
  const [watchlistNames, setWatchlistNames] = useState<string[]>(() =>
    dedupeWatchlist(LEVEL_100_TARGET_EXERCISES)
  );
  const [newExerciseName, setNewExerciseName] = useState("");
  const [selectedExerciseName, setSelectedExerciseName] = useState<string | null>(watchlistNames[0] ?? null);
  const [classFilter, setClassFilter] = useState<Level100ClassFilter>("all");
  const [watchlistLoaded, setWatchlistLoaded] = useState(false);
  const [manualRecords, setManualRecords] = useState<Record<string, Level100ManualRecord>>({});
  const [manualRecordsLoaded, setManualRecordsLoaded] = useState(false);
  const availableLevel100ExerciseOptions = useMemo(
    () =>
      dedupeWatchlist([
        ...LEVEL_100_TARGET_EXERCISES,
        ...getExerciseLibraryOptions(data),
        ...watchlistNames
      ]).sort((left, right) => left.localeCompare(right, "it")),
    [data, watchlistNames]
  );

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(level100WatchlistStorageKey);

      if (!storedValue) {
        setWatchlistLoaded(true);
        return;
      }

      const parsedValue = JSON.parse(storedValue);

      if (Array.isArray(parsedValue)) {
        const rawStoredNames = parsedValue.filter((name): name is string => typeof name === "string");
        const shouldAddIsometryDefaults = !window.localStorage.getItem(level100WatchlistMigrationStorageKey);
        const shouldExpandArmwrestlingSides = !window.localStorage.getItem(level100ArmwrestlingSidesMigrationStorageKey);
        const storedNames = shouldExpandArmwrestlingSides
          ? expandArmwrestlingWatchlistSides(rawStoredNames)
          : rawStoredNames;
        const nextWatchlist = dedupeWatchlist(
          shouldAddIsometryDefaults ? [...storedNames, ...level100DefaultIsometryExercises] : storedNames
        );

        if (nextWatchlist.length) {
          setWatchlistNames(nextWatchlist);
          setSelectedExerciseName((currentName) => currentName ?? nextWatchlist[0] ?? null);
        }

        if (shouldAddIsometryDefaults) {
          window.localStorage.setItem(level100WatchlistMigrationStorageKey, "done");
        }

        if (shouldExpandArmwrestlingSides) {
          window.localStorage.setItem(level100ArmwrestlingSidesMigrationStorageKey, "done");
        }
      }
    } catch {
      window.localStorage.removeItem(level100WatchlistStorageKey);
    } finally {
      setWatchlistLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!watchlistLoaded) {
      return;
    }

    window.localStorage.setItem(level100WatchlistStorageKey, JSON.stringify(watchlistNames));

    if (!watchlistNames.length) {
      setSelectedExerciseName(null);
      return;
    }

    if (!selectedExerciseName || !watchlistNames.some((name) => name === selectedExerciseName)) {
      setSelectedExerciseName(watchlistNames[0] ?? null);
    }
  }, [selectedExerciseName, watchlistLoaded, watchlistNames]);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(level100ManualRecordsStorageKey);

      if (storedValue) {
        setManualRecords(normalizeManualRecords(JSON.parse(storedValue)));
      }
    } catch {
      window.localStorage.removeItem(level100ManualRecordsStorageKey);
    } finally {
      setManualRecordsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!manualRecordsLoaded) {
      return;
    }

    window.localStorage.setItem(level100ManualRecordsStorageKey, JSON.stringify(manualRecords));
  }, [manualRecords, manualRecordsLoaded]);

  function addWatchlistExercise() {
    const exerciseName = normalizeWatchlistName(newExerciseName);

    if (!exerciseName) {
      return;
    }

    setWatchlistNames((currentNames) => dedupeWatchlist([...currentNames, exerciseName]));
    setSelectedExerciseName(exerciseName);
    setNewExerciseName("");
  }

  function removeWatchlistExercise(exerciseName: string) {
    setWatchlistNames((currentNames) => currentNames.filter((name) => name !== exerciseName));
    setManualRecords((currentRecords) => {
      const nextRecords = { ...currentRecords };

      delete nextRecords[getDashboardExerciseKey(exerciseName)];

      return nextRecords;
    });
  }

  function saveManualRecord(record: Level100ManualRecord) {
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
                <div className="max-h-[620px] space-y-3 overflow-y-auto pr-1">
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
    <div className="page-enter space-y-8">
      <PageHeader
        eyebrow="Dashboard"
        title="Dashboard Livello 100"
        description={`Piano attivo: ${activePlan.name}. Monitorati: Squat, Stacco, Panca, Military, Pull Up, Dips, One Arm Pull Up, Side Pressure e braccia.`}
        actions={
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href={"/custom-workout/new" as Route}>Nuovo custom workout</Link>
            </Button>
            <Button asChild>
              <Link href={"/import" as Route}>Aggiorna programma</Link>
            </Button>
          </div>
        }
      />

      <section className="grid gap-6 xl:grid-cols-[1.28fr_0.72fr]">
        <Card className="overflow-hidden">
          <div className="grid gap-0 xl:grid-cols-[1.05fr_0.95fr]">
            <CardContent className="space-y-6 p-6 pt-6 sm:p-8 sm:pt-8">
              <div className="space-y-3">
                <p className="eyebrow">Dashboard Livello 100</p>
                <h2 className="text-3xl font-semibold text-foreground sm:text-4xl">
                  Tieni sotto controllo gli esercizi chiave e porta tutto a livello 100.
                </h2>
                <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                  La home resta il cockpit del programma, ma ora mette davanti i record principali:
                  target 100, massimo 130, con regole diverse per gambe, classici, braccia e corpo
                  libero.
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

              <div className="flex flex-wrap gap-2">
                <span className="data-chip">Gambe: kg / 2</span>
                <span className="data-chip">Classici: kg x 1</span>
                <span className="data-chip">Braccia: kg x 2</span>
                <span className="data-chip">Corpo libero: peso + zavorra</span>
                <span className="data-chip">Isometrie: secondi / tenuta</span>
                <span className="data-chip">Target 100 - Max 130</span>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link href={"/custom-workout/new" as Route}>
                    Segna nuovo record
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={"/stats" as Route}>Apri statistiche</Link>
                </Button>
              </div>
            </CardContent>

            <div className="panel-divider bg-white/[0.03] p-6 sm:p-8 xl:border-l xl:border-t-0">
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
                <div className="max-h-[620px] space-y-3 overflow-y-auto pr-1">
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

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <p className="eyebrow">Progress ladder</p>
              <CardTitle className="text-2xl">
                La tua progressione resta leggibile anche nel lungo periodo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-foreground">Livello {gamification.level}</p>
                  <span className="data-chip">
                    {gamification.xpIntoLevel}/{gamification.xpForNextLevel} XP
                  </span>
                </div>
                <Progress value={gamification.levelProgress} />
                <p>
                  Ogni log salva volume, stato sessione e PR in modo persistente e li trasforma
                  in avanzamento reale.
                </p>
              </div>
              <div className="list-row">
                <p className="font-medium text-foreground">Streak attuale</p>
                <p>
                  {gamification.currentWeekStreak} settimane attive di fila, massimo storico{" "}
                  {gamification.longestWeekStreak}.
                </p>
              </div>
              <div className="list-row">
                <p className="font-medium text-foreground">Record personali</p>
                <p>
                  {gamification.recordBreakCount} PR rotti nel tempo e {unlockedBadges.length}{" "}
                  badge gia sbloccati.
                </p>
              </div>
              <div className="list-row">
                <p className="font-medium text-foreground">Focus ricorrente</p>
                <p>{frequentExercise ?? "Ancora nessun esercizio ricorrente rilevato"}.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {featuredBadges.map((badge) => (
                  <span key={badge.id} className="data-chip">
                    {badge.title}: {badge.unlocked ? "sbloccato" : `${badge.current}/${badge.target}`}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Azioni rapide</p>
                <CardTitle className="mt-3 text-2xl">Non perdere il ritmo</CardTitle>
              </div>
              <Sparkles className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full justify-between">
                <Link href={"/custom-workout/new" as Route}>
                  Aggiungi un workout extra
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-between">
                <Link href={"/stats" as Route}>
                  Controlla la progressione
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-between">
                <Link href={"/history" as Route}>
                  Rivedi le sessioni salvate
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Sessioni completate"
          value={`${completedSessions}/${plannedSessions.length || 0}`}
          hint="Ritmo del piano attivo, senza mescolare le sedute extra."
          icon={<Trophy className="h-5 w-5" />}
        />
        <MetricCard
          label="Volume settimanale"
          value={formatVolume(weeklyVolume)}
          hint="Somma sets x reps x peso registrata nella settimana corrente."
          icon={<Weight className="h-5 w-5" />}
        />
        <MetricCard
          label="Livello 100"
          value={`${level100Summary.validatedCount}/${level100Summary.trackedCount}`}
          hint="Esercizi con almeno un record valido nella nuova dashboard."
          icon={<Medal className="h-5 w-5" />}
        />
        <MetricCard
          label="Badge sbloccati"
          value={unlockedBadges.length}
          hint="Milestone guadagnate restando costante tra programma e workout extra."
          icon={<BadgeCheck className="h-5 w-5" />}
        />
      </div>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Attivita recente</p>
              <CardTitle className="mt-3 text-2xl">Ultimi log salvati</CardTitle>
            </div>
            <History className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            {recentHistory.length ? (
              recentHistory.map((entry) => (
                <Link
                  key={entry.log.id}
                  href={(entry.session ? `/history/${entry.session.id}` : "/history") as Route}
                  className="list-row flex items-start justify-between gap-4"
                >
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">
                      {formatDateLabel(entry.log.performedDate)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {entry.session?.dayLabel ?? "Seduta registrata"} - {entry.exerciseNames.length} esercizi
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {entry.exerciseNames.join(", ")}
                    </p>
                  </div>
                  <StatusBadge status={entry.log.completionStatus} />
                </Link>
              ))
            ) : (
              <div className="list-row">
                <p className="text-sm leading-7 text-muted-foreground">
                  Non ci sono ancora allenamenti registrati. Appena salvi il primo log, qui trovi
                  il riepilogo rapido.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Timeline vicina</p>
              <CardTitle className="mt-3 text-2xl">Le prossime sessioni in agenda</CardTitle>
            </div>
            <Target className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            {nextSessions.length ? (
              nextSessions.map((session) => (
                <div key={session.id} className="list-row space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-foreground">
                      {session.dayLabel ?? formatDateLabel(session.sessionDate)}
                    </p>
                    <span className="data-chip">{formatDateLabel(session.sessionDate, "d MMM")}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {session.exercises.length} esercizi pronti -{" "}
                    {session.exercises
                      .slice(0, 2)
                      .map((exercise) => exercise.exerciseName)
                      .join(", ")}
                  </p>
                </div>
              ))
            ) : (
              <div className="list-row space-y-3">
                <p className="text-sm leading-7 text-muted-foreground">
                  Nessuna sessione futura individuata nel piano. Se oggi vuoi allenarti comunque,
                  crea un custom workout e tienilo nello stesso storico.
                </p>
                <Button asChild variant="outline">
                  <Link href={"/custom-workout/new" as Route}>Crea sessione extra</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
