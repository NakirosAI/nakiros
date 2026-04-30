# 07 — Intégration du new design Nakiros

> Branche : `feat/new-design-integration`
> Source mockup : [`apps/Nakiros-new-design/`](../../apps/Nakiros-new-design/)
> Cible : [`apps/frontend/`](../../apps/frontend/)
> Statut : cadrage validé, exécution écran par écran

---

## 1. Objectif

Refondre `apps/frontend/` en s'appuyant sur le mockup `Nakiros-new-design/`
fait par Claude Design. Le mockup n'est **pas** un livrable code (HTML +
Babel CDN, JSX sans build, données mockées dans `data.jsx`). Il est notre
**source de vérité visuelle et UX**, et nous reconstruisons les écrans
dans le frontend existant en TypeScript + Tailwind + IPC réel.

L'enjeu n'est pas un re-skin : l'**architecture d'écrans change** —
notamment passage à un shell multi-onglets et fusion d'écrans actuels
en facettes d'un même objet (skill, run).

---

## 2. Principes directeurs

1. **Pas de big-bang**. Migration écran par écran derrière un flag
   `ENABLE_NEW_DESIGN` (ou variante par écran), avec coexistence des deux
   shells tant que la parité n'est pas atteinte.
2. **TypeScript strict** sur tout le code porté. Le `.jsx` du mockup est
   réécrit en `.tsx` avec props typées.
3. **Réutilisation avant nouveau code**. Avant d'écrire un composant, on
   vérifie [`apps/frontend/src/components/ui/`](../../apps/frontend/src/components/ui/),
   `constants/`, `utils/`, `hooks/` — règle du `CLAUDE.md`.
4. **Pas de mock**. Chaque écran porté est branché sur les channels IPC
   réels via `window.nakiros` dès la première PR. On ne shippe jamais une
   vue alimentée par des fixtures.
5. **i18n d'emblée**. Toute string passe par `useTranslation(ns)` avec
   namespace dédié. Pas de chaîne en dur, pas de ternaire FR/EN.
6. **Tailwind-first**. Le système de tokens OKLch du mockup est porté en
   variables CSS exposées à Tailwind via `@theme`. Pas d'`inline style`
   sauf cas justifié (animations dynamiques).
7. **Backend stable**. À ce stade, **aucun nouveau channel IPC n'est
   nécessaire** pour les écrans couverts par le mockup. Toute exception
   est documentée par écran (section "IPC requis") et validée avant
   implémentation.

---

## 3. Changements structurants vs. existant

### 3.1 Shell multi-onglets

Le mockup remplace la state-machine `view: 'home' | 'dashboard' | ...`
de [`App.tsx`](../../apps/frontend/src/App.tsx) par un modèle d'onglets
typés ([`apps/Nakiros-new-design/app.jsx:19-59`](../../apps/Nakiros-new-design/app.jsx)) :

```ts
type Tab =
  | { id: string; kind: 'home'; label: string }
  | { id: string; kind: 'project'; projectId: string; label: string;
      view: 'overview' | 'skills' | 'convs' | 'recs' | 'settings';
      skillId?: string | null }
  | { id: string; kind: 'run'; runId: string; label: string };
```

Conséquences :

