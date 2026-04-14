import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import type { LocalTicket, StoredWorkspace } from '@nakiros/shared';
import { Button, Card } from './ui';
import GettingStartedBanner from './GettingStartedBanner';

interface Props {
  workspace: StoredWorkspace;
  tickets: LocalTicket[];
  docsCount: number;
  conversationCount: number;
  lastConversationAt: string | null;
  serverStatus: 'starting' | 'running' | 'stopped';
  showSetupBanner?: boolean;
  onGoProduct(): void;
  onGoDelivery(): void;
  onOpenChat(): void;
  onCreateTicket(): void;
  onCreatePrd(): void;
  onOpenGettingStarted?(): void;
  onDismissSetupBanner?(): void;
}

type OverviewAction = {
  id: string;
  label: string;
  description: string;
  run(): void;
};

const STATUS_DOT_CLASS: Record<Props['serverStatus'], string> = {
  running: 'bg-[var(--success)]',
  starting: 'bg-[var(--warning)]',
  stopped: 'bg-[var(--danger)]',
};
const overviewCardClass = 'rounded-[16px] border-[var(--line)] bg-[var(--bg-soft)] p-5 shadow-none';
const insetCardClass = 'rounded-[14px] border-[var(--line)] bg-[var(--bg-card)] shadow-none';

function isTicketBlocked(ticket: LocalTicket, allTickets: LocalTicket[]): boolean {
  return ticket.blockedBy.some((id) => allTickets.find((candidate) => candidate.id === id)?.status !== 'done');
}

export default function WorkspaceOverview({
  workspace,
  tickets,
  docsCount,
  conversationCount,
  lastConversationAt,
  serverStatus,
  showSetupBanner = false,
  onGoProduct,
  onGoDelivery,
  onOpenChat,
  onCreateTicket,
  onCreatePrd,
  onOpenGettingStarted,
  onDismissSetupBanner,
}: Props) {
  const { t, i18n } = useTranslation('overview');
  const locale = i18n.language.startsWith('fr') ? 'fr-FR' : 'en-US';

  const inProgressCount = tickets.filter((ticket) => ticket.status === 'in_progress').length;
  const doneCount = tickets.filter((ticket) => ticket.status === 'done').length;
  const blockedCount = tickets.filter((ticket) => isTicketBlocked(ticket, tickets)).length;
  const hasRepos = workspace.repos.length > 0;

  const serverLabel = serverStatus === 'running'
    ? t('mcpRunning')
    : serverStatus === 'starting'
      ? t('mcpStarting')
      : t('mcpStopped');


  const actions: OverviewAction[] = [];
  if (tickets.length === 0 && docsCount === 0) {
    actions.push({ id: 'create-prd', label: t('createPrd'), description: t('createPrdDesc'), run: onCreatePrd });
  } else if (tickets.length === 0) {
    actions.push({ id: 'create-ticket', label: t('createTicket'), description: t('createTicketDesc'), run: onCreateTicket });
  } else if (inProgressCount > 0) {
    actions.push({ id: 'open-delivery', label: t('openDelivery'), description: t('openDeliveryDesc'), run: onGoDelivery });
  }

  if (hasRepos) {
    actions.push({ id: 'open-chat', label: t('openChat'), description: t('openChatDesc'), run: onOpenChat });
  }

  actions.push({ id: 'open-product', label: t('goToProduct'), description: t('goToProductDesc'), run: onGoProduct });
  actions.push({ id: 'open-delivery-shortcut', label: t('goToDelivery'), description: t('goToDeliveryDesc'), run: onGoDelivery });

  return (
    <div className="flex w-full flex-col overflow-hidden">
      {showSetupBanner && onOpenGettingStarted && onDismissSetupBanner && (
        <GettingStartedBanner
          onComplete={onOpenGettingStarted}
          onDismiss={onDismissSetupBanner}
        />
      )}
      <div className="w-full overflow-y-auto p-6">
        <div className="flex w-full flex-col gap-5">
        <Card className={overviewCardClass}>
          <div className="flex flex-wrap justify-between gap-4">
            <div>
              <h2 className="m-0 text-xl font-bold text-[var(--text)]">{t('projectHealth')}</h2>
              <p className="mb-0 mt-2 text-[13px] text-[var(--text-muted)]">
                {workspace.name} · {workspace.repos.length} repo{workspace.repos.length > 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--bg-card)] px-3 py-1.5 text-xs text-[var(--text-muted)]">
                <span className={clsx('inline-block h-2 w-2 rounded-full', STATUS_DOT_CLASS[serverStatus])} />
                {serverLabel}
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
            <MetricCard label={t('totalTickets')} value={String(tickets.length)} />
            <MetricCard label={t('inProgress')} value={String(inProgressCount)} />
            <MetricCard label={t('blocked')} value={String(blockedCount)} />
            <MetricCard label={t('done')} value={String(doneCount)} />
            <MetricCard label={t('contextDocs')} value={String(docsCount)} />
            <MetricCard label={t('aiSessions')} value={String(conversationCount)} />
          </div>
        </Card>

        <Card className={overviewCardClass}>
          <h3 className="mb-3 mt-0 text-sm font-bold text-[var(--text)]">{t('nextActions')}</h3>
          {!hasRepos && (
            <p className="mb-3 mt-0 rounded-[12px] border border-[var(--line)] bg-[var(--bg-card)] px-3 py-2.5 text-[13px] text-[var(--warning)]">
              {t('noRepoWarning')}
            </p>
          )}
          <div className="flex flex-col gap-3">
            {actions.slice(0, 3).map((action, index) => (
              <Button
                key={action.id}
                onClick={action.run}
                variant="secondary"
                className={
                  [
                    'w-full flex-col items-start gap-1.5 rounded-[14px] border px-4 py-3 text-left text-[var(--text)] shadow-none',
                    index === 0
                      ? 'border-[var(--line-strong)] bg-[var(--bg-card)]'
                      : 'border-[var(--line)] bg-[var(--bg-card)]',
                  ].join(' ')
                }
              >
                <strong className="text-[13px]">{action.label}</strong>
                <span className="text-xs font-normal text-[var(--text-muted)]">{action.description}</span>
              </Button>
            ))}
          </div>
        </Card>

        <Card className={clsx(overviewCardClass, 'grid gap-3 md:grid-cols-2')}>
          <div className="rounded-[14px] border border-[var(--line)] bg-[var(--bg-card)] p-4">
            <h3 className="mb-2.5 mt-0 text-sm font-bold text-[var(--text)]">{t('aiActivity')}</h3>
            <p className="m-0 text-[13px] leading-6 text-[var(--text-muted)]">
              {lastConversationAt
                ? t('lastActivity', { time: new Date(lastConversationAt).toLocaleString(locale) })
                : t('noRecentActivity')}
            </p>
          </div>
          <div className="rounded-[14px] border border-[var(--line)] bg-[var(--bg-card)] p-4">
            <h3 className="mb-2.5 mt-0 text-sm font-bold text-[var(--text)]">{t('deliverySnapshot')}</h3>
            <p className="m-0 text-[13px] leading-6 text-[var(--text-muted)]">
              {tickets.length === 0
                ? t('noTicket')
                : t('ticketSummary', { inProgress: inProgressCount, blocked: blockedCount, done: doneCount })}
            </p>
          </div>
        </Card>
      </div>
    </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className={clsx(insetCardClass, 'p-4')}>
      <div className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-[0.06em] text-[var(--text-muted)]">{label}</span>
        <strong className="text-[28px] leading-none text-[var(--text)]">{value}</strong>
      </div>
    </Card>
  );
}
