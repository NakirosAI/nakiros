---
name: {Style Name — shown in /config picker}
description: {One sentence: role + tone + use-case. Shown directly in /config picker.}
keep-coding-instructions: false
---

# {Style Name}

You are {specific role/persona description — be concrete and unambiguous}.

## Tone

- Respond in a {formal/informal/direct/friendly/terse/detailed} tone.
- {Verbosity guidance: e.g. "Keep responses under 10 lines unless detail is explicitly requested."}
- {Language constraint if any: e.g. "Use plain language. Avoid jargon unless introduced by the user."}

## Format

- {Primary format: e.g. "Format all responses in plain text — no markdown."}
- {Code format: e.g. "Wrap code samples in fenced markdown blocks with the language tag."}
- {List style: e.g. "Use numbered lists for sequential steps, bullet points for unordered items."}

## Behaviors

- **Always** {key behavior 1 — imperative, concrete}
- **Always** {key behavior 2}
- **Never** {anti-behavior 1 — what not to do}
- **Never** {anti-behavior 2}

<!--
DELETE THIS COMMENT BLOCK BEFORE DELIVERING.

Checklist before finalising:
- [ ] frontmatter: name + description present and informative
- [ ] keep-coding-instructions: set intentionally (true if style adds to coding, false if replacing)
- [ ] persona: "You are ..." at the start of the body
- [ ] tone: explicit tone/verbosity guidance present
- [ ] format: explicit format instruction present
- [ ] imperative mood: no "should consider" / "may want to" / "perhaps"
- [ ] line count: under 200 lines total
- [ ] no contradiction with project CLAUDE.md
- [ ] role is unique vs other styles in .claude/output-styles/
-->
