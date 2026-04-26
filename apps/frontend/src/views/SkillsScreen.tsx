import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlaskConical, Play, Plus, Search, ShieldCheck, Sparkles } from 'lucide-react';
import type { Project, Skill, SkillFileEntry } from '@nakiros/shared';
import ScoreRing from '../components/viz/ScoreRing';
import Sparkline from '../components/viz/Sparkline';

interface Props {
  /** Project whose `.claude/skills/` directory is listed. */
  project: Project;
  /** Activated when the user picks a skill — opens the detail view. */
  onOpenSkill(skillName: string): void;
}

/**
 * New-design Skills list — port of the `SkillsScreen` block in
 * `apps/Nakiros-new-design/screens-skills.jsx`. Renders a grid of
 * skill cards so the user can drill into a {@link SkillDetailScreen}.
 *
 * Skills are loaded from `window.nakiros.listProjectSkills(projectId)`.
 * Description and other frontmatter fields are not exposed by the
 * channel — we parse them out of `Skill.content` (the SKILL.md raw
 * source) with a minimal regex. Falls back to the first non-frontmatter
 * line when no description is present.
 *
 * Out of scope here: skill creation, audit/eval/fix actions inline.
 * Those run from inside the SkillDetailScreen tabs (audit shipped in
 * PR4, evals/fix/files/iterations follow in PR5–PR8).
 */
export default function SkillsScreen({ project, onOpenSkill }: Props) {
  const { t } = useTranslation('skills');
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setSkills(null);
    setError(null);
    window.nakiros
      .listProjectSkills(project.id)
      .then((list) => {
        if (cancelled) return;
        setSkills(list);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const filtered = useMemo(() => {
    if (!skills) return null;
    if (!query.trim()) return skills;
    const q = query.toLowerCase();
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        extractDescription(s.content).toLowerCase().includes(q),
    );
  }, [skills, query]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden font-n-sans">
      {/* Top bar: title + count + bulk actions */}
      <header className="flex items-center justify-between gap-4 border-b border-n-border-subtle px-7 py-3.5">
        <h2 className="m-0 text-[15px] font-semibold text-n-fg">
          {t('skillsTitle', { defaultValue: 'Skills' })}{' '}
          {skills && (
            <span className="font-n-mono text-[12px] font-normal text-n-faint">· {skills.length}</span>
          )}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          <ToolbarButton icon={<ShieldCheck size={11} strokeWidth={2} />} label="Audit all" />
          <ToolbarButton icon={<FlaskConical size={11} strokeWidth={2} />} label="Run evals" />
          <ToolbarButton
            icon={<Plus size={11} strokeWidth={2.25} />}
            label={t('newSkill', { defaultValue: 'Nouveau skill' })}
            primary
          />
        </div>
      </header>

      {/* Search row */}
      <div className="flex items-center gap-3 border-b border-n-border-subtle px-7 py-2.5">
        <div className="relative">
          <Search
            size={13}
            strokeWidth={2}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-n-subtle"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder', { defaultValue: 'Search skills…' })}
            className="h-7 w-64 rounded-n-sm border border-n-border-subtle bg-n-sunken pl-7 pr-2.5 font-n-mono text-[12px] text-n-fg placeholder:text-n-faint focus:border-n-accent-line focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-7 py-5">
        {error && (
          <div className="rounded-n-md border border-n-critical bg-n-critical-soft px-4 py-3 font-n-mono text-[12px] text-n-critical">
            {error}
          </div>
        )}

        {!error && skills === null && (
          <div className="font-n-mono text-[12px] text-n-muted">{t('common:loading', { defaultValue: 'Loading…' })}</div>
        )}

        {!error && filtered && filtered.length === 0 && (
          <div className="rounded-n-md border border-dashed border-n-border-default bg-n-surface p-10 text-center font-n-mono text-[12.5px] text-n-muted">
            {query
              ? t('noMatch', { defaultValue: 'No skill matches your search.' })
              : t('emptyState', { defaultValue: 'This project has no skills yet.' })}
          </div>
        )}

        {filtered && filtered.length > 0 && (
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))' }}>
            {filtered.map((skill) => (
              <SkillCard key={skill.name} skill={skill} onOpen={() => onOpenSkill(skill.name)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  primary = false,
}: {
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled
      className={
        'inline-flex h-7 items-center gap-1.5 rounded-n-sm border px-2.5 font-n-mono text-[11.5px] opacity-60 ' +
        (primary
          ? 'border-n-accent-line bg-n-accent-soft text-n-accent'
          : 'border-n-border-subtle bg-transparent text-n-muted')
      }
    >
      {icon}
      {label}
    </button>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SkillCard({ skill, onOpen }: { skill: Skill; onOpen(): void }) {
  const description = useMemo(() => extractDescription(skill.content), [skill.content]);
  const iterationCount = skill.evals?.iterations.length ?? 0;
  const evalCount = skill.evals?.definitions.length ?? 0;
  const refsCount = useMemo(() => countRefsFiles(skill.files), [skill.files]);

  // Score = latest pass rate × 100 (0–100). Null when no eval has run yet.
  const latest = skill.evals?.latestPassRate;
  const score = typeof latest === 'number' ? Math.round(latest * 100) : null;

  // Trend = pass rate per iteration (oldest → newest left to right).
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
      {/* Top row: name + description / ScoreRing */}
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

      {/* Footer: stats + sparkline */}
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

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Count files inside the skill's `references/` folder. Returns 0 when
 * the folder doesn't exist. Mirrors the mockup's `skill.refs` field
 * (the mockup uses a static count; we derive it from the file tree).
 */
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

/**
 * Extract a description string from a skill's SKILL.md content. Looks
 * for a `description:` field in the YAML frontmatter (delimited by
 * `---` lines). Falls back to the first non-empty paragraph after the
 * frontmatter when missing. Returns an empty string when nothing
 * usable is found — caller decides on the placeholder.
 */
function extractDescription(content: string): string {
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
