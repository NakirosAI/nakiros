# Nakiros — Product Context

> Document vivant. Pas un PRD. Mis à jour au fil des décisions.
> Dernière mise à jour : 2026-04-09

---

## Ce qu'est Nakiros

**Nakiros est le layer de contexte partagé pour les organisations produit.**

Il ne remplace pas Jira, Notion, Cursor, ou Claude Code. Il se pose au-dessus de tous ces outils et connecte les rôles entre eux via un contexte commun et des agents spécialisés par rôle.

Chaque personne dans l'organisation travaille avec ses propres agents, ses propres outils, ses propres MCPs — mais tous partagent le même contexte produit.

### Le cycle complet — Discovery, Delivery, Support

Nakiros couvre les trois phases du cycle produit :

| Phase | Qui | Ce que Nakiros apporte |
|---|---|---|
| **Product Discovery** | PM, Head of Product, UX | Brancher Loom, Dovetail, Notion via MCP. Utiliser les agents pour analyser les retours, identifier des patterns, rédiger des specs. Le contexte discovery est partagé avec le reste de l'équipe. |
| **Product Delivery** | Dev, Architect, QA, DevOps | Implémenter avec le contexte PM complet. Mettre à jour les tickets, les stories, le statut. Les agents dev ont accès aux specs, à l'archi, aux contraintes. |
| **Support** | Support, Customer Success | Connecter Zendesk, Intercom via MCP. Lire le contexte produit pour répondre aux clients. Remonter des besoins structurés vers le PM. |

**L'IA fait le travail. L'humain valide.** L'agent analyse, rédige, propose des diffs, enrichit le contexte — mais rien ne s'écrit sans validation humaine. Pas d'agent qui tourne en arrière-plan et modifie le produit tout seul.

Le PM demande à son agent d'analyser des retours Loom → l'agent produit une synthèse → le PM valide le diff dans Context. Le dev lance son agent sur une feature → l'agent implémente et propose un diff → le dev valide. Le support connecte Zendesk → l'agent identifie un pattern → le support décide de créer une contribution.

L'agent fait 95% du travail. L'humain fait le dernier clic.

---

## Le problème central

Les équipes produit aujourd'hui utilisent l'IA en silos :
- Le dev a son Claude Code avec son CLAUDE.md
- Le PM a ses prompts dans Notion
- L'architecte a ses docs dans Confluence
- Le support a ses tickets dans Zendesk

Résultat : l'agent du dev ne sait pas ce que le PM a spécifié. L'agent du PM ne voit pas les contraintes techniques de l'architecte. Pas de cohérence, duplication, frustration.

**La conséquence concrète :** un dev qui dit à son agent "implémente cette feature" sans contexte produit obtient ~69% de réalisation correcte. Avec le contexte complet (spec PM, contraintes archi, personas, NFR), il monte à ~80%. Moins de retravail, moins d'aller-retours, moins de bugs.

---

## La proposition de valeur par rôle

Chaque rôle adopte Nakiros pour une raison qui lui est propre — pas pour faire plaisir à l'organisation :

| Rôle | Raison d'adopter |
|---|---|
| **Dev** | Son agent implémente mieux — moins de retravail, moins de réunions de clarification |
| **PM** | Ses specs sont implémentées correctement du premier coup |
| **QA** | Moins de bugs car l'agent dev avait le bon contexte |
| **Architecte** | Ses décisions techniques sont respectées par tous les agents |
| **Support** | Il comprend le produit et peut faire remonter des besoins de façon structurée |
| **DevOps** | L'infra est documentée et compréhensible par tous |

---

## Ce que Nakiros n'est pas

- ❌ Un système d'agents autonomes qui agissent sans validation (Paperclip)
- ❌ Un remplaçant de Jira, Linear, Notion — il se pose au-dessus
- ❌ Un IDE IA (Cursor, Claude Code, Windsurf)
- ❌ Un outil pour les solo devs ou les petites équipes (2-5 personnes)

---

## Cible

**Organisations avec des équipes constituées** — une boite qui a déjà un PM, un architecte, des devs, un devops, potentiellement un support. Pas une startup 3 personnes où tout le monde fait tout.

Les équipes qui ont ce problème :
- Chacun utilise l'IA dans son coin avec son propre contexte
- Pas d'alignement entre ce que le PM a spécifié et ce que le dev implémente
- Le contexte "où est-ce qu'on met ça ?" (Confluence ? Notion ? Gitlab ?) n'existe pas vraiment

---

## Architecture des surfaces

### Desktop App (tous les rôles)
Hub organisationnel. PM, PO, Architecte, Support, DevOps, QA — tout le monde qui travaille sur le produit mais pas forcément dans un IDE. C'est la même app pour tout le monde — le rôle change le contenu, pas la navigation.

### VS Code Extension (devs uniquement)
Même contexte, mêmes agents, dans l'environnement naturel du dev. Il ne quitte jamais son éditeur.

