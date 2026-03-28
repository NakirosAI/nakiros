import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, FilePenLine, Sparkles, Wand2, X } from 'lucide-react';
import type {
  ArtifactChangeMode,
  ArtifactChangeProposal,
  ArtifactContext,
  StoredWorkspace,
} from '@nakiros/shared';
import AgentPanel from '../AgentPanel';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Textarea } from '../ui';

interface Props {
  workspace: StoredWorkspace;
  artifactContext: ArtifactContext;
  title: string;
  subtitle: string;
  mode: ArtifactChangeMode;
  onModeChange(mode: ArtifactChangeMode): void;
  onClose(): void;
  onArtifactChangeProposal?: (event: {
    proposal: ArtifactChangeProposal;
    conversationId?: string | null;
    triggerMessageId?: string | null;
    baselineContentOverride?: string | null;
    alreadyApplied?: boolean;
  }) => void | Promise<void>;
}

export default function ArtifactEditorChat({
  workspace,
  artifactContext,
  title,
  subtitle,
  mode,
  onModeChange,
  onClose,
  onArtifactChangeProposal,
}: Props) {
  const { t } = useTranslation('context');
  const [message, setMessage] = useState('');
  const [launchRequest, setLaunchRequest] = useState<{
    requestId: string;
    title: string;
    agentId: string;
    command: string;
    initialMessage: string;
    artifactContext: ArtifactContext;
  } | null>(null);
  const [launchKey, setLaunchKey] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const effectiveArtifactContext = useMemo<ArtifactContext>(() => ({
    ...artifactContext,
    mode,
  }), [artifactContext, mode]);

  const targetLabel = useMemo(() => {
    if (artifactContext.target.kind === 'workspace_doc') return artifactContext.target.absolutePath;
    return `${artifactContext.target.kind} · ${artifactContext.target.id}`;
  }, [artifactContext.target]);

  useEffect(() => {
    setMessage('');
    setLaunchRequest(null);
    setLaunchKey((current) => current + 1);
    window.setTimeout(() => textareaRef.current?.focus(), 50);
  }, [artifactContext.target, artifactContext.title]);

  function handleSend() {
    const trimmed = message.trim();
    if (!trimmed) return;
    setLaunchRequest({
      requestId: `artifact-edit-${Date.now()}`,
      title,
      agentId: 'cto',
      command: '/nak-agent-cto',
      initialMessage: trimmed,
      artifactContext: effectiveArtifactContext,
    });
    setMessage('');
  }

  function handleNewChat() {
    setLaunchRequest(null);
    setLaunchKey((current) => current + 1);
    setMessage('');
    window.setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 bg-[var(--bg-soft)] p-3">
      <Card className="shrink-0">
        <CardHeader className="pb-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info">{t('docEditorChatTitle')}</Badge>
                <Badge variant="muted">{mode === 'diff' ? t('docEditorModeReview') : t('docEditorModeYolo')}</Badge>
              </div>
              <CardTitle className="mt-3 truncate text-xl">{title}</CardTitle>
              <CardDescription className="mt-1 truncate">{subtitle}</CardDescription>
            </div>
            <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label={t('artifactReviewClose')}>
              <X />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 pt-0 xl:grid-cols-[minmax(0,1fr)_240px]">
          <div className="rounded-lg border border-border bg-background/80 p-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <FilePenLine className="size-3.5" />
              {t('artifactReviewTargetLabel')}
            </div>
            <div className="mt-2 break-all text-sm text-foreground">{targetLabel}</div>
          </div>
          <div className="rounded-lg border border-border bg-background/80 p-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <Sparkles className="size-3.5" />
              {t('docEditorModeLabel')}
            </div>
            <div className="mt-2 text-sm text-foreground">
              {mode === 'diff' ? t('docEditorModeReviewDescription') : t('docEditorModeYoloDescription')}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 xl:col-span-2">
            <Button type="button" variant={mode === 'diff' ? 'default' : 'outline'} size="sm" onClick={() => onModeChange('diff')}>
              {t('docEditorModeReview')}
            </Button>
            <Button type="button" variant={mode === 'yolo' ? 'default' : 'outline'} size="sm" onClick={() => onModeChange('yolo')}>
              {t('docEditorModeYolo')}
            </Button>
            {launchRequest && (
              <Button type="button" variant="ghost" size="sm" onClick={handleNewChat}>
                {t('docEditorNewChat')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {launchRequest ? (
        <Card className="min-h-0 flex-1 overflow-hidden">
          <AgentPanel
            key={`${launchRequest.requestId}-${launchKey}`}
            workspaceId={workspace.id}
            workspaceName={workspace.name}
            repos={workspace.repos}
            workspacePath={workspace.workspacePath}
            hideTabs
            launchChatRequest={launchRequest}
            onArtifactChangeProposal={onArtifactChangeProposal}
          />
        </Card>
      ) : (
        <Card className="flex flex-1 flex-col">
          <CardHeader>
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Bot className="size-4" />
              {t('docEditorComposeTitle')}
            </div>
            <CardDescription>{t('docEditorComposeDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
            <Textarea
              ref={textareaRef}
              autoFocus
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('docEditorChatPlaceholder')}
              rows={10}
              className="min-h-[220px] flex-1 resize-none rounded-xl border-border bg-background p-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="m-0 text-xs text-muted-foreground">
                {t('docEditorShortcutHint')}
              </p>
              <Button type="button" onClick={handleSend} disabled={!message.trim()}>
                <Wand2 data-icon="inline-start" />
                {t('docEditorSend')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
