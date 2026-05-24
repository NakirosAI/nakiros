---
name: project-drift-badge
description: Drift badge UI — 3 composants modifiés (ConvRow, DiagnosticTab, ConversationHealthBadges) + i18n conversations namespace
metadata:
  type: project
---

Badge drift ajouté sur `ConversationAnalysis.drift` (étape 5b/5 du feature drift detection).

**3 états à distinguer** :
- `drift === undefined` → analyse antérieure à cache v12 — rien afficher
- `drift === null` → drift calculé, RAS — rien afficher
- `drift === { type, severity, message, suggestion }` → afficher le badge

**Composants touchés** :
- `ConvRow.tsx` — `DriftChip` inline avec hover tooltip (message + suggestion), bouton stopPropagation pour ne pas ouvrir le drawer
- `DiagnosticTab.tsx` — `DriftSection` card avec barre colorée severity + icône Compass + texte message/suggestion en clair
- `ConversationHealthBadges.tsx` — `DriftBadge` pill (n-* tokens, pas `Badge` legacy)

**Pattern couleur severity** :
- `low` → n-info-soft / n-info
- `medium` → n-watch-soft / n-watch
- `high` → n-critical-soft / n-critical

**i18n** — namespace `conversations` :
- `badge.drift.{loop,topic,context}` — label court dans chip/pill
- `drawer.drift.sectionLabel` — label section DiagnosticTab
- `drawer.drift.{loop,topic,context}` — label type dans la card
- `drawer.drift.severity{Low,Medium,High}` — libellé sévérité

**Icône** : `Compass` (lucide-react) — utilisée dans ConvRow DriftChip, DiagnosticTab DriftSection, ConversationHealthBadges DriftBadge.

**Why:** ConversationHealthBadges utilise encore le `Badge` legacy pour les autres signaux — DriftBadge est une span inline n-* pour éviter la régression visuelle. Ne pas migrer les autres Badge tant que le composant ui/Badge n'est pas porté sur n-*.
