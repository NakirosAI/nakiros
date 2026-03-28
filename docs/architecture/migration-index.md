# Sommaire Migration Agents & Workflows

> Index centré uniquement sur la migration des agents et workflows Nakiros.
> Il exclut volontairement les docs SaaS, orchestrateur, session management et autres sujets système trop larges.

---

## 1. Les docs cœur à lire en priorité

Si tu veux retrouver rapidement le socle de la migration agents/workflows, lis dans cet ordre :

1. [nakiros-agent-workflow-bundle-architecture.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-agent-workflow-bundle-architecture.md)
2. [nakiros-bmad-migration-map.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-bmad-migration-map.md)
3. [nakiros-v1-bundle-scope.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-v1-bundle-scope.md)

Ces 3 fichiers répondent à :
- qu’est-ce qu’on veut comme bundle cible,
- quoi reprendre depuis BMAD,
- et quel périmètre exact on a retenu pour la v1.

---

## 2. Docs de modèle agent / workflow

### Modèle conceptuel

- [agent-workflow-orchestration-model.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/agent-workflow-orchestration-model.md)
  Sépare agent, workflow, orchestrateur, action et artefact.

- [agent-runtime-decision-protocol.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/agent-runtime-decision-protocol.md)
  Définit les signaux runtime, leur rôle, et la différence entre mode portable et mode augmenté.

- [nakiros-action-registry.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-action-registry.md)
  Registre des `nakiros-actions` que les agents peuvent demander.

---

## 3. Docs sur les artefacts produits par les agents

- [nakiros-local-artifact-convention.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-local-artifact-convention.md)
  Convention `_nakiros/`, structure locale, artefacts repo-local et workspace-global.

- [storage-convention.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/storage-convention.md)
  À lire seulement si tu veux la convention de stockage autour des artefacts.

---

## 4. Docs de migration BMAD -> Nakiros

- [nakiros-bmad-migration-map.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-bmad-migration-map.md)
  Carte complète des agents/workflows BMAD repris, fusionnés, adaptés ou abandonnés.

- [nakiros-v1-bundle-scope.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-v1-bundle-scope.md)
  Liste cible v1 du bundle.

---

## 5. Docs sur les agents spécifiques Nakiros

- [nakiros-cto-agent-model.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-cto-agent-model.md)
  Rôle, périmètre et arbitrages du `CTO`.

- [nakiros-ceo-agent-model.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-ceo-agent-model.md)
  Rôle, périmètre et arbitrages du `CEO`.

Ces deux fichiers sont à part du noyau BMAD-backed :
- ils servent à la couche direction Nakiros,
- pas à la reprise du socle BMAD lui-même.

---

## 6. Ce que tu peux ignorer pour la migration agents

Pas nécessaire pour bosser sur les agents/workflows :

- `nakiros-system-decisions.md`
- `saas-architecture.md`
- `orchestrator-session-management.md`
- `orchestrator-cli-migration.md`
- `workspace-selected-architecture.md`

Ces docs sont utiles pour l’architecture globale du produit, mais pas pour la reprise directe du bundle agents.

---

## 7. Structure simple que je te recommande

Si on parle uniquement de la migration agents, garde mentalement ce rangement :

### A. Bundle cible

- [nakiros-agent-workflow-bundle-architecture.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-agent-workflow-bundle-architecture.md)
- [nakiros-v1-bundle-scope.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-v1-bundle-scope.md)

### B. Migration BMAD

- [nakiros-bmad-migration-map.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-bmad-migration-map.md)

### C. Contrats runtime

- [agent-workflow-orchestration-model.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/agent-workflow-orchestration-model.md)
- [agent-runtime-decision-protocol.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/agent-runtime-decision-protocol.md)
- [nakiros-action-registry.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-action-registry.md)

### D. Artefacts

- [nakiros-local-artifact-convention.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-local-artifact-convention.md)

### E. Agents de direction

- [nakiros-cto-agent-model.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-cto-agent-model.md)
- [nakiros-ceo-agent-model.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-ceo-agent-model.md)

---

## 8. Si tu veux aller vite

Lis seulement :

1. [nakiros-agent-workflow-bundle-architecture.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-agent-workflow-bundle-architecture.md)
2. [nakiros-bmad-migration-map.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-bmad-migration-map.md)
3. [nakiros-v1-bundle-scope.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-v1-bundle-scope.md)
4. [nakiros-local-artifact-convention.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/nakiros-local-artifact-convention.md)
5. [agent-runtime-decision-protocol.md](/Users/thomasailleaume/Perso/timetrackerAgent/docs/architecture/agent-runtime-decision-protocol.md)

Ça suffit pour retrouver l’essentiel de la migration agents/workflows sans te reperdre dans le reste.

