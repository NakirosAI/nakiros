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
      workspace.yaml                   # Source de vérité locale du workspace (repos, PM tool, structure)

      tickets/                         # Tickets synchronisés depuis l'issue tracker
        EX-197.json
        EX-198.json
        ...

      epics/                           # Epics synchronisés depuis l'issue tracker
        EX-EPIC-1.json
        ...

      context/                         # Contexte global inter-repo (généré par Generate Context)
        global-context.md              # Vue d'ensemble du projet multi-repo
        inter-repo.md                  # Contrats et dépendances entre repos
        product-context.md             # Contexte produit : finalité, workflows, domaines, migrations
        architecture/
          index.md                     # Carte simplifiée de l'architecture globale du workspace
          auth.md                      # Domaine transverse workspace
          billing.md                   # Domaine transverse workspace

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
        steps/
          {run-id}-challenge.md        # Challenge gate et snapshots intermédiaires
          context-{date}-{branch}.md   # Artefacts de contexte intermédiaires
          project-understanding-confidence-{date}.md
        {run-id}.json                  # Manifest de run et métadonnées
        {run-id}-mr-report.md          # Rapport MR si généré

      state/
        active-run.json                # Run en cours si un workflow d'exécution est actif

      stories/                         # Stories créées localement (sans PM tool externe)
        {ticket-id}.json
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

- **Tickets / Epics** : synchronisés depuis l'issue tracker configuré, mis à jour par les agents, lus par le MCP server
- **Contexte global** : généré par l'agent Architect sur l'ensemble du workspace multi-repo
- **Architecture globale** : carte légère du système complet, des domaines transverses et des relations inter-repos
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
    workspace.yaml   # Pointeur léger vers le workspace global
    stack.md         # Stack technique, versions, dépendances clés
    conventions.md   # Conventions de code, patterns dominants, règles du projet
    llms.txt         # Contexte condensé pour les agents IA (format llms.txt standard)
    api.md           # Documentation des endpoints/interfaces publics (si applicable)
    architecture/
      index.md       # Sommaire léger de l'architecture du repo
      {domain}.md    # Docs ciblées par domaine ou feature technique
    product/
      features/
        {feature}.md # Fiches feature compactes et ciblées
