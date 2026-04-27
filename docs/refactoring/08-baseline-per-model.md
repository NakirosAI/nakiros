# 08 — Baseline d'eval partagée par modèle

> Statut : cadrage validé, prêt à exécuter
> Origine : décision produit du 2026-04-26 (mémoire `project_nakiros_baseline_per_model_2026_04_26.md`), affinée le 2026-04-27
> Estimation : ~1,5 j (daemon + IPC + UI)

---

## 1. Objectif

La **baseline** d'une eval est le score de Claude **sans** le skill, sur les
prompts/fixtures de l'eval. C'est la valeur de référence par rapport à
laquelle on mesure le gain apporté par le skill.

Aujourd'hui (`apps/nakiros/src/services/eval-runner.ts:480-481`), chaque
iteration recalcule la baseline (`config = ['with_skill', 'without_skill']`).
C'est inutile : la baseline ne dépend ni du skill ni du run en cours, mais
uniquement du **modèle IA** et des **inputs de l'eval**. Elle est stable
tant que ces deux ne changent pas.

**Économie attendue** : ~50% de tokens par iteration (on supprime un run
complet sur N iterations sur le même modèle).

---

## 2. Décisions tranchées

| # | Décision |
|---|----------|
| 1 | Clé de cache : `(skillName, evalName, modelFullId, evalFingerprint)` |
| 2 | `modelFullId` toujours résolu (jamais l'alias) — `claude-opus-4-7`, pas `opus` |
| 3 | Détection obsolescence : alias résolu vs cache → toast non-bloquant |
| 4 | Migration : pas de backfill. Les baselines existantes sont ignorées, recalcul à la 1ʳᵉ eval suivante. Script de ménage shippé pour les utilisateurs. |
| 5 | UI matrix : **inchangée**. La cellule garde sa double-info (`with_skill` haut, `baseline` bas), mais la ligne baseline vient du cache au lieu d'être recalculée. Tooltip discret au survol indiquant la date de calcul. |
| 6 | Toolbar : la checkbox "Inclure baseline" est supprimée (la baseline est toujours présente). Bouton "Recalculer la baseline" en menu secondaire (kebab). |
| 7 | Concurrence : pas de gestion. Une eval à la fois — on s'appuie sur la file existante. |
| 8 | Prompt obsolescence : toast non-bloquant après le lancement (pas de modal). |

---

## 3. Modèle de données

### 3.1 Stockage : fichiers JSON

**Décision (2026-04-27)** : on n'introduit **pas** SQLite. Le daemon n'a
aucune dépendance SQLite sur cette branche, et l'existant
([`conversation-analysis-cache.ts`](../../apps/nakiros/src/services/conversation-analysis-cache.ts))
utilise des fichiers JSON sous `~/.nakiros/cache/`. On reste cohérent.

Volumes : qq dizaines de baselines par skill max, qq KB chacune. Walk
filesystem pour `listBaselines` reste largement sous le ms.

### 3.2 Layout sur disque

Une baseline = un dossier qui contient sa metadata + ses artefacts :

```
~/.nakiros/baselines/<skill_name>/<eval_name>/<model_full_id>/<eval_fingerprint>/
  ├─ baseline.json    ← metadata (stats, computedAt, version)
  ├─ run.json
  ├─ grading.json
  ├─ timing.json
  └─ outputs/
```

Le fichier `baseline.json` contient :

```ts
interface BaselineRecordV1 {
  version: 1;
  skillName: string;
  evalName: string;
  modelFullId: string;
  evalFingerprint: string;
  stats: EvalConfigStats; // shape importé depuis services/eval-benchmark.ts
  computedAt: number;     // epoch ms
}
```

Comme [`conversation-analysis-cache.ts`](../../apps/nakiros/src/services/conversation-analysis-cache.ts),
on bump `version` quand le shape change → les anciens fichiers sont
ignorés et la baseline recalculée.

### 3.3 Atomicité des écritures

`upsert` = `writeFileSync(tmp)` puis `renameSync(tmp, final)` pour éviter
les fichiers partiels en cas de crash pendant l'écriture. Pattern
identique à ce qu'on fera plus tard si on réintroduit SQLite via la
branche `feat/friction-to-skill-proposals`.

### 3.3 `evalFingerprint`

Hash stable de tout ce qui peut invalider une baseline **côté inputs de
l'eval** (sans toucher au SKILL.md) :

```ts
evalFingerprint = sha256(canonicalJson({
  prompts: eval.prompts,        // contenu intégral
  fixtures: eval.fixtures,       // contenu intégral
  grading: eval.grading_rubric, // contenu intégral
}))
```

Si l'utilisateur édite un prompt, le fingerprint change → cache miss →
baseline recalculée automatiquement.

---

## 4. Changements daemon

### 4.1 Eval runner (`apps/nakiros/src/services/eval-runner.ts`)

**Avant** (lignes 480-481) :

```ts
const includeBaseline = request.includeBaseline === true;
const configs: EvalRunConfig[] = includeBaseline
  ? ['with_skill', 'without_skill']
  : ['with_skill'];
```

**Après** :

```ts
// Toujours with_skill. La baseline est gérée séparément, via cache.
const configs: EvalRunConfig[] = ['with_skill'];

// Avant le run, pour chaque (eval, modelFullId) requis :
const baselineKey = { skillName, evalName, modelFullId, evalFingerprint };
const cached = await baselineStore.get(baselineKey);
const forceRefresh = request.refreshBaseline === true;

if (!cached || forceRefresh) {
  // Calcule la baseline et la persiste
  const stats = await runBaselineConfig(...);
  await baselineStore.upsert(baselineKey, stats);
}
// Sinon : on n'exécute rien — la baseline cachée est réutilisée.
```

### 4.2 Nouveau module `baseline-store.ts`

```ts
interface BaselineRecord {
  skillName: string;
  evalName: string;
  modelFullId: string;
  evalFingerprint: string;
  stats: BenchmarkConfigStats;
  artifactsPath: string;
  computedAt: number;
}

interface BaselineStore {
  get(key: BaselineKey): Promise<BaselineRecord | null>;
  upsert(key: BaselineKey, stats: BenchmarkConfigStats, artifactsPath: string): Promise<void>;
  list(filter: { skillName?: string; modelFullId?: string }): Promise<BaselineRecord[]>;
  delete(key: BaselineKey): Promise<void>;
}
```

### 4.3 Résolution alias → modelFullId

Aujourd'hui `model: 'opus' | 'sonnet' | 'haiku'` côté `StartEvalRunRequest`.
Ajouter une fonction de résolution canonique :

```ts
// packages/shared/src/constants/claude-models.ts
export const CURRENT_MODEL_FULL_IDS: Record<ClaudeModelAlias, string> = {
  opus:   'claude-opus-4-7',
  sonnet: 'claude-sonnet-4-6',
  haiku:  'claude-haiku-4-5-20251001',
};

export function resolveModelFullId(model: string): string {
  // Si déjà un full id, on retourne tel quel
  if (model.startsWith('claude-')) return model;
  return CURRENT_MODEL_FULL_IDS[model as ClaudeModelAlias] ?? model;
}
```

Cette table devient le point de vérité pour la **détection d'obsolescence** :
quand une baseline en cache a un `model_full_id` qui n'est plus dans
`CURRENT_MODEL_FULL_IDS` (pour aucun alias), elle est obsolète.

---

## 5. Changements IPC

### 5.1 `eval:startRuns`

Le payload `StartEvalRunRequest` perd `includeBaseline`, gagne
`refreshBaseline` :

```diff
 interface StartEvalRunRequest {
   skillId: string;
   evals: string[];
-  includeBaseline?: boolean;
+  refreshBaseline?: boolean; // force recalcul de la baseline pour ce run
   model?: string;
 }
```

### 5.2 Nouveau channel : `eval:listBaselines`

Pour la UI : récupérer toutes les baselines connues d'un skill (sert au
tooltip + au menu "Recalculer baseline").

