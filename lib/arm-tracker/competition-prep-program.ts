import type { ArmTrackerData, Plan, PlanExercise, PlanSession } from "@/lib/arm-tracker/types";

const programId = "competition-prep-armwrestling-2026-06";
const importedAt = "2026-06-09T08:00:00.000Z";

type PrepExercise = {
  name: string;
  sets: number;
  reps: number | null;
  weight: number | null;
  notes?: string;
};

type PrepSession = {
  id: string;
  date: string;
  title: string;
  week: number;
  notes: string;
  exercises: PrepExercise[];
};

const prepSessions: PrepSession[] = [
  {
    id: "competition-prep-armwrestling-2026-06-session-1",
    date: "2026-06-09",
    title: "Gara prep 1 - Pull + back pressure",
    week: 1,
    notes: "Post gara: carichi forti ma tecnici. Scala di 5 kg se gomito, bicipite o polso sono affaticati.",
    exercises: [
      { name: "Pull Up zavorrato", sets: 4, reps: 3, weight: 55, notes: "Zavorra. Stop se perdi scapole o gomito." },
      { name: "Rematore", sets: 4, reps: 5, weight: 95 },
      { name: "Back Pressure Destro", sets: 5, reps: 5, weight: 30 },
      { name: "Back Pressure Sinistro", sets: 5, reps: 5, weight: 25 },
      { name: "Pronation Destro", sets: 4, reps: 8, weight: 20 },
      { name: "Pronation Sinistro", sets: 4, reps: 8, weight: 15 },
      { name: "Cupping Destro", sets: 3, reps: 10, weight: 20 },
      { name: "Cupping Sinistro", sets: 3, reps: 10, weight: 15 }
    ]
  },
  {
    id: "competition-prep-armwrestling-2026-06-session-2",
    date: "2026-06-12",
    title: "Gara prep 2 - Push + side pressure",
    week: 1,
    notes: "Focus posizione: side pressure solo con polso chiuso e spalla compatta.",
    exercises: [
      { name: "Panca Piana", sets: 4, reps: 4, weight: 100 },
      { name: "Military Press", sets: 5, reps: 3, weight: 60 },
      { name: "Dips zavorrati", sets: 4, reps: 3, weight: 50, notes: "Zavorra." },
      { name: "Side Pressure Destro", sets: 5, reps: 4, weight: 30 },
      { name: "Side Pressure Sinistro", sets: 5, reps: 4, weight: 25 },
      { name: "Rising Belt Curl Destro", sets: 4, reps: 6, weight: 20 },
      { name: "Rising Belt Curl Sinistro", sets: 4, reps: 6, weight: 15 }
    ]
  },
  {
    id: "competition-prep-armwrestling-2026-06-session-3",
    date: "2026-06-16",
    title: "Gara prep 3 - Mano e polso pesante",
    week: 2,
    notes: "Costruzione specifica. Qualita massima, nessuno strappo sui tendini.",
    exercises: [
      { name: "Cupping Destro", sets: 5, reps: 6, weight: 25 },
      { name: "Cupping Sinistro", sets: 5, reps: 6, weight: 20 },
      { name: "Wrist Curl Destro", sets: 4, reps: 8, weight: 30 },
      { name: "Wrist Curl Sinistro", sets: 4, reps: 8, weight: 25 },
      { name: "Supination Destro", sets: 4, reps: 6, weight: 20 },
      { name: "Supination Sinistro", sets: 4, reps: 6, weight: 15 },
      { name: "Static Hold", sets: 5, reps: null, weight: 25, notes: "10 sec destro. Se fai sinistro usa 20 kg." }
    ]
  },
  {
    id: "competition-prep-armwrestling-2026-06-session-4",
    date: "2026-06-19",
    title: "Gara prep 4 - Picco tecnico",
    week: 2,
    notes: "Seduta piu intensa del blocco. Non andare a cedimento: tripla pulita, posizione tua.",
    exercises: [
      { name: "Back Pressure Destro", sets: 5, reps: 3, weight: 35 },
      { name: "Back Pressure Sinistro", sets: 5, reps: 3, weight: 30 },
      { name: "Side Pressure Destro", sets: 5, reps: 3, weight: 35 },
      { name: "Side Pressure Sinistro", sets: 5, reps: 3, weight: 30 },
      { name: "Pronation Destro", sets: 4, reps: 5, weight: 25 },
      { name: "Pronation Sinistro", sets: 4, reps: 5, weight: 20 },
      { name: "Rising Belt Curl Destro", sets: 4, reps: 5, weight: 25 },
      { name: "Rising Belt Curl Sinistro", sets: 4, reps: 5, weight: 20 },
      { name: "Pull Up zavorrato", sets: 3, reps: 2, weight: 65, notes: "Zavorra, non testare il record." }
    ]
  },
  {
    id: "competition-prep-armwrestling-2026-06-session-5",
    date: "2026-06-23",
    title: "Gara prep 5 - Richiamo pre gara",
    week: 3,
    notes: "Richiamo 6-7 giorni prima della gara. Deve lasciare feeling forte, non fatica residua.",
    exercises: [
      { name: "Back Pressure Destro", sets: 3, reps: 3, weight: 30 },
      { name: "Back Pressure Sinistro", sets: 3, reps: 3, weight: 25 },
      { name: "Side Pressure Destro", sets: 3, reps: 3, weight: 30 },
      { name: "Side Pressure Sinistro", sets: 3, reps: 3, weight: 25 },
      { name: "Cupping Destro", sets: 3, reps: 6, weight: 25 },
      { name: "Cupping Sinistro", sets: 3, reps: 6, weight: 20 },
      { name: "Pronation Destro", sets: 3, reps: 5, weight: 20 },
      { name: "Pronation Sinistro", sets: 3, reps: 5, weight: 15 },
      { name: "Pull Up zavorrato", sets: 3, reps: 2, weight: 55, notes: "Zavorra, solo mantenimento." }
    ]
  },
  {
    id: "competition-prep-armwrestling-2026-06-session-6",
    date: "2026-06-26",
    title: "Gara prep 6 - Attivazione",
    week: 3,
    notes: "2-3 giorni prima della gara. Deve farti uscire piu fresco di quando sei entrato.",
    exercises: [
      { name: "Back Pressure Destro", sets: 2, reps: 3, weight: 20 },
      { name: "Back Pressure Sinistro", sets: 2, reps: 3, weight: 15 },
      { name: "Side Pressure Destro", sets: 2, reps: 3, weight: 20 },
      { name: "Side Pressure Sinistro", sets: 2, reps: 3, weight: 15 },
      { name: "Cupping Destro", sets: 2, reps: 5, weight: 15 },
      { name: "Cupping Sinistro", sets: 2, reps: 5, weight: 10 },
      { name: "Pronation Destro", sets: 2, reps: 5, weight: 15 },
      { name: "Pronation Sinistro", sets: 2, reps: 5, weight: 10 },
      { name: "Rising Belt Curl Destro", sets: 2, reps: 5, weight: 15 },
      { name: "Rising Belt Curl Sinistro", sets: 2, reps: 5, weight: 10 }
    ]
  }
];

