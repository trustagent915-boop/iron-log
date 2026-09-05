/**
 * Politica di conservazione delle versioni dello snapshot su Supabase.
 *
 * Ogni salvataggio archivia lo stato precedente del cloud (~3 MB) per poter
 * tornare indietro se una scrittura fa danni. Senza un limite la tabella
 * cresce all'infinito: a 370 versioni pesava circa 1 GB.
 *
 * Si tengono:
 * - le ultime N versioni, sempre (copertura fine degli ultimi salvataggi);
 * - la piu' recente di ogni giorno negli ultimi D giorni (copertura grossa
 *   per un rollback a distanza di settimane).
 * Tutto il resto si cancella.
 */
export interface SnapshotVersionRow {
  id: string | number;
  created_at: string;
}

export interface RetentionPolicy {
  keepLatest: number;
  keepDailyForDays: number;
}

export const defaultRetentionPolicy: RetentionPolicy = {
  keepLatest: 30,
  keepDailyForDays: 90
};

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

export function selectVersionIdsToDelete(
  rows: SnapshotVersionRow[],
  now: Date = new Date(),
  policy: RetentionPolicy = defaultRetentionPolicy
): Array<string | number> {
  const sorted = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const keep = new Set<string | number>();

  sorted.slice(0, policy.keepLatest).forEach((row) => keep.add(row.id));

  const cutoff = new Date(now.getTime() - policy.keepDailyForDays * 86_400_000).toISOString();
  const seenDays = new Set<string>();
  for (const row of sorted) {
    if (row.created_at < cutoff) {
      break;
    }
    const day = dayKey(row.created_at);
    if (!seenDays.has(day)) {
      seenDays.add(day);
      keep.add(row.id);
    }
  }

  return sorted.filter((row) => !keep.has(row.id)).map((row) => row.id);
}
