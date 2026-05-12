# Sentiment pre-pass — Design V1

**Date** : 2026-05-12
**Branche cible** : `feat/sentiment-prepass`
**Statut** : Spec en revue
**Supersedes** : décision 2026-05-05 (option C) — design conservé, install lib clarifiée

## Contexte

Le V1.1 friction classifier (Haiku) hallucine parfois des frictions et n'a aucun ancrage quantitatif dans la conversation. Une brique sentiment locale déterministe donne des ancres reproductibles et coût-zéro pour qualifier les pics émotionnels des messages utilisateur.

Une session précédente a écrit un POC (`apps/nakiros/scripts/sentiment-poc.mjs`) qui :
- importe `@xenova/transformers` via un chemin interne hardcodé (`node_modules/@xenova/transformers/src/transformers.js`) — symptôme d'une galère d'install non résolue ;
- utilise le mauvais modèle (`tabularisai/multilingual-sentiment-analysis`) qui n'a pas d'export ONNX et une license CC-BY-NC-4.0 incompatible.

Ce design ré-exécute la décision 2026-05-05 avec un setup d'install propre.

## Scope V1

**Inclus** :
1. Audit + fix install propre de `@xenova/transformers` dans le monorepo pnpm.
2. POC réécrit (`scripts/sentiment-poc.mjs`) avec import standard + bon modèle.
3. Validation qualité + perf sur 3-5 conversations réelles.
4. Brique isolée dans le service d'ingest, output `sentimentTrace` étendu sur le digest.
5. Track sentiment dans le sismograph (frontend).

**Exclus V1** :
- Rebranchement du classifier V1.1 → reporté V1.2.
- Détecteur de répétition lexicale (friction-sans-négativité) → V1.2.
- Calibration fine des seuils sentiment→friction → V1.2.

## Choix techniques

### Lib & modèle

- **Lib** : `@xenova/transformers` (port Node/browser de HF transformers, runtime ONNX). Ajoutée en **dépendance prod** de `apps/nakiros/package.json`.
- **Modèle** : `Xenova/distilbert-base-multilingual-cased-sentiments-student` (MIT, ONNX packagé, 3 labels Pos/Neutral/Neg, ~70MB en int8).
- **Cache modèle** : `~/.nakiros/models/` (`env.cacheDir = ...`), download à la 1ère utilisation, offline ensuite.
- **Lazy load** : pas au boot daemon (sinon `nakiros service` lourd). Singleton process-level chargé à la 1ère demande.

### Skip rules (messages non scorés)

Un message user est skippé si :
- présence d'un bloc ``` (code paste) ;
- ratio caractères non-alpha > 40% ;
- texte vide ou < 5 caractères.

### Output

Le digest existant gagne un champ optionnel :
```ts
sentimentTrace?: Array<{ messageIndex: number; score: number; label: 'Positive' | 'Neutral' | 'Negative' }>;
```

Non breaking pour les digests déjà persistés.

## Architecture

### Modules (apps/nakiros)

| Fichier | Rôle |
|---|---|
| `src/services/sentiment/index.ts` | Façade publique : `scoreMessage(text)`, `scoreBatch(texts[])`, `warmup()` |
| `src/services/sentiment/pipeline.ts` | Singleton du pipeline `@xenova/transformers` |
| `src/services/sentiment/skip-rules.ts` | Filtre code-paste |
| `scripts/sentiment-poc.mjs` | Banc de validation, non livré |

### Points d'intégration

- **Ingest** : hook dans `src/services/conversation-ingest/digest-builder.ts` au moment de l'assemblage du digest. Idempotent (ne réécrase pas si déjà présent).
- **IPC** : étendre le contrat existant pour exposer `sentimentTrace` au frontend (voir `.claude/rules/ipc-contract.md`).
- **Frontend sismograph** : ajouter un track sentiment (mapping label→couleur, intensité→amplitude). Détail UI à cadrer au moment de l'implémenter, suivre les conventions new-design.

### Install monorepo

- Dépendance en prod sur `apps/nakiros/package.json` — la brique tourne dans le daemon livré sur npm.
- Vérifier `onnxruntime-node` transitive Mac ARM64 (binaire natif).
- Coût d'install npm : ~50MB de natifs supplémentaires dans le bundle publié. Accepté pour V1.

## Critères de succès

### Gate POC (avant intégration ingest)

| Critère | Seuil | Mesure |
|---|---|---|
| Qualité labels | ≥ 80% des messages user manifestement frustrés sont `Negative` | Revue manuelle 3-5 convs |
| Pas de faux positifs code/commands | 0 message skippé par erreur, 0 code scoré | Inspection colonne `skipped` |
| Cold start | < 5s | `performance.now()` autour de `pipeline(...)` |
| Inférence | < 100ms/message en moyenne | Timing instrumenté POC |
| RSS après load | < 500MB | `process.memoryUsage().rss` |
| Robustesse | Aucun crash sur 1000 messages variés | Run POC sur conv la plus longue |

### Gate intégration ingest (avant sismograph)

- Digest sort avec `sentimentTrace` non vide pour toute conv avec ≥ 1 message user textuel.
- Re-ingest idempotent : pas d'écrasement si déjà calculé.
- Scoring s'exécute en background **OU** ajoute < 10% de latence à l'ingest.

## Risques & mitigation

| Risque | Mitigation |
|---|---|
| `onnxruntime-node` ne s'installe pas sur Mac ARM monorepo pnpm | Audit step 1, fallback : forcer install via `pnpm install --filter @nakirosai/nakiros` avec `node-linker=hoisted` ou ajouter `onnxruntime-node` en dep explicite |
| Bundle npm trop lourd | Évaluer dep optionnelle / install lazy au 1er run de Nakiros service (hors scope V1 si gate accepté) |
| Modèle multilingue moins bon sur FR pur | Critère qualité mesuré sur conversations FR réelles avant intégration |

## Non-objectifs

- Calibrer ce que "négativité actionnable" veut dire — reporté V1.2.
- Améliorer le classifier — reporté V1.2.
- Détecter la frustration silencieuse (user qui re-explique 3x sans négativité lexicale) — V1.2.

## Hors-scope traité ailleurs

- Bug Skill tool isolation du V1.1 : fix indépendant (inline-skill pattern, voir `project_nakiros_classify_convo_v1_1_status_2026_05_03`).
- Fix `sessionId` overwrite dans `analyze-convo-runner` : indépendant, faible priorité.

## Références

- Memory `project_nakiros_sentiment_prepass_2026_05_05.md` — décision originale option C.
- Memory `project_nakiros_classify_convo_v1_1_status_2026_05_03.md` — contexte V1.1 + raisons du besoin.
- `apps/nakiros/scripts/sentiment-poc.mjs` — POC à réécrire.
- `.claude/rules/ipc-contract.md` — contrat IPC à respecter pour l'exposition frontend.
