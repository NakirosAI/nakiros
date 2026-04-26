import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, FileText, FlaskConical, Folder, Search } from 'lucide-react';
import type { Project, Skill } from '@nakiros/shared';

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
      <header className="flex items-center justify-between gap-4 border-b border-n-border-subtle px-7 pt-5 pb-4">
        <div>
          <h1 className="m-0 font-n-mono text-[18px] font-medium text-n-fg">
            {t('skillsTitle', { defaultValue: 'Skills' })}
          </h1>
          <div className="mt-1 font-n-mono text-[11.5px] text-n-faint">
            {skills
              ? t('skillsCount', { count: skills.length, defaultValue: '{{count}} skill(s)' })
              : t('common:loading', { defaultValue: 'Loading…' })}
          </div>
        </div>
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
      </header>

      <div className="flex-1 overflow-y-auto px-7 py-6">
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((skill) => (
              <SkillCard key={skill.name} skill={skill} onOpen={() => onOpenSkill(skill.name)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SkillCard({ skill, onOpen }: { skill: Skill; onOpen(): void }) {
  const description = useMemo(() => extractDescription(skill.content), [skill.content]);
  const iterationCount = skill.evals?.iterations.length ?? 0;
  const refsCount = skill.files.length;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col gap-3 rounded-n-lg border border-n-border-subtle bg-n-surface p-4 text-left transition-colors hover:border-n-accent-line hover:bg-n-raised"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-n-mono text-[14px] font-medium text-n-fg">
            {skill.name}
          </div>
          <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-snug text-n-muted">
            {description || <span className="text-n-faint italic">no description</span>}
          </p>
        </div>
        <ChevronRight
          size={14}
          strokeWidth={2}
          className="mt-0.5 flex-shrink-0 text-n-faint transition-colors group-hover:text-n-accent"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2.5 font-n-mono text-[10.5px] text-n-subtle">
        <Badge icon={<FlaskConical size={10} strokeWidth={2.25} />}>
          {skill.evals?.definitions.length ?? 0} evals
        </Badge>
        <Badge icon={<Folder size={10} strokeWidth={2.25} />}>{skill.auditCount} audits</Badge>
        <Badge icon={<FileText size={10} strokeWidth={2.25} />}>{refsCount} files</Badge>
        {iterationCount > 0 && <Badge>iter {iterationCount}</Badge>}
      </div>
    </button>
  );
}

function Badge({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-n-xs border border-n-border-subtle bg-n-sunken px-1.5 py-0.5 text-n-muted">
      {icon}
      {children}
    </span>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

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
