# Nakiros — Récapitulatif Produit (Mars 2026)

## Qu'est-ce que Nakiros ?

**Nakiros** est un système d'orchestration d'agents IA pour le développement logiciel. Il agit comme une couche d'outillage qui encapsule les éditeurs IA existants (Claude Code, Codex, Cursor) et leur donne un cadre de livraison structuré, traçable et connecté aux outils PM (Jira, GitLab, GitHub).

L'idée centrale : **l'IA code déjà, mais sans discipline de livraison**. Nakiros apporte cette discipline — le ticket, le challenge, les tests, la PR, le worklog — de façon automatisée et transparente pour le développeur.

---

## Le problème résolu

Les développeurs utilisent aujourd'hui des agents IA (Claude Code, Copilot, Codex) pour implémenter des features. Ces agents sont puissants mais :

- Ils n'ont **aucun contexte métier** (le ticket Jira, les acceptance criteria)
- Ils **ne suivent aucun process** (pas de challenge de qualité, pas de TDD imposé)
- Ils **ne synchronisent rien** avec les outils PM (statut, worklog, MR)
- Ils **perdent le contexte** entre deux sessions

Le résultat : on gagne du temps à coder, mais on perd du temps en coordination, en retravail, et en dette technique.

---

## Ce que fait Nakiros aujourd'hui

### 1. CLI (`nak`) — Le moteur d'installation

Le CLI bootstrap l'environnement de travail sur n'importe quel repo :

```bash
npx @nakiros/nakiros@dev init   # Wizard de configuration
nak install                      # Mise à jour des assets agents
nak server start                 # Démarre le serveur MCP local
```

**Ce qu'il fait concrètement :**
- Détecte l'éditeur IA utilisé (Claude Code → `.claude/commands/`, Codex → `.codex/prompts/`, Cursor → `.cursor/commands/`)
- Déploie les commandes d'agents dans l'environnement approprié
- Crée les dossiers de travail `.nakiros/` dans le repo
- Configure la connexion Jira MCP si sélectionné
- Copie les définitions d'agents et de workflows dans `_nakiros/`

---

### 2. Les Agents IA — Les personas métier

Nakiros définit **7 personas d'agents IA**, chacun avec un rôle, un comportement et des réflexes opérationnels précis :

| Agent | Rôle | Ce qu'il fait |
|-------|------|---------------|
| **Dev** | Développeur | Implémente, teste, commit, crée la PR, synchronise Jira |
| **PM** | Product Manager | Clarifie les exigences, challenge la qualité des tickets, crée/affine les tickets |
| **Architect** | Architecte | Analyse le codebase, génère des documents de contexte, détecte la dette technique |
| **SM** | Scrum Master | Hygiene du backlog, transitions de statuts, coordination cross-repo |
| **QA** | Qualité | Valide les AC, analyse la couverture, triage des bugs |
| **Hotfix** | Urgences | Réponse rapide aux incidents de prod, PR expédiée, post-mortem |
| **Brainstorming** | Recherche | Exploration ouverte, mapping de solutions, faisabilité technique |

Chaque agent est défini dans un fichier `.md` structuré avec : règles d'activation, réflexes automatiques, style de communication, et menu de workflows disponibles.

---

### 3. Les Workflows — Les processus structurés

Nakiros orchestre des **workflows en plusieurs étapes** activés par des commandes dans l'éditeur IA. Le workflow principal, **Dev Story**, est pleinement implémenté :

#### Dev Story — Flux complet