- `useProject` (aujourd'hui projet actif unique) doit gérer **N projets
  ouverts simultanément**. Le projet "actif" devient une dérivation de
  `tabs[activeTabId]`.
- La sidebar est **contextuelle** : visible uniquement pour les onglets
  `kind: 'project'`, masquée pour `home` et `run`.
- Le `RunDock` (pill "X running · Y done" en TopBar) devient le pattern
  global pour ouvrir un run depuis n'importe où.

### 3.2 Skill = hub, plus 3 écrans séparés

Les vues actuelles `AuditView`, `EvalRunsView`, `FixView` deviennent
**onglets internes** d'un `SkillDetailScreen` unique :

| Onglet | Contenu | Vient de |
|---|---|---|
| Audit | derniers checks, score ring, findings | `AuditView` |
| Evals | matrice itérations × evals + baseline | `EvalRunsView` |
| Fix | bouton run + dernière diff | `FixView` (entry) |
| Files | file tree audits/evals/references | nouveau |
| Iterations | historique chronologique + sparkline | nouveau |

Le **mode actif** (run en cours) de chacun bascule sur le `RunScreen`
correspondant via le RunDock — il n'y a plus de page dédiée "audit en
cours".

### 3.3 RunScreen unifié

[`screens-runs.jsx`](../../apps/Nakiros-new-design/screens-runs.jsx)
gère les 5 kinds (`audit`, `eval`, `fix`, `create`, `analyze`) avec
deux états (running / completed) et un side panel par kind. Ça remplace
les écrans de runner actuels.

### 3.4 Home fusionnée

`NakirosSkillsView` + `GlobalSkillsView` + `PluginSkillsView` fusionnent
en 3 onglets de `HomeScreen` : **Projects / Plugins / Globals**.

### 3.5 Conflits bundlés → pattern conversation +/-

Le mockup n'a **pas** d'écran dédié `BundledSkillConflictsView`. Le
nouveau pattern : afficher les conflits **inline dans la conversation**
avec marqueurs `+` / `−`. À designer dans une PR dédiée plus tard
(hors scope de cette refonte).

### 3.6 ScanView conservé tel quel

`ScanView` couvre les projets que **Nakiros ne gère pas encore**
(workspaces non scannés). Il est conservé en l'état dans le nouveau
shell, accessible depuis Home. Pas de redesign cette itération.

---

## 4. Mapping écran-par-écran

| # | Écran actuel | Devient | Composant cible | IPC clés |
|---|---|---|---|---|
| 1 | `App.tsx` state-machine | Shell multi-onglets | `App.tsx` + `useTabs` | — |
| 2 | TopBar simple | TopBar + RunDock | `TopBar`, `RunDockTrigger`, `RunDockPanel` | run events stream |
| 3 | `Home` | HomeScreen 3 onglets | `HomeScreen` + `ProjectsTab`/`PluginsTab`/`GlobalsTab` | `listProjects`, `listGlobalSkills`, `listPlugins` |
| 4 | `Dashboard` (overview) | `ProjectOverviewScreen` | idem | `getProjectOverview` |
| 5 | `ConversationsView` | `ConversationsScreen` + `ConversationTabs` | idem | `listConversations`, conversation events |
| 6 | `RecommendationsView` | `RecommendationsScreen` (+ drawer) | `RecommendationsScreen`, `RecDrawer` | `listRecommendations` |
| 7 | `NakirosSkillsView` + `GlobalSkillsView` + `PluginSkillsView` | Onglets de Home + `SkillsScreen` projet | `SkillsScreen` | `listProjectSkills`, `listGlobalSkills` |
| 8 | `AuditView` (page) | Onglet Audit du `SkillDetailScreen` | `AuditTab` | `getSkillAudit` |
| 9 | `EvalRunsView` | Onglet Evals + `EvalDiffView` overlay | `EvalsTab`, `EvalDiffView` | `listEvalRuns`, `getEvalDiff` |
| 10 | `FixView` (page) | Onglet Fix + run mode `kind=fix` | `FixTab`, `FixSidePanel` | `startFix`, fix events |
| 11 | runner d'audit en cours | `RunScreen` mode `kind=audit` | `RunScreen` + `AuditSidePanel` | run events stream |
| 12 | runner d'eval en cours | `RunScreen` mode `kind=eval` | `RunScreen` + sidepanel eval | run events stream |
| 13 | runner de fix en cours | `RunScreen` mode `kind=fix` | `RunScreen` + `FixSidePanel` | run events stream |
| 14 | analyse conversation (run-kind, cf. doc 06) | `RunScreen` mode `kind=analyze` | `RunScreen` + sidepanel analyze | doc 06 |
| 15 | `ScanView` | **conservé tel quel**, restylé tokens | `ScanView` | inchangé |
| 16 | `BundledSkillConflictsView` | **futur** : pattern +/- en conversation | hors scope | — |
| 17 | nouveau : Files | Onglet Files de `SkillDetailScreen` | `FilesTab` | `getSkillFiles` *(à confirmer)* |
| 18 | nouveau : Iterations | Onglet Iterations de `SkillDetailScreen` | `IterationsTab` | `listSkillIterations` *(à confirmer)* |

**Points à valider** : les channels IPC marqués *(à confirmer)* —
"Files" et "Iterations" sont des onglets nouveaux ; il faut vérifier si
les données existent déjà dans des channels actuels ou si on a besoin
d'en ajouter. À trancher à la PR correspondante.

---

## 5. Phasage

### Phase 0 — Fondations design system

Découpée en deux PRs pour limiter la surface invasive :

#### PR1a — Tokens & mécaniques CSS *(non-invasive)*

- ✅ `apps/frontend/src/styles/tokens.css` créé : tokens OKLch préfixés
  `--n-*` pour coexister sans conflit avec les tokens hex existants de
  [`styles.css`](../../apps/frontend/src/styles.css).
- ✅ `apps/frontend/src/styles/globals.css` étendu avec un nouveau bloc
  `@theme inline` exposant les tokens à Tailwind v4 sous classes
  préfixées : `bg-n-canvas`, `text-n-muted`, `border-n-default`,
  `font-n-sans`, `shadow-n-card`, etc.
- ✅ Mécanique de densité : `[data-density="compact"|"comfy"]` override
  `--n-row-h` et `--n-pad-card`. Activable en posant l'attribut sur
  `<html>` (à câbler en PR1b).
- ✅ Animations utiles portées : `n-pulse`, `n-shimmer-bg`.
- ✅ Fonts Geist en première position de la stack `--n-font-sans` /
  `--n-font-mono` avec **fallback système immédiat** (Geist sera
  réellement chargé en PR1b).
- ❌ **Pas de modif** : `usePreferences`, `AppPreferences`, daemon,
  écrans existants. Aucun consommateur des nouveaux tokens à ce stade.

**Critère de succès** : `pnpm -F @nakiros/frontend exec tsc --noEmit` +
`turbo build` passent. Aucun changement visuel sur l'app actuelle.

#### PR1b — Persistance & fonts

- Install `@fontsource/geist` + `@fontsource/geist-mono` (self-host npm,
  pas de CDN).
- Étendre `AppPreferences` (`packages/shared/src/types/preferences.ts`)
  avec `density?: 'compact' | 'comfy'` et `accentHue?: number`.
- Validation/persistance côté daemon (handler `preferences`).
- Effet de bord côté frontend : poser `data-density` sur `<html>` et
  surcharger les 4 vars `--n-accent*` avec la hue choisie, dans un
  effet observant `usePreferences()`.
- UI Settings : ajout d'une section "Apparence" avec radio densité +
  slider hue (réutilise les composants existants
  `apps/frontend/src/components/ui/`).

### Phase 1 — Shell multi-onglets *(PR2)*

- Créer `useTabs` hook + type `Tab` discriminé.
- Refondre `App.tsx` derrière `ENABLE_NEW_SHELL` (env `VITE_*` ou
  préférence). Tant que `false`, comportement actuel inchangé.
- Implémenter `TopBar` + `RunDock` (trigger + panel) sans wiring data
  réelle pour l'instant — fixtures locales OK pour cette PR seule, à
  câbler en PR3.
- Sidebar contextuelle conditionnelle.

**Sortie** : on peut ouvrir/fermer des onglets, naviguer Home ↔ Project,
visuellement aligné mockup. Aucune donnée réelle encore branchée.

### Phase 2 — Pilote : `ProjectOverviewScreen` *(PR3)*

Premier écran complet **avec données IPC réelles**.

- Porter `screens-overview.jsx` en `.tsx`.
- Brancher sur les channels existants déjà consommés par `Dashboard`.
- i18n complète (namespace `overview`).
- Côte à côte avec l'ancien `Dashboard` derrière flag.

**Sortie** : QA visuelle + fonctionnelle réussie sur un projet réel.
Sert d'étalon pour les écrans suivants.

### Phase 3 — Skills hub *(PR4 → PR8)*

Découpage par onglet du `SkillDetailScreen` :

- PR4 : `SkillsScreen` (liste) + shell `SkillDetailScreen` + onglet Audit
- PR5 : onglet Evals + overlay `EvalDiffView`
- PR6 : onglet Fix
- PR7 : onglet Files *(IPC à confirmer)*
- PR8 : onglet Iterations *(IPC à confirmer)*

À chaque PR, l'ancien écran équivalent (`AuditView`, `EvalRunsView`,
`FixView`) reste accessible derrière flag. Suppression à la fin de
Phase 3.

