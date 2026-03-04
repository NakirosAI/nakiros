# Ticket — Vue Chat IA

## Contexte

Aujourd'hui le chat est mélangé avec la vue Product. Ce n'est pas le bon endroit — le chat est un espace de pensée libre qui peut produire ou non des artefacts dans Nakiros. Il doit être une vue dédiée et indépendante, accessible depuis n'importe où dans l'app.

## Objectif

Créer une vue Chat IA dédiée — le point d'entrée unique de toute interaction avec les agents, workflows et commandes Nakiros. Un dev peut préparer une réunion, lancer un Dev Story, challenger un ticket ou explorer une idée — tout depuis le même endroit.

---

## Position dans l'app

Vue dédiée dans la sidebar de navigation, au même niveau que Morning Briefing, Product et Delivery.

```
Sidebar :
  Morning Briefing
  Chat IA            <- ici
  Product
  Delivery
```

---

## Layout général

```
+------------------------+------------------------------------------+
| HISTORIQUE             | ONGLETS DE SESSIONS                      |
|                        | [Session 1] [Session 2] [Session 3] [+]  |
| AUJOURD'HUI            +------------------------------------------+
|  Dev Story · EX-203    |                                          |
|  PM · Architect · Dev  | ZONE DE CHAT ACTIVE                      |
|                        |                                          |
|  Prépa réunion Q2      | Messages de la session en cours          |
|  PM Agent              | avec streaming en temps réel             |
|                        |                                          |
| HIER                   |                                          |
|  Generate Context      +------------------------------------------+
|  Architect             | [Agent ▼]  [Éditeur ▼]                   |
|                        | +--------------------------------------+ |
|  Challenge sprint 12   | | Écris ton message...                 | |
|  PM · SM · Architect   | +--------------------------------------+ |
+------------------------+------------------------------------------+
```

---

## Panel gauche — Historique des sessions

### Structure

Sessions groupées par date, ordre chronologique inverse.

```
AUJOURD'HUI
  Dev Story · EX-203 ledger DynamoDB
  PM Agent · Architect · Dev Agent

  Préparation réunion sprint Q2
  PM Agent

HIER
  Generate Context · Exploi
  Architect

  Challenge tickets sprint 12
  PM Agent · SM Agent · Architect

IL Y A 3 JOURS
  Analyse refacto module auth
  Architect · Brainstorming
```

### Détail de chaque entrée

- **Titre** — généré automatiquement depuis les premiers messages de la session. Texte blanc, taille normale.
- **Agents participants** — liste des agents qui ont participé à la session, séparés par des points médians ·. Texte gris clair, taille plus petite. Inclut tous les agents appelés manuellement ET les sous-agents lancés par les workflows.
- Clic sur une entrée → charge la session dans la zone de chat

### Persistance

Chaque session est sauvegardée dans :
```
~/.nakiros/workspaces/{id}/sessions/{session-id}.json
```

Format :
```json
{
  "id": "uuid",
  "title": "Dev Story · EX-203 ledger DynamoDB",
  "agents": ["pm", "architect", "dev"],
  "editor": "claude-code",
  "created_at": "2026-03-03T09:00:00Z",
  "updated_at": "2026-03-03T10:30:00Z",
  "messages": []
}
```

---

## Zone centrale — Onglets de sessions actives

### Comportement

- Maximum 12 onglets actifs simultanément
- Chaque onglet affiche le titre de la session (tronqué si nécessaire)
- Indicateur visuel si l'agent est en train de travailler dans cet onglet (point teal animé)
- Bouton [+] pour ouvrir une nouvelle session
- Fermeture d'un onglet ne supprime pas la session — elle reste dans l'historique

### Titre des onglets

- Nouvelle session non nommée : "Nouvelle session"
- Titre généré automatiquement après les 2 premiers échanges
- Sessions lancées depuis le Getting Started ou un workflow : titre pré-défini (ex: "Generate Context · Exploi")

---

## Zone de chat — Messages

### Affichage des messages

- Messages utilisateur : alignés à droite, fond #1A1A1A
- Messages agent : alignés à gauche, fond #111111, avec badge de l'agent en haut (ex: "PM Agent")
- Streaming en temps réel — les tokens s'affichent au fur et à mesure
- Support markdown complet dans les réponses des agents

### Appels MCP visibles

Quand un agent appelle le MCP server pour affiner son contexte, afficher une ligne discrète dans le chat :