```
1. /nak-workflow-dev-story (commande dans Claude Code ou Codex)
         ↓
2. Chargement config effective (global ~/.nakiros + projet .nakiros.yaml)
         ↓
3. Fetch du ticket Jira via MCP → passage en "In Progress"
   Démarrage du worklog
         ↓
4. PM Challenge Gate (6 dimensions analysées) :
   - Clarté du titre et description
   - Acceptance criteria vérifiables
   - Scope défini
   - Critères de performance
   - Scénarios d'erreur couverts
   - Dépendances identifiées
         ↓
5. Implémentation avec discipline TDD (tests avant code)
   Suivi par l'agent Dev
         ↓
6. Commit (message conventionnel), création de la PR
         ↓
7. Rapport MR généré dans la langue documentaire configurée
         ↓
8. Sync retour vers Jira :
   - Statut → "In Review"
   - Worklog poussé
   - Commentaire avec lien PR
         ↓
9. Tous les artefacts persistés localement dans .nakiros/
```

**Autres workflows disponibles :**
- **Create Story** — Convertit une intention en story prête à implémenter
- **Create Ticket** — Création structurée de tickets (bug, feature, task)
- **Generate Context** — Scan architectural + génération de docs de contexte pour les agents
- **Project Confidence** — Évalue le niveau de compréhension de l'IA sur le projet (score de confiance)
- **QA Review** — Validation AC, analyse couverture, sign-off
- **Hotfix Story** — Flux urgence : triage → fix → PR expédiée → sync prod
- **Sprint** — Planning et rétrospective de sprint

---

### 4. Desktop App — L'interface de gestion (Electron + React)

Application desktop pour les **profils non-techniques** (PM, PO, SM) et les leads tech qui veulent une vue globale.

**Fonctionnalités aujourd'hui :**

**Workspace Management**
- Création et gestion de workspaces multi-repos
- Support de N workspaces (chacun avec N repos)
- Détection automatique du stack technologique (frontend-react, backend-node, etc.)
- Synchronisation de la config workspace dans tous les repos

**Vue Dashboard / Kanban**
- Board Kanban local (Backlog → To Do → In Progress → Done)
- Filtres par statut, repo, priorité, recherche textuelle
- Création de tickets inline
- Compteur auto-incrémenté de tickets

