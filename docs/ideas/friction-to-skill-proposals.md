---
title: Friction → Skill proposals (boucle fermée analyzer → génération → éval)
date: 2026-04-22
status: ready-to-implement
branch: feat/friction-to-skill-proposals
---

# Friction → Skill proposals

## Problème

**Persona v1** : dev solo utilisant Claude Code sur ses propres projets avec ses propres skills.

Les deux features livrées récemment (conversation analyzer + multi-model eval) forment une boucle à 80 % fermée : l'analyzer détecte la friction, l'éval valide la qualité. Le **chaînon manquant** est la génération : transformer N frictions récurrentes en **propositions de skills** (nouveaux ou patches) qui comblent le gap — puis les valider via la suite d'éval existante.

C'est le narratif qui fait passer Nakiros d'« outil d'audit » à « coach autonome ».

## Décisions de cadrage (validées avec Thomas)

| Sujet | Décision |
|---|---|
| Persona v1 | Dev solo uniquement (pas d'équipe/multi-user) |
| Types gérés v1 | **Nouveau skill ET patch** (skill chargé détectable → classifier trivial) |
| Source des frictions | Étendre le **deep-analyzer** pour qu'il produise aussi du JSON structuré (en plus du Markdown) |
| Détection du skill chargé | (1) slash commands `<command-name>`, (2) tool calls `Read` sur `**/SKILL.md` ou `**/skills/*/…`, (3) fallback → new skill |
| Test cases d'éval | Génération LLM existante de `nakiros-skill-factory` **+ frictions réelles** appendées |
| Clustering | Embeddings locaux `@xenova/transformers` (`Xenova/all-MiniLM-L6-v2`, ~22 MB, lazy download) + cosine |
| Scoring | `score = occurrences × recency_weight × density_weight`. Fenêtre active 14 j, min 3 occurrences, densité chaude si 3 en < 7 j |
| Génération | Wrapper autour de `nakiros-skill-factory` (modes `startCreate` et `startFix`) qui prépare le prompt « N frictions + skill existant éventuel → skill/patch + cas d'éval » |
| Déclenchement | **Proposition auto** (cheap, Haiku déjà en place) ; **éval multi-model manuelle** (Opus coûte, user garde la main) |
| UI | Remplace le placeholder de l'onglet **Recommendations** (déjà existant avec `getRecommendations()` IPC qui retourne `[]`) + badge compteur |
| Privacy | Pas de restriction sur les exemples de code (local-first, responsabilité user si partage externe) |
| État | Rejets persistés (ne jamais re-proposer un cluster rejeté), acceptations marquent les frictions comme « résolues par skill X » |

## Architecture technique

### Arborescence

```
apps/nakiros/src/services/proposal-engine/
├── index.ts              # orchestrateur, écoute events analyzer
├── friction-store.ts     # persist frictions (~/.nakiros/frictions/*.jsonl)
├── clustering.ts         # @xenova/transformers + cosine grouping
├── scoring.ts            # score temporel + seuils
├── classifier.ts         # skill-detection (slash commands + Read SKILL.md) + new vs patch
├── generator.ts          # wrapper skill-factory (startCreate / startFix)
└── proposal-store.ts     # persist propositions (~/.nakiros/proposals/*.json)

packages/shared/src/
├── ipc-channels.ts       # + PROPOSALS_LIST / GET / ACCEPT / REJECT / RUN_EVAL
└── types/proposals.ts    # EnrichedFriction, FrictionCluster, Proposal, SkillDetection

apps/nakiros/src/daemon/handlers/
└── proposals.ts          # 5 handlers IPC + broadcast 'proposals:new'

apps/frontend/src/
├── global.d.ts                           # + types exposés
├── lib/nakiros-client.ts                 # + méthodes proposals
├── views/RecommendationsView.tsx         # remplace placeholder
└── components/recommendations/
    ├── ProposalsList.tsx
    └── ProposalCard.tsx                  # diff preview, accept/reject, Run eval
```

### Modèle de données

```ts
// Friction enrichie (output JSON du deep-analyzer, persistée)
type EnrichedFriction = {
  id: string;
  conversationId: string;
  timestamp: number;
  description: string;           // résumé Haiku, exploitable pour embedding
  category?: string;
  rawExcerpt: string;
  skillsDetected: string[];      // via classifier : slash commands + Read SKILL.md
  embedding: number[];
};

// Cluster (in-memory, recalculé à chaque passe)
type FrictionCluster = {
  id: string;
  frictionIds: string[];
  score: number;
  firstSeen: number;
  lastSeen: number;
  dominantSkill?: string;        // majoritaire parmi skillsDetected, sinon undefined
};

// Proposal (persistée)
type Proposal = {
  id: string;
  type: 'new' | 'patch';
  targetSkill?: string;          // défini si type === 'patch'
  clusterId: string;
  frictionIds: string[];
  score: number;
  draft: { content: string; evalCases: EvalCase[] };
  status: 'draft' | 'eval_running' | 'eval_done' | 'accepted' | 'rejected';
  evalResults?: unknown;
  createdAt: number;
  updatedAt: number;
};
```

### Pipeline d'exécution

```
1. Analyzer (niveau 2 / deep-analyzer) termine une conversation
   → broadcast 'conversation:analyzed' avec JSON structuré (nouveau)
2. proposal-engine/index.ts écoute :
   a. friction-store  → persist nouvelles frictions enrichies + embedding
   b. clustering      → re-groupe les frictions actives (fenêtre 14 j)
   c. scoring         → score par cluster
   d. Pour chaque cluster au-dessus du seuil (et pas déjà proposé / rejeté) :
      - classifier   → new | patch (via dominantSkill)
      - generator    → appel skill-factory avec prompt dédié
      - proposal-store → persist + broadcast 'proposals:new'
3. Frontend reçoit event → refresh badge + liste Recommendations
4. User clique "Run eval" → IPC PROPOSALS_RUN_EVAL → pipeline multi-model existant
```

## Plan d'implémentation (12 étapes)

Ordre conçu pour que chaque phase passe `tsc` avant la suivante.

1. **Shared** — Types (`EnrichedFriction`, `FrictionCluster`, `Proposal`, `SkillDetection`) + IPC channels (`PROPOSALS_LIST/GET/ACCEPT/REJECT/RUN_EVAL`) dans `packages/shared`
2. **Deep-analyzer skill** — Étendre la sortie : en plus du Markdown, produire du JSON structuré (frictions enrichies + skills détectés)
3. **conversation-deep-analyzer.ts** — Parser le JSON + persister les frictions enrichies dans `~/.nakiros/frictions/`
4. **classifier.ts** — Utilitaire skill-detection (slash commands + `Read SKILL.md` heuristique + fallback new)
5. **clustering.ts** — `@xenova/transformers` (all-MiniLM-L6-v2) + cosine grouping + lazy model download
6. **scoring.ts** — Score temporel (occurrences × recency × density), fenêtre active 14 j, min 3 occurrences, archive des vieilles frictions dans `~/.nakiros/frictions/archive/`
7. **generator.ts** — Wrapper autour de `nakiros-skill-factory` (`startCreate` / `startFix`) avec injection des frictions comme cas d'éval
8. **proposal-engine/index.ts** — Orchestrateur : listener events analyzer, pipeline friction → cluster → score → generate → persist, broadcast `proposals:new`
9. **daemon/handlers/proposals.ts** — 5 handlers IPC
10. **Frontend** — Remplacer placeholder `RecommendationsView`, composants `ProposalsList` + `ProposalCard` (diff preview, accept/reject, Run eval) avec `ui/*` existants, i18n, Tailwind
11. **Frontend** — Badge compteur sur l'onglet Recommendations dans `DashboardRouter`
12. **Validation** — `pnpm -F nakiros exec tsc --noEmit` + `pnpm -F @nakiros/frontend exec tsc --noEmit` + `pnpm -F @nakiros/landing exec tsc --noEmit` + `turbo build`

**Jalons de revue recommandés** : après 1 (types/channels), après 2-3 (format JSON deep-analyzer), après 5 (embeddings), après 10 (UI).

## Risques à surveiller

- **Étape 2** : modifier le skill deep-analyzer ne doit pas casser la sortie Markdown existante (les consommateurs actuels du rapport Markdown continuent de marcher).
- **Étape 5** : premier run télécharge ~22 MB pour les embeddings — gérer loader state, timeout raisonnable, fallback si offline au 1er run (en différant le clustering plutôt qu'en échouant).
- **Étape 7** : `startFix` a une politique clobber-safe (cf. `fix-runner.ts:35`) — vérifier qu'elle joue bien avec nos propositions qui modifient des skills existants.
- **Étape 10** : le diff preview d'un patch doit être lisible (skill existant vs. version proposée). Probablement besoin d'un diff viewer simple (pas de dépendance lourde).

## Cartographie de l'existant (référence)

- **Analyzer niveau 1 (keyword matcher)** : `apps/nakiros/src/services/conversation-analyzer.ts:36-50`
- **Analyzer niveau 2 (deep)** : `apps/nakiros/src/services/conversation-deep-analyzer.ts` (invoqué via `project:deepAnalyzeConversation` handler ligne 79 dans `apps/nakiros/src/daemon/handlers/projects.ts`)
- **Type friction actuel** : `ConversationFrictionPoint` dans `packages/shared/src/types/project.ts:76-84`
- **Skill-factory invocation** : `apps/nakiros/src/services/fix-runner.ts:26,381-506` — fonctions `startFix` et `startCreate`
- **IPC channels** : `packages/shared/src/ipc-channels.ts`
- **Recommendations view (placeholder)** : `apps/frontend/src/views/RecommendationsView.tsx` (26 lignes, `Lightbulb` + "coming soon")
- **Dashboard router** : `apps/frontend/src/components/dashboard/DashboardRouter.tsx:14-22`
- **getRecommendations IPC** (déjà existant, retourne `[]`) : `apps/nakiros/src/daemon/handlers/projects.ts:132`

## Questions restées ouvertes

- Format exact du JSON structuré à demander au deep-analyzer (schéma à figer à l'étape 2).
- Diff viewer : composant custom simple (probablement `<pre>` + highlight) ou chercher une lib légère ? À trancher à l'étape 10.
- Politique de re-cluster : à chaque nouvelle friction ou en batch toutes les N frictions ? Pour l'instant : re-cluster à chaque nouvelle friction, à ajuster si trop coûteux.

## Reprise demain

1. Branche déjà créée : `feat/friction-to-skill-proposals` (basée sur `main` à `41c7d96`)
2. Todo list déjà posée dans la session (12 étapes)
3. Commencer par l'étape 1 (shared types + IPC channels) — c'est la fondation, cadrage bien défini
4. Relire les décisions du tableau de cadrage avant de trancher un edge case
