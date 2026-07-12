import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bot,
  Check,
  CheckCircle2,
  FileText,
  Layers,
  Pencil,
  Plug,
  ShieldCheck,
  Sliders,
  Sparkles,
  XCircle,
  Zap,
} from 'lucide-react';
import type { BootstrapEntityProposal, RecommendationArtifactType } from '@nakiros/shared';
import { MarkdownViewer } from '../ui/MarkdownViewer';

interface Props {
  proposal: BootstrapEntityProposal;
  /** Local accept/reject decision — defaults to `accepted` for `pending` proposals (feature doc §2). */
  decision: 'accepted' | 'rejected';
  /** Local inline edit, overriding `proposal.content` until approval. `undefined` = no edit yet. */
  editedContent: string | undefined;
  onToggleDecision(id: string): void;
  onEditContent(id: string, content: string): void;
  /** True once the plan is no longer editable (executing / terminal run). */
  locked: boolean;
}

const ARTIFACT_ICON: Record<RecommendationArtifactType, React.ReactNode> = {
  claudemd: <FileText size={13} strokeWidth={2} />,
  rules: <Layers size={13} strokeWidth={2} />,
  subagent: <Bot size={13} strokeWidth={2} />,
  hook: <Zap size={13} strokeWidth={2} />,
  permission: <ShieldCheck size={13} strokeWidth={2} />,
  mcp: <Plug size={13} strokeWidth={2} />,
  'output-style': <Sliders size={13} strokeWidth={2} />,
  skill: <Sparkles size={13} strokeWidth={2} />,
};

/**
 * One entity proposal from a {@link ProjectBootstrapPlan} — check/uncheck +
 * inline edit before approval, matching the reco-cards UX pattern
 * (`components/recommendations/RecoCard.tsx`) per the feature's plan-review
 * decision (`docs/redesign/features/project-bootstrap.md` §2-3). Diverges
 * from `RecoCard` in two ways: the primary action is a persistent
 * accept/reject toggle (not Apply/Dismiss buttons — the user checks entities
 * across the whole plan before one global Approve), and content is editable
 * inline rather than via a confirm modal, since the plan already gates the
 * write behind the approval step.
 */
export function BootstrapProposalCard({
  proposal,
  decision,
  editedContent,
  onToggleDecision,
  onEditContent,
  locked,
}: Props) {
  const { t } = useTranslation('bootstrap');
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const content = editedContent ?? proposal.content;
  const isRejected = decision === 'rejected';
  const isJsonArtifact =
    proposal.artifactType === 'hook' ||
    proposal.artifactType === 'permission' ||
    proposal.artifactType === 'mcp';

  const executionBadge = proposal.status === 'written' || proposal.status === 'failed';

  return (
    <article
      className={
        'overflow-hidden rounded-n-lg border bg-n-surface transition-opacity ' +
        (isRejected ? 'border-n-border-subtle opacity-60' : 'border-n-border-subtle')
      }
    >
      {/* Header */}
      <header className="flex items-start justify-between gap-2 border-b border-n-border-subtle bg-n-canvas px-3.5 py-2.5">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          {!executionBadge && (
            <button
              type="button"
              disabled={locked}
              onClick={() => onToggleDecision(proposal.id)}
              aria-pressed={!isRejected}
              title={
                isRejected
                  ? t('proposal.acceptTooltip', { defaultValue: 'Include in the plan' })
                  : t('proposal.rejectTooltip', { defaultValue: 'Exclude from the plan' })
              }
              className={
                'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-n-xs border transition-colors ' +
                (isRejected
                  ? 'border-n-border-default bg-transparent text-transparent'
                  : 'border-n-accent-line bg-n-accent-soft text-n-accent') +
                (locked ? ' cursor-not-allowed opacity-60' : ' cursor-pointer')
              }
            >
              <Check size={11} strokeWidth={3} />
            </button>
          )}
          {executionBadge && (
            <span className="mt-0.5 flex-shrink-0">
              {proposal.status === 'written' ? (
                <CheckCircle2 size={15} strokeWidth={2} className="text-n-healthy" />
              ) : (
                <XCircle size={15} strokeWidth={2} className="text-n-critical" />
              )}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-n-xs bg-n-raised px-1.5 py-0.5 font-n-mono text-[10px] uppercase tracking-wide text-n-muted">
                {ARTIFACT_ICON[proposal.artifactType]}
                {proposal.artifactType}
              </span>
              {proposal.target !== 'new' && (
                <span className="min-w-0 break-all font-n-mono text-[11px] text-n-faint">
                  {proposal.target}
                </span>
              )}
            </div>
            <div className="mt-1 text-[13px] text-n-fg">{proposal.title}</div>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {editedContent !== undefined && !executionBadge && (
            <span className="font-n-mono text-[10px] uppercase tracking-wide text-n-accent">
              {t('proposal.edited', { defaultValue: 'edited' })}
            </span>
          )}
          {!locked && !executionBadge && (
            <button
              type="button"
              onClick={() => setMode((m) => (m === 'preview' ? 'edit' : 'preview'))}
              className={
                'inline-flex h-6 items-center gap-1 rounded-n-xs border px-2 font-n-mono text-[10.5px] transition-colors ' +
                (mode === 'edit'
                  ? 'border-n-accent-line bg-n-accent-soft text-n-accent'
                  : 'border-n-border-default bg-transparent text-n-muted hover:bg-n-raised hover:text-n-fg')
              }
            >
              <Pencil size={11} strokeWidth={2} />
              {mode === 'edit'
                ? t('proposal.donePreview', { defaultValue: 'Preview' })
                : t('proposal.edit', { defaultValue: 'Edit' })}
            </button>
          )}
        </div>
      </header>

      {/* Rationale */}
      <div className="border-b border-n-border-subtle px-3.5 py-2">
        <p className="m-0 text-[12px] leading-relaxed text-n-muted">{proposal.rationale}</p>
      </div>

      {/* Content — preview via MarkdownViewer (rule: all displayed markdown
          goes through it) or an inline editable textarea. JSON-shaped
          artefacts (hook/permission/mcp) are wrapped in a fenced code block
          for preview so they get monospace + highlighting. */}
      <div className="px-3.5 py-3">
        {mode === 'edit' ? (
          <textarea
            value={content}
            onChange={(e) => onEditContent(proposal.id, e.target.value)}
            spellCheck={false}
            rows={12}
            className="w-full resize-y whitespace-pre-wrap break-all rounded-n-md border border-n-border-subtle bg-n-canvas p-3 font-n-mono text-[12px] leading-relaxed text-n-fg focus:border-n-accent-line focus:outline-none"
          />
        ) : (
          <div className="max-h-[360px] overflow-y-auto rounded-n-md border border-n-border-subtle bg-n-canvas px-3 py-2.5">
            <MarkdownViewer
              content={isJsonArtifact ? '```json\n' + content + '\n```' : content}
            />
          </div>
        )}
      </div>

      {proposal.status === 'failed' && proposal.error && (
        <div className="mx-3.5 mb-3 rounded-n-sm border border-n-critical bg-n-critical-soft px-2.5 py-1.5 font-n-mono text-[11px] text-n-critical">
          {proposal.error}
        </div>
      )}
      {proposal.status === 'written' && proposal.writtenPath && (
        <div className="mx-3.5 mb-3 break-all font-n-mono text-[10.5px] text-n-faint">
          {t('proposal.writtenTo', { defaultValue: 'Written to' })} {proposal.writtenPath}
        </div>
      )}
    </article>
  );
}
