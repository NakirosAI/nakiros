import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bot,
  Check,
  ChevronRight,
  FileText,
  Flame,
  Layers,
  MessageSquare,
  Plug,
  Settings2,
  ShieldCheck,
  Sliders,
  Sparkles,
  Zap,
} from 'lucide-react';
import type {
  AgentCapability,
  AgentProvider,
  Project,
  ProjectAgentInstallation,
} from '@nakiros/shared';
import type { ProjectTabView } from '../hooks/useTabs';

interface Props {
  project: Project;
  onNavigate(view: ProjectTabView, agentKey: string): void;
  selectedAgentKey?: string;
  onSelectedAgentChange?(key: string): void;
}

interface ConfigurationTarget {
  capability: AgentCapability;
  view: ProjectTabView;
  icon: ReactNode;
}

const CLAUDE_CONFIGURATION: ConfigurationTarget[] = [
  { capability: 'instructions', view: 'claudeMd', icon: <FileText size={16} /> },
  { capability: 'rules', view: 'rules', icon: <Layers size={16} /> },
  { capability: 'subagents', view: 'subagents', icon: <Bot size={16} /> },
  { capability: 'skills', view: 'skills', icon: <Sparkles size={16} /> },
  { capability: 'output-styles', view: 'outputStyles', icon: <Sliders size={16} /> },
  { capability: 'permissions', view: 'permissions', icon: <ShieldCheck size={16} /> },
  { capability: 'mcp', view: 'mcp', icon: <Plug size={16} /> },
  { capability: 'hooks', view: 'hooks', icon: <Zap size={16} /> },
];

const CODEX_CONFIGURATION: ConfigurationTarget[] = [
  { capability: 'instructions', view: 'claudeMd', icon: <FileText size={16} /> },
  { capability: 'rules', view: 'rules', icon: <Layers size={16} /> },
  { capability: 'subagents', view: 'subagents', icon: <Bot size={16} /> },
  { capability: 'skills', view: 'skills', icon: <Sparkles size={16} /> },
  { capability: 'hooks', view: 'hooks', icon: <Zap size={16} /> },
  { capability: 'permissions', view: 'permissions', icon: <ShieldCheck size={16} /> },
  { capability: 'mcp', view: 'mcp', icon: <Plug size={16} /> },
  { capability: 'native-config', view: 'codexConfig', icon: <Settings2 size={16} /> },
];

function projectInstallations(project: Project): ProjectAgentInstallation[] {
  if (project.agents?.length) return project.agents;
  if (project.provider === 'cowork') return [];
  return [{
    provider: project.provider as AgentProvider,
    surface: 'cli',
    providerProjectDir: project.providerProjectDir,
    capabilities: project.provider === 'claude'
      ? [
          'instructions', 'skills', 'rules', 'subagents', 'hooks', 'permissions',
          'mcp', 'output-styles', 'conversations',
        ]
      : project.provider === 'codex'
        ? [
            'instructions', 'skills', 'rules', 'subagents', 'hooks', 'permissions',
            'mcp', 'native-config', 'conversations',
          ]
        : ['conversations'],
  }];
}

