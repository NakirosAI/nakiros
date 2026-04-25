# AuditView.tsx

**Path:** `apps/frontend/src/views/AuditView.tsx`

Full-screen overlay rendering an in-flight or terminal audit run for a single skill. Subscribes to the audit run via `useRunState` (poll plus IPC events through `window.nakiros.getAuditRun` / `getAuditBufferedEvents` / `onAuditEvent`), displays the streaming Claude conversation, and once `done` lands, fetches the markdown report from disk via `readAuditReport`. Lets the user reply while the run is `waiting_for_input`, stop a running audit, or finish a completed one (which discards the in-memory workdir but keeps the report file). Mounted by `*SkillsView` components when `s.activeAudit` is set.

## Exports

### `default` — `AuditView`

```ts
export default function AuditView(props: Props): JSX.Element
```

React component implementing the overlay described above. Props expose `scope`, optional `projectId` / `pluginName` / `marketplaceName`, the `skillName`, the `initialRun` snapshot returned by `startAudit`, and an `onClose` callback.
