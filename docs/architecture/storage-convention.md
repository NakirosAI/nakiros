# Architecture de stockage Nakiros

## Contexte

Nakiros utilise deux types de stockage avec des responsabilités distinctes. Ce document définit la convention officielle pour savoir où chaque type de fichier doit être écrit et pourquoi.

---

## Principe fondamental

> **Si le fichier a du sens même sans Nakiros → dans le repo, dans `_nakiros/`**
> **Si le fichier n'existe que parce que Nakiros tourne → dans `~/.nakiros/`**

---

## 1. Dossier `~/.nakiros/` — Le cerveau de Nakiros

Dossier caché dans le home de l'utilisateur. Contient tout ce qui est global à Nakiros et qui n'a pas vocation à être versionné dans un repo spécifique.

### Structure complète

```
~/.nakiros/
  config.yaml                          # Config globale utilisateur (provider IA, langue, préférences)

  workspaces/
    {workspace-name-slug}/
      workspace.json                   # Config du workspace (repos, PM tool, Jira, structure)

      tickets/                         # Tickets synchronisés depuis Jira/Linear/GitHub
        EX-197.json
        EX-198.json
        ...

      epics/                           # Epics synchronisés depuis Jira
        EX-EPIC-1.json
        ...

      context/                         # Contexte global inter-repo (généré par Generate Context)
        global-context.md              # Vue d'ensemble du projet multi-repo
        inter-repo.md                  # Contrats et dépendances entre repos
        pm-context.md                  # Contexte PM : épics, roadmap, objectifs sprint

      reports/
        daily/                         # Dailies générés automatiquement en fin de journée
          2026-03-01.md
          2026-03-02.md
        retro/                         # Rétrospectives générées en fin de sprint
          sprint-12.md
          sprint-13.md
        confidence/                    # Rapports Project Confidence
          2026-03-01.json

      sessions/                        # Historique des sessions IA par workspace
        {session-id}.json              # Contenu : agent utilisé, messages, outils appelés, timestamp

      runs/                            # Traces d'exécution des workflows
        {run-id}/
          workflow.md                  # Workflow exécuté (ex: dev-story)
          ticket.json                  # Snapshot du ticket au moment du run
          result.md                    # Résultat et artefacts produits
          status.json                  # Statut : success / error / in-progress

      stories/                         # Stories créées localement (sans PM tool externe)
        {story-id}.md
```

### Convention de nommage du slug workspace

Le dossier du workspace est nommé d'après le **nom du workspace**, transformé en slug :

```
toWorkspaceSlug(name) = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
```

Exemples :
- `"Exploitation"` → `exploitation`
- `"Mon Projet Web"` → `mon-projet-web`
- `"API v2"` → `api-v2`

Ce slug est utilisé partout dans le code pour identifier le dossier du workspace. **Ne jamais utiliser l'ID (timestamp) comme nom de dossier.**

### Responsabilités de ce dossier

- **Tickets / Epics** : synchronisés depuis Jira/Linear/GitHub, mis à jour par les agents, lus par le MCP server
- **Contexte global** : généré par l'agent Architect sur l'ensemble du workspace multi-repo
- **Reports** : dailies et rétros générés automatiquement, affichés dans le Morning Briefing
- **Sessions** : historique des conversations IA, persisté par workspace pour continuité
- **Runs** : traçabilité complète de chaque exécution de workflow (audit trail)

### Ce dossier est

- Caché par défaut dans le Finder et VS Code (préfixe `.`)
- Non versionné dans Git (jamais commité)
- Servi par le MCP server local (port 3737) aux agents IA
- Visible uniquement via l'interface Nakiros (Board, Morning Briefing, Context panel)

---

## 2. Dossier `_nakiros/` dans chaque repo — La doc vivante du projet

Dossier visible à la racine de chaque repo Git. Contient uniquement la documentation générée par les agents qui a de la valeur pour toute l'équipe, avec ou sans Nakiros.

### Structure complète

```
{repo}/
  _nakiros/
    workspace.yaml   # ID du workspace Nakiros (requis par le MCP server pour le routing par cwd)
    architecture.md  # Vision architecturale du repo (généré par agent Architect)
    stack.md         # Stack technique, versions, dépendances clés
    conventions.md   # Conventions de code, patterns dominants, règles du projet
    llms.txt         # Contexte condensé pour les agents IA (format llms.txt standard)
    api.md           # Documentation des endpoints/interfaces publics (si applicable)
```

### Responsabilités de ce dossier

