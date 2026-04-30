import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  FileCode2,
  Sparkles,
  Terminal,
  XCircle,
} from 'lucide-react';
import type {
  AuditRunTurn,
  FixEdit,
  FixEvalResult,
  FixFinding,
  FixTimelineEntry,
} from '@nakiros/shared';
import type { LiveStreamEvent } from '../ConversationTurn';
import ChatMarkdown from './ChatMarkdown';

interface RunStreamProps {
  /** Persisted turns from the run snapshot — used for eval/create only (legacy path). */
  turns: AuditRunTurn[];
  /** Live in-flight events — used for eval/create only (legacy path). */
  liveEvents: LiveStreamEvent[];
  /** Whether the run is currently emitting — adds the "streaming…" tail. */
  isStreaming: boolean;
  /**
   * Unified conversation timeline derived from Claude Code's session
   * jsonl. When provided, it becomes the SOLE source for the conversation
   * rendering — `turns` and `liveEvents` are ignored. Used for fix/audit
   * runs today (eval/create still on the legacy turns+liveEvents path).
   *
   * The variant is `FixTimelineEntry` (the wider union); audit runs only
   * populate the universal `user`/`assistant_text`/`tool` kinds, while
   * fix runs additionally populate `edit`/`finding`/`eval_result`.
   */
  timeline?: FixTimelineEntry[];
  /**
   * Fix-only — click handler for the [diff >] button on `eval_result`
   * cards. Receives the FixEvalResult so the host can open
   * `EvalDiffOverlay` against the right iteration.
   */
  onOpenEvalDiff?(result: FixEvalResult): void;
  /**
   * Fix-only — skill name surfaced in the iteration-recap card header
   * ("TAPUSCRIT-TO-PDF · ITERATION RECAP"). Required when fixTimeline
   * is provided on a fix run.
   */
  skillName?: string;
}

interface RenderedItem {
  /** Stable key for React. */
  key: string;
  /** Optional ISO timestamp — formatted into a 56px mono gutter. */
  timestamp?: string;
  /**
   * Sort key in epoch ms — used to interleave findings (ts) with
   * persisted turns (timestamp) and live events (epoch). Items without
   * a sort key keep their insertion order via a stable fallback.
   */
  sortMs: number;
  /** Rendered body. */
  body: React.ReactNode;
}

/**
 * Streaming chat view for the run screen — port of `StreamView` /
 * `StreamEvent` in `apps/Nakiros-new-design/screens-runs.jsx:125-298`
 * to the OKLch token set.
 *
 * The mockup carries 7 event types (system / tool / assistant /
 * finding / diff / assertion / thinking). The Nakiros daemon currently
 * emits only `text` (assistant) and `tool` events through the live
 * subscription. This component renders both kinds in the same visual
 * language as the mockup; the four "rich" types (finding / diff /
 * assertion / thinking) are not produced by the runner today and will
 * land when the daemon emits them.
 *
 * Persisted turns from the run snapshot are flattened into the same
 * stream so a freshly-opened run renders the prior conversation before
 * the live cursor.
 */