export default function HestiaScreen({
  project,
  onNavigate,
  selectedAgentKey,
  onSelectedAgentChange,
}: Props) {
  const { t } = useTranslation('hestia');
  const installations = useMemo(() => projectInstallations(project), [project]);
  const [selectedInstallationKey, setSelectedInstallationKey] = useState(
    selectedAgentKey ?? (installations[0]
      ? `${installations[0].provider}:${installations[0].surface}`
      : 'claude:cli'),
  );
  const selected = installations.find(
    (item) => `${item.provider}:${item.surface}` === selectedInstallationKey,
  )
    ?? installations[0];
  const configurationTargets = (
    selected?.provider === 'claude'
      ? CLAUDE_CONFIGURATION
      : selected?.provider === 'codex'
        ? CODEX_CONFIGURATION
        : []
  ).filter((target) => selected?.capabilities.includes(target.capability));

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-n-canvas font-n-sans">
      <header className="border-b border-n-border-subtle px-7 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <Flame size={19} strokeWidth={2} className="text-n-accent-strong" />
              <h1 className="m-0 font-n-mono text-[18px] font-medium text-n-fg">
                {t('title')}
              </h1>
            </div>
            <p className="mt-1.5 max-w-[70ch] text-[13px] leading-5 text-n-muted">
              {t('subtitle', { project: project.name })}
            </p>
          </div>
          {installations.length > 1 && (
            <div
              role="group"
              className="inline-flex items-center gap-1 rounded-n-md border border-n-border-subtle bg-n-sunken p-0.5"
              aria-label={t('agentSelector')}
            >
              {installations.map((installation) => (
                <button
                  key={`${installation.provider}:${installation.surface}`}
                  type="button"
                  onClick={() => {
                    const key = `${installation.provider}:${installation.surface}`;
                    setSelectedInstallationKey(key);
                    onSelectedAgentChange?.(key);
                  }}
                  aria-pressed={selectedInstallationKey === `${installation.provider}:${installation.surface}`}
                  className={'min-h-8 rounded-n-xs px-3 py-1.5 font-n-mono text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-n-accent ' +
                    (selectedInstallationKey === `${installation.provider}:${installation.surface}`
                      ? 'bg-n-raised text-n-fg'
                      : 'text-n-muted hover:text-n-fg')}
                >
                  {t(`providers.${installation.provider}`)}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-7 py-6">
        {!selected ? (
          <div className="rounded-n-md border border-dashed border-n-border-default px-5 py-8 text-center text-[13px] text-n-muted">
            {t('empty')}
          </div>
        ) : (
          <div className="mx-auto max-w-5xl">
            <section aria-labelledby="hestia-agent-heading">
              <div className="flex flex-wrap items-start justify-between gap-5 border-b border-n-border-subtle pb-5">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-n-md border border-n-accent-line bg-n-accent-soft text-n-accent-strong">
                      <Bot size={16} strokeWidth={2} />
                    </span>
                    <div>
                      <h2 id="hestia-agent-heading" className="m-0 font-n-mono text-[15px] font-medium text-n-fg">
                        {t(`providers.${selected.provider}`)}
                      </h2>
                      <div className="font-n-mono text-[10.5px] uppercase tracking-[1px] text-n-subtle">
                        {t(`surfaces.${selected.surface}`)}
                      </div>
                    </div>
                  </div>
                  <p className="m-0 max-w-[65ch] text-[13px] leading-5 text-n-muted">
                    {t('agentDescription', { provider: t(`providers.${selected.provider}`) })}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-n-md border border-n-healthy/30 bg-n-healthy-soft px-2.5 py-1.5 font-n-mono text-[10.5px] text-n-healthy">
                  <Check size={12} strokeWidth={2.5} />
                  {t('detected')}
                </span>
              </div>

              <div className="py-5">
                <h3 className="m-0 font-n-mono text-[10.5px] uppercase tracking-[1.2px] text-n-subtle">
                  {t('capabilitiesTitle')}
                </h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selected.capabilities.map((capability) => (
                    <span
                      key={capability}
                      className="rounded-n-xs border border-n-border-subtle bg-n-sunken px-2.5 py-1.5 font-n-mono text-[10.5px] text-n-muted"
                    >
                      {t(`capabilities.${capability}`)}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <section className="border-t border-n-border-subtle pt-5" aria-labelledby="hestia-config-heading">
              <div className="mb-3">
                <h3 id="hestia-config-heading" className="m-0 font-n-mono text-[12px] font-medium text-n-fg">
                  {t('configurationTitle')}
                </h3>
                <p className="mt-1 text-[12.5px] text-n-muted">
                  {configurationTargets.length > 0 ? t('configurationHint') : t('nativeEditingPending')}
                </p>
              </div>

              {configurationTargets.length > 0 ? (
                <div className="overflow-hidden rounded-n-md border border-n-border-default bg-n-surface">
                  {configurationTargets.map((target) => (
                    <button
                      key={target.view}
                      type="button"
                        onClick={() => onNavigate(
                          target.view,
                          `${selected.provider}:${selected.surface}`,
                        )}
                      className="flex w-full items-center gap-3 border-b border-n-border-subtle px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-n-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-n-accent"
                    >
                      <span className="text-n-subtle">{target.icon}</span>
                      <span className="flex-1 text-[13px] text-n-fg">
                        {t(`capabilities.${target.capability}`)}
                      </span>
                      <ChevronRight size={15} className="text-n-faint" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-n-md border border-n-border-subtle bg-n-surface px-4 py-3.5">
                  <MessageSquare size={16} className="mt-0.5 flex-none text-n-subtle" />
                  <p className="m-0 max-w-[70ch] text-[12.5px] leading-5 text-n-muted">
                    {t('providerReadOnly', { provider: t(`providers.${selected.provider}`) })}
                  </p>
                </div>
              )}
            </section>

            {installations.length > 1 && (
              <section className="mt-6 border-t border-n-border-subtle pt-5" aria-labelledby="hestia-coherence-heading">
                <h3 id="hestia-coherence-heading" className="m-0 font-n-mono text-[12px] font-medium text-n-fg">
                  {t('coherenceTitle')}
                </h3>
                <p className="mt-1 max-w-[70ch] text-[12.5px] leading-5 text-n-muted">
                  {t('coherenceHint')}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {installations.map((installation) => (
                    <span key={`${installation.provider}:${installation.surface}`} className="rounded-n-xs border border-n-border-subtle px-2.5 py-1 font-n-mono text-[10.5px] text-n-muted">
                      {t(`providers.${installation.provider}`)}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
