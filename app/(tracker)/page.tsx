"use client";

import { AlertTriangle, BadgeCheck, Eye, Medal, Pencil, Plus, Trophy } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingPanel } from "@/features/arm-tracker/loading-panel";
import { useArmTracker } from "@/features/arm-tracker/arm-tracker-provider";
import { ExerciseDetailDialog } from "@/features/dashboard/exercise-detail-dialog";
import { ExerciseTile } from "@/features/dashboard/exercise-tile";
import {
  getDashboardExerciseKey,
  needsAttention,
  normalizeDashboardName
} from "@/features/dashboard/level-ui";
import {
  normalizeManualRecords,
  type Level100ManualRecord
} from "@/features/dashboard/manual-record-editor";
import { OverviewTab } from "@/features/dashboard/overview-tab";
import {
  hideExercise,
  moveExercise,
  pinExercise,
  resolveDashboardSections,
  unhideExercise,
  unpinExercise
} from "@/lib/arm-tracker/dashboard-config";
import { getIsometrySummary, type IsometrySummary } from "@/lib/arm-tracker/isometry-target";
import {
  LEVEL_100_TARGET_EXERCISES,
  buildLevel100Dashboard,
  getLevel100Score,
  type Level100Exercise
} from "@/lib/arm-tracker/level-100";
import { getExerciseLibraryOptions, getPlanSessionsWithExercises } from "@/lib/arm-tracker/selectors";

const manualRecordsStorageKey = "iron_log_level_100_manual_records";

type DashboardTab = "esercizi" | "panoramica";