### Phase 4 — RunScreen unifié *(PR9)*

- Porter `RunScreen` + side panels par kind.
- Brancher sur le bus d'événements run actuel (`eventBus.broadcast`
  côté daemon + `subscribe` côté client).
- Validation : un run audit, eval, fix, analyze ouvert depuis le RunDock
  affiche correctement live + completed.

#### État au 2026-04-27 (session stoppée pour drift)

**Mergé** :
- ✅ PR9a (commit `a5db628`) — RunScreen pour audit/fix/create avec side
  panels, header OKLch, RunStream chat.

**Sur la branche `feat/new-design-integration` (non commité)** :

- ✅ `EvalRunScreen` séparé du `AuditLikeRunScreen` (rules-of-hooks,
  evite les écrans noirs vus en dev).
- ✅ Side panel eval refondu : 3 sections (Progression / Eval queue /
  Delta vs baseline) + uplift body, calé sur le mockup.
- ✅ Header eval : `step X/Y` câblé sur runs terminés / total, bouton
  Stop avec spinner + état `Stopping…`.
- ✅ Events bucketisés par `runId` (`Record<runId, LiveStreamEvent[]>`)
  — fini la conv multiplexée illisible.
- ✅ Sélection de run dans la queue : `EvalQueueRow` cliquable +
  `selectedRunId` state + auto-select prioritaire (`waiting_for_input`
  > `running` > premier).
