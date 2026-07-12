/**
 * Quick smoke test for the loop detector.
 *
 * Run from repo root:
 *   node apps/nakiros/src/services/drift/test-loop-detector.mjs
 *
 * Exit code 0 = all checks pass. Non-zero = at least one failure.
 */

import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readdirSync } from 'fs';

// ── Inline re-implementation of the two modules (no TS compilation needed) ──

function normaliseCmd(cmd) {
  return cmd.trim().replace(/\s+/g, ' ');
}

function getSignatureKey(tool, input, hasError) {
  switch (tool) {
    case 'Edit':
    case 'Write':
    case 'MultiEdit': {
      const fp = input['file_path'];
      if (!fp) return null;
      return { signal: 'editSameFile', key: fp };
    }
    case 'Bash': {
      if (!hasError) return null;
      const cmd = input['command'];
      if (!cmd) return null;
      return { signal: 'bashSameCommandWithError', key: normaliseCmd(cmd) };
    }
    case 'Grep':
    case 'Glob': {
      const pattern = input['pattern'];
      if (!pattern) return null;
      const path = input['path'] ?? '';
      return { signal: 'grepSamePattern', key: `${pattern}::${path}` };
    }
    case 'Read': {
      const fp = input['file_path'];
      if (!fp) return null;
      const offset = input['offset'] ?? 0;
      return { signal: 'readSameFile', key: `${fp}#${offset}` };
    }
    default:
      return null;
  }
}

const SIGNALS = {
  editSameFile: { label: 'Edit', threshold: 4 },
  bashSameCommandWithError: { label: 'Bash (erreur)', threshold: 3 },
  grepSamePattern: { label: 'Grep/Glob', threshold: 5 },
  readSameFile: { label: 'Read', threshold: 5 },
};

function detectLoop(allTurns) {
  const WINDOW_SIZE = 12;
  const MIN_TURNS_REQUIRED = 8;
  if (allTurns.length < MIN_TURNS_REQUIRED) return null;

  const window = allTurns.slice(-WINDOW_SIZE);
  const counts = new Map();
  const editErrorFiles = new Set();
  let windowHasBashError = false;

  for (const turn of window) {
    const seenThisTurn = new Set();
    for (const tu of turn.toolUses) {
      if (tu.tool === 'Bash' && tu.hasError) windowHasBashError = true;
      const match = getSignatureKey(tu.tool, tu.input, tu.hasError);
      if (!match) continue;
      if (match.signal === 'editSameFile' && tu.hasError) editErrorFiles.add(match.key);
      const mapKey = `${match.signal}::${match.key}`;
      if (seenThisTurn.has(mapKey)) continue;
      seenThisTurn.add(mapKey);
      const existing = counts.get(mapKey);
      if (existing) {
        existing.count++;
      } else {
        counts.set(mapKey, { signal: match.signal, key: match.key, count: 1 });
      }
    }
  }

  const triggered = [];
  for (const { signal, key, count } of counts.values()) {
    const threshold = SIGNALS[signal].threshold;
    if (count < threshold) continue;
    if (signal === 'editSameFile' && !editErrorFiles.has(key) && !windowHasBashError) continue;
    triggered.push({ signature: `${SIGNALS[signal].label}:${key}`, count, threshold });
  }

  if (triggered.length === 0) return null;

  const hasMultiple = triggered.length > 1;
  const hasHighOvershoot = triggered.some(({ count, threshold }) => count > threshold * 1.5);
  const severity = hasMultiple || hasHighOvershoot ? 'high' : 'medium';

  const worst = triggered.reduce((a, b) => (a.count >= b.count ? a : b));

  return {
    type: 'loop',
    severity,
    message: `Nakiros a détecté que tu sembles tourner en rond : ${worst.count} occurrences de "${worst.signature}" sur ${WINDOW_SIZE} tours.`,
    suggestion: "Essaie /clear et reformule l'objectif, ou ouvre une nouvelle session.",
    evidence: { window: WINDOW_SIZE, totalTurns: allTurns.length, triggered },
  };
}

// ── Test helpers ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

// ── Build synthetic turns ─────────────────────────────────────────────────────

function makeTurns(toolUseList) {
  return toolUseList.map((toolUses, i) => ({
    index: i + 1,
    timestamp: new Date().toISOString(),
    toolUses,
  }));
}

function editTool(filePath, hasError = false) {
  return { tool: 'Edit', input: { file_path: filePath }, hasError, resultContent: hasError ? 'String not found' : '' };
}

function bashTool(command, hasError = false) {
  return { tool: 'Bash', input: { command }, hasError, resultContent: hasError ? 'Exit code 1' : 'ok' };
}

function readTool(filePath) {
  return { tool: 'Read', input: { file_path: filePath }, hasError: false, resultContent: '' };
}

function grepTool(pattern) {
  return { tool: 'Grep', input: { pattern }, hasError: false, resultContent: '' };
}

// ── Test 1: Fewer than MIN_TURNS_REQUIRED → always null ──────────────────────

