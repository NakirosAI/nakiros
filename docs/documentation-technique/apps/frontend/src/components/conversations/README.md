# conversations/

**Path:** `apps/frontend/src/components/conversations/`

Components powering the per-conversation diagnostic panel and the project-scoped Insights aggregation. Reached from `ConversationsView` (Conversations tab) and `ProjectOverview` (Insights tab).

## Files

- [ConversationDeepAnalysisSection.tsx](./ConversationDeepAnalysisSection.md) — Deep (LLM-powered) analysis section with eager cache check and one-click run.
- [ConversationDiagnosticPanel.tsx](./ConversationDiagnosticPanel.md) — Modal-style panel rendering the full diagnostic for a single conversation.
- [ConversationHealthBadges.tsx](./ConversationHealthBadges.md) — Badge row signalling why a conversation is flagged (compactions, friction, tool errors).
- [ConversationTimeline.tsx](./ConversationTimeline.md) — Visualization of context-size growth against "lost in the middle" danger zones.
- [ConversationsAggregation.ts](./ConversationsAggregation.md) — Pure-functional aggregation utilities for the Conversations Insights panel.