```

### Responsabilités de ce dossier

- **workspace.yaml** : contient `workspace_name` et `workspace_slug`. Il sert de pointeur léger ; la source de vérité complète reste `~/.nakiros/workspaces/{workspace_slug}/workspace.yaml`.
- **architecture/index.md** : sommaire léger de l'architecture du repo. Sert de point d'entrée pour charger ensuite uniquement la doc ciblée utile.
- **architecture/{domain}.md** : documentation d'architecture fragmentée par domaine ou feature technique.
- **stack.md** : liste le stack technique détecté et documenté. Utile pour l'onboarding et pour les agents.
- **conventions.md** : conventions de nommage, structure des fichiers, patterns à suivre. Les agents Dev s'appuient dessus pour produire du code cohérent.
- **llms.txt** : fichier de contexte condensé au format standard `llms.txt`. Injecté automatiquement dans le contexte des agents pour chaque session sur ce repo.
- **api.md** : documentation des contrats d'interface (endpoints REST, events, schemas). Particulièrement utile dans un contexte multi-repo pour les contrats inter-services.
- **product/features/{feature}.md** : fiche feature compacte, lisible par un agent sans charger tout le contexte produit.

La convention détaillée de structure et de formats pour les artefacts portables est définie dans [nakiros-local-artifact-convention.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-local-artifact-convention.md).

### Dualité officielle : workspace-global puis repo-local

Pour l'architecture Nakiros, la règle cible est :

1. lire d'abord la vue **workspace-global** dans `~/.nakiros/workspaces/{workspace_slug}/context/architecture/`
2. puis charger seulement les slices **repo-locales** utiles dans `{repo}/_nakiros/architecture/`

Le dossier global sert à décrire :

- la carte du système complet
- les domaines transverses
- les flux majeurs entre repos
- les contrats et dépendances inter-repos

Le dossier repo-local sert à décrire :

- comment un repo implémente sa part
- les contraintes propres à ce codebase
- les détails techniques qui n'ont pas vocation à vivre au niveau workspace

Exemple :

- `~/.nakiros/workspaces/exploitation/context/architecture/index.md`
- `~/.nakiros/workspaces/exploitation/context/architecture/auth.md`
- `exploitation-front/_nakiros/architecture/auth.md`
- `exploitation-back/_nakiros/architecture/auth.md`

Règle d'écriture :

- si la décision ou la doc concerne plusieurs repos, elle doit avoir une forme workspace-globale
- si elle concerne un repo précis, elle vit dans ce repo
- si les deux niveaux sont utiles, le global reste léger et renvoie vers les slices repo-locales

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
- De données runtime liées à un workspace Nakiros spécifique (sauf `workspace.yaml` comme pointeur)

Ces données appartiennent à `~/.nakiros/workspaces/{workspace_slug}/`.

---

## 3. Règle de décision pour les agents

Quand un agent doit écrire un fichier, il suit cette règle :

| Type de fichier | Où écrire |
|---|---|
| Ticket synchronisé depuis l'issue tracker | `~/.nakiros/workspaces/{slug}/tickets/` |
| Epic synchronisé depuis l'issue tracker | `~/.nakiros/workspaces/{slug}/epics/` |
| Brainstorming workspace | `~/.nakiros/workspaces/{slug}/context/brainstorming.md` |
| Contexte global multi-repo | `~/.nakiros/workspaces/{slug}/context/global-context.md` |
| Contexte produit (finalité, workflows) | `~/.nakiros/workspaces/{slug}/context/product-context.md` |
| Sommaire architecture global du workspace | `~/.nakiros/workspaces/{slug}/context/architecture/index.md` |
| Domaine transverse global | `~/.nakiros/workspaces/{slug}/context/architecture/{domain}.md` |
| Daily généré | `~/.nakiros/workspaces/{slug}/reports/daily/` |
| Rétrospective générée | `~/.nakiros/workspaces/{slug}/reports/retro/` |
| Rapport Project Confidence | `~/.nakiros/workspaces/{slug}/reports/confidence/` |
| Trace d'exécution de workflow | `~/.nakiros/workspaces/{slug}/runs/` |
| État de run actif | `~/.nakiros/workspaces/{slug}/state/active-run.json` |
| Pointeur workspace repo-side | `{repo}/_nakiros/workspace.yaml` |
| Sommaire architecture repo | `{repo}/_nakiros/architecture/index.md` |
| Détail architecture par domaine/feature | `{repo}/_nakiros/architecture/{domain}.md` |
| Stack technique du repo | `{repo}/_nakiros/stack.md` |
| Conventions du repo | `{repo}/_nakiros/conventions.md` |
| Contexte condensé llms.txt | `{repo}/_nakiros/llms.txt` |
| Doc API / contrats inter-repo | `{repo}/_nakiros/api.md` |
| Fiche feature compacte | `{repo}/_nakiros/product/features/{feature}.md` |
| Notes dev liées à un ticket | `{repo}/_nakiros/dev-notes/{ticketId}.md` |
| Revue QA | `{repo}/_nakiros/qa-reviews/{ticketId}-{date}.md` |
| Bug report | `{repo}/_nakiros/bugs/{bugId}.md` |
| Post-mortem / incident | `{repo}/_nakiros/incidents/{ticketId}-postmortem.md` |

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

### Résolution slug → dossier

```typescript
function resolveWorkspaceSlug(id: string, name: string): string {
  const existingDir = findExistingDir(id, getWorkspacesRoot());
  return existingDir ? basename(existingDir) : toWorkspaceSlug(name);
}
```

Tous les services qui touchent `~/.nakiros/workspaces/{slug}/...` passent par cette résolution pour éviter de recréer un dossier basé sur l'ID.

### Règle critique sur la création de répertoires (`ticket-storage.ts`)

Les fonctions de **lecture** (`getTickets`, `getEpics`) ne créent **jamais** de répertoire.
Les fonctions d'**écriture** (`saveTicket`, `saveEpic`, `bulkSaveTickets`, `bulkSaveEpics`) créent le répertoire si besoin via `ensureTicketsDir` / `ensureEpicsDir`.

Cela évite la création de dossiers fantômes avec l'ID timestamp si la résolution du slug échoue sur une lecture.
