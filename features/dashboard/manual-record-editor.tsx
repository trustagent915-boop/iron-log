"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Level100Exercise } from "@/lib/arm-tracker/level-100";

import { getDashboardExerciseKey, normalizeDashboardName } from "./level-ui";

/**
 * Record inserito a mano (es. una gara o un test fuori dall app). Vive nel
 * browser: sovrascrive la lettura dallo storico solo per la Dashboard.
 */
export interface Level100ManualRecord {
  exerciseName: string;
  bodyweightKg: number | null;
  weight: number | null;
  reps: number | null;
  seconds: number | null;
  date: string | null;
}

function toField(value: number | null) {
  return value === null ? "" : String(value);
}

function parseField(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeManualRecords(value: unknown): Record<string, Level100ManualRecord> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.values(value)
      .filter((record): record is Partial<Level100ManualRecord> =>
        Boolean(record && typeof record === "object" && "exerciseName" in record)
      )
      .map((record) => {
        const exerciseName = normalizeDashboardName(String(record.exerciseName ?? ""));
        const num = (input: unknown) => (typeof input === "number" && Number.isFinite(input) ? input : null);

        return [
          getDashboardExerciseKey(exerciseName),
          {
            exerciseName,
            bodyweightKg: num(record.bodyweightKg),
            weight: num(record.weight),
            reps: num(record.reps),
            seconds: num(record.seconds),
            date: typeof record.date === "string" && record.date ? record.date : null
          }
        ] as const;
      })
      .filter(([, record]) => Boolean(record.exerciseName))
  );
}

export function ManualRecordEditor({
  exercise,
  manualRecord,
  onSave,
  onClear
}: {
  exercise: Level100Exercise;
  manualRecord: Level100ManualRecord | null;
  onSave: (record: Level100ManualRecord) => void;
  onClear: (exerciseName: string) => void;
}) {
  const [bodyweight, setBodyweight] = useState("");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [seconds, setSeconds] = useState("");
  const [date, setDate] = useState(today());

  useEffect(() => {
    setBodyweight(toField(manualRecord?.bodyweightKg ?? exercise.bestValidBodyweightKg));
    setWeight(toField(manualRecord?.weight ?? exercise.bestValidWeight));
    setReps(toField(manualRecord?.reps ?? exercise.bestValidReps));
    setSeconds(toField(manualRecord?.seconds ?? exercise.bestValidSeconds));
    setDate(manualRecord?.date ?? exercise.bestValidDate ?? today());
  }, [exercise, manualRecord]);

  function save() {
    const next: Level100ManualRecord = {
      exerciseName: exercise.exerciseName,
      bodyweightKg: parseField(bodyweight),
      weight: parseField(weight),
      reps: parseField(reps),
      seconds: parseField(seconds),
      date: date || today()
    };

    if (next.weight === null && next.reps === null && next.seconds === null) {
      onClear(exercise.exerciseName);
      return;
    }

    onSave(next);
  }

  const fields: Array<[string, string, (value: string) => void, string]> = [
    ["Peso corporeo", bodyweight, setBodyweight, "es. 90"],
    ["Kg / zavorra", weight, setWeight, "es. 100"],
    ["Reps", reps, setReps, "min 3"],
    ["Secondi iso", seconds, setSeconds, "es. 10"]
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([label, value, setValue, placeholder]) => (
          <div key={label} className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {label}
            </label>
            <Input
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={placeholder}
              aria-label={`${label} record ${exercise.exerciseName}`}
            />
          </div>
        ))}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Data
          </label>
          <Input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            aria-label={`Data record ${exercise.exerciseName}`}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={save}>
          Salva record manuale
        </Button>
        {manualRecord ? (
          <Button type="button" size="sm" variant="outline" onClick={() => onClear(exercise.exerciseName)}>
            Torna allo storico
          </Button>
        ) : null}
      </div>
    </div>
  );
}
