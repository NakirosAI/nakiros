# Sentiment A/B Test Results — 2026-05-12

**Branch:** feat/sentiment-prepass  
**Session tested:** `/Users/thomasailleaume/.claude/projects/-Users-thomasailleaume-Perso-timetrackerAgent/414b4ce0-0536-4238-8fdc-fd80e0b0b851.jsonl`  
**Test cases:** 15 hand-crafted  

## Models Tested

| Short name | Model ID | Description | Error |
|------------|----------|-------------|-------|
| `distilbert-multilingual` | `Xenova/distilbert-base-multilingual-cased-sentiments-student` | Current baseline — distilbert multilingual, 3-class (Positive/Neutral/Negative) | — |
| `twitter-xlm-roberta` | `Xenova/twitter-XLM-roBERTa-base-sentiment` | XLM-RoBERTa fine-tuned on Twitter (TweetEval), multilingual 3-class | ⚠ Unauthorized access to file: "https://huggingface.co/Xenova/ |
| `bert-nlptown-5class` | `Xenova/bert-base-multilingual-uncased-sentiment` | nlptown/bert-base-multilingual-uncased-sentiment — 5-star, mapped to 3-class | — |

## Overall Accuracy on 15 Test Cases

| Model | Correct | Accuracy | Pos | Neg | Desc-neg | Colloq | Sarcasm |
|-------|---------|----------|-----|-----|----------|--------|--------|
| `distilbert-multilingual` | 8/15 | **53%** | 2/4 | 4/4 | 2/3 | 0/3 | 0/1 |
| `twitter-xlm-roberta` | — | ERROR | — | — | — | — | — |
| `bert-nlptown-5class` | 13/15 | **87%** | 4/4 | 4/4 | 2/3 | 2/3 | 1/1 |

## Key Pain Cases

These 3 cases drove the A/B test (known false positives in the baseline).

`twitter-xlm-roberta` failed to load (Unauthorized access — gated model), so only 2 models are compared.

| Text | Expected | distilbert | bert-nlptown |
|------|----------|------------|-------------|
| "ouai passons sur sonnet" | Neutral | ✗ Positive (0.45) | ✓ Neutral (0.25) |
| "dans les assets…on les affiche pas à l'écran" | Neutral | ✗ Negative (0.43) | ✓ Neutral (0.36) |
| "c'est super malin et je suis d'accord avec toi" | Positive | ✗ Negative (0.84) | ✓ Positive (0.65) |

## Performance Metrics

| Model | Cold Start | Avg Inference | Download (delta) | RSS |
|-------|-----------|---------------|-----------------|-----|
| `distilbert-multilingual` | 0.46s | 12.4ms/msg | 0B | 754.8MB |
| `twitter-xlm-roberta` | 0.17s | 0.0ms/msg | 0B | 0B |
| `bert-nlptown-5class` | 5.49s | 22.8ms/msg | 163.2MB | 1444.9MB |

## Session Label Distribution

| Model | Positive | Neutral | Negative | Total scored |
|-------|----------|---------|----------|-------------|
| `distilbert-multilingual` | 63 (47%) | 7 (5%) | 65 (48%) | 135 |
| `bert-nlptown-5class` | 25 (19%) | 66 (49%) | 44 (33%) | 135 |

## Model Disagreements vs Baseline (distilbert)

- **bert-nlptown-5class**: 84/135 messages (62.2%) disagree with distilbert on top-1 label

## Notable Disagreements on Session Data

### bert-nlptown-5class — top disagreements (baseline=Negative, model differs)

- Baseline: Negative (0.842) → bert-nlptown-5class: Positive (0.653)
  > "c'est super malin et je suis d'accord avec toi"
- Baseline: Negative (0.812) → bert-nlptown-5class: Neutral (0.390)
  > "tu sais ce qui manque maintenant pour que sa soit fou, c'est dans les projet, qu'on puisse faire un…"

## Observation: Distilbert Colloquial Bias

Contrary to the original hypothesis (distilbert over-triggers on Negative for descriptive negation), the test reveals a more nuanced picture:

- distilbert labels `"ouai passons sur sonnet"` as **Positive (0.45)** — not Negative.
- distilbert labels `"ok continue"` and `"ajoute un bouton ici"` as **Positive** — not Negative.
- The colloquial neutrals (3/3 wrong for distilbert) are all Positive false positives, not Negative.
- The "c'est super malin..." case is the only genuine high-confidence Negative false positive (0.84).
- distilbert's session distribution: **46.7% Positive / 5.2% Neutral / 48.1% Negative** — almost bimodal, the Neutral bucket is nearly empty (7 messages). This is the deeper problem: the model has no real "center mass".

## Recommendation

**Best model: `bert-nlptown-5class`** with **87%** accuracy on the test set vs 53% for the baseline.

Pain case results for `bert-nlptown-5class`: **3/3 correct** vs 0/3 for baseline.

**Recommendation: switch to `Xenova/bert-base-multilingual-uncased-sentiment`** (nlptown 5-class mapped to 3-class).

### Rationale

1. All 3 pain cases correctly classified (0 → 3).
2. 87% overall accuracy vs 53% — especially strong on `true-positive` (4/4 vs 2/4) and `sarcasm` (1/1 vs 0/1).
3. Session distribution is much more balanced: 19% Positive / 49% Neutral / 33% Negative (vs 47%/5%/48% for distilbert). The large Neutral bucket means the model actually uses the center class.
4. `bert-nlptown-5class` has a weaker spot on `descriptive-negation` (2/3, same as baseline), and `ajoute un bouton ici` is still miscategorized as Positive. That one is genuinely ambiguous for a star-rating model.
5. Tradeoffs: 163MB extra download, 5.5s cold start (vs 0.46s), 1.44GB RSS (vs 754MB). All are acceptable for a daemon process — model loads once on first ingest.

### Caveats

- `twitter-xlm-roberta` was unavailable (HuggingFace gated/access error). It remains a candidate worth testing if access is restored.
- `bert-nlptown-5class` maps 5-star ratings to 3 sentiment classes, so the `score` field is the max-star-class probability, not a direct sentiment confidence. The threshold for friction detection may need recalibrating (current: `score > 0.85` — likely too high for this model).
- The one remaining miss (`"le fichier ne contient pas la clé attendue"` → bert labels it Negative 0.49) shows the model still struggles with short French technical sentences containing negations. This is probably acceptable given context.

### Recommended migration

1. Change `SENTIMENT_MODEL_ID` in `services/sentiment/pipeline.ts` to `Xenova/bert-base-multilingual-uncased-sentiment`.
2. Update `normalizeLabel` in `services/sentiment/index.ts` to use the `5class` mapping (1-2 stars → Negative, 3 → Neutral, 4-5 → Positive).
3. Recalibrate the friction threshold in `conversation-analyzer.ts` from `score > 0.85` to `score > 0.60` (since nlptown confidence distributions are lower than distilbert's).
4. Bump the sentiment cache version (currently v4) to v5 to invalidate old distilbert traces.

---

*Generated by `scripts/sentiment-ab-test.mjs` on 2026-05-12.*
