import { useTranslation } from 'react-i18next';
import { FilePenLine, RefreshCcw, Sparkles, X } from 'lucide-react';
import type { ArtifactReviewSession } from '@nakiros/shared';
import DiffView from '../context/DiffView';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Separator,
} from '../ui';

function describeTarget(session: ArtifactReviewSession): string {
  if (session.target.kind === 'workspace_doc') return session.target.absolutePath;
  return `${session.target.kind} · ${session.target.id}`;
}

interface Props {
  session: ArtifactReviewSession;
  isMutating?: boolean;
  onClose(): void;
  onAccept(): void;
  onReject(): void;
  onAskForChanges(): void;
}

export default function ArtifactReviewDock({
  session,
  isMutating = false,
  onClose,
  onAccept,
  onReject,
  onAskForChanges,
}: Props) {
  const { t } = useTranslation('context');
  const isApplied = session.status === 'applied' || session.mode === 'yolo';

  return (
    <aside className="flex h-full min-w-[420px] w-[min(46vw,580px)] shrink-0 border-l border-[var(--line)] bg-[var(--bg-soft)] p-3">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader className="gap-4 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info">
                  {session.mode === 'diff' ? t('artifactReviewModeDiff') : t('artifactReviewModeYolo')}
                </Badge>
                <Badge variant="muted">{t(`artifactReviewSource.${session.sourceSurface}`)}</Badge>
                <Badge variant={isApplied ? 'warning' : 'success'}>
                  {isApplied ? t('artifactReviewStateApplied') : t('artifactReviewStatePending')}
                </Badge>
              </div>
              <div className="min-w-0">
                <CardTitle className="truncate text-xl">{session.title}</CardTitle>
                <div className="mt-1 text-sm text-muted-foreground">
                  {t('artifactReviewSubtitle')}
                </div>
              </div>
            </div>
            <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label={t('artifactReviewClose')}>
              <X />
            </Button>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-background/80 p-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <FilePenLine className="size-3.5" />
                {t('artifactReviewTargetLabel')}
              </div>
              <div className="mt-2 break-all text-sm text-foreground">{describeTarget(session)}</div>
            </div>
            <div className="rounded-lg border border-border bg-background/80 p-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <Sparkles className="size-3.5" />
                {t('artifactReviewStatusLabel')}
              </div>
              <div className="mt-2 text-sm text-foreground">
                {isApplied ? t('artifactReviewModeYoloDescription') : t('artifactReviewModeDiffDescription')}
              </div>
            </div>
          </div>

          <Alert>
            <RefreshCcw className="size-4" />
            <AlertTitle>
              {isApplied ? t('artifactReviewAppliedAlertTitle') : t('artifactReviewPendingAlertTitle')}
            </AlertTitle>
            <AlertDescription>
              {isApplied ? t('artifactReviewAppliedAlertBody') : t('artifactReviewPendingAlertBody')}
            </AlertDescription>
          </Alert>
        </CardHeader>

        <Separator />

        <CardContent className="min-h-0 flex-1 px-0 pb-0">
          <DiffView
            baseline={session.baselineContent}
            proposed={session.proposedContent}
            onAccept={onAccept}
            onReject={onReject}
          />
        </CardContent>

        <CardContent className="pt-4">
          <Button type="button" variant="outline" className="w-full" onClick={onAskForChanges} disabled={isMutating}>
            {t('artifactReviewAskForChanges')}
          </Button>
        </CardContent>
      </Card>
    </aside>
  );
}
