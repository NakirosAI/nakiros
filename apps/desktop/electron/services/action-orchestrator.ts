import type { NakirosActionBlock } from '@nakiros/shared';
import { ensureValidAccessToken } from './auth.js';
import { formatNetworkError } from './network-error.js';

const NAKIROS_API_URL = process.env['NAKIROS_API_URL'] ?? 'https://api.nakiros.com';

export async function executeAction(workspaceId: string, block: NakirosActionBlock): Promise<string> {
  const { token } = await ensureValidAccessToken();
  if (!token) {
    throw new Error('Not authenticated — cannot execute action');
  }

  let response: Response;
  try {
    response = await fetch(`${NAKIROS_API_URL}/ws/${workspaceId}/actions/${block.tool}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(block.args),
    });
  } catch (error) {
    throw new Error(formatNetworkError(error, `Action ${block.tool} request failed`));
  }

  if (!response.ok) {
    const bodyText = (await response.text().catch(() => '')).trim();
    const details = bodyText.length > 0 ? `: ${bodyText}` : '';
    throw new Error(`Action ${block.tool} failed (${response.status})${details}`);
  }

  const result = await response.json().catch(() => ({}));
  return `[ACTION RESULT: ${block.tool}]\n${JSON.stringify(result, null, 2)}\n[END ACTION RESULT]`;
}