- ✅ Toggle `ChatRunSwitcher` au-dessus du chat pour switcher
  with-skill ↔ baseline du même eval, visible seulement si les deux
  configs existent.
- ✅ `HumanInteractionPanel` câblé sur le run sélectionné en
  `waiting_for_input` via `sendEvalUserMessage`.
- ✅ Conversation persistée : `RunStream.turns={selectedRun.turns}`
  rejoue la conv après reload (le buffer in-memory était vide après
  un restart daemon).
- ✅ Refresh tick sur events `status` → `listEvalRuns()` rappelé pour
  que le side panel reflète les runners qui finissent un par un, sans
  attendre le batch complet.
- ✅ Boutons `Audit` / `Fix` du `SkillDetailScreen` et `Run evals` du
  `EvalMatrixGrid` : feedback `isLaunching` + spinner + disable pour
  éviter les double-clics.
- ✅ i18n : nouvelles clés `panels.eval.{progression,queue,uplift,
  upliftBody,runningWithBaseline,runningWithSkill,noBaseline,withSkill,
  baseline}` (EN + FR).
- ✅ Fix débordement texte audit : `min-w-0 break-words` sur le
  container, `break-all` sur `<code>`, `overflow-x-auto` sur `<pre>`.
- ✅ `useRunState` accepte `pollIntervalMs` (2000 ms par défaut sur
  audit) — compromis flicker/stale.

**À finaliser (next session)** :

1. **Écran summary "EVAL RUN COMPLETED"** quand `agentRun.status === 'done'`.
   Mockup fourni par Thomas — voir capture / message du 2026-04-27.
   Composants attendus : hero +22% + body line, 4 KPI tiles
   (PASS RATE / VS BASELINE / REGRESSIONS / TOKENS), per-eval
   breakdown (evalName · pass/total · Δ · tokens), section
   "Prochaines étapes" avec 4 cards (Marquer comme baseline /
   Fix la régression / Voir le diff vs run précédent / Re-run avec
   model X).
   - Pass/total réels : nécessite lecture de `grading.json` par run
     (IPC matrix existe déjà, ou ajouter `readEvalGrading(runId)`).
   - Δ vs iter précédente : sortir l'util de calcul de
     `EvalDiffOverlay` dans un helper partagé.
   - Action `Marquer comme baseline` : pas d'IPC `setBaseline`
     aujourd'hui, à designer (lié à la mémoire
     `project_nakiros_baseline_per_model_2026_04_26.md`).
   - Action `Fix la régression` : peut câbler sur `launchFix` en
     passant l'eval échoué en contexte.
   - Cadrage proposé non validé : rendre layout + KPIs + breakdown
     dans cette session, **stub les 4 cards d'action** (toast
     "coming soon"), câblage actions en PR séparée.

2. **Event types riches** dans le chat (finding / diff / assertion /
   thinking) — bloqué sur le daemon qui ne les émet pas encore. À
   débloquer en PR9c une fois les events ajoutés côté runner.

3. **Commit + PR** : tout ce qui est ✅ ci-dessus n'est pas commité.
   Quand le summary screen sera fini, commit en deux temps :
   - PR9b : eval RunScreen complet (events buckets + sélection +
     toggle + side panel + HumanInteractionPanel + summary screen)
   - PR9c : event types riches (post-daemon)

### Phase 5 — Conversations & Recommandations *(PR10, PR11)*

- **PR10a** : `ConversationsScreen` (liste + filtres + sparkline réelle) +
  `ConvDrawer` avec tab Diagnostic (sismograph **ctx-only enrichi**, KPIs,
  cache, tools, hot files). No-mock : tout vient de `ConversationAnalysis`.
- **PR10b** : tabs Timeline + Transcript du drawer (branche sur
  `getProjectConversationMessages`).
