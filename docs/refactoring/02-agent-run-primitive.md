# Vision architecturale — la primitive `AgentRun`

> Branche : `refactor/duplication-audit` · Date : 2026-04-25
> Document compagnon : [`01-code-audit.md`](./01-code-audit.md)

Cible long terme pour Nakiros : **une seule primitive uniforme** pour
tout ce qui implique un agent Claude qui tourne, peu importe son rôle
(audit, eval, fix, create, demain analyse de conversation,
brainstorming, refactor assisté…). Toute fonctionnalité future qui
nécessite un agent doit s'appuyer sur cette primitive — pas un nouveau
runner spécialisé, pas un nouveau channel, pas une nouvelle modale qui
perd son spinner.

## 1. Pourquoi

Aujourd'hui Nakiros a **4 runners spécialisés** (audit, eval, fix,
create) qui font conceptuellement la même chose : spawn Claude, stream
des events, persister, parfois interagir avec l'humain, finir.

Conséquences observées :
- Chaque runner re-code son registry, sa réhydratation au boot, ses
  events, sa modale, ses contrôles.
- Les capacités divergent silencieusement : eval n'accepte pas de
  message utilisateur, audit oui — sans raison conceptuelle.
- Quand l'utilisateur ferme une modale qui contient un run, il perd la
  trace visuelle de ce qui tourne.
- Ajouter une 5e fonctionnalité agentique (analyse profonde de
  conversation, par ex.) demanderait de tout recommencer.

> **Postulat fondateur** : on est sur une IA générative. Quel que soit
> son rôle, elle peut driver, demander quelque chose, avoir besoin d'un
> coup de main. **La boucle humaine n'est jamais optionnelle**, elle
> est juste plus ou moins sollicitée selon le `kind`.

## 2. La primitive `AgentRun`

```ts
type AgentRun = {
  id: string;
  kind: 'audit' | 'eval' | 'fix' | 'create' | 'analyze-convo' | string;
  title: string;
  target: { type: string; ref: string };  // skill, conversation, project, …
  status: 'pending' | 'running' | 'awaiting-input' | 'done' | 'failed' | 'cancelled';
  startedAt: string;
  endedAt?: string;
  events: AgentEvent[];
  capabilities: {
    canSendMessage: boolean;   // true par défaut
    canApprove: boolean;       // true par défaut
    canStop: boolean;          // true par défaut
  };
  landingRoute: (run: AgentRun) => string;  // déclaré par le kind
};

type AgentEvent =
  | { kind: 'tool_call'; tool: 'read'|'write'|'bash'|'edit'|...; input: unknown; output?: unknown; ts: string }
  | { kind: 'agent_msg'; text: string; ts: string }
  | { kind: 'user_msg'; text: string; ts: string }
  | { kind: 'approval_request'; question: string; resolved?: 'accept'|'reject'; ts: string }
  | { kind: 'result'; payload: unknown; ts: string }
  | { kind: 'error'; message: string; ts: string };
```

Côté daemon, `BaseRunner<TKind, TEvent>` dans `runner-core/` implémente
le lifecycle commun (registry, persistence sous `~/.nakiros/runs/`,
EventLog, réhydratation au boot, interaction utilisateur, cleanup).
Chaque `kind` hérite et override seulement ce qui lui est propre :
`prepareWorkdir`, `executeFirstTurn`, `finalize`.

Côté frontend, `useAgentRun(runId)` retourne un état réactif depuis un
store global. **N'importe quel composant** peut s'y abonner — y
compris un bouton "Start audit" en bas d'une liste de skills, qui se
verra automatiquement à l'état "running" si un audit est déjà en cours
sur ce skill.

## 3. Modèle UX — 3 surfaces

### Surface 1 — Triggers (n'importe où)

Un trigger est un bouton, un menu, une action dans une modale. Son seul
job est d'appeler `startRun(kind, target)` et de refléter l'état via le
store global. **Un trigger ne contient jamais le run.**

### Surface 2 — Centre de runs (topbar permanent)

- Icône permanente top-right, badge avec le compteur de runs actifs.
- Au clic → **panneau type centre de notification** (popover latéral
  léger, pas plein écran).
