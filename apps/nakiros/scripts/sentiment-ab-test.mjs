/**
 * Sentiment A/B Test — Multilingual ONNX Models
 *
 * Compares 4 candidate sentiment models against the current distilbert baseline
 * across 15 hand-crafted test cases and a real Claude Code session JSONL.
 *
 * Run: pnpm -F @nakirosai/nakiros exec node scripts/sentiment-ab-test.mjs
 *  or: node apps/nakiros/scripts/sentiment-ab-test.mjs
 *
 * Output:
 *   - Console: per-model accuracy, label distribution, disagreements
 *   - Writes report to docs/superpowers/ab-test-results-2026-05-12.md
 */

import { readFileSync, existsSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const DOCS_DIR = join(REPO_ROOT, 'docs/superpowers');

// ---------------------------------------------------------------------------
// Model definitions
// ---------------------------------------------------------------------------

const MODELS = [
  {
    id: 'Xenova/distilbert-base-multilingual-cased-sentiments-student',
    shortName: 'distilbert-multilingual',
    description: 'Current baseline — distilbert multilingual, 3-class (Positive/Neutral/Negative)',
    type: '3class',   // labels: Positive, Neutral, Negative
    isBaseline: true,
  },
  {
    id: 'Xenova/twitter-XLM-roBERTa-base-sentiment',
    shortName: 'twitter-xlm-roberta',
    description: 'XLM-RoBERTa fine-tuned on Twitter (TweetEval), multilingual 3-class',
    type: '3class',   // labels: positive, neutral, negative (lowercase)
  },
  {
    id: 'Xenova/bert-base-multilingual-uncased-sentiment',
    shortName: 'bert-nlptown-5class',
    description: 'nlptown/bert-base-multilingual-uncased-sentiment — 5-star, mapped to 3-class',
    type: '5class',   // labels: "1 star" ... "5 stars" → map 1-2 → Negative, 3 → Neutral, 4-5 → Positive
  },
  {
    id: 'Xenova/distilbert-base-multilingual-cased-sentiments-student',
    shortName: 'distilbert-multilingual-full',
    description: 'Same as baseline but scored with topk=3 (debug — raw probabilities)',
    type: '3class',
    topk: 3,
    skipForStats: true,  // only for understanding score distribution, not for main comparison
  },
];

// ---------------------------------------------------------------------------
// Hand-crafted test cases
// ---------------------------------------------------------------------------

const TEST_CASES = [
  // True positives (should be Positive)
  { text: "c'est super malin et je suis d'accord avec toi", expected: 'Positive', category: 'true-positive' },
  { text: 'parfait merci', expected: 'Positive', category: 'true-positive' },
  { text: 'ça marche, super', expected: 'Positive', category: 'true-positive' },
  { text: "exactement c'est ce que je voulais", expected: 'Positive', category: 'true-positive' },

  // True negatives (should be Negative — emotional frustration / correction)
  { text: "non, arrête ! c'est pas du tout ça", expected: 'Negative', category: 'true-negative' },
  { text: "stop, don't do that, revert all changes", expected: 'Negative', category: 'true-negative' },
  { text: "wait wait no, that's completely wrong", expected: 'Negative', category: 'true-negative' },
  { text: "putain ça marche pas, j'en ai marre", expected: 'Negative', category: 'true-negative' },

  // True neutrals — descriptive negation (NOT emotional)
  { text: "dans les assets nous pouvons avoir des fichiers de type png, jpg etc on les affiche pas à l'écran", expected: 'Neutral', category: 'descriptive-negation' },
  { text: "le fichier ne contient pas la clé attendue", expected: 'Neutral', category: 'descriptive-negation' },
  { text: "il n'y a pas de migration nécessaire", expected: 'Neutral', category: 'descriptive-negation' },

  // True neutrals — short colloquial / instructions
  { text: 'ouai passons sur sonnet', expected: 'Neutral', category: 'colloquial-neutral' },
  { text: 'ok continue', expected: 'Neutral', category: 'colloquial-neutral' },
  { text: 'ajoute un bouton ici', expected: 'Neutral', category: 'colloquial-neutral' },

  // Edge — sarcasm / ambiguous
  { text: "bravo tu as cassé le build encore une fois", expected: 'Negative', category: 'sarcasm' },
];

// Our "pain" cases (key KPIs)
const PAIN_CASES = [
  "ouai passons sur sonnet",
  "dans les assets nous pouvons avoir des fichiers de type png, jpg etc on les affiche pas à l'écran",
  "c'est super malin et je suis d'accord avec toi",
];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const modelCacheDir = join(homedir(), '.nakiros', 'models');

function dirSize(dirPath) {
  if (!existsSync(dirPath)) return 0;
  let total = 0;
  try {
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
      const full = join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) total += dirSize(full);
        else total += statSync(full).size;
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return total;
}

function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function truncate(s, maxLen = 55) {
  const clean = s.replace(/\n/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1) + '…';
}

function pad(s, n) {
  const str = String(s);
  if (str.length >= n) return str.slice(0, n);
  return str + ' '.repeat(n - str.length);
}

/** Find largest session JSONL (same logic as sentiment-poc.mjs) */
function findBestSession() {
  const projectDir = join(
    homedir(),
    '.claude/projects/-Users-thomasailleaume-Perso-timetrackerAgent',
  );
  if (!existsSync(projectDir)) {
    console.error('ERROR: Claude project directory not found:', projectDir);
    process.exit(1);
  }

  let best = null;
  let bestCount = 0;

  for (const f of readdirSync(projectDir)) {
    if (!f.endsWith('.jsonl')) continue;
    const fullPath = join(projectDir, f);
    try {
      const content = readFileSync(fullPath, 'utf8');
      const count = (content.match(/"type":"user"/g) || []).length;
      if (count > bestCount) {
        bestCount = count;
        best = fullPath;
      }
    } catch { /* skip */ }
  }

  if (!best) {
    console.error('ERROR: No JSONL sessions found in', projectDir);
    process.exit(1);
  }
  return { path: best, userCount: bestCount };
}

function extractUserText(message) {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const textBlock = content.find((b) => b?.type === 'text');
    return textBlock?.text ?? '';
  }
  return '';
}

