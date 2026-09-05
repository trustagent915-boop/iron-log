/**
 * Motore di progressione: decide se il prossimo allenamento va fatto con piu
 * peso, con lo stesso, o con meno, confrontando la prescrizione con quello che
 * e' stato davvero eseguito.
 *
 * Il modello e' la doppia progressione gia' usata dal blocco: si tiene il peso
 * finche' non si chiudono tutte le ripetizioni previste, poi si sale di un
 * gradino e le ripetizioni ripartono piu' basse.
 *
 * Gli incrementi sono calibrati sui salti che il programma usa gia':
 * +10 kg sui bilancieri grandi, +5 kg su tutto il resto.
 */

export type ProgressionAction = "aumenta" | "mantieni" | "riduci" | "dati-mancanti";

export interface PerformanceSample {
  date: string;
  weight: number | null;
  reps: number | null;
  sets: number | null;
  seconds: number | null;
}

export interface ProgressionInput {
  exerciseName: string;
  plannedWeight: number | null;
  plannedReps: number | null;
  /** Dalla piu' recente alla piu' vecchia. */
  /** Obiettivo di tenuta, per gli esercizi che progrediscono sui secondi. */
  plannedHoldSeconds?: number | null;
  history: PerformanceSample[];
}

export interface ProgressionVerdict {
  action: ProgressionAction;
  suggestedWeight: number | null;
  suggestedReps: number | null;
  suggestedSeconds?: number | null;
  reason: string;
}

const bigBarbellPatterns = ["squat", "stacco", "panca", "rematore", "military press"];
/** Manubri o attrezzi a carico fisso: si progredisce solo sulle ripetizioni. */
const fixedLoadPatterns = ["hammer curl"];

function normalize(name: string) {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function includesAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}

export function getProgressionStepKg(exerciseName: string): number {
  const normalized = normalize(exerciseName);

  if (includesAny(normalized, fixedLoadPatterns)) {
    return 0;
  }

  return includesAny(normalized, bigBarbellPatterns) ? 10 : 5;
}

/**
 * Una serie "chiusa" e' quella in cui hai raggiunto le ripetizioni previste
 * con almeno il peso previsto. E' la condizione per salire.
 */
export function hasClearedTarget(sample: PerformanceSample, plannedWeight: number | null, plannedReps: number | null) {
  if (plannedReps !== null && (sample.reps ?? 0) < plannedReps) {
    return false;
  }

  if (plannedWeight !== null && (sample.weight ?? 0) < plannedWeight) {
    return false;
  }

  return true;
}

export function getProgressionVerdict(input: ProgressionInput): ProgressionVerdict {
  const { exerciseName, plannedWeight, plannedReps, plannedHoldSeconds, history } = input;
  const step = getProgressionStepKg(exerciseName);
  const last = history[0];

  if (!last || (last.reps === null && last.weight === null)) {
    return {
      action: "dati-mancanti",
      suggestedWeight: plannedWeight,
      suggestedReps: plannedReps,
      reason: "Nessuna esecuzione registrata: tieni la prescrizione e registra i dati."
    };
  }

  // Nessun carico prescritto = non c'e' niente da aumentare in chili. Vale per
  // le tenute e per gli esercizi a corpo libero o con elastico: il peso che
  // Jack registra li e il suo peso corporeo, non un carico. Trattarlo come tale
  // proponeva salti senza senso tipo "sali a 98 kg" sulla iso a un braccio.
  if (plannedWeight === null) {
    const target = plannedHoldSeconds ?? (plannedReps === null ? 10 : null);

    if (target !== null) {
      if (last.seconds === null) {
        return {
          action: "dati-mancanti",
          suggestedWeight: null,
          suggestedReps: plannedReps,
          suggestedSeconds: target,
          reason: `Tenuta non registrata: segna i secondi, obiettivo ${target}s.`
        };
      }

      if (last.seconds >= target) {
        return {
          action: "aumenta",
          suggestedWeight: null,
          suggestedReps: plannedReps,
          suggestedSeconds: target + 1,
          reason: `Hai tenuto ${last.seconds}s con obiettivo ${target}s: sali a ${target + 1}s.`
        };
      }

      return {
        action: "mantieni",
        suggestedWeight: null,
        suggestedReps: plannedReps,
        suggestedSeconds: target,
        reason: `Tenuta a ${last.seconds}s, obiettivo ${target}s: resta qui finche non lo chiudi.`
      };
    }

    // Solo ripetizioni, nessun carico: si progredisce a ripetizioni.
    if (plannedReps !== null && (last.reps ?? 0) >= plannedReps) {
      return {
        action: "aumenta",
        suggestedWeight: null,
        suggestedReps: plannedReps + 1,
        reason: `Hai chiuso ${last.reps} reps senza carico prescritto: sali di una ripetizione.`
      };
    }

    return {
      action: "mantieni",
      suggestedWeight: null,
      suggestedReps: plannedReps,
      reason: "Nessun carico prescritto: ripeti la prescrizione."
    };
  }

  if (hasClearedTarget(last, plannedWeight, plannedReps)) {
    if (step === 0) {
      return {
        action: "aumenta",
        suggestedWeight: plannedWeight,
        suggestedReps: plannedReps !== null ? plannedReps + 1 : null,
        reason: `Carico fisso: hai chiuso ${last.reps} reps, sali di una ripetizione.`
      };
    }

    const base = Math.max(plannedWeight ?? 0, last.weight ?? 0);

    return {
      action: "aumenta",
      suggestedWeight: base + step,
      suggestedReps: plannedReps,
      reason: `Hai chiuso ${last.reps} reps a ${last.weight} kg: te ne meriti ${step} in piu.`
    };
  }

  const mancanti = plannedReps !== null ? plannedReps - (last.reps ?? 0) : 0;

  // Stallo: due sessioni di fila allo stesso peso senza chiudere il target.
  const previous = history[1];
  const inStallo =
    previous !== undefined &&
    previous.weight === last.weight &&
    !hasClearedTarget(previous, plannedWeight, plannedReps) &&
    (previous.reps ?? 0) >= (last.reps ?? 0);

  if (inStallo && step > 0) {
    return {
      action: "riduci",
      suggestedWeight: Math.max(0, (last.weight ?? plannedWeight ?? 0) - step),
      suggestedReps: plannedReps,
      reason: `Due sedute ferme a ${last.weight} kg senza chiudere: scarica di ${step} kg e risali.`
    };
  }

  if (mancanti >= 2 && step > 0) {
    return {
      action: "riduci",
      suggestedWeight: Math.max(0, (last.weight ?? plannedWeight ?? 0) - step),
      suggestedReps: plannedReps,
      reason: `Ti sono mancate ${mancanti} reps: il carico e troppo alto adesso.`
    };
  }

  return {
    action: "mantieni",
    suggestedWeight: plannedWeight,
    suggestedReps: plannedReps,
    reason:
      mancanti > 0
        ? `Ti e mancata ${mancanti} rep: stesso peso finche non chiudi ${plannedReps}.`
        : "Ripeti il carico previsto."
  };
}
