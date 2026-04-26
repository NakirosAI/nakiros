# Cadrage — Promotion de `analyze-convo` en Run kind

> Branche cible : à ouvrir · Statut : à cadrer · Date : 2026-04-26

## Pourquoi

L'analyse profonde de conversation (`deepAnalyzeConversation`) existe
aujourd'hui comme **one-shot Promise** sur le daemon :

- Frontend : [ConversationDeepAnalysisSection.tsx](../../apps/frontend/src/components/conversations/ConversationDeepAnalysisSection.tsx)
  appelle `window.nakiros.deepAnalyzeConversation(projectId, sessionId)` →
  attend le retour, puis affiche le markdown.
- Daemon : [conversation-deep-analyzer.ts](../../apps/nakiros/src/services/conversation-deep-analyzer.ts)
  exécute Claude en mode synchrone, retourne le rapport.
- Mounted : la section vit dans une **`Modal`** ([ConversationDiagnosticPanel.tsx](../../apps/frontend/src/components/conversations/ConversationDiagnosticPanel.tsx)).

Limites identifiées :

1. **Pas de stream** — l'utilisateur attend un blob noir entre 30 s et 2
   min sans signal de progression (lecture du JSONL, appels d'outils,
   draft du rapport).
2. **Pas d'interactivité** — impossible de dire "focus sur la cache
   compaction" ou "ré-évalue la section X" sans relancer un run complet.
3. **Aucune trace persistée** — le rapport est caché via
   `loadDeepAnalysis` mais le run lui-même (turns, tokens, durée) n'est
   pas matérialisé comme objet first-class.
4. **Vit dans une modale** — règle projet : « un run ne vit jamais dans
   une modale ; une modale peut le déclencher, jamais le contenir ». Le
   modal actuel viole cette règle, Thomas veut le refaire.

`analyze-convo` est la **preuve** que le coût d'ajout d'un nouveau
`kind` est tombé à ~150-250 LOC une fois la bibliothèque Run + la
factory `createRunner` en place.

## Diagnostic technique

| Aspect | Aujourd'hui | Cible |
|---|---|---|
| Daemon | one-shot `runDeepAnalysis(projectDir, sessionId)` retourne `Promise<DeepAnalysisResult>` | streaming runner via `createRunner({ kind: 'analyze-convo', ... })` |
| Persistance | rapport caché ([conversation-deep-analyzer.ts:39](../../apps/nakiros/src/services/conversation-deep-analyzer.ts)) | `~/.nakiros/runs/analyze-convo/<runId>/` (workdir + run.json + events.jsonl) |
| IPC | 2 channels (`project:deepAnalyzeConversation`, `project:loadDeepAnalysis`) | 6 channels `analyzeConvo:start/get/event/sendUserMessage/stop/finish` + le `loadDeepAnalysis` legacy gardé |
| UI | section dans modale, pas de stream, pas d'interaction | vue dédiée deep-linkée sur `?run=:id`, compose la bibliothèque Run, slot result panel |
| Rejouabilité | re-clic → relance un run frais, écrase le cache | ouverture deep-link sur un runId termina re-affiche les artefacts |

## Périmètre proposé

### 1. Types partagés (`@nakiros/shared`)

```ts
// agent-run.ts
export type AgentRunKind = 'audit' | 'eval' | 'fix' | 'create' | 'analyze-convo';

export interface ConversationRunTarget {
  type: 'conversation';
  projectId: string;
  sessionId: string;
}
export type AgentRunTarget = SkillRunTarget | ConversationRunTarget;

// new types/analyze-convo.ts
export interface AnalyzeConvoRun extends BaseRun {
  projectId: string;
  sessionId: string;
  /** Path to the persisted markdown report once finalized. */
  reportPath: string | null;
  model: 'claude-haiku' | 'claude-sonnet' | string;
}
```

### 2. Daemon — `analyze-convo-runner.ts`

