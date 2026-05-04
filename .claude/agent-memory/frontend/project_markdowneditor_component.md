---
name: MarkdownEditor component location and API
description: Composant MarkdownEditor extrait de ClaudeMdScreen — WYSIWYG/Raw toggle interne, Milkdown Crepe, API contrôlée value/onChange
type: project
---

`MarkdownEditor` est dans `apps/frontend/src/components/markdown/MarkdownEditor.tsx`.

API publique :
```ts
interface MarkdownEditorProps {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  placeholder?: string;
}
```

Le toggle WYSIWYG/Raw est géré **en interne** (state local `useWysiwyg`). Le parent ne voit que du markdown brut.

Le CSS Milkdown Crepe (`styles/milkdown-crepe.css`) est importé **globalement** dans `main.tsx` — ne pas le réimporter dans le composant.

La logique Crepe est dans un sous-composant interne `CrepeEditor` (non exporté). Le destroy+re-create est le seul moyen de pousser une nouvelle valeur depuis l'extérieur (pas de setMarkdown API publique dans Crepe).

**Why:** extrait de ClaudeMdScreen le 2026-05-04 pour préparer RulesScreen qui aura le même besoin éditeur.
**How to apply:** utiliser `<MarkdownEditor value={md} onChange={setMd} />` dans tout onglet Edit d'un écran `.claude/` (RulesScreen, etc.).