export default function RunStream({
  turns,
  liveEvents,
  isStreaming,
  timeline,
  onOpenEvalDiff,
  skillName,
}: RunStreamProps) {
  const { t } = useTranslation('runs');
  const scrollRef = useRef<HTMLDivElement>(null);
  // Fix and audit runs build their timeline from Claude Code's session
  // jsonl exclusively. Other run kinds keep the legacy turns +
  // liveEvents path until they're ported too.
  const items = timeline
    ? buildItemsFromTimeline(timeline, onOpenEvalDiff, skillName)
    : buildItems(turns, liveEvents);

  // Pin to bottom whenever new content lands.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [items.length]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto bg-n-canvas px-6 py-5">
      <div className="mx-auto flex max-w-[920px] flex-col gap-4">
        {items.map((item) => (
          <div key={item.key} className="flex items-start gap-2.5">
            <TimestampGutter ts={item.timestamp} />
            <div className="min-w-0 flex-1">{item.body}</div>
          </div>
        ))}
        {isStreaming && (
          <div className="mt-1 flex items-center gap-2 font-n-mono text-[11.5px] text-n-faint">
            <span className="n-pulse h-1.5 w-1.5 rounded-full bg-n-accent" />
            {t('streaming', { defaultValue: 'streaming…' })}
            <span className="n-shimmer-bg ml-2 h-px flex-1" />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Item builder ───────────────────────────────────────────────────────────

/**
 * Build the timeline for a fix run from the unified session-jsonl-derived
 * entries. Single source of truth — every kind (user / assistant_text /
 * tool / edit / finding) ships in the same array with its real `ts`,
 * sorted chronologically. No synthetic timestamps, no merging with legacy
 * turns/liveEvents.
 */
function buildItemsFromTimeline(
  timeline: FixTimelineEntry[],
  onOpenEvalDiff?: (result: FixEvalResult) => void,
  skillName?: string,
): RenderedItem[] {
  const out: RenderedItem[] = [];

  timeline.forEach((entry, i) => {
    const ms = tsToMs(entry.ts);
    const sortMs = Number.isFinite(ms) ? ms : i;
    const base = { timestamp: entry.ts, sortMs };
    if (entry.kind === 'user') {
      out.push({ key: `tl-${i}-user`, ...base, body: <UserText text={entry.text} /> });
    } else if (entry.kind === 'assistant_text') {
      out.push({ key: `tl-${i}-text`, ...base, body: <AssistantText text={entry.text} /> });
    } else if (entry.kind === 'tool') {
      out.push({
        key: `tl-${i}-tool`,
        ...base,
        body: <ToolBox name={entry.name} display={entry.display} />,
      });
    } else if (entry.kind === 'edit') {
      out.push({ key: `tl-${i}-edit`, ...base, body: <FixEditCard edit={entry.edit} /> });
    } else if (entry.kind === 'finding') {
      out.push({ key: `tl-${i}-finding`, ...base, body: <FindingCard finding={entry.finding} /> });
    } else if (entry.kind === 'eval_result') {
      out.push({
        key: `tl-${i}-eval`,
        ...base,
        body: (
          <EvalResultCard
            result={entry.result}
            skillName={skillName}
            onOpenDiff={
              onOpenEvalDiff ? () => onOpenEvalDiff(entry.result) : undefined
            }
          />
        ),
      });
    }
  });

  out.sort((a, b) => a.sortMs - b.sortMs);
  return out;
}

function buildItems(
  turns: AuditRunTurn[],
  liveEvents: LiveStreamEvent[],
): RenderedItem[] {
  const out: RenderedItem[] = [];

  // Each persisted turn becomes one or more items based on its blocks.
  turns.forEach((turn, ti) => {
    const ts = turn.timestamp;
    // Fall back to the turn's index so the sort still orders runs that have
    // missing or malformed timestamps coherently (rare, but seen on legacy
    // runs persisted before the timestamp field stabilised).
    const parsed = tsToMs(ts);
    const ms = Number.isFinite(parsed) ? parsed : ti;
    if (turn.role === 'user') {
      out.push({
        key: `t${ti}-user`,
        timestamp: ts,
        sortMs: ms,
        body: <UserText text={turn.content ?? ''} />,
      });
      return;
    }
    // Assistant turn: text body + tool calls (if any).
    const hasText = !!turn.content && turn.content.trim() !== '';
    const hasTools = !!turn.tools && turn.tools.length > 0;
    if (hasText) {
      out.push({
        key: `t${ti}-assistant`,
        timestamp: ts,
        sortMs: ms,
        body: <AssistantText text={turn.content!} />,
      });
    }
    if (hasTools) {
      turn.tools!.forEach((tool, toolIdx) => {
        out.push({
          key: `t${ti}-tool-${toolIdx}`,
          timestamp: ts,
          // Same epoch as the parent turn — order within the turn is
          // preserved by insertion (stable sort).
          sortMs: ms,
          body: <ToolBox name={tool.name} display={tool.display} />,
        });
      });
    }
    // Surface a placeholder for assistant turns that produced neither
    // text nor tool calls. Without this the chat looks like only the
    // user message exists, even though the run did complete a turn —
    // exactly the "no AI reply visible" bug Thomas hit on a baseline
    // run where claude had nothing to say.
    if (!hasText && !hasTools && turn.role === 'assistant') {
      out.push({
        key: `t${ti}-empty`,
        timestamp: ts,
        sortMs: ms,
        body: <EmptyAssistantPlaceholder />,
      });
    }
  });

  // Live events for the in-flight turn.
  liveEvents.forEach((ev, li) => {
    if (ev.type === 'text') {
      out.push({
        key: `live-${li}-text`,
        timestamp: tsFromEpoch(ev.ts),
        sortMs: ev.ts,
        body: <AssistantText text={ev.text} />,
      });
    } else if (ev.type === 'tool') {
      out.push({
        key: `live-${li}-tool`,
        timestamp: tsFromEpoch(ev.ts),
        sortMs: ev.ts,
        body: <ToolBox name={ev.name} display={ev.display} />,
      });
    }
  });

  // Stable sort by sortMs — preserves insertion order for items that
  // share the same epoch (a turn's text + its tool calls, for instance).
  out.sort((a, b) => a.sortMs - b.sortMs);
  return out;
}

// ── Renderers ──────────────────────────────────────────────────────────────

function AssistantText({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-n-xs bg-n-accent-soft text-n-accent">
        <Sparkles size={13} strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <ChatMarkdown content={text} />
      </div>
    </div>
  );
}

function EmptyAssistantPlaceholder() {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-n-xs bg-n-sunken text-n-faint">
        <Sparkles size={13} strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1 text-[12.5px] italic text-n-faint">
        (no assistant reply — the run completed without producing text or tool calls)
      </div>
    </div>
  );
}

function UserText({ text }: { text: string }) {
  return (
    <div className="rounded-n-md border border-n-border-subtle bg-n-surface px-3.5 py-2 text-[13px] leading-relaxed text-n-fg">
      {text}
    </div>
  );
}

/**
 * Inline iteration-recap card emitted by the daemon when a fix-eval batch
 * (`runFixEvalsInTemp`) finishes. Single card per batch — mirrors the hero
 * block of `EvalRunRecap` (TAPUSCRIT-TO-PDF · ITERATION RECAP /
 * "+5% pass rate vs iter 7" / "3 eval(s) — aucune régression vs run
 * précédent."). Tone is driven by the absolute pass rate AND any
 * regression count: a high pass rate with a regression still bumps to
 * orange so the user notices the regression instead of the green badge.
 *
 * The diff button is rendered only when a previous iteration exists —
 * otherwise there's nothing to compare to.
 */
/**
 * Inline iteration-recap card emitted by the daemon when a fix-eval batch
 * (`runFixEvalsInTemp`) finishes. Reuses the **exact** hero block from
 * `EvalRunRecap` (same layout, same Tailwind classes, same icons) so the
 * inline chat card matches the full-screen recap visually 1:1.
 */
const EVAL_HERO_TONE_CLASS: Record<
  'good' | 'warn' | 'bad',
  { surface: string; badge: string }
> = {
  good: {
    surface: 'border-n-healthy/30 bg-n-healthy-soft/40',
    badge: 'bg-n-healthy/20 text-n-healthy',
  },
  warn: {
    surface: 'border-n-watch/30 bg-n-watch-soft/40',
    badge: 'bg-n-watch/20 text-n-watch',
  },
  bad: {
    surface: 'border-n-critical/30 bg-n-critical-soft/40',
    badge: 'bg-n-critical/20 text-n-critical',
  },
};

function EvalResultCard({
  result,
  skillName,
  onOpenDiff,
}: {
  result: FixEvalResult;
  skillName?: string;
  onOpenDiff?: () => void;
}) {
  const passRate = result.total > 0 ? result.passed / result.total : 0;
  const prevRate =
    result.previous && result.previous.total > 0
      ? result.previous.passed / result.previous.total
      : null;
  const delta = prevRate !== null ? passRate - prevRate : null;
  const regressionsList = result.previous?.regressions ?? [];

  // Same exact tone rules as `EvalRunRecap.pickHeroTone` so the inline
  // fix-timeline card matches the full-screen recap. Bands:
  //  - >= 75% → good (the fix is materially better)
  //  - > 0%   → warn (some tests pass, more work to do)
  //  - 0%     → bad  (every test fails — the fix made nothing pass)
  // A "good" iteration with any regression vs prev is downgraded to
  // "warn" so the user notices the regression instead of the green badge.
  let heroTone: 'good' | 'warn' | 'bad';
  if (passRate >= 0.75) heroTone = 'good';
  else if (passRate > 0) heroTone = 'warn';
  else heroTone = 'bad';
  if (regressionsList.length > 0 && heroTone === 'good') heroTone = 'warn';

  const headerTitle = skillName
    ? `${skillName} · iteration recap`
    : 'iteration recap';

  const heroLabel =
    delta !== null
      ? `${delta >= 0 ? '+' : ''}${Math.round(delta * 100)}% pass rate vs baseline`
      : `${Math.round(passRate * 100)}% pass rate`;

  return (
    <div
      className={
        'flex items-start gap-3.5 rounded-n-lg border px-4 py-3.5 ' +
        EVAL_HERO_TONE_CLASS[heroTone].surface
      }
    >
      <div
        className={
          'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-n-md ' +
          EVAL_HERO_TONE_CLASS[heroTone].badge
        }
      >
        {heroTone === 'good' ? (
          <Check size={18} strokeWidth={2.5} />
        ) : heroTone === 'warn' ? (
          <AlertTriangle size={18} strokeWidth={2.5} />
        ) : (
          <XCircle size={18} strokeWidth={2.5} />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle">
          {headerTitle}
        </span>
        <span className="text-[20px] font-semibold text-n-fg">{heroLabel}</span>
        <span className="text-[12.5px] text-n-muted">
          {regressionsList.length === 0
            ? `${result.evals.length} eval(s) — aucune régression vs run précédent.`
            : `${result.evals.length} eval(s). Régression sur ${regressionsList.join(', ')}.`}
        </span>
      </div>
      {onOpenDiff && result.previous && (
        <button
          type="button"
          onClick={onOpenDiff}
          className="ml-auto flex flex-shrink-0 items-center gap-1 self-center rounded-n-xs px-2 py-1 font-n-mono text-[11.5px] text-n-muted transition-colors hover:bg-n-sunken hover:text-n-fg"
        >
          diff
          <ChevronRight size={12} strokeWidth={2.25} />
        </button>
      )}
    </div>
  );
}

/**
 * Inline finding card surfaced when the fix-runner observes a new line in
 * `outputs/fix-findings.jsonl`. Mirrors the amber "BOUNDARY_MISSING" cards
 * in the new-design mockup. The agent emits `code` + `title` + optional
 * `detail` per discovery; we render the code as a mono uppercase label
 * along the left border, then title + (optional) detail.
 */
function FindingCard({ finding }: { finding: FixFinding }) {
  return (
    <div
      className="rounded-n-md border border-n-border-subtle bg-n-watch-soft px-3 py-2.5"
      style={{ borderLeft: '3px solid var(--n-watch)' }}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle
          size={13}
          strokeWidth={2.25}
          className="mt-0.5 flex-shrink-0 text-n-watch"
        />
        <div className="min-w-0 flex-1">
          <div
            className="font-n-mono text-[10px] font-semibold uppercase tracking-[0.6px] text-n-watch"
          >
            FINDING · {finding.code}
          </div>
          <div className="mt-1 text-[12.5px] leading-snug text-n-fg">{finding.title}</div>
          {finding.detail && (
            <div className="mt-1 text-[11.5px] leading-snug text-n-muted">{finding.detail}</div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Inline diff card surfaced when the agent issues a `Write` / `Edit` /
 * `MultiEdit` tool call during a fix run. Shows the file path, change
 * counts, and a unified diff of the before/after content.
 *
 * Long edits (>20 changed lines) collapse to a "Show full diff" toggle
 * to keep the timeline scannable. The collapsed view shows the first
 * ~16 changed lines.
 */
function FixEditCard({ edit }: { edit: FixEdit }) {
  const lines = computeDiffLines(edit.before, edit.after);
  const added = lines.filter((l) => l.kind === 'add').length;
  const removed = lines.filter((l) => l.kind === 'remove').length;

  return (
    <div className="overflow-hidden rounded-n-md border border-n-border-subtle bg-n-sunken">
      <div className="flex items-center gap-2.5 border-b border-n-border-subtle px-3 py-2 font-n-mono text-[11.5px]">
        <FileCode2 size={12} strokeWidth={2} className="flex-shrink-0 text-n-violet" />
        <span className="flex-shrink-0 rounded-n-xs bg-n-violet-soft px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.4px] text-n-violet">
          {edit.kind === 'write' ? 'Write' : 'Edit'}
        </span>
        <span className="min-w-0 flex-1 truncate text-n-fg" title={edit.path}>
          {edit.displayPath}
        </span>
        <span className="flex flex-shrink-0 items-center gap-1.5 text-[10.5px] tabular-nums">
          {added > 0 && <span className="text-n-healthy">+{added}</span>}
          {removed > 0 && <span className="text-n-critical">−{removed}</span>}
        </span>
      </div>
      <DiffLines lines={lines} />
    </div>
  );
}

function DiffLines({ lines }: { lines: DiffLine[] }) {
  const [expanded, setExpanded] = useState(false);
  const COLLAPSED_MAX = 16;
  const isLong = lines.length > COLLAPSED_MAX;
  const visible = expanded || !isLong ? lines : lines.slice(0, COLLAPSED_MAX);
  const hidden = lines.length - visible.length;

  return (
    <div>
      <pre className="overflow-x-auto bg-n-canvas px-0 py-1.5 font-n-mono text-[11px] leading-[1.45]">
        {visible.map((line, i) => (
          <div
            key={i}
            className={
              line.kind === 'add'
                ? 'bg-n-healthy-soft text-n-fg'
                : line.kind === 'remove'
                  ? 'bg-n-critical-soft text-n-fg'
                  : 'text-n-muted'
            }
          >
            <span
              className={
                'inline-block w-6 select-none px-2 text-right text-[10px] ' +
                (line.kind === 'add'
                  ? 'text-n-healthy'
                  : line.kind === 'remove'
                    ? 'text-n-critical'
                    : 'text-n-faint')
              }
            >
              {line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' '}
            </span>
            <span className="whitespace-pre">{line.text || ' '}</span>
          </div>
        ))}
      </pre>
      {hidden > 0 && (
        <button
          onClick={() => setExpanded((x) => !x)}
          className="block w-full border-t border-n-border-subtle bg-n-surface px-3 py-1.5 text-left font-n-mono text-[10.5px] text-n-muted transition-colors hover:bg-n-raised hover:text-n-fg"
        >
          {expanded
            ? `Hide ${hidden} additional line${hidden === 1 ? '' : 's'}`
            : `Show ${hidden} more line${hidden === 1 ? '' : 's'}`}
        </button>
      )}
    </div>
  );
}

interface DiffLine {
  kind: 'add' | 'remove' | 'context';
  text: string;
}

/**
 * Trivial line-level diff: emit every `before` line as `remove`, then every
 * `after` line as `add`. Good enough for the agent's typical patterns
 * (Write = full new content, Edit = small replacement) without pulling in
 * a diff library. Collapsed empty before → pure `add` block.
 */
function computeDiffLines(before: string, after: string): DiffLine[] {
  const out: DiffLine[] = [];
  if (before) {
    for (const text of before.split('\n')) out.push({ kind: 'remove', text });
  }
  if (after) {
    for (const text of after.split('\n')) out.push({ kind: 'add', text });
  }
  return out;
}

function ToolBox({ name, display }: { name: string; display: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-n-md border border-n-border-subtle bg-n-sunken px-3 py-2 font-n-mono text-[12px]">
      <Terminal size={13} strokeWidth={2} className="flex-shrink-0 text-n-accent" />
      <span className="flex-shrink-0 text-n-accent">{name}</span>
      <span className="min-w-0 flex-1 truncate text-n-muted">{display}</span>
    </div>
  );
}

function SystemLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5 font-n-mono text-[11.5px] text-n-faint">
      <span className="h-1.5 w-1.5 rounded-full bg-n-faint" />
      <span className="min-w-0 flex-1">{text}</span>
    </div>
  );
}

function TimestampGutter({ ts }: { ts?: string }) {
  return (
    <span className="w-14 flex-shrink-0 pt-0.5 font-n-mono tabular-nums text-[10.5px] text-n-faint">
      {ts ? formatHHMMSS(ts) : ''}
    </span>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatHHMMSS(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function tsFromEpoch(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

/**
 * Parse an ISO timestamp into epoch ms for stable sort. Returns
 * `Number.NaN` on invalid input so callers can fall back to a sentinel.
 */
function tsToMs(ts?: string): number {
  if (!ts) return Number.NaN;
  const ms = new Date(ts).getTime();
  return Number.isFinite(ms) ? ms : Number.NaN;
}

