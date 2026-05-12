/**
 * Sentiment Pre-pass POC — V1.2 Nakiros
 *
 * Validates @xenova/transformers + Xenova/distilbert-base-multilingual-cased-sentiments-student
 * against real Claude Code session JSONL messages.
 *
 * Run: pnpm -F @nakirosai/nakiros sentiment-poc
 *
 * The script:
 * 1. Sets model cache to ~/.nakiros/models/ (local-first)
 * 2. Loads the model (download on first run, cache on subsequent runs)
 * 3. Reads a real session.jsonl, extracts user text messages
 * 4. Filters code-pasted messages (>40% non-alpha OR ``` blocks)
 * 5. Scores each remaining message
 * 6. Prints a results table + perf metrics
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { pipeline, env } from '@xenova/transformers';

// ---------------------------------------------------------------------------
// Configure model cache to ~/.nakiros/models/ (local-first)
// ---------------------------------------------------------------------------
const modelCacheDir = join(homedir(), '.nakiros', 'models');
env.cacheDir = modelCacheDir;
// Allow remote download (HF Hub), disable local-only mode
env.allowRemoteModels = true;
env.allowLocalModels = true;

const MODEL_ID = 'Xenova/distilbert-base-multilingual-cased-sentiments-student';
const JSONL_PATH = findBestSession();

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function findBestSession() {
  const projectDir = join(
    homedir(),
    '.claude/projects/-Users-thomasailleaume-Perso-timetrackerAgent'
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
    } catch {
      // skip unreadable files
    }
  }

  if (!best) {
    console.error('ERROR: No JSONL sessions found in', projectDir);
    process.exit(1);
  }

  console.log(`Using session: ${best} (${bestCount} user lines)\n`);
  return best;
}

/** Returns the text content of a user message (string or content blocks). */
function extractUserText(message) {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const textBlock = content.find((b) => b?.type === 'text');
    return textBlock?.text ?? '';
  }
  return '';
}

