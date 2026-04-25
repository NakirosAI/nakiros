# views/

**Path:** `apps/frontend/src/views/`

Top-level view components mounted directly by `App.tsx` (boot/onboarding/scan/home, skill scope screens) or by `DashboardRouter` (project dashboard tabs). Each view owns its own data fetching against `window.nakiros.*` and delegates run UIs to overlay views (`AuditView`, `EvalRunsView`, `FixView`).

## Subfolders

- [skills/](./skills/README.md) — Shared building blocks for every scoped skills view.

## Files

- [AuditView.tsx](./AuditView.md) — Full-screen overlay rendering an in-flight or terminal audit run for a single skill.
- [BundledSkillConflictsView.tsx](./BundledSkillConflictsView.md) — Conflict resolution UI for bundled-skill upgrade collisions.
- [ConversationsView.tsx](./ConversationsView.md) — Dashboard tab listing every analyzed Claude Code JSONL conversation, ranked health-first.
- [Dashboard.tsx](./Dashboard.md) — Top-level dashboard shell with project tabs and sub-route sidebar.
- [EvalRunsView.tsx](./EvalRunsView.md) — Full-screen overlay for a batch of skill eval runs (with/without baseline + multi-model).
- [FixView.tsx](./FixView.md) — Full-screen overlay driving the fix-skill or create-skill agent on an isolated temp workdir.
- [GlobalSkillsView.tsx](./GlobalSkillsView.md) — Full-screen view for skills installed under `~/.claude/skills/` (Claude global scope).
- [Home.tsx](./Home.md) — Landing screen: header, recent-project list, navigation tabs.
- [NakirosSkillsView.tsx](./NakirosSkillsView.md) — Full-screen view for skills shipped bundled with the Nakiros package.
- [Onboarding.tsx](./Onboarding.md) — Four-step first-launch onboarding (welcome → editor detection → install hooks → done).
- [PluginSkillsView.tsx](./PluginSkillsView.md) — Full-screen view for skills installed by Claude Code plugins.
- [ProjectOverview.tsx](./ProjectOverview.md) — Dashboard "Overview" tab aggregating conversation analyses into health signals.
- [RecommendationsView.tsx](./RecommendationsView.md) — Placeholder dashboard tab for the upcoming Insights / proposal-engine surface.
- [ScanView.tsx](./ScanView.md) — Boot-time view scanning `~/.claude/projects/` with per-project progress.
- [SkillsView.tsx](./SkillsView.md) — Dashboard "Skills" tab for project-scoped skills (`.claude/skills/`).
