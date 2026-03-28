# Nakiros — Décisions Système & Architecture

> Document issu de la session de design du 2026-03-19.
> Source de vérité pour les décisions structurantes sur Nakiros Desktop, l'orchestrateur, le MCP et la stratégie de contexte.

---

## 1. Vision produit

**Nakiros = le Memory Bank d'équipe pour les agents IA.**

Le contexte est la pierre angulaire d'un projet développé correctement par l'IA. Un contexte bien structuré produit de meilleurs agents, qui produisent un meilleur code.

> *"Plus tu utilises Nakiros, plus tes agents deviennent performants sur ton projet spécifique."*

### Différenciateurs vs concurrents

| Produit | Focus | Limite |
|---|---|---|
| Zencoder / Copilot | Agent qui code | Contexte implicite, jetable, individuel |
| BMAD | Framework méthodologie | Local, complexe, pas SaaS, pas équipe |
| Kiro | IDE AWS-centric | Individuel, pas de gestion de contexte équipe |
| **Nakiros** | **Contexte = produit principal** | — |

Nakiros couvre le cycle complet : Produit → Contexte → Dev → Delivery. Les agents (PM, Architect, Dev, QA) consomment et enrichissent le même contexte partagé.

---

## 2. Nakiros Desktop — Périmètre

### Ce que Desktop fait

- **Éditeur de contexte structuré** par sections (workspace, repo, domaine fonctionnel)
- **Générateur de contexte assisté** : lance des agents de discovery qui produisent les markdowns
- **Synchronisation SaaS** : push/pull des markdowns vers le backend Cloudflare
- **Gestion du workspace** : configuration des repos, PM tool, membres, rôles
- **Interface PM** : backlog, tickets, epics, sprints (synced Jira/GitHub/Linear)
- **Indicateurs de fraîcheur** : sections non mises à jour depuis X jours
- **Validation de contexte** : quand un agent propose une mise à jour, l'humain valide en 1 clic

### Ce que Desktop ne fait PAS

- ❌ Lancer des agents en production (c'est le rôle de l'orchestrateur CLI)
- ❌ Parser des nakiros-action blocks
- ❌ Être obligatoire pour utiliser les agents au quotidien

**Rationale** : Séparer Desktop de l'orchestrateur permet à n'importe quel client (Claude CLI, Codex, extensions VS Code) de bénéficier du contexte sans dépendre de l'application Electron.

---

## 3. L'Orchestrateur — Process séparé

### Principe

L'orchestrateur est un **CLI indépendant** (`nakiros run` ou `nakiros attach`), pas un module embarqué dans le Desktop.

```
nakiros run --agent dev "implémente le ticket AUTH-42"
```

### Responsabilités

1. **Pré-chargement du contexte** : lit `~/.nakiros/{wsId}/workspace.yaml` → récupère les sections pertinentes depuis le cache local (synced depuis SaaS) → construit le system prompt
2. **Lancement de l'agent** : injecte le contexte + passe les `--add-dir` des repos locaux
3. **Parsing des nakiros-action blocks** : intercepte les outputs, exécute les actions
4. **Post-session** : propose les mises à jour de contexte générées par l'agent

### Ce que l'orchestrateur NE fait PAS

- ❌ Il ne tourne pas dans le Desktop Electron
- ❌ Il n'est pas nécessaire pour les extensions VS Code interactives

### Compatibilité clients

| Mode | Orchestrateur | nakiros-actions | Context injection |
|---|---|---|---|
| `nakiros run` (API directe) | ✅ | ✅ | ✅ |
| Claude CLI non-interactif (`claude -p`) | ✅ | ✅ | ✅ |
| Claude Code extension VS Code | ❌ | ❌ | ✅ via CLAUDE.md |
| Codex CLI interactif | ❌ | ❌ | ✅ via fichiers locaux |

---

## 4. Stratégie de contexte

### Principe : injection pré-session, pas de RAG pour v1

Le contexte est injecté **avant** le lancement de l'agent, pas demandé dynamiquement pendant la session.

