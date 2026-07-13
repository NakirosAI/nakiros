/**
 * Compatibility entry point for the context detector smoke test.
 *
 * The canonical scenarios live beside the implementation in
 * `context-detector.test.ts`; keeping one source of truth prevents the inline
 * smoke test from drifting away from the production algorithm.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testPath = fileURLToPath(new URL('./context-detector.test.ts', import.meta.url));
const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', testPath],
  { stdio: 'inherit' },
);

process.exitCode = result.status ?? 1;
