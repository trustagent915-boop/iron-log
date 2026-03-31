import type { ArmTrackerData } from "./types";
import {
  buildMonthlyHistoryData,
  formatDateLabel,
  getHistoryEntries,
  isSkippedExerciseLog,
  stripSkippedToken
} from "./selectors";

function triggerCsvDownload(fileName: string, header: string[], rows: Array<Array<string | number | null>>) {
  const csvContent = [
    header.map((cell) => `"${cell}"`).join(","),
    ...rows.map((row) =>
      row
        .map((cell) => `"${cell ?? ""}`.replace(/\n/g, " ").concat(`"`))
        .join(",")
    )
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToCSV(data: ArmTrackerData) {
  const entries = getHistoryEntries(data);
  const header = ["Date", "Session", "Exercise", "Sets", "Reps", "Weight (kg)", "Status", "Notes"];
  const rows: Array<Array<string | number | null>> = [];

  entries.forEach((entry) => {
    entry.exerciseLogs.forEach((exerciseLog) => {
      rows.push([
        entry.log.performedDate,
        entry.session?.dayLabel ?? entry.plan?.name ?? "",
        exerciseLog.exerciseNameSnapshot,
        exerciseLog.actualSets,
        exerciseLog.actualReps,
        exerciseLog.actualWeight,
        isSkippedExerciseLog(exerciseLog) ? "skipped" : entry.log.completionStatus,
        stripSkippedToken(exerciseLog.notes) ?? ""
      ]);
    });
  });

  triggerCsvDownload(
    `iron-log-history-${new Date().toISOString().slice(0, 10)}.csv`,
    header,
    rows
  );
}

export function exportStatsToCSV(data: ArmTrackerData) {
  const monthlyData = buildMonthlyHistoryData(data);
  const header = ["Month", "Workouts", "Volume", "Completion %", "Adherence %"];
  const rows = monthlyData.map((entry) => [
    entry.monthLabel,
    entry.workoutCount,
    Math.round(entry.volume),
    entry.completionRate ?? 0,
    entry.adherence ?? ""
  ]);

  triggerCsvDownload(
    `iron-log-stats-${new Date().toISOString().slice(0, 10)}.csv`,
    header,
    rows
  );
}

export function exportGoalsToCSV(
  goals: Array<{
    exerciseName: string;
    targetValue: number | string;
    metricType: string;
    targetDate: string;
    progress?: number | null;
    status: string;
  }>
) {
  const header = ["Exercise", "Target", "Metric", "Target Date", "Progress %", "Status"];
  const rows = goals.map((goal) => [
    goal.exerciseName,
    goal.targetValue,
    goal.metricType,
    formatDateLabel(goal.targetDate, "yyyy-MM-dd"),
    Math.round(goal.progress ?? 0),
    goal.status
  ]);

  triggerCsvDownload(
    `iron-log-goals-${new Date().toISOString().slice(0, 10)}.csv`,
    header,
    rows
  );
}
