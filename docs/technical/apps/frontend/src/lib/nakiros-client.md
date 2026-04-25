# nakiros-client.ts

**Path:** `apps/frontend/src/lib/nakiros-client.ts`

Browser-side Nakiros client. Side-effect import: builds the
`window.nakiros` proxy that the React tree calls to talk to the daemon.

Communication runs over two channels:

- **HTTP** — `POST /ipc/<channel>` with a JSON body `{ args: [...] }` for
  request/response calls. Errors surface as `Error('IPC call failed: ...')`
  or `Error('Unknown IPC channel: ...')` on 404.
- **WebSocket** (`/ws`) — singleton hub for event streams. Consumers
  register via the `subscribe(channel, cb)` returned by every `on*Event`
  helper. The socket auto-reconnects with capped exponential backoff
  (max 10 s).

The exposed surface is intentionally `unknown`-typed at the implementation
side — strict types live in `apps/frontend/src/global.d.ts` and are
applied at every call site.

## Exports

This module has no named exports. Importing it for side effects installs
the proxy on the global `window`:

```ts
// apps/frontend/src/main.tsx
import './lib/nakiros-client';
```

After import, `window.nakiros.<method>(...)` is available. Method
families: shell/clipboard, preferences, agent installer, web Notification
helpers, onboarding, projects + project conversations, project skills,
nakiros bundled skills (with conflict resolution), Claude global skills,
plugin skills, eval runner (start/stop/list/feedback/matrix/comparison),
audit runner, fix runner, create runner, meta version info, skill agent
temp files. The browser `Notification` API is wrapped to display run
completion notifications; clicks emit through `onOpenAgentRunChat`
listeners.
