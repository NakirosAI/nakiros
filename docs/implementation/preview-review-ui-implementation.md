# Preview Review UI — Plan d'implémentation

**Statut global :** ✅ Terminé — 7/7 tâches implémentées
**Référence design :** `docs/ux-ui/preview-review-redesign-proposal.html`
**Branch :** `feature/new_archi`

---

## Contexte

Refonte du mode "Preview Review" dans `ChatView`. Aujourd'hui le panneau chat devient
illisible quand une preview est active (texte qui s'empile lettre par lettre). Le nouveau
design introduit :

- Des **tabs de conversation** toujours visibles dans le panneau chat
- Un **mode preview lié à la conversation active** (arborescence + viewer)
- La **disparition automatique** du mode preview quand on change de conversation
- Un **panneau chat compact** en mode preview (résumé + input) sans perdre l'accès aux autres chats

---

## Règles UX validées

- La preview est liée à **une conversation**, pas au workspace
- Switcher de conversation → preview masquée (les fichiers restent sur disque)
- Revenir sur la conversation d'origine → preview réapparaît
- Sans preview active → arborescence et viewer **ne sont pas rendus**
- La sidebar de navigation principale reste toujours visible

---

## Tâches

### 1. Remonter l'ID de conversation active depuis AgentPanel ✅

**Fichier :** `apps/desktop/src/components/AgentPanel.tsx`

- [x] Ajouter prop `onActiveConversationChange?: (nakirosConversationId: string | null) => void`
- [x] `useEffect` sur `[activeTabId, tabs]` → appelle le callback avec `activeTab.nakirosConversationId`

---

### 2. Filtrage preview par conversation active dans ChatView ✅

**Fichier :** `apps/desktop/src/views/ChatView.tsx`

- [x] Ajouter state `activeConversationId: string | null`
- [x] Passer `onActiveConversationChange` à `AgentPanel` via `useCallback`
- [x] `previewVisible = pendingPreview !== null && activeConversationId !== null && pendingPreview.conversationId === activeConversationId`
- [x] `activeConversationId` ajouté dans les deps du `useEffect` previewCheck → re-check automatique au changement de tab
- [x] Layout `flex-row` / `flex-col` conditionné sur `previewVisible`

---

### 3. Dot "has-preview" sur les tabs de conversation ✅

**Fichier :** `apps/desktop/src/components/AgentPanel.tsx`

- [x] Prop `previewConversationId?: string | null` ajoutée
- [x] `TAB_PREVIEW_DOT_CLASS` — dot vert sur la tab dont `nakirosConversationId === previewConversationId`
- [x] Priorité : ne s'affiche que si aucun dot running/unread/completion n'est déjà présent

---

### 4. Largeur fixe du panneau chat en mode preview ✅

**Fichier :** `apps/desktop/src/views/ChatView.tsx`

- [x] `w-[260px]` quand `previewVisible`, `flex-1` sinon

---

### 5. Banner de lien preview ↔ conversation ✅

**Fichier :** `apps/desktop/src/components/AgentPanel.tsx`

- [x] Banner vert inliné sous les tabs, conditionnel sur `previewConversationId && activeTab.nakirosConversationId === previewConversationId`
- [x] Texte : "Preview générée par cette conversation" + icône 🔗

---

### 6. Pastille sidebar "preview en attente" ✅

**Fichiers :** `Sidebar.tsx` · `ChatView.tsx` · `DashboardRouter.tsx` · `Dashboard.tsx`

- [x] `Sidebar` : prop `chatHasPendingPreview` → dot vert sur l'icône Chat IA (distinct du dot teal completion)
- [x] `ChatView` : callback `onPendingPreviewChange(workspaceId, hasPendingPreview)` appelé via `useEffect` sur `pendingPreview`
- [x] `DashboardRouter` : prop `onChatPendingPreviewChange` passée à `ChatView`
- [x] `Dashboard` : state `chatPendingPreviews` + `handleChatPendingPreviewChange` + `activeWorkspaceHasPendingPreview` → `Sidebar`

---

## Ordre d'implémentation recommandé

```
1 → Tâche 1   (remonter activeConversationId)
2 → Tâche 2   (filtrage preview par conversation)
3 → Tâche 4   (layout compact en mode preview)
4 → Tâche 5   (banner de lien)
5 → Tâche 3   (états visuels des tabs)
6 → Tâche 6   (pastille sidebar)
```

Les tâches 1 et 2 sont bloquantes pour tout le reste.

---

## Fichiers impactés

| Fichier | Type de changement |
|---|---|
| `apps/desktop/src/views/ChatView.tsx` | Majeur — layout + logique preview |
| `apps/desktop/src/components/AgentPanel.tsx` | Moyen — nouveau callback + état conversation |
| `apps/desktop/src/components/Sidebar.tsx` | Mineur — pastille notification |
| `apps/desktop/src/components/PreviewReviewPanel.tsx` | Aucun — déjà implémenté |
| `apps/desktop/electron/services/preview-service.ts` | Aucun — déjà correct |

---

### 7. Mode compact d'AgentPanel en mode preview ✅

**Fichiers :** `apps/desktop/src/components/AgentPanel.tsx` · `apps/desktop/src/views/ChatView.tsx`

- [x] Prop `compactMode?: boolean` ajoutée à `AgentPanel`
- [x] `compactMode={previewVisible}` passé depuis `ChatView`
- [x] Quand `compactMode = true` :
  - Panneau historique gauche masqué
  - Header masqué
  - Messages + feedback + input bar remplacés par : résumé compact (dernier message IA) + textarea simple
- [x] Quand `compactMode = false` : rendu normal inchangé

---

## Hors scope

- Resize manuel des panneaux (drag)
- Diff view (avant/après) dans le viewer
- Approbation fichier par fichier
