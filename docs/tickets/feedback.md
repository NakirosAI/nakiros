# Ticket — Système de feedback utilisateur

## Contexte

Nakiros a besoin de collecter deux types de feedback pour améliorer les agents, workflows et l'application :
1. **Feedback de session** — qualité d'une conversation dans le Chat IA
2. **Feedback produit** — suggestions et bugs sur l'application

Les données sont stockées dans Cloudflare D1 (base existante) via un nouveau Worker dédié.

---

## Infrastructure

### Nouveau Worker

URL : `feedback.nakiros.com`
Cloudflare Worker TypeScript — reçoit les feedbacks depuis l'app et écrit en D1.

Même système de sécurité que `updates.nakiros.com` :
- Header `X-Nakiros-Key` obligatoire
- Header `User-Agent` au format Nakiros

### Tables D1

#### Table `feedback_sessions`

```sql
CREATE TABLE feedback_sessions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  rating INTEGER NOT NULL,        -- 1 (pouce haut) ou -1 (pouce bas)
  comment TEXT,                   -- commentaire optionnel
  agent TEXT NOT NULL,            -- ex: "dev", "pm", "architect"
  workflow TEXT,                  -- ex: "dev-story", null si conversation libre
  editor TEXT NOT NULL,           -- ex: "claude-code", "cursor", "codex"
  duration_seconds INTEGER,       -- durée de la session en secondes
  message_count INTEGER,          -- nombre de messages échangés
  conversation TEXT,              -- streamJson de la CLI (opt-in uniquement)
  conversation_shared INTEGER DEFAULT 0, -- 0 ou 1
  app_version TEXT NOT NULL,
  bundle_version TEXT NOT NULL,
  platform TEXT NOT NULL,         -- "darwin", "win32", "linux"
  created_at TEXT NOT NULL
);
```

#### Table `feedback_product`

```sql
CREATE TABLE feedback_product (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,   -- "bug", "suggestion", "agent", "workflow", "ux"
  message TEXT NOT NULL,
  app_version TEXT NOT NULL,
  bundle_version TEXT NOT NULL,
  platform TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

---

## Endpoints Worker

### POST /session

Reçoit un feedback de session.

**Body JSON :**
```json
{
  "session_id": "uuid",
  "workspace_id": "hash-stable",
  "rating": 1,
  "comment": "L'agent a bien compris le contexte",
  "agent": "dev",
  "workflow": "dev-story",
  "editor": "claude-code",
  "duration_seconds": 847,
  "message_count": 12,
  "conversation_shared": true,
  "conversation": "{...streamJson...}",
  "app_version": "1.0.0",
  "bundle_version": "1.0.0",
  "platform": "darwin"
}
```

**Validation :**
- `rating` doit être 1 ou -1
- `conversation` uniquement accepté si `conversation_shared: true`
- `message` tronqué à 5000 caractères maximum si trop long
- Si `conversation_shared: false` → le champ `conversation` est ignoré même s'il est envoyé

**Réponse succès (201) :**
```json
{ "success": true, "id": "uuid" }
```

---

### POST /product

Reçoit un feedback produit.

**Body JSON :**
```json
{
  "category": "suggestion",
  "message": "Ce serait bien d'avoir un raccourci clavier pour ouvrir le chat",
  "app_version": "1.0.0",
  "bundle_version": "1.0.0",
  "platform": "darwin"
}
```

**Validation :**
- `category` doit être parmi : `bug`, `suggestion`, `agent`, `workflow`, `ux`
- `message` obligatoire, minimum 10 caractères, maximum 2000 caractères

**Réponse succès (201) :**
```json
{ "success": true, "id": "uuid" }
```

---

## UI — Feedback session dans le Chat IA

### Positionnement

Zone fixe entre le dernier message et la zone de saisie. Apparaît dès que le premier message a été envoyé dans la session. Reste visible pendant toute la durée de la session.

```
+----------------------------------------------------------+
|  Messages de la conversation...                          |
|                                                          |
+----------------------------------------------------------+
|  Cette conversation vous a-t-elle été utile ?            |
|  [👍]  [👎]                          [Envoyer →]         |
+----------------------------------------------------------+
|  Écris ton message...                          [Envoyer] |
+----------------------------------------------------------+
```

### États de la zone feedback

**État initial — aucune note**
```
Cette conversation vous a-t-elle été utile ?
[👍]  [👎]
```
Le bouton "Envoyer" n'est pas visible tant qu'aucune note n'est sélectionnée.

**État après clic sur 👍 ou 👎**
```
Cette conversation vous a-t-elle été utile ?
[👍✓]  [👎]   ← le pouce sélectionné est surligné en teal