function shouldSkip(text) {
  if (!text || text.length < 5) return true;
  if (text.includes('```')) return true;
  const alpha = (text.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
  const nonAlphaRatio = (text.length - alpha) / text.length;
  return nonAlphaRatio > 0.4;
}

function parseSession(jsonlPath) {
  const lines = readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean);
  const results = [];
  for (const line of lines) {
    try {
      const record = JSON.parse(line);
      if (record.type !== 'user') continue;
      const text = extractUserText(record.message);
      if (!text || shouldSkip(text)) continue;
      results.push(text);
    } catch { /* malformed line */ }
  }
  return results;
}

/** Normalize raw model label → 'Positive' | 'Neutral' | 'Negative' */
function normalizeLabel(raw, modelType) {
  if (typeof raw !== 'string') return 'Neutral';
  const lower = raw.toLowerCase().trim();

  if (modelType === '5class') {
    // nlptown labels: "1 star", "2 stars", "3 stars", "4 stars", "5 stars"
    const match = lower.match(/^(\d)/);
    if (match) {
      const stars = parseInt(match[1], 10);
      if (stars <= 2) return 'Negative';
      if (stars === 3) return 'Neutral';
      return 'Positive';
    }
    // fallback
    if (lower.includes('1') || lower.includes('2')) return 'Negative';
    if (lower.includes('4') || lower.includes('5')) return 'Positive';
    return 'Neutral';
  }

  // 3-class (distilbert, roberta)
  if (lower.startsWith('pos')) return 'Positive';
  if (lower.startsWith('neg')) return 'Negative';
  if (lower.startsWith('neu')) return 'Neutral';

  // twitter-xlm-roberta uses: "positive", "neutral", "negative" (lowercase)
  if (lower === 'positive') return 'Positive';
  if (lower === 'negative') return 'Negative';
  if (lower === 'neutral') return 'Neutral';

  // fallback
  return 'Neutral';
}

