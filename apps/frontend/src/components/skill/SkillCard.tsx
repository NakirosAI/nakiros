import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import type { Skill, SkillFileEntry } from '@nakiros/shared';
import ScoreRing from '../viz/ScoreRing';
import Sparkline from '../viz/Sparkline';

interface SkillCardProps {
  skill: Skill;
  onOpen(): void;
}

/**
 * Reusable skill card matching the new-design mockup. Used by the
 * project Skills list and by the marketplace screen — anywhere a
 * `Skill` should render with a 52px ScoreRing on the right + a
 * sparkline footer summarising trend / counts.
 *
 * Score is `Math.round(skill.evals.latestPassRate × 100)` and falls
 * back to a dashed "no eval" placeholder when no eval has run.
 * Trend is the per-iteration pass rate read straight from
 * `skill.evals.iterations[]` (oldest → newest, left → right).
 *
 * The `refs` count is derived from `skill.files`: we walk the
 * `references/` subfolder and count the files reachable through it.
 */
export default function SkillCard({ skill, onOpen }: SkillCardProps) {
  const description = useMemo(() => extractSkillDescription(skill.content), [skill.content]);
  const iterationCount = skill.evals?.iterations.length ?? 0;
  const evalCount = skill.evals?.definitions.length ?? 0;
  const refsCount = useMemo(() => countRefsFiles(skill.files), [skill.files]);

  const latest = skill.evals?.latestPassRate;
  const score = typeof latest === 'number' ? Math.round(latest * 100) : null;

  const trend = useMemo(
    () => (skill.evals?.iterations ?? []).map((it) => Math.round(it.withSkill.passRate * 100)),
    [skill],
  );

  const sparkColor =
    score === null
      ? 'var(--n-fg-faint)'
      : score >= 80
        ? 'var(--n-healthy)'
        : score >= 60
          ? 'var(--n-accent)'
          : 'var(--n-watch)';
  const sparkFill =
    score === null
      ? 'oklch(0.96 0.005 240 / 0.04)'
      : score >= 80
        ? 'var(--n-healthy-soft)'
        : score >= 60
          ? 'var(--n-accent-soft)'
          : 'var(--n-watch-soft)';

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex flex-col gap-0 rounded-n-lg border border-n-border-subtle bg-n-surface p-4 text-left transition-colors hover:border-n-border-strong"
    >
      <div className="flex items-start justify-between gap-3.5">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <Sparkles size={13} strokeWidth={2.25} className="flex-shrink-0 text-n-accent" />
            <strong className="truncate font-n-mono text-[13.5px] font-medium text-n-fg">
              {skill.name}
            </strong>
          </div>
          <p className="m-0 line-clamp-2 text-[12px] leading-relaxed text-n-muted">
            {description || <span className="italic text-n-faint">no description</span>}
          </p>
        </div>
        {score !== null ? (
          <ScoreRing value={score} max={100} size={52} />
        ) : (
          <div className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-full border border-dashed border-n-border-default text-center font-n-mono text-[10px] leading-tight text-n-faint">
            no
            <br />
            eval
          </div>
        )}
      </div>

      <div className="mt-3.5 flex items-center gap-2.5 border-t border-n-border-subtle pt-3 font-n-mono text-[11px] tabular-nums text-n-muted">
        <span>
          <span className="text-n-faint">iter</span> {iterationCount}
        </span>
        <span className="text-n-faint">·</span>
        <span>{evalCount} evals</span>
        <span className="text-n-faint">·</span>
        <span>{skill.auditCount} audits</span>
        <span className="text-n-faint">·</span>
        <span>{refsCount} refs</span>
        <span className="flex-1" />
        {trend.length > 0 ? (
          <Sparkline
            data={trend}
            width={72}
            height={20}
            stroke={sparkColor}
            fill={sparkFill}
          />
        ) : (
          <span className="text-[10.5px] text-n-faint">no trend</span>
        )}
      </div>
    </button>
  );
}

// ── Shared helpers (exported for callers that want to filter/search) ──────

/**
 * Extract a short description from a skill's `SKILL.md` content —
 * looks for `description:` in the YAML frontmatter, falls back to
 * the first paragraph. Returns an empty string when nothing usable
 * is found.
 */
export function extractSkillDescription(content: string): string {
  if (!content) return '';

  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const desc = fmMatch[1]!.match(/^description:\s*(["']?)(.*?)\1\s*$/m);
    if (desc && desc[2]) return desc[2].trim();
    const body = content.slice(fmMatch[0].length).trim();
    const firstPara = body.split(/\n\s*\n/)[0]?.replace(/^#+\s*/, '').trim() ?? '';
    if (firstPara) return firstPara;
  }

  const firstPara = content.split(/\n\s*\n/)[0]?.replace(/^#+\s*/, '').trim() ?? '';
  return firstPara;
}

function countRefsFiles(entries: SkillFileEntry[]): number {
  const refs = entries.find((e) => e.isDirectory && /^references$/i.test(e.name));
  if (!refs?.children) return 0;
  let count = 0;
  const walk = (list: SkillFileEntry[]) => {
    for (const item of list) {
      if (item.isDirectory && item.children) walk(item.children);
      else if (!item.isDirectory) count++;
    }
  };
  walk(refs.children);
  return count;
}
