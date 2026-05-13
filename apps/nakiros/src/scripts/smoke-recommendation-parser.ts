/**
 * Smoke for `recommendation-card-parser.ts`. Run with:
 *   pnpm -F @nakirosai/nakiros exec tsx src/scripts/smoke-recommendation-parser.ts
 */
import { parseRecoCardFromMarkdown } from '../services/recommendation-card-parser.js';
import type { ProjectInventory } from '../services/recommendation-inventory.js';

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) { console.error('FAIL:', message); process.exit(1); }
  console.log('OK:', message);
}

const inventory: ProjectInventory = {
  projectId: 'p1',
  projectPath: '/tmp',
  generatedAt: '2026-05-13T00:00:00.000Z',
  items: [
    { id: 'i18n', type: 'rules', label: 'i18n.md' },
  ],
};

const validFix = `---
recId: fix-i18n-rule
patternId: P1
action: fix
artifactType: rules
target: i18n
title: Tighten the i18n rule glob
evidence:
  zoneRefs: [{convoId: c1, zoneId: z1}]
  files: [src/i18n.ts]
---

# Tighten the i18n rule glob

## Why
Several conversations got stuck on the i18n key flow because the existing rule did not auto-attach on the right files.

## Brief
Adjust the \`paths:\` glob in .claude/rules/i18n.md so it covers \`apps/frontend/src/**/*.tsx\` plus the i18n bundles. Include this user request verbatim when invoking the rules expert: edit the rule to ...

## Acceptance criteria
- The glob covers tsx files
- Description mentions which files
`;

const r1 = parseRecoCardFromMarkdown(validFix, 'P1', inventory);
assert(r1.ok, 'valid fix card parses');
if (r1.ok) {
  assert(r1.card.action === 'fix', 'action preserved');
  assert(r1.card.artifactType === 'rules', 'artifactType preserved');
  assert(r1.card.target === 'i18n', 'target preserved');
  assert(r1.card.brief.includes('paths'), 'brief extracted from ## Brief');
  assert(!r1.downgraded, 'not downgraded');
}

// Missing frontmatter
const r2 = parseRecoCardFromMarkdown('# no fm\n', 'P1');
assert(!r2.ok, 'missing frontmatter rejected');

// Invalid action
const r3 = parseRecoCardFromMarkdown(
  validFix.replace('action: fix', 'action: edit'),
  'P1',
  inventory,
);
assert(!r3.ok, 'invalid action rejected');

// Invalid artifactType
const r4 = parseRecoCardFromMarkdown(
  validFix.replace('artifactType: rules', 'artifactType: nonsense'),
  'P1',
  inventory,
);
assert(!r4.ok, 'invalid artifactType rejected');

// Empty brief (< 20 chars)
const r5 = parseRecoCardFromMarkdown(
  validFix.replace(/## Brief\n[\s\S]*?(?=\n##)/, '## Brief\nshort\n'),
  'P1',
  inventory,
);
assert(!r5.ok, 'too-short brief rejected');

// Fix → Create downgrade when target not in inventory
const r6 = parseRecoCardFromMarkdown(
  validFix.replace('target: i18n', 'target: nonexistent-rule'),
  'P1',
  inventory,
);
assert(r6.ok, 'unknown target still produces a card');
if (r6.ok) {
  assert(r6.card.action === 'create', 'downgraded to create');
  assert(r6.card.target === 'new', 'target reset to "new"');
  assert(r6.downgraded === true, 'downgraded flag set');
}

// patternId mismatch
const r7 = parseRecoCardFromMarkdown(validFix, 'DIFFERENT', inventory);
assert(!r7.ok, 'patternId mismatch rejected');

console.log('\nAll parser smoke assertions passed.');
