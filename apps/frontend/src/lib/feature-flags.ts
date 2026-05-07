/**
 * Feature flags read once from the URL on app boot.
 *
 * `?runs=ide` — enables the experimental 3-pane IDE layout for edit / fix /
 * create runs in place of the default `AuditLikeRunScreen`.  The flag is
 * intentionally not reactive: changing the URL param after boot has no effect
 * until the page is reloaded.  This keeps component trees stable and avoids
 * hook-count violations from conditional subscriptions.
 */
const _params = new URLSearchParams(window.location.search);

/**
 * When true, edit / fix / create runs render the IDE-style 3-pane layout
 * (`IdeRunScreen`) instead of the default single-pane `AuditLikeRunScreen`.
 * Audit and eval are unaffected regardless of this flag.
 *
 * Activate with `?runs=ide` in the URL.
 */
export const IDE_RUN_LAYOUT = _params.get('runs') === 'ide';
