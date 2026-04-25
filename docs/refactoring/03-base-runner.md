# Cadrage — `BaseRunner` (Phase 3 du plan d'audit)

> Branche : `refactor/duplication-audit` · Date : 2026-04-25
> Documents compagnons : [`01-code-audit.md`](./01-code-audit.md), [`02-agent-run-primitive.md`](./02-agent-run-primitive.md)

## Objectif

Factoriser le **lifecycle commun** des 4 runners daemon
([`audit-runner.ts`](../../apps/nakiros/src/services/audit-runner.ts) 532 LOC,
[`fix-runner.ts`](../../apps/nakiros/src/services/fix-runner.ts) 906 LOC,
[`eval-runner.ts`](../../apps/nakiros/src/services/eval-runner.ts) 1016 LOC,
+ `create` qui est déjà alias de `fix`) dans un `runner-core/runner.ts`
unique. Chaque runner ne garde plus que ses spécificités (workdir, prompt,
artefact, cleanup) — le reste (registry, IPC, persistance, événements,
rehydratation) tombe d'un seul endroit.

## Diagnostic — ce qui est dupliqué

Lecture croisée des 3 fichiers :

| Capacité | audit | fix | eval | runner-core actuel |
|---|---|---|---|---|
| Registry `Map<runId, Entry>` | ✓ | ✓ | ✓ | ❌ |
| Boot recovery (`restoreOrCleanup*`) | ✓ | ✓ | ❌ (pas réhydraté) | ❌ |
| `executeTurn` (status starting → spawn → push turn → emit done) | ✓ | ✓ ≈ id. | ✓ ≈ id. | ❌ |
| Persistance `run.json` à chaque transition | ✓ | ✓ | ✓ | ✅ `persistRunJson` |
| EventLog + broadcast + reset par turn | ✓ | ✓ | ✓ | ✅ `EventLog` |
| `isActiveRunStatus` | ✓ | ✓ | ✓ | ✅ centralisé |
| `cleanupRunWorkdir` (claude-projects entry + workdir) | ✓ | ✓ | ✓ (sandbox) | ✅ centralisé |
| `listActive` / `listAll` / `getRun` / `getBufferedEvents` | ✓ | ✓ | ✓ | ❌ boilerplate dupliqué |
| `sendUserMessage` (gate `waiting_for_input` → resume turn → maybeFinalize) | ✓ | ✓ | ✓ | ❌ |
| `stop` (kill child, status `stopped`, cleanup) | ✓ | ✓ | ✓ | ❌ |
| `findActiveForTarget` (idempotence sur scope/skill) | ✓ | ✓ | partiel | ❌ |

`executeTurn` audit (lignes 288-352) et fix (lignes 519-590) sont
**99 % identiques** — la seule diff : fix passe `skipPermissions: true`
dans `buildClaudeArgs` et nettoie le tempWorkdir sur failure.

## Ce qui varie réellement

| Variation | audit | fix | create | eval |
|---|---|---|---|---|
| `prepareWorkdir` | symlink skill → `{run}/.claude/skills/<name>` | seed temp avec copie skill + audit + iteration | temp vide | sandbox git-worktree |
| `buildFirstPrompt` | `/factory audit <skill>` | `/factory fix <skill>` + post-script | `/factory create <skill>` + design questions | prompt eval (depuis `evals.json`) |
| Politique post-turn (`maybeFinalize` / `maybeWait`) | check `outputs/audit-report.md` → finalize ou wait | toujours wait | toujours wait | grade (script/llm/manual) → terminate |
| `finish` (action utilisateur) | copier le report dans `{skill}/audits/` | sync workdir → vrai skill | sync workdir → créer skill | N/A |
| Cleanup terminal | `cleanupRunWorkdir(workdir)` | `destroyTmpSandbox(temp)` | id. | `destroyEvalSandbox(sandbox)` |
| Concurrence | 1 run actif par skill | 1 run actif par skill | 1 run actif par skill | **N runs en batch** (with/without × M modèles) |
| Boot recovery | rehydrate non-terminal + completed; cleanup stopped/failed | cleanup tout (workdirs jetables) | id. | actuellement absent |
| Type `Run` | `AuditRun` | `AuditRun` (même shape, statut workdir = temp) | id. fix | `SkillEvalRun` (différent : prompt, evalName, model, gradingResult) |