```ts
// packages/shared/src/ipc-channels.ts
'eval:listBaselines': IpcChannel;

interface ListBaselinesRequest {
  skillName: string;
}
interface ListBaselinesResponse {
  baselines: Array<{
    evalName: string;
    modelFullId: string;
    evalFingerprint: string;
    stats: BenchmarkConfigStats;
    computedAt: number;
    isObsolete: boolean; // calculé côté daemon vs CURRENT_MODEL_FULL_IDS
  }>;
}
```

### 5.3 Nouveau channel : `eval:refreshBaseline`

Action explicite "Recalculer la baseline" depuis la UI :

```ts
'eval:refreshBaseline': IpcChannel;

interface RefreshBaselineRequest {
  skillName: string;
  evalName: string;
  modelFullId: string;
}
// Retourne via event broadcast classique (run progress / result)
```

### 5.4 `eval:getMatrix` enrichi

La réponse `EvalMatrix` doit exposer pour chaque cellule la baseline
correspondante (jointure côté daemon : pour chaque iteration, on trouve sa
baseline via `(skillName, evalName, modelFullId, evalFingerprint)`).

```diff
 interface EvalMatrixCell {
   iteration: number;
   modelFullId: string | null;
   withSkill: BenchmarkConfigStats | null;
-  withoutSkill: BenchmarkConfigStats | null;
+  baseline: {
+    stats: BenchmarkConfigStats;
+    computedAt: number;
+    isObsolete: boolean;
+  } | null;
 }
```