**Pourquoi pas de RAG en v1 :**
- Les workspaces v1 ont des contextes de 5-20KB au total
- Le overhead infrastructure (Vectorize, embedding workers) n'est pas justifié
- L'injection de fichiers markdown ciblés suffit largement
- Le RAG devient pertinent quand le contexte dépasse X tokens en moyenne → backlog v2

### Stockage dual

| Couche | Contenu | Emplacement |
|---|---|---|
| **SaaS (Cloudflare D1)** | Markdowns de contexte, membership, PM data | `api.nakiros.com` |
| **Local cache** | Copie des markdowns synced | `~/.nakiros/{wsId}/` |
| **Repo pointer** | Lightweight link vers le workspace | `{repo}/_nakiros/workspace.yaml` |

### Paths locaux — jamais dans le SaaS

Le SaaS ne connaît que les **noms symboliques** des repos (`frontend`, `backend`).
Les chemins absolus (`/Users/thomas/projects/frontend`) vivent uniquement dans `workspace.yaml` local, propres à chaque machine.

```yaml
# ~/.nakiros/{wsId}/workspace.yaml  (jamais commité)
workspace:
  name: MonProjet
  repos:
    - name: frontend
      localPath: /Users/thomas/projects/frontend
    - name: backend
      localPath: /Users/thomas/projects/backend
```

### Context injection pour extensions VS Code

Pour Claude Code extension et Codex en mode interactif :

```markdown
<!-- _nakiros/CLAUDE.md — généré par l'orchestrateur au workspace:sync -->
@_nakiros/context/workspace.md
@_nakiros/context/auth.md
@_nakiros/context/conventions.md
```

L'agent lit le contexte sans tool call, sans dépendance réseau.

### Structure des markdowns de contexte

**Niveau workspace :**
- `product.md` — vision produit, personas, glossaire
- `global.md` — décisions cross-cutting, contraintes, log de décisions
- `inter-repo.md` — contrats entre repos, points d'intégration, API boundaries

**Niveau repo :**
- `architecture.md` — design structurel, patterns, entry points
- `stack.md` — tech stack, frameworks, versions, dépendances
- `conventions.md` — naming, style, structure de dossiers, testing strategy
- `api.md` — contrats exposés (pour intégration multi-repo)
- `{domain}.md` — sections par domaine fonctionnel (auth, payment, notifications...)

**Chunking par domaine fonctionnel** (pas par taille fixe) : un agent qui travaille sur l'auth ne charge que `auth.md`, pas tout `architecture.md`.

---

## 5. MCP — 2 tools uniquement

### Rationale

Chaque tool MCP charge son schema complet dans le contexte de l'agent. Avec 15 tools, on perd 2-3k tokens en définitions. La solution : **2 tools génériques** qui couvrent tous les cas.

### Design

```typescript
// Découverte — "qu'est-ce que je dois envoyer ?"
nakiros_api(intent: string): {
  operationId: string,   // identifiant sémantique de l'opération
  schema: object,        // champs attendus
  example: object        // exemple prêt à adapter
}

// Exécution — "envoie ça"
nakiros_execute(operationId: string, payload: object): any
```

### Flow agent

```
Agent : "je veux créer un ticket"

1. nakiros_api("create ticket")
   → { operationId: "create_ticket",
       schema: { title: string, description: string, epicId?: string },
       example: { title: "Auth login page", description: "...", epicId: "EP-12" } }

2. Agent adapte l'exemple avec ses valeurs

3. nakiros_execute("create_ticket", { title: "...", description: "...", epicId: "EP-12" })
   → { id: "TK-47", url: "..." }
```

### Avantages

- **Auth invisible** : `nakiros_execute` gère le token Clerk, l'agent ne le voit jamais
- **Endpoints invisibles** : l'agent travaille avec des `operationId` sémantiques
- **Extensible sans nouveau tool** : ajouter une opération = enregistrer un nouvel `operationId` côté serveur
- **2 schemas seulement** dans le contexte, quel que soit le nombre d'opérations