function getActiveOrPrepPlan(snapshot: ArmTrackerData): Plan {
  return (
    snapshot.plans.find((plan) => plan.status === "active") ?? {
      id: programId,
      name: "Preparazione gara braccio di ferro",
      sourceFileName: "Codex - 6 allenamenti gara",
      importedAt,
      status: "active"
    }
  );
}

function buildSession(planId: string, session: PrepSession): PlanSession {
  return {
    id: session.id,
    planId,
    sessionDate: session.date,
    dayLabel: session.title,
    weekNumber: session.week,
    notes: session.notes,
    status: "planned",
    kind: "custom"
  };
}

function buildExercise(session: PrepSession, exercise: PrepExercise, index: number): PlanExercise {
  return {
    id: `${session.id}-exercise-${String(index + 1).padStart(2, "0")}`,
    sessionId: session.id,
    exerciseName: exercise.name,
    plannedSets: exercise.sets,
    plannedReps: exercise.reps,
    plannedWeight: exercise.weight,
    plannedNotes: exercise.notes ?? null,
    sortOrder: index
  };
}

export function applyCompetitionPrepProgram(snapshot: ArmTrackerData) {
  const missingSessions = prepSessions.filter(
    (session) => !snapshot.sessions.some((existingSession) => existingSession.id === session.id)
  );

  if (!missingSessions.length) {
    return snapshot;
  }

  const activePlan = getActiveOrPrepPlan(snapshot);
  const plans = snapshot.plans.some((plan) => plan.id === activePlan.id)
    ? snapshot.plans
    : [...snapshot.plans, activePlan];

  return {
    ...snapshot,
    plans,
    sessions: [
      ...snapshot.sessions,
      ...missingSessions.map((session) => buildSession(activePlan.id, session))
    ],
    exercises: [
      ...snapshot.exercises,
      ...missingSessions.flatMap((session) =>
        session.exercises.map((exercise, index) => buildExercise(session, exercise, index))
      )
    ]
  };
}

export const COMPETITION_PREP_SESSION_COUNT = prepSessions.length;
