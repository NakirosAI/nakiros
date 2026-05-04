---
name: Milkdown Crepe CSS — vendorisation complète requise
description: @milkdown/crepe ne déclare pas ses CSS dans exports — tout le CSS structural doit être vendorisé dans milkdown-crepe.css
type: feedback
---

`@milkdown/crepe` v7.20.0 n'exporte pas ses fichiers CSS dans `package.json#exports`. Vite (strict exports map) échoue sur tout chemin `@milkdown/crepe/lib/...`. `@milkdown/kit` n'est pas non plus installé en dépendance directe.

**Cause bug slash-menu dans le flux normal :** seules les variables de couleurs avaient été vendorisées — le CSS structural (`block-edit.css`, `reset.css`, etc.) était absent. Sans `position: absolute` sur `.milkdown-slash-menu`, le menu tombe dans le flux normal du document.

**Why:** `"sideEffects": false` + aucun export CSS. `@milkdown/kit` absent.

**How to apply :**
- Vendoriser le contenu COMPLET de tous les fichiers `@milkdown/crepe/lib/theme/common/*.css` dans `apps/frontend/src/styles/milkdown-crepe.css` (reset, block-edit, toolbar, link-tooltip, list-item, placeholder, top-bar, image-block, code-mirror, table, latex).
- Pour les dépendances transitives (prosemirror-view, prosemirror-gapcursor, prosemirror-tables, prosemirror-virtual-cursor, katex), utiliser des `@import` normaux depuis leurs spécificateurs de package — ces packages exportent bien leurs CSS dans leurs propres `package.json#exports`.
- Les overrides de variables Nakiros (`--crepe-color-*`) vont en dernier, scoped `.milkdown-crepe-wrap .milkdown`.
- Ne JAMAIS importer seulement les variables couleurs et croire que c'est suffisant.
