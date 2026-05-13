# recommendation-cluster.ts

**Path:** `apps/nakiros/src/services/recommendation-cluster.ts`

Friction-pattern clustering — daemon-side, pure functions, no LLM. Aggregates `ConversationFrictionZone` records from every conversation of a project and groups similar zones into `RecommendationPattern`s via Jaccard similarity on reaction tokens, with file-basename and signal-kind affinity bonuses. The output drives the recommendations screen's pattern list.

Union-Find is used for the grouping pass so that clusters are computed in O(n² α(n)) rather than iterating connected components explicitly. Clusters with fewer than two zones are dropped — a single friction zone does not constitute a pattern.

## Exports

### `ZoneWithRef`

```ts
export interface ZoneWithRef {
  ref: RecommendationZoneRef;
  zone: ConversationFrictionZone;
  tokens: Set<string>;
  fileBasenames: Set<string>;
  signalKinds: Set<string>;
}
```

Internal carrier used during the clustering pass. Bundles the zone's stable ref, its raw record, and the three pre-computed sets needed for scoring. Exported so that the handler layer can call `wrapZone` and `groupPatterns` separately.

---

### `extractZoneTokens`

```ts
export function extractZoneTokens(zone: ConversationFrictionZone): Set<string>
```

Build the per-zone token set used by the clustering pass. Combines the reaction message text (first 200 chars, via `tokenizeForCluster`), the `keyActions` join, and the basenames of files touched. Basenames are added as literal strings (no stop-word filtering) so that repeated file involvement increases cluster cohesion.

**Parameters:**
- `zone` — the friction zone record to tokenize

**Returns:** content-bearing token set for the zone

---

### `scoreZones`

```ts
export function scoreZones(a: ZoneWithRef, b: ZoneWithRef): number
```

Similarity score between two zones. Computes Jaccard on the token sets, then adds `+0.10` when any `filesTouched` basename overlaps (at most once) and `+0.05` when any `signalKind` overlaps (at most once). The bonuses mean two zones discussing the same file or triggered by the same signal kind are pulled together even when their text is dissimilar.

**Parameters:**
- `a` — first zone carrier
- `b` — second zone carrier

**Returns:** similarity score (Jaccard ∈ [0,1] + up to 0.15 bonus)

---

### `groupPatterns`

```ts
export function groupPatterns(projectId: string, items: ZoneWithRef[]): RecommendationPattern[]
```

Group zones into patterns via Union-Find on the score graph. Only zones with a non-empty token set are considered; synthetic interrupt zones are filtered out defensively (belt-and-braces for older cached entries). Two zones are joined when `scoreZones` exceeds `0.30`.

Returns one `RecommendationPattern` per connected component with `zoneCount >= 2`, sorted by severity desc then `zoneCount` desc, capped to 20 patterns.

**Parameters:**
- `projectId` — stable project identifier propagated to every pattern
- `items` — pre-wrapped zones (use `wrapZone` to produce them)

**Returns:** sorted and capped array of `RecommendationPattern`

---

### `wrapZone`

```ts
export function wrapZone(ref: RecommendationZoneRef, zone: ConversationFrictionZone): ZoneWithRef
```

Wraps a raw friction zone into the `ZoneWithRef` carrier by pre-computing the three sets needed for scoring. Use this before calling `groupPatterns`.

**Parameters:**
- `ref` — stable `{ convoId, zoneId }` reference for the zone
- `zone` — raw `ConversationFrictionZone` record from the cached analysis

**Returns:** `ZoneWithRef` ready for clustering