// ---------------------------------------------------------------------------
// Model runner
// ---------------------------------------------------------------------------

async function runModel(model, sessionMessages) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Model: ${model.shortName}`);
  console.log(`  ID: ${model.id}`);
  console.log(`  Type: ${model.description}`);
  console.log('='.repeat(70));

  const sizeBeforeBytes = dirSize(join(modelCacheDir, 'Xenova'));

  // Load model
  const loadStart = performance.now();
  let classifier;
  try {
    const { pipeline, env } = await import('@xenova/transformers');
    env.cacheDir = modelCacheDir;
    env.allowRemoteModels = true;
    env.allowLocalModels = true;

    process.stdout.write(`  Loading model... `);
    classifier = await pipeline('text-classification', model.id, {
      quantized: true,
    });
    const loadMs = performance.now() - loadStart;
    process.stdout.write(`done (${(loadMs / 1000).toFixed(2)}s)\n`);

    const sizeAfterBytes = dirSize(join(modelCacheDir, 'Xenova'));
    const downloadedBytes = sizeAfterBytes - sizeBeforeBytes;
    const rss = process.memoryUsage().rss;

    console.log(`  Cache size: ${fmtBytes(sizeAfterBytes)} (delta: ${fmtBytes(downloadedBytes)})`);
    console.log(`  RSS after load: ${fmtBytes(rss)}`);

    const perfStats = {
      coldStartMs: loadMs,
      downloadedBytes,
      totalCacheSizeBytes: sizeAfterBytes,
      rssBytes: rss,
    };

    // ---- Score test cases ----
    console.log(`\n  Scoring ${TEST_CASES.length} test cases...`);
    const testResults = [];
    const testTimings = [];

    for (const tc of TEST_CASES) {
      const t0 = performance.now();
      try {
        const topk = model.topk || 1;
        const raw = await classifier(tc.text, { topk });
        const t1 = performance.now();
        testTimings.push(t1 - t0);

        // Handle topk=1 (array of 1) or topk=3 (array of 3)
        const resultArr = Array.isArray(raw) ? raw : [raw];
        const top = resultArr[0];
        const label = normalizeLabel(top?.label, model.type);
        const score = typeof top?.score === 'number' ? top.score : 0;

        testResults.push({
          text: tc.text,
          expected: tc.expected,
          category: tc.category,
          label,
          score,
          match: label === tc.expected,
          rawLabel: top?.label,
          allScores: topk > 1 ? resultArr.map(r => ({ label: r.label, score: r.score })) : null,
        });
      } catch (err) {
        testResults.push({
          text: tc.text,
          expected: tc.expected,
          category: tc.category,
          label: 'ERROR',
          score: 0,
          match: false,
          error: err.message,
        });
      }
    }

    // ---- Score session messages ----
    console.log(`  Scoring ${sessionMessages.length} session messages...`);
    const sessionResults = [];
    const sessionTimings = [];

    for (const text of sessionMessages) {
      const t0 = performance.now();
      try {
        const raw = await classifier(text, { topk: 1 });
        const t1 = performance.now();
        sessionTimings.push(t1 - t0);

        const resultArr = Array.isArray(raw) ? raw : [raw];
        const top = resultArr[0];
        const label = normalizeLabel(top?.label, model.type);
        const score = typeof top?.score === 'number' ? top.score : 0;

        sessionResults.push({ text, label, score });
      } catch {
        sessionResults.push({ text, label: 'ERROR', score: 0 });
      }
    }

    const allTimings = [...testTimings, ...sessionTimings];
    const avgInferenceMs = allTimings.length > 0
      ? allTimings.reduce((a, b) => a + b, 0) / allTimings.length
      : 0;

    perfStats.avgInferenceMs = avgInferenceMs;

    return {
      model,
      perfStats,
      testResults,
      sessionResults,
      error: null,
    };

  } catch (err) {
    const loadMs = performance.now() - loadStart;
    console.error(`  ERROR loading model after ${(loadMs / 1000).toFixed(2)}s: ${err.message}`);

    // Check if > 1GB file (skip instruction)
    console.log(`  Skipping model due to load error.`);

    return {
      model,
      perfStats: {
        coldStartMs: loadMs,
        downloadedBytes: 0,
        totalCacheSizeBytes: 0,
        rssBytes: 0,
        avgInferenceMs: 0,
      },
      testResults: [],
      sessionResults: [],
      error: err.message,
    };
  }
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function computeAccuracy(testResults) {
  if (!testResults || testResults.length === 0) return { overall: 0, byCategory: {} };
  const correct = testResults.filter(r => r.match).length;
  const overall = (correct / testResults.length) * 100;

  const categories = {};
  for (const r of testResults) {
    if (!categories[r.category]) categories[r.category] = { correct: 0, total: 0 };
    categories[r.category].total++;
    if (r.match) categories[r.category].correct++;
  }

  const byCategory = {};
  for (const [cat, stats] of Object.entries(categories)) {
    byCategory[cat] = ((stats.correct / stats.total) * 100).toFixed(0);
  }

  return { overall, correct, total: testResults.length, byCategory };
}

function computeLabelDistribution(sessionResults) {
  const dist = { Positive: 0, Neutral: 0, Negative: 0, ERROR: 0 };
  for (const r of sessionResults) {
    dist[r.label] = (dist[r.label] ?? 0) + 1;
  }
  return dist;
}

function getTop5Negative(sessionResults) {
  return [...sessionResults]
    .filter(r => r.label === 'Negative')
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function countDisagreements(resultsA, resultsB) {
  let count = 0;
  const messages = Math.min(resultsA.length, resultsB.length);
  for (let i = 0; i < messages; i++) {
    if (resultsA[i].label !== resultsB[i].label) count++;
  }
  return { count, total: messages };
}

function printTestCaseTable(modelResults) {
  console.log('\n\n' + '='.repeat(120));
  console.log('TEST CASES — PER-MODEL COMPARISON');
  console.log('='.repeat(120));

  const colText = 58;
  const colExp = 10;
  const colCat = 22;
  const modelCols = modelResults.filter(r => !r.model.skipForStats).map(r => ({
    name: r.model.shortName.slice(0, 22),
    results: r.testResults,
  }));

  // Header
  const header = [
    pad('Text', colText),
    pad('Expected', colExp),
    pad('Category', colCat),
    ...modelCols.map(m => pad(m.name, 26)),
  ].join(' | ');
  console.log(header);
  console.log('-'.repeat(header.length));

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    const isPain = PAIN_CASES.includes(tc.text);

    const row = [
      pad(truncate(tc.text, colText), colText),
      pad(tc.expected, colExp),
      pad(tc.category, colCat),
      ...modelCols.map(m => {
        if (!m.results || m.results.length === 0) return pad('N/A', 26);
        const r = m.results[i];
        if (!r) return pad('N/A', 26);
        const mark = r.match ? '✓' : '✗';
        const cell = `${mark} ${r.label} (${r.score.toFixed(2)})`;
        return pad(cell, 26);
      }),
    ].join(' | ');

    const prefix = isPain ? '>>> ' : '    ';
    console.log(prefix + row);
  }

  console.log('-'.repeat(header.length));

  // Accuracy row
  const accuracyRow = [
    pad('ACCURACY', colText),
    pad('', colExp),
    pad('', colCat),
    ...modelCols.map(m => {
      if (!m.results || m.results.length === 0) return pad('ERROR', 26);
      const acc = computeAccuracy(m.results);
      return pad(`${acc.correct}/${acc.total} (${acc.overall.toFixed(0)}%)`, 26);
    }),
  ].join(' | ');
  console.log('    ' + accuracyRow);

  // Category breakdown
  for (const cat of ['true-positive', 'true-negative', 'descriptive-negation', 'colloquial-neutral', 'sarcasm']) {
    const catRow = [
      pad(`  ${cat}`, colText),
      pad('', colExp),
      pad('', colCat),
      ...modelCols.map(m => {
        if (!m.results || m.results.length === 0) return pad('', 26);
        const catResults = m.results.filter(r => r.category === cat);
        const correct = catResults.filter(r => r.match).length;
        return pad(`${correct}/${catResults.length}`, 26);
      }),
    ].join(' | ');
    console.log('    ' + catRow);
  }
}

function printPainCasesReport(modelResults) {
  console.log('\n\n' + '='.repeat(80));
  console.log('PAIN CASES — KEY KPIs');
  console.log('='.repeat(80));

  const validModels = modelResults.filter(r => !r.error && !r.model.skipForStats);

  for (const painText of PAIN_CASES) {
    const tcIndex = TEST_CASES.findIndex(t => t.text === painText);
    const tc = TEST_CASES[tcIndex];
    console.log(`\nText: "${truncate(painText, 70)}"`);
    console.log(`Expected: ${tc?.expected}`);
    for (const mr of validModels) {
      const r = mr.testResults[tcIndex];
      if (!r) { console.log(`  ${pad(mr.model.shortName, 30)} → N/A`); continue; }
      const mark = r.match ? '[OK]' : '[FAIL]';
      console.log(`  ${pad(mr.model.shortName, 30)} → ${r.label.padEnd(10)} (${r.score.toFixed(3)}) ${mark}`);
    }
  }
}

function printSessionReport(modelResults, baselineResults) {
  console.log('\n\n' + '='.repeat(80));
  console.log('SESSION SCORING — LABEL DISTRIBUTION & TOP NEGATIVES');
  console.log('='.repeat(80));

  const validModels = modelResults.filter(r => !r.error && !r.model.skipForStats);

  for (const mr of validModels) {
    if (mr.sessionResults.length === 0) continue;
    console.log(`\n--- ${mr.model.shortName} ---`);
    const dist = computeLabelDistribution(mr.sessionResults);
    const total = mr.sessionResults.length;
    for (const [label, count] of Object.entries(dist)) {
      if (count === 0) continue;
      const pct = ((count / total) * 100).toFixed(1);
      console.log(`  ${pad(label, 12)} ${String(count).padStart(4)} (${pct}%)`);
    }

    const top5 = getTop5Negative(mr.sessionResults);
    if (top5.length > 0) {
      console.log(`  Top 5 Negative:`);
      for (const r of top5) {
        console.log(`    [${r.score.toFixed(3)}] ${truncate(r.text, 70)}`);
      }
    }

    if (baselineResults && mr.model.shortName !== baselineResults.model.shortName) {
      const dis = countDisagreements(baselineResults.sessionResults, mr.sessionResults);
      const pct = ((dis.count / dis.total) * 100).toFixed(1);
      console.log(`  Disagreements vs baseline: ${dis.count}/${dis.total} (${pct}%)`);
    }
  }
}

// ---------------------------------------------------------------------------
// Markdown report generation
// ---------------------------------------------------------------------------

function generateMarkdownReport(modelResults, sessionPath) {
  const validModels = modelResults.filter(r => !r.model.skipForStats);
  const baseline = modelResults.find(r => r.model.isBaseline);
  const date = '2026-05-12';

  let md = `# Sentiment A/B Test Results — ${date}\n\n`;
  md += `**Branch:** feat/sentiment-prepass  \n`;
  md += `**Session tested:** \`${sessionPath}\`  \n`;
  md += `**Test cases:** ${TEST_CASES.length} hand-crafted  \n\n`;

  md += `## Models Tested\n\n`;
  md += `| Short name | Model ID | Description | Error |\n`;
  md += `|------------|----------|-------------|-------|\n`;
  for (const mr of validModels) {
    const err = mr.error ? `⚠ ${mr.error.slice(0, 60)}` : '—';
    md += `| \`${mr.model.shortName}\` | \`${mr.model.id}\` | ${mr.model.description} | ${err} |\n`;
  }
  md += '\n';

  md += `## Overall Accuracy on 15 Test Cases\n\n`;
  md += `| Model | Correct | Accuracy | Pos | Neg | Desc-neg | Colloq | Sarcasm |\n`;
  md += `|-------|---------|----------|-----|-----|----------|--------|--------|\n`;
  for (const mr of validModels) {
    if (mr.error) {
      md += `| \`${mr.model.shortName}\` | — | ERROR | — | — | — | — | — |\n`;
      continue;
    }
    const acc = computeAccuracy(mr.testResults);
    const catFmt = (cat) => {
      const catResults = mr.testResults.filter(r => r.category === cat);
      const c = catResults.filter(r => r.match).length;
      return `${c}/${catResults.length}`;
    };
    md += `| \`${mr.model.shortName}\` | ${acc.correct}/${acc.total} | **${acc.overall.toFixed(0)}%** | ${catFmt('true-positive')} | ${catFmt('true-negative')} | ${catFmt('descriptive-negation')} | ${catFmt('colloquial-neutral')} | ${catFmt('sarcasm')} |\n`;
  }
  md += '\n';

  md += `## Key Pain Cases\n\n`;
  md += `These 3 cases drove the A/B test (known false positives in the baseline).\n\n`;
  md += `| Text | Expected | distilbert | twitter-xlm | bert-nlptown |\n`;
  md += `|------|----------|------------|-------------|-------------|\n`;

  for (const painText of PAIN_CASES) {
    const tcIndex = TEST_CASES.findIndex(t => t.text === painText);
    const tc = TEST_CASES[tcIndex];
    const cells = validModels.filter(mr => !mr.error && mr.model.shortName !== 'distilbert-multilingual-full').map(mr => {
      const r = mr.testResults[tcIndex];
      if (!r) return '—';
      const mark = r.match ? '✓' : '✗';
      return `${mark} ${r.label} (${r.score.toFixed(2)})`;
    });
    md += `| ${truncate(painText, 50)} | ${tc?.expected} | ${cells[0] || '—'} | ${cells[1] || '—'} | ${cells[2] || '—'} |\n`;
  }
  md += '\n';

  md += `## Performance Metrics\n\n`;
  md += `| Model | Cold Start | Avg Inference | Download (delta) | RSS |\n`;
  md += `|-------|-----------|---------------|-----------------|-----|\n`;
  for (const mr of validModels) {
    const p = mr.perfStats;
    if (!p) continue;
    md += `| \`${mr.model.shortName}\` | ${(p.coldStartMs / 1000).toFixed(2)}s | ${(p.avgInferenceMs || 0).toFixed(1)}ms/msg | ${fmtBytes(p.downloadedBytes)} | ${fmtBytes(p.rssBytes)} |\n`;
  }
  md += '\n';

  md += `## Session Label Distribution\n\n`;
  md += `| Model | Positive | Neutral | Negative | Total scored |\n`;
  md += `|-------|----------|---------|----------|-------------|\n`;
  for (const mr of validModels) {
    if (mr.error || mr.sessionResults.length === 0) continue;
    const dist = computeLabelDistribution(mr.sessionResults);
    const total = mr.sessionResults.filter(r => r.label !== 'ERROR').length;
    const pct = (n) => total > 0 ? `${n} (${((n / total) * 100).toFixed(0)}%)` : '0';
    md += `| \`${mr.model.shortName}\` | ${pct(dist.Positive || 0)} | ${pct(dist.Neutral || 0)} | ${pct(dist.Negative || 0)} | ${total} |\n`;
  }
  md += '\n';

  if (baseline && !baseline.error) {
    md += `## Model Disagreements vs Baseline (distilbert)\n\n`;
    for (const mr of validModels) {
      if (mr.error || mr.model.isBaseline || mr.model.skipForStats || mr.sessionResults.length === 0) continue;
      const dis = countDisagreements(baseline.sessionResults, mr.sessionResults);
      const pct = ((dis.count / dis.total) * 100).toFixed(1);
      md += `- **${mr.model.shortName}**: ${dis.count}/${dis.total} messages (${pct}%) disagree with distilbert on top-1 label\n`;
    }
    md += '\n';

    // Interesting disagreements (distilbert says Negative with high confidence, other model disagrees)
    md += `## Notable Disagreements on Session Data\n\n`;
    const nonBaseline = validModels.filter(mr => !mr.error && !mr.model.isBaseline && !mr.model.skipForStats && mr.sessionResults.length > 0);
    for (const mr of nonBaseline) {
      const disagreements = [];
      for (let i = 0; i < Math.min(baseline.sessionResults.length, mr.sessionResults.length); i++) {
        const bResult = baseline.sessionResults[i];
        const mResult = mr.sessionResults[i];
        if (bResult.label !== mResult.label && bResult.label === 'Negative' && bResult.score > 0.80) {
          disagreements.push({
            text: bResult.text,
            baselineLabel: bResult.label,
            baselineScore: bResult.score,
            modelLabel: mResult.label,
            modelScore: mResult.score,
          });
        }
      }
      const top5Dis = disagreements.sort((a, b) => b.baselineScore - a.baselineScore).slice(0, 5);
      if (top5Dis.length > 0) {
        md += `### ${mr.model.shortName} — top disagreements (baseline=Negative, model differs)\n\n`;
        for (const d of top5Dis) {
          md += `- Baseline: ${d.baselineLabel} (${d.baselineScore.toFixed(3)}) → ${mr.model.shortName}: ${d.modelLabel} (${d.modelScore.toFixed(3)})\n`;
          md += `  > "${truncate(d.text, 100)}"\n`;
        }
        md += '\n';
      }
    }
  }

  md += `## Recommendation\n\n`;

  // Find best model by accuracy
  const ranked = validModels
    .filter(mr => !mr.error && !mr.model.skipForStats && mr.testResults.length > 0)
    .map(mr => ({ mr, acc: computeAccuracy(mr.testResults) }))
    .sort((a, b) => b.acc.overall - a.acc.overall);

  const best = ranked[0];
  const baselineAcc = ranked.find(r => r.mr.model.isBaseline);

  if (!best) {
    md += `All models failed to load. **Recommendation: switch to LLM-judge fallback.**\n`;
  } else {
    const painCaseResults = PAIN_CASES.map(painText => {
      const tcIndex = TEST_CASES.findIndex(t => t.text === painText);
      return best.mr.testResults[tcIndex];
    });
    const painCorrect = painCaseResults.filter(r => r?.match).length;
    const baselinePainCorrect = PAIN_CASES.map((painText) => {
      const tcIndex = TEST_CASES.findIndex(t => t.text === painText);
      return baselineAcc?.mr.testResults[tcIndex];
    }).filter(r => r?.match).length;

    if (best.mr.model.isBaseline) {
      md += `**Best model overall: distilbert-multilingual (baseline itself)** with ${best.acc.overall.toFixed(0)}% accuracy.\n\n`;
      md += `No alternative model outperforms the baseline on the full test set. However, the baseline still misclassifies **${3 - baselinePainCorrect}/3 pain cases**.\n\n`;
      md += `**Recommendation: move to LLM-judge fallback** for high-confidence Negative detections (score > 0.85) where context matters. The ONNX models all share the same fundamental bias toward Negative on French text with grammatical negations.\n`;
    } else {
      md += `**Best model: \`${best.mr.model.shortName}\`** with **${best.acc.overall.toFixed(0)}%** accuracy on the test set`;
      if (baselineAcc) {
        md += ` vs ${baselineAcc.acc.overall.toFixed(0)}% for the baseline`;
      }
      md += `.\n\n`;
      md += `Pain case results for \`${best.mr.model.shortName}\`: ${painCorrect}/3 correct`;
      if (baselineAcc) {
        md += ` vs ${baselinePainCorrect}/3 for baseline`;
      }
      md += `.\n\n`;

      if (painCorrect > baselinePainCorrect) {
        md += `**Recommendation: switch to \`${best.mr.model.id}\`** — it fixes ${painCorrect - baselinePainCorrect} of the 3 known pain cases with better overall accuracy.\n`;
      } else {
        md += `**Recommendation: keep baseline or switch to LLM-judge** — the new model scores better overall but does not meaningfully improve on the specific pain cases (descriptive negation + short colloquials) that motivated this test.\n\n`;
        md += `Consider a hybrid: ONNX pre-filter (skip if score < 0.85) + LLM-judge for borderline cases.\n`;
      }
    }
  }

  md += `\n---\n\n*Generated by \`scripts/sentiment-ab-test.mjs\` on ${date}.*\n`;

  return md;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(70));
  console.log('Nakiros Sentiment A/B Test — Multilingual ONNX Models');
  console.log('='.repeat(70));
  console.log(`Models to test: ${MODELS.filter(m => !m.skipForStats).length} (+1 debug variant)`);
  console.log(`Test cases: ${TEST_CASES.length}`);
  console.log(`Model cache: ${modelCacheDir}\n`);

  // Find session
  const session = findBestSession();
  console.log(`Session: ${session.path} (${session.userCount} user messages)`);
  const sessionMessages = parseSession(session.path);
  console.log(`After filtering code-pastes: ${sessionMessages.length} messages to score per model\n`);

  // Run each model sequentially (memory-conscious — one at a time)
  const allResults = [];

  for (const model of MODELS) {
    const result = await runModel(model, sessionMessages);
    allResults.push(result);

    // Force GC between models by nulling references
    // (JS GC doesn't guarantee, but helps reduce peak RSS)
    if (global.gc) global.gc();
  }

  // ---- Print comparison tables ----
  printTestCaseTable(allResults);
  printPainCasesReport(allResults);

  const baseline = allResults.find(r => r.model.isBaseline);
  printSessionReport(allResults, baseline);

  // ---- Performance summary ----
  console.log('\n\n' + '='.repeat(80));
  console.log('PERFORMANCE SUMMARY');
  console.log('='.repeat(80));
  const validModels = allResults.filter(r => !r.model.skipForStats);
  for (const mr of validModels) {
    const p = mr.perfStats;
    if (!p) continue;
    const status = mr.error ? 'ERROR' : 'OK';
    console.log(`\n  ${mr.model.shortName} [${status}]`);
    console.log(`    Cold start   : ${(p.coldStartMs / 1000).toFixed(2)}s`);
    console.log(`    Avg inference: ${(p.avgInferenceMs || 0).toFixed(1)}ms/msg`);
    console.log(`    Download (Δ) : ${fmtBytes(p.downloadedBytes)}`);
    console.log(`    RSS          : ${fmtBytes(p.rssBytes)}`);
    if (mr.error) {
      console.log(`    Error        : ${mr.error}`);
    }
  }

  // ---- Write markdown report ----
  mkdirSync(DOCS_DIR, { recursive: true });
  const reportPath = join(DOCS_DIR, 'ab-test-results-2026-05-12.md');
  const markdown = generateMarkdownReport(allResults, session.path);
  writeFileSync(reportPath, markdown, 'utf8');
  console.log(`\n\nReport written to: ${reportPath}`);
  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