- Liste : runs actifs en haut, récents en dessous. Chaque entrée affiche
  `kind` + cible + status + spinner (si actif).
- Quand un run **termine** alors qu'il n'est pas à l'écran : badge sur
  l'icône + entrée marquée "terminé" dans le panneau.
- Pas de notification système OS (peu utile si l'utilisateur n'a pas
  autorisé Nakiros à envoyer des notifs ; le badge in-app est suffisant
  et toujours visible).

### Surface 3 — Écran natif d'origine du run

C'est **l'écran où le run a été déclenché** (skill X → onglet Audit,
projet Y → vue Eval, etc.) qui sert de workspace. Pas de nouveau
workspace générique `/runs/:id`.

Conséquences :
- Chaque vue native (`AuditView`, `EvalRunsView`, `FixView`, future
  `AnalyzeConvoView`, …) doit être **deep-linkable** sur un `runId` et
  réhydrater son état (events, status, controls) à l'entrée.
- Chaque `kind` déclare sa `landingRoute(run)` dans son contrat.
  Exemple : `kind:'audit'` → `/skills/:name?tab=audit&run=:id`.
- Quand l'utilisateur clique sur un item du centre de runs, on
  `navigate(landingRoute(run))`. Il atterrit pile-poil là où il avait
  démarré, et peut continuer à interagir.

**Règle** : un run **ne vit jamais dans une modale**. Une modale peut le
*déclencher*, jamais le *contenir*.

## 4. Boucle humaine systématique

Tous les runs, quel que soit le `kind`, exposent les mêmes capacités :
`canSendMessage`, `canApprove`, `canStop` (par défaut `true`).

- **Send message** : input texte permanent dans le panneau
  d'interaction. Vide ou peu utilisé pour un audit "passif" — toujours
  présent et fonctionnel.
- **Approve / Reject** : si l'agent émet un `approval_request`, le run
  passe en `awaiting-input` et l'UI propose accept/reject. C'est la
  capacité qui transforme Nakiros d'un *outil de batch* en *workshop
  collaboratif*.
- **Stop** : annulation propre, cleanup automatique du workdir.

Pas de runner "muet". L'IA peut driver à tout moment ; on lui laisse la
place de demander quelque chose, partout.

## 5. Bibliothèque de composants partagés

Pour ne pas finir avec 15 écrans différents, **toutes les vues run
réutilisent la même bibliothèque** :

| Composant | Rôle | Slot kind-spécifique ? |
|---|---|---|
| `RunControlHeader` | Back + title + `RunStatusBadge` + elapsed + tokens + Stop/Finish | non |
| `RunStatusBadge` | Pill couleur + label par status (pending/running/awaiting-input/done/failed/cancelled) | non |
| `AgentActivityFeed` | Affiche `events[]` : tool_call (Read/Write/Bash/Edit/…), agent_msg, user_msg, approval_request, result, error | renderer custom optionnel par kind d'événement |
| `HumanInteractionPanel` | Textarea send-message + boutons approve/reject quand `awaiting-input` | non |
| `RunResultPanel` | Conteneur du résultat final (audit report, eval matrix, fix diff, …) | **slot kind-spécifique** (la seule chose qui varie réellement) |
| `RunsCenter` | Topbar pill + panneau centre de notifications | non |
| `useAgentRun(id)` | Hook subscribe global au store des runs | non |
| `useAgentRuns(filter?)` | Liste runs actifs/récents (alimente `RunsCenter`) | non |
| `usePolling(fn, ms)` | Pattern setInterval+cleanup générique | non |

**Les écrans natifs (`AuditView`, etc.) deviennent des compositions** :

```tsx
<RunControlHeader run={run} />
<div className="grid grid-cols-2">
  <AgentActivityFeed events={run.events} />
  <RunResultPanel run={run}>
    <AuditReportView report={run.result} />  {/* slot kind-spécifique */}
  </RunResultPanel>
</div>
<HumanInteractionPanel run={run} onSend={...} onApprove={...} />
```

Ajouter un nouveau `kind` = écrire :
1. La sous-classe de `BaseRunner` côté daemon (lifecycle override)
2. Le système prompt et la cible (target type)
3. Le composant slot pour `RunResultPanel` (souvent ~50 LOC)
4. La `landingRoute` (souvent une route existante)

