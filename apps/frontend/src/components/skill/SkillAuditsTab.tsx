import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, FileText, Search } from 'lucide-react';
import type { AuditHistoryEntry, SkillScope } from '@nakiros/shared';
import type { TFunction } from 'i18next';
import { MarkdownViewer } from '../ui';

interface Props {
  scope: SkillScope;
  projectId?: string;
  pluginName?: string;
  skillName: string;
}

export default function SkillAuditsTab({ scope, projectId, pluginName, skillName }: Props) {
  const { t } = useTranslation('audit');
  const [history, setHistory] = useState<AuditHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AuditHistoryEntry | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    window.nakiros
      .listAuditHistory({ scope, projectId, pluginName, skillName })
      .then((entries) => {
        if (!mounted) return;
        setHistory(entries);
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [scope, projectId, pluginName, skillName]);

  async function openAudit(entry: AuditHistoryEntry) {
    setSelected(entry);
    setLoadingContent(true);
    const text = await window.nakiros.readAuditReport(entry.path);
    setContent(text);
    setLoadingContent(false);
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">
        {t('history.loading')}
      </div>
    );
  }

  if (selected) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-2">
          <button
            onClick={() => {
              setSelected(null);
              setContent(null);
            }}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft size={16} />
          </button>
          <FileText size={14} className="text-[var(--text-muted)]" />
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {selected.fileName}
          </span>
          <span className="ml-auto text-xs text-[var(--text-muted)]">
            {new Date(selected.timestamp).toLocaleString()}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {loadingContent ? (
            <div className="text-center text-[var(--text-muted)]">{t('history.loadingReport')}</div>
          ) : content ? (
            <div className="mx-auto max-w-[900px]">
              <MarkdownViewer content={content} />
            </div>
          ) : (
            <div className="text-center text-[var(--text-muted)]">{t('history.reportError')}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-4 flex items-center gap-2">
        <Search size={16} className="text-[var(--primary)]" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {t('history.heading', { count: history.length })}
        </h3>
      </div>
      {history.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[var(--line-strong)] px-4 py-3.5 text-[13px] text-[var(--text-muted)]">
          {t('history.emptyPrefix')}<strong>{t('history.emptyBold')}</strong>{t('history.emptySuffix')}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {history.map((entry) => (
            <button
              key={entry.fileName}
              onClick={() => openAudit(entry)}
              className="flex w-full items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--bg-card)] px-4 py-3 text-left transition-colors hover:border-[var(--primary)]"
            >
              <FileText size={14} className="shrink-0 text-[var(--text-muted)]" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-[var(--text-primary)]">
                  {entry.fileName}
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  {new Date(entry.timestamp).toLocaleString()}
                </div>
              </div>
              <span className="shrink-0 text-xs text-[var(--text-muted)]">
                {formatBytes(entry.sizeBytes, t)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatBytes(n: number, t: TFunction<'audit'>): string {
  if (n < 1024) return t('history.size.bytes', { count: n });
  if (n < 1024 * 1024) return t('history.size.kb', { value: (n / 1024).toFixed(1) });
  return t('history.size.mb', { value: (n / (1024 * 1024)).toFixed(1) });
}
