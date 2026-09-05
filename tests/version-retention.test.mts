import assert from "node:assert/strict";
import test from "node:test";

import { selectVersionIdsToDelete } from "../lib/arm-tracker/version-retention.ts";

function rowsEveryHours(count: number, hours: number, from: Date) {
  return Array.from({ length: count }, (_, i) => ({
    id: `v${i}`,
    created_at: new Date(from.getTime() - i * hours * 3_600_000).toISOString()
  }));
}

test("the newest versions are always kept in full", () => {
  const now = new Date("2026-09-05T12:00:00Z");
  const rows = rowsEveryHours(10, 1, now);
  const del = selectVersionIdsToDelete(rows, now, { keepLatest: 30, keepDailyForDays: 90 });
  assert.deepEqual(del, []);
});

test("older versions collapse to one per day, then disappear past the window", () => {
  const now = new Date("2026-09-05T12:00:00Z");
  // 4 versioni al giorno per 120 giorni = 480 righe
  const rows = rowsEveryHours(480, 6, now);
  const del = new Set(selectVersionIdsToDelete(rows, now, { keepLatest: 30, keepDailyForDays: 90 }));
  const kept = rows.filter((r) => !del.has(r.id));

  // le 30 piu' recenti restano tutte
  rows.slice(0, 30).forEach((r) => assert.ok(!del.has(r.id), `recente cancellata: ${r.id}`));

  // dentro i 90 giorni: al massimo una per giorno oltre le 30 recenti
  const cutoff = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const perDay = new Map<string, number>();
  kept
    .filter((r) => r.created_at >= cutoff && !rows.slice(0, 30).includes(r))
    .forEach((r) => perDay.set(r.created_at.slice(0, 10), (perDay.get(r.created_at.slice(0, 10)) ?? 0) + 1));
  perDay.forEach((n, day) => assert.ok(n <= 1, `piu' di una al giorno il ${day}`));

  // oltre i 90 giorni: niente
  kept.filter((r) => r.created_at < cutoff).forEach((r) => assert.fail(`fuori finestra tenuta: ${r.id}`));

  assert.ok(del.size > 300, `attese molte cancellazioni, avute ${del.size}`);
});

test("rows arrive in any order and ids of any type", () => {
  const now = new Date("2026-09-05T12:00:00Z");
  const rows = rowsEveryHours(5, 1, now).map((r, i) => ({ ...r, id: i }));
  const shuffled = [rows[3], rows[0], rows[4], rows[1], rows[2]];
  assert.deepEqual(selectVersionIdsToDelete(shuffled, now, { keepLatest: 2, keepDailyForDays: 0 }), [2, 3, 4]);
});