### 5.5 Mise à jour des 4 fichiers d'alignement IPC

Conformément au CLAUDE.md du projet :

1. `packages/shared/src/ipc-channels.ts` (constantes + types)
2. `apps/nakiros/src/daemon/handlers/eval.ts` (impl) + `index.ts` (registration)
3. `apps/frontend/src/lib/nakiros-client.ts`
4. `apps/frontend/src/global.d.ts`

---

## 6. Changements UI

### 6.1 Cellule de matrix (`EvalMatrixCell.tsx`)

**Comportement visuel inchangé** — toujours deux valeurs empilées. Source
des données :

- Haut : `cell.withSkill.passRate` (calculé à chaque run)
- Bas : `cell.baseline.stats.passRate` (lookup cache, partagé entre
  iterations sur le même modèle)

Ajouts :
- `title` (tooltip natif HTML) sur la valeur baseline :
  `"Baseline calculée le 24/04/2026 sur claude-opus-4-7"`
- Si `cell.baseline.isObsolete` → petit dot orange à côté de la valeur
  (sans rien casser de la lecture normale)

### 6.2 Toolbar de la matrix

- Suppression de la checkbox "Inclure baseline"
- Ajout d'un menu kebab `⋮` à côté du bouton "Run eval", contenant :
  - "Recalculer la baseline (modèle courant)"
  - "Recalculer toutes les baselines"
  - "Voir baselines obsolètes" (toggle dans la matrix : grise les
    iterations dont la baseline est obsolète)

### 6.3 Toast d'obsolescence

Au démarrage d'une eval, si le daemon détecte que la baseline cachée
pour `(skill, eval, modelFullId)` est obsolète au sens de `isObsolete`
(modèle plus dans `CURRENT_MODEL_FULL_IDS`) :

- Toast non-bloquant (réutiliser le système de toast existant —
  vérifier `apps/frontend/src/components/ui/toast.tsx`)
- Message : `"Baseline obsolète (claude-opus-4-6 → claude-opus-4-7).
  L'eval utilise l'ancienne baseline."`
- Actions : `[Recalculer maintenant]` (déclenche `eval:refreshBaseline`)
  | `[Plus tard]`

### 6.4 i18n

Nouvelles clés (namespace `eval`) :
- `baseline.computedAt`
- `baseline.obsolete.title`
- `baseline.obsolete.message`
- `baseline.refreshAction`
- `toolbar.menu.refreshBaseline`
- `toolbar.menu.refreshAllBaselines`
- `toolbar.menu.showObsoleteBaselines`

---

## 7. Migration

### 7.1 Côté code