### Opérations couvertes

```
create_ticket / update_ticket / add_comment / update_ticket_status
create_epic / create_story / create_task
workspace_context_set / repo_context_set
workspace_context_get / repo_context_get
list_tickets / get_sprint
```

---

## 6. Les agents et leur relation au contexte

### Principe fondamental

**Chaque agent laisse le contexte meilleur qu'il ne l'a trouvé.**

Les agents ne consomment pas seulement le contexte — ils le font vivre. Après chaque session, l'agent peut proposer des mises à jour ; l'humain valide en 1 clic dans le Desktop.

### Carte agents / contexte

```
[PM]          lit product, global        → enrichit product (specs, personas, ACs)
[Architect]   lit architecture, stack    → enrichit architecture, api, inter-repo
[Dev]         lit tout                   → propose màj conventions, stack, domaines
[QA]          lit specs + tests          → enrichit context tests, edge cases
[SM]          lit statuts + dépendances  → enrichit global (décisions, gouvernance)
```

### Flux d'une feature

```
1. PM        → rédige specs → enrichit product context
2. Architect → design       → enrichit architecture + api
3. Dev       → implémente   → propose màj conventions + domaines
4. QA        → valide       → enrichit context edge cases
5. SM        → close        → enrichit global (décisions de sprint)
```

Chaque sprint, le projet est **mieux compris par les agents** que le précédent. C'est le moat Nakiros — aucun concurrent ne peut répliquer le contexte accumulé sur un workspace spécifique.

---

## 7. Modèle économique — ce que justifie le SaaS

La synchronisation distante est ce qui justifie l'abonnement mensuel.

| Valeur | Pourquoi l'utilisateur paie |
|---|---|
| Contexte partagé entre devs | Junior onboardé avec le contexte de l'équipe dès le jour 1 |
| Multi-device | Même contexte Mac perso + poste pro |
| Historique des versions | Traçabilité des décisions d'architecture |
| Accès par rôle | PM peut lire, tech lead peut éditer |
| Sync automatique post-génération | Contexte maintenu sans action manuelle |

---

## 8. Roadmap v1 — 4 sprints

### Sprint 1 — Context Foundation
- Structure des markdowns de contexte (sections validées)
- SaaS sync CRUD (push/pull markdowns)
- Agent Discovery (scan repo → génère contexte initial)
- Desktop = éditeur de contexte structuré par sections
- Orchestrateur CLI (`nakiros run`) : inject context → lance agent → parse nakiros-actions

### Sprint 2 — PM Layer
- Agent PM (specs, user stories, ACs)
- Backlog Nakiros + sync Jira
- Agent Architect (design, tech decisions, mise à jour contexte)

### Sprint 3 — Dev Layer
- Agent Dev (implémentation, proposition de mise à jour contexte)
- Flow de validation contexte : agent propose → humain valide 1 clic
- Agent QA (validation ACs, enrichissement contexte tests)

### Sprint 4 — Feedback Loop + Polish
- Loop complet end-to-end fonctionnel
- Indicateurs de qualité contexte (fraîcheur, complétude par section)
- Distribution : DMG / AppImage + CLI npm package

---

## Décisions rejetées (et pourquoi)

| Décision | Rejetée car |
|---|---|
| RAG + Vectorize en v1 | Over-engineering pour des contextes de 5-20KB. Backlog v2 avec trigger clair. |
| MCP complet (15+ tools) | Overhead de 2-3k tokens en schemas. Remplacé par `nakiros_api` + `nakiros_execute`. |
| Orchestrateur dans le Desktop | Lock-in Electron. Agents CLI (Claude, Codex) ne peuvent pas en bénéficier. |
| Context fetch dynamique via actions | Round trip mid-session coûteux. Remplacé par injection pré-session. |
| Paths absolus dans le SaaS | Non-portable entre machines. Paths locaux uniquement dans `workspace.yaml` local. |
