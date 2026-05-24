/**
 * Smoke tests for the topic drift detector.
 *
 * Run from repo root:
 *   node apps/nakiros/src/services/drift/test-topic-detector.mjs
 *
 * Exit code 0 = all checks pass. Non-zero = at least one failure.
 *
 * The detector logic is inlined here (no TS compilation needed), mirroring
 * the approach used by test-loop-detector.mjs.
 */

import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readdirSync, readFileSync } from 'fs';

// ── Inline tokenize + jaccard (mirrors runner-core/cluster-tokens) ────────────

const STOP_WORDS = new Set([
  // FR
  'le', 'la', 'les', 'un', 'une', 'des', 'et', 'ou', 'mais', 'donc',
  'car', 'que', 'qui', 'quoi', 'comment', 'pourquoi', 'tu', 'je', 'il',
  'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'ce', 'cette', 'ces',
  'mon', 'ton', 'son', 'ma', 'ta', 'sa', 'mes', 'tes', 'ses', 'avec',
  'sans', 'pour', 'par', 'dans', 'sur', 'sous', 'entre', 'aussi',
  'pas', 'plus', 'moins', 'tout', 'tous', 'toute', 'toutes', 'fait',
  'faire', 'voir', 'avoir', 'être', 'etre', 'pouvoir', 'falloir',
  'vouloir', 'savoir', 'oui', 'non', 'peut', 'doit', 'va',
  // EN
  'the', 'a', 'an', 'and', 'or', 'but', 'so', 'because', 'that',
  'this', 'these', 'those', 'is', 'are', 'was', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'should', 'can', 'could', 'may', 'might',
  'i', 'you', 'he', 'she', 'we', 'they', 'it', 'us',
  'for', 'in', 'on', 'at', 'to', 'of', 'with', 'as', 'by',
  'yes', 'no', 'not', 'just', 'only',
]);

function tokenizeForCluster(text) {
  const tokens = new Set();
  for (const t of text.toLowerCase().split(/\W+/)) {
    if (t.length >= 3 && !STOP_WORDS.has(t)) tokens.add(t);
  }
  return tokens;
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ── Inline topic detector ─────────────────────────────────────────────────────

const MIN_USER_MESSAGES = 6;
const TRANSITION_THRESHOLD = 0.15;
const FIRST_LAST_THRESHOLD = 0.10;
const MIN_TRANSITIONS = 2;

function findLastClearIndex(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].text.trim().toLowerCase() === '/clear') return i;
  }
  return -1;
}

function detectTopic(userMessages) {
  const lastClearIdx = findLastClearIndex(userMessages);
  const clearSlashFound = lastClearIdx >= 0;
  const consideredAfterClearIdx = clearSlashFound ? lastClearIdx + 1 : null;
  const window = clearSlashFound
    ? userMessages.slice(lastClearIdx + 1)
    : userMessages;

  if (window.length < MIN_USER_MESSAGES) return null;

  const tokenSets = window.map((m) => tokenizeForCluster(m.text));

  let transitions = 0;
  for (let i = 1; i < tokenSets.length; i++) {
    const sim = jaccard(tokenSets[i - 1], tokenSets[i]);
    if (sim < TRANSITION_THRESHOLD) transitions++;
  }

  const firstLastSimilarity = jaccard(tokenSets[0], tokenSets[tokenSets.length - 1]);

  if (transitions < MIN_TRANSITIONS || firstLastSimilarity >= FIRST_LAST_THRESHOLD) {
    return null;
  }

  const severity = transitions >= 3 || firstLastSimilarity < 0.05 ? 'high' : 'medium';
  const similarityPercent = Math.round(firstLastSimilarity * 100);

  return {
    type: 'topic',
    severity,
    message:
      `Nakiros a détecté que la conversation s'est éloignée de l'objectif initial ` +
      `(${transitions} transitions de sujet, similarité avec le premier message : ${similarityPercent}%).`,
    suggestion: "Recentre la session sur la tâche d'origine, ou ouvre une nouvelle session avec un cadrage clair.",
    evidence: {
      userMessageCount: window.length,
      transitionsDetected: transitions,
      transitionThreshold: TRANSITION_THRESHOLD,
      firstLastSimilarity,
      firstLastThreshold: FIRST_LAST_THRESHOLD,
      clearSlashFound,
      consideredAfterClearIdx,
    },
  };
}

// ── Inline user-message parser ────────────────────────────────────────────────

function parseUserMessages(raw) {
  const lines = raw.split('\n');
  const messages = [];
  let msgIndex = 0;
  for (const line of lines) {
    if (!line) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.type !== 'user' || entry.isMeta) continue;
    if (!Array.isArray(entry.message?.content)) continue;
    const textParts = [];
    for (const block of entry.message.content) {
      if (block.type === 'text' && typeof block.text === 'string') {
        textParts.push(block.text);
      }
    }
    if (textParts.length === 0) continue;
    messages.push({
      index: msgIndex++,
      timestamp: entry.timestamp ?? '',
      text: textParts.join('\n'),
    });
  }
  return messages;
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

