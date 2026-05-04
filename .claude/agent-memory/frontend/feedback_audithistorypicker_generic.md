---
name: AuditHistoryPicker — interface GenericAuditEntry
description: AuditHistoryPicker accepte GenericAuditEntry (path, timestamp, sizeBytes?) pour être réutilisé avec ClaudeMdAuditHistoryEntry
type: feedback
---

`AuditHistoryPicker` est maintenant générique via `GenericAuditEntry { path, timestamp, sizeBytes? }`. `AuditHistoryEntry` (skills) et `ClaudeMdAuditHistoryEntry` (CLAUDE.md) satisfont tous les deux cette interface.

**Why:** Éviter la duplication du picker entre SkillDetailScreen et ClaudeMdScreen.

**How to apply:** Toujours utiliser `GenericAuditEntry` comme type dans les parents. Si `sizeBytes` est absent (ClaudeMdAuditHistoryEntry), la colonne taille est simplement omise.
