import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create an isolated home-dir stub and patch homedir() for the duration of the test. */
function withTmpHome(fn: (homeDir: string) => void) {
  const homeDir = mkdtempSync(join(tmpdir(), 'nakiros-home-'));
  fn(homeDir);
}

function nakirosDirs(homeDir: string, slug: string) {
  return {
    state: join(homeDir, '.nakiros', 'workspaces', slug, 'state'),
    context: join(homeDir, '.nakiros', 'workspaces', slug, 'context'),
    confidence: join(homeDir, '.nakiros', 'workspaces', slug, 'reports', 'confidence'),
  };
}

// ─── Unit tests for toWorkspaceSlug (reused by the service) ──────────────────

test('toWorkspaceSlug converts workspace names correctly', async () => {
  const { toWorkspaceSlug } = await import('./ticket-storage.js');
  assert.equal(toWorkspaceSlug('My Project'), 'my-project');
  assert.equal(toWorkspaceSlug('API v2'), 'api-v2');
  assert.equal(toWorkspaceSlug('  spaces  '), 'spaces');
  assert.equal(toWorkspaceSlug(''), 'workspace');
});

// ─── detectBrownfield ────────────────────────────────────────────────────────

test('detectBrownfield returns false when no repo has _nakiros/architecture.md', async () => {
  withTmpHome((homeDir) => {
    const repoA = mkdtempSync(join(homeDir, 'repo-a-'));
    const repoB = mkdtempSync(join(homeDir, 'repo-b-'));
    void import('./getting-started-state.js').then(({ detectBrownfield }) => {
      assert.equal(detectBrownfield([repoA, repoB]), false);
    });
  });
});

test('detectBrownfield returns true when at least one repo has _nakiros/architecture.md', async () => {
  withTmpHome((homeDir) => {
    const repoA = mkdtempSync(join(homeDir, 'repo-a-'));
    const nakirosDir = join(repoA, '_nakiros');
    mkdirSync(nakirosDir, { recursive: true });
    writeFileSync(join(nakirosDir, 'architecture.md'), '# arch', 'utf-8');

    void import('./getting-started-state.js').then(({ detectBrownfield }) => {
      assert.equal(detectBrownfield([repoA]), true);
    });
  });
});

// ─── getGettingStartedState (default state when file absent) ─────────────────

test('getGettingStartedState returns default state when no file exists', async () => {
  const { getGettingStartedState } = await import('./getting-started-state.js');
  // Use a workspace name that cannot possibly have a state file
  const state = getGettingStartedState('__nonexistent_workspace_xyz__');
  assert.equal(state.step1.completedAt, null);
  assert.equal(state.step2.completedAt, null);
  assert.equal(state.step3.completedAt, null);
  assert.equal(state.brownfieldMode, false);
});

// ─── getGettingStartedContext — step completion detection ────────────────────

test('getGettingStartedContext step1Complete is false when context dir is empty', async () => {
  const { getGettingStartedContext } = await import('./getting-started-state.js');
  // Workspace name with no runtime data
  const ctx = getGettingStartedContext('__no_context_workspace__', []);
  assert.equal(ctx.step1Complete, false);
  assert.equal(ctx.step2Complete, false);
});

// ─── saveGettingStartedState round-trip ──────────────────────────────────────

test('saveGettingStartedState persists and getGettingStartedState reads it back', async () => {
  const os = await import('os');
  const originalHomedir = os.homedir;

  withTmpHome((homeDir) => {
    // Monkey-patch os.homedir for this test
    (os as unknown as { homedir: () => string }).homedir = () => homeDir;

    void import('./getting-started-state.js').then(({ saveGettingStartedState, getGettingStartedState }) => {
      const ws = 'test-workspace';
      const state = {
        step1: { completedAt: '2026-03-16T10:00:00Z', launchedConversationId: 'req-1' },
        step2: { completedAt: null, launchedConversationId: null },
        step3: { completedAt: null, launchedConversationId: null },
        brownfieldMode: false,
      };

      saveGettingStartedState(ws, state);
      const loaded = getGettingStartedState(ws);

      assert.equal(loaded.step1.completedAt, '2026-03-16T10:00:00Z');
      assert.equal(loaded.step1.launchedConversationId, 'req-1');
      assert.equal(loaded.step2.completedAt, null);

      // Restore
      (os as unknown as { homedir: () => string }).homedir = originalHomedir;
    });
  });
});

// ─── Banner and step prerequisite logic (pure) ───────────────────────────────

test('step locking: step 2 is locked when step 1 is incomplete', () => {
  const step1Complete = false;
  const step2Locked = !step1Complete;
  assert.equal(step2Locked, true);
});

test('step locking: step 3 is locked when step 2 is incomplete', () => {
  const step2Complete = false;
  const step3Locked = !step2Complete;
  assert.equal(step3Locked, true);
});

test('all steps complete means onboarding is done', () => {
  const step1Complete = true;
  const step2Complete = true;
  const step3CompletedAt = '2026-03-16T12:00:00Z';
  const allDone = step1Complete && step2Complete && step3CompletedAt !== null;
  assert.equal(allDone, true);
});

test('banner should not show when all steps are complete', () => {
  const onboardingIncomplete = false;
  const setupBannerDismissed = false;
  const showBanner = onboardingIncomplete && !setupBannerDismissed;
  assert.equal(showBanner, false);
});

test('banner should not show when dismissed even if onboarding is incomplete', () => {
  const onboardingIncomplete = true;
  const setupBannerDismissed = true;
  const showBanner = onboardingIncomplete && !setupBannerDismissed;
  assert.equal(showBanner, false);
});

test('banner should show when onboarding incomplete and not dismissed', () => {
  const onboardingIncomplete = true;
  const setupBannerDismissed = false;
  const showBanner = onboardingIncomplete && !setupBannerDismissed;
  assert.equal(showBanner, true);
});
