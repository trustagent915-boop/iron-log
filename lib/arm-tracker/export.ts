// Export CSX/PDF dei dati
import type { ArmTrackerData } from './types';
import { getHistoryEntries, formatDateLabel } from './selectors';

export function exportToCSV(data: ArmTrackerData) {
  const entries = getHistoryEntries(data);
  const header = ['Date', 'Exercise', 'Sets', 'Reps', 'Weight (kg)', 'Volume', 'Status'];
  const rows = entries.map(e => [
    formatDateLabel(e.date, 'yyyy-MM-dd'),
    e.exerciseName || '', e.plannedSets || '', e.actualReps || '', e.actualWeight || '', e.actualVolume || '', e.status || 'logged'
  ]);
  const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `iron-log-export-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

export function exportStatsToCSV(data: ArmTrackerData) {
  const blob = new Blob(['iron-log-stats'], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `iron-log-stats-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

export function exportGoalsToCSV(goals: any[]) {
  const blob = new Blob(['iron-log-goals'], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `iron-log-goals-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
