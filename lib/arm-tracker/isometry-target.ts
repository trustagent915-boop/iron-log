/**
 * Obiettivo di tenuta isometrica da fare a fine esercizio, allo stesso peso
 * usato per le ripetizioni.
 *
 * La durata NON puo' essere fissa: le ripetizioni previste sono un proxy
 * dell'intensita' relativa. A 3 reps sei vicino al massimale e dopo la serie
 * reggi pochi secondi; a 8-10 reps il carico e' piu' basso e la tenuta puo'
 * durare molto di piu'. Un obiettivo unico da 10s sarebbe irrealistico sul
 * pesante e troppo facile sul leggero — in entrambi i casi non allenerebbe
 * la forza.
 *
 * Regola: circa 1,5 secondi per ogni ripetizione prevista, con un tetto a 12s
 * (oltre si scivola nel lavoro di resistenza, che non e' l'obiettivo) e un
 * minimo di 5s (sotto non c'e' stimolo isometrico utile).
 *
 * Gli esercizi che sono gia' isometrie di loro (nessuna ripetizione prevista)
 * puntano a 10s, la soglia con cui il record diventa valido sulla dashboard.
 */
export const isometryTargetFloorSeconds = 5;
export const isometryTargetCapSeconds = 12;
export const isometryTargetForPureHoldSeconds = 10;

/**
 * Legge una tenuta prescritta dalle note del programma, es.
 * "5 tentativi da 2 secondi" -> 2, "4 tentativi da 2-3 secondi" -> 3.
 * Su un intervallo prende il limite alto, che e il vero obiettivo.
 */
export function parsePrescribedHoldSeconds(plannedNotes: string | null | undefined): number | null {
  if (!plannedNotes) {
    return null;
  }

  const match = plannedNotes
    .toLowerCase()
    .match(/(\d+(?:[.,]\d+)?)\s*(?:-\s*(\d+(?:[.,]\d+)?)\s*)?second/);

  if (!match) {
    return null;
  }

  const raw = match[2] ?? match[1];
  const parsed = Number(raw.replace(",", "."));

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getIsometryTargetSeconds(
  plannedReps: number | null | undefined,
  plannedNotes?: string | null
): number {
  // La prescrizione del programma vince su qualsiasi stima: una tenuta a un
  // braccio al peso corporeo e uno sforzo quasi massimale, dove il programma
  // chiede 1-3 secondi. Imporre il default generico sarebbe irrealistico.
  const prescritto = parsePrescribedHoldSeconds(plannedNotes);
  if (prescritto !== null) {
    return prescritto;
  }

  if (
    plannedReps === null ||
    plannedReps === undefined ||
    !Number.isFinite(plannedReps) ||
    plannedReps <= 0
  ) {
    return isometryTargetForPureHoldSeconds;
  }

  const scaled = Math.round(plannedReps * 1.5);

  return Math.min(isometryTargetCapSeconds, Math.max(isometryTargetFloorSeconds, scaled));
}

export function hasReachedIsometryTarget(actualSeconds: number | null, targetSeconds: number) {
  return actualSeconds !== null && Number.isFinite(actualSeconds) && actualSeconds >= targetSeconds;
}
