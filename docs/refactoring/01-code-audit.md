# Audit de duplication & uniformité — Nakiros

> Branche : `refactor/duplication-audit` · Date : 2026-04-25
> Document compagnon : [`02-agent-run-primitive.md`](./02-agent-run-primitive.md)

État des lieux du code dupliqué et des opportunités de mutualisation
côté frontend, backend et transverse. Ce document inventorie ; le doc 02
décrit la cible architecturale et le plan de migration.

## Synthèse — chantiers par ROI

| # | Chantier | Type | ROI | Effort |
|---|---|---|---|---|
| 1 | `scanDirectory` / `countAudits` / `buildSkill` dupliqués 4× dans les skill-readers | Backend | Élevé | 0,5j |
| 2 | 70+ strings IPC hardcodés dans `nakiros-client.ts` (viole `IPC_CHANNELS`) | Transverse | Élevé | 1j |
| 3 | Pattern Registry+EventLog+lifecycle dupliqué dans audit/fix/eval-runner | Backend | Élevé | 2-3j |
| 4 | Headers de page Run réinventés sur Audit/Eval/Fix (timer, status, controls) | Frontend | Moyen | 1j |
| 5 | 7 types frontend-only à remonter dans `@nakiros/shared` | Transverse | Moyen | 0,5j |
| 6 | Polling/subscribe dupliqués sur EvalRunsView/FixView/useSkillsViewState | Frontend | Moyen | 1j |
| 7 | Primitives `ui/*` non utilisées (Textarea, Card, EmptyState, tabs) | Frontend | Faible | 0,5j |

---

## 1. Frontend

### 1.1 Primitives `components/ui/*` sous-utilisées

