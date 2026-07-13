/** True for every Codex thread_source representation used by subagent rollouts. */
export function isCodexSubagentThreadSource(value: unknown): boolean {
  if (typeof value === 'string') return value.toLowerCase() === 'subagent';
  if (!value || typeof value !== 'object') return false;
  const source = value as Record<string, unknown>;
  if ('subagent' in source) return true;
  return [source['type'], source['kind'], source['source']].some(
    (candidate) => typeof candidate === 'string' && candidate.toLowerCase() === 'subagent',
  );
}
