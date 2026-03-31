"use client";

import {
  ArrowRight,
  BadgeCheck,
  CalendarRange,
  Flame,
  History,
  Sparkles,
  Target,
  Trophy,
  Zap,
  Weight
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LoadingPanel } from "@/features/arm-tracker/loading-panel";
import { StatusBadge } from "@/features/arm-tracker/status-badge";
import { useArmTracker } from "@/features/arm-tracker/arm-tracker-provider";
import {
  formatDateLabel,
  formatExercisePrescription,
  formatVolume,
  getGamificationSummary,
  getCustomSessionsWithExercises,
  getHistoryEntries,
  getLastWorkoutDate,
  getMostFrequentExercise,
  getPlanSessionsWithExercises,
  getUpcomingSession,
  getWeeklyVolume
} from "@/lib/arm-tracker/selectors";

export default function DashboardPage() {
  const { data, activePlan, isReady } = useArmTracker();

  if (!isReady) {
    return <LoadingPanel />;
  }

  if (!activePlan) {
    return (
      <div className="page-enter space-y-8">
        <PageHeader
          eyebrow="Dashboard"
          title="Iron Log e pronto al primo import"
          description="Carica il foglio Excel del tuo programma e trasformalo in un cockpit operativo con timeline, log, custom workout e statistiche locali."
        />

        <Card className="overflow-hidden">
          <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
            <CardContent className="space-y-6 p-6 pt-6 sm:p-8 sm:pt-8">
              <div className="space-y-3">
                <p className="eyebrow">Setup iniziale</p>
                <h2 className="text-3xl font-semibold text-foreground sm:text-4xl">
                  Importa il programma una volta, poi gestisci ogni seduta da qui.
                </h2>
                <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                  Iron Log legge il foglio, organizza settimane ed esercizi, poi ti porta
                  rapidamente dal piano al log reale senza backend o passaggi superflui.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link href={"/import" as Route}>Importa programma</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={"/program" as Route}>Esplora la struttura</Link>
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="data-chip">Import guidato da Excel</span>
                <span className="data-chip">Storico locale immediato</span>
                <span className="data-chip">Statistiche su peso, reps e volume</span>
              </div>
            </CardContent>

            <div className="panel-divider bg-white/[0.03] p-6 sm:p-8 lg:border-l lg:border-t-0">
              <div className="space-y-4">
                <p className="eyebrow">Cosa ottieni</p>
                <div className="space-y-4 text-sm leading-7 text-muted-foreground">
                  <p>Timeline delle sessioni pianificate e accesso rapido al log.</p>
                  <p>Custom workout per le sedute extra fuori programma.</p>
                  <p>Storico compatto per confrontare previsto, eseguito e progressione.</p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const plannedSessions = getPlanSessionsWithExercises(data, activePlan.id);
  const customSessions = getCustomSessionsWithExercises(data, activePlan.id);
  const completedSessions = plannedSessions.filter((session) => session.status === "completed").length;
  const completionRate = plannedSessions.length
    ? Math.round((completedSessions / plannedSessions.length) * 100)
    : 0;
  const weeklyVolume = getWeeklyVolume(data);
  const frequentExercise = getMostFrequentExercise(data);
  const lastWorkoutDate = getLastWorkoutDate(data);
  const upcomingSession = getUpcomingSession(data);
  const recentHistory = getHistoryEntries(data).slice(0, 4);
  const nextSessions = plannedSessions.filter((session) => session.status === "planned").slice(0, 3);
  const gamification = getGamificationSummary(data);
  const unlockedBadges = gamification.badges.filter((badge) => badge.unlocked);
  const featuredBadges = gamification.badges.slice(0, 3);

  return (
    <div className="page-enter space-y-8">
      <PageHeader
        eyebrow="Dashboard"
        title={activePlan.name}
        description={`Workspace attivo importato da ${activePlan.sourceFileName}. Qui controlli il piano, apri al volo il prossimo log e tieni vicine le sedute extra.`}
        actions={
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href={"/custom-workout/new" as Route}>Nuovo custom workout</Link>
            </Button>
            <Button asChild>
              <Link href={"/import" as Route}>Aggiorna programma</Link>
            </Button>
          </div>
        }
      />

      <section className="grid gap-6 xl:grid-cols-[1.28fr_0.72fr]">
        <Card className="overflow-hidden">
          <div className="grid gap-0 lg:grid-cols-[1.18fr_0.82fr]">
            <CardContent className="space-y-6 p-6 pt-6 sm:p-8 sm:pt-8">
              <div className="space-y-3">
                <p className="eyebrow">Training cockpit</p>
                <h2 className="text-3xl font-semibold text-foreground sm:text-4xl">
                  Tieni il piano in vista e passa al log quando la seduta chiama.
                </h2>
                <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                  La pagina iniziale e stata ripensata come una cabina operativa: priorita
                  chiara, stato del piano, accesso rapido ai workout custom e timeline breve per
                  non perdere il contesto.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="data-chip">Completamento piano {completionRate}%</span>
                <span className="data-chip">{customSessions.length} custom workout archiviati</span>
                <span className="data-chip">Livello {gamification.level} · {gamification.totalXp} XP</span>
                <span className="data-chip">
                  Ultimo log {lastWorkoutDate ? formatDateLabel(lastWorkoutDate, "d MMM") : "non ancora registrato"}
                </span>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link href={(upcomingSession ? `/log/${upcomingSession.id}` : "/program") as Route}>
                    {upcomingSession ? "Apri il prossimo log" : "Apri il programma"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={"/history" as Route}>Apri lo storico</Link>
                </Button>
              </div>
            </CardContent>

            <div className="panel-divider bg-white/[0.03] p-6 sm:p-8 lg:border-l lg:border-t-0">
              <div className="space-y-4">
                <p className="eyebrow">Prossima finestra utile</p>
                {upcomingSession ? (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-2xl font-semibold text-foreground">
                          {formatDateLabel(upcomingSession.sessionDate)}
                        </h3>
                        <StatusBadge status={upcomingSession.status} />
                      </div>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {upcomingSession.dayLabel ?? "Sessione pianificata"} con {" "}
                        {upcomingSession.exercises.length} esercizi pronti per il log.
                      </p>
                    </div>

                    <div className="space-y-3">
                      {upcomingSession.exercises.slice(0, 3).map((exercise) => (
                        <div key={exercise.id} className="list-row">
                          <p className="font-medium text-foreground">{exercise.exerciseName}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {formatExercisePrescription(exercise)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm leading-7 text-muted-foreground">
                      Nessuna seduta futura pianificata. Puoi entrare nello storico o creare una
                      sessione extra per mantenere il tracking completo.
                    </p>
                    <Button asChild variant="outline">
                      <Link href={"/custom-workout/new" as Route}>Crea una sessione extra</Link>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <p className="eyebrow">Progress ladder</p>
              <CardTitle className="text-2xl">La tua progressione resta leggibile anche nel lungo periodo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-foreground">Livello {gamification.level}</p>
                  <span className="data-chip">{gamification.xpIntoLevel}/{gamification.xpForNextLevel} XP</span>
                </div>
                <Progress value={gamification.levelProgress} />
                <p>Ogni log salva volume, stato sessione e PR in modo persistente e li trasforma in avanzamento reale.</p>
              </div>
              <div className="list-row">
                <p className="font-medium text-foreground">Streak attuale</p>
                <p>
                  {gamification.currentWeekStreak} settimane attive di fila, massimo storico{" "}
                  {gamification.longestWeekStreak}.
                </p>
              </div>
              <div className="list-row">
                <p className="font-medium text-foreground">Record personali</p>
                <p>{gamification.recordBreakCount} PR rotti nel tempo e {unlockedBadges.length} badge gia sbloccati.</p>
              </div>
              <div className="list-row">
                <p className="font-medium text-foreground">Focus ricorrente</p>
                <p>{frequentExercise ?? "Ancora nessun esercizio ricorrente rilevato"}.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {featuredBadges.map((badge) => (
                  <span key={badge.id} className="data-chip">
                    {badge.title}: {badge.unlocked ? "sbloccato" : `${badge.current}/${badge.target}`}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Azioni rapide</p>
                <CardTitle className="mt-3 text-2xl">Non perdere il ritmo</CardTitle>
              </div>
              <Sparkles className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full justify-between">
                <Link href={"/custom-workout/new" as Route}>
                  Aggiungi un workout extra
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-between">
                <Link href={"/stats" as Route}>
                  Controlla la progressione
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-between">
                <Link href={"/history" as Route}>
                  Rivedi le sessioni salvate
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Sessioni completate"
          value={`${completedSessions}/${plannedSessions.length || 0}`}
          hint="Ritmo del piano attivo, senza mescolare le sedute extra."
          icon={<Trophy className="h-5 w-5" />}
        />
        <MetricCard
          label="Volume settimanale"
          value={formatVolume(weeklyVolume)}
          hint="Somma sets x reps x peso registrata nella settimana corrente."
          icon={<Weight className="h-5 w-5" />}
        />
        <MetricCard
          label="Livello atleta"
          value={`Lv ${gamification.level}`}
          hint={`${gamification.totalXp} XP accumulati tra log, volume e record personali.`}
          icon={<Zap className="h-5 w-5" />}
        />
        <MetricCard
          label="Badge sbloccati"
          value={unlockedBadges.length}
          hint="Milestone guadagnate restando costante tra programma e workout extra."
          icon={<BadgeCheck className="h-5 w-5" />}
        />
      </div>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Attivita recente</p>
              <CardTitle className="mt-3 text-2xl">Ultimi log salvati</CardTitle>
            </div>
            <History className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            {recentHistory.length ? (
              recentHistory.map((entry) => (
                <Link
                  key={entry.log.id}
                  href={(entry.session ? `/history/${entry.session.id}` : "/history") as Route}
                  className="list-row flex items-start justify-between gap-4"
                >
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">
                      {formatDateLabel(entry.log.performedDate)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {entry.session?.dayLabel ?? "Seduta registrata"} - {entry.exerciseNames.length} esercizi
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {entry.exerciseNames.join(", ")}
                    </p>
                  </div>
                  <StatusBadge status={entry.log.completionStatus} />
                </Link>
              ))
            ) : (
              <div className="list-row">
                <p className="text-sm leading-7 text-muted-foreground">
                  Non ci sono ancora allenamenti registrati. Appena salvi il primo log, qui trovi
                  il riepilogo rapido.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Timeline vicina</p>
              <CardTitle className="mt-3 text-2xl">Le prossime sessioni in agenda</CardTitle>
            </div>
            <Target className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            {nextSessions.length ? (
              nextSessions.map((session) => (
                <div key={session.id} className="list-row space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-foreground">
                      {session.dayLabel ?? formatDateLabel(session.sessionDate)}
                    </p>
                    <span className="data-chip">{formatDateLabel(session.sessionDate, "d MMM")}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {session.exercises.length} esercizi pronti - {" "}
                    {session.exercises
                      .slice(0, 2)
                      .map((exercise) => exercise.exerciseName)
                      .join(", ")}
                  </p>
                </div>
              ))
            ) : (
              <div className="list-row space-y-3">
                <p className="text-sm leading-7 text-muted-foreground">
                  Nessuna sessione futura individuata nel piano. Se oggi vuoi allenarti comunque,
                  crea un custom workout e tienilo nello stesso storico.
                </p>
                <Button asChild variant="outline">
                  <Link href={"/custom-workout/new" as Route}>Crea sessione extra</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
