# Architecture — Orchestrateur CLI `@nakiros/orchestrator`

> État cible atteint: l’orchestrateur est un moteur autonome, Desktop est un consumer.
> Ce document remplace le plan de migration initial par la description du modèle réel.

---

## 1. Positionnement

`@nakiros/orchestrator` est le point central d’exécution des agents.

Il peut être consommé par :

- le Desktop Electron via un bridge local
- un terminal développeur via le binaire `nakiros`
- un script ou une CI via le flux NDJSON stdout

Le Desktop ne construit plus les commandes provider ni ne possède l’historique des conversations. Il délègue l’exécution au CLI et relaie simplement les événements vers le renderer.

---

## 2. Schéma global

```text
Renderer React
  -> IPC
Electron main
  -> agent-runner-bridge.ts
CLI nakiros
  -> packages/orchestrator/src/runner.ts
Providers
  -> Claude / Codex / Cursor
Stockage local orchestrateur
  -> ~/.nakiros/workspaces/{workspaceSlug}/conversations/
```

---

## 3. Responsabilités par couche

### Orchestrateur

L’orchestrateur :

- résout la conversation courante
- résout le runner d’un agent dans cette conversation
- injecte le delta de contexte inter-agents
- construit la commande provider
- parse le flux JSON provider
- persiste les streams et métadonnées
- expose un protocole NDJSON stable pour les consumers

### Desktop

Le Desktop :

- spawn le binaire `nakiros`
- parse stdout ligne par ligne
- relaie `start`, `text`, `tool`, `session`, `done`, `error`
- lit les conversations persistées via `conversation-reader.ts`
- garde uniquement l’état UI, tabs et notifications

---

## 4. Package layout

```text
packages/orchestrator/
├── src/
│   ├── types.ts
│   ├── env.ts
│   ├── command.ts
│   ├── stream.ts
│   ├── context.ts
│   ├── conversation.ts
│   ├── runner.ts
│   └── index.ts
├── bin/
│   └── nakiros.ts
└── package.json
```

Rôle des modules :

- `types.ts` : types publics de stream et de run
- `env.ts` : shell, PATH, environnement runner
- `command.ts` : construction des commandes Claude/Codex/Cursor
- `stream.ts` : mapping des événements provider vers `StreamEvent`
- `context.ts` : résolution du CWD agent et du contexte workspace
- `conversation.ts` : stockage local conversation + runners
- `runner.ts` : orchestration d’un run complet
- `bin/nakiros.ts` : interface CLI

---

## 5. Protocole CLI -> consumer

Le CLI émet du NDJSON sur stdout.

Exemple :

```jsonl
{"type":"start","runId":"conv_mf....","conversationId":"conv_mf....","agentId":"nakiros","command":"claude --print ...","cwd":"/repo"}
{"type":"session","id":"3bef5812-4465-487a-aea8-1e92bed5d72d"}
{"type":"tool","name":"Read","display":"Reading src/auth/login.ts"}
{"type":"text","text":"J'ai analysé la structure actuelle..."}
{"type":"done","runId":"conv_mf....","exitCode":0}
```

Sémantique :

- `runId` exposé par l’orchestrateur = identifiant conversation Nakiros
- `conversationId` = identifiant canonique `conv_*`
- `session` event = identifiant de session provider interne

Le consumer ne doit pas déduire de logique métier à partir du format de session provider.

---

## 6. Modèle d’identifiants

Trois notions coexistent :

### `conversationId`

- identifiant canonique Nakiros
- format `conv_*`
- utilisé pour restaurer une conversation
- owned par l’orchestrateur

### `agentSessionId`

- identifiant de session provider
- par runner, pas par conversation
- stocké dans `RunnerMeta`
- utilisé uniquement pour `--resume` provider

### `sessionId`

- terme legacy encore toléré dans quelques types partagés
- ne doit plus être utilisé comme concept métier
- quand il subsiste, il représente soit un alias legacy de `providerSessionId`, soit un champ de compatibilité d’ancien stockage

Règle pratique :

- pour reprendre un chat Nakiros : utiliser `conversationId`
- pour reprendre un provider en interne : utiliser `agentSessionId`

---

## 7. CLI public

### Run

```bash
nakiros run \
  --agent <claude|codex|cursor> \
  --agent-id <nakiros|architect|pm|dev|qa|...> \
  --workspace <workspaceSlug> \
  --message "..." \
  [--conversation <conv_xxx>] \
  [--session <legacy-provider-session-id>] \
  [--add-dir /path/to/repo]
```

Notes :

- `--conversation` est l’API canonique
- `--session` reste un alias de migration pour restaurer un ancien état Desktop qui ne connaît encore qu’un ID provider

### Conversations

```bash
nakiros conversations --workspace myapp
nakiros conversations delete conv_xxx --workspace myapp
```

L’alias `sessions` reste accepté uniquement pour compatibilité utilisateur.

---

## 8. Intégration Desktop

Le bridge runtime est [agent-runner-bridge.ts](/Users/thomasailleaume/Perso/timetrackerAgent/apps/desktop/electron/services/agent-runner-bridge.ts).

Règles :

- le bridge résout le binaire `nakiros`
- il passe `--conversation` en priorité
- s’il n’a qu’un ancien identifiant provider, il passe `--session`
- il ne connaît pas la structure du stockage orchestrateur

Le handler IPC reste stable dans [main.ts](/Users/thomasailleaume/Perso/timetrackerAgent/apps/desktop/electron/main.ts).

---

## 9. Stockage local

Le stockage local est décrit en détail dans [orchestrator-session-management.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/orchestrator-session-management.md), qui documente désormais le modèle conversation + runners.

Résumé :

- une conversation = conteneur métier partagé
- un runner = exécution d’un agent donné dans cette conversation
- le Desktop lit ce stockage, il ne l’écrit plus

---

## 10. Statut de migration

### Complété

- extraction du moteur d’exécution hors du Desktop
- création du package `@nakiros/orchestrator`
- création du binaire `nakiros`
- bridge Electron minimal
- stockage orchestrateur lu par Desktop

### Compatibilité temporaire conservée

- alias CLI `sessions`
- paramètre CLI `--session`
- champs `sessionId` legacy dans certains types partagés

### Nettoyage restant après cette étape

- réduire encore les alias `sessionId` côté renderer
- simplifier la persistance des tabs autour du seul `conversationId`
- refactorer le code UI de `AgentPanel` désormais que le modèle métier est clarifié