function dedupeNames(names: readonly string[]) {
  const seen = new Set<string>();
  return names
    .map(normalizeDashboardName)
    .filter((name) => {
      const key = name.toLowerCase();
      if (!name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function applyManualRecord(
  exercise: Level100Exercise,
  record: Level100ManualRecord | undefined,
  bodyweightKg: number
): Level100Exercise {
  if (!record) return exercise;

  const level = getLevel100Score({
    exerciseName: exercise.exerciseName,
    weight: record.weight,
    bodyweightKg: record.bodyweightKg ?? bodyweightKg,
    reps: record.reps,
    seconds: record.seconds
  });

  return {
    ...exercise,
    bestValidWeight: record.weight,
    bestValidReps: record.reps,
    bestValidSeconds: record.seconds,
    bestValidBodyweightKg: record.bodyweightKg,
    bestValidDate: record.date,
    latestDate: record.date,
    level,
    rawScore: level,
    attemptCount: Math.max(1, exercise.attemptCount),
    validRecordCount: Math.max(1, exercise.validRecordCount)
  };
}

function Section({
  title,
  count,
  hint,
  children
}: {
  title: string;
  count: number;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {title} <span className="font-mono">({count})</span>
          </p>
          {hint ? <p className="truncate text-xs text-muted-foreground/80">{hint}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

/**
 * Dashboard = centro di controllo sintetico: cosa sto allenando (programma
 * attivo, entra da solo) + cosa conta di piu per me (principali) + a che
 * livello sono. I dettagli stanno nella scheda del singolo esercizio.
 */
export default function DashboardPage() {
  const {
    data,
    activePlan,
    isReady,
    updateDashboardConfig,
    setIsometryTarget,
    resetIsometryTarget
  } = useArmTracker();
  const [bodyweightInput, setBodyweightInput] = useState("90");
  const [tab, setTab] = useState<DashboardTab>("esercizi");
  const [editMode, setEditMode] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [newExerciseName, setNewExerciseName] = useState("");
  const [manualRecords, setManualRecords] = useState<Record<string, Level100ManualRecord>>({});

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(manualRecordsStorageKey);
      if (stored) setManualRecords(normalizeManualRecords(JSON.parse(stored)));
    } catch {
      window.localStorage.removeItem(manualRecordsStorageKey);
    }
  }, []);

  function persistManualRecords(next: Record<string, Level100ManualRecord>) {
    setManualRecords(next);
    try {
      window.localStorage.setItem(manualRecordsStorageKey, JSON.stringify(next));
    } catch {
      // storage pieno o bloccato: il record resta valido per la sessione
    }
  }

  const programExerciseNames = useMemo(() => {
    if (!activePlan) return [];
    return dedupeNames(
      getPlanSessionsWithExercises(data, activePlan.id, { includeCustom: true }).flatMap((session) =>
        session.exercises.map((exercise) => exercise.exerciseName)
      )
    );
  }, [activePlan, data]);

  const sections = useMemo(
    () => resolveDashboardSections(data.dashboardConfig, programExerciseNames),
    [data.dashboardConfig, programExerciseNames]
  );

  const parsedBodyweight = Number(bodyweightInput.replace(",", "."));
  const bodyweightKg = Number.isFinite(parsedBodyweight) && parsedBodyweight > 0 ? parsedBodyweight : 90;
  const allNames = useMemo(
    () => [...sections.principali, ...sections.programma, ...sections.nascosti],
    [sections]
  );

  const entriesByKey = useMemo(() => {
    const dashboard = buildLevel100Dashboard(data, {
      bodyweightKg,
      limit: Math.max(80, allNames.length),
      pinnedExerciseNames: allNames
    });
    return new Map(dashboard.exercises.map((exercise) => [getDashboardExerciseKey(exercise.exerciseName), exercise]));
  }, [allNames, bodyweightKg, data]);

  const isometryByKey = useMemo(
    () =>
      new Map<string, IsometrySummary>(
        allNames.map((name) => [getDashboardExerciseKey(name), getIsometrySummary(data, name)])
      ),
    [allNames, data]
  );

  const resolveExercise = useCallback(
    (name: string) => {
      const key = getDashboardExerciseKey(name);
      const entry = entriesByKey.get(key);
      return entry ? applyManualRecord(entry, manualRecords[key], bodyweightKg) : null;
    },
    [bodyweightKg, entriesByKey, manualRecords]
  );

  const principali = sections.principali.map(resolveExercise).filter((e): e is Level100Exercise => e !== null);
  const programma = sections.programma.map(resolveExercise).filter((e): e is Level100Exercise => e !== null);
  const nascosti = sections.nascosti.map(resolveExercise).filter((e): e is Level100Exercise => e !== null);
  const visible = [...principali, ...programma];
  const validated = visible.filter((exercise) => exercise.validRecordCount > 0);
  const averageLevel = validated.length
    ? Math.round(validated.reduce((sum, exercise) => sum + exercise.level, 0) / validated.length)
    : 0;
  const topLevel = validated.reduce((max, exercise) => Math.max(max, exercise.level), 0);
  const attentionCount = visible.filter(needsAttention).length;

  const selected = selectedName ? resolveExercise(selectedName) : null;
  const selectedKey = selectedName ? getDashboardExerciseKey(selectedName) : null;
  const isPinned = useCallback(
    (name: string) => data.dashboardConfig.pinned.some((pinned) => getDashboardExerciseKey(pinned) === getDashboardExerciseKey(name)),
    [data.dashboardConfig.pinned]
  );

  const pickerOptions = useMemo(
    () => dedupeNames([...LEVEL_100_TARGET_EXERCISES, ...getExerciseLibraryOptions(data)]).sort((a, b) => a.localeCompare(b, "it")),
    [data]
  );

  const closeDetail = useCallback(() => setSelectedName(null), []);

  function togglePin(name: string) {
    void updateDashboardConfig((config) => (isPinned(name) ? unpinExercise(config, name) : pinExercise(config, name)));
  }

  function hide(name: string) {
    void updateDashboardConfig((config) => hideExercise(config, name));
    if (selectedKey === getDashboardExerciseKey(name)) setSelectedName(null);
  }

  function addPrincipal() {
    const name = normalizeDashboardName(newExerciseName);
    if (!name) return;
    void updateDashboardConfig((config) => pinExercise(config, name));
    setNewExerciseName("");
  }

  async function saveTarget(volumeTargetSeconds: number, recordTargetSeconds: number | null) {
    if (!selected) return;
    await setIsometryTarget(selected.exerciseName, { volumeTargetSeconds, recordTargetSeconds });
  }

  async function resetTarget() {
    if (selected) await resetIsometryTarget(selected.exerciseName);
  }

  if (!isReady) {
    return <LoadingPanel />;
  }

  const renderTile = (exercise: Level100Exercise, canMove: boolean) => (
    <ExerciseTile
      key={exercise.exerciseName}
      exercise={exercise}
      isometry={isometryByKey.get(getDashboardExerciseKey(exercise.exerciseName)) ?? null}
      isSelected={selectedKey === getDashboardExerciseKey(exercise.exerciseName)}
      isPinned={isPinned(exercise.exerciseName)}
      editMode={editMode}
      onSelect={() => setSelectedName(exercise.exerciseName)}
      onTogglePin={() => togglePin(exercise.exerciseName)}
      onHide={() => hide(exercise.exerciseName)}
      onMove={canMove ? (direction) => void updateDashboardConfig((config) => moveExercise(config, exercise.exerciseName, direction)) : undefined}
    />
  );

  return (
    <div className="page-enter space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
          <label htmlFor="level-100-bodyweight" className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
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
        <MetricCard label="Livello medio" value={averageLevel} hint="Media sugli esercizi validati." icon={<Medal className="h-4 w-4" />} />
        <MetricCard label="Top level" value={topLevel} hint="Miglior livello raggiunto." icon={<Trophy className="h-4 w-4" />} />
        <MetricCard label="Validati" value={`${validated.length}/${visible.length}`} hint="Con almeno un record valido." icon={<BadgeCheck className="h-4 w-4" />} />
        <MetricCard label="Attenzione" value={attentionCount} hint="Senza record o sotto 60." icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5">
          {(
            [
              ["esercizi", "Esercizi"],
              ["panoramica", "Panoramica"]
            ] as Array<[DashboardTab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === id ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto" />
        {tab === "esercizi" ? (
          <Button type="button" size="sm" variant={editMode ? "default" : "outline"} onClick={() => setEditMode((value) => !value)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            {editMode ? "Fine" : "Modifica"}
          </Button>
        ) : null}
      </div>

      {tab === "panoramica" ? (
        <OverviewTab exercises={visible} onSelect={setSelectedName} />
      ) : (
        <div className="space-y-6">
          <Section title="Principali" count={principali.length} hint="Prestazioni che vuoi sempre sotto controllo, anche fuori programma.">
            {editMode ? (
              <div className="flex gap-2">
                <Input
                  list="dashboard-exercise-library"
                  value={newExerciseName}
                  onChange={(event) => setNewExerciseName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addPrincipal();
                    }
                  }}
                  placeholder="Aggiungi un esercizio ai principali"
                  aria-label="Aggiungi esercizio principale"
                />
                <Button type="button" className="h-12 w-12 shrink-0 px-0" aria-label="Aggiungi" onClick={addPrincipal}>
                  <Plus className="h-4 w-4" />
                </Button>
                <datalist id="dashboard-exercise-library">
                  {pickerOptions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
            ) : null}
            {principali.length ? (
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {principali.map((exercise) => renderTile(exercise, editMode))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-white/[0.1] p-4 text-sm text-muted-foreground">
                Nessun principale. Con <span className="text-foreground">Modifica</span> segna con la stella gli esercizi da tenere sempre in vista.
              </p>
            )}
          </Section>

          <Section title="Programma attuale" count={programma.length} hint={activePlan ? activePlan.name : "Nessun piano attivo"}>
            {programma.length ? (
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {programma.map((exercise) => renderTile(exercise, false))}
              </div>
            ) : activePlan ? (
              <p className="rounded-lg border border-dashed border-white/[0.1] p-4 text-sm text-muted-foreground">
                Tutti gli esercizi del programma sono tra i principali o nascosti.
              </p>
            ) : (
              <div className="flex flex-col gap-3 rounded-lg border border-dashed border-white/[0.1] p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">Importa un programma: i suoi esercizi compariranno qui da soli.</p>
                <Button asChild size="sm">
                  <Link href={"/import" as Route}>Importa programma</Link>
                </Button>
              </div>
            )}
          </Section>

          {editMode && nascosti.length ? (
            <Section title="Nascosti" count={nascosti.length} hint="Fuori dalla Dashboard, ma storico e record restano intatti.">
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {nascosti.map((exercise) => (
                  <div key={exercise.exerciseName} className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    <span className="truncate text-sm text-muted-foreground">{exercise.exerciseName}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => void updateDashboardConfig((config) => unhideExercise(config, exercise.exerciseName))}>
                      <Eye className="mr-1 h-3.5 w-3.5" /> Mostra
                    </Button>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}
        </div>
      )}

      <ExerciseDetailDialog
        exercise={selected}
        isometry={selected ? isometryByKey.get(getDashboardExerciseKey(selected.exerciseName)) ?? null : null}
        isPinned={selected ? isPinned(selected.exerciseName) : false}
        manualRecord={selectedKey ? manualRecords[selectedKey] ?? null : null}
        onClose={closeDetail}
        onTogglePin={() => selected && togglePin(selected.exerciseName)}
        onHide={() => selected && hide(selected.exerciseName)}
        onSaveTarget={saveTarget}
        onResetTarget={resetTarget}
        onSaveManualRecord={(record) => {
          const key = getDashboardExerciseKey(record.exerciseName);
          persistManualRecords({ ...manualRecords, [key]: { ...record, exerciseName: normalizeDashboardName(record.exerciseName) } });
        }}
        onClearManualRecord={(exerciseName) => {
          const next = { ...manualRecords };
          delete next[getDashboardExerciseKey(exerciseName)];
          persistManualRecords(next);
        }}
      />
    </div>
  );
}
