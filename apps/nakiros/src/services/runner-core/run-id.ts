let counter = 0;

/**
 * Generate a monotonically-increasing, human-readable run id of the form
 * `{prefix}_{timestamp36}_{counter36}`. Collision-free within a single daemon
 * process; used by every runner (eval / audit / fix / create / comparison).
 *
 * @param prefix - short domain tag prepended to the id (e.g. `eval`, `audit`, `fix`)
 */
export function generateRunId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${(++counter).toString(36)}`;
}
