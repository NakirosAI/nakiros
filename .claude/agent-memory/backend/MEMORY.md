# Backend Agent Memory — Nakiros

## Patterns & gotchas

- [project_skill_symlink_override_2026_05_13.md](project_skill_symlink_override_2026_05_13.md) — Atomic `~/.claude/skills/<name>` symlink override for fix/edit-eval batches.
- [feedback_shared_dist_stale.md](feedback_shared_dist_stale.md) — Always `pnpm -F @nakiros/shared build` after shared type changes before `tsc --noEmit` elsewhere (stale dist/*.d.ts shadows source).
- [project_claudemd_scope_removed_2026_05_04.md](project_claudemd_scope_removed_2026_05_04.md) — `ClaudeMdScope` removed; only root CLAUDE.md supported.
- [project_dot_claude_snapshot_v1_2026_05_04.md](project_dot_claude_snapshot_v1_2026_05_04.md) — `DotClaudeSnapshot` v1 builder; wired in claudemd audit/fix `prepareWorkdir` only.
- [project_rules_expert_wired_2026_05_04.md](project_rules_expert_wired_2026_05_04.md) — `nakiros-rules-expert` wiring: types, 6 IPC channels, archive path convention.
- [project_subagents_expert_created_2026_05_04.md](project_subagents_expert_created_2026_05_04.md) — `nakiros-subagents-expert` skill: 15 checks, static-check script split.
- [project_subagents_expert_wired_2026_05_04.md](project_subagents_expert_wired_2026_05_04.md) — `nakiros-subagents-expert` wiring: types, 6 IPC channels, `RunSidePanel.tsx` dual `targetNoun` gotcha.
- [project_hooks_expert_created_2026_05_04.md](project_hooks_expert_created_2026_05_04.md) — `nakiros-hooks-expert` skill: singleton audit of the JSON `hooks` block.
- [project_hooks_expert_wired_2026_05_04.md](project_hooks_expert_wired_2026_05_04.md) — `nakiros-hooks-expert` wiring: `hooks-writer.ts` merge-save, 4 IPC channels, distinct from `claudeHooks:*`.
- [project_permissions_expert_created_2026_05_04.md](project_permissions_expert_created_2026_05_04.md) — `nakiros-permissions-expert` skill: 14 checks, valid_json + default_mode_not_bypass critical.
- [project_permissions_expert_wired_2026_05_04.md](project_permissions_expert_wired_2026_05_04.md) — `nakiros-permissions-expert` wiring: `PermissionsExpertScope` ≠ `PermissionsScope`, per-scope archive.
- [project_mcp_expert_created_2026_05_04.md](project_mcp_expert_created_2026_05_04.md) — `nakiros-mcp-expert` skill: target is root `.mcp.json`, not under `.claude/`.
- [project_mcp_expert_wired_2026_05_04.md](project_mcp_expert_wired_2026_05_04.md) — `nakiros-mcp-expert` wiring: `mcp-writer.ts` whole-file read/write, distinct from `claudeMcp:*`.
- [project_output_styles_expert_created_2026_05_04.md](project_output_styles_expert_created_2026_05_04.md) — `nakiros-output-styles-expert` skill: 12 checks, no `paths:` field.
- [project_output_styles_expert_wired_2026_05_04.md](project_output_styles_expert_wired_2026_05_04.md) — `nakiros-output-styles-expert` wiring: `OutputStylesExpertListResult` naming to avoid collision with Module 3 V2.
- [project_service_manager_2026_05_05.md](project_service_manager_2026_05_05.md) — `nakiros service install|start|stop|uninstall|status`; launchd/systemd; `uninstall` vs `stop` (KeepAlive) gotcha.
- [project_edit_mode_wired_2026_05_07.md](project_edit_mode_wired_2026_05_07.md) — `edit` run kind added to fix-runner as third mode; no dedicated IPC channels, reuses `fix:*`.
- [project_cowork_provider_wired_2026_05_07.md](project_cowork_provider_wired_2026_05_07.md) — Cowork provider: `ProviderType += 'cowork'`, `cowork-scanner.ts`.
- [project_apply_reco_noninteractive_2026_05_13.md](project_apply_reco_noninteractive_2026_05_13.md) — `<apply-recommendation>` block embedded in first prompt via `ApplyRecommendationContext`.
- [project_loop_detector_2026_05_24.md](project_loop_detector_2026_05_24.md) — Drift step 2: `loop-detector.ts`, window=12 turns, 4 signals.
- [project_topic_detector_2026_05_24.md](project_topic_detector_2026_05_24.md) — Drift step 3: `topic-detector.ts` reuses `cluster-tokens.ts` jaccard/tokenize.
- [project_context_detector_2026_05_24.md](project_context_detector_2026_05_24.md) — Drift step 4: `context-detector.ts`, only fires when topic detector didn't.
- [project_drift_integrated_in_analysis_2026_05_24.md](project_drift_integrated_in_analysis_2026_05_24.md) — DriftReport folded into ConversationAnalysis (step 5a).
- [project_drift_hook_installer_2026_05_24.md](project_drift_hook_installer_2026_05_24.md) — Drift hook installer: Stop+UserPromptSubmit pair, 4 IPC channels, 4 REST routes.
- [project_runner_worktree_2026_05_25.md](project_runner_worktree_2026_05_25.md) — Runner worktree support (fix+audit): `createRunWorktree`, `BaseRun.cwd?`, isolation confirmed.
- [project_bootstrap_step1_2026_07_11.md](project_bootstrap_step1_2026_07_11.md) — Bootstrap step 1: `ProjectBootstrapPlan`/`BootstrapRun` types + `bootstrap:*` channels. Package is `@nakirosai/nakiros`.
- [project_bootstrap_step2_2026_07_11.md](project_bootstrap_step2_2026_07_11.md) — Bootstrap step 2: `nakiros-project-bootstrap` skill; `target` convention per `artifactType` in plan-format.md.
- [project_bootstrap_step3_2026_07_11.md](project_bootstrap_step3_2026_07_11.md) — Bootstrap step 3: `bootstrap-runner.ts` + handlers; found (unfixed) audit-runner snapshot/worktree bug.
- [project_bootstrap_step5_2026_07_11.md](project_bootstrap_step5_2026_07_11.md) — Bootstrap step 5: `bootstrap-dispatch.ts` wires real writers; extracted `rules/subagents/output-styles-writer.ts`.
- [project_bootstrap_review_fixes_2026_07_11.md](project_bootstrap_review_fixes_2026_07_11.md) — Bootstrap review fixes B1-B9 (backup-before-overwrite, plan archive-on-stop, worktree sweep, approve dead-end, executing-zombie, shared timeline builder, lightweight list payload); B10 deferred.
