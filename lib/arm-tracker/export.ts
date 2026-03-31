// FEATURE: Export CSV/PDF dei dati
import { ArmTrackerState } from './types';
import { getHistoryEntries, formatDateLabel } from './selectors';

/**
 * Esporta storico workout in CSV
 * Format: Date,Exercise,Sets,Reps,Weight,Volume,Status
 */
export function exportToCSV(data: ArmTrackerState) {
  const entries = getHistoryEntries(data);

  const header = ['Date', 'Exercise', 'Sets', 'Reps', 'Weight (kg)', 'Volume', 'Status'];

  const rows = entries.map(entry => [
    formatDateLabel(entry.date, 'yyyy-MM-dd'),
    entry.exerciseName || '',
    entry.plannedSets || '',
    entry.actualReps || '',
    entry.actualWeight || '',
    entry.actualVolume || '',
    entry.status || 'logged'
  ]);

  const csvContent = [
    header.map(h => `"${h}"`).join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  // Trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `iron-log-export-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Esporta statistiche mensili in CSV
 */
export function exportStatsToCSV(data: ArmTrackerState) {
  const { buildMonthlyHistoryData } = require('./selectors');
  const monthlyData = buildMonthlyHistoryData(data);

  const header = ['Month', 'Workouts', 'Volume', 'Completion %'];
  const rows = monthlyData.map((entry: any) => [
    entry.monthLabel,
    entry.workoutCount,
    entry.volume,
    entry.completionRate || '0'
  ]);

  const csvContent = [
    header.map(h => `"${h}"`).join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `iron-log-stats-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Esporta Goal progress
 */
export function exportGoalsToCSV(goals: any[]) {
  const header = ['Exercise', 'Target', 'Metric', 'Target Date', 'Progress %', 'Status'];
  const rows = goals.map(goal => [
    goal.exerciseName,
    goal.targetValue,
    goal.metricType,
    formatDateLabel(goal.targetDate, 'yyyy-MM-dd'),
    Math.round(goal.progress || 0),
    goal.status
  ]);

  const csvContent = [
    header.map(h => `"${h}"`).join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `iron-log-goals-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
