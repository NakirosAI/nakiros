import { useEffect, useState } from 'react';

import type { ConversationMessage } from '@nakiros/shared';

/**
 * Lazy-fetch the raw `ConversationMessage[]` for a given session, using
 * `window.nakiros.getProjectConversationMessages`. Returns `null` while
 * loading. Re-runs when either id changes; pending requests for previous
 * ids are dropped so late state updates can't overwrite the current view.
 */
export function useConversationMessages(
  projectId: string,
  sessionId: string,
): ConversationMessage[] | null {
  const [messages, setMessages] = useState<ConversationMessage[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMessages(null);
    void window.nakiros
      .getProjectConversationMessages(projectId, sessionId)
      .then((data) => {
        if (!cancelled) setMessages(data);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, sessionId]);

  return messages;
}