Calqué sur `audit-runner.ts`, consomme `createRunner` :

- `kind: 'analyze-convo'`
- `runsRoot: ~/.nakiros/runs/analyze-convo/`
- `prepareWorkdir` : création workdir + lien symbolique vers le JSONL de
  la conversation (lecture-only par l'agent).
- `buildFirstPrompt(req)` : `"Analyze the conversation at <path>. Output
  a markdown report at outputs/deep-analysis.md. Stop when done."`
  (référence l'existant `analyzeConversationPrompt` de
  `conversation-deep-analyzer.ts`).
- `onTurnComplete` : check `outputs/deep-analysis.md` → archive vers
  cache (`loadDeepAnalysis` continue de fonctionner) + `helpers.complete`.
  Sinon `helpers.wait` (l'utilisateur peut envoyer un message comme
  "focus sur la cache compaction").
- `cleanupOnTerminal` : `cleanupRunWorkdir`.
- `finish` : no-op (le rapport est archivé pendant `onTurnComplete`).
- `findActiveForTarget` : déduplication sur `(projectId, sessionId)`.
- `rehydrate` : même logique qu'audit (collapse `running → waiting`,
  cleanup `stopped/failed`).

Estimation : ~150-250 LOC grâce à la factory.

### 3. IPC

- Étendre `IPC_CHANNELS` :
  ```
  analyzeConvo:start
  analyzeConvo:getRun
  analyzeConvo:event
  analyzeConvo:sendUserMessage
  analyzeConvo:stopRun
  analyzeConvo:finish
  analyzeConvo:listActive
  analyzeConvo:listAll
  analyzeConvo:getBufferedEvents
  ```
- Nouveau handler `apps/nakiros/src/daemon/handlers/analyze-convo.ts` qui
  utilise `createTypedHandler` (cf. doc 01 §13) sur les 9 channels.
- Garder `project:deepAnalyzeConversation` et `project:loadDeepAnalysis`
  pour la rétrocompatibilité **temporaire** : `deepAnalyzeConversation`
  devient un wrapper qui appelle `analyzeConvo:start` puis attend le
  premier `done` (compat avec l'UI existante en attendant la migration
  du frontend). Suppression dans une phase ultérieure.

### 4. Frontend