### Web App (admin organisationnel — temps 2)
Back-office : créer l'org, gérer les membres, configurer les rôles, gérer les abonnements.

---

## Desktop — Navigation

4 sections + Settings. Identiques pour tous les rôles.

| Section | Ce que c'est |
|---|---|
| **Home** | État du projet : activité récente, contributions en attente, agents actifs, alertes de fraîcheur du contexte |
| **Context** | Arborescence documentaire. Lecture pour tous, écriture selon scope. Protection de fichiers/dossiers. Review des contributions. |
| **Chat IA** | Conversations privées avec les agents. Diffs inline. Invocation via @ (agent), # (fichier), / (workflow). |
| **Agents** | Éditeur visuel d'agents et workflows (nodes/edges). Configuration MCPs. Personnalisation des instructions. |
| **Settings** | Profil, providers IA, workspace config. Pour l'admin : membres, rôles, abonnement. |

**Workspace switcher** : clic sur le logo dans la sidebar → dropdown des workspaces disponibles.

---

## Modèle de gouvernance

### Read : universel
Tout le monde peut lire le contexte partagé. C'est une feature, pas un risque. Le dev comprend la vision produit. Le PM comprend les contraintes techniques. Le support sait comment fonctionne l'app pour répondre aux clients.

### Write : libre dans son scope
L'écriture est activée par rôle. Chaque rôle peut écrire dans le contexte — les droits se gèrent fichier par fichier et dossier par dossier dans Context, pas dans Settings.

### Pas de structure imposée
Nakiros ne force pas de structure de dossiers. Chaque workspace s'organise comme il veut. Les exemples par défaut (features/, architecture/, sprints/...) sont des suggestions, pas des contraintes.

### Protection de fichiers
Par défaut, l'écriture est directe — pas de validation. L'admin ou le owner d'un fichier/dossier peut le **protéger** en un clic dans la toolbar de Context :
- Fichier/dossier protégé → toute modification passe en review avant d'être appliquée
- Un reviewer est assigné (ex: product.md → Head of Product)
- Le geste est contextuel : on protège dans Context, pas dans Settings

Même logique que les branch protection rules sur GitHub — on protège ce qui est critique, pas tout.

### Le scope s'applique aux agents aussi
C'est le killer feature. L'agent PM ne peut pas écrire dans `architecture/` même si l'humain lui demande. L'agent Dev ne peut pas modifier `product.md`. Les guardrails sont structurels — l'agent respecte le même scope que l'humain qui l'a lancé.

### Rôles
Rôles par défaut livrés avec Nakiros (tous modifiables, nouveaux rôles créables). Chaque rôle définit :
- Quels agents sont disponibles
- Quels MCPs sont disponibles
- L'écriture est activée (le scope réel se gère dans Context)

