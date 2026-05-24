---
name: project_drift_integrated_in_analysis_2026_05_24
description: DriftReport intégré dans ConversationAnalysis 2026-05-24 (étape 5a). DriftType+ConversationDrift dans shared, analyzeDriftFromPreparsed dans drift-analyzer, drift field dans retour de analyzeConversation, CACHE_VERSION=12.
metadata:
  type: project
---

**DriftReport intégré dans ConversationAnalysis (2026-05-24 — étape 5a).**

**Why:** Rendre le drift disponible côté UI sans call HTTP séparé, en réutilisant les données déjà parsées dans conversation-analyzer.ts.

**Changes:**
- `packages/shared/src/types/project.ts`: nouveaux exports `DriftType` + `ConversationDrift`. Champ `drift?: ConversationDrift | null` ajouté dans `ConversationAnalysis`. Single source of truth pour les types partagés avec le frontend.
- `apps/nakiros/src/services/drift-analyzer.ts`: `DriftType` et `DriftReport` maintenant importés/re-exportés depuis `@nakiros/shared`. `DriftReport = ConversationDrift` (type alias). Nouvelle fonction synchrone `analyzeDriftFromPreparsed(data: PreparsedSessionData)`. Nouvelle interface `PreparsedSessionData` (assistantTurns, userMessages, contextMetrics).
- `apps/nakiros/src/services/conversation-analyzer.ts`: 3 nouvelles collections parallèles (driftToolErrors Map, driftAssistantTurns, driftUserMessages) alimentées pendant le scan principal. Scan user étendu pour collecter `tool_use_id` des tool_result → driftToolErrors. Scan assistant étendu avec `id` capturé sur chaque tool_use → driftToolUses avec hasError correct. `analyzeDriftFromPreparsed` appelé avant le return → `drift: ConversationDrift | null` dans le retour.
- `apps/nakiros/src/services/conversation-analysis-cache.ts`: CACHE_VERSION bumped 11 → 12.

**Key pitfalls:**
- Sub-modules drift (loop/topic/context) importent `DriftReport` depuis `'../drift-analyzer.js'` — aucun changement nécessaire car l'alias est re-exporté.
- `conversation-analyzer.ts` a ses propres types internes (UserMessageRecord, AssistantTurnRecord). Pour drift, on maintient des structures PARALLÈLES de type AssistantTurn[]/UserMessage[]/ContextMetrics[] — ne pas confondre avec les types internes de l'analyzer.
- L'analyzer filtre `isRealUserMessage = text.length > 0 && toolResults.length === 0`, donc `driftUserMessages` ne contient que de vrais messages texte (pas les tool_result-only). Cohérent avec `loadUserMessages` de session-loader.ts.
- `driftToolErrors` est populé lors du scan USER (avant le scan ASSISTANT pour ce même tour de conversation). JSONL Claude Code : tous les tool_result d'un tour assistant N arrivent dans le message user N+1. La Map est donc disponible quand on scanne les assistant entries suivantes — MAIS pas pour le premier tour. En pratique acceptable car la Map accumule au fil du parsing linéaire.
- CACHE_VERSION 12 invalide toutes les entrées v11 → recompute systématique au premier accès.

**How to apply:** Pour étape 5b (frontend badge UI), importer `ConversationDrift` depuis `@nakiros/shared` et lire `analysis.drift` (undefined = vieux cache, null = calculé mais pas de drift, objet = drift détecté).
