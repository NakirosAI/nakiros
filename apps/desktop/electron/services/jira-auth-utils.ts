import type { AccessibleResource } from './jira-oauth.js';

export function normalizeJiraSiteUrl(value?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, '').toLowerCase();
}

export function selectAccessibleResource(
  resources: AccessibleResource[],
  configuredUrl?: string,
): AccessibleResource | null {
  if (resources.length === 0) return null;

  const normalizedConfigured = normalizeJiraSiteUrl(configuredUrl);
  if (!normalizedConfigured) return resources[0] ?? null;

  return resources.find((resource) => normalizeJiraSiteUrl(resource.url) === normalizedConfigured) ?? resources[0] ?? null;
}

export function isSecureStorageBackendSupported(options: {
  encryptionAvailable: boolean;
  selectedBackend?: string;
}): boolean {
  if (!options.encryptionAvailable) return false;
  if (!options.selectedBackend) return true;
  return options.selectedBackend !== 'basic_text';
}
