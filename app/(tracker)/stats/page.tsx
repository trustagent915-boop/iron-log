"use client";

import { Activity, Award, CalendarRange, Download, Gauge, TrendingUp, Zap } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { startTransition, useDeferredValue, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { useArmTracker } from "@/features/arm-tracker/arm-tracker-provider";
import { LoadingPanel } from "@/features/arm-tracker/loading-panel";
import { exportStatsToCSV } from "@/lib/arm-tracker/export";
import { safeParseYear, safeParseExercise } from "@/lib/url-safe";
import {
  buildExerciseLeaderboard,
  buildExerciseTrend,
  buildMonthlyHistoryData,
  buildStatusDistributionData,
  buildWeekdayPatternData,
  buildYearlyVolumeData,
  filterDataByYear,
  formatCompactWeight,
  formatDateLabel,
  formatVolume,
  getAvailableHistoryYears,
  getAverageAdherence,
  getExerciseOptions,
  getGamificationSummary,
  getHistoryDateRange,
  getHistoryEntries,
  getLastWorkoutDate
} from "@/lib/arm-tracker/selectors";
import { cn } from "@/lib/utils";

const chartStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "18px"
};

const chartGrid = "rgba(255,255,255,0.08)";
const chartAxis = "rgba(255,255,255,0.55)";

type TrendMetric = "volume" | "workoutCount" | "adherence";
type ExerciseMetric = "weight" | "reps" | "volume" | "adherence";
type LeaderboardMetric = "volume" | "workoutCount" | "adherence";

function readStatsFiltersFromLocation(exerciseOptions?: string[]) {
  if (typeof window === "undefined") {
    return { year: null as "all" | `${number}` | null, exercise: "" };
  }

  const params = new URLSearchParams(window.location.search);
  const yearParam = params.get("year");
  const exerciseParam = params.get("exercise") ?? "";

  return {
    year: safeParseYear(yearParam),
    exercise: exerciseOptions ? safeParseExercise(exerciseParam, exerciseOptions) : ""
  };
}

function syncStatsFiltersToUrl(nextYear: "all" | `${number}`, nextExercise: string) {
  if (typeof window === "undefined") {
    return;
  }

  const params = new URLSearchParams(window.location.search);

  nextYear === "all" ? params.delete("year") : params.set("year", nextYear);
  nextExercise ? params.set("exercise", nextExercise) : params.delete("exercise");

  const nextSearch = params.toString();
  const nextUrl = nextSearch ? `${window.location.pathname}?${nextSearch}` : window.location.pathname;
  window.history.replaceState(window.history.state, "", nextUrl);
}

