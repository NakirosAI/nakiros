# Architecture — Conversation Management dans l’Orchestrateur

> Le nom du fichier est conservé pour continuité historique.
> Le modèle réel n’est plus “session management” mais “conversation + runners”.

---

## 1. Décision d’architecture

L’orchestrateur est owner de l’historique d’exécution.

Le Desktop n’écrit plus les conversations. Il lit les données produites par l’orchestrateur et les projette dans le renderer.

Le modèle courant est :

- une conversation Nakiros partagée par workspace
- plusieurs runners, un par agent participant
- un flux conversation “signal-only”
- un flux runner “raw/full fidelity”

---

## 2. Arborescence de stockage

```text
~/.nakiros/workspaces/{workspaceSlug}/conversations/{conversationId}/
  meta.json
  stream.ndjson
  runners/
    {agentId}/
      meta.json
      stream.ndjson
```

---

## 3. Entités

### Conversation

La conversation représente le fil métier partagé.

Exemple de `meta.json` :

```json
{
  "id": "conv_mf8g2c_2x1abc",
  "workspaceSlug": "my-workspace",
  "title": "Refonte auth SSO",
  "createdAt": "2026-03-19T10:00:00.000Z",
  "updatedAt": "2026-03-19T10:42:00.000Z",
  "status": "active",
  "anchorRepoPath": "/Users/thomas/projects/api",
  "additionalDirs": [
    "/Users/thomas/projects/front"
  ]
}
```

Le stream conversation contient uniquement les événements utiles pour partager le contexte entre agents et reconstruire l’historique UI :

```jsonl
{"type":"runner_started","agentId":"nakiros","provider":"claude"}
{"type":"user_message","text":"Analyse ce bug OAuth"}
{"type":"text","agentId":"nakiros","text":"Je commence par lire le flux..."}
{"type":"runner_done","agentId":"nakiros","exitCode":0}
```

### Runner

Le runner représente l’exécution d’un agent donné dans la conversation.

Exemple de `runners/dev/meta.json` :

```json
{
  "agentId": "dev",
  "provider": "claude",
  "agentSessionId": "3bef5812-4465-487a-aea8-1e92bed5d72d",
  "conversationCursor": 12,
  "status": "completed",
  "createdAt": "2026-03-19T10:10:00.000Z",
  "updatedAt": "2026-03-19T10:15:00.000Z"
}
```

Le stream runner contient le flux brut complet :

```jsonl
{"type":"start","runId":"conv_mf8g2c_2x1abc","conversationId":"conv_mf8g2c_2x1abc","agentId":"dev","command":"claude --print ...","cwd":"/repo"}
{"type":"session","id":"3bef5812-4465-487a-aea8-1e92bed5d72d"}
{"type":"tool","name":"Read","display":"Reading src/auth.ts"}
{"type":"text","text":"Le bug vient du redirect_uri..."}
{"type":"done","runId":"conv_mf8g2c_2x1abc","exitCode":0}
```

---

## 4. Pourquoi ce split

Le split conversation/runner sert à séparer deux besoins différents :

- reconstruire une conversation humaine et partageable
- conserver la trace exhaustive d’une exécution agent

Sans ce split :

- soit on perd la fidélité des tool traces
- soit on pollue le contexte partagé avec trop de bruit

---

## 5. Règles de reprise

### Reprendre une conversation

Le canonique est `conversationId`.

Le Desktop passe `conversationId` au bridge, qui passe `--conversation` au CLI.

### Reprendre un provider

Le provider session ID est stocké dans `RunnerMeta.agentSessionId`.

Il n’est jamais exposé comme identifiant principal côté produit.

### Compatibilité legacy

Si un ancien état Desktop ne possède qu’un ancien `sessionId` provider :

- le bridge passe `--session`
- le CLI transmet cet ID en mode legacy
- l’orchestrateur tente une résolution inverse `provider session ID -> conversation`

---

## 6. Injection de contexte inter-agents

Le runner lit le delta conversation depuis le dernier curseur du runner.

Pseudo-flux :

1. charger le runner courant
2. lire `conversation.stream.ndjson` depuis `conversationCursor`
3. filtrer uniquement les `text` des autres agents
4. préfixer le prochain prompt avec ce delta
5. à la fin du run, avancer `conversationCursor`

Ce mécanisme permet :

- consultation multi-agents
- synthèse finale
- continuité de contexte sans relire tout l’historique

---

## 7. Interface Desktop

Le Desktop lit ces fichiers via [conversation-reader.ts](/Users/thomasailleaume/Perso/timetrackerAgent/apps/desktop/electron/services/conversation-reader.ts).

Mapping actuel :

- `ConversationMeta -> StoredConversation`
- `conversation.stream.ndjson -> messages UI`
- `user_message -> user`
- `text -> assistant`

Le Desktop ne persiste plus les conversations. `conversation:save` est conservé comme no-op de compatibilité IPC.

---

## 8. Ce qui a été retiré

Les éléments suivants ne font plus partie du modèle actif :

- `~/.nakiros/.../sessions/`
- `session-reader.ts`
- `packages/orchestrator/src/session.ts`
- l’idée d’une session provider comme entité produit principale

---

## 9. Règles de vocabulaire

Utiliser :

- `conversationId` pour l’entité Nakiros
- `agentSessionId` ou `providerSessionId` pour le provider
- `runner` pour l’exécution d’un agent dans une conversation

Éviter :

- utiliser `sessionId` seul sans préciser s’il s’agit d’un alias legacy ou d’un ID provider

---

## 10. Nettoyage futur recommandé

- supprimer progressivement les derniers alias `sessionId` des types partagés
- faire converger `StoredAgentTab.conversationId` et `nakirosConversationId`
- extraire une partie de la logique de restauration et de synchronisation de `AgentPanel`
