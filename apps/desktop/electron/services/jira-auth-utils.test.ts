import test from 'node:test';
import assert from 'node:assert/strict';
import { isSecureStorageBackendSupported, normalizeJiraSiteUrl, selectAccessibleResource } from './jira-auth-utils.js';

test('normalizeJiraSiteUrl trims trailing slashes and lowercases the host', () => {
  assert.equal(
    normalizeJiraSiteUrl('HTTPS://Example.atlassian.net///'),
    'https://example.atlassian.net',
  );
});

test('selectAccessibleResource prefers the configured Jira site URL', () => {
  const selected = selectAccessibleResource(
    [
      { id: 'one', name: 'First', url: 'https://first.atlassian.net', scopes: [], avatarUrl: '' },
      { id: 'two', name: 'Second', url: 'https://second.atlassian.net/', scopes: [], avatarUrl: '' },
    ],
    'https://second.atlassian.net',
  );

  assert.equal(selected?.id, 'two');
});

test('selectAccessibleResource falls back to the first resource when no match exists', () => {
  const selected = selectAccessibleResource(
    [
      { id: 'one', name: 'First', url: 'https://first.atlassian.net', scopes: [], avatarUrl: '' },
      { id: 'two', name: 'Second', url: 'https://second.atlassian.net', scopes: [], avatarUrl: '' },
    ],
    'https://missing.atlassian.net',
  );

  assert.equal(selected?.id, 'one');
});

test('isSecureStorageBackendSupported rejects Linux basic_text fallback', () => {
  assert.equal(
    isSecureStorageBackendSupported({ encryptionAvailable: true, selectedBackend: 'basic_text' }),
    false,
  );
  assert.equal(
    isSecureStorageBackendSupported({ encryptionAvailable: true, selectedBackend: 'kwallet' }),
    true,
  );
});