Un commentaire ? (optionnel)
[_________________________________________________]

[ ] Partager cette conversation pour aider à améliorer Nakiros
    ⚠️ La conversation sera envoyée à l'équipe Nakiros.
       Elle peut contenir des informations sur votre projet.

[Envoyer →]
```

**Comportement de la checkbox "Partager la conversation" :**
- Décochée par défaut
- Si cochée : le streamJson de la session est inclus dans l'envoi
- Le texte d'avertissement est toujours visible quand la checkbox est affichée
- L'utilisateur doit cocher explicitement — jamais opt-out

**État après envoi**
```
Merci pour votre retour 🙏
```

Le formulaire est remplacé par ce message de confirmation et ne réapparaît pas dans cette session.

### Comportement si l'utilisateur ferme l'onglet sans envoyer

Si une note a été sélectionnée mais pas envoyée → envoyer automatiquement le feedback sans commentaire ni conversation au moment de la fermeture de l'onglet.

Si aucune note n'a été sélectionnée → ne rien envoyer.

---

## UI — Feedback produit dans le header

### Positionnement

Bouton discret dans le header de l'app, toujours visible peu importe la vue active.

```
Header : [Chat IA]  [2 repos]  [Multi-repo]  [MCP ●]  [💬 Feedback]
```

### Modal feedback produit

Clic sur "💬 Feedback" ouvre un modal centré :

```
┌─────────────────────────────────────────────┐
│  Donnez-nous votre avis                  [×] │
│                                              │
│  Catégorie                                   │
│  [Bug ▼]                                     │
│   Bug                                        │
│   Suggestion                                 │
│   Agent                                      │
│   Workflow                                   │
│   UX / Interface                             │
│                                              │
│  Votre message                               │
│  ┌──────────────────────────────────────┐   │
│  │                                      │   │
│  │                                      │   │
│  └──────────────────────────────────────┘   │
│  Minimum 10 caractères                       │
│                                              │
│              [Annuler]  [Envoyer →]          │
└─────────────────────────────────────────────┘
```

**Comportement :**
- Catégorie sélectionnée par défaut : "Suggestion"
- Bouton "Envoyer" désactivé tant que le message fait moins de 10 caractères
- Après envoi : modal se ferme, notification discrète "Merci pour votre retour 🙏"
- En cas d'erreur réseau : message "Impossible d'envoyer le feedback. Réessayez."

---

## Données envoyées automatiquement

Ces données sont toujours incluses sans action de l'utilisateur, pour les deux types de feedback :

| Champ | Source |
|---|---|
| `app_version` | Version de l'app Electron |
| `bundle_version` | Version des agents depuis `~/.nakiros/version.json` |
| `platform` | `process.platform` (darwin, win32, linux) |

Pour les feedbacks session, en plus :

| Champ | Source |
|---|---|
| `session_id` | ID de la session en cours |
| `workspace_id` | Hash stable du workspace actif |
| `agent` | Agent sélectionné dans le select |
| `workflow` | Workflow lancé dans la session (null si conversation libre) |
| `editor` | Éditeur IA sélectionné dans le select |
| `duration_seconds` | Timestamp fin - timestamp début de la session |
| `message_count` | Nombre de messages dans la session |

**Ce qui n'est jamais envoyé sans opt-in explicite :**
- Le contenu de la conversation (streamJson)
- Les chemins de fichiers locaux
- Les identifiants Jira ou tokens OAuth

---

## Gestion des erreurs réseau

Si `feedback.nakiros.com` est inaccessible :
- Le feedback est mis en queue locale dans `~/.nakiros/feedback-queue.json`
- Retry automatique au prochain démarrage de l'app
- Maximum 50 feedbacks en queue — au-delà les plus anciens sont supprimés
- L'utilisateur ne voit jamais d'erreur bloquante pour un feedback

---

## Ce qu'il ne faut pas toucher

- La logique de session existante dans le Chat IA
- Le Worker `updates.nakiros.com` — nouveau Worker séparé
- Les tables D1 existantes
- Le header de l'app — uniquement ajout du bouton Feedback