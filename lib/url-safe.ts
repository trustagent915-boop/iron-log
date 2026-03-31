// Sanitizzazione parametri URL per evitare injection attacks

/**
 * Parse year parameter con validazione
 */
export function safeParseYear(param: unknown): 'all' | `${number}` | null {
  if (param === 'all') return 'all';

  const num = Number(param);
  if (!Number.isInteger(num) || num < 1900 || num > 2100) {
    return null;
  }

  return `${num}` as const;
}

/**
 * Parse exercise name con validazione against allowlist
 */
export function safeParseExercise(param: unknown, validOptions: string[]): string {
  if (!param) return '';

  const str = String(param).trim();
  if (!validOptions.includes(str)) {
    return '';
  }

  return str;
}

/**
 * Parse search query con sanitizzazione
 * - Max 100 chars
 * - Rimuove XSS characters
 */
export function safeParseQuery(param: unknown): string {
  const str = String(param ?? '').trim();

  // Max length
  if (str.length > 100) {
    return '';
  }

  // Remove dangerous characters
  return str
    .replace(/[<>"']/g, '') // XSS prevention
    .replace(/javascript:/gi, '') // JS protocol
    .replace(/on\w+=/gi, ''); // Event handlers
}

/**
 * Validate URL search params
 */
export function validateStatsFilters(params: URLSearchParams) {
  return {
    year: safeParseYear(params.get('year')),
    exercise: safeParseExercise(params.get('exercise'), []) // Pass available exercises as second param
  };
}

export function validateHistoryFilters(params: URLSearchParams) {
  return {
    query: safeParseQuery(params.get('q')),
    year: safeParseYear(params.get('year'))
  };
}
