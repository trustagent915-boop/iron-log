// Sanitizzazione parametri URL
export function safeParseYear(param: unknown): 'all' | `${number}` | null {
  if (param === 'all') return 'all';
  const num = Number(param);
  if (!Number.isInteger(num) || num < 1900 || num > 2100) return null;
  return `${num}` as const;
}

export function safeParseExercise(param: unknown, validOptions: string[]): string {
  if (!param) return '';
  const str = String(param).trim();
  return validOptions.includes(str) ? str : '';
}

export function safeParseQuery(param: unknown): string {
  const str = String(param ?? '').trim();
  if (str.length > 100) return '';
  return str.replace(/[<>"']/g, '').replace(/javascript:/ig, '').replace(/on\w+=/ig, '');
}
