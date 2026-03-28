import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNetworkError } from './network-error.js';

test('formatNetworkError unwraps fetch causes and keeps network details', () => {
  const rootCause = Object.assign(new Error('getaddrinfo ENOTFOUND auth.nakiros.com'), {
    code: 'ENOTFOUND',
    syscall: 'getaddrinfo',
    hostname: 'auth.nakiros.com',
  });
  const fetchError = new TypeError('fetch failed', { cause: rootCause });

  assert.equal(
    formatNetworkError(fetchError, 'Authentication request failed'),
    'Authentication request failed: getaddrinfo ENOTFOUND auth.nakiros.com | ENOTFOUND | syscall=getaddrinfo | host=auth.nakiros.com',
  );
});

test('formatNetworkError falls back when no useful details exist', () => {
  assert.equal(formatNetworkError(new TypeError('fetch failed'), 'Authentication request failed'), 'Authentication request failed');
});