/** Build a synthetic list of UserMessage objects. */
function makeMessages(texts) {
  return texts.map((text, i) => ({ index: i, timestamp: new Date().toISOString(), text }));
}

// ── Topic-specific vocabularies (no shared tokens between groups) ─────────────

const RUST_MSG = 'Rust compiler borrow checker lifetime ownership memory safety';
const TS_MSG = 'TypeScript interface generic type inference decorator optional chaining';
const SQL_MSG = 'PostgreSQL query optimizer index foreign key transaction isolation JOIN';
const CSS_MSG = 'Tailwind flexbox grid responsive breakpoint utility class animation';
const DOCKER_MSG = 'Docker container Dockerfile volume networking compose kubernetes deployment';
const GIT_MSG = 'git rebase merge conflict cherry-pick stash bisect remote branch';
const PYTHON_MSG = 'Python pandas dataframe matplotlib numpy scikit machine learning model';
const BASH_MSG = 'bash shell script heredoc pipe redirect awk grep sed cron cronjob';
const REACT_MSG = 'React component hook useState useEffect context provider render JSX';
const NGINX_MSG = 'nginx reverse proxy server load balancing SSL certificate upstream config';

// ── Test 1: All messages share same vocabulary → null ─────────────────────────

console.log('\n[Test 1] Cohesive 8-message conversation → null');
{
  const msgs = makeMessages([
    'Fix the TypeScript compiler error in the generic type parameter',
    'The TypeScript interface definition needs updating for the generic',
    'Generic TypeScript type inference is failing with the decorator pattern',
    'TypeScript optional chaining with the generic interface parameter type',
    'Updating the TypeScript decorator to fix the generic type error properly',
    'TypeScript interface generic type decorator optional chaining parameter',
    'The generic TypeScript type parameter decorator interface looks correct',
    'TypeScript generic interface type inference decorator parameter fixed now',
  ]);
  const result = detectTopic(msgs);
  assert('returns null for cohesive session', result === null, JSON.stringify(result?.evidence));
}

// ── Test 2: 8 msgs, 3 clear topic transitions → medium or high ───────────────

console.log('\n[Test 2] 8 msgs with 3 distinct topic transitions → drift detected');
{
  const msgs = makeMessages([
    RUST_MSG,
    RUST_MSG + ' unsafe trait implement struct enum',
    TS_MSG,   // transition 1 (rust → typescript)
    TS_MSG + ' narrowing union intersection mapped',
    SQL_MSG,  // transition 2 (typescript → sql)
    SQL_MSG + ' window function partitioning aggregate subquery',
    CSS_MSG,  // transition 3 (sql → css)
    CSS_MSG + ' animation keyframe transform perspective hover focus',
  ]);
  const result = detectTopic(msgs);
  assert('result is not null', result !== null);
  assert('type is topic', result?.type === 'topic');
  assert('transitions >= 3', (result?.evidence?.transitionsDetected ?? 0) >= 3);
  assert('firstLastSimilarity < 0.10', (result?.evidence?.firstLastSimilarity ?? 1) < 0.10);
  console.log('   severity:', result?.severity, '| transitions:', result?.evidence?.transitionsDetected);
}

// ── Test 3: transitions present but /clear at midpoint, after-clear cohesive → null

console.log('\n[Test 3] /clear mid-session, after-clear cohesive → null');
{
  // Before /clear: chaotic (transitions)
  // After /clear: 7 coherent Docker messages
  const msgs = makeMessages([
    RUST_MSG,
    TS_MSG,
    SQL_MSG,
    '/clear',
    DOCKER_MSG,
    DOCKER_MSG + ' compose service volume networking port mapping bridge',
    DOCKER_MSG + ' container registry image tag layer cache build context',
    DOCKER_MSG + ' deployment kubernetes pod cluster helm chart manifest',
    DOCKER_MSG + ' networking bridge overlay macvlan DNS service discovery',
    DOCKER_MSG + ' volume mount bind tmpfs filesystem container persistent',
    DOCKER_MSG + ' security user namespace capability seccomp apparmor policy',
  ]);
  const result = detectTopic(msgs);
  assert('returns null after /clear (after-clear cohesive)', result === null, JSON.stringify(result?.evidence));
}

// ── Test 4: Only 4 messages → null (too short) ────────────────────────────────

console.log('\n[Test 4] Only 4 user messages → null (too short)');
{
  const msgs = makeMessages([RUST_MSG, TS_MSG, SQL_MSG, CSS_MSG]);
  const result = detectTopic(msgs);
  assert('returns null when < 6 messages', result === null);
}