console.log('\n[Test 1] Fewer than 8 turns → null');
{
  const turns = makeTurns(Array(7).fill([editTool('foo.ts')]));
  const result = detectLoop(turns);
  assert('returns null when < 8 turns', result === null);
}

// ── Test 2: 5 edit turns on same file + failure signal → loop (5 ≥ 4) ──────

console.log('\n[Test 2] 5 edit turns on same file with a bash error → loop detected');
{
  const list = [
    [editTool('apps/foo/bar.ts')],
    [editTool('apps/other/baz.ts')], // noise
    [editTool('apps/foo/bar.ts')],
    [bashTool('pnpm build', true)],  // failure signal qualifying the edit loop
    [editTool('apps/foo/bar.ts')],
    [readTool('apps/foo/bar.ts')],   // noise (Read, threshold 5 not reached)
    [editTool('apps/foo/bar.ts')],
    [bashTool('git status')],        // noise
    [editTool('apps/foo/bar.ts')],   // 5th edit turn on same file
    [readTool('README.md')],
    [bashTool('pnpm lint')],
    [bashTool('ls')],
  ];
  const turns = makeTurns(list);
  const result = detectLoop(turns);
  assert('result is not null', result !== null);
  assert('type is loop', result?.type === 'loop');
  assert('triggered includes edit:apps/foo/bar.ts', result?.evidence?.triggered?.some(
    t => t.signature.includes('bar.ts') && t.count === 5 && t.threshold === 4,
  ));
  console.log('   severity:', result?.severity, '| message:', result?.message);
}

// ── Test 2b: FP regression — successful distinct edits, no failure → null ───

console.log('\n[Test 2b] 5 successful edit turns, no failure in window → null');
{
  const list = [
    [editTool('apps/foo/bar.ts')],
    [editTool('apps/foo/bar.ts')],
    [bashTool('pnpm build')],        // build passes
    [editTool('apps/foo/bar.ts')],
    [editTool('apps/foo/bar.ts')],
    [editTool('apps/foo/bar.ts')],
    [bashTool('pnpm test')],         // tests pass
    ...Array.from({ length: 5 }, (_, i) => [readTool(`docs/page-${i}.md`)]),
  ];
  const turns = makeTurns(list);
  const result = detectLoop(turns);
  assert('null for iterative fix without failures', result === null, JSON.stringify(result?.evidence));
}

// ── Test 2c: FP regression — many edits in ONE turn count once ──────────────

console.log('\n[Test 2c] 4 edits of same file inside one turn + error → count 1 → null');
{
  const list = [
    [editTool('apps/foo/bar.ts'), editTool('apps/foo/bar.ts'), editTool('apps/foo/bar.ts'), editTool('apps/foo/bar.ts')],
    [bashTool('pnpm build', true)],
    ...Array(10).fill([bashTool('echo ok')]),
  ];
  const turns = makeTurns(list);
  const result = detectLoop(turns);
  assert('per-turn dedup keeps count at 1', result === null, JSON.stringify(result?.evidence));
}

// ── Test 2d: FP regression — chunked reads (different offsets) → null ───────

console.log('\n[Test 2d] 6 chunked reads of same file (offsets) → null');
{
  const chunked = Array.from({ length: 6 }, (_, i) => [
    { tool: 'Read', input: { file_path: 'big.ts', offset: i * 500 }, hasError: false, resultContent: '' },
  ]);
  const list = [...chunked, ...Array(6).fill([bashTool('echo ok')])];
  const turns = makeTurns(list);
  const result = detectLoop(turns);
  assert('chunked reads are not a loop', result === null, JSON.stringify(result?.evidence));
}

// ── Test 3: Only 3 edits → no trigger (threshold is 4) ──────────────────────

console.log('\n[Test 3] Only 3 edits on same file → null');
{
  const list = [
    [editTool('apps/foo/bar.ts')],
    [editTool('apps/foo/bar.ts')],
    [editTool('apps/foo/bar.ts')],
    ...Array(9).fill([bashTool('echo ok')]),
  ];
  const turns = makeTurns(list);
  const result = detectLoop(turns);
  // Only 3 in window, threshold is 4 → should be null
  assert('null when edits < threshold', result === null, JSON.stringify(result?.evidence));
}

// ── Test 4: 4 Bash errors on same command → loop (medium) ───────────────────

console.log('\n[Test 4] 4 Bash errors on same command → loop detected');
{
  const cmd = 'npm run build';
  const list = [
    [bashTool(cmd, true)],
    [editTool('package.json')],
    [bashTool(cmd, true)],
    [editTool('tsconfig.json')],
    [bashTool(cmd, true)],
    [readTool('package.json')],
    [bashTool(cmd, true)], // 4th error on same cmd → exceeds threshold 3
    [bashTool('ls')],
    [readTool('README.md')],
    [editTool('src/index.ts')],
    [bashTool('git status')],
    [readTool('src/other.ts')],
  ];
  const turns = makeTurns(list);
  const result = detectLoop(turns);
  assert('result is not null', result !== null);
  assert('type is loop', result?.type === 'loop');
  const trig = result?.evidence?.triggered?.find(t => t.signature.includes('npm run build'));
  assert('bash cmd signature found with count 4', trig?.count === 4 && trig?.threshold === 3);
}

