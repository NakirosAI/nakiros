import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Info, X } from 'lucide-react';
import { MarkdownViewer } from '../../components/ui/MarkdownViewer';
import type {
  AgentEntry,
  ClaudeConfigSnapshot,
  CommandEntry,
  HookEventGroup,
  McpServerEntry,
  OutputStyleEntry,
  ResolvedField,
  RuleEntry,
  SettingsInfo,
} from '@nakiros/shared';

export type ClaudeConfigCategoryKey =
  | 'claudeMd'
  | 'settings'
  | 'rules'
  | 'skills'
  | 'commands'
  | 'outputStyles'
  | 'agents'
  | 'mcp'
  | 'hooks';

interface ClaudeConfigDrawerProps {
  categoryKey: ClaudeConfigCategoryKey;
  snapshot: ClaudeConfigSnapshot;
  projectId: string;
  onClose(): void;
  onOpenSkillsTab(): void;
}

/**
 * Slide-in right drawer that drills into a single `.claude/` category. The
 * body component is picked from `categoryKey`. Closes on Escape or
 * overlay click; tab-trapping is intentionally light for V1.
 */
export default function ClaudeConfigDrawer({
  categoryKey,
  snapshot,
  projectId,
  onClose,
  onOpenSkillsTab,
}: ClaudeConfigDrawerProps) {
  const { t } = useTranslation('claude-config');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const label = t(`categories.${categoryKey}.label`);
  const blurb = t(`categories.${categoryKey}.blurb`);

  return (
    <>
      <button
        type="button"
        aria-label={t('drawer.close')}
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-black/40"
      />
      <aside
        role="dialog"
        aria-label={label}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[760px] flex-col border-l border-n-border-default bg-n-surface shadow-n-pop"
      >
        <header className="flex items-center justify-between border-b border-n-border-subtle px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[17px] font-semibold text-n-fg">{label}</h2>
            <div className="mt-0.5 text-[12px] text-n-muted">{blurb}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('drawer.close')}
            className="ml-3 flex h-7 w-7 items-center justify-center rounded-n-sm border border-n-border-subtle bg-transparent text-n-muted hover:bg-n-canvas"
          >
            <X size={14} />
          </button>
        </header>
        <div className="flex-1 overflow-auto">
          <DrawerBody
            categoryKey={categoryKey}
            snapshot={snapshot}
            projectId={projectId}
            onOpenSkillsTab={onOpenSkillsTab}
          />
        </div>
      </aside>
    </>
  );
}

function DrawerBody({
  categoryKey,
  snapshot,
  projectId,
  onOpenSkillsTab,
}: {
  categoryKey: ClaudeConfigCategoryKey;
  snapshot: ClaudeConfigSnapshot;
  projectId: string;
  onOpenSkillsTab(): void;
}) {
  switch (categoryKey) {
    case 'claudeMd':
      return <ClaudeMdBody data={snapshot.claudeMd} projectId={projectId} />;
    case 'settings':
      return <SettingsBody data={snapshot.settings} />;
    case 'rules':
      return <RulesBody items={snapshot.rules.items} totalTokens={snapshot.rules.totalTokens} />;
    case 'skills':
      return <SkillsBody count={snapshot.skills.count} onOpenSkillsTab={onOpenSkillsTab} />;
    case 'commands':
      return <CommandsBody items={snapshot.commands.items} />;
    case 'outputStyles':
      return <OutputStylesBody items={snapshot.outputStyles.items} />;
    case 'agents':
      return <AgentsBody items={snapshot.agents.items} />;
    case 'mcp':
      return (
        <McpBody
          items={snapshot.mcp.items}
          present={snapshot.mcp.present}
          parseError={snapshot.mcp.parseError}
        />
      );
    case 'hooks':
      return <HooksBody events={snapshot.hooks.events} count={snapshot.hooks.count} />;
  }
}

// ── shared helpers ────────────────────────────────────────────────────────-
function InfoBlurb({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-6 mt-4 flex items-start gap-2 rounded-n-md border border-n-accent-line bg-n-accent-soft/50 px-3 py-2.5 text-[12px] leading-relaxed text-n-muted">
      <Info size={14} className="mt-px flex-shrink-0 text-n-accent-strong" />
      <span className="text-pretty">{children}</span>
    </div>
  );
}

