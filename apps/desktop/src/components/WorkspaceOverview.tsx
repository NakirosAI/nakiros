import type { LocalTicket, ResolvedLanguage, StoredWorkspace } from '@nakiros/shared';

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
  language: ResolvedLanguage;
}

type OverviewAction = {
  id: string;
  label: string;
  description: string;
  run(): void;
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
  language,
}: Props) {
  const inProgressCount = tickets.filter((ticket) => ticket.status === 'in_progress').length;
  const doneCount = tickets.filter((ticket) => ticket.status === 'done').length;
  const blockedCount = tickets.filter((ticket) => isTicketBlocked(ticket, tickets)).length;
  const hasRepos = workspace.repos.length > 0;
  const isFr = language === 'fr';
  const serverLabel = serverStatus === 'running'
    ? (isFr ? 'MCP opérationnel' : 'MCP running')
    : serverStatus === 'starting'
    ? (isFr ? 'MCP démarrage' : 'MCP starting')
    : (isFr ? 'MCP arrêté' : 'MCP stopped');

  const actions: OverviewAction[] = [];
  if (tickets.length === 0 && docsCount === 0) {
    actions.push({
      id: 'create-prd',
      label: isFr ? 'Créer PRD avec IA' : 'Create PRD with AI',
      description: isFr
        ? 'Démarre le cadrage projet via brainstorming et génère la documentation initiale.'
        : 'Kick off product framing with brainstorming and generate initial documentation.',
      run: onCreatePrd,
    });
  } else if (tickets.length === 0) {
    actions.push({
      id: 'create-ticket',
      label: isFr ? 'Créer premier ticket' : 'Create first ticket',
      description: isFr
        ? 'Le contexte est prêt: passe en delivery et crée le premier ticket.'
        : 'Context is ready: switch to delivery and create the first ticket.',
      run: onCreateTicket,
    });
  } else if (inProgressCount > 0) {
    actions.push({
      id: 'open-delivery',
      label: isFr ? 'Ouvrir Delivery' : 'Open Delivery',
      description: isFr
        ? 'Des tickets sont déjà en cours. Reprends l’exécution.'
        : 'Tickets are already in progress. Resume execution.',
      run: onGoDelivery,
    });
  }

  if (hasRepos) {
    actions.push({
      id: 'open-chat',
      label: isFr ? 'Ouvrir Chat IA' : 'Open AI Chat',
      description: isFr
        ? 'Démarre une discussion libre avec un agent sur le workspace.'
        : 'Start a free-form discussion with an agent on this workspace.',
      run: onOpenChat,
    });
  }
  actions.push({
    id: 'open-product',
    label: isFr ? 'Aller au Product Context' : 'Go to Product Context',
    description: isFr
      ? 'Visualise et mets à jour les documents de contexte.'
      : 'Review and update project context documents.',
    run: onGoProduct,
  });
  actions.push({
    id: 'open-delivery-shortcut',
    label: isFr ? 'Aller au Delivery' : 'Go to Delivery',
    description: isFr
      ? 'Board, tickets et exécution IA centralisés.'
      : 'Board, tickets and AI execution in one place.',
    run: onGoDelivery,
  });

  return (
    <div style={{ padding: 22, overflowY: 'auto', width: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%' }}>
        <section style={panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20 }}>
                {isFr ? 'Project health' : 'Project health'}
              </h2>
              <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
                {workspace.name} · {workspace.repos.length} repo{workspace.repos.length > 1 ? 's' : ''}
              </p>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              <span style={statusDot(serverStatus)} />
              {serverLabel}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginTop: 14 }}>
            <MetricCard label={isFr ? 'Tickets total' : 'Total tickets'} value={String(tickets.length)} />
            <MetricCard label={isFr ? 'En cours' : 'In progress'} value={String(inProgressCount)} />
            <MetricCard label={isFr ? 'Bloqués' : 'Blocked'} value={String(blockedCount)} />
            <MetricCard label={isFr ? 'Terminés' : 'Done'} value={String(doneCount)} />
            <MetricCard label={isFr ? 'Docs contexte' : 'Context docs'} value={String(docsCount)} />
            <MetricCard label={isFr ? 'Sessions IA' : 'AI sessions'} value={String(conversationCount)} />
          </div>
        </section>

        <section style={panel}>
          <h3 style={panelTitle}>{isFr ? 'Next actions' : 'Next actions'}</h3>
          {!hasRepos && (
            <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--warning)' }}>
              {isFr
                ? 'Aucun repo configuré: ajoute un repo dans Settings > Git pour activer les workflows IA.'
                : 'No repository configured: add one in Settings > Git to enable AI workflows.'}
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {actions.slice(0, 3).map((action, index) => (
              <button
                key={action.id}
                onClick={action.run}
                style={{
                  ...actionButton,
                  borderColor: index === 0 ? 'var(--primary)' : 'var(--line)',
                  background: index === 0 ? 'var(--primary-soft)' : 'var(--bg-soft)',
                }}
              >
                <strong style={{ fontSize: 13 }}>{action.label}</strong>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{action.description}</span>
              </button>
            ))}
          </div>
        </section>

        <section style={{ ...panel, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <h3 style={panelTitle}>{isFr ? 'IA activity' : 'AI activity'}</h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              {lastConversationAt
                ? (isFr ? `Dernière activité: ${new Date(lastConversationAt).toLocaleString('fr-FR')}` : `Last activity: ${new Date(lastConversationAt).toLocaleString('en-US')}`)
                : (isFr ? 'Aucune activité IA récente.' : 'No recent AI activity.')}
            </p>
          </div>
          <div>
            <h3 style={panelTitle}>{isFr ? 'Delivery snapshot' : 'Delivery snapshot'}</h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              {tickets.length === 0
                ? (isFr ? 'Aucun ticket encore créé.' : 'No ticket created yet.')
                : (isFr ? `${inProgressCount} en cours · ${blockedCount} bloqué(s) · ${doneCount} terminé(s)` : `${inProgressCount} in progress · ${blockedCount} blocked · ${doneCount} done`)}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={metricCard}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <strong style={{ fontSize: 24, lineHeight: 1 }}>{value}</strong>
    </div>
  );
}

const panel: React.CSSProperties = {
  border: '1px solid var(--line)',
  borderRadius: 10,
  background: 'var(--bg-soft)',
  padding: 16,
};

const panelTitle: React.CSSProperties = {
  margin: '0 0 10px',
  fontSize: 14,
  fontWeight: 700,
};

const metricCard: React.CSSProperties = {
  border: '1px solid var(--line)',
  borderRadius: 10,
  padding: '10px 12px',
  background: 'var(--bg-card)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const actionButton: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  border: '1px solid var(--line)',
  borderRadius: 10,
  padding: '10px 12px',
  cursor: 'pointer',
};

function statusDot(status: 'starting' | 'running' | 'stopped'): React.CSSProperties {
  return {
    width: 8,
    height: 8,
    borderRadius: 8,
    background: status === 'running' ? 'var(--success)' : status === 'starting' ? 'var(--warning)' : 'var(--danger)',
    display: 'inline-block',
  };
}
