"use client";

import { Cloud, DatabaseBackup, ShieldAlert } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";

import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useArmTracker } from "@/features/arm-tracker/arm-tracker-provider";
import { LoadingPanel } from "@/features/arm-tracker/loading-panel";
import { getHistoryEntries, getLastWorkoutDate, formatDateLabel } from "@/lib/arm-tracker/selectors";
import { exportArmTrackerLocalBackups } from "@/lib/arm-tracker/storage";

interface HealthResponse {
  configured: boolean;
  counts?: {
    plans: number;
    sessions: number;
    exercises: number;
    workoutLogs: number;
    exerciseLogs: number;
    importRuns: number;
  };
  watchlistCount?: number;
  tombstoneCounts?: {
    workoutLogs: number;
    exerciseLogs: number;
    [key: string]: number;
  };
  seedVersion?: string | null;
  updatedAt?: string | null;
  versionsCount?: number | null;
  error?: string;
}

export default function SyncPage() {
  const { data, exportArchive, isReady, syncStatus } = useArmTracker();
  const [tokenInput, setTokenInput] = useState("");
  const [tokenMessage, setTokenMessage] = useState<string | null>(null);
  const [isSavingToken, setIsSavingToken] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  useEffect(() => {
    if (!isReady || !syncStatus.canWrite) {
      setHealth(null);
      return;
    }

    const abortController = new AbortController();
    setHealthLoading(true);

    void (async () => {
      try {
        const response = await fetch("/api/arm-tracker/health", {
          cache: "no-store",
          signal: abortController.signal
        });

        if (!response.ok) {
          throw new Error(`Health check non disponibile (${response.status}).`);
        }

        const payload = (await response.json()) as HealthResponse;
        setHealth(payload);
        setHealthError(null);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
        setHealthError(
          error instanceof Error ? error.message : "Health check non disponibile."
        );
        setHealth(null);
      } finally {
        setHealthLoading(false);
      }
    })();

    return () => abortController.abort();
  }, [isReady, syncStatus.canWrite]);

  if (!isReady) {
    return <LoadingPanel message="Controllo stato cloud..." />;
  }

  const workoutCount = getHistoryEntries(data).length;
  const lastWorkoutDate = getLastWorkoutDate(data);

  function downloadJsonFile(fileName: string, payload: string) {
    const blob = new Blob([payload], { type: "application/json" });
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(objectUrl);
  }

  function exportLegacyBackup() {
    const archive = exportArchive();
    downloadJsonFile(archive.fileName, archive.payload);
  }

  function exportSafetyBackups() {
    const archive = exportArmTrackerLocalBackups();
    downloadJsonFile(archive.fileName, archive.payload);
  }

  async function saveSyncToken() {
    setIsSavingToken(true);
    setTokenMessage(null);

    try {
      const response = await fetch("/api/arm-tracker/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ token: tokenInput })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Token non valido.");
      }

      setTokenMessage("Token salvato. Ricarico la pagina per ricontrollare il cloud.");
      window.location.reload();
    } catch (error) {
      setTokenMessage(error instanceof Error ? error.message : "Non sono riuscito a salvare il token.");
    } finally {
      setIsSavingToken(false);
    }
  }

  return (
    <div className="page-enter space-y-8">
      <PageHeader
        eyebrow="Sync"
        title="Stato database e sicurezza dati"
        description="Questa pagina controlla se Iron Log puo salvare nel database unico. Se il cloud non e confermato, i nuovi salvataggi restano bloccati per evitare dati intrappolati sul dispositivo."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={exportLegacyBackup}>
              <DatabaseBackup className="mr-2 h-4 w-4" />
              Esporta backup locale
            </Button>
            <Button type="button" variant="outline" onClick={exportSafetyBackups}>
              <DatabaseBackup className="mr-2 h-4 w-4" />
              Esporta backup di sicurezza
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Scrittura cloud"
          value={syncStatus.canWrite ? "Attiva" : "Bloccata"}
          hint={syncStatus.canWrite ? "Il database unico e raggiungibile." : "Nessun dato reale verra salvato solo nel browser."}
          icon={<Cloud className="h-5 w-5" />}
        />
        <MetricCard
          label="Stato sync"
          value={syncStatus.state}
          hint="checking, ready oppure blocked."
          icon={<ShieldAlert className="h-5 w-5" />}
        />
        <MetricCard
          label="Log leggibili"
          value={workoutCount}
          hint="Dati attualmente caricati in questa sessione."
          icon={<DatabaseBackup className="h-5 w-5" />}
        />
        <MetricCard
          label="Ultimo workout"
          value={lastWorkoutDate ? formatDateLabel(lastWorkoutDate, "d MMM yyyy") : "-"}
          hint="Ultimo allenamento presente nei dati leggibili."
          icon={<Cloud className="h-5 w-5" />}
        />
      </div>

      {!syncStatus.canWrite ? (
        <Card>
          <CardHeader>
            <CardTitle>Cloud non pronto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
            <p>{syncStatus.message}</p>
            <div className="grid gap-3 rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-4 sm:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <label htmlFor="sync-token" className="text-sm font-medium text-foreground">
                  Token sync
                </label>
                <Input
                  id="sync-token"
                  type="password"
                  value={tokenInput}
                  onChange={(event) => setTokenInput(event.target.value)}
                  placeholder="Inserisci il token configurato su Vercel"
                  autoComplete="off"
                />
              </div>
              <div className="flex items-end">
                <Button type="button" onClick={saveSyncToken} disabled={isSavingToken || !tokenInput.trim()}>
                  {isSavingToken ? "Verifica..." : "Collega"}
                </Button>
              </div>
              {tokenMessage ? (
                <p className="sm:col-span-2 text-sm text-muted-foreground">{tokenMessage}</p>
              ) : null}
            </div>
            <p>
              Per recuperare i dati dell&apos;iPad, apri la PWA sull&apos;iPad, vai in Importa, esporta il
              backup JSON e poi importalo qui quando il database cloud sara configurato.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href={"/import" as Route}>Apri Importa</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={"/program" as Route}>Torna al programma</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Cloud pronto</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-7 text-muted-foreground">
              I salvataggi sono abilitati. Lo snapshot JSON in
              <code className="mx-1 rounded bg-white/[0.05] px-1 py-0.5 font-mono text-xs">
                arm_tracker_snapshots
              </code>
              e l&apos;unica fonte di verita tra i dispositivi: ogni overwrite viene
              versionato in
              <code className="mx-1 rounded bg-white/[0.05] px-1 py-0.5 font-mono text-xs">
                arm_tracker_snapshot_versions
              </code>
              prima di essere applicato.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Stato dati lato cloud</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Conteggi letti direttamente da Supabase. Confronta con i conteggi locali per
                  verificare che ogni dispositivo veda gli stessi dati.
                </p>
              </div>
              {health?.updatedAt ? (
                <span className="font-mono text-[11px] text-muted-foreground">
                  ultimo write{" "}
                  {formatDateLabel(health.updatedAt.slice(0, 10), "d MMM yyyy")}
                </span>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3">
              {healthLoading && !health ? (
                <p className="text-sm text-muted-foreground">Sto interrogando il cloud...</p>
              ) : null}
              {healthError ? (
                <p className="text-sm text-destructive">{healthError}</p>
              ) : null}
              {health?.counts ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <MetricCard
                    label="Workout cloud"
                    value={health.counts.workoutLogs}
                    hint={`Locali: ${data.workoutLogs.length}${
                      health.counts.workoutLogs !== data.workoutLogs.length
                        ? " · differiscono"
                        : ""
                    }`}
                    icon={<Cloud className="h-4 w-4" />}
                  />
                  <MetricCard
                    label="Esercizi log"
                    value={health.counts.exerciseLogs}
                    hint={`Locali: ${data.exerciseLogs.length}`}
                    icon={<Cloud className="h-4 w-4" />}
                  />
                  <MetricCard
                    label="Programmi"
                    value={health.counts.plans}
                    hint={`Locali: ${data.plans.length}`}
                    icon={<DatabaseBackup className="h-4 w-4" />}
                  />
                  <MetricCard
                    label="Watchlist L100"
                    value={health.watchlistCount ?? 0}
                    hint={`Locale: ${data.level100Watchlist.length}`}
                    icon={<ShieldAlert className="h-4 w-4" />}
                  />
                  <MetricCard
                    label="Tombstones workout"
                    value={health.tombstoneCounts?.workoutLogs ?? 0}
                    hint="Delete propagate via cloud."
                    icon={<DatabaseBackup className="h-4 w-4" />}
                  />
                  <MetricCard
                    label="Versioni snapshot"
                    value={health.versionsCount ?? "-"}
                    hint="Stato recuperabile da arm_tracker_snapshot_versions."
                    icon={<DatabaseBackup className="h-4 w-4" />}
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