### Contribution workflow
Quand un agent ou un humain propose une modification hors de son scope ou sur un fichier protégé :
1. La modification crée une **contribution** (comme une PR)
2. Le fichier apparaît avec un badge "À reviewer" dans Context
3. Le reviewer ouvre le fichier, lit le contenu, peut lancer son agent dessus pour l'enrichir
4. Il valide (le fichier est écrit) ou refuse (notification à l'auteur)

Les contributions vivent dans Context, pas dans Chat IA. Les conversations sont privées, les outputs sont partagés.

---

## Conversations

### Privées par défaut
Les conversations Chat IA sont privées. Personne ne voit ce que tu demandes à ton agent.

### Les outputs sont partagés
Quand ton agent propose un diff et que tu le valides → ça s'écrit dans Context → visible par tous. Le lien entre les rôles c'est le Context, pas le Chat.

---

## Onboarding

### Admin (web app)
1. Crée l'organisation
2. Définit les rôles (agents, MCPs)
3. Crée le workspace
4. Invite les membres → email d'invitation

### Nouveau membre (desktop)
1. Reçoit l'invitation → télécharge le desktop
2. Login → org détectée → workspace sync automatique
3. Arrive sur Home avec ses stats, ses agents prêts, ses MCPs configurés
4. Même app que tout le monde — le contenu s'adapte à son rôle

**Principe :** zéro configuration pour le nouveau membre. L'admin a tout préparé en amont.

---

## Positionnement marché

### Ce qui existe vs Nakiros

| Outil | Ce qu'il fait | Limite vs Nakiros |
|---|---|---|
| Atlassian Rovo | Agents dans Jira/Confluence | Tool-centric (pas role-centric), verrouillé Atlassian |
| ChatPRD | Agent PM pour les specs | PM uniquement, pas de dev/QA/support |
| Cursor/Windsurf | IDE IA avec RBAC | Devs uniquement |
| Notion AI Agents | Contexte partagé | Permissions document-level, pas scope par rôle |
| Claude Code | Agent dev puissant | Individuel, pas organisationnel |

### Le vrai angle mort

Tous les incumbents arrivent depuis leur outil (Jira, Notion, Linear). Nakiros joue un niveau au-dessus — vendor-agnostic, au-dessus de tous les outils. C'est là où personne n'est.

### Adoption bottom-up
Le dev adopte Nakiros parce que son agent est meilleur. Le PM adopte parce que ses specs sont mieux implémentées. Le support adopte parce qu'il comprend enfin le produit. Personne n'a besoin d'une décision managériale pour adopter.

---

## Roadmap

### V1 — Desktop + gouvernance + personnalisation (maintenant)
Le produit de base. Desktop pour tous les rôles, contexte partagé synchronisé via Cloudflare. Gouvernance par scope, protections de fichiers, contributions.

**Ce qui est déjà là :** Desktop shell, 10 agents, Chat IA avec diffs, Backlog complet, Auth + Orgs, Worker Cloudflare, Orchestrateur multi-provider.

**Ce qu'il reste à construire :**
- Protection fichiers/dossiers (UI + backend)
- Contribution workflow (créer, reviewer, valider/refuser)
- Scope enforcement par rôle (backend + binding agents)
- Home dashboard (activité, contributions, fraîcheur)
- Workspace switcher (dropdown sidebar)
- Personnalisation agents (override instructions par user, MCPs par agent, provider par défaut)
- Éditeur de workflows visuel (nodes/edges, conditions, actions Write avec switch diff/direct)

La personnalisation est critique — c'est ce qui fait que l'outil est une plateforme, pas un produit figé. Sans ça, tous les PM ont le même agent, aucune différenciation.

**Objectif :** valider l'adoption — 5 équipes, mesurer rétention à 30 jours. Est-ce que le PM ET le dev utilisent encore ?

**Infra :** Cloudflare Workers + D1. Coût : ~5€/mois. Le SaaS sync est déjà en place.

### V1b — Mode automatique progressif
Les utilisateurs connaissent leurs agents, ils voient qu'ils ne font pas de bêtises. On déverrouille le mode auto — action par action, pas globalement.

C'est déjà dans l'éditeur de workflow : chaque nœud Write a un switch "Diff + validation" / "Écrire directement". L'utilisateur choisit, par action, ce qu'il automatise. Un PM peut auto-valider les ACs mais garder la validation manuelle sur product.md.

**Le scénario full auto :** Le support reçoit un ticket → l'agent identifie une feature → crée la contribution → le PM auto-valide → l'agent PM rédige la spec → le dev auto-lance l'implémentation → QA review → déploiement. Le lendemain l'équipe arrive, checke la branche, merge.

**Mais c'est un choix par équipe, pas un mode par défaut.** Nakiros démarre en mode validation. L'auto se déverrouille progressivement quand la confiance est là. Chaque équipe va à son rythme.

### V1.5 — RAG workspace
Le contexte est là (V1 l'a produit). On ajoute une recherche sémantique dessus : Cloudflare Vectorize + Workers AI. Les agents ne chargent plus des fichiers markdown entiers — ils query ce dont ils ont besoin. Le coût token baisse, la pertinence monte.

**Ce que ça change :** passage de 5-20KB de contexte injecté à des requêtes ciblées. Le contexte peut scaler à des centaines de fichiers sans exploser les tokens.

**C'est un sprint, pas un projet.** Le RAG consomme ce que la V1 a déjà produit.

### V2 — Full SaaS, pay-per-token
Zéro install. Pas besoin de Node, pas de CLI, pas de config locale. Le PM ouvre le navigateur, il a ses agents, il paye au token.

**Ce que ça change :** plus de friction d'adoption. L'argument "faut que mon dev configure le MCP" disparaît. L'acquisition passe de bottom-up dev à top-down — le Head of Product peut s'inscrire et inviter son équipe en 5 minutes.

### Pricing (à affiner)

| Plan | Ce qu'il inclut | Prix |
|---|---|---|
| **Free** | 1 workspace, 2 membres, contexte local | 0€ |
| **Team** | Workspaces illimités, sync cloud, rôles, protections | 8€/user/mois |
| **Enterprise** | + RAG, + SSO, + audit log | Sur devis |

Le Free c'est l'acquisition. Le Team c'est le revenu. L'Enterprise c'est l'upsell avec le RAG.

8€/user/mois — moins que Linear (10€), moins que Notion (10€), plus de valeur (contexte + agents + gouvernance).

---

## Mockups

Les mockups de référence sont dans `docs/ux-ui/desktop-mockups.html`. Ils couvrent :
- Login, Onboarding
- Home (avec toggle de rôle pour voir comment le contenu s'adapte)
- Context (arborescence, lecture/écriture, protection de fichiers, review de contribution)
- Chat IA (conversations privées, diffs inline, @ # /)
- Agents (éditeur visuel workflow nodes/edges, MCPs, instructions)
- Settings (profil, providers, admin: rôles/membres)
- Workspace switcher (dropdown depuis le logo sidebar)
