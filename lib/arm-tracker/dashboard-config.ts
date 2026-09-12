/**
 * Dashboard personale e configurabile.
 *
 * Logica: programma attivo -> esercizi del programma -> Dashboard.
 * Gli esercizi del programma entrano ed escono da soli quando cambia il
 * programma. In piu l utente puo:
 * - fissare esercizi PRINCIPALI, che restano sempre visibili;
 * - NASCONDERE esercizi dalla Dashboard senza toccare lo storico;
 * - ordinare i principali.
 *
 * Solo funzioni pure, senza import di valore: testabili col runner node.
 */
import type { DashboardConfig } from "./types";

function keyOf(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const name = value.replace(/\s+/g, " ").trim();
    const key = keyOf(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

function without(names: string[], name: string) {
  const key = keyOf(name);
  return names.filter((existing) => keyOf(existing) !== key);
}

function includesName(names: readonly string[], name: string) {
  const key = keyOf(name);
  return names.some((existing) => keyOf(existing) === key);
}

/** Config mai toccata dall utente: nel merge perde contro qualsiasi modifica reale. */
export const dashboardConfigEpoch = "1970-01-01T00:00:00.000Z";

export function createEmptyDashboardConfig(): DashboardConfig {
  return { pinned: [], hidden: [], order: [], updatedAt: dashboardConfigEpoch };
}

export function hasDashboardConfigContent(config: DashboardConfig) {
  return config.pinned.length + config.hidden.length + config.order.length > 0;
}

/** Marca la config come modificata adesso. */
export function touchDashboardConfig(config: DashboardConfig, at = new Date().toISOString()): DashboardConfig {
  return { ...config, updatedAt: at };
}

/**
 * Tra due config vince la piu recente; a parita di data vince quella con
 * contenuto, cosi una config vuota di default non cancella mai una reale.
 */
export function pickNewerDashboardConfig(current: DashboardConfig, incoming: DashboardConfig): DashboardConfig {
  if (current.updatedAt !== incoming.updatedAt) {
    return current.updatedAt > incoming.updatedAt ? current : incoming;
  }
  return hasDashboardConfigContent(incoming) || !hasDashboardConfigContent(current) ? incoming : current;
}

export function normalizeDashboardConfig(raw: unknown): DashboardConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return createEmptyDashboardConfig();
  }
  const source = raw as Partial<Record<keyof DashboardConfig, unknown>>;
  const pinned = uniqueNames(source.pinned);
  const hidden = uniqueNames(source.hidden).filter((name) => !includesName(pinned, name));
  const order = uniqueNames(source.order);
  const updatedAt =
    typeof source.updatedAt === "string" && source.updatedAt ? source.updatedAt : dashboardConfigEpoch;
  return { pinned, hidden, order, updatedAt };
}

/** Marcatori di seduta (es. la sessione di braccio di ferro): non sono esercizi da livello. */
export function isSessionMarkerExerciseName(name: string) {
  return /allenamento\s+braccio\s+di\s+ferro/i.test(name);
}

/**
 * Migrazione dalla vecchia watchlist: cio che era in watchlist ma NON e nel
 * programma attivo diventa "principale" (era li apposta, non per il blocco
 * corrente). Il resto entra comunque dal programma.
 */
export function migrateWatchlistToDashboardConfig(
  watchlist: readonly string[],
  programExerciseNames: readonly string[]
): DashboardConfig {
  const pinned = uniqueNames([...watchlist]).filter((name) => !includesName(programExerciseNames, name));
  return { pinned, hidden: [], order: [...pinned], updatedAt: dashboardConfigEpoch };
}

export function pinExercise(config: DashboardConfig, name: string): DashboardConfig {
  const trimmed = name.replace(/\s+/g, " ").trim();
  if (!trimmed || includesName(config.pinned, trimmed)) return config;
  return {
    ...config,
    pinned: [...config.pinned, trimmed],
    hidden: without(config.hidden, trimmed),
    order: includesName(config.order, trimmed) ? config.order : [...config.order, trimmed]
  };
}

export function unpinExercise(config: DashboardConfig, name: string): DashboardConfig {
  return { ...config, pinned: without(config.pinned, name) };
}

export function hideExercise(config: DashboardConfig, name: string): DashboardConfig {
  const trimmed = name.replace(/\s+/g, " ").trim();
  if (!trimmed) return config;
  return {
    ...config,
    pinned: without(config.pinned, trimmed),
    hidden: includesName(config.hidden, trimmed) ? config.hidden : [...config.hidden, trimmed]
  };
}

export function unhideExercise(config: DashboardConfig, name: string): DashboardConfig {
  return { ...config, hidden: without(config.hidden, name) };
}

/** Sposta un principale su (-1) o giu (+1) nell ordine. */
export function moveExercise(config: DashboardConfig, name: string, direction: -1 | 1): DashboardConfig {
  const order = orderNames(config, config.pinned);
  const index = order.findIndex((existing) => keyOf(existing) === keyOf(name));
  const target = index + direction;
  if (index < 0 || target < 0 || target >= order.length) return { ...config, order };
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return { ...config, order: next };
}

/** Applica l ordine salvato a una lista di nomi; i nomi senza posizione vanno in coda. */
export function orderNames(config: DashboardConfig, names: readonly string[]): string[] {
  const ordered = config.order.filter((name) => includesName(names, name));
  const rest = names.filter((name) => !includesName(ordered, name));
  return [...ordered, ...rest];
}

export interface DashboardSections {
  /** Prestazioni da tenere sempre sotto controllo, nell ordine scelto. */
  principali: string[];
  /** Esercizi del programma attivo non fissati e non nascosti. */
  programma: string[];
  /** Nascosti dalla Dashboard: lo storico resta intatto. */
  nascosti: string[];
}

export function resolveDashboardSections(
  config: DashboardConfig,
  programExerciseNames: readonly string[]
): DashboardSections {
  const program = uniqueNames([...programExerciseNames]).filter((name) => !isSessionMarkerExerciseName(name));
  const principali = orderNames(config, config.pinned);
  const programma = program.filter(
    (name) => !includesName(config.pinned, name) && !includesName(config.hidden, name)
  );
  return { principali, programma, nascosti: [...config.hidden] };
}
