"use client";

import { EyeOff, Star, StarOff, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isometryStatusLabels, type IsometrySummary } from "@/lib/arm-tracker/isometry-target";
import type { Level100Exercise } from "@/lib/arm-tracker/level-100";
import { formatDateLabel } from "@/lib/arm-tracker/selectors";

import { formatRecordMeta, getLevelNumberClassName } from "./level-ui";
import { ManualRecordEditor, type Level100ManualRecord } from "./manual-record-editor";

interface ExerciseDetailDialogProps {
  exercise: Level100Exercise | null;
  isometry: IsometrySummary | null;
  isPinned: boolean;
  manualRecord: Level100ManualRecord | null;
  onClose: () => void;
  onTogglePin: () => void;
  onHide: () => void;
  onSaveTarget: (volumeTargetSeconds: number, recordTargetSeconds: number | null) => Promise<void>;
  onResetTarget: () => Promise<void>;
  onSaveManualRecord: (record: Level100ManualRecord) => void;
  onClearManualRecord: (exerciseName: string) => void;
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Trend({ label, points }: { label: string; points: Array<{ date: string; seconds: number }> }) {
  if (!points.length) return null;
  return (
    <div className="text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">{label}:</span>{" "}
      {points.map((point, index) => (
        <span key={`${point.date}-${index}`}>
          {index > 0 ? " → " : ""}
          <span className="font-mono text-foreground">{point.seconds}s</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Scheda del singolo esercizio: livello, record, e la sezione isometrica con
 * RECORD e VOLUME nettamente separati, target modificabile e trend.
 * E una finestra sopra la Dashboard, cosi la Dashboard resta sintetica.
 */
export function ExerciseDetailDialog({
  exercise,
  isometry,
  isPinned,
  manualRecord,
  onClose,
  onTogglePin,
  onHide,
  onSaveTarget,
  onResetTarget,
  onSaveManualRecord,
  onClearManualRecord
}: ExerciseDetailDialogProps) {
  const [volumeTarget, setVolumeTarget] = useState("");
  const [recordTarget, setRecordTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setVolumeTarget(isometry ? String(isometry.target.volumeTargetSeconds) : "");
    setRecordTarget(isometry?.target.recordTargetSeconds !== null && isometry ? String(isometry.target.recordTargetSeconds) : "");
    setMessage(null);
  }, [isometry]);

  useEffect(() => {
    if (!exercise) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [exercise, onClose]);

  if (!exercise) return null;

  const missing = Math.max(0, 100 - exercise.level);
  const completion = isometry?.completion ?? { percent: 0, status: "nessun-dato" as const };
  const completionColor =
    completion.status === "raggiunto" || completion.status === "superato"
      ? "bg-emerald-400"
      : completion.status === "vicino"
        ? "bg-orange-400"
        : "bg-red-400";

  async function saveTarget() {
    const volume = Number(volumeTarget.replace(",", "."));
    const record = recordTarget.trim() ? Number(recordTarget.replace(",", ".")) : null;
    if (!Number.isFinite(volume) || volume <= 0) {
      setMessage("Il target di volume deve essere un numero di secondi maggiore di zero.");
      return;
    }
    setSaving(true);
    try {
      await onSaveTarget(volume, record !== null && Number.isFinite(record) && record > 0 ? record : null);
      setMessage("Target salvato.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Salvataggio non riuscito.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Dettaglio ${exercise.exerciseName}`}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-white/[0.08] bg-background p-4 shadow-2xl sm:rounded-2xl sm:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {exercise.rule.label} · {exercise.rule.formulaLabel}
            </p>
            <h2 className="mt-1 truncate text-xl font-semibold text-foreground">{exercise.exerciseName}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{exercise.rule.description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <p className={`mr-2 font-mono text-3xl font-semibold ${getLevelNumberClassName(exercise.level)}`}>
              {exercise.level}
            </p>
            <Button type="button" size="sm" variant="outline" onClick={onTogglePin} aria-label={isPinned ? "Togli dai principali" : "Segna come principale"}>
              {isPinned ? <StarOff className="h-4 w-4" /> : <Star className="h-4 w-4" />}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onHide} aria-label="Nascondi dalla Dashboard">
              <EyeOff className="h-4 w-4" />
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onClose} aria-label="Chiudi">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <Metric label="Record" value={formatRecordMeta(exercise)} hint={exercise.bestValidDate ? formatDateLabel(exercise.bestValidDate) : undefined} />
          <Metric label="Manca a 100" value={String(missing)} />
          <Metric label="Validazioni" value={`${exercise.validRecordCount}/${exercise.attemptCount}`} />
          <Metric label="Ultimo log" value={exercise.latestDate ? formatDateLabel(exercise.latestDate, "d MMM") : "–"} />
        </div>

        <section className="mt-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Isometria</p>
            {isometry && isometry.sessionsWithIsometry > 0 ? (
              <span className="text-[11px] text-muted-foreground">{isometry.sessionsWithIsometry} sedute con tenuta</span>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Metric
              label="Record isometrico"
              value={isometry?.recordSeconds !== null && isometry ? `${isometry.recordSeconds} s` : "–"}
              hint={isometry?.recordDate ? `Migliore tenuta singola · ${formatDateLabel(isometry.recordDate, "d MMM")}` : "Migliore tenuta singola"}
            />
            <Metric
              label="Volume isometrico"
              value={isometry?.lastVolumeSeconds !== null && isometry ? `${isometry.lastVolumeSeconds} s` : "–"}
              hint={isometry?.lastVolumeDate ? `Tempo totale dell ultima seduta · ${formatDateLabel(isometry.lastVolumeDate, "d MMM")}` : "Tempo totale della seduta"}
            />
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-muted-foreground">
                Target volume <span className="font-mono text-foreground">{isometry?.target.volumeTargetSeconds ?? "–"}s</span>
                {isometry?.target.isCustom ? " · personalizzato" : " · default"}
              </span>
              <span className="font-medium text-foreground">
                {completion.status === "nessun-dato" ? "Nessun dato" : `${completion.percent}% · ${isometryStatusLabels[completion.status]}`}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
              <div className={`h-full rounded-full ${completionColor}`} style={{ width: `${Math.min(100, completion.percent)}%` }} />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Target volume (s)</label>
                <Input inputMode="decimal" value={volumeTarget} onChange={(event) => setVolumeTarget(event.target.value)} aria-label="Target volume isometrico" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Obiettivo record (s)</label>
                <Input inputMode="decimal" value={recordTarget} onChange={(event) => setRecordTarget(event.target.value)} placeholder="opzionale" aria-label="Obiettivo record isometrico" />
              </div>
              <Button type="button" size="sm" onClick={saveTarget} disabled={saving}>
                {saving ? "Salvo…" : "Salva target"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void onResetTarget()} disabled={saving || !isometry?.target.isCustom}>
                Default
              </Button>
            </div>
            {message ? <p className="mt-2 text-[11px] text-muted-foreground">{message}</p> : null}
            <p className="mt-2 text-[11px] text-muted-foreground/80">
              I target iniziali sono provvisori: l app sta raccogliendo i dati reali. Modificali quando capisci quanto lavoro produce progressi.
            </p>
          </div>

          {isometry ? (
            <div className="space-y-1">
              <Trend label="Record" points={isometry.recordTrend} />
              <Trend label="Volume" points={isometry.volumeTrend} />
            </div>
          ) : null}
        </section>

        <details className="mt-5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            Record manuale {manualRecord ? <span className="ml-2 text-[11px] text-primary">attivo</span> : null}
          </summary>
          <div className="mt-3">
            <ManualRecordEditor exercise={exercise} manualRecord={manualRecord} onSave={onSaveManualRecord} onClear={onClearManualRecord} />
          </div>
        </details>
      </div>
    </div>
  );
}
