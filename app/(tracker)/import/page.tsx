"use client";

import { DatabaseBackup, Download, Upload } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import type { ChangeEvent, DragEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { WorkBook } from "xlsx";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { LoadingPanel } from "@/features/arm-tracker/loading-panel";
import { useArmTracker } from "@/features/arm-tracker/arm-tracker-provider";
import {
  autoMapColumns,
  getMappingCompleteness,
  getSheetHeaders,
  getSheetNames,
  getSuggestedSheetName,
  parseSheet,
  readWorkbook
} from "@/lib/arm-tracker/excel-parser";
import type { ColumnMapping, ImportPlanResult, ParsedSheetResult } from "@/lib/arm-tracker/types";

const steps = ["Upload", "Foglio", "Mapping", "Conferma"];
const mappingLabels: Array<{ key: keyof ColumnMapping; label: string; required?: boolean }> = [
  { key: "date", label: "Data" },
  { key: "day", label: "Giorno" },
  { key: "week", label: "Settimana" },
  { key: "exercise", label: "Esercizio", required: true },
  { key: "sets", label: "Set" },
  { key: "reps", label: "Reps" },
  { key: "weight", label: "Peso" },
  { key: "notes", label: "Note" }
];

const emptyMapping: ColumnMapping = {
  date: null,
  day: null,
  week: null,
  exercise: null,
  sets: null,
  reps: null,
  weight: null,
  notes: null
};

export default function ImportPage() {
  const router = useRouter();
  const { data, exportArchive, importArchive, importPlan, isReady } = useArmTracker();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const archiveInputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const [isImportingArchive, setIsImportingArchive] = useState(false);
  const [fileName, setFileName] = useState("");
  const [workbook, setWorkbook] = useState<WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>(emptyMapping);
  const [parsedSheet, setParsedSheet] = useState<ParsedSheetResult | null>(null);
  const [importResult, setImportResult] = useState<ImportPlanResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [archiveMessage, setArchiveMessage] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  useEffect(() => {
    if (!workbook || !selectedSheet) {
      return;
    }

    const nextHeaders = getSheetHeaders(workbook, selectedSheet);
    setHeaders(nextHeaders);
    setMapping(autoMapColumns(nextHeaders));
  }, [selectedSheet, workbook]);

  useEffect(() => {
    if (!workbook || !selectedSheet) {
      setParsedSheet(null);
      return;
    }

    setParsedSheet(parseSheet(workbook, selectedSheet, mapping));
  }, [mapping, selectedSheet, workbook]);

  if (!isReady) {
    return <LoadingPanel message="Preparazione wizard di importazione..." />;
  }

  const completeness = getMappingCompleteness(mapping);
  const progressValue = (step / steps.length) * 100;

  async function loadFile(file: File) {
    setIsUploading(true);
    setErrorMessage(null);
    setImportResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const nextWorkbook = readWorkbook(buffer);
      const nextSheetNames = getSheetNames(nextWorkbook);
      const suggestedSheet = getSuggestedSheetName(nextSheetNames);

      setFileName(file.name);
      setWorkbook(nextWorkbook);
      setSheetNames(nextSheetNames);
      setSelectedSheet(suggestedSheet);
      setStep(nextSheetNames.length ? 2 : 1);
    } catch {
      setErrorMessage("Non sono riuscito a leggere il file Excel. Verifica che sia un .xlsx o .xls valido.");
    } finally {
      setIsUploading(false);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    void loadFile(file);
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];

    if (!file) {
      return;
    }

    void loadFile(file);
  }

  function onMappingChange(field: keyof ColumnMapping, value: string) {
    setMapping((currentMapping) => ({
      ...currentMapping,
      [field]: value || null
    }));
  }

  function handleImport() {
    if (!parsedSheet || !selectedSheet || !fileName) {
      return;
    }

    const result = importPlan({
      fileName,
      sheetName: selectedSheet,
      rows: parsedSheet.rows,
      warnings: parsedSheet.warnings,
      totalRows: parsedSheet.totalRows
    });

    setImportResult(result);
    setStep(4);
  }

  function handleArchiveExport() {
    const archive = exportArchive();
    const blob = new Blob([archive.payload], { type: "application/json" });
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = archive.fileName;
    link.click();
    window.URL.revokeObjectURL(objectUrl);

    setArchiveError(null);
    setArchiveMessage(
      `Backup esportato con ${archive.counts.workoutLogs} workout, ${archive.counts.exerciseLogs} righe esercizio e ${archive.counts.importRuns} import salvati.`
    );
  }

  async function handleArchiveFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setIsImportingArchive(true);
    setArchiveError(null);

    try {
      const result = await importArchive(file);
      setArchiveMessage(
        `Backup unito allo storico: +${result.added.workoutLogs} workout, +${result.added.exerciseLogs} righe esercizio e +${result.added.importRuns} import.`
      );
    } catch (error) {
      setArchiveError(
        error instanceof Error ? error.message : "Non sono riuscito a leggere il backup selezionato."
      );
    } finally {
      setIsImportingArchive(false);
      event.target.value = "";
    }
  }

  return (
    <div className="page-enter space-y-8">
      <PageHeader
        eyebrow="Importazione"
        title="Importa il programma Excel"
        description="Carica il file, scegli il foglio corretto e conferma il mapping delle colonne prima di salvare il nuovo piano attivo."
      />

      <Card className="overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
          <CardContent className="space-y-5 p-6 pt-6 sm:p-7 sm:pt-7">
            <div className="space-y-3">
              <p className="eyebrow">Data vault</p>
              <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">
                Salva lo storico fuori dal browser, senza spezzare le statistiche.
              </h2>
              <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                Il vault esporta tutto lo stato Iron Log in un JSON versionato. Puoi anche reimportare
                workbook storici `.xls` o `.xlsx` nel formato Iron Log per unire anni diversi nello
                stesso storico locale.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                <p className="text-sm text-muted-foreground">Workout salvati</p>
                <p className="mt-2 text-2xl font-semibold">{data.workoutLogs.length}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                <p className="text-sm text-muted-foreground">Righe esercizio</p>
                <p className="mt-2 text-2xl font-semibold">{data.exerciseLogs.length}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                <p className="text-sm text-muted-foreground">Import eseguiti</p>
                <p className="mt-2 text-2xl font-semibold">{data.importRuns.length}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={handleArchiveExport}>
                <Download className="mr-2 h-4 w-4" />
                Esporta backup JSON
              </Button>
              <Button
                variant="outline"
                onClick={() => archiveInputRef.current?.click()}
                disabled={isImportingArchive}
              >
                <Upload className="mr-2 h-4 w-4" />
                {isImportingArchive ? "Import backup..." : "Unisci backup o workbook"}
              </Button>
            </div>

            <input
              ref={archiveInputRef}
              type="file"
              accept=".json,application/json,.xls,.xlsx"
              className="hidden"
              onChange={handleArchiveFileChange}
            />

            {archiveMessage ? (
              <p className="text-sm text-[hsl(var(--success))]">{archiveMessage}</p>
            ) : null}
            {archiveError ? <p className="text-sm text-destructive">{archiveError}</p> : null}
          </CardContent>

          <div className="panel-divider bg-white/[0.03] p-6 sm:p-7 lg:border-l lg:border-t-0">
            <div className="space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-primary/15 text-primary">
                <DatabaseBackup className="h-5 w-5" />
              </div>
              <div className="space-y-3">
                <p className="eyebrow">Perche serve</p>
                <div className="space-y-3 text-sm leading-7 text-muted-foreground">
                  <p>Ogni workout nuovo entra subito nello storico e resta leggibile anche in futuro.</p>
                  <p>Il backup e pensato per spostare i dati tra browser o preparare la migrazione al cloud.</p>
                  <p>Puoi usare anche workbook storici esportati con fogli `Plans`, `Sessions`, `Exercises`, `WorkoutLogs`, `ExerciseLogs` e `ImportRuns`.</p>
                  <p>L&apos;import e non distruttivo: unisce i dati senza cancellare lo storico locale.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <CardTitle>Wizard in 4 step</CardTitle>
            <p className="text-sm text-muted-foreground">Step {step} di 4</p>
          </div>
          <Progress value={progressValue} />
          <div className="grid gap-2 sm:grid-cols-4">
            {steps.map((label, index) => (
              <div
                key={label}
                className={`rounded-2xl border px-3 py-3 text-sm ${step >= index + 1 ? "border-primary/40 bg-primary/10 text-foreground" : "border-border/70 bg-secondary/20 text-muted-foreground"}`}
              >
                <span className="block text-xs uppercase tracking-[0.18em]">0{index + 1}</span>
                <span className="mt-1 block font-medium">{label}</span>
              </div>
            ))}
          </div>
        </CardHeader>
      </Card>

      {step >= 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>1. Upload file</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDrop={onDrop}
              onDragOver={(event) => event.preventDefault()}
              className="flex min-h-52 w-full flex-col items-center justify-center rounded-3xl border border-dashed border-border/80 bg-secondary/20 px-6 text-center transition hover:border-primary/40 hover:bg-secondary/35"
            >
              <p className="text-lg font-semibold text-foreground">Trascina qui il tuo file Excel</p>
              <p className="mt-2 max-w-lg text-sm text-muted-foreground">
                Oppure tocca per selezionare un file .xlsx o .xls. Il parsing avviene tutto sul dispositivo.
              </p>
              <span className="mt-5 rounded-full border border-border/70 px-4 py-2 text-sm text-muted-foreground">
                {isUploading ? "Lettura in corso..." : fileName || "Scegli file"}
              </span>
            </button>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onFileChange} />
            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      {workbook && step >= 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>2. Selezione foglio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={selectedSheet} onChange={(event) => setSelectedSheet(event.target.value)}>
              {sheetNames.map((sheetName) => (
                <option key={sheetName} value={sheetName}>
                  {sheetName}
                </option>
              ))}
            </Select>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setStep(3)} disabled={!selectedSheet}>
                Continua al mapping
              </Button>
              <Button variant="outline" onClick={() => setStep(1)}>
                Cambia file
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {workbook && selectedSheet && step >= 3 ? (
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle>3. Mapping e anteprima</CardTitle>
            <p className="text-sm text-muted-foreground">
              Collega le colonne del foglio ai campi interni. Serve almeno l&apos;esercizio e una data o etichetta giorno.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {mappingLabels.map((field) => (
                <div key={field.key} className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    {field.label}
                    {field.required ? <span className="ml-1 text-primary">*</span> : null}
                  </label>
                  <Select value={mapping[field.key] ?? ""} onChange={(event) => onMappingChange(field.key, event.target.value)}>
                    <option value="">Nessuna colonna</option>
                    {headers.map((header) => (
                      <option key={`${field.key}-${header}`} value={header}>
                        {header}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                <p className="text-sm font-semibold text-foreground">Colonne mappate</p>
                <p className="mt-2 text-2xl font-semibold">{completeness.mappedCount}/{completeness.totalCount}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                <p className="text-sm font-semibold text-foreground">Righe valide</p>
                <p className="mt-2 text-2xl font-semibold">{parsedSheet?.importedRows ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                <p className="text-sm font-semibold text-foreground">Righe scartate</p>
                <p className="mt-2 text-2xl font-semibold">{parsedSheet?.skippedRows ?? 0}</p>
              </div>
            </div>

            {completeness.missingRequired.length ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                Completa il mapping di esercizio e almeno uno tra data o giorno prima di importare.
              </div>
            ) : null}

            {parsedSheet?.warnings.length ? (
              <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                <p className="text-sm font-semibold text-foreground">Avvisi rilevati</p>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {parsedSheet.warnings.slice(0, 8).map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                  {parsedSheet.warnings.length > 8 ? <p>Altri {parsedSheet.warnings.length - 8} avvisi non mostrati.</p> : null}
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Anteprima prime 20 righe valide</p>
              {parsedSheet?.previewRows.length ? (
                <div className="overflow-x-auto rounded-2xl border border-border/70">
                  <table className="min-w-full text-sm">
                    <thead className="bg-secondary/40 text-left text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Data</th>
                        <th className="px-4 py-3">Giorno</th>
                        <th className="px-4 py-3">Settimana</th>
                        <th className="px-4 py-3">Esercizio</th>
                        <th className="px-4 py-3">Set</th>
                        <th className="px-4 py-3">Reps</th>
                        <th className="px-4 py-3">Peso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedSheet.previewRows.map((row) => (
                        <tr key={row.rowIndex} className="border-t border-border/70">
                          <td className="px-4 py-3">{row.date ?? "-"}</td>
                          <td className="px-4 py-3">{row.day ?? "-"}</td>
                          <td className="px-4 py-3">{row.week ?? "-"}</td>
                          <td className="px-4 py-3">{row.exercise ?? "-"}</td>
                          <td className="px-4 py-3">{row.sets ?? "-"}</td>
                          <td className="px-4 py-3">{row.reps ?? "-"}</td>
                          <td className="px-4 py-3">{row.weight ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nessuna riga valida da mostrare in anteprima.</p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleImport}
                disabled={Boolean(completeness.missingRequired.length || !parsedSheet?.importedRows)}
              >
                Conferma importazione
              </Button>
              <Button variant="outline" onClick={() => setStep(2)}>
                Torna alla selezione foglio
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step >= 4 && importResult ? (
        <Card>
          <CardHeader>
            <CardTitle>4. Importazione completata</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                <p className="text-sm text-muted-foreground">Sessioni create</p>
                <p className="mt-2 text-2xl font-semibold">{importResult.sessions.length}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                <p className="text-sm text-muted-foreground">Esercizi importati</p>
                <p className="mt-2 text-2xl font-semibold">{importResult.importedRows}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                <p className="text-sm text-muted-foreground">Righe scartate</p>
                <p className="mt-2 text-2xl font-semibold">{importResult.skippedRows}</p>
              </div>
            </div>

            {importResult.warnings.length ? (
              <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                <p className="text-sm font-semibold text-foreground">Avvisi finali</p>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {importResult.warnings.slice(0, 10).map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => router.push("/" as Route)}>Vai alla dashboard</Button>
              <Button variant="outline" onClick={() => router.push("/program" as Route)}>Apri programma</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
