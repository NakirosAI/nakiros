---
name: IDE Run Screen feature flag layout
description: IdeRunScreen 3-panes (Chat/Code/Files) derrière ?runs=ide — fichiers créés, contraintes de dispatch et comportements clés
type: project
---

IdeRunScreen livré derrière `?runs=ide` (branche `feat/dotclaude-edit-mode`, non committé).

**Why:** UX edit/fix/create nécessite un visionneur de code side-by-side + citation de passage vers le chat.

**Fichiers créés :**
- `src/lib/feature-flags.ts` — `IDE_RUN_LAYOUT` constant (lecture une seule fois à boot)
- `src/lib/line-diff.ts` — helper LCS client-side (`computeLineDiff`) portant la logique de `fix-runner.ts:countLineDiff`
- `src/components/runs/ide/types.ts` — `QuoteSelection` interface
- `src/components/runs/ide/QuoteChip.tsx` — chip citation
- `src/components/runs/ide/IdeFileList.tsx` — liste fichiers du workdir avec indicateur +N/-M
- `src/components/runs/ide/IdeCodeViewer.tsx` — `<pre>` read-only, diff highlighting (added=vert/removed=rouge barré), sélection→quote flottant
- `src/components/runs/ide/IdeChatPanel.tsx` — RunStream + composeur n-* natif + chips
- `src/views/IdeRunScreen.tsx` — écran principal, grid `1fr 2fr 1fr`

**Dispatch dans RunScreen.tsx :**  
Quand `IDE_RUN_LAYOUT && runKind in ['edit','fix','create']` → `IdeRunScreen`.  
Audit reste toujours sur `AuditLikeRunScreen`.

**Contraintes respectées :**
- Zéro nouveau IPC — utilise listFixDiff/EditDiff/CreateDiff + readFixDiffFile/EditDiffFile/CreateDiffFile
- Pas de Monaco/CodeMirror/react-syntax-highlighter — `<pre>` stylé, syntax highlighting via `prism-react-renderer` (vsDark)
- Composeur reconstruit natif (n-* tokens) — pas `HumanInteractionPanel` (legacy CSS vars)
- Clés i18n `runs:ide.*` dans les 2 bundles (en+fr)

**Pattern quote → chat :**
Sélection native dans le `<pre>` → `selectionchange` → FloatingQuoteButton → `onQuote(QuoteSelection)`.  
Serialisation : blocs fencés `> Context: \`file\` lines N-M\n> \`\`\`\n> snippet\n> \`\`\`` + texte libre.

**Limitation LCS :** cap à 4M cellules (≈2k×2k lignes) — fallback remove-all/add-all pour les très gros fichiers.

**Syntax highlighting :** `prism-react-renderer` v2 (thème vsDark). Tokenisation du fichier entier via `Prism.tokenize()` dans deux `useMemo` séparés (original + modified). Helper interne `normalizeTokenLines()` convertit le résultat flat en `Token[][]` (une sous-liste par ligne). Pour les lignes `removed` → originalTokenLines[lineNo-1] ; pour `added`/`unchanged` → modifiedTokenLines[lineNo-1]. Fallback plain text si > 3000 lignes ou grammaire absente. Les couleurs diff (bg-emerald-500/10 / bg-red-500/10) restent sur le wrapper externe — les tokens Prism ne colorent qu'avec `style.color` inline, sans affecter le background.

**How to apply:** Toujours importer `IDE_RUN_LAYOUT` depuis `lib/feature-flags.ts` pour les gates ; ne pas re-lire URLSearchParams ailleurs.
