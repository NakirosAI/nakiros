import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlaskConical, Plus, Search, ShieldCheck } from 'lucide-react';
import type { Project, Skill } from '@nakiros/shared';
import SkillCard, { extractSkillDescription } from '../components/skill/SkillCard';

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
        extractSkillDescription(s.content).toLowerCase().includes(q),
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

