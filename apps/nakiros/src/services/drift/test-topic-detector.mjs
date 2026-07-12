/**
 * Smoke tests for the topic drift detector.
 *
 * Run from repo root:
 *   node apps/nakiros/src/services/drift/test-topic-detector.mjs
 *
 * Exit code 0 = all checks pass. Non-zero = at least one failure.
 *
 * The detector logic is inlined here (no TS compilation needed), mirroring
 * the approach used by test-loop-detector.mjs. Keep this in sync with
 * topic-detector.ts.
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

// ── Inline topic detector (mirrors topic-detector.ts) ─────────────────────────

const MIN_USER_MESSAGES = 6;
const MIN_CONTENT_TOKENS = 4;
const CONTEXT_CONNECTION_THRESHOLD = 0.15;
const END_OPENING_THRESHOLD = 0.10;
const MIN_TRANSITIONS = 2;
const OPENING_MESSAGES = 3;

function findLastClearIndex(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].text.trim().toLowerCase() === '/clear') return i;
  }
  return -1;
}

function topicText(text) {
  return text
    .replace(/<ide_[^>]*>[\s\S]*?<\/ide_[^>]*>/g, ' ')
    .replace(/<ide_[^>]*>/g, ' ');
}

function isProceduralWrapper(text) {
  return text.includes('<command-name>') || text.includes('<local-command-');
}

function connection(probe, context) {
  if (probe.size === 0) return 1;
  let shared = 0;
  for (const t of probe) if (context.has(t)) shared++;
  return shared / probe.size;
}

function computeTopicMetrics(userMessages) {
  const lastClearIdx = findLastClearIndex(userMessages);
  const windowed = lastClearIdx >= 0 ? userMessages.slice(lastClearIdx + 1) : userMessages;

  const tokenSets = [];
  for (const m of windowed) {
    if (isProceduralWrapper(m.text)) continue;
    const tokens = tokenizeForCluster(topicText(m.text));
    if (tokens.size < MIN_CONTENT_TOKENS) continue;
    tokenSets.push(tokens);
  }

  if (tokenSets.length < MIN_USER_MESSAGES) return null;

  const accumulated = new Set(tokenSets[0]);
  let transitions = 0;
  for (let i = 1; i < tokenSets.length; i++) {
    if (connection(tokenSets[i], accumulated) < CONTEXT_CONNECTION_THRESHOLD) transitions++;
    for (const t of tokenSets[i]) accumulated.add(t);
  }

  const openingCount = Math.min(OPENING_MESSAGES, Math.floor(tokenSets.length / 2));
  const opening = new Set();
  for (let i = 0; i < openingCount; i++) for (const t of tokenSets[i]) opening.add(t);
  const endOpeningConnection = connection(tokenSets[tokenSets.length - 1], opening);

  return { transitionsDetected: transitions, endOpeningConnection, userMessageCount: tokenSets.length };
}

function detectTopic(userMessages) {
  const metrics = computeTopicMetrics(userMessages);
  if (!metrics) return null;
  const { transitionsDetected: transitions, endOpeningConnection, userMessageCount } = metrics;

  if (transitions < MIN_TRANSITIONS || endOpeningConnection >= END_OPENING_THRESHOLD) return null;

  const severity = transitions >= 3 || endOpeningConnection < 0.02 ? 'high' : 'medium';
  return {
    type: 'topic',
    severity,
    message: `Nakiros a détecté que la conversation s'est éloignée de l'objectif initial (${transitions} changements de sujet).`,
    suggestion: "Recentre la session sur la tâche d'origine, ou ouvre une nouvelle session avec un cadrage clair.",
    evidence: {
      userMessageCount,
      transitionsDetected: transitions,
      transitionThreshold: MIN_TRANSITIONS,
      endOpeningConnection,
      endOpeningThreshold: END_OPENING_THRESHOLD,
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
    messages.push({ index: msgIndex++, timestamp: entry.timestamp ?? '', text: textParts.join('\n') });
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

// ── Test 2: 8 msgs, 3 distinct topic transitions → drift detected ────────────

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
  assert('endOpeningConnection < 0.10', (result?.evidence?.endOpeningConnection ?? 1) < 0.10);
  console.log('   severity:', result?.severity, '| transitions:', result?.evidence?.transitionsDetected);
}

// ── Test 3: transitions present but /clear at midpoint, after-clear cohesive → null

console.log('\n[Test 3] /clear mid-session, after-clear cohesive → null');
{
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

// ── Test 5: 10 msgs, 4 transitions, unrelated end → high severity ────────────

console.log('\n[Test 5] 10 msgs, 4 transitions, end unrelated to opening → high severity');
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
  console.log('   transitions:', result?.evidence?.transitionsDetected, '| endOpening:', result?.evidence?.endOpeningConnection?.toFixed(3));
}

// ── Test 6: 6 msgs, 2 transitions, end fully unrelated to opening → high ──────

console.log('\n[Test 6] 6 msgs, 2 transitions, end disjoint from opening → high (endOpening < 0.02)');
{
  const msgs = makeMessages([
    GIT_MSG,
    GIT_MSG + ' reflog remote upstream fetch pull push branch merge stash',
    PYTHON_MSG,
    PYTHON_MSG + ' neural network activation gradient descent backpropagation',
    BASH_MSG,
    BASH_MSG + ' while loop function variable array associative hash map',
  ]);
  const result = detectTopic(msgs);
  assert('result is not null', result !== null);
  if (result !== null) {
    assert('type is topic', result.type === 'topic');
    assert('severity is high (endOpening < 0.02)', result.severity === 'high', `got: ${result.severity}`);
    assert('exactly 2 transitions', result.evidence.transitionsDetected === 2);
    console.log('   transitions:', result.evidence.transitionsDetected, '| endOpening:', result.evidence.endOpeningConnection?.toFixed(3), '| severity:', result.severity);
  }
}

// ── Test 7: /clear at end → window empty after it → null ─────────────────────

console.log('\n[Test 7] /clear as last message → null (empty after-clear window)');
{
  const msgs = makeMessages([
    RUST_MSG, TS_MSG, SQL_MSG, CSS_MSG, DOCKER_MSG, BASH_MSG,
    '/clear',
  ]);
  const result = detectTopic(msgs);
  assert('returns null when after-clear window is empty', result === null);
}

// ── Test 8: FP regression — coherent debugging session on one project → null ──
//
// Reproduces the real false positive: each message introduces a NEW sub-problem
// of the same project (Nakiros), reusing recurring vocabulary (fix/audit/skill/
// runner) and interleaving short procedural messages. Adjacent Jaccard is low,
// but the session never leaves the project — must NOT fire.

console.log('\n[Test 8] Coherent multi-subtopic debugging session → null');
{
  const msgs = makeMessages([
    'After an audit of a subagent the Edit button in Nakiros opens a run on the wrong skill target',
    'When I run the eval on a new Nakiros skill the agent says it does not know the skill in the sandbox',
    'Our Nakiros drift detector fires too many false positives on the loop signal in a session',
    'ok on peut commiter le fix',                          // procedural (filtered)
    'The Nakiros fix run on a subagent cannot find the audit report and snapshot in its worktree',
    'ok tu peux commit',                                   // procedural (filtered)
    'Now the Nakiros audit runner writes the snapshot to the wrong root in a worktree run',
    'ok on peut aussi faire un fix sur le topic detector de Nakiros',
  ]);
  const result = detectTopic(msgs);
  assert('coherent session does not fire', result === null, JSON.stringify(result?.evidence));
}

// ── Test 9: FP regression — procedural/short messages don't inflate count ─────

console.log('\n[Test 9] Session dominated by short procedural messages → null');
{
  const msgs = makeMessages([
    'Fix the authentication token refresh flow in the login service module',
    'ok', 'go ahead', 'on continue', 'yes do that', 'ok on y va', 'commit it',
  ]);
  const result = detectTopic(msgs);
  // Only 1 substantive message survives filtering → < 6 → null.
  assert('procedural noise filtered out → null', result === null, JSON.stringify(result?.evidence));
}

// ── Test 10: FP regression — IDE context injections are stripped ──────────────

console.log('\n[Test 10] IDE-context injections do not create transitions → null');
{
  const ide = (path, body) =>
    `<ide_opened_file>The user opened the file ${path} in the IDE.</ide_opened_file>${body}`;
  const msgs = makeMessages([
    'Refactor the payment processing pipeline to add idempotency keys per transaction',
    ide('/src/payments/pipeline.ts', 'The payment pipeline needs idempotency on each transaction retry'),
    ide('/src/payments/retry.ts', 'Payment retry idempotency keys should persist across transaction attempts'),
    'The payment transaction idempotency key must survive a pipeline retry sequence',
    'Payment pipeline idempotency transaction retry key persistence looks correct now',
    'The payment idempotency transaction pipeline retry keys are consistent finally',
  ]);
  const result = detectTopic(msgs);
  assert('IDE tags stripped, cohesive → null', result === null, JSON.stringify(result?.evidence));
}

// ── Test 11: True positive — genuine pivot away from the opening objective ────

console.log('\n[Test 11] Genuine wandering session ending far from the start → drift');
{
  // Mirrors a real session that wandered: migration → meta-doubt → product
  // vision → an unrelated bug → a new feature. Each sub-discussion brings its
  // own vocabulary disconnected from everything before, and the final message
  // shares nothing with the opening — the hallmark of genuine drift.
  const msgs = makeMessages([
    'Migrate the monolith into the modular suite architecture with separate packages',
    'The modular suite needs each package versioned and published independently first',
    'Actually I doubt this whole approach adds value are we overcomplicating everything',
    'I want your honest opinion on the product vision and where the tool should head',
    'Let us pause and instead investigate why projects cannot open their configuration',
    'The bootstrap plan validation should happen before writing any files to disk',
  ]);
  const result = detectTopic(msgs);
  assert('genuine wandering fires', result !== null, JSON.stringify(result?.evidence));
  assert('type is topic', result?.type === 'topic');
  console.log('   transitions:', result?.evidence?.transitionsDetected, '| endOpening:', result?.evidence?.endOpeningConnection?.toFixed(3));
}

// ── Test 12: Real session from this repo ──────────────────────────────────────

console.log('\n[Test 12] Real session from this repo');
{
  const projectDir = join(homedir(), '.claude', 'projects', '-Users-thomasailleaume-Perso-timetrackerAgent');
  if (!existsSync(projectDir)) {
    console.log('  ~ skipped (project dir not found)');
  } else {
    const files = readdirSync(projectDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ f, size: readFileSync(join(projectDir, f)).length }))
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
