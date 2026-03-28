# UI Layout Redesign — Implémentation

> Stack : **Lucide React** (icônes) · **shadcn/ui** (composants) · **Tailwind CSS** (styling)
> Référence visuelle : `docs/ux-ui/sidebar-redesign-proposal.html`

---

## Résumé des décisions

| Zone | Avant | Après |
|------|-------|-------|
| Topbar droite | MCP badge · account badge · feedback · ⚙ | `Feedback` · `⚙` uniquement |
| Sidebar bas | tab "Settings" (⚙ Settings2) | tab "Workspace" (📦 Package) |
| Bottom bar | inexistante | nouvelle — sync ambiant + connexion |
| Repo count / topology | topbar droite | bottom bar (faint, passif) |

---

## Tâches

### 1 — Topbar : simplification droite
**Fichier :** `apps/desktop/src/views/Dashboard.tsx`

- [ ] Supprimer le badge MCP (bouton + logique `serverStatus` dans le JSX uniquement — garder le prop pour la bottom bar)
- [ ] Supprimer le badge account (`dot + accountLabel + accountTitle`)
- [ ] Supprimer le texte `repoCount` et le badge topology
- [ ] Garder le bouton Feedback tel quel
- [ ] Garder le bouton Settings (⚙ `Settings2` de Lucide) tel quel — icône seule, sans label
- [ ] Nettoyer les variables devenues inutiles : `mcpModeLabel`, `accountLabel`, `accountTitle`, `isLocalServer`, `mcpUrl`, `workspaceTopology`

---

### 2 — Sidebar : renommage + nouvelle icône
**Fichier :** `apps/desktop/src/components/Sidebar.tsx`

- [ ] Remplacer l'icône `Settings2` du tab "settings" par `Package` (Lucide)
- [ ] Mettre à jour le label i18n : `settings` → `workspace` dans les clés de traduction

**Fichiers i18n :**
- [ ] `apps/desktop/src/i18n/locales/en/sidebar.json` — ajouter clé `workspace`, garder `settings` en transition si nécessaire
- [ ] `apps/desktop/src/i18n/locales/fr/sidebar.json` — idem

> Note : le `SidebarTab` type reste `'settings'` en interne pour ne pas casser le routing — seul le label et l'icône changent.

---

### 3 — Bottom bar : nouveau composant
**Nouveau fichier :** `apps/desktop/src/components/StatusBar.tsx`

#### Props interface
```ts
interface StatusBarProps {
  serverStatus: 'starting' | 'running' | 'stopped'
  workspaceSyncState: WorkspaceSyncState  // { syncing, lastSyncAt, error }
  authState: AuthState                    // { isAuthenticated }
  repoCount: number
  topology: 'mono' | 'multi'
}
```

#### États à implémenter (priorité décroissante)
- [ ] **Erreur sync** — `AlertCircle` Lucide, couleur `destructive`, texte "Sync error · click to retry", cliquable
- [ ] **Offline** — `WifiOff` Lucide, "Offline · changes queued locally"
- [ ] **Reconnexion** — `Cloud` + animation pulse, "Reconnecting…"
- [ ] **Syncing (upload)** — `RefreshCw` + `animate-spin`, "Syncing…"
- [ ] **Collègue sync** — `RefreshCw` pulse + `User` Lucide, "[Prénom] updated [fichier]" — disparaît après 5s
- [ ] **Idle / synced** — `Cloud` Lucide, "Connected · ✓ Synced"
- [ ] **Repo info** — extrême droite, faint : "3 repos · multi"

#### Composant structure (shadcn + Tailwind)
```tsx
// Layout : h-7, border-t, bg-[var(--bg-soft)]
// Sections séparées par un Separator vertical shadcn
// Icônes : toutes Lucide, taille 12px (w-3 h-3)
// Texte : text-[11px]
```

- [ ] Créer `StatusBar.tsx`
- [ ] Intégrer dans `Dashboard.tsx` (après `</div>` de `.flex-1.overflow-hidden`, avant fermeture du root)
- [ ] Passer les props depuis `Dashboard` (déjà disponibles : `serverStatus`, `workspaceSyncState`, `authState`, `workspace.repos.length`, `workspaceTopology`)

---

### 4 — Settings MCP : nettoyage
**Fichier :** `apps/desktop/src/components/settings/SettingsMCP.tsx`

- [ ] Évaluer si la section MCP dans Global Settings est encore pertinente
- [ ] Si supprimée : retirer de `GlobalSettingsSections.tsx` et du type `GlobalSettingsSection`

---

### 5 — Global Settings : section account
**Fichier :** `apps/desktop/src/components/GlobalSettings.tsx`

- [ ] Vérifier que le nom/email de l'utilisateur est bien visible en haut de la modal (remplacement du badge topbar)
- [ ] S'assurer que la section "General" est la section par défaut à l'ouverture

---

## Ordre d'implémentation suggéré

1. **Tâche 2** (Sidebar) — changement minimal, test rapide visuel
2. **Tâche 1** (Topbar simplification) — supprimer les éléments
3. **Tâche 3** (StatusBar) — nouveau composant, le plus gros du travail
4. **Tâche 5** (Global Settings account) — vérification/ajustement
5. **Tâche 4** (MCP cleanup) — nettoyage final

---

## Icônes Lucide utilisées

| Usage | Icône Lucide |
|-------|-------------|
| Global Settings (topbar) | `Settings2` |
| Workspace tab (sidebar) | `Package` |
| Connexion cloud | `Cloud` |
| Sync en cours | `RefreshCw` (+ `animate-spin`) |
| Synced | `Check` ou `CloudCheck` |
| Offline | `WifiOff` |
| Erreur | `AlertCircle` |
| Collègue | `User` |
| Reconnexion | `Cloud` (+ `animate-pulse`) |

## Composants shadcn utilisés

| Usage | Composant |
|-------|-----------|
| Séparateurs dans la bottom bar | `Separator` (orientation vertical) |
| Tooltip sur les icônes | `Tooltip` / `TooltipContent` |
| Bouton retry sync error | `Button` variant `ghost` size `sm` |