## Décision de structure : factory function, pas classe abstraite

Le codebase est fonctionnel ESM (zéro hiérarchie de classes ailleurs côté
daemon). Une factory `createRunner(spec)` qui retourne `{ start, ... }` :
- évite le `this` et les surprises de binding ;
- typecheck sans `protected/abstract` mental overhead ;
- facilite la migration progressive (on peut construire la factory sans
  casser les modules existants, puis swapper file-by-file) ;
- testable en injection pure (pas besoin de subclasser).

## API proposée

### Module `apps/nakiros/src/services/runner-core/runner.ts`

```ts
export interface BaseRun {
  runId: string;
  status: 'starting' | 'running' | 'waiting_for_input' | 'completed' | 'failed' | 'stopped';
  sessionId: string | null;
  workdir: string;
  turns: AuditRunTurn[];
  tokensUsed: number;
  durationMs: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

export interface RunEntry<TRun extends BaseRun, TEvent> {
  run: TRun;
  child: ChildProcess | null;
  killed: boolean;
  eventLog: EventLog<TEvent>;
  // Kind peut attacher des champs en plus via une intersection :
  //   type AuditEntry = RunEntry<AuditRun, AuditEvent> & { skillDir: string }
}

export interface RunnerSpec<TRun extends BaseRun, TStartReq, TEvent> {
  /** Discriminator écrit dans `~/.nakiros/runs/<kind>/`. */
  kind: string;
  /** Racine où chaque run écrit son `run.json` + workdir persistant. */
  runsRoot(): string;

  /** Construit le runId, prépare le workdir physique, retourne le path. */
  prepareWorkdir(req: TStartReq, runId: string, opts: RunOpts): {
    workdir: string;
    extras?: Partial<RunEntry<TRun, TEvent>>; // skillDir, tempWorkdir, sandboxRoot, …
  };

  /** Premier prompt envoyé à Claude (sans `--resume`). */
  buildFirstPrompt(req: TStartReq, ctx: { workdir: string; runId: string }): string;

  /** Construit l'objet `TRun` initial à partir de la requête. */
  createInitialRun(req: TStartReq, runId: string, workdir: string): TRun;

  /**
   * Hook par-turn : surcharge facultative des arguments CLI
   * (fix passe `skipPermissions: true`, audit non).
   */
  buildCliArgs?(prompt: string, run: TRun, isFirstTurn: boolean): BuildArgsOptions;

  /**
   * Appelé après chaque turn réussi. Décide :
   *   - audit : check artefact → `finalize(entry)` ou `wait(entry)`
   *   - fix/create : `wait(entry)` toujours
   *   - eval : `grade(entry)` → `completeWithGrading(entry)`
   * Reçoit les helpers `wait` / `finalize` du core pour ne pas dupliquer.
   */
  onTurnComplete(entry: RunEntry<TRun, TEvent>, helpers: PostTurnHelpers<TEvent>): void;

  /** Cleanup terminal (stop / failed). Différent par kind (workdir vs sandbox vs tmp). */
  cleanupOnTerminal(entry: RunEntry<TRun, TEvent>): void;

  /**
   * Action utilisateur "finish" (différente de la terminaison naturelle).
   * audit : copier le report. fix : sync back. create : sync back avec garde
   * "skill exists already". eval : N/A.
   */
  finish?(entry: RunEntry<TRun, TEvent>, opts: RunOpts): void;

  /** Idempotence du `start` sur un même target. */
  findActiveForTarget?(req: TStartReq, registry: Map<string, RunEntry<TRun, TEvent>>): RunEntry<TRun, TEvent> | null;

  /** Politique de gate sur sendUserMessage. Défaut : `status === 'waiting_for_input'`. */
  canSendUserMessage?(entry: RunEntry<TRun, TEvent>): boolean;

  /**
   * Rehydratation au boot. Reçoit le JSON persisté + le path workdir.
   * Retourne `{ rehydrate: true, run, extras }` ou `{ cleanup: true }`.
   * Audit rehydrate `completed` + collapse `running → stopped`.
   * Fix/create cleanup tout (workdirs jetables).
   */
  rehydrate?(persisted: unknown, workdir: string): RehydrateResult<TRun>;
}

export interface RunnerInstance<TRun extends BaseRun, TStartReq, TEvent> {
  start(req: TStartReq, opts: RunOpts): TRun;
  sendUserMessage(runId: string, message: string, opts: RunOpts): Promise<void>;
  stop(runId: string): void;
  finish?(runId: string, opts: RunOpts): void;
  getRun(runId: string): TRun | null;
  listActive(): TRun[];
  listAll(): TRun[];
  getBufferedEvents(runId: string): TEvent[];
  restoreOrCleanup(): void;
}

export function createRunner<TRun extends BaseRun, TStartReq, TEvent>(
  spec: RunnerSpec<TRun, TStartReq, TEvent>,
): RunnerInstance<TRun, TStartReq, TEvent> { /* … */ }
```