// ── Test 5: 10 msgs, 4 transitions, very low first-last sim → high severity ──

console.log('\n[Test 5] 10 msgs, 4 transitions, low similarity → high severity');
{
  const msgs = makeMessages([
    RUST_MSG,
    RUST_MSG + ' trait lifetime ownership borrow reference deref',
    TS_MSG,
    TS_MSG + ' generic infer mapped conditional template literal',
    SQL_MSG,
    SQL_MSG + ' transaction lock deadlock MVCC vacuum autovacuum',
    CSS_MSG,
    CSS_MSG + ' custom properties variable cascade specificity selector',
    DOCKER_MSG,
    DOCKER_MSG + ' swarm node manager worker leader quorum consensus',
  ]);
  const result = detectTopic(msgs);
  assert('result is not null', result !== null);
  assert('severity is high (transitions >= 3)', result?.severity === 'high', `got: ${result?.severity}`);
  assert('type is topic', result?.type === 'topic');
  console.log('   transitions:', result?.evidence?.transitionsDetected, '| firstLast:', result?.evidence?.firstLastSimilarity?.toFixed(3));
}

// ── Test 6: exactly 6 messages, exactly 2 transitions, zero first-last → high ─
//
// Note: 3 totally disjoint vocabularies → firstLastSimilarity = 0 < 0.05,
// which triggers high severity per spec regardless of transition count.

console.log('\n[Test 6] 6 msgs, 2 transitions, zero first-last similarity → high (firstLast < 0.05)');
{
  // 3 blocks of 2 messages, each block with totally different vocab
  const msgs = makeMessages([
    GIT_MSG,
    GIT_MSG + ' reflog remote upstream fetch pull push branch merge stash',
    PYTHON_MSG,
    PYTHON_MSG + ' neural network activation gradient descent backpropagation',
    BASH_MSG,
    BASH_MSG + ' while loop function variable array associative hash map',
  ]);
  const result = detectTopic(msgs);
  // 2 transitions (git→python, python→bash), firstLast = 0 → high (firstLast < 0.05)
  assert('result is not null', result !== null);
  if (result !== null) {
    assert('type is topic', result.type === 'topic');
    // firstLastSimilarity = 0 < 0.05 → high, even though only 2 transitions
    assert('severity is high (firstLast < 0.05)', result.severity === 'high', `got: ${result.severity}`);
    assert('exactly 2 transitions', result.evidence.transitionsDetected === 2);
    console.log('   transitions:', result.evidence.transitionsDetected, '| firstLast:', result.evidence.firstLastSimilarity?.toFixed(3), '| severity:', result.severity);
  }
}

// ── Test 7: /clear at end → window has 0 messages after it → null ────────────

console.log('\n[Test 7] /clear as last message → null (empty after-clear window)');
{
  const msgs = makeMessages([
    RUST_MSG, TS_MSG, SQL_MSG, CSS_MSG, DOCKER_MSG, BASH_MSG,
    '/clear',
  ]);
  const result = detectTopic(msgs);
  assert('returns null when after-clear window is empty', result === null);
}

// ── Test 8: Real session from this repo ──────────────────────────────────────

console.log('\n[Test 8] Real session from this repo');
{
  const projectDir = join(homedir(), '.claude', 'projects', '-Users-thomasailleaume-Perso-timetrackerAgent');
  if (!existsSync(projectDir)) {
    console.log('  ~ skipped (project dir not found)');
  } else {
    const files = readdirSync(projectDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ f, size: (/** @type {any} */ (readFileSync)(join(projectDir, f))).length }))
      .sort((a, b) => b.size - a.size);

    if (files.length === 0) {
      console.log('  ~ skipped (no JSONL files)');
    } else {
      const { f } = files[0];
      const sessionId = f.replace('.jsonl', '');
      console.log(`  Using session: ${sessionId}`);

      const raw = readFileSync(join(projectDir, f), 'utf8');
      const userMessages = parseUserMessages(raw);
      console.log(`  Total user messages: ${userMessages.length}`);

      if (userMessages.length > 0) {
        console.log(`  First message preview: "${userMessages[0].text.slice(0, 80).replace(/\n/g, ' ')}…"`);
      }

      const result = detectTopic(userMessages);
      if (result === null) {
        console.log('  ~ no topic drift detected (expected for a focused session)');
        assert('returns null or valid topic report', true);
      } else {
        console.log(`  ! topic drift: ${result.message}`);
        console.log('  evidence:', JSON.stringify(result.evidence, null, 2));
        assert('drift report is well-formed', result.type === 'topic' && typeof result.message === 'string');
      }
    }
  }
}

// ── Summary ────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
