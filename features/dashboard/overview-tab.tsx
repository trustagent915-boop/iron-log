"use client";

import { AlertTriangle, Crown, Medal } from "lucide-react";

import type { Level100Exercise } from "@/lib/arm-tracker/level-100";

import {
  formatRecordMeta,
  getLevelBarClassName,
  getLevelNumberClassName,
  getLevelProgressPercent,
  needsAttention
} from "./level-ui";

/**
 * Panoramica: podio, media per categoria e cosa richiede attenzione.
 * Serve a rispondere in un colpo d occhio a "dove sto migliorando e dove no".
 */
export function OverviewTab({
  exercises,
  onSelect
}: {
  exercises: Level100Exercise[];
  onSelect: (exerciseName: string) => void;
}) {
  const ranked = [...exercises].sort((left, right) => right.level - left.level || right.validRecordCount - left.validRecordCount);
  const podium = ranked.filter((exercise) => exercise.validRecordCount > 0).slice(0, 3);
  const attention = ranked.filter(needsAttention).reverse();
  const categories = Object.values(
    exercises.reduce<Record<string, { label: string; total: number; count: number; top: number }>>((acc, exercise) => {
      const current = acc[exercise.rule.label] ?? { label: exercise.rule.label, total: 0, count: 0, top: 0 };
      current.total += exercise.level;
      current.count += 1;
      current.top = Math.max(current.top, exercise.level);
      acc[exercise.rule.label] = current;
      return acc;
    }, {})
  )
    .map((entry) => ({ ...entry, average: entry.count ? Math.round(entry.total / entry.count) : 0 }))
    .sort((left, right) => right.average - left.average);

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Podio</p>
        {podium.length ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {podium.map((exercise, index) => (
              <button
                key={exercise.exerciseName}
                type="button"
                onClick={() => onSelect(exercise.exerciseName)}
                className={[
                  "rounded-xl border bg-white/[0.04] p-4 text-left transition hover:border-primary/45",
                  index === 0 ? "border-primary/45" : "border-white/[0.08]"
                ].join(" ")}
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                    {index === 0 ? <Crown className="h-4 w-4" /> : <Medal className="h-4 w-4" />}
                  </span>
                  <span className="data-chip">#{index + 1}</span>
                </div>
                <p className="mt-3 truncate font-medium text-foreground">{exercise.exerciseName}</p>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <p className={`font-mono text-3xl font-semibold ${getLevelNumberClassName(exercise.level)}`}>{exercise.level}</p>
                  <p className="pb-1 text-xs text-muted-foreground">{formatRecordMeta(exercise)}</p>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className={`h-full rounded-full ${getLevelBarClassName(exercise.level)}`} style={{ width: `${getLevelProgressPercent(exercise.level)}%` }} />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nessun record valido ancora.</p>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Per categoria</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {categories.map((entry) => (
              <div key={entry.label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-foreground">{entry.label}</p>
                  <p className={`font-mono text-lg font-semibold ${getLevelNumberClassName(entry.average)}`}>{entry.average}</p>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Top {entry.top} · {entry.count} esercizi</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <AlertTriangle className="h-3 w-3" /> Richiedono attenzione ({attention.length})
          </p>
          {attention.length ? (
            <div className="space-y-1.5">
              {attention.map((exercise) => (
                <button
                  key={exercise.exerciseName}
                  type="button"
                  onClick={() => onSelect(exercise.exerciseName)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-left transition hover:border-white/[0.14]"
                >
                  <span className="truncate text-sm text-foreground">{exercise.exerciseName}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {exercise.validRecordCount === 0 ? "Nessun record valido" : `Livello ${exercise.level}`}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Tutto sopra la soglia. Bene.</p>
          )}
        </div>
      </section>
    </div>
  );
}
