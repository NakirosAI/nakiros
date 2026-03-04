import { homedir } from 'os';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { LocalTicket, LocalEpic } from '@nakiros/shared';

// ~/.nakiros/workspaces/{workspace-name-slug}/tickets/{TICKET-ID}.json
// ~/.nakiros/workspaces/{workspace-name-slug}/epics/{EPIC-ID}.json

export function toWorkspaceSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace';
}

function getTicketsDir(workspaceSlug: string): string {
  return join(homedir(), '.nakiros', 'workspaces', workspaceSlug, 'tickets');
}

function ensureTicketsDir(workspaceSlug: string): string {
  const dir = getTicketsDir(workspaceSlug);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function getEpicsDir(workspaceSlug: string): string {
  return join(homedir(), '.nakiros', 'workspaces', workspaceSlug, 'epics');
}

function ensureEpicsDir(workspaceSlug: string): string {
  const dir = getEpicsDir(workspaceSlug);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function readAllFromDir<T>(dir: string): T[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJsonFile<T>(join(dir, f)))
    .filter((item): item is T => item !== null);
}

// ─── Tickets ──────────────────────────────────────────────────────────────────

export function getTickets(workspaceSlug: string): LocalTicket[] {
  return readAllFromDir<LocalTicket>(getTicketsDir(workspaceSlug));
}

export function saveTicket(workspaceSlug: string, ticket: LocalTicket): void {
  const dir = ensureTicketsDir(workspaceSlug);
  writeFileSync(join(dir, `${ticket.id}.json`), JSON.stringify(ticket, null, 2), 'utf-8');
}

export function removeTicket(workspaceSlug: string, id: string): void {
  const filePath = join(getTicketsDir(workspaceSlug), `${id}.json`);
  if (existsSync(filePath)) unlinkSync(filePath);
}

// ─── Epics ────────────────────────────────────────────────────────────────────

export function getEpics(workspaceSlug: string): LocalEpic[] {
  return readAllFromDir<LocalEpic>(getEpicsDir(workspaceSlug));
}

export function saveEpic(workspaceSlug: string, epic: LocalEpic): void {
  const dir = ensureEpicsDir(workspaceSlug);
  writeFileSync(join(dir, `${epic.id}.json`), JSON.stringify(epic, null, 2), 'utf-8');
}

export function removeEpic(workspaceSlug: string, id: string): void {
  const filePath = join(getEpicsDir(workspaceSlug), `${id}.json`);
  if (existsSync(filePath)) unlinkSync(filePath);
}

// ─── Bulk operations (used by Jira sync) ─────────────────────────────────────

export function bulkSaveTickets(
  workspaceSlug: string,
  tickets: LocalTicket[],
): { created: number; updated: number } {
  const dir = ensureTicketsDir(workspaceSlug);
  let created = 0;
  let updated = 0;
  for (const ticket of tickets) {
    const filePath = join(dir, `${ticket.id}.json`);
    const isUpdate = existsSync(filePath);
    writeFileSync(filePath, JSON.stringify(ticket, null, 2), 'utf-8');
    if (isUpdate) updated++; else created++;
  }
  return { created, updated };
}

export function bulkSaveEpics(
  workspaceSlug: string,
  epics: LocalEpic[],
): { created: number; updated: number } {
  const dir = ensureEpicsDir(workspaceSlug);
  let created = 0;
  let updated = 0;
  for (const epic of epics) {
    const filePath = join(dir, `${epic.id}.json`);
    const isUpdate = existsSync(filePath);
    writeFileSync(filePath, JSON.stringify(epic, null, 2), 'utf-8');
    if (isUpdate) updated++; else created++;
  }
  return { created, updated };
}
