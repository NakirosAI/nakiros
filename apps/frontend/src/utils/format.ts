/**
 * Number / duration formatters reused across the run views, the eval matrix,
 * and the conversation panels. Centralised so that "tokens", "compute
 * duration" and "long duration" each have one canonical rendering. The unit
 * symbols (`tok`, `ms`, `s`, `m`, `h`) are not localised — same in every
 * translation today.
 */

/** Optional behavior tweaks for {@link formatTokens} / {@link formatTokensSigned}. */
export interface FormatTokensOptions {
  /** Suffix appended after the number (e.g. `'tok'` → `'1.2k tok'`). Default: no unit. */
  unit?: string;
}

function formatTokensCore(n: number, unit: string | undefined): string {
  const suffix = unit ? ` ${unit}` : '';
  if (Math.abs(n) < 1000) return `${n}${suffix}`;
  return `${(n / 1000).toFixed(1)}k${suffix}`;
}

/** Compact token count: `123` (or `123 tok` with `unit: 'tok'`) and `1.2k` past 1000. */
export function formatTokens(n: number, { unit }: FormatTokensOptions = {}): string {
  return formatTokensCore(n, unit);
}

/** Same as {@link formatTokens} but always prefixes `+` for positive values — used for diff/delta display. */
export function formatTokensSigned(n: number, options: FormatTokensOptions = {}): string {
  return `${n >= 0 ? '+' : ''}${formatTokens(n, options)}`;
}

/**
 * Compact "ms / s / m" duration meant for sub-minute precision (turn time,
 * eval run time, audit duration): `420ms` / `12.3s` / `1m05s`.
 */
export function formatComputeDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  return `${min}m${sec.toString().padStart(2, '0')}s`;
}

/**
 * Coarse "s / m / h" duration for long-running spans (conversation length):
 * `30s` / `5m` / `2h30m`.
 */
export function formatLongDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h${rem}m`;
}