**Tout le reste est gratuit.**

## 6. Décisions actées

| Question | Décision |
|---|---|
| Concurrence | **1 run actif par cible** (1 audit par skill, 1 fix par skill, etc.). Le batch eval reste un cas particulier toléré. |
| Notifications de fin | Badge sur l'icône topbar + entrée marquée "terminé" dans le centre de runs. **Pas de notif système OS** (peu utile si non autorisée). |
| Boucle humaine | **Systématique** sur tous les `kind`. Pas de runner muet ; capacités toujours exposées. |
| Workspace | **Écran natif d'origine deep-linké**. Pas de route générique `/runs/:id`. |
| Migration | **Progressive (option B)** : audit → fix → create → eval. Permet de tester chaque palier en condition réelle. |

## 7. Plan de migration — option B (progressive)

### Étape 0 — Préparer le terrain (Phase 1 + 2 du doc 01)

- Quick wins (`services/skill-fs/`, types remontés, primitives `ui/*`
  utilisées, hooks de polling).
- Construire la bibliothèque de composants Run (`RunControlHeader`,
  `RunStatusBadge`, `AgentActivityFeed`, `HumanInteractionPanel`,
  `RunResultPanel`, `RunsCenter`, `useAgentRun`).
- Construire `BaseRunner<TKind, TEvent>` dans `runner-core/` (sans
  l'utiliser encore).

### Étape 1 — Migrer `audit`

- Cas le plus simple, déjà bien câblé.
- Récrire `audit-runner.ts` en sous-classe de `BaseRunner`.
- `AuditView.tsx` devient une composition de la bibliothèque.
- Câbler `RunsCenter` pour qu'il liste les audits actifs.
- **Critère de validation** : un audit lancé survit à un refresh, à
  une navigation ailleurs, à une fermeture/réouverture du panneau du
  centre de runs.

### Étape 2 — Migrer `fix`

- Quasi-identique à audit. Le seul piège : workdir tmp au lieu de
  symlink. Le `BaseRunner` aura déjà absorbé l'abstraction.

### Étape 3 — Migrer `create`

- Très proche de fix. Sert à valider que la primitive supporte un
  workflow plus libre (le `target` peut être "skill en construction"
  avant que le skill existe).

### Étape 4 — Migrer `eval`

- Le plus complexe : sandboxes, grading (script/llm/manual),
  benchmarking, batch concurrent.
- Au moment où on l'aborde, le contrat `BaseRunner` sera mûr — on
  saura quoi étendre et quoi laisser dans `eval-runner` (la couche
  sandbox/grading reste spécifique).
- C'est aussi l'occasion d'introduire la boucle humaine sur eval (qui
  ne l'avait pas).

### Étape 5 — Nouvelle fonctionnalité = preuve

- Implémenter "analyse profonde de conversation" en partant de zéro
  pour valider que le coût d'ajout d'un `kind` est bien réduit à
  ~150-250 LOC (sous-classe runner + slot result + system prompt).

## 8. Critères de réussite

- ✅ N'importe quel run survit à : refresh, navigation, fermeture du
  centre de runs, redémarrage du daemon.
- ✅ Un bouton "Start X" partout dans l'app reflète l'état d'un run en
  cours sur la même cible (spinner sync entre toutes les surfaces).
- ✅ Le feed d'activité (Read/Write/Bash/…) est visible et identique
  sur tous les `kind`.
- ✅ La boucle humaine (send + approve) est disponible sur tous les
  `kind`, même si peu utilisée par certains.
- ✅ Ajouter un nouveau `kind` se fait en < 1 jour (sans réécrire le
  lifecycle, l'UI ou le centre de runs).
- ✅ Aucun écran ne réimplémente un header de run ou un activity feed.

## 9. Ce qui n'est pas dans le scope

- **Réorganisation des routes** au-delà du deep-link `?run=:id` ajouté
  aux écrans natifs existants.
- **Notifications système OS** (décision actée : non).
- **Multi-utilisateur / multi-machine** (Nakiros reste local-first).
- **Workflows multi-agents** (un run = un agent ; orchestrer plusieurs
  agents reste une couche au-dessus, pas dans la primitive).
