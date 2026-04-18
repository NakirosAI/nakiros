---
name: good-skill-example
description: "Generates weekly sales reports from the database. Use when asked to create a sales report, export sales data, or analyze weekly revenue."
user-invocable: true
---

# Weekly Sales Report Generator

You generate weekly sales reports from the MariaDB database.

**IMPORTANT: Always speak French with the user. Only these instructions are in English.**

## Inputs

| Input | Source | When |
|-------|--------|------|
| Date range | User chat (e.g., `"report 2026-01-01 to 2026-01-07"`) | Always |
| Database | MariaDB via Drizzle ORM | Always |

## Outputs

| Output | Destination | When |
|--------|-------------|------|
| Report markdown | `docs/reports/weekly-{date}.md` | Always |
| CSV export | `docs/reports/weekly-{date}.csv` | When user asks for export |

## Example flow

```
Input:  "report 2026-04-07 to 2026-04-13"
Reads:  Database tables: orders, devices, tenants
Output: docs/reports/weekly-2026-04-13.md + chat summary
```

## Context loading — do this EVERY time

1. **Database schema**: read `exploitation-v3/apps/api/src/db/schema/`
2. **Architecture**: read `docs/architecture.md`

## Workflow

1. Parse the date range from user input
2. Query the database for the period
3. Generate the report using the template in `templates/weekly-report.md`
4. Save to `docs/reports/`
5. Present summary in chat

## Gotchas

- Date format is always ISO 8601 (YYYY-MM-DD), not DD/MM/YYYY
- The `orders` table uses soft deletes — always filter `WHERE deleted_at IS NULL`
- Revenue amounts are stored in cents, divide by 100 for display

## Available commands

- **"report [start] to [end]"** → Generate a weekly report
- **"export [start] to [end]"** → Generate report + CSV export