Pas de backfill automatique des `iteration-N/.../without_skill/`
existants. La 1ʳᵉ eval lancée après merge calcule la baseline et la
persiste.

### 7.2 Côté utilisateur

Script de ménage shippé dans `apps/nakiros/scripts/cleanup-old-baselines.ts`
(à appeler manuellement ou via `nakiros baseline:cleanup`) qui :

1. Liste les répertoires `iteration-*/.../without_skill/` orphelins
2. Affiche l'espace disque récupérable
3. Sur confirmation, les supprime

Pas une action critique — l'utilisateur n'est pas bloqué s'il ne lance
pas le script. Les anciens dossiers traînent juste sans conséquence
fonctionnelle.

---

## 8. Plan PRs

| PR | Scope | Critère de merge |
|----|-------|------------------|
| **PR1 — daemon: baseline-store** | Nouvelle table SQLite, module `baseline-store.ts`, helper `resolveModelFullId`, fingerprint. Pas encore branché au runner. | Tests unitaires sur store (CRUD + obsolescence). |
| **PR2 — daemon: runner réutilise le cache** | `eval-runner.ts` modifié : lookup avant calcul, persiste après. `includeBaseline` → `refreshBaseline` côté request. Aligner les 4 fichiers IPC. | Eval lancée 2× sur même modèle → baseline n'est calculée qu'1× (vérifié via logs daemon). |
| **PR3 — IPC: listBaselines + refreshBaseline + EvalMatrix enrichi** | Nouveaux channels + handlers + types côté shared/client/d.ts. | TS strict OK sur les 3 paquets. Channel testable manuellement via DevTools. |
| **PR4 — UI: cellule + tooltip + toolbar** | `EvalMatrixCell.tsx` (tooltip baseline), suppression checkbox, menu kebab avec actions. | Visuel inchangé en cas de baseline non-obsolète. |
| **PR5 — UI: toast obsolescence + script cleanup** | Toast + bouton recalcul, script `baseline:cleanup`. | E2E manuel : forcer une baseline avec `model_full_id` factice, lancer eval, voir le toast. |

PR1 et PR3 sont indépendantes des autres et peuvent être parallélisées
si besoin. PR4 dépend de PR3 (enrichissement matrix). PR5 dépend de PR3.

---

## 9. Invariants à tester

1. **Cache hit** : 2 iterations consécutives sur même `(skill, eval, modelFullId, fingerprint)` → 1 seul run baseline.
2. **Invalidation par fingerprint** : éditer `prompts/0001.md` d'un eval entre deux iterations → la baseline est recalculée.
3. **Invalidation par modèle** : changer le modèle entre deux iterations → la baseline est recalculée pour le nouveau modèle.
4. **Pas de cross-skill** : deux skills A et B avec des prompts identiques → baselines stockées séparément (la clé inclut `skillName`).
5. **Détection obsolescence** : une baseline avec `model_full_id = 'claude-opus-4-6'` retourne `isObsolete: true` quand `CURRENT_MODEL_FULL_IDS.opus = 'claude-opus-4-7'`.
6. **Refresh forcé** : `refreshBaseline: true` dans le payload `eval:startRuns` recalcule même si le cache est valide.
7. **Multi-modèles côte à côte** : iterations 1 (Opus 4.7), 2 (Sonnet 4.6), 3 (Opus 4.7) → 2 entrées en cache, Iter 1 et Iter 3 partagent la même valeur baseline.
8. **Migration** : un workspace existant avec d'anciennes `iteration-*/without_skill/` ne crash pas le daemon — elles sont juste ignorées.

---

## 10. Hors scope

- Pas de baseline "promotable" depuis un run existant (concept évoqué
  dans le mockup `screens-runs.jsx:554` "Marquer comme baseline" — pas
  utile dans cette refonte).
- Pas d'historique des baselines obsolètes consultable comme un changelog
  — elles sont conservées en base mais n'ont pas d'écran dédié. Si
  besoin plus tard, on ajoutera un écran "History" en Phase ultérieure.
- Pas de partage de baselines entre projets/utilisateurs (local-first
  strict, conformément au CLAUDE.md).