function Toggle<T extends string>({
  value,
  options,
  onChange
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (nextValue: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] p-1">
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={value === option.value ? "default" : "ghost"}
          className={cn(
            "rounded-full px-4",
            value !== option.value && "text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function formatMetric(metric: TrendMetric | ExerciseMetric | LeaderboardMetric, value: number | null) {
  if (value === null) {
    return "-";
  }

  if (metric === "volume") {
    return formatVolume(value);
  }

  if (metric === "adherence") {
    return `${Math.round(value)}%`;
  }

  if (metric === "weight") {
    return formatCompactWeight(value);
  }

  if (metric === "reps") {
    return `${Math.round(value)} reps`;
  }

  return `${Math.round(value)}`;
}

export default function StatsPage() {
  const { data, isReady } = useArmTracker();
  const [selectedExercise, setSelectedExercise] = useState("");
  const [selectedYear, setSelectedYear] = useState<"all" | `${number}`>("all");
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("volume");
  const [exerciseMetric, setExerciseMetric] = useState<ExerciseMetric>("weight");
  const [leaderboardMetric, setLeaderboardMetric] = useState<LeaderboardMetric>("volume");
  const deferredSelectedExercise = useDeferredValue(selectedExercise);
  const deferredSelectedYear = useDeferredValue(selectedYear);
  const hasLogs = getHistoryEntries(data).length > 0;
  const availableYears = getAvailableHistoryYears(data);

  function updateFilters(next: { year?: "all" | `${number}`; exercise?: string }) {
    const nextYear = next.year ?? selectedYear;
    const nextExercise = next.exercise ?? selectedExercise;

    startTransition(() => {
      if (next.year !== undefined) {
        setSelectedYear(nextYear);
      }

      if (next.exercise !== undefined) {
        setSelectedExercise(nextExercise);
      }
    });

    syncStatsFiltersToUrl(nextYear, nextExercise);
  }

  useEffect(() => {
    const { year: requestedYear } = readStatsFiltersFromLocation();
    const nextYear =
      requestedYear && availableYears.includes(Number(requestedYear))
        ? (requestedYear as `${number}`)
        : "all";

    setSelectedYear(nextYear);
  }, [availableYears]);

  useEffect(() => {
    function handlePopState() {
      const { year: requestedYear, exercise: requestedExercise } = readStatsFiltersFromLocation();
      const nextYear =
        requestedYear && availableYears.includes(Number(requestedYear))
          ? (requestedYear as `${number}`)
          : "all";

      setSelectedYear(nextYear);
      setSelectedExercise(requestedExercise);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [availableYears]);

  const scopedData = filterDataByYear(
    data,
    deferredSelectedYear === "all" ? "all" : Number(deferredSelectedYear)
  );
  const exerciseOptions = getExerciseOptions(scopedData);

  useEffect(() => {
    const { exercise: requestedExercise } = readStatsFiltersFromLocation(exerciseOptions);
    const fallbackExercise = exerciseOptions[0] ?? "";
    const nextExercise = exerciseOptions.includes(requestedExercise)
      ? requestedExercise
      : exerciseOptions.includes(selectedExercise)
        ? selectedExercise
        : fallbackExercise;

    if (nextExercise !== selectedExercise) {
      setSelectedExercise(nextExercise);
    }

    if (requestedExercise !== nextExercise) {
      syncStatsFiltersToUrl(selectedYear, nextExercise);
    }
  }, [exerciseOptions, selectedExercise, selectedYear]);

  const monthlyData = buildMonthlyHistoryData(scopedData);
  const yearlyData = buildYearlyVolumeData(data);
  const weekdayData = buildWeekdayPatternData(scopedData);
  const leaderboard = buildExerciseLeaderboard(scopedData);
  const statusData = buildStatusDistributionData(scopedData);
  const exerciseTrend = deferredSelectedExercise
    ? buildExerciseTrend(scopedData, deferredSelectedExercise)
    : [];
  const gamification = getGamificationSummary(scopedData);
  const historyRange = getHistoryDateRange(data);
  const lastWorkoutDate = getLastWorkoutDate(scopedData);
  const averageAdherence = getAverageAdherence(scopedData);
  const completionRate = scopedData.workoutLogs.length
    ? Math.round((gamification.completedWorkouts / scopedData.workoutLogs.length) * 100)
    : 0;
  const bestMonth = monthlyData.reduce<(typeof monthlyData)[number] | null>(
    (bestEntry, entry) => (!bestEntry || entry.volume > bestEntry.volume ? entry : bestEntry),
    null
  );
  const strongestDay = weekdayData.reduce<(typeof weekdayData)[number] | null>(
    (bestEntry, entry) => (!bestEntry || entry.volume > bestEntry.volume ? entry : bestEntry),
    null
  );

  const trendConfig = {
    volume: { key: "volume", color: "#ff9238" },
    workoutCount: { key: "workoutCount", color: "#2eb3a3" },
    adherence: { key: "adherence", color: "#7dd3fc" }
  }[trendMetric];

  const exerciseConfigMap = {
    weight: { plannedKey: "plannedWeight", actualKey: "actualWeight" },
    reps: { plannedKey: "plannedReps", actualKey: "actualReps" },
    volume: { plannedKey: "plannedVolume", actualKey: "actualVolume" },
    adherence: { plannedKey: null, actualKey: "adherence" }
  } as const;
  const exerciseConfig = exerciseConfigMap[exerciseMetric];

  const exerciseSeries = exerciseTrend.map((entry) => ({
    ...entry,
    plannedValue: exerciseConfig.plannedKey ? (entry[exerciseConfig.plannedKey] as number | null) : null,
    actualValue: entry[exerciseConfig.actualKey] as number | null
  }));
  const latestExercise = exerciseSeries.at(-1) ?? null;
  const bestExercise = exerciseSeries.reduce<(typeof exerciseSeries)[number] | null>(
    (bestEntry, entry) =>
      !bestEntry || (entry.actualValue ?? Number.NEGATIVE_INFINITY) > (bestEntry.actualValue ?? Number.NEGATIVE_INFINITY)
        ? entry
        : bestEntry,
    null
  );
  const leaderboardSeries = leaderboard.map((entry) => ({
    ...entry,
    chartValue:
      leaderboardMetric === "volume"
        ? entry.volume
        : leaderboardMetric === "workoutCount"
          ? entry.workoutCount
          : (entry.adherence ?? 0)
  }));

  if (!isReady) {
    return <LoadingPanel message="Preparazione statistiche storiche..." />;
  }

  if (!hasLogs) {
    return (
      <div className="page-enter space-y-8">
        <PageHeader
          eyebrow="Statistiche"
          title="Statistiche in attesa di storico"
          description="Appena importi un workbook storico o salvi i primi allenamenti, qui compaiono trend, pattern e progressione per esercizio."
        />
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 pt-6 sm:flex-row sm:items-center sm:justify-between sm:p-7 sm:pt-7">
            <p className="text-sm leading-7 text-muted-foreground">
              Questa vista si accende quando lo storico contiene almeno un workout registrato.
            </p>
            <Button asChild>
              <Link href={"/import" as Route}>Importa storico</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-enter space-y-8">
      <PageHeader
        eyebrow="Statistiche"
        title="Iron Log control room"
        description="Una dashboard piu interattiva e pulita per leggere volume, qualita, ritmo, PR e andamento di ogni esercizio."
        actions={
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <div className="min-w-[200px]">
              <Select
                className="text-[15px] font-medium"
                value={selectedYear}
                onChange={(event) => updateFilters({ year: event.target.value as "all" | `${number}` })}
              >
                <option value="all">Tutti gli anni</option>
                {availableYears.map((year) => (
                  <option key={year} value={`${year}`}>{year}</option>
                ))}
              </Select>
            </div>
            <div className="min-w-[280px] sm:w-[380px]">
              <Select
                className="text-[15px] font-medium"
                value={selectedExercise}
                onChange={(event) => updateFilters({ exercise: event.target.value })}
              >
                {exerciseOptions.length ? exerciseOptions.map((exerciseName) => (
                  <option key={exerciseName} value={exerciseName}>{exerciseName}</option>
                )) : <option value="">Nessun esercizio disponibile</option>}
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportStatsToCSV(scopedData)}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Esporta CSV
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard label="Periodo" value={selectedYear === "all" ? `${availableYears.length} anni` : selectedYear} hint="Ambito di lettura attivo." icon={<CalendarRange className="h-5 w-5" />} />
        <MetricCard label="Workout" value={scopedData.workoutLogs.length} hint="Sessioni registrate nel periodo." icon={<Activity className="h-5 w-5" />} />
        <MetricCard label="Volume" value={formatVolume(gamification.totalVolume)} hint="Lavoro accumulato nello storico filtrato." icon={<TrendingUp className="h-5 w-5" />} />
        <MetricCard label="Completion" value={`${completionRate}%`} hint="Quota di workout completati." icon={<Gauge className="h-5 w-5" />} />
        <MetricCard label="Aderenza" value={averageAdherence !== null ? `${averageAdherence}%` : "-"} hint="Quanto l'eseguito resta vicino al previsto." icon={<Zap className="h-5 w-5" />} />
        <MetricCard label="PR" value={gamification.recordBreakCount} hint="Record personali trovati nel periodo." icon={<Award className="h-5 w-5" />} />
      </div>

      {historyRange && availableYears.length === 1 ? (
        <Card>
          <CardContent className="p-6 pt-6 sm:p-7 sm:pt-7">
            <p className="text-sm leading-7 text-muted-foreground">
              Lo storico collegato in questo momento copre dal <span className="font-semibold text-foreground">{formatDateLabel(historyRange.start, "d MMMM yyyy")}</span> al <span className="font-semibold text-foreground">{formatDateLabel(historyRange.end, "d MMMM yyyy")}</span>.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="workspace-panel overflow-hidden">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="eyebrow">Trend studio</p>
            <CardTitle className="mt-3 text-3xl">Lettura mensile del blocco</CardTitle>
          </div>
          <Toggle value={trendMetric} options={[{ value: "volume", label: "Volume" }, { value: "workoutCount", label: "Workout" }, { value: "adherence", label: "Aderenza" }]} onChange={setTrendMetric} />
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[1.45fr_0.8fr]">
          <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5">
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="statsTrendFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor={trendConfig.color} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={trendConfig.color} stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={chartGrid} strokeDasharray="4 4" />
                  <XAxis dataKey="monthLabel" stroke={chartAxis} />
                  <YAxis stroke={chartAxis} />
                  <Tooltip contentStyle={chartStyle} formatter={(value: number) => formatMetric(trendMetric, value)} />
                  <Area type="monotone" dataKey={trendConfig.key} stroke={trendConfig.color} fill="url(#statsTrendFill)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grid gap-4">
            <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-5">
              <p className="text-sm text-muted-foreground">Mese piu forte</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{bestMonth?.monthLabel ?? "-"}</p>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{bestMonth ? `${formatVolume(bestMonth.volume)} di volume e ${bestMonth.workoutCount} workout.` : "In attesa di uno storico piu corposo."}</p>
            </div>
            <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-5">
              <p className="text-sm text-muted-foreground">Ultimo log</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{lastWorkoutDate ? formatDateLabel(lastWorkoutDate, "d MMM yyyy") : "-"}</p>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">Giorno piu carico: {strongestDay?.dayLabel ?? "-"}.</p>
            </div>
            <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-5">
              <p className="text-sm text-muted-foreground">Livello</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{gamification.level}</p>
              <Progress value={gamification.levelProgress} className="mt-4" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.95fr]">
        <Card className="workspace-panel overflow-hidden">
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="eyebrow">Exercise explorer</p>
              <CardTitle className="mt-3 text-3xl">{deferredSelectedExercise || "Seleziona un esercizio"}</CardTitle>
            </div>
            <Toggle value={exerciseMetric} options={[{ value: "weight", label: "Peso" }, { value: "reps", label: "Reps" }, { value: "volume", label: "Volume" }, { value: "adherence", label: "Aderenza" }]} onChange={setExerciseMetric} />
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[1.35fr_0.75fr]">
            <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5">
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={exerciseSeries}>
                    <CartesianGrid stroke={chartGrid} strokeDasharray="4 4" />
                    <XAxis dataKey="dateLabel" stroke={chartAxis} />
                    <YAxis stroke={chartAxis} />
                    <Tooltip
                      contentStyle={chartStyle}
                      formatter={(value) =>
                        formatMetric(
                          exerciseMetric,
                          typeof value === "number" ? value : Number(value)
                        )
                      }
                    />
                    {exerciseConfig.plannedKey ? <Line type="monotone" dataKey="plannedValue" name="Previsto" stroke="#2eb3a3" strokeDasharray="6 6" strokeWidth={2} dot={false} /> : null}
                    <Line type="monotone" dataKey="actualValue" name="Eseguito" stroke="#ff9238" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="grid gap-4">
              <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-5">
                <p className="text-sm text-muted-foreground">Ultimo valore</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{latestExercise ? formatMetric(exerciseMetric, latestExercise.actualValue) : "-"}</p>
              </div>
              <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-5">
                <p className="text-sm text-muted-foreground">Best nel periodo</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{bestExercise ? formatMetric(exerciseMetric, bestExercise.actualValue) : "-"}</p>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{bestExercise ? `Picco del ${formatDateLabel(bestExercise.date, "d MMM yyyy")}.` : "Serve piu storico per leggere il picco."}</p>
              </div>
              <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-5">
                <p className="text-sm text-muted-foreground">Sessioni</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{exerciseSeries.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="workspace-panel overflow-hidden">
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="eyebrow">Leaderboard</p>
              <CardTitle className="mt-3 text-3xl">Gli esercizi che guidano il blocco</CardTitle>
            </div>
            <Toggle value={leaderboardMetric} options={[{ value: "volume", label: "Volume" }, { value: "workoutCount", label: "Frequenza" }, { value: "adherence", label: "Aderenza" }]} onChange={setLeaderboardMetric} />
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5">
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={leaderboardSeries} layout="vertical">
                    <CartesianGrid stroke={chartGrid} strokeDasharray="4 4" horizontal={false} />
                    <XAxis type="number" stroke={chartAxis} />
                    <YAxis dataKey="exerciseName" type="category" width={110} stroke={chartAxis} />
                    <Tooltip contentStyle={chartStyle} formatter={(value: number) => formatMetric(leaderboardMetric, value)} />
                    <Bar dataKey="chartValue" fill="#ff9238" radius={[0, 10, 10, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="grid gap-3">
              {leaderboardSeries.slice(0, 4).map((entry, index) => (
                <div key={entry.exerciseName} className="list-row">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-foreground">{index + 1}. {entry.exerciseName}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{entry.workoutCount} workout - best {formatCompactWeight(entry.bestWeight)}</p>
                    </div>
                    <span className="data-chip">{formatMetric(leaderboardMetric, entry.chartValue)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="workspace-panel overflow-hidden">
          <CardHeader>
            <p className="eyebrow">Rhythm</p>
            <CardTitle className="mt-3 text-3xl">Come si distribuisce la tua settimana</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5">
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekdayData}>
                    <CartesianGrid stroke={chartGrid} strokeDasharray="4 4" />
                    <XAxis dataKey="dayLabel" stroke={chartAxis} />
                    <YAxis stroke={chartAxis} />
                    <Tooltip contentStyle={chartStyle} formatter={(value: number, name: string) => [name === "volume" ? formatVolume(value) : `${value}`, name === "volume" ? "Volume" : "Workout"]} />
                    <Bar dataKey="workoutCount" fill="#2eb3a3" radius={[10, 10, 0, 0]} />
                    <Bar dataKey="volume" fill="#ff9238" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="grid gap-4">
              <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-5">
                <p className="text-sm text-muted-foreground">Giorno piu forte</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{strongestDay?.dayLabel ?? "-"}</p>
              </div>
              <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-5">
                <p className="text-sm text-muted-foreground">XP nel periodo</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{gamification.totalXp}</p>
              </div>
              <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-5">
                <p className="text-sm text-muted-foreground">Streak</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{gamification.currentWeekStreak}</p>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">Massima: {gamification.longestWeekStreak}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="workspace-panel overflow-hidden">
          <CardHeader>
            <p className="eyebrow">Progress + status</p>
            <CardTitle className="mt-3 text-3xl">Stato sessioni, anni e PR</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5">
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip contentStyle={chartStyle} formatter={(value: number) => `${value} sessioni`} />
                      <Pie data={statusData} dataKey="value" innerRadius={56} outerRadius={84} paddingAngle={4}>
                        {statusData.map((entry) => <Cell key={entry.key} fill={entry.fill} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5">
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={yearlyData}>
                      <CartesianGrid stroke={chartGrid} strokeDasharray="4 4" />
                      <XAxis dataKey="yearLabel" stroke={chartAxis} />
                      <YAxis stroke={chartAxis} />
                      <Tooltip contentStyle={chartStyle} formatter={(value: number) => formatVolume(value)} />
                      <Bar dataKey="volume" fill="#7dd3fc" radius={[10, 10, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="eyebrow">Record feed</p>
                  <h3 className="mt-3 text-2xl font-semibold text-foreground">Ultimi PR utili</h3>
                </div>
                <span className="data-chip">{gamification.badges.filter((badge) => badge.unlocked).length} badge</span>
              </div>
              <div className="grid gap-3">
                {gamification.personalRecords.length ? gamification.personalRecords.map((record) => (
                  <div key={`${record.exerciseName}-${record.category}-${record.date}`} className="list-row">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{record.exerciseName}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{record.label} - {formatDateLabel(record.date, "d MMM yyyy")}</p>
                      </div>
                      <span className="data-chip">{record.category}</span>
                    </div>
                  </div>
                )) : <p className="text-sm leading-7 text-muted-foreground">Nessun PR rilevato nel periodo selezionato.</p>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {gamification.badges.map((badge) => (
                  <span key={badge.id} className="data-chip">
                    {badge.title}: {badge.unlocked ? "sbloccato" : `${badge.current}/${badge.target}`}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