**Agent Panel**
- Interface de chat multi-onglets (jusqu'à 12 onglets simultanés)
- Streaming temps réel des outputs d'agents
- Visualisation des outils utilisés (Read, Write, Bash, Search, Web...)
- Boutons d'action rapide : Generate Context, Project Confidence, Architect, PM, Dev
- Persistance de l'historique de conversation par workspace

**Context Panel**
- Scanner de documentation (README, architecture docs, llms.txt...)
- Visionneuse markdown
- Référence des capacités de workflows
- PRD Assistant

**Intégration Jira**
- Authentification OAuth 2.0 avec PKCE (flux sécurisé)
- Persistance et refresh automatique des tokens
- Sync des tickets et épics depuis Jira
- Support multi-instances Jira

**Terminal embarqué**
- Terminal PTY natif
- Instances multiples

---

### 5. MCP Server — Le serveur de contexte centralisé

Un **processus unique** (port 3737) qui :
- Sert de pont entre les agents IA et les PM tools (Jira, GitHub...)
- Route les requêtes par workspace via `cwd` (isolation totale entre workspaces)
- Remplace les MCPs tiers individuels (un seul point d'auth, cache centralisé)
- S'enregistre une seule fois dans `~/.claude/claude.json`

**Architecture de routing :**
```
Claude Code (cwd=/repo-frontend)
    → MCP Server localhost:3737
    → /ws/{workspace-1-uuid}/mcp
    → contexte isolé workspace 1
    → outils Jira, GitHub pour ce workspace
```

---

### 6. VS Code Extension — Squelette en place

L'extension VS Code est **architecturée mais non fonctionnelle aujourd'hui**. Le framework est prêt, le déploiement sur le marketplace VS Code est prévu pour le Sprint 4.

**Vision :** Sidebar dans l'éditeur avec inbox de tickets, launcher d'agents, vue workspace directement dans VS Code.

---

## Architecture système

```
┌─────────────────────────────────────────────────────┐
│                  Nakiros Desktop                     │
│  (Workspace manager, Kanban, Agent chat, Jira sync) │
└──────────────────────┬──────────────────────────────┘
                       │ IPC
┌──────────────────────▼──────────────────────────────┐
│              Electron Main Process                   │
│  workspace-yaml, agent-runner, jira-oauth,           │
│  doc-scanner, terminal, conversation-store           │
└──────────┬───────────────────────┬──────────────────┘
           │                       │
    ┌──────▼──────┐       ┌────────▼────────┐
    │  AI Editor  │       │   MCP Server    │
    │ Claude Code │       │ localhost:3737  │
    │  / Codex    │◄─────►│  workspace ISO  │
    │  / Cursor   │       │  Jira / GitHub  │
    └──────┬──────┘       └─────────────────┘
           │
    ┌──────▼──────────────────────┐
    │    _nakiros/ (runtime)      │
    │  agents/ + workflows/       │
    │  7 personas + 9 workflows   │
    └─────────────────────────────┘
           │ artefacts
    ┌──────▼──────────────────────┐
    │      .nakiros/ (data)       │
    │  state, context, runs,      │
    │  stories, tickets, reports  │
    └─────────────────────────────┘
```

---

## Configuration

**Trois niveaux de config en cascade :**

```
~/.nakiros/config.yaml            (profil utilisateur global)
    ↓ surchargé par
{repo}/.nakiros.yaml              (config projet, versionné)
    ↓ surchargé par
{repo}/.nakiros.workspace.yaml    (config workspace, auto-généré)
    ↓
Config effective au runtime
```

**Exemple `.nakiros.yaml` :**
```yaml
pm_tool: jira
git_host: github
branch_pattern: 'feature/{ticket}'
jira:
  project_key: PROJ
  board_id: '123'
```

---

## État d'implémentation actuel

| Composant | Statut |
|-----------|--------|
| CLI (init, install, server) | ✅ Production-ready |
| Dev Story workflow (complet) | ✅ Production-ready |
| Config system (merge, discovery) | ✅ Production-ready |
| 7 Agent personas | ✅ Production-ready |
| Jira OAuth 2.0 + token persistence | ✅ Production-ready |
| Desktop app (workspace, agents, terminal) | ✅ Production-ready |
| MCP Server (HTTP + WebSocket, isolation) | ✅ Production-ready |
| Generate Context workflow | ✅ Production-ready |
| Project Confidence workflow | ✅ Production-ready |
| Multi-éditeur (Claude, Codex, Cursor) | ✅ Production-ready |
| VS Code Extension | 🚧 Framework uniquement |
| GitHub / GitLab / Linear connecteurs | 🔜 Prévu Sprint 3 |
| BMAD hook integration | 🔜 Prévu Sprint 4 |

---

## Cibles utilisateurs

**Profil principal (aujourd'hui) :**
- Développeur solo ou lead d'une petite équipe (2-5 devs)
- Utilise déjà un éditeur IA (Claude Code, Codex, Cursor)
- Gère ses tickets sur Jira
- Veut de la structure et de la traçabilité sans overhead

**Profil secondaire (roadmap Desktop) :**
- PM / PO / SM qui veut une vue sur l'activité des agents
- Non-technique qui veut déclencher des agents sans ouvrir un terminal

---

## Positionnement marché

Nakiros n'est **ni un éditeur IA, ni un outil PM, ni un CI/CD**. C'est la couche de coordination entre ces trois mondes.

| Outil | Ce qu'il fait | Ce que Nakiros ajoute |
|-------|---------------|-----------------------|
| Claude Code / Codex | Code avec l'IA | Contexte métier + process de livraison |
| Jira / Linear | Gestion de tickets | Sync automatique bidirectionnelle |
| GitHub Actions | CI/CD | Avant le CI : qualité avant le commit |
| Cursor | IDE IA | Même chose côté Cursor |

**Différenciateur clé :** Aucun concurrent ne couvre exactement ce positionnement — l'orchestration agentic avec discipline de livraison + sync PM, indépendante de l'éditeur IA.

---

*Document généré le 1er mars 2026 — état du code sur la branche `feature/new_archi`*
