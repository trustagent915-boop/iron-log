"use client";

import { ArrowDown, ArrowUp, EyeOff, Star, StarOff } from "lucide-react";

import type { IsometrySummary } from "@/lib/arm-tracker/isometry-target";
import type { Level100Exercise } from "@/lib/arm-tracker/level-100";

import {
  formatRecordMeta,
  getLevelBarClassName,
  getLevelNumberClassName,
  getLevelProgressPercent,
  getLevelTierLabel
} from "./level-ui";

interface ExerciseTileProps {
  exercise: Level100Exercise;
  isometry: IsometrySummary | null;
  isSelected: boolean;
  isPinned: boolean;
  editMode: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
  onHide: () => void;
  onMove?: (direction: -1 | 1) => void;
}

function IconButton({
  label,
  onClick,
  children,
  disabled
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] text-muted-foreground transition hover:border-white/[0.16] hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/**
 * Una card sintetica per esercizio: livello, barra, record e la riga
 * isometrica (record / volume / completamento). Il dettaglio sta altrove.
 */
export function ExerciseTile({
  exercise,
  isometry,
  isSelected,
  isPinned,
  editMode,
  onSelect,
  onTogglePin,
  onHide,
  onMove
}: ExerciseTileProps) {
  const isoLine =
    isometry && (isometry.recordSeconds !== null || isometry.lastVolumeSeconds !== null)
      ? `Iso · rec ${isometry.recordSeconds ?? "–"}s · vol ${isometry.lastVolumeSeconds ?? "–"}s · ${isometry.completion.percent}%`
      : null;

  return (
    <div
      className={[
        "flex h-full flex-col gap-2.5 rounded-lg border p-3 transition",
        isSelected
          ? "border-primary/45 bg-primary/10"
          : "border-white/[0.06] bg-white/[0.025] hover:border-white/[0.14] hover:bg-white/[0.05]"
      ].join(" ")}
    >
      <button type="button" className="flex w-full flex-col gap-2.5 text-left" onClick={onSelect}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
              {isPinned ? <Star className="h-3 w-3 shrink-0 fill-primary text-primary" /> : null}
              <span className="truncate">{exercise.exerciseName}</span>
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {exercise.rule.label} · {exercise.rule.formulaLabel}
            </p>
          </div>
          <p className={`font-mono text-2xl font-semibold leading-none ${getLevelNumberClassName(exercise.level)}`}>
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

        {isoLine ? <p className="truncate text-[11px] text-muted-foreground/80">{isoLine}</p> : null}
      </button>

      {editMode ? (
        <div className="flex items-center gap-1.5 border-t border-white/[0.06] pt-2">
          <IconButton label={isPinned ? "Togli dai principali" : "Segna come principale"} onClick={onTogglePin}>
            {isPinned ? <StarOff className="h-3.5 w-3.5" /> : <Star className="h-3.5 w-3.5" />}
          </IconButton>
          {onMove ? (
            <>
              <IconButton label="Sposta su" onClick={() => onMove(-1)}>
                <ArrowUp className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton label="Sposta giù" onClick={() => onMove(1)}>
                <ArrowDown className="h-3.5 w-3.5" />
              </IconButton>
            </>
          ) : null}
          <span className="flex-1" />
          <IconButton label="Nascondi dalla Dashboard" onClick={onHide}>
            <EyeOff className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      ) : null}
    </div>
  );
}
