/** Wraps a value in PowerShell single quotes with proper escaping. */
export function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