- **workspace.yaml** : contient `workspace_id: {id}` — lu par le MCP server pour router les requêtes par cwd. Seul fichier Nakiros qui référence l'ID interne.
- **architecture.md** : généré par l'agent Architect via `Generate Context`. Décrit la structure du repo, les modules principaux, les patterns utilisés, les décisions techniques importantes.
- **stack.md** : liste le stack technique détecté et documenté. Utile pour l'onboarding et pour les agents.
- **conventions.md** : conventions de nommage, structure des fichiers, patterns à suivre. Les agents Dev s'appuient dessus pour produire du code cohérent.
- **llms.txt** : fichier de contexte condensé au format standard `llms.txt`. Injecté automatiquement dans le contexte des agents pour chaque session sur ce repo.
- **api.md** : documentation des contrats d'interface (endpoints REST, events, schemas). Particulièrement utile dans un contexte multi-repo pour les contrats inter-services.

### Ce dossier est

- **Visible** dans le Finder, VS Code, et tout éditeur (préfixe `_` = pas caché)
- **Versionné dans Git** — commité et partagé avec toute l'équipe
- **Utile sans Nakiros** — un nouveau dev qui clone le repo bénéficie directement de ces docs
- **Jamais édité manuellement** — uniquement généré/mis à jour par les agents Nakiros
- **Régénérable à tout moment** via la commande `Generate Context` dans l'interface

### Règle stricte

`_nakiros/` ne contient **jamais** :
- De tickets ou d'issues
- De rapports de daily ou de rétro
- D'historique de sessions
- De données liées à un workspace Nakiros spécifique (sauf `workspace.yaml` pour le routing MCP)

Ces données appartiennent à `~/.nakiros/workspaces/{workspace-name-slug}/`.

---

## 3. Règle de décision pour les agents

Quand un agent doit écrire un fichier, il suit cette règle :

| Type de fichier | Où écrire |
|---|---|
| Ticket synchronisé depuis Jira | `~/.nakiros/workspaces/{slug}/tickets/` |
| Epic synchronisé depuis Jira | `~/.nakiros/workspaces/{slug}/epics/` |
| Contexte global multi-repo | `~/.nakiros/workspaces/{slug}/context/global-context.md` |
| Contexte PM (épics, roadmap) | `~/.nakiros/workspaces/{slug}/context/pm-context.md` |
| Daily généré | `~/.nakiros/workspaces/{slug}/reports/daily/` |
| Rétrospective générée | `~/.nakiros/workspaces/{slug}/reports/retro/` |
| Rapport Project Confidence | `~/.nakiros/workspaces/{slug}/reports/confidence/` |
| Trace d'exécution de workflow | `~/.nakiros/workspaces/{slug}/runs/` |
| ID workspace (routing MCP) | `{repo}/_nakiros/workspace.yaml` |
| Architecture du repo | `{repo}/_nakiros/architecture.md` |
| Stack technique du repo | `{repo}/_nakiros/stack.md` |
| Conventions du repo | `{repo}/_nakiros/conventions.md` |
| Contexte condensé llms.txt | `{repo}/_nakiros/llms.txt` |
| Doc API / contrats inter-repo | `{repo}/_nakiros/api.md` |

---

## 4. Gitignore recommandé

Ajouter dans le `.gitignore` global utilisateur :

```gitignore
# Nakiros — données locales (ne pas commiter)
.nakiros/
```

Ajouter dans chaque repo dans `.gitattributes` (optionnel mais recommandé) :

```
_nakiros/ linguist-generated=true
```

---

## 5. Impact sur le MCP server

Le MCP server (port 3737) expose les données de `~/.nakiros/workspaces/{slug}/` aux agents via des outils dédiés :

- `get_tickets` → lit dans `tickets/`
- `get_epics` → lit dans `epics/`
- `get_context` → lit dans `context/`
- `get_daily` → lit dans `reports/daily/`
- `write_run` → écrit dans `runs/`
- `get_confidence` → lit dans `reports/confidence/`

Les fichiers dans `{repo}/_nakiros/` sont accessibles aux agents directement via le filesystem (lecture du codebase), pas via le MCP.

---

## 6. Implémentation côté code

### Résolution slug → dossier (`main.ts`)

```typescript
function resolveSlug(wsId: string): string {
  const ws = getAll().find((w) => w.id === wsId);
  return ws ? toWorkspaceSlug(ws.name) : wsId; // fallback wsId uniquement si introuvable
}
```

Tous les handlers IPC qui touchent ticket-storage passent par `resolveSlug(wsId)`.

### Règle critique sur la création de répertoires (`ticket-storage.ts`)

Les fonctions de **lecture** (`getTickets`, `getEpics`) ne créent **jamais** de répertoire.
Les fonctions d'**écriture** (`saveTicket`, `saveEpic`, `bulkSaveTickets`, `bulkSaveEpics`) créent le répertoire si besoin via `ensureTicketsDir` / `ensureEpicsDir`.

Cela évite la création de dossiers fantômes avec l'ID timestamp si `resolveSlug` échoue sur une lecture.
