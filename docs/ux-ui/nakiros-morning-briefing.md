# Ticket — Refactor : Overview vers Morning Briefing

## Contexte

La page Overview actuelle affiche des métriques statiques et 3 boutons toujours identiques. Elle ne donne pas de valeur réelle au dev ou au PO qui ouvre l'app le matin.

## Objectif

Transformer la page Overview en Morning Briefing — une page vivante qui répond à une seule question : "Qu'est-ce qui s'est passé et qu'est-ce que je fais aujourd'hui ?"

---

## Layout

```
+----------------------------------------------------------+
| MORNING BRIEFING BANNER — résumé dynamique               |
+-----------------------------+----------------------------+
| SPRINT ACTIF                | AGENT ORCHESTRATION        |
| Tickets actifs uniquement   | Live Idle / Active         |
|                             | EXECUTION FEED             |
+-----------------------------+----------------------------+
| ALERTES INTELLIGENTES                                    |
+----------------------------------------------------------+
| DAILY REPORT (si généré hier)                            |
+----------------------------------------------------------+
```

---

## Zone 1 — Morning Briefing Banner

Bandeau en haut, fond #111111, texte blanc.

Phrase générée dynamiquement depuis les données locales — pas d'appel IA, logique de template.

Exemples :
- "3 tickets terminés hier. 5 en cours aujourd'hui. EX-202 sans commit depuis 3 jours — à surveiller."
- "Sprint à 68% de vélocité. 2 PRs en attente de review."
- "Aucune activité hier. 8 tickets en attente dans le sprint."

Logique de génération :
- Comparer état des tickets aujourd'hui vs hier
- Détecter tickets En cours depuis +3 jours sans activité git
- Détecter PRs ouvertes sans review depuis +48h
- Détecter tickets bloqués

---

## Zone 2 — Sprint Actif (colonne gauche)

Titre : Nom du sprint actif + dates. Exemple : "Sprint 12 · 24 fév — 7 mars"

Tickets du sprint actif uniquement, groupés par statut :

EN COURS (5)
- EX-203 [HIGH] Brancher le ledger DynamoDB — Dev Agent actif
- EX-202 [HIGH] Mettre en place le socle — ALERTE 3 jours sans commit
- EX-201 [HIGH] Brancher le ledger sur flux tenant
- EX-200 [MED] Feature Device Create & Read API
- EX-199 [MED] Implémenter endpoint POST /tenant

EN REVIEW (2)
- EX-198 [MED] Implémenter POST /suspend — PR ouverte 1 jour
- EX-197 [MED] Implémenter POST /expire

BLOQUES (0)

Chaque ticket affiche :
- ID + priorité colorée (HIGH rouge, MED orange, LOW gris)
- Titre tronqué
- Badge si un agent est actif dessus
- Warning si aucune activité depuis X jours
- Clic sur le ticket ouvre le détail dans la vue Delivery

Ne PAS afficher : tickets Terminés, Backlog, sprints précédents.

---

## Zone 3 — Agent Orchestration (colonne droite)

Reprendre exactement le mock visible sur nakiros.com.

### Live Orchestration

Chaque agent affiché avec son statut :
- Active : fond teal #0D9E9E, texte blanc
- Idle : fond #1A1A1A, texte gris

Agents affichés : Dev Agent, PM Agent, SM Agent, QA Agent

### Execution Feed

10 dernières actions maximum, ordre chronologique inverse.

Format de chaque ligne : [Agent] · [Ticket ID] [Action] [timestamp relatif]

Exemples :
- PM Agent · EX-199 · Refining sprint scope · il y a 2 min
- Dev Agent · EX-203 · Pushing branch · il y a 5 min
- Dev Agent · EX-203 · Creating commit · il y a 6 min
- Dev Agent · EX-203 · Coding feature · il y a 12 min
- SM Agent · EX-118 · Posting team summary · il y a 1h

Clic sur une ligne ouvre le run dans ~/.nakiros/workspaces/{workspace_slug}/runs/

Mise à jour en temps réel : polling toutes les 5 secondes ou websocket si disponible.

---

## Zone 4 — Alertes Intelligentes

Visible uniquement si des alertes sont actives. Entièrement masquée si aucune alerte.

Types d'alertes et conditions de déclenchement :

| Alerte | Condition | Bouton d'action |
|---|---|---|
| Ticket sans commit | En cours depuis +3 jours sans commit | "Reprendre avec Dev Agent" |
| PR sans review | PR ouverte depuis +48h sans approbation | "Ouvrir la PR" |
| Contexte manquant | _nakiros/architecture.md absent dans un repo | "Générer le contexte" |
| Fin de sprint proche | Sprint termine dans 2 jours ET tickets En cours restants | "Voir le board" |
| Ticket bloqué | Statut Bloqué depuis +24h | "Voir le ticket" |

---

## Zone 5 — Daily Report

Visible uniquement si un daily existe pour la veille dans ~/.nakiros/workspaces/{workspace_slug}/reports/daily/

Titre : "Daily · [date d'hier]"

Afficher le contenu complet du daily rendu en markdown — pas un lien, le texte directement lisible.

Bouton discret en bas à droite : "Voir tous les dailies"

---

## Ce qu'il faut supprimer

- Métriques statiques : Tickets total, En cours, Bloqués, Terminés, Docs contexte, Sessions IA
- Les 3 boutons Next Actions statiques : Ouvrir Delivery, Ouvrir Chat IA, Aller au Product Context
- Section "IA activity" avec juste une date
- Section "Delivery snapshot" redondante avec le board

---

## Ce qu'il ne faut pas toucher

- Header de l'app : Chat IA, nb repos, Multi-repo, MCP status
- Sidebar de navigation : Overview, Product, Delivery
- Dark theme et couleurs teal
- Typographie monospace pour les titres

---

## Sources de données

Toutes locales — aucun appel IA nécessaire pour générer cette page.

| Donnée | Source |
|---|---|
| Tickets du sprint actif | ~/.nakiros/workspaces/{workspace_slug}/tickets/ |
| Statut des agents | MCP server localhost:3737 |
| Execution Feed | ~/.nakiros/workspaces/{workspace_slug}/runs/ |
| Daily d'hier | ~/.nakiros/workspaces/{workspace_slug}/reports/daily/ |
| Commits récents | git log sur les repos du workspace |
| PRs ouvertes | Jira API via MCP |

---

## Comportement au chargement

1. Page affichée immédiatement avec les données en cache local
2. Refresh silencieux depuis Jira via MCP en parallèle
3. Si le refresh apporte des changements, mise à jour de l'UI sans rechargement complet
4. Morning Briefing Banner généré après que les données soient disponibles (moins d'1 seconde)
5. Execution Feed mis à jour en temps réel toutes les 5 secondes