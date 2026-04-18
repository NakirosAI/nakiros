# Evaluating Skill Output Quality

> Source: https://agentskills.io/skill-creation/evaluating-skills

## Core concept

Test each skill by running prompts WITH the skill and WITHOUT it (baseline). Compare results to measure actual skill value.

## Test case structure

Store in `evals/evals.json` inside the skill directory:

```json
{
  "skill_name": "exploitation-dev-backend",
  "evals": [
    {
      "id": 1,
      "prompt": "Realistic user message",
      "expected_output": "Human-readable description of success",
      "files": ["optional/input/files"],
      "assertions": [
        "Verifiable statement about what the output should contain",
        "Another verifiable statement"
      ]
    }
  ]
}
```

### Writing good test prompts
- Start with 2-3 test cases, expand later
- Vary phrasings, detail levels, formality
- Cover at least one edge case / boundary condition
- Use realistic context (file paths, column names, domain terms)

### Writing good assertions
Good:
- "The output file is valid JSON"
- "The route uses @hono/zod-openapi pattern, not plain app.get()"
- "Tests cover both happy path and error case"
- "No mock or stub of real infrastructure"

Weak:
- "The output is good"
- "The code follows best practices"

## Workspace structure

```
skill-directory/
├── SKILL.md
└── evals/
    ├── evals.json          # Test cases (authored by hand)
    └── files/              # Input files for tests

skill-workspace/
└── iteration-1/
    ├── eval-{test-name}/
    │   ├── with_skill/
    │   │   ├── outputs/       # Files produced
    │   │   ├── timing.json    # Tokens + duration
    │   │   └── grading.json   # Assertion results
    │   └── without_skill/
    │       ├── outputs/
    │       ├── timing.json
    │       └── grading.json
    └── benchmark.json         # Aggregated stats
```

## Grading

For each assertion, record PASS or FAIL with concrete evidence:

```json
{
  "assertion_results": [
    {
      "text": "The route uses @hono/zod-openapi pattern",
      "passed": true,
      "evidence": "Route defined with createRoute() from @hono/zod-openapi in routes.ts:15"
    },
    {
      "text": "Tests cover error cases",
      "passed": false,
      "evidence": "Only happy path tested. No test for invalid input or missing auth."
    }
  ],
  "summary": {
    "passed": 3,
    "failed": 1,
    "total": 4,
    "pass_rate": 0.75
  }
}
```

### Grading principles
- Require concrete evidence for PASS — no benefit of the doubt
- Review assertions themselves: too easy? too hard? unverifiable?

## Aggregation (benchmark.json)

```json
{
  "run_summary": {
    "with_skill": {
      "pass_rate": { "mean": 0.83 },
      "tokens": { "mean": 3800 }
    },
    "without_skill": {
      "pass_rate": { "mean": 0.33 },
      "tokens": { "mean": 2100 }
    },
    "delta": {
      "pass_rate": 0.50,
      "tokens": 1700
    }
  }
}
```

Delta = what the skill costs (tokens) vs what it buys (pass rate improvement).

## Pattern analysis

After computing benchmarks:
- **Remove assertions that always pass in both** → don't tell you anything
- **Investigate assertions that always fail in both** → assertion may be broken
- **Study assertions that pass WITH skill but fail WITHOUT** → where skill adds value
- **Tighten instructions when results are inconsistent** → add examples, reduce ambiguity
- **Check token outliers** → read execution transcript to find bottleneck

## Human review

After grading, review actual outputs alongside grades:
```json
{
  "eval-crud-endpoint": "Generated code uses plain app.get() instead of OpenAPI pattern despite instruction",
  "eval-auth-middleware": ""
}
```
Empty = passed human review. Specific feedback = actionable improvement.

## Iteration loop

1. Collect signals: failed assertions + human feedback + execution traces
2. Give all three + current SKILL.md to LLM → propose improvements
3. Apply changes
4. Rerun all test cases in new `iteration-N+1/` directory
5. Grade and aggregate
6. Human review
7. Repeat until satisfied

### Improvement guidelines
- **Generalize** — fix underlying issues, not narrow patches for specific tests
- **Keep lean** — fewer better instructions > exhaustive rules
- **Explain why** — "Do X because Y causes Z" > "ALWAYS do X"
- **Bundle scripts** — if agent reinvents same logic each run, write it once in scripts/
