# Nakiros — Décisions Système

> Source de vérité pour les décisions structurantes.
> Dernière mise à jour : 2026-04-09

---

## 1. Vision

**Nakiros = layer de contexte partagé pour les organisations produit.**

Nakiros n'est pas un outil PM, pas un IDE, pas un outil de documentation. C'est la couche qui connecte tous ces outils via un contexte commun et des agents spécialisés par rôle.

**Layer B** — Nakiros se pose au-dessus de tous les providers IA (Claude, Codex, Gemini, Cursor). Il ne remplace pas ces outils, il les coordonne.

---

## 2. Surfaces

### Desktop App
Hub organisationnel pour **tous les rôles**. C'est la même app pour tout le monde — le rôle change le contenu, pas la navigation.

4 sections + Settings :
- **Home** — état du projet, activité, contributions, fraîcheur
- **Context** — arborescence documentaire, écriture selon scope, protection de fichiers, review
- **Chat IA** — conversations privées avec agents, diffs inline, @ # /
- **Agents** — éditeur visuel (workflow nodes/edges), MCPs, instructions
- **Settings** — profil, providers, workspace, admin (rôles/membres)

**Workspace switcher** : dropdown depuis le logo sidebar.

### VS Code Extension
Surface dédiée aux devs. Même contexte partagé, mêmes agents, dans l'éditeur.

### Web App (temps 2)
Back-office organisationnel : créer l'org, gérer les membres, configurer les rôles, gérer les abonnements.

---

## 3. Gouvernance

### Read : universel
Tout le monde lit tout le contexte. C'est une feature.

### Write : libre dans son scope
L'écriture est activée par rôle. Le scope réel se gère fichier par fichier et dossier par dossier dans Context — pas dans Settings.

### Pas de structure imposée
Nakiros ne force pas de structure de dossiers. Chaque workspace s'organise librement. Les exemples par défaut sont des suggestions.

### Protection de fichiers et dossiers
Par défaut, l'écriture est directe. L'admin ou le owner peut protéger un fichier/dossier en un clic dans la toolbar de Context :
- Fichier protégé → toute modification passe en review
- Un reviewer est assigné
- Le geste est contextuel (dans Context, pas dans Settings)
- Même logique que les branch protection rules GitHub

### Scope = agents aussi
**L'agent respecte le même scope que l'humain qui l'a lancé.** L'agent PM ne peut pas écrire dans architecture/ même si l'humain le lui demande. Les guardrails sont structurels, pas des instructions.

### Rôles
Rôles par défaut livrés avec Nakiros (tous modifiables, nouveaux créables). Un rôle définit :
- Quels agents sont disponibles
- Quels MCPs sont disponibles
- L'écriture est activée (scope géré dans Context)

### Contribution workflow
Quand un humain ou agent modifie hors scope ou sur un fichier protégé :
1. Modification crée une **contribution** (comme une PR)
2. Le fichier apparaît avec badge "À reviewer" dans Context
3. Le reviewer valide ou refuse directement dans Context
4. Les contributions vivent dans Context, pas dans Chat IA

---

## 4. Conversations

### Privées
Les conversations Chat IA sont privées. Personne ne voit les échanges avec ton agent.

### Outputs partagés
Quand tu valides un diff proposé par ton agent → ça s'écrit dans Context → visible par tous.

**Le lien entre les rôles c'est le Context, pas le Chat.**

---

## 5. Contexte partagé

### Injection
Injecté pré-session, pas de RAG. L'agent reçoit les sections pertinentes avant de démarrer.

### Chunking par rôle
Un dev qui implémente une feature charge la spec + les contraintes archi — pas tout le contexte. Signal/bruit ciblé.

---

## 6. MCP — 2 tools uniquement

```typescript
nakiros_api(intent: string)              // découverte
nakiros_execute(operationId, payload)    // exécution
```

Extensible sans nouveau tool : ajouter une opération = enregistrer un `operationId` côté serveur.

---

## 7. Human in the loop — toujours

L'IA fait le travail, l'humain valide. Nakiros couvre Discovery, Delivery et Support — l'agent analyse, rédige, propose, enrichit — mais rien ne s'écrit dans le contexte sans validation humaine.

- L'agent produit → l'humain valide (diff, contribution, action)
- Rien ne s'écrit automatiquement dans le contexte
- Pas d'agents qui tournent en arrière-plan
- L'agent fait 95% du travail. L'humain fait le dernier clic.

### Mode auto progressif (V1b)
L'automatisation se déverrouille action par action dans le workflow editor (switch "Diff + validation" / "Écrire directement" sur chaque nœud). Pas un mode global — chaque action est indépendante. L'équipe va à son rythme.

Ce qui différencie Nakiros des systèmes d'orchestration autonomes (Paperclip) : on démarre en validation, le full auto se mérite.

---

## 8. Onboarding

**Zéro config pour le nouveau membre.**

Admin configure les rôles et invite. Le membre installe, se connecte, arrive sur Home avec tout prêt.

---

## 9. Décisions rejetées

| Décision | Rejetée car |
|---|---|
| Nakiros = outil delivery uniquement | Trop limité, pas d'adoption cross-rôles |
| Cible solo dev / petite équipe | Pas assez de valeur sur le contexte partagé |
| Desktop = launcher d'agents seulement | Ne couvre pas les besoins des rôles non-devs |
| PRD comme document de référence | Le produit vit — un PRD figé est obsolète |
| RAG v1 | Over-engineering pour des contextes de 5-20KB |
| MCP complet (15+ tools) | Overhead tokens. Remplacé par nakiros_api + nakiros_execute |
| Scopes hardcodés dans Settings | Chaque workspace a sa propre structure de dossiers |
| Conversations partagées entre rôles | Bruit. Les conversations sont privées, les outputs sont partagés via Context |
| Validation systématique sur tous les fichiers | Contre-intuitif, tue l'adoption. Protection ciblée fichier par fichier |
| Navigation différente par rôle | Même app pour tous. Le contenu s'adapte, pas la navigation |
| Agents autonomes (style Paperclip) | L'humain garde le contrôle. L'IA propose, l'humain valide. Pas d'actions en arrière-plan. |