- **PR10c** : sismograph **5-tracks** fidèle au mockup `viz.jsx`. Bloqué
  par une extension backend de `ConversationAnalysis` (ajouter
  `billedSamples`, `cacheSamples`, `toolBuckets`, `pausePoints`). Cadrage
  noté en mémoire projet `project_nakiros_sismograph_5tracks_backend_2026_04_27`.
- **PR11** *(bloquée par dépendance branche)* : `RecommendationsScreen` +
  `RecDrawer` (port du mockup `apps/Nakiros-new-design/rec-drawer.jsx`). La
  pipeline backend `proposal-engine/` (clustering frictions → skill drafts)
  vit sur la branche `feat/friction-to-skill-proposals` non mergée — sur
  `main` et `feat/new-design-integration`, le handler `project:getRecommendations`
  retourne `[]` et `RecommendationsView` est un placeholder. Avant PR11,
  trancher : (a) merger `feat/friction-to-skill-proposals` sur `main` puis
  rebaser cette branche, (b) cherry-pick sélectif backend uniquement, (c)
  reprendre le port du frontend par-dessus (a). Cadrage à figer.

### Phase 6 — Home fusionnée *(PR12)*

- HomeScreen avec 3 onglets Projects / Plugins / Globals.
- Fusion des 3 catalogs actuels (`NakirosSkillsView`, `GlobalSkillsView`,
  `PluginSkillsView`).
- Conservation de `ScanView` accessible depuis Home pour les projets
  non gérés.

### Phase 7 — Nettoyage *(PR13)*

- Suppression des écrans legacy.
- Suppression du flag `ENABLE_NEW_SHELL`.
- Suppression de `apps/Nakiros-new-design/` du repo (ou archivage
  externe).
- Refresh `code-documentation` (TSDoc + mirror Markdown).
- Update `CLAUDE.md` et `ARCHITECTURE.md` avec la nouvelle archi.

### Hors scope (post-refonte)

- Pattern `+/-` pour conflits bundlés en conversation
  (remplaçant `BundledSkillConflictsView`).
- Redesign éventuel de `ScanView`.
- Catalogue Plugins enrichi.

---

## 6. Risques & décisions ouvertes

| # | Risque / Question | Mitigation / À trancher |
|---|---|---|
| R1 | ~~Tailwind v4 `@theme` vs CSS vars purs~~ | **Tranché** : `@theme inline` Tailwind v4 (PR1a livrée) |
| R2 | Onglets multi-projets → cache mémoire si l'utilisateur ouvre 10 projets | Limiter à N onglets max + warning, ou unmount au-delà du focus |
| R3 | `useProject` actuel est consommé partout — refacto invasive | Garder une API "projet actif courant" dérivée des tabs pour compat |
| R4 | Onglets Files / Iterations : IPC à créer ? | Audit en début de PR7/PR8, peut décaler le planning |
| R5 | Suppression de l'ancien shell : risque de régression sur écrans non testés | **Tranché** : flag par écran (rollback chirurgical) |
| R6 | Persistence des onglets entre sessions | Décision UX : on persiste ou pas ? Défaut proposé : persister sous `~/.nakiros/ui-state.json` |
| R7 | Densité `compact` peut casser certains tableaux Tailwind existants | À tester en Phase 0 sur les écrans non encore portés |

---

## 7. Validation par PR

Chaque PR doit passer avant merge :

```bash
pnpm -F nakiros exec tsc --noEmit
pnpm -F @nakiros/frontend exec tsc --noEmit
pnpm -F @nakiros/landing exec tsc --noEmit
turbo build
```

Plus, à chaque PR d'écran : QA manuelle sur un projet réel (au moins
un audit, un eval, un fix tournés bout en bout selon les écrans
touchés). Le typecheck ne valide pas la feature.

---

## 8. Estimation grossière

| Phase | PRs | Effort estimé |
|---|---|---|
| 0 — Tokens | 1 | 0,5 j |
| 1 — Shell onglets | 1 | 1,5 j |
| 2 — Overview pilote | 1 | 1 j |
| 3 — Skills hub | 5 | 4 j |
| 4 — RunScreen | 1 | 1,5 j |
| 5 — Convs / Recs | 2 | 2 j |
| 6 — Home fusionnée | 1 | 1 j |
| 7 — Nettoyage | 1 | 0,5 j |
| **Total** | **13** | **~12 j** |

À ajuster selon trouvailles IPC en PR7/PR8 et complexité réelle des
side panels du RunScreen.
