---
name: formatAuditTimestamp dans run-display.ts
description: Helper centralisé pour formater un ISO timestamp en date locale compacte
type: feedback
---

`formatAuditTimestamp(iso: string): string` est exporté depuis `apps/frontend/src/lib/run-display.ts`.

**Why:** Était dupliqué entre AuditHistoryPicker et ClaudeMdScreen. Un seul endroit = une seule locale-string convention.

**How to apply:** Importer depuis `../../lib/run-display` partout où on affiche un timestamp d'audit. Ne pas re-définir localement.
