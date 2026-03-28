import type { StoryRow, EpicRow } from './types.js';

export interface PmImportResult {
  epics: number;
  stories: number;
  updated: number;
}

export interface PmImportContext {
  workspaceId: string;
  projectKey: string;
  apiToken: string;         // decrypted
  metadata: Record<string, unknown>;  // provider-specific (baseUrl, email, etc.)
}

export type SupportedImportProvider = 'jira';
export const SUPPORTED_IMPORT_PROVIDERS: SupportedImportProvider[] = ['jira'];

export function isSupportedImportProvider(p: string): p is SupportedImportProvider {
  return SUPPORTED_IMPORT_PROVIDERS.includes(p as SupportedImportProvider);
}

// ─── Shared field mapping types ───────────────────────────────────────────────

export type ImportableStatus = StoryRow['status'];
export type ImportableEpicStatus = EpicRow['status'];
export type ImportablePriority = StoryRow['priority'];
