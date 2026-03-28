# Workflow Output Conventions

## Purpose

Defines the two mandatory markdown patterns that all Nakiros workflow instructions must emit:

1. **Step progress marker** — signals which step is active so the desktop UI can track progress
2. **Choices block** — signals available options so the desktop UI can render clickable buttons

Both patterns are **plain markdown**. They render correctly in Claude CLI and are parsed by the Nakiros desktop.

---

## Pattern 1 — Step Progress Marker

Every `<output>` tag that completes a step MUST include the step index and total.

### Format

```
[WORKFLOW] Étape N/T — <goal> ✓
```

| Token | Description |
|-------|-------------|
| `N` | Current step number (integer) |
| `T` | Total number of steps in the workflow (integer) |
| `<goal>` | Short label matching the step `goal` attribute in the XML |

### Example

```
[WORKFLOW] Étape 2/5 — Analyse des contraintes ✓
```

### Rules

- Use `Étape` (French) or `Step` (English) based on `communication_language`.
- Always include `/T` — the total is required for the progress bar.
- Place this line as the **first line** of the `<output>` block.
- The `✓` is only added on completion, not on intermediate outputs within a step.

### In XML instructions

```xml
<output>[WORKFLOW] Étape 2/5 — Analyse des contraintes ✓</output>
```

---

## Pattern 2 — Choices Block

Every `<ask>` tag that presents options to the user MUST end with a choices block.

### Format

```markdown
---

**<question>**

1. <label for option A>
2. <label for option B>
3. <label for option C>
```

| Token | Description |
|-------|-------------|
| `---` | Horizontal rule — hard separator, required |
| `**<question>**` | The question in bold, one line |
| `1. 2. 3.` | Numbered list, 2 to 6 items max |

### Example

```markdown
---

**Que souhaitez-vous faire maintenant ?**

1. Lancer le brainstorming — contexte produit pré-chargé
2. C'est suffisant pour l'instant — le contexte est sauvegardé
```

### Rules

- Always use a **numbered list**, never bullets (`-`) or inline `(option)` shortcodes.
- Limit to **2–6 options**. If more are needed, group them.
- The `---` separator is mandatory — it's the parsing anchor.
- The question MUST be on a single bold line directly after the separator.
- Labels should be self-contained: the user reads only the label, not the surrounding prose.
- Place the choices block as the **last content block** of the `<ask>` tag.

### In XML instructions

```xml
<ask>J'ai analysé les 3 repos du workspace. Voici ce que j'ai trouvé : [...]

---

**Que souhaitez-vous faire ?**

1. Lancer le brainstorming — contexte produit pré-chargé
2. C'est suffisant pour l'instant — le contexte est sauvegardé</ask>
```

---

## Desktop Parsing Behavior

The desktop UI parses these two patterns from streaming messages:

| Pattern | Parsing Rule | UI Behavior |
|---------|-------------|-------------|
| `[WORKFLOW] Étape N/T — ...` | Regex: `/\[WORKFLOW\] (?:Étape\|Step) (\d+)\/(\d+) — (.+)/` | Updates step progress sidebar |
| `---\n\n**...**\n\n1. ...\n2. ...` | Detects `---` + bold line + ordered list as last block | Renders as clickable buttons; hidden from chat text |

Clicking a choice button automatically submits that option as the user's reply.

---

## Migration Checklist

All existing workflow instructions must be updated to comply. Track per workflow:

| Workflow | Step markers | Choices blocks |
|----------|-------------|----------------|
| `1-discovery/brainstorming` | ✅ | ✅ |
| `1-discovery/product-discovery` | ✅ | ✅ |
| `1-discovery/generate-context` | ✅ | ✅ |
| `1-discovery/document-project` | — | — |
| `1-discovery/project-understanding-confidence` | ✅ | ✅ |
| `2-pm/create-prd` | — | — |
| `2-pm/edit-prd` | — | — |
| `2-pm/validate-prd` | — | — |
| `2-pm/plan-feature` | ✅ | ✅ |
| `2-pm/pm-feature` | ✅ | ✅ |
| `2-pm/create-story` | ✅ | ✅ |
| `2-pm/create-ticket` | ✅ | ✅ |
| `2-design/create-architecture` | — | — |
| `2-design/create-ux-design` | — | — |
| `2-design/check-implementation-readiness` | — | — |
| `3-implementation/dev-story` | ✅ | ✅ |
| `4-quality/qa-review` | ✅ | n/a |
| `5-reporting/daily` | ✅ | n/a |
| `5-reporting/sprint` | ✅ | ✅ |