```
  ↳ MCP · get_ticket EX-203
  ↳ MCP · get_context tenant-management
  ↳ MCP · git_log tenant-management
```

Texte gris très léger, italique, indentation. L'utilisateur voit ce que l'agent cherche sans que ça pollue la conversation.

### Changement d'agent en cours de session

L'utilisateur peut changer d'agent via le select en bas sans ouvrir un nouvel onglet. Le changement d'agent est visible dans le chat :

```
── Architect a rejoint la conversation ──
```

Le nouvel agent hérite du contexte de toute la conversation précédente.

---

## Zone de saisie — Selects et input

### Select Agent

Dropdown avec 3 groupes :

```
META-AGENT
  Nakiros        ← sélectionné par défaut
               Analyse l'intention et route vers le bon agent

AGENTS
  Dev Agent
  PM Agent
  Architect
  SM Agent
  QA Agent
  Hotfix Agent
  Brainstorming

WORKFLOWS
  Dev Story
  Create Story
  Create Ticket
  Generate Context
  Project Confidence
  QA Review
  Hotfix Story
  Sprint Planning
  Sprint Retro
```

Quand un workflow ou une commande est sélectionné, le champ de saisie affiche un placeholder contextuel :
- Dev Story → "Entrez l'ID du ticket (ex: EX-203)"
- Generate Context → "Lancer Generate Context sur ce workspace ?"
- Create Ticket → "Décrivez le ticket à créer..."

### Select Éditeur IA

```
  Claude Code    ← détecté et sélectionné par défaut
  Cursor
  Codex
```

Affiche uniquement les éditeurs détectés sur la machine. Les éditeurs non installés sont grisés avec la mention "Non détecté".

### Champ de saisie

- Multiline, s'agrandit automatiquement avec le contenu
- Entrée pour envoyer, Shift+Entrée pour saut de ligne
- Placeholder par défaut : "Parle avec Nakiros..."

---

## Contexte injecté automatiquement

Chaque session reçoit automatiquement dans son system prompt :

1. `~/.nakiros/workspaces/{id}/context/global-context.md` — vision globale du workspace
2. `{repo}/_nakiros/llms.txt` — contexte condensé de chaque repo du workspace
3. Liste des tickets actifs du sprint en cours (résumé)
4. Date et heure courantes

L'utilisateur ne voit pas ce contexte et ne le gère pas. C'est transparent.

L'agent affine ensuite via des appels MCP selon ses besoins — tickets complets, fichiers spécifiques, état git, PRs ouvertes, etc.

---

## Meta-agent Nakiros — Comportement de routage

Quand l'utilisateur envoie un message avec "Nakiros" sélectionné, le meta-agent analyse l'intention et :

**Si l'intention est claire** → bascule automatiquement vers l'agent approprié et continue la conversation :
- "Je veux préparer le sprint suivant" → SM Agent
- "J'ai un doute sur l'architecture du module auth" → Architect
- "Lance EX-203" → Dev Agent via workflow Dev Story
- "Ce ticket est mal défini" → PM Agent

**Si l'intention est ambiguë** → pose une question de clarification avant de router :
- "Tu veux créer un nouveau ticket ou challenger un existant ?"
- "Tu parles du repo front ou du repo back ?"

**Si la demande est conversationnelle sans action** → reste en mode Nakiros et répond directement :
- Préparation de réunion
- Questions générales sur le projet
- Exploration d'idées

Le changement d'agent est toujours visible dans le chat :
```
── Nakiros → PM Agent ──
```

---

## Sessions lancées automatiquement depuis l'app

Quand une session est lancée depuis le Getting Started, le Morning Briefing ou le board Delivery :

1. La vue Chat IA devient active
2. Un nouvel onglet s'ouvre avec le titre pré-défini
3. L'agent et le workflow sont pré-sélectionnés
4. Le workflow démarre automatiquement sans action de l'utilisateur

Si le Chat IA n'est pas la vue active au moment du lancement, basculer automatiquement vers la vue Chat IA.

---

## Ce qu'il faut supprimer

- Le chat intégré dans la vue Product : le retirer complètement
- Les quick action buttons dans la vue Product qui lancent des agents : les remplacer par des boutons qui redirigent vers le Chat IA avec le bon agent pré-sélectionné

---

## Ce qu'il ne faut pas toucher

- La logique existante des 12 onglets si elle existe déjà
- Le streaming des réponses agents
- Le dark theme et les couleurs teal
- La sidebar de navigation