// ── Test 5: Bash with no error → NOT counted ────────────────────────────────

console.log('\n[Test 5] Bash same command without error → null');
{
  const cmd = 'git status';
  const list = Array(12).fill([bashTool(cmd, false)]);
  const turns = makeTurns(list);
  const result = detectLoop(turns);
  assert('null when bash has no error', result === null);
}

// ── Test 6: 12 failing edit turns on same file → high severity (>50% overshoot) ──

console.log('\n[Test 6] 12 failing edit turns on same file → high severity');
{
  const list = Array(12).fill([editTool('apps/foo/bar.ts', true)]);
  const turns = makeTurns(list);
  const result = detectLoop(turns);
  assert('result is not null', result !== null);
  assert('severity is high', result?.severity === 'high', `got: ${result?.severity}`);
}

// ── Test 7: Multiple signals triggered → high severity ────────────────────

console.log('\n[Test 7] Multiple signals triggered → high severity');
{
  const list = [
    [editTool('apps/foo/bar.ts'), bashTool('npm test', true)],
    [editTool('apps/foo/bar.ts'), bashTool('npm test', true)],
    [editTool('apps/foo/bar.ts'), bashTool('npm test', true)],
    [editTool('apps/foo/bar.ts'), bashTool('npm test', true)], // 4 edits + 4 bash errors
    [readTool('README.md')],
    [readTool('README.md')],
    [readTool('README.md')],
    [readTool('README.md')],
    [readTool('README.md')], // 5 reads — hits threshold
    [bashTool('ls')],
    [bashTool('pwd')],
    [bashTool('echo hi')],
  ];
  const turns = makeTurns(list);
  const result = detectLoop(turns);
  assert('result is not null', result !== null);
  assert('severity is high (multiple signals)', result?.severity === 'high', `got: ${result?.severity}`);
  assert('multiple triggered signatures', (result?.evidence?.triggered?.length ?? 0) >= 2);
}

// ── Test 8: Real session from this repo ──────────────────────────────────────

console.log('\n[Test 8] Real session from this repo');
{
  const projectDir = join(homedir(), '.claude', 'projects', '-Users-thomasailleaume-Perso-timetrackerAgent');
  if (!existsSync(projectDir)) {
    console.log('  ~ skipped (project dir not found)');
  } else {
    // Pick the largest JSONL (most likely to be a real session)
    const { statSync, readFileSync } = await import('fs');
    const files = readdirSync(projectDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ f, size: statSync(join(projectDir, f)).size }))
      .sort((a, b) => b.size - a.size);

    if (files.length === 0) {
      console.log('  ~ skipped (no JSONL files)');
    } else {
      const { f } = files[0];
      const sessionId = f.replace('.jsonl', '');
      console.log(`  Using session: ${sessionId} (${(files[0].size / 1024).toFixed(0)} KB)`);

      // Parse using same logic as session-loader
      const raw = readFileSync(join(projectDir, f), 'utf8');
      const lines = raw.split('\n').filter(Boolean);

      // Build tool_results index
      const toolResults = new Map();
      for (const l of lines) {
        let e; try { e = JSON.parse(l); } catch { continue; }
        if (e.type !== 'user' || e.isMeta) continue;
        if (!Array.isArray(e.message?.content)) continue;
        for (const b of e.message.content) {
          if (b.type !== 'tool_result' || !b.tool_use_id) continue;
          toolResults.set(b.tool_use_id, { isError: b.is_error === true, content: typeof b.content === 'string' ? b.content : '' });
        }
      }

      // Build assistant turns
      const turns = [];
      let idx = 0;
      for (const l of lines) {
        let e; try { e = JSON.parse(l); } catch { continue; }
        if (e.type !== 'assistant' || e.isMeta) continue;
        idx++;
        const toolUses = [];
        if (Array.isArray(e.message?.content)) {
          for (const b of e.message.content) {
            if (b.type !== 'tool_use' || !b.name) continue;
            const res = b.id ? toolResults.get(b.id) : undefined;
            toolUses.push({ tool: b.name, input: b.input ?? {}, hasError: res?.isError ?? false, resultContent: res?.content ?? '' });
          }
        }
        turns.push({ index: idx, timestamp: e.timestamp ?? '', toolUses });
      }

      console.log(`  Total assistant turns: ${turns.length}`);
      const result = detectLoop(turns);

      if (result === null) {
        console.log('  ~ no loop detected (expected for a healthy session)');
        assert('returns null for healthy session', true);
      } else {
        console.log(`  ! loop detected: ${result.message}`);
        console.log('  evidence:', JSON.stringify(result.evidence, null, 2));
        // This might legitimately happen on some real sessions — not a failure
        assert('drift report is well-formed', result.type === 'loop' && typeof result.message === 'string' && result.evidence?.triggered?.length > 0);
      }
    }
  }
}

// ── Summary ────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