`PostTurnHelpers<TEvent>` expose `wait(entry)` (transition
`waiting_for_input` + emit) et `finalize(entry, { onSuccess })` que le
spec compose à sa guise.

## Migration — option B (progressive, validée par doc 02 §7)

### Étape 0 — livrer `runner.ts` sans rien casser

- Implémenter `createRunner` + tests-unitaires sur un kind synthétique
  (mock `spawnClaudeTurn`).
- Ne pas toucher aux 3 runners existants. `tsc` reste vert.

### Étape 1 — migrer `audit-runner`

- Récrire en ~150 LOC avec le spec (workdir = symlink, post-turn = check
  artefact). Garder les exports publics nommés (`startAudit`,
  `sendAuditUserMessage`, …) — ils délèguent au runner instancié.
- **Critère de validation** : lancer un audit, attendre la fin → fichier
  `audits/audit-{ISO}.md` produit ; redémarrer daemon en plein run →
  rehydratation correcte ; click stop pendant un turn → cleanup workdir.

### Étape 2 — migrer `fix-runner` (donc `create` aussi)

- `prepareWorkdir` = seed temp + copie skill. `cleanupOnTerminal` =
  `destroyTmpSandbox`. `finish` = sync back.
- Le spec accepte un `mode: 'fix' | 'create'` dans `TStartReq` ; le seul
  vrai diff est dans `prepareWorkdir` (copy vs empty) et dans le prompt
  initial.
- **Critère de validation** : flow fix complet (start, send, run-evals,
  finish syncback) ; flow create complet (start vide, send, finish,
  skill créé).

### Étape 3 — migrer `eval-runner` *(décision : conserver le batch)*

- Cas le plus tortueux : batch concurrent + grading.
- **Décision actée** : conserver le modèle batch existant
  (`startEvalRuns(request)` retourne plusieurs `runIds`). `createRunner`
  reste **per-run** côté core ; `startEvalRuns` orchestre N appels à
  `runner.start()`. Pas d'introduction d'un mode "batch" dans le spec
  — chaque entrée du registry reste un run indépendant comme aujourd'hui.
- **Rehydratation au boot — IN SCOPE** : les runs eval coûtent cher en
  tokens, on ne veut pas en perdre sur un reboot. `spec.rehydrate`
  pour eval :
  - `completed` / `failed` / `stopped` → rehydrate (user peut revoir
    le résultat dans `EvalRunsView`).
  - `running` / `starting` / `grading` → collapse `stopped` (le child
    est mort, le grading est partiel — on garde la conversation et les
    tokens consommés visibles).
  - `waiting_for_input` → rehydrate (rare en eval mais l'utilisateur
    peut continuer via `--resume`).
- **Critère de validation** : batch eval `with/without × N modèles`
  toujours fonctionnel ; grading produit le même résultat qu'avant ;
  feedback humain persisté ; **un reboot daemon en plein batch laisse
  les runs visibles dans `EvalRunsView` avec leurs turns/tokens
  préservés**.

### Étape 4 — finition

- Plus aucun usage direct de `audits.set / fixes.set / evalRuns.set` à
  l'extérieur du runner instance.
