import { app } from 'electron';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { LocalTicket, LocalEpic } from '@tiqora/shared';

function getWorkspaceDir(workspaceId: string): string {
  const dir = join(app.getPath('userData'), workspaceId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function readJson<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return [];
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T[];
  } catch {
    return [];
  }
}

function writeJson<T>(filePath: string, data: T[]): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// --- Tickets ---

export function getTickets(workspaceId: string): LocalTicket[] {
  return readJson<LocalTicket>(join(getWorkspaceDir(workspaceId), 'tickets.json'));
}

export function saveTicket(workspaceId: string, ticket: LocalTicket): void {
  const all = getTickets(workspaceId);
  const idx = all.findIndex((t) => t.id === ticket.id);
  if (idx >= 0) {
    all[idx] = ticket;
  } else {
    all.push(ticket);
  }
  writeJson(join(getWorkspaceDir(workspaceId), 'tickets.json'), all);
}

export function removeTicket(workspaceId: string, id: string): void {
  const all = getTickets(workspaceId).filter((t) => t.id !== id);
  writeJson(join(getWorkspaceDir(workspaceId), 'tickets.json'), all);
}

// --- Epics ---

export function getEpics(workspaceId: string): LocalEpic[] {
  return readJson<LocalEpic>(join(getWorkspaceDir(workspaceId), 'epics.json'));
}

export function saveEpic(workspaceId: string, epic: LocalEpic): void {
  const all = getEpics(workspaceId);
  const idx = all.findIndex((e) => e.id === epic.id);
  if (idx >= 0) {
    all[idx] = epic;
  } else {
    all.push(epic);
  }
  writeJson(join(getWorkspaceDir(workspaceId), 'epics.json'), all);
}

export function removeEpic(workspaceId: string, id: string): void {
  const all = getEpics(workspaceId).filter((e) => e.id !== id);
  writeJson(join(getWorkspaceDir(workspaceId), 'epics.json'), all);
}
