# classifier-parser

**Path:** `apps/nakiros/src/services/conversation-ingest/classifier-parser.ts`

Parser for the raw JSON output of the `nakiros-conversation-classifier` skill. Normalises snake_case keys to camelCase and strips incidental markdown code-fence wrapping that models sometimes add.

## Exports

### `ParsedClassifierOutput`

Public typed shape returned by `parseClassifierJson`.

```ts
export interface ParsedClassifierOutput {
  language: 'fr' | 'en';
  sessionSummary: string;
  phases: ConversationDigestPhase[];
  frictions: ConversationDigestFriction[];
  extractedRules: ConversationDigestRule[];
}
```

### `parseClassifierJson`

```ts
export function parseClassifierJson(raw: string): ParsedClassifierOutput
```

Parse the raw JSON string emitted by the `nakiros-conversation-classifier` skill and normalise its snake_case keys to the camelCase shape the rest of Nakiros uses. Defensive against incidental ` ```json … ``` ` wrapping that the model sometimes adds despite the prompt asking otherwise.

**Parameters:**
- `raw` — raw string output from the classify-convo runner's last assistant message

**Returns:** normalised `ParsedClassifierOutput` with camelCase fields

**Throws:** `Error` when the input is not valid JSON or required fields are missing