- Nouvelle vue `apps/frontend/src/views/AnalyzeConvoView.tsx` qui
  compose :
  - `RunControlHeader` (icône `Sparkles`, title `Analyse — {sessionId
    short}`, badge status, tokens/durée, actions Stop / Finish).
  - `AgentActivityFeed` (turns + live + thinking).
  - `HumanInteractionPanel` (textarea pour pivoter le focus de
    l'analyse).
  - Slot **result panel** : `MarkdownViewer` du rapport quand
    `run.status === 'completed'` et `run.reportPath` est non-null.
- Le bouton "Run deep analysis" actuel ([ConversationDeepAnalysisSection.tsx:88](../../apps/frontend/src/components/conversations/ConversationDeepAnalysisSection.tsx))
  devient un **trigger** : appelle `window.nakiros.startAnalyzeConvo(...)`
  et navigue vers `/projects/<projectId>/conversations/<sessionId>/analyze`
  (nouvelle route deep-linkée). La section reste visible dans le
  diagnostic panel mais ne contient plus la modale.
- Rapport caché : si `loadDeepAnalysis(sessionId)` retourne un rapport
  archivé sans run actif, la section affiche un lien
  "Voir l'analyse précédente" qui ouvre la nouvelle vue en mode
  read-only (run synthétique status `completed`, slot rapport
  hydraté).
- i18n : nouvelle namespace `analyze-convo` (`title`, `runEvals`,
  `header.*`, `thinking.verbs`...) — pattern d'audit / fix.

### 5. Suppression du modal

`ConversationDiagnosticPanel` reste une modale pour le diagnostic
**static** (timeline, tools, hot files), mais la section deep-analysis
en sort : le bouton trigger garde sa place dans la modale, mais le run
ouvre la **nouvelle vue** au-dessus / à côté. Modal pour le diagnostic
contextualisé OK ; pas pour le run lui-même (règle projet : un run ne vit jamais dans une modale).

## Questions à trancher

1. **Modèle fixe ou choisi par l'agent ?**
   - Aujourd'hui : `predictedModel` calculé côté frontend
     (`maxContextTokens <= 170_000 ? 'haiku' : 'sonnet'`).
   - Promu : laisser le `analyze-convo-runner` choisir avec la même
     règle (depuis `BaseRun.tokensUsed`)? Ou exposer un select côté UI ?
   - **Recommandation** : conserver l'auto-choice basé sur la taille du
     JSONL pour éviter une option de plus à l'utilisateur. Override via
     param du `start` request si on en a besoin.

2. **Mid-run interactivité — quel système prompt ?**
   - L'agent doit pouvoir absorber un follow-up ("ré-évalue la section
     compaction") sans casser le rapport déjà partiel.
   - **Recommandation** : prompt initial neutre (le rapport est *un
     artefact*, pas le but). L'utilisateur peut redemander une revue
     ciblée qui produit un fichier `outputs/deep-analysis-followup.md`,
     tandis que le rapport principal reste le premier `outputs/deep-analysis.md`.

3. **Rétrocompat IPC — combien de temps ?**
   - `project:deepAnalyzeConversation` legacy wrap pendant N versions ?
   - **Recommandation** : 1 version mineure de transition, puis suppression.

4. **Run sur la conversation actuelle vs ancienne**
   - Le JSONL d'une session ACTIVE peut grandir pendant le run ?
   - **Recommandation** : snapshoter le JSONL au moment du `start` (copy
     dans le workdir). Évite la collision avec une session encore
     active.

## Critères de succès

1. Un `analyze-convo` lancé depuis la diagnostic panel ouvre la nouvelle
   vue **deep-linkée** (URL contient `runId`), sort du modal.
2. La vue stream les events (lecture JSONL, appels d'outils) en
   temps réel — plus de blob noir d'attente.
3. L'utilisateur peut envoyer un message mid-run pour orienter
   l'analyse, l'agent reprend via `--resume`.
4. Le rapport final est persisté dans le cache existant (`loadDeepAnalysis`
   continue de fonctionner) ET dans le workdir du run.
5. Reboot daemon → run rehydraté en `waiting_for_input` (cf. doc 04 pour
   le flag `interruptedByReboot`).
6. tsc clean. Smoke test : analyse complète + reprise mid-run + reboot
   recovery + ré-ouverture d'un rapport caché.
7. Coût d'ajout du `kind` ≤ 250 LOC (preuve de l'investissement
   factory + bibliothèque Run).

## Effort estimé

| Tâche | Effort |
|---|---|
| Types shared + IPC channels | 0,1 j |
| Daemon : `analyze-convo-runner.ts` + handler | 0,3 j |
| Compat wrapper `project:deepAnalyzeConversation` | 0,1 j |
| Frontend : `AnalyzeConvoView` + route + i18n + trigger | 0,3 j |
| Suppression UI legacy section dans modal + read-only mode | 0,1 j |
| Smoke + tsc + docs/technical | 0,1 j |
| **Total** | **~1 j** |

## Hors scope

- **Multi-conversation simultanées** — un seul `analyze-convo` actif par
  `(projectId, sessionId)` (cf. `findActiveForTarget`). Plusieurs runs
  parallèles sur des conversations différentes : OK natif via la
  factory.
- **Refonte du diagnostic panel lui-même** — la modale du diagnostic
  reste, seule la section deep-analysis en sort. Refondre le panel est
  un autre chantier.
- **Batch analyse de toutes les conversations d'un projet** — pas
  demandé. La factory supporte des starts en série mais l'orchestration
  serait à designer (cf. eval batch).
- **Export / partage du rapport** — pas demandé.