| Primitive | État | À la place on a |
|---|---|---|
| `Card.tsx` | **0 usage** | Divs + className répétés |
| `Textarea.tsx` | **0 usage** | `<textarea>` inline ([AuditView.tsx:231-242](../../apps/frontend/src/views/AuditView.tsx#L231-L242), EvalRunsView, FixView) |
| `EmptyState.tsx` | **0 usage** | Loading/empty divs ad-hoc ([ProjectOverview:65-69](../../apps/frontend/src/views/ProjectOverview.tsx#L65-L69), [ConversationsView:70-75](../../apps/frontend/src/views/ConversationsView.tsx#L70-L75)) |
| `tabs.tsx` | **0 usage** | `TabButton` redéfini dans [skills/components.tsx:42-67](../../apps/frontend/src/views/skills/components.tsx#L42-L67) + variantes inline |

### 1.2 Écrans Run non uniformes

Audit / Eval / Fix partagent ~70 % de structure mais divergent sur tout :

| Élément | AuditView | EvalRunsView | FixView |
|---|---|---|---|
| Elapsed timer | `useElapsedTimer` ✓ | `setInterval` inline (157-160) | via `useRunState` poll-based |
| Status pill | Ternaire imbriqué [AuditView:312-330](../../apps/frontend/src/views/AuditView.tsx#L312-L330) | Logique inline dans `EvalMatrixCell` | Encore une autre variante |
| Header structure | Back+icon+title+pill+stats+tabs+ctrls | Back+title+stats+ctrls (sans tabs) | Back+title+stats+tabs+ctrls (set tabs ≠) |
| Stop/Finish button | Inline | Inline | Inline |

→ Cible : `RunControlHeader` + `RunStatusBadge` (cf. doc 02 § Bibliothèque).

### 1.3 Logique IPC dispersée → hooks à créer

| Pattern | Occurrences | Hook cible |
|---|---|---|
| `setInterval(refresh, 500)` + cleanup | EvalRunsView:106-123, FixView:667-672, useSkillsViewState ×4 | `usePolling(fn, ms)` |
| `getEvalFeedback` + `saveEvalFeedback` | EvalRunsView:86-102 | `useEvalFeedback()` |
| `listProjectConversationsWithAnalysis` | ProjectOverview:41, ConversationsView:34 | `useConversationAnalyses(projectId)` |

### 1.4 Violations de conventions

- Inline style : `style={{height:320}}` dans [FixView:700](../../apps/frontend/src/views/FixView.tsx#L700) → classe Tailwind
- `formatDuration` non i18n dans `ConversationsView:207` (alors qu'`AuditView:332-342` l'est)
- `formatTokens` redéfini dans AuditView et EvalRunsView → `utils/format.ts`

---

## 2. Backend

### 2.1 Skill-readers — 4× le même code (~260 LOC dupliqués)

| Fonction | skill-reader | bundled-skills | claude-global | plugin-skills |
|---|---|---|---|---|
| `scanDirectory` | L29-75 | L26-71 | L42-84 | L111-147 |
| `countAudits` | L7-15 | L98-106 | L86-94 | L149-157 |
| `buildSkill` | inline 108-119 | L73-96 | L96-119 | L159-184 |
| `shouldHide` + `HIDDEN_PATHS` | L20-27 | L9-16 | L9-16 | L9-16 |
| Path-traversal check | L171-172 | L144-146 | L180-181 | L232-233 |

→ Cible : module `apps/nakiros/src/services/skill-fs/` avec
`scanSkillDirectory`, `countAuditReports`, `buildSkillRecord`,
`validateSkillFilePath`. Brancher les 4 readers.

### 2.2 Runners — pattern lifecycle dupliqué

| Capacité | audit (524 LOC) | eval (900) | fix (400) | runner-core couvre? |
|---|---|---|---|---|
| Registry `Map<id, Entry>` | ✓ | ✓ | ✓ | ❌ Dupliqué 3× |
| Boot recovery | `restoreOrCleanupAuditWorkdirs` | ❌ | `restoreOrCleanupTempWorkdirs` | ❌ |
| EventLog + broadcast | ✓ | ✓ | ✓ | ✅ centralisé |
| `persistRunJson` | ✓ | ✓ | ✓ | ✅ centralisé |
| `isActiveRunStatus` | ✓ | ✓ | ✓ | ✅ centralisé |
| Workdir prep | symlink | sandbox | tmp | ❌ Patterns proches |
| Cleanup on stop | fragmenté | sandbox-destroy | fragmenté | ❌ |

→ Cible : `BaseRunner<TKind, TEvent>` dans `runner-core/`. Voir doc 02
pour la primitive `AgentRun` qui guide cette refonte.

### 2.3 Handlers IPC — boilerplate

- Pattern `(args) => { const x = args[0] as T; ... }` répété :
  audit.ts:36-40, fix.ts:45-49, create.ts:36-40, eval.ts:81+
- Try/catch + broadcast d'erreur **manquant** systématiquement
  (eval.ts:48, fix.ts:57-62)
- `createEventBroadcaster`, `getRunOrThrow`, `resolveSkillDirForRun`
  déjà centralisés ✅

→ Cible : helper `createTypedHandler<I, O>(fn)` dans
[`run-helpers.ts`](../../apps/nakiros/src/daemon/handlers/run-helpers.ts).

### 2.4 Skill resolution dupliquée

- `resolveSkillDir` dans
  [skills-common.ts:33-51](../../apps/nakiros/src/daemon/handlers/skills-common.ts#L33-L51)
- `resolveEvalSkillDir` dans
  [skill-dir.ts:19-40](../../apps/nakiros/src/services/skill-dir.ts#L19-L40)

Même logique. À fusionner dans une seule API.

---

## 3. Transverse

### 3.1 ⚠️ Violation critique — strings IPC hardcodés

[`apps/frontend/src/lib/nakiros-client.ts`](../../apps/frontend/src/lib/nakiros-client.ts)
contient 70+ appels `invoke('eval:startRuns', ...)` au lieu de
`invoke(IPC_CHANNELS['eval:startRuns'], ...)`.

CLAUDE.md mandate : *« No hardcoded channel name strings in handlers,
registry, client, or d.ts. »* — actuellement violé côté client. Les
handlers daemon, eux, sont propres ✅.

### 3.2 Types à remonter dans `@nakiros/shared`

| Type | Localisation actuelle | Cible |
|---|---|---|
| `DetectedEditor` | [global.d.ts:49](../../apps/frontend/src/global.d.ts#L49) **+** [onboarding-installer.ts:12](../../apps/nakiros/src/services/onboarding-installer.ts#L12) (dupliqué !) | `shared/types/onboarding.ts` |
| `OnboardingProgressEvent` | global.d.ts:56 | idem |
| `OnboardingInstallResult` | global.d.ts:62 | idem |
| `InstalledCommand` | global.d.ts:67 | `shared/types/installer.ts` (existe) |
| `AgentRunNotificationPayload` / `OpenAgentRunChatPayload` | global.d.ts:74, 84 | `shared/types/electron.ts` |
| `AuditEntry` / `RunEntry` / `FixEntry` | inline dans chaque runner | `shared/types/runs.ts` |
| `AssertionResult` | eval-runner.ts:269-274 | `shared/types/eval.ts` |

### 3.3 Métadonnées agent/editor dupliquées

`EDITOR_DEFS`
([onboarding-installer.ts:21-37](../../apps/nakiros/src/services/onboarding-installer.ts#L21-L37))
≈ `ENVIRONMENTS`
([agent-installer.ts:27-46](../../apps/nakiros/src/services/agent-installer.ts#L27-L46)).
Une seule source à conserver.

### 3.4 Bilan alignement 4-layers IPC

- Channels (`IPC_CHANNELS`) : ✅ ~70 déclarés
- Handlers + registry : ✅ alignés
- Client `window.nakiros.*` : ✅ exposé mais ❌ via strings littérales
- `global.d.ts` : ⚠️ 7 types qui devraient être en shared

---

## Plan de chantiers (4 phases)

**Phase 1 — Quick wins (~1j cumulé)**
1. Module `services/skill-fs/` : extraire scanDirectory/countAudits/buildSkill/validatePath, brancher les 4 readers
2. Fusionner `resolveSkillDir` (skill-dir.ts ↔ skills-common.ts)
3. Remonter les 7 types frontend dans `@nakiros/shared` + supprimer `DetectedEditor` dupliqué dans onboarding-installer
4. Fusionner `EDITOR_DEFS` ↔ `ENVIRONMENTS`
5. Utiliser `Textarea` / `EmptyState` existants partout (kill `<textarea>` inline + loading divs)
6. Remplacer `style={{height:320}}` FixView par classe Tailwind

**Phase 2 — Structurels frontend (~2j)**
7. Hooks `usePolling`, `useEvalFeedback`, `useConversationAnalyses`
8. Bibliothèque de composants Run (cf. doc 02) : `RunControlHeader`,
   `RunStatusBadge`, `AgentActivityFeed`, `HumanInteractionPanel`
9. `utils/format.ts` (formatTokens, formatDuration i18n-aware unifié)
10. Migration `TabButton` → `components/ui/tabs`

**Phase 3 — Structurels backend (~2-3j)**
11. `BaseRunner<TKind, TEvent>` dans runner-core/ (cf. doc 02)
12. Migration progressive des runners : audit → fix → create → eval
13. `createTypedHandler<I,O>` middleware pour handlers IPC

**Phase 4 — Hygiène IPC (~1j)**
14. Refactor `nakiros-client.ts` pour passer par `IPC_CHANNELS['x']`
15. Lint/CI : grep bloquant sur `invoke\('` littéraux dans nakiros-client

---

## Fichiers de référence (suite)

- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) — runtime, IPC contract, runners
- [`CLAUDE.md`](../../CLAUDE.md) — conventions et contraintes obligatoires
- [`docs/technical/`](../technical/README.md) — TSDoc mirror complet