- `runner-core/index.ts` ré-exporte `createRunner` et les types.
- `audit-runner.ts` / `fix-runner.ts` / `eval-runner.ts` deviennent des
  fichiers fins (~150-300 LOC chacun) — uniquement le spec + les
  ré-exports nommés que les handlers IPC consomment.

## Risques identifiés

1. **Type-paramétrage du status**. `BaseRun.status` ne couvre pas
   `'queued'` / `'grading'` (eval). Solution : élargir le type union
   dans `BaseRun` (la grande union supportée par `RunStatusBadge` côté
   front sert déjà de référence) — chaque runner contraint son sous-set
   via les types métier (`AuditRun.status` reste son sous-set, eval son
   sur-set).
2. **`extras` typé sans `any`**. Le shape de `RunEntry` varie
   (skillDir pour audit, tempWorkdir pour fix, sandbox pour eval). Solution :
   `RunEntry<TRun, TEvent, TExtras>` avec un 3ᵉ paramètre générique
   défaultant à `unknown`.
3. **Rehydratation eval — décision : in scope**. eval-runner ne
   réhydrate rien aujourd'hui ; on l'ajoute dans cette phase parce que
   les runs eval coûtent cher en tokens. La complexité est limitée :
   le batch n'a pas besoin d'être réhydraté en tant que batch (les
   runs sont indépendants au niveau du registry), seul chaque run
   individuel est rehydraté. Cf. Étape 3 pour le détail des transitions.
4. **Idempotence du `start`**. `findActiveForTarget` doit pouvoir lire
   le registry interne sans le fuiter. Le core passe une vue read-only
   (`ReadonlyMap`).
5. **Effets de bord IPC**. Les handlers IPC d'`audit/fix/create/eval`
   appellent les fonctions exportées (`startAudit`, …). Tant qu'on garde
   ces noms exportés (au-dessus du runner instance), aucune migration
   IPC n'est nécessaire.
6. **`finish` non symétrique**. Audit a un `finish` qui copie l'artefact ;
   fix/create un `finish` qui sync back ; eval n'en a pas. Le spec rend
   `finish` optionnel — l'instance `runner.finish` est elle-même
   optionnelle (`undefined` côté eval).

## Critères de succès

1. **LOC** : audit-runner ≤ 200, fix-runner ≤ 250, eval-runner ≤ 600.
2. **Comportement préservé** : pas un seul changement de contrat IPC,
   pas un changement visible côté frontend pour les flows critiques
   (audit / fix / create / eval / batch eval).
3. **`tsc` clean** sur les 3 packages TS.
4. **Smoke test manuel** par kind :
   - audit : start, send, attendre report, finish.
   - fix : start, send, run-evals, sync back.
   - create : start, send, finish.
   - eval : batch with/without sur 1 model + sur 3 models.
5. **Aucun fichier `dist/`** ni runtime impacté hors scope `runner-core/`
   et les 3 runners.

## Hors scope explicit

- **Promotion à la primitive `AgentRun` côté daemon** (un `Map<id, AgentRun>`
  centralisé, channel `agentRun:event` unifié) — vision long terme du
  doc 02 § Surface 1. Cette phase prépare le terrain mais ne le livre pas.
- **Ajout du kind `analyze-convo`** — relève de la mémoire
  [`project_nakiros_analyze_convo_run_kind_2026_04_25`](../../). Une fois
  `BaseRunner` livré, le ticket dit "150-250 LOC" — c'est la preuve à
  faire ensuite.
- **Réfacto eval batch en stream parallèle**. Le batch reste un appel
  unique côté API (`startEvalRuns(request) → runIds[]`) avec N runs
  indépendants dans le registry. La rehydratation eval, elle, est
  in scope (cf. Étape 3).
- **ESLint/CI guard sur les literals IPC** (item 15 de l'audit) — déféré.

## Estimation

| Étape | Effort |
|---|---|
| 0. `createRunner` + tests | 0,5 j |
| 1. Migration audit | 0,5 j |
| 2. Migration fix + create | 0,75 j |
| 3. Migration eval (incl. rehydratation) | 1,25 j |
| 4. Finition + smoke + docs/technical | 0,25 j |
| **Total** | **~3,25 j** |

À découper en autant de commits dédiés (un par étape).
