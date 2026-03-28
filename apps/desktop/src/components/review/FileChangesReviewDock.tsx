import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, ChevronRight, FilePlus, FileMinus, FilePenLine, X } from 'lucide-react';
import type { FileChange, FileChangesReviewSession } from '@nakiros/shared';
import DiffView from '../context/DiffView.js';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Separator,
} from '../ui/index.js';

function FileStatusBadge({ status }: { status: FileChange['status'] }) {
  if (status === 'created') return <Badge variant="success"><FilePlus className="mr-1 h-3 w-3" />Created</Badge>;
  if (status === 'deleted') return <Badge variant="destructive"><FileMinus className="mr-1 h-3 w-3" />Deleted</Badge>;
  return <Badge variant="info"><FilePenLine className="mr-1 h-3 w-3" />Modified</Badge>;
}

interface FileRowProps {
  change: FileChange;
  isExpanded: boolean;
  onToggle(): void;
  onAccept(): void;
  onReject(): void;
  isMutating: boolean;
}

function FileRow({ change, isExpanded, onToggle, onAccept, onReject, isMutating }: FileRowProps) {
  return (
    <div className="border-b border-[var(--line)] last:border-0">
      <div
        className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-[var(--bg-hover)]"
        onClick={onToggle}
      >
        <span className="text-[var(--text-muted)]">
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
        <FileStatusBadge status={change.status} />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--text-primary)]">
          {change.relativePath}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="xs"
            variant="ghost"
            disabled={isMutating}
            onClick={(e) => { e.stopPropagation(); onAccept(); }}
            title="Accept this change"
          >
            <Check className="h-3.5 w-3.5 text-green-500" />
          </Button>
          <Button
            size="xs"
            variant="ghost"
            disabled={isMutating}
            onClick={(e) => { e.stopPropagation(); onReject(); }}
            title="Revert this change"
          >
            <X className="h-3.5 w-3.5 text-red-500" />
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="max-h-[340px] overflow-auto border-t border-[var(--line)] bg-[var(--bg-base)]">
          {change.status === 'modified' && change.before !== null && change.after !== null ? (
            <DiffView
              baseline={change.before}
              proposed={change.after}
              onAccept={onAccept}
              onReject={onReject}
            />
          ) : (
            <pre className="p-3 font-mono text-xs text-[var(--text-primary)] whitespace-pre-wrap">
              {change.after ?? change.before ?? ''}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  session: FileChangesReviewSession;
  isMutating?: boolean;
  onClose(): void;
  onAcceptAll(): void;
  onRejectAll(): void;
  onAcceptFile(relativePath: string): void;
  onRejectFile(relativePath: string): void;
}

export default function FileChangesReviewDock({
  session,
  isMutating = false,
  onClose,
  onAcceptAll,
  onRejectAll,
  onAcceptFile,
  onRejectFile,
}: Props) {
  const { t } = useTranslation('agent');
  const [expandedPath, setExpandedPath] = useState<string | null>(null);

  const created = session.changes.filter((c) => c.status === 'created').length;
  const modified = session.changes.filter((c) => c.status === 'modified').length;
  const deleted = session.changes.filter((c) => c.status === 'deleted').length;

  return (
    <aside className="flex h-full min-w-[420px] w-[min(46vw,580px)] shrink-0 border-l border-[var(--line)] bg-[var(--bg-soft)] p-3">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader className="gap-3 pb-3">
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <CardTitle className="text-sm">{t('fileChangesReviewTitle', 'Agent file changes')}</CardTitle>
              <div className="flex flex-wrap gap-1.5">
                {created > 0 && <Badge variant="success">{created} {t('fileChangesCreated', 'created')}</Badge>}
                {modified > 0 && <Badge variant="info">{modified} {t('fileChangesModified', 'modified')}</Badge>}
                {deleted > 0 && <Badge variant="destructive">{deleted} {t('fileChangesDeleted', 'deleted')}</Badge>}
              </div>
            </div>
            <Button size="xs" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {session.changes.map((change) => (
              <FileRow
                key={change.relativePath}
                change={change}
                isExpanded={expandedPath === change.relativePath}
                onToggle={() => setExpandedPath((prev) => (prev === change.relativePath ? null : change.relativePath))}
                onAccept={() => onAcceptFile(change.relativePath)}
                onReject={() => onRejectFile(change.relativePath)}
                isMutating={isMutating}
              />
            ))}
          </div>

          <Separator />

          <div className="flex shrink-0 items-center justify-end gap-2 p-3">
            <Button variant="ghost" size="sm" disabled={isMutating} onClick={onRejectAll}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              {t('fileChangesRejectAll', 'Revert all')}
            </Button>
            <Button variant="default" size="sm" disabled={isMutating} onClick={onAcceptAll}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              {t('fileChangesAcceptAll', 'Accept all')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}