/** Returns true if this message looks like pasted code and should be skipped. */
function isCodePaste(text) {
  if (text.includes('```')) return true;
  const alphaChars = (text.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
  const nonAlpha = text.length - alphaChars;
  return text.length > 0 && nonAlpha / text.length > 0.4;
}

/** Truncate a string to maxLen chars for display, keeping meaningful content. */
function truncate(s, maxLen = 60) {
  const clean = s.replace(/\n/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1) + '…';
}

/** Format bytes to human-readable string. */
function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Sum of recursive dir size in bytes. */
function dirSize(dirPath) {
  if (!existsSync(dirPath)) return 0;
  let total = 0;
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const full = join(dirPath, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else total += statSync(full).size;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Parse session JSONL → extract user messages
// ---------------------------------------------------------------------------

function parseSession(jsonlPath) {
  const lines = readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean);
  const results = [];
  let msgIndex = 0;

  for (const line of lines) {
    try {
      const record = JSON.parse(line);
      if (record.type !== 'user') continue;

      const text = extractUserText(record.message);
      if (!text || text.length < 5) continue;

      msgIndex++;
      const skipped = isCodePaste(text);
      results.push({ index: msgIndex, text, skipped });
    } catch {
      // malformed line — skip
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Nakiros Sentiment POC — V1.2 ===\n');

  // ---- Measure model cache size before download ----
  const cacheSizeBefore = dirSize(join(modelCacheDir, 'Xenova'));

  // ---- Load model (cold start timing) ----
  console.log(`Loading model: ${MODEL_ID}`);
  console.log(`Cache dir: ${modelCacheDir}\n`);

  const loadStart = performance.now();
  let classifier;
  try {
    classifier = await pipeline('text-classification', MODEL_ID, {
      cache_dir: modelCacheDir,
      // Use quantized ONNX model (smaller download)
      quantized: true,
    });
  } catch (err) {
    console.error('ERROR loading model:', err.message);
    process.exit(1);
  }
  const loadEnd = performance.now();
  const coldStartMs = loadEnd - loadStart;

  // ---- Measure cache size after download ----
  const cacheSizeAfter = dirSize(join(modelCacheDir, 'Xenova'));
  const downloadedBytes = cacheSizeAfter - cacheSizeBefore;

  // ---- RSS after model load ----
  const memRss = process.memoryUsage().rss;

  console.log(`Cold start: ${(coldStartMs / 1000).toFixed(2)}s`);
  console.log(`Model cache size: ${fmtBytes(cacheSizeAfter)} (downloaded this run: ${fmtBytes(downloadedBytes)})`);
  console.log(`RSS after load: ${fmtBytes(memRss)}\n`);

  // ---- Parse session ----
  const messages = parseSession(JSONL_PATH);
  const toScore = messages.filter((m) => !m.skipped);
  const skippedCount = messages.filter((m) => m.skipped).length;

  console.log(`Messages extracted: ${messages.length} total, ${toScore.length} to score, ${skippedCount} skipped (code paste)\n`);

  // ---- Score messages ----
  const inferenceTimings = [];
  const scored = [];

  for (const msg of toScore) {
    const t0 = performance.now();
    let result;
    try {
      result = await classifier(msg.text, { topk: 1 });
    } catch (err) {
      // Some messages may fail (too long etc.) — log and skip
      scored.push({ ...msg, label: 'ERROR', score: 0, errorMsg: err.message });
      continue;
    }
    const t1 = performance.now();
    inferenceTimings.push(t1 - t0);

    const top = Array.isArray(result) ? result[0] : result;
    scored.push({
      ...msg,
      label: top.label ?? 'UNKNOWN',
      score: top.score ?? 0,
    });
  }

  // ---- Build full results table (scored + skipped) ----
  const allResults = messages.map((msg) => {
    if (msg.skipped) return { ...msg, label: '-', score: 0 };
    return scored.find((s) => s.index === msg.index) ?? { ...msg, label: '-', score: 0 };
  });

  // ---- Print table ----
  const COL = {
    idx: 5,
    excerpt: 62,
    label: 22,
    score: 7,
    status: 8,
  };

  const header = [
    'Idx'.padEnd(COL.idx),
    'Excerpt'.padEnd(COL.excerpt),
    'Label'.padEnd(COL.label),
    'Score'.padEnd(COL.score),
    'Status',
  ].join(' | ');

  const separator = '-'.repeat(header.length);

  console.log('=== Results table ===\n');
  console.log(header);
  console.log(separator);

  for (const r of allResults) {
    const status = r.skipped ? 'SKIP' : r.errorMsg ? 'ERROR' : 'OK';
    const row = [
      String(r.index).padEnd(COL.idx),
      truncate(r.text, COL.excerpt).padEnd(COL.excerpt),
      (r.label ?? '-').padEnd(COL.label),
      r.score > 0 ? r.score.toFixed(3) : '     -',
      status,
    ].join(' | ');
    console.log(row);
  }

  // ---- Perf summary ----
  const avgInferenceMs =
    inferenceTimings.length > 0
      ? inferenceTimings.reduce((a, b) => a + b, 0) / inferenceTimings.length
      : 0;

  console.log('\n=== Performance summary ===\n');
  console.log(`  Cold start (model load) : ${(coldStartMs / 1000).toFixed(2)}s`);
  console.log(`  Download this run       : ${fmtBytes(downloadedBytes)} (total cache: ${fmtBytes(cacheSizeAfter)})`);
  console.log(`  RSS after model load    : ${fmtBytes(memRss)}`);
  console.log(`  Messages scored         : ${scored.filter((s) => !s.errorMsg).length}`);
  console.log(`  Avg inference           : ${avgInferenceMs.toFixed(1)}ms/msg`);
  console.log(`  Total inference time    : ${(inferenceTimings.reduce((a, b) => a + b, 0) / 1000).toFixed(2)}s`);

  // ---- Sentiment distribution ----
  const dist = {};
  for (const r of scored) {
    if (!r.skipped && !r.errorMsg) {
      dist[r.label] = (dist[r.label] ?? 0) + 1;
    }
  }
  console.log('\n=== Label distribution ===\n');
  for (const [label, count] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / toScore.length) * 100).toFixed(1);
    console.log(`  ${label.padEnd(20)} ${count.toString().padStart(4)} (${pct}%)`);
  }

  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
