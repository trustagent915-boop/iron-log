/**
 * Isometria di fine esercizio: dopo le ripetizioni principali si accumulano
 * secondi di tenuta allo stesso peso, fino a un totale di 10 secondi.
 *
 * L'obiettivo e' il TOTALE, non la singola tenuta. Su un carico pesante puoi
 * arrivarci con due tenute da 5s; su un gesto quasi massimale come la trazione
 * a un braccio ci arrivi con cinque tentativi da 2s, o dieci da 1s. Non conta
 * come li spezzi: conta che a fine esercizio i secondi sommati siano 10.
 *
 * Un obiettivo unico ha due vantaggi rispetto a una durata scalata per
 * esercizio: e' uno solo da ricordare, e non chiede mai una tenuta singola che
 * su un carico vicino al massimale sarebbe impossibile.
 */
export const isometryTotalTargetSeconds = 10;

export function getIsometryTargetSeconds(): number {
  return isometryTotalTargetSeconds;
}

export function hasReachedIsometryTarget(
  actualSeconds: number | null,
  targetSeconds: number = isometryTotalTargetSeconds
) {
  return actualSeconds !== null && Number.isFinite(actualSeconds) && actualSeconds >= targetSeconds;
}
