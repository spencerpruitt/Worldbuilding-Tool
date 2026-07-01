/**
 * csvField — quote one CSV field per RFC 4180, only when it contains a comma,
 * quote, or newline. Plain names/numbers pass through unchanged so normal exports
 * stay byte-identical to the legacy output. Shared by every CSV-exporting surface.
 */
export function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
