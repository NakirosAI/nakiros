import { useTranslation } from 'react-i18next';
import type { LocalTicket, StoredWorkspace } from '@nakiros/shared';
import { Button, Card } from './ui';

interface Props {
  workspace: StoredWorkspace;
  tickets: LocalTicket[];
  docsCount: number;
  conversationCount: number;
  lastConversationAt: string | null;
  serverStatus: 'starting' | 'running' | 'stopped';
  onGoProduct(): void;
  onGoDelivery(): void;
  onOpenChat(): void;
  onCreateTicket(): void;
  onCreatePrd(): void;
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
  onGoProduct,
  onGoDelivery,
  onOpenChat,
  onCreateTicket,
  onCreatePrd,
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
    <div className="w-full overflow-y-auto p-[22px]">
      <div className="flex w-full flex-col gap-5">
        <Card padding="md" className="rounded-[10px] bg-[var(--bg-soft)]">
          <div className="flex flex-wrap justify-between gap-3.5">
            <div>
              <h2 className="m-0 text-xl">{t('projectHealth')}</h2>
              <p className="mb-0 mt-1.5 text-[13px] text-[var(--text-muted)]">
                {workspace.name} · {workspace.repos.length} repo{workspace.repos.length > 1 ? 's' : ''}
              </p>
            </div>
            <div className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <span className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT_CLASS[serverStatus]}`} />
              {serverLabel}
            </div>
          </div>
          <div className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5">
            <MetricCard label={t('totalTickets')} value={String(tickets.length)} />
            <MetricCard label={t('inProgress')} value={String(inProgressCount)} />
            <MetricCard label={t('blocked')} value={String(blockedCount)} />
            <MetricCard label={t('done')} value={String(doneCount)} />
            <MetricCard label={t('contextDocs')} value={String(docsCount)} />
            <MetricCard label={t('aiSessions')} value={String(conversationCount)} />
          </div>
        </Card>

        <Card padding="md" className="rounded-[10px] bg-[var(--bg-soft)]">
          <h3 className="mb-2.5 mt-0 text-sm font-bold">{t('nextActions')}</h3>
          {!hasRepos && (
            <p className="mb-2.5 mt-0 text-[13px] text-[var(--warning)]">
              {t('noRepoWarning')}
            </p>
          )}
          <div className="flex flex-col gap-2">
            {actions.slice(0, 3).map((action, index) => (
              <Button
                key={action.id}
                onClick={action.run}
                variant="secondary"
                className={
                  [
                    'w-full flex-col items-start gap-1.5 rounded-[10px] border px-3 py-2 text-left text-[var(--text)]',
                    index === 0
                      ? 'border-[var(--primary)] bg-[var(--primary-soft)]'
                      : 'border-[var(--line)] bg-[var(--bg-soft)]',
                  ].join(' ')
                }
              >
                <strong className="text-[13px]">{action.label}</strong>
                <span className="text-xs font-normal text-[var(--text-muted)]">{action.description}</span>
              </Button>
            ))}
          </div>
        </Card>

        <Card padding="md" className="grid gap-3 rounded-[10px] bg-[var(--bg-soft)] md:grid-cols-2">
          <div>
            <h3 className="mb-2.5 mt-0 text-sm font-bold">{t('aiActivity')}</h3>
            <p className="m-0 text-[13px] text-[var(--text-muted)]">
              {lastConversationAt
                ? t('lastActivity', { time: new Date(lastConversationAt).toLocaleString(locale) })
                : t('noRecentActivity')}
            </p>
          </div>
          <div>
            <h3 className="mb-2.5 mt-0 text-sm font-bold">{t('deliverySnapshot')}</h3>
            <p className="m-0 text-[13px] text-[var(--text-muted)]">
              {tickets.length === 0
                ? t('noTicket')
                : t('ticketSummary', { inProgress: inProgressCount, blocked: blockedCount, done: doneCount })}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card padding="sm" className="rounded-[10px] bg-[var(--bg-card)]">
      <div className="flex flex-col gap-2">
        <span className="text-xs text-[var(--text-muted)]">{label}</span>
        <strong className="text-2xl leading-none">{value}</strong>
      </div>
    </Card>
  );
}
