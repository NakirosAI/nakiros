import type { StoredWorkspace } from '@tiqora/shared';
import { getTickets, getEpics } from './ticket-storage.js';

export function generateContext(
  workspaceId: string,
  ticketId: string,
  workspace: StoredWorkspace,
): string {
  const allTickets = getTickets(workspaceId);
  const epics = getEpics(workspaceId);

  const ticket = allTickets.find((t) => t.id === ticketId);
  if (!ticket) return `# Erreur\nTicket ${ticketId} introuvable.`;

  const epic = ticket.epicId ? epics.find((e) => e.id === ticket.epicId) : null;

  const blockers = ticket.blockedBy
    .map((id) => allTickets.find((t) => t.id === id))
    .filter(Boolean) as typeof allTickets;

  const unlockedBy = allTickets.filter((t) => t.blockedBy.includes(ticket.id));

  const lines: string[] = [];

  lines.push(`# Contexte agent — ${ticket.id}`);
  lines.push('');

  // Workspace context
  const wsCtx = workspace.pmTool
    ? `${workspace.name} (${workspace.pmTool.toUpperCase()}${workspace.projectKey ? ` ${workspace.projectKey}` : ''})`
    : workspace.name;
  lines.push(`> Workspace : **${wsCtx}**`);
  if (workspace.mode) lines.push(`> Mode : ${workspace.mode}`);
  lines.push('');

  // Ticket
  lines.push(`## Ticket : ${ticket.title}`);
  if (ticket.description) {
    lines.push('');
    lines.push(ticket.description);
  }
  lines.push('');
  lines.push(`**Statut :** ${ticket.status} | **Priorité :** ${ticket.priority}`);
  if (ticket.repoName) lines.push(`**Repo cible :** ${ticket.repoName}`);
  if (epic) lines.push(`**Epic :** ${epic.name}${epic.description ? ` — ${epic.description}` : ''}`);
  lines.push('');

  // Critères d'acceptance
  if (ticket.acceptanceCriteria.length > 0) {
    lines.push('## Critères d\'acceptance');
    lines.push('');
    for (const ac of ticket.acceptanceCriteria) {
      lines.push(`- [ ] ${ac}`);
    }
    lines.push('');
  }

  // Dépendances complétées
  if (blockers.length > 0) {
    lines.push('## Dépendances complétées');
    lines.push('');
    for (const dep of blockers) {
      const done = dep.status === 'done';
      const icon = done ? '✅' : '⚠️';
      lines.push(`### ${icon} ${dep.id} — ${dep.title}`);
      if (dep.description) lines.push(dep.description);
      if (!done) lines.push('> **Attention : ce ticket n\'est pas encore terminé.**');
      lines.push('');
    }
  }

  // Ce ticket débloque
  if (unlockedBy.length > 0) {
    lines.push('## Ce ticket débloque');
    lines.push('');
    for (const next of unlockedBy) {
      lines.push(`- ⏳ **${next.id}** — ${next.title}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('Tu travailles sur le ticket ci-dessus. Respecte les critères d\'acceptance. Ne modifie pas le comportement des tickets déjà terminés.');

  return lines.join('\n');
}
