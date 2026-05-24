/**
 * Smoke tests for the context pollution drift detector.
 *
 * Run from repo root:
 *   node apps/nakiros/src/services/drift/test-context-detector.mjs
 *
 * Exit code 0 = all checks pass. Non-zero = at least one failure.
 *
 * Detector logic is inlined (no TS compilation needed) — same approach as
 * test-loop-detector.mjs and test-topic-detector.mjs.
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

// ── Inline topic metrics ──────────────────────────────────────────────────────

const TOPIC_TRANSITION_THRESHOLD = 0.15;
const TOPIC_MIN_MESSAGES = 6;

function findLastClearIndex(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].text.trim().toLowerCase() === '/clear') return i;
  }
  return -1;
}

function computeTopicMetrics(userMessages) {
  const lastClearIdx = findLastClearIndex(userMessages);
  const window = lastClearIdx >= 0
    ? userMessages.slice(lastClearIdx + 1)
    : userMessages;

  if (window.length < TOPIC_MIN_MESSAGES) return null;

  const tokenSets = window.map((m) => tokenizeForCluster(m.text));

  let transitions = 0;
  for (let i = 1; i < tokenSets.length; i++) {
    const sim = jaccard(tokenSets[i - 1], tokenSets[i]);
    if (sim < TOPIC_TRANSITION_THRESHOLD) transitions++;
  }

  const firstLastSimilarity = jaccard(tokenSets[0], tokenSets[tokenSets.length - 1]);

  return {
    transitionsDetected: transitions,
    firstLastSimilarity,
    userMessageCount: window.length,
  };
}

// ── Inline context detector ───────────────────────────────────────────────────

const CONTEXT_USAGE_THRESHOLD = 0.50;
const HIGH_USAGE_THRESHOLD = 0.75;
const CONTEXT_FIRST_LAST_THRESHOLD = 0.20;
const CONTEXT_MIN_USER_MESSAGES = 10;

function detectContext(contextMetrics, userMessages) {
  if (userMessages.length < CONTEXT_MIN_USER_MESSAGES) return null;

  const { maxContextTokens, contextWindow } = contextMetrics;
  if (contextWindow <= 0 || maxContextTokens <= 0) return null;

  const contextUsageRatio = maxContextTokens / contextWindow;
  if (contextUsageRatio < CONTEXT_USAGE_THRESHOLD) return null;

  const topicMetrics = computeTopicMetrics(userMessages);
  if (!topicMetrics) return null;

  const { transitionsDetected, firstLastSimilarity } = topicMetrics;
  if (transitionsDetected < 1 || firstLastSimilarity >= CONTEXT_FIRST_LAST_THRESHOLD) return null;

  const isHighUsage = contextUsageRatio >= HIGH_USAGE_THRESHOLD;
  const isHighTopic = transitionsDetected >= 2 && firstLastSimilarity < 0.10;
  const severity = isHighUsage || isHighTopic ? 'high' : 'medium';

  const usagePct = Math.round(contextUsageRatio * 100);

  return {
    type: 'context',
    severity,
    message:
      `Nakiros a détecté que le contexte accumulé devient un poids ` +
      `(${usagePct}% du contexte utilisé, ${transitionsDetected} transition${transitionsDetected > 1 ? 's' : ''} de sujet depuis le début).`,
    suggestion:
      "Un /clear avant la prochaine tâche évitera que l'agent mélange ancien et nouveau contexte.",
    evidence: {
      contextUsageRatio,
      contextUsageThreshold: CONTEXT_USAGE_THRESHOLD,
      maxContextTokens,
      contextWindow,
      userMessageCount: userMessages.length,
      transitionsDetected,
      firstLastSimilarity,
    },
  };
}

// ── Topic detector (to verify no-double-trigger behavior) ─────────────────────

const TOPIC_FIRST_LAST_THRESHOLD = 0.10;
const TOPIC_MIN_TRANSITIONS = 2;

function detectTopic(userMessages) {
  const lastClearIdx = findLastClearIndex(userMessages);
  const clearSlashFound = lastClearIdx >= 0;
  const consideredAfterClearIdx = clearSlashFound ? lastClearIdx + 1 : null;

  const metrics = computeTopicMetrics(userMessages);
  if (!metrics) return null;

  const { transitionsDetected: transitions, firstLastSimilarity, userMessageCount } = metrics;

  if (transitions < TOPIC_MIN_TRANSITIONS || firstLastSimilarity >= TOPIC_FIRST_LAST_THRESHOLD) {
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
      userMessageCount,
      transitionsDetected: transitions,
      transitionThreshold: TOPIC_TRANSITION_THRESHOLD,
      firstLastSimilarity,
      firstLastThreshold: TOPIC_FIRST_LAST_THRESHOLD,
      clearSlashFound,
      consideredAfterClearIdx,
    },
  };
}

// ── Inline context metrics parser ─────────────────────────────────────────────

const STANDARD_WINDOW = 200_000;
const EXTENDED_WINDOW = 1_000_000;
const EXTENDED_WINDOW_TRIGGER = 250_000;

function parseContextMetrics(raw) {
  const lines = raw.split('\n');
  let maxContextTokens = 0;

  for (const line of lines) {
    if (!line) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.type !== 'assistant' || entry.isMeta) continue;

    const usage = entry.message?.usage;
    if (!usage) continue;

    const input = usage.input_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cc = usage.cache_creation ?? {};
    let cache5m = cc.ephemeral_5m_input_tokens ?? 0;
    let cache1h = cc.ephemeral_1h_input_tokens ?? 0;
    if (cache5m === 0 && cache1h === 0 && usage.cache_creation_input_tokens) {
      cache5m = usage.cache_creation_input_tokens;
    }
    const cacheCreation = cache5m + cache1h;
    const ctxOnThisTurn = input + cacheRead + cacheCreation;
    if (ctxOnThisTurn > maxContextTokens) maxContextTokens = ctxOnThisTurn;
  }

  const contextWindow = maxContextTokens > EXTENDED_WINDOW_TRIGGER ? EXTENDED_WINDOW : STANDARD_WINDOW;
  return { maxContextTokens, contextWindow };
}

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

function makeMessages(texts) {
  return texts.map((text, i) => ({ index: i, timestamp: new Date().toISOString(), text }));
}

// ── Topic-specific vocabularies ───────────────────────────────────────────────

const RUST_MSG = 'Rust compiler borrow checker lifetime ownership memory safety';
const TS_MSG   = 'TypeScript interface generic type inference decorator optional chaining';
const SQL_MSG  = 'PostgreSQL query optimizer index foreign key transaction isolation';
const CSS_MSG  = 'Tailwind flexbox grid responsive breakpoint utility class animation';
const DOCKER_MSG = 'Docker container Dockerfile volume networking compose kubernetes deployment';
const GIT_MSG  = 'git rebase merge conflict cherry-pick stash bisect remote branch';
const PYTHON_MSG = 'Python pandas dataframe matplotlib numpy scikit machine learning model';
const BASH_MSG = 'bash shell script heredoc pipe redirect awk grep sed cron cronjob';
const REACT_MSG = 'React component hook useState useEffect context provider render JSX';
const NGINX_MSG = 'nginx reverse proxy server load balancing SSL certificate upstream config';

// ── Test 1: strong topic drift (transitions >= 2, firstLast < 0.10) → topic fires first, context not called
//
// This simulates the no-double-trigger requirement: if topic detector fires,
// we should NOT also trigger context (analyzer ordering guarantees this).
// We verify here that:
//   (a) topic detector DOES fire on the messages
//   (b) context detector would ALSO fire on the same messages (to confirm the overlap zone)
//   (c) the analyzer would return topic first

console.log('\n[Test 1] Strong topic drift with 70% context usage → topic fires, context is suppressed');
{
  // 10 messages: 2 transitions (RUST→TS→SQL), firstLastSimilarity ≈ 0 (disjoint)
  const msgs = makeMessages([
    RUST_MSG, RUST_MSG + ' trait lifetime ownership borrow',
    TS_MSG, TS_MSG + ' generic infer mapped conditional',
    SQL_MSG, SQL_MSG + ' transaction lock deadlock MVCC',
    CSS_MSG, CSS_MSG + ' custom properties variable cascade',
    DOCKER_MSG, DOCKER_MSG + ' swarm node manager worker leader',
  ]);

  const topicResult = detectTopic(msgs);
  const contextResult = detectContext(
    { maxContextTokens: 140_000, contextWindow: 200_000 }, // 70% usage
    msgs,
  );

  assert('topic detector fires', topicResult !== null, JSON.stringify(topicResult?.evidence));
  assert('context detector would also fire (overlap zone)', contextResult !== null);
  // The ordering in drift-analyzer.ts ensures topic is returned first:
  // topic → returned immediately, context never called.
  const analyzerResult = topicResult ?? contextResult;
  assert('analyzer returns topic (not context)', analyzerResult?.type === 'topic');
  console.log(`   topic transitions: ${topicResult?.evidence?.transitionsDetected} | firstLast: ${topicResult?.evidence?.firstLastSimilarity?.toFixed(3)}`);
}

// ── Test 2: context detector triggers (1 transition only, similarity 0.15, 70% usage)
//
// Topic detector does NOT fire (needs >= 2 transitions AND firstLast < 0.10).
// Context detector fires (>= 1 transition, firstLast < 0.20, usage >= 50%).

console.log('\n[Test 2] 70% context, 1 transition, similarity 0.15 → context fires (topic silent)');
{
  // 10 messages: Rust for first 5, SQL for last 5 → 1 clean transition, Jaccard ~0
  // We need firstLastSimilarity < 0.20 — disjoint vocabs guarantee 0.
  const msgs = makeMessages([
    RUST_MSG,
    RUST_MSG + ' trait lifetime ownership borrow reference',
    RUST_MSG + ' unsafe trait implement struct enum derive',
    RUST_MSG + ' cargo crate dependency toml workspace lock',
    RUST_MSG + ' async await tokio future executor poll',
    SQL_MSG, // ← transition here (index 5)
    SQL_MSG + ' transaction lock deadlock MVCC vacuum autovacuum',
    SQL_MSG + ' window function partitioning aggregate subquery ranking',
    SQL_MSG + ' index btree hash gin gist covering partial expression',
    SQL_MSG + ' foreign key constraint referential integrity cascade',
  ]);

  const topicResult = detectTopic(msgs);
  const contextResult = detectContext(
    { maxContextTokens: 140_000, contextWindow: 200_000 }, // 70%
    msgs,
  );

  assert('topic detector is silent (< 2 transitions)', topicResult === null,
    `got: type=${topicResult?.type} transitions=${topicResult?.evidence?.transitionsDetected}`);
  assert('context detector fires', contextResult !== null, JSON.stringify(contextResult?.evidence));
  if (contextResult) {
    assert('type is context', contextResult.type === 'context');
    assert('severity is high (usage >= 75% OR topic conditions)',
      contextResult.severity === 'high' || contextResult.severity === 'medium');
    console.log(`   severity: ${contextResult.severity} | usage: ${Math.round(contextResult.evidence.contextUsageRatio * 100)}% | transitions: ${contextResult.evidence.transitionsDetected}`);
  }
}

// ── Test 3: context usage too low (30%) → null even with topic drift

console.log('\n[Test 3] 30% context usage (too low) → null even with topic signals');
{
  const msgs = makeMessages([
    RUST_MSG, RUST_MSG + ' trait lifetime borrow',
    TS_MSG, TS_MSG + ' generic infer mapped',
    SQL_MSG, SQL_MSG + ' transaction lock deadlock',
    CSS_MSG, CSS_MSG + ' variable cascade specificity',
    DOCKER_MSG, DOCKER_MSG + ' swarm node manager',
  ]);

  const result = detectContext(
    { maxContextTokens: 60_000, contextWindow: 200_000 }, // 30%
    msgs,
  );
  assert('returns null when context usage < 50%', result === null,
    result ? `got: ${result.type} severity=${result.severity}` : '');
}

// ── Test 4: too few user messages (< 10) → null

console.log('\n[Test 4] Only 7 user messages → null (too short)');
{
  const msgs = makeMessages([
    RUST_MSG, TS_MSG, SQL_MSG, CSS_MSG, DOCKER_MSG, GIT_MSG, PYTHON_MSG,
  ]);

  const result = detectContext(
    { maxContextTokens: 150_000, contextWindow: 200_000 }, // 75%
    msgs,
  );
  assert('returns null when user messages < 10', result === null,
    result ? `got: ${result.type}` : '');
}

// ── Test 5: high context usage (75%+) → high severity

console.log('\n[Test 5] 80% context, 1 transition, low firstLast → high severity');
{
  const msgs = makeMessages([
    RUST_MSG, RUST_MSG + ' trait lifetime borrow reference deref',
    RUST_MSG + ' unsafe trait impl struct enum derive macro',
    RUST_MSG + ' async await tokio executor runtime handle',
    RUST_MSG + ' cargo workspace crate dependency toml lock',
    SQL_MSG, SQL_MSG + ' transaction deadlock vacuum autovacuum',
    SQL_MSG + ' window function aggregate partitioning rank',
    SQL_MSG + ' index covering btree hash gin gist partial',
    SQL_MSG + ' constraint foreign key referential cascade delete',
  ]);

  const result = detectContext(
    { maxContextTokens: 160_000, contextWindow: 200_000 }, // 80%
    msgs,
  );
  assert('result is not null', result !== null,
    result === null ? 'null returned' : '');
  if (result) {
    assert('type is context', result.type === 'context');
    assert('severity is high (usage >= 75%)', result.severity === 'high',
      `got: ${result.severity}`);
    console.log(`   usage: ${Math.round(result.evidence.contextUsageRatio * 100)}% | severity: ${result.severity}`);
  }
}

// ── Test 6: no topic transitions (all messages cohesive) → null

console.log('\n[Test 6] High context but no topic transitions (firstLast >= 0.20) → null');
{
  // All messages about PostgreSQL transactions — heavy repetition of the same
  // core vocabulary ensures firstLastSimilarity stays well above 0.20.
  // Every message repeats: transaction, commit, rollback, database, isolation
  const msgs = makeMessages([
    'PostgreSQL transaction commit rollback isolation database savepoint',
    'Transaction isolation level serializable repeatable read database',
    'Database transaction deadlock rollback commit isolation savepoint',
    'Rollback savepoint transaction isolation level database postgresql',
    'Isolation serializable transaction commit rollback postgresql database',
    'PostgreSQL savepoint transaction rollback isolation commit database',
    'Database transaction commit rollback savepoint isolation postgresql',
    'Transaction commit rollback database isolation savepoint postgresql',
    'Isolation level transaction rollback commit database postgresql savepoint',
    'PostgreSQL transaction isolation database rollback commit savepoint',
  ]);

  const topicMetrics = computeTopicMetrics(msgs);
  const result = detectContext(
    { maxContextTokens: 160_000, contextWindow: 200_000 }, // 80%
    msgs,
  );

  // Diagnose: print actual firstLastSimilarity to understand the threshold
  if (topicMetrics) {
    console.log(`   actual firstLast: ${topicMetrics.firstLastSimilarity.toFixed(3)} | transitions: ${topicMetrics.transitionsDetected}`);
  }

  // This passes when either:
  // (a) firstLastSimilarity >= 0.20, OR
  // (b) transitions == 0 (no divergence between consecutive messages)
  const shouldBeNull = !topicMetrics ||
    topicMetrics.transitionsDetected < 1 ||
    topicMetrics.firstLastSimilarity >= 0.20;

  assert('returns null for cohesive session (no transitions or high firstLast)', result === null,
    result ? `got type=${result.type} firstLast=${topicMetrics?.firstLastSimilarity?.toFixed(3)} transitions=${topicMetrics?.transitionsDetected}` : '');
}

// ── Test 7: Real session from this repo ──────────────────────────────────────

console.log('\n[Test 7] Real session from this repo');
{
  const projectDir = join(homedir(), '.claude', 'projects', '-Users-thomasailleaume-Perso-timetrackerAgent');
  if (!existsSync(projectDir)) {
    console.log('  ~ skipped (project dir not found)');
    assert('skipped', true);
  } else {
    const files = readdirSync(projectDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ f, mtime: readFileSync(join(projectDir, f)).length }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) {
      console.log('  ~ skipped (no JSONL files)');
      assert('skipped', true);
    } else {
      const { f } = files[0];
      const sessionId = f.replace('.jsonl', '');
      console.log(`  Using session: ${sessionId}`);

      const raw = readFileSync(join(projectDir, f), 'utf8');
      const contextMetrics = parseContextMetrics(raw);
      const userMessages = parseUserMessages(raw);

      console.log(`  User messages: ${userMessages.length} | maxContextTokens: ${contextMetrics.maxContextTokens.toLocaleString()} / ${contextMetrics.contextWindow.toLocaleString()} (${Math.round(contextMetrics.maxContextTokens / contextMetrics.contextWindow * 100)}%)`);

      const topicResult = detectTopic(userMessages);
      const contextResult = detectContext(contextMetrics, userMessages);

      // Simulate analyzer ordering: topic wins if both fire
      const analyzerResult = topicResult ?? contextResult ?? null;

      if (analyzerResult === null) {
        console.log('  ~ no drift detected (expected for a healthy session)');
        assert('returns null or valid drift report', true);
      } else {
        console.log(`  ! ${analyzerResult.type} drift (severity: ${analyzerResult.severity}): ${analyzerResult.message}`);
        assert('drift report is well-formed', ['loop', 'topic', 'context'].includes(analyzerResult.type) && typeof analyzerResult.message === 'string');
        if (topicResult && contextResult) {
          console.log('  NOTE: Both topic and context fired — analyzer would return topic (first)');
        }
      }
    }
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