function SectionTitle({
  children,
  count,
  hint,
}: {
  children: React.ReactNode;
  count?: number | string;
  hint?: string;
}) {
  return (
    <div className="px-6 pb-2 pt-5">
      <h3 className="m-0 flex items-baseline gap-1.5 text-[13px] font-semibold tracking-tight text-n-fg">
        {children}
        {count != null && (
          <span className="font-n-mono text-[12px] font-normal text-n-subtle">{count}</span>
        )}
      </h3>
      {hint && <div className="mt-0.5 text-pretty text-[11.5px] leading-relaxed text-n-muted">{hint}</div>}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-6 my-6 rounded-n-md border border-dashed border-n-border-default bg-n-canvas px-4 py-5 text-center text-[12px] text-n-muted">
      {children}
    </div>
  );
}

function KpiTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2.5">
      <div className="font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">{label}</div>
      <div className="mt-1 font-n-mono text-[16px] font-semibold text-n-fg">{value}</div>
    </div>
  );
}

function MonoBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-n-sm border border-n-border-subtle bg-n-canvas px-1.5 py-0.5 font-n-mono text-[11px] text-n-muted">
      {children}
    </span>
  );
}

function SourceBadge({ source }: { source: ResolvedField<unknown>['source'] }) {
  const { t } = useTranslation('claude-config');
  const tone =
    source === 'local'
      ? 'bg-[oklch(0.78_0.10_240_/_0.18)] text-[oklch(0.40_0.10_240)]'
      : source === 'project'
        ? 'bg-n-canvas text-n-muted'
        : 'bg-n-canvas text-n-faint italic';
  const label = t(`settingsBody.source${capitalize(source)}`);
  return (
    <span
      className={
        'inline-flex items-center rounded-n-sm px-1.5 py-0.5 font-n-mono text-[10px] uppercase tracking-[0.7px] ' +
        tone
      }
    >
      {label}
    </span>
  );
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

// ── CLAUDE.md ─────────────────────────────────────────────────────────────-
function ClaudeMdBody({
  data,
  projectId,
}: {
  data: ClaudeConfigSnapshot['claudeMd'];
  projectId: string;
}) {
  const { t } = useTranslation('claude-config');
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'loaded'; content: string } | { kind: 'error' }
  >({ kind: 'loading' });

  useEffect(() => {
    if (!data.present) return;
    let cancelled = false;
    const rel = computeRelFromProject(data.path);
    window.nakiros
      .readClaudeConfigFile(projectId, rel)
      .then((c) => {
        if (cancelled) return;
        if (typeof c === 'string') setState({ kind: 'loaded', content: c });
        else setState({ kind: 'error' });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [data.present, data.path, projectId]);

  if (!data.present) {
    return <EmptyHint>{t('claudeMdBody.absent')}</EmptyHint>;
  }
  return (
    <div>
      <InfoBlurb>{t('claudeMdBody.intro')}</InfoBlurb>
      <div className="px-6 pt-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <KpiTile label={t('claudeMdBody.tokens')} value={formatNumber(data.tokens)} />
          <KpiTile label={t('claudeMdBody.lines')} value={data.lines} />
          <KpiTile label={t('claudeMdBody.sections')} value={data.headings.length} />
          <KpiTile label={t('claudeMdBody.lastEdit')} value={formatDate(data.lastModified)} />
        </div>
      </div>
      {data.headings.length > 0 && (
        <>
          <SectionTitle count={data.headings.length}>{t('claudeMdBody.sections')}</SectionTitle>
          <div className="flex flex-wrap gap-1.5 px-6 pb-3">
            {data.headings.map((h) => (
              <MonoBadge key={h}>{h}</MonoBadge>
            ))}
          </div>
        </>
      )}
      <SectionTitle>{t('claudeMdBody.preview')}</SectionTitle>
      <div className="mx-6 mb-6">
        {state.kind === 'loaded' ? (
          <MarkdownViewer
            content={state.content}
            className="max-h-[480px] rounded-n-md border border-n-border-subtle bg-n-canvas"
          />
        ) : state.kind === 'loading' ? (
          <div className="rounded-n-md border border-n-border-subtle bg-n-canvas px-4 py-6 text-center font-n-mono text-[11.5px] text-n-subtle">
            …
          </div>
        ) : (
          <ParseError text={t('settingsBody.parseError', { error: 'read failed' })} />
        )}
      </div>
    </div>
  );
}

function computeRelFromProject(absolutePath: string): string {
  // Best-effort: keep everything from `.claude/` onwards, or the trailing segment.
  const idx = absolutePath.lastIndexOf('/.claude/');
  if (idx !== -1) return absolutePath.slice(idx + 1);
  // CLAUDE.md at the project root
  if (absolutePath.endsWith('/CLAUDE.md')) return 'CLAUDE.md';
  return absolutePath;
}

// ── Settings ──────────────────────────────────────────────────────────────-
function SettingsBody({ data }: { data: SettingsInfo }) {
  const { t } = useTranslation('claude-config');
  const [showRaw, setShowRaw] = useState(false);

  if (!data.present) {
    return <EmptyHint>{t('settingsBody.absent')}</EmptyHint>;
  }
  const eff = data.effective;
  return (
    <div>
      <InfoBlurb>{t('settingsBody.intro')}</InfoBlurb>
      <div className="px-6 pt-4">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="font-n-mono text-[10.5px] uppercase tracking-[1.1px] text-n-subtle">
            {t('settingsBody.effective')}
          </div>
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="rounded-n-sm border border-n-border-subtle bg-transparent px-2 py-1 font-n-mono text-[11px] text-n-muted hover:bg-n-canvas"
          >
            {showRaw ? t('drawer.viewResolved') : t('drawer.viewRaw')}
          </button>
        </div>
        {!showRaw ? (
          <SettingsResolvedView data={data} eff={eff} />
        ) : (
          <SettingsRawView data={data} />
        )}
      </div>
      <div className="h-6" />
    </div>
  );
}

function SettingsResolvedView({
  data,
  eff,
}: {
  data: SettingsInfo;
  eff: SettingsInfo['effective'];
}) {
  const { t } = useTranslation('claude-config');
  return (
    <>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <ResolvedField
          label={t('settingsBody.model')}
          value={eff.model.value ?? '—'}
          source={eff.model.source}
          mono
        />
        <ResolvedField
          label={t('settingsBody.allow')}
          value={t('settingsBody.entries', { count: eff.permissions.allowCount.value })}
          source={eff.permissions.allowCount.source}
        />
        <ResolvedField
          label={t('settingsBody.deny')}
          value={t('settingsBody.entries', { count: eff.permissions.denyCount.value })}
          source={eff.permissions.denyCount.source}
        />
        <ResolvedField
          label={t('settingsBody.env')}
          value={t('settingsBody.variables', { count: eff.envCount.value })}
          source={eff.envCount.source}
        />
        <ResolvedField
          label={t('settingsBody.hooks')}
          value={t('settingsBody.entries', { count: eff.hookCount.value })}
          source={eff.hookCount.source}
        />
        <ResolvedField
          label={t('settingsBody.outputStyle')}
          value={eff.outputStyle.value ?? '—'}
          source={eff.outputStyle.source}
          mono
        />
      </div>

      <div className="mt-5">
        <div className="mb-2 font-n-mono text-[10.5px] uppercase tracking-[1.1px] text-n-subtle">
          {t('settingsBody.permissionsDetail')}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PermsBlock
            title={t('settingsBody.allow')}
            tone="healthy"
            items={
              data.local.data?.permissions?.allow ?? data.project.data?.permissions?.allow ?? []
            }
          />
          <PermsBlock
            title={t('settingsBody.deny')}
            tone="critical"
            items={
              data.local.data?.permissions?.deny ?? data.project.data?.permissions?.deny ?? []
            }
          />
        </div>
      </div>

      {eff.localOverrides.length > 0 && (
        <div className="mt-5 rounded-n-md border border-n-accent-line bg-n-accent-soft/50 px-3 py-2.5">
          <div className="mb-1 flex items-center gap-1.5 font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-accent-strong">
            <Info size={12} />
            {t('settingsBody.localOverride')}
          </div>
          <div className="text-pretty text-[12px] leading-relaxed text-n-muted">
            {t('settingsBody.localOverrideDetail', {
              count: eff.localOverrides.length,
              fields: eff.localOverrides.join(', '),
            })}
          </div>
        </div>
      )}
    </>
  );
}

function ResolvedField({
  label,
  value,
  source,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  source: ResolvedField<unknown>['source'];
  mono?: boolean;
}) {
  return (
    <div className="rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
          {label}
        </span>
        <SourceBadge source={source} />
      </div>
      <div
        className={
          'text-[13.5px] font-medium text-n-fg ' + (mono ? 'font-n-mono' : 'font-n-sans')
        }
      >
        {value}
      </div>
    </div>
  );
}

function PermsBlock({
  title,
  tone,
  items,
}: {
  title: string;
  tone: 'healthy' | 'critical';
  items: string[];
}) {
  const borderClass = tone === 'healthy' ? 'border-l-n-accent-line' : 'border-l-[oklch(0.74_0.16_25)]';
  return (
    <div>
      <div className="mb-1.5 font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
        {title}
      </div>
      {items.length === 0 ? (
        <div className="text-[11.5px] italic text-n-faint">—</div>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((p, i) => (
            <div
              key={`${p}-${i}`}
              className={
                'break-all rounded-n-sm border-l-[3px] bg-n-canvas px-2 py-1 font-n-mono text-[11.5px] text-n-muted ' +
                borderClass
              }
            >
              {p}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsRawView({ data }: { data: SettingsInfo }) {
  const { t } = useTranslation('claude-config');
  return (
    <div>
      <div className="mb-1.5 font-n-mono text-[10.5px] uppercase tracking-[1.1px] text-n-subtle">
        {t('settingsBody.rawProject')}
      </div>
      {data.project.parseError ? (
        <ParseError text={data.project.parseError} />
      ) : (
        <RawJson data={data.project.data} />
      )}
      {data.local.present && (
        <>
          <div className="mb-1.5 mt-4 font-n-mono text-[10.5px] uppercase tracking-[1.1px] text-n-subtle">
            {t('settingsBody.rawLocal')}
          </div>
          {data.local.parseError ? (
            <ParseError text={data.local.parseError} />
          ) : (
            <RawJson data={data.local.data} />
          )}
        </>
      )}
    </div>
  );
}

function RawJson({ data }: { data: unknown }) {
  return (
    <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-all rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2.5 font-n-mono text-[11px] leading-relaxed text-n-muted">
      {data == null ? '—' : JSON.stringify(data, null, 2)}
    </pre>
  );
}

function ParseError({ text }: { text: string }) {
  const { t } = useTranslation('claude-config');
  return (
    <div className="rounded-n-md border border-[oklch(0.74_0.16_25_/_0.4)] bg-[oklch(0.74_0.16_25_/_0.08)] px-3 py-2 font-n-mono text-[11px] text-[oklch(0.50_0.16_25)]">
      {t('settingsBody.parseError', { error: text })}
    </div>
  );
}

// ── Rules ─────────────────────────────────────────────────────────────────-
function RulesBody({ items, totalTokens }: { items: RuleEntry[]; totalTokens: number }) {
  const { t } = useTranslation('claude-config');
  if (items.length === 0) {
    return <EmptyHint>{t('rulesBody.absent')}</EmptyHint>;
  }
  return (
    <div>
      <InfoBlurb>{t('rulesBody.intro')}</InfoBlurb>
      <SectionTitle
        count={items.length}
        hint={t('rulesBody.totalTokens', { tokens: formatNumber(totalTokens) })}
      >
        {t('categories.rules.label')}
      </SectionTitle>
      <div className="flex flex-col gap-2 px-6 pb-6">
        {items.map((r) => (
          <div
            key={r.relativePath}
            className="rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2.5"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate font-n-mono text-[12.5px] text-n-fg">{r.name}</span>
              <span className="flex-shrink-0 font-n-mono text-[10.5px] text-n-subtle">
                {r.tokens} tok · {formatDate(r.lastModified)}
              </span>
            </div>
            {r.summary && (
              <div className="mb-2 text-pretty text-[12px] leading-relaxed text-n-muted">
                {r.summary}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {r.paths.length === 0 ? (
                <MonoBadge>{t('rulesBody.alwaysOn')}</MonoBadge>
              ) : (
                r.paths.map((p) => <MonoBadge key={p}>{p}</MonoBadge>)
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Skills (gateway) ──────────────────────────────────────────────────────-
function SkillsBody({
  count,
  onOpenSkillsTab,
}: {
  count: number;
  onOpenSkillsTab(): void;
}) {
  const { t } = useTranslation('claude-config');
  return (
    <div>
      <InfoBlurb>{t('skillsBody.intro')}</InfoBlurb>
      <div className="px-6 pt-4">
        {count === 0 ? (
          <EmptyHint>{t('skillsBody.absent')}</EmptyHint>
        ) : (
          <div className="rounded-n-md border border-n-border-subtle bg-n-canvas px-4 py-3 text-[12.5px] text-n-muted">
            {t('categories.skills.noun', { count })}
          </div>
        )}
        <button
          type="button"
          onClick={onOpenSkillsTab}
          className="mt-4 inline-flex items-center gap-1.5 rounded-n-sm border border-n-accent-line bg-n-accent-soft px-3 py-1.5 font-n-mono text-[11.5px] text-n-accent-strong hover:bg-n-accent-soft/80"
        >
          <ArrowUpRight size={12} />
          {t('skillsBody.openSkillsTab')}
        </button>
      </div>
    </div>
  );
}

// ── Commands ──────────────────────────────────────────────────────────────-
function CommandsBody({ items }: { items: CommandEntry[] }) {
  const { t } = useTranslation('claude-config');
  if (items.length === 0) {
    return <EmptyHint>{t('commandsBody.absent')}</EmptyHint>;
  }
  return (
    <div>
      <InfoBlurb>{t('commandsBody.intro')}</InfoBlurb>
      <SectionTitle count={items.length}>{t('categories.commands.label')}</SectionTitle>
      <div className="flex flex-col gap-1.5 px-6 pb-6">
        {items.map((c) => (
          <div
            key={c.relativePath}
            className="rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2"
          >
            <div className="mb-0.5 flex items-center gap-2">
              <span className="font-n-mono text-[13px] text-n-accent-strong">/{c.name}</span>
              {c.argumentHint && (
                <span className="font-n-mono text-[11.5px] text-n-subtle">{c.argumentHint}</span>
              )}
            </div>
            {c.description && (
              <div className="text-[11.5px] leading-snug text-n-muted">{c.description}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Output styles ─────────────────────────────────────────────────────────-
function OutputStylesBody({ items }: { items: OutputStyleEntry[] }) {
  const { t } = useTranslation('claude-config');
  if (items.length === 0) {
    return <EmptyHint>{t('outputStylesBody.absent')}</EmptyHint>;
  }
  return (
    <div>
      <InfoBlurb>{t('outputStylesBody.intro')}</InfoBlurb>
      <SectionTitle count={items.length}>{t('categories.outputStyles.label')}</SectionTitle>
      <div className="flex flex-col gap-2 px-6 pb-6">
        {items.map((s) => (
          <div
            key={s.relativePath}
            className="rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2.5"
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="font-n-mono text-[13px] text-n-fg">{s.name}</span>
              {s.keepCodingInstructions && (
                <MonoBadge>{t('outputStylesBody.keepCoding')}</MonoBadge>
              )}
            </div>
            {s.description && (
              <div className="text-pretty text-[12px] leading-relaxed text-n-muted">
                {s.description}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Subagents ─────────────────────────────────────────────────────────────-
function AgentsBody({ items }: { items: AgentEntry[] }) {
  const { t } = useTranslation('claude-config');
  if (items.length === 0) {
    return <EmptyHint>{t('agentsBody.absent')}</EmptyHint>;
  }
  return (
    <div>
      <InfoBlurb>{t('agentsBody.intro')}</InfoBlurb>
      <SectionTitle count={items.length}>{t('categories.agents.label')}</SectionTitle>
      <div className="flex flex-col gap-2 px-6 pb-6">
        {items.map((a) => (
          <div
            key={a.relativePath}
            className="rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2.5"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-n-mono text-[13px] text-n-fg">{a.name}</span>
              {a.model && <MonoBadge>{a.model}</MonoBadge>}
            </div>
            {a.description && (
              <div className="mb-2 text-pretty text-[12px] leading-relaxed text-n-muted">
                {a.description}
              </div>
            )}
            {a.tools.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
                  {t('agentsBody.tools')}
                </span>
                {a.tools.map((tool) => (
                  <MonoBadge key={tool}>{tool}</MonoBadge>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MCP ───────────────────────────────────────────────────────────────────-
function McpBody({
  items,
  present,
  parseError,
}: {
  items: McpServerEntry[];
  present: boolean;
  parseError: string | undefined;
}) {
  const { t } = useTranslation('claude-config');
  if (!present) {
    return <EmptyHint>{t('mcpBody.absent')}</EmptyHint>;
  }
  if (parseError) {
    return (
      <div className="px-6 pt-4">
        <ParseError text={t('mcpBody.parseError', { error: parseError })} />
      </div>
    );
  }
  return (
    <div>
      <InfoBlurb>{t('mcpBody.intro')}</InfoBlurb>
      <SectionTitle count={items.length}>{t('categories.mcp.label')}</SectionTitle>
      <div className="flex flex-col gap-2 px-6 pb-6">
        {items.map((m) => (
          <div
            key={m.name}
            className="rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2.5"
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="font-n-mono text-[13px] font-medium text-n-fg">{m.name}</span>
              {m.transport && <MonoBadge>{m.transport}</MonoBadge>}
            </div>
            {m.command && (
              <div className="mb-1.5 break-all rounded-n-sm bg-n-raised px-2 py-1 font-n-mono text-[11px] text-n-muted">
                $ {m.command}
                {m.args.length > 0 ? ' ' + m.args.join(' ') : ''}
              </div>
            )}
            {m.url && (
              <div className="mb-1.5 break-all rounded-n-sm bg-n-raised px-2 py-1 font-n-mono text-[11px] text-n-muted">
                {m.url}
              </div>
            )}
            {m.envKeys.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
                  {t('mcpBody.envKeys')}
                </span>
                {m.envKeys.map((k) => (
                  <MonoBadge key={k}>{k}</MonoBadge>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Hooks ─────────────────────────────────────────────────────────────────-
function HooksBody({ events, count }: { events: HookEventGroup[]; count: number }) {
  const { t } = useTranslation('claude-config');
  return (
    <div>
      <InfoBlurb>{t('hooksBody.intro')}</InfoBlurb>
      <SectionTitle>
        {t('hooksBody.summary', { count, events: events.length })}
      </SectionTitle>
      <div className="relative px-6 pb-6">
        <div className="absolute bottom-4 left-[36px] top-2 w-px bg-n-border-subtle" />
        <div className="flex flex-col gap-2">
          {events.map((ev) => (
            <div key={ev.event} className="relative z-10 flex gap-3">
              <div
                className={
                  'mt-2 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 font-n-mono text-[10px] font-semibold ' +
                  (ev.active
                    ? 'border-n-accent-line bg-n-accent-soft text-n-accent-strong'
                    : 'border-n-border-subtle bg-n-canvas text-n-subtle')
                }
              >
                {ev.items.length || ''}
              </div>
              <div
                className={
                  'flex-1 rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2 ' +
                  (ev.active ? '' : 'opacity-60')
                }
              >
                <div className="mb-0.5 flex items-center justify-between">
                  <span className="font-n-mono text-[12.5px] font-medium text-n-fg">
                    {ev.event}
                  </span>
                  {!ev.active && (
                    <span className="font-n-mono text-[10.5px] text-n-subtle">
                      {t('hooksBody.noHook')}
                    </span>
                  )}
                </div>
                <div className="text-pretty text-[11.5px] leading-relaxed text-n-muted">
                  {t(`hooksBody.events.${ev.event}`)}
                </div>
                {ev.items.map((h, i) => (
                  <div
                    key={i}
                    className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-n-sm border border-n-border-subtle bg-n-surface px-2 py-1.5 font-n-mono text-[11px]"
                  >
                    {h.matcher && <MonoBadge>{h.matcher}</MonoBadge>}
                    <span className="text-n-subtle">→</span>
                    <SourceBadge source={h.source} />
                    <span className="block w-full break-all text-n-muted">{h.command}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
