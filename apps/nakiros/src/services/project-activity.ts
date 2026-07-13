import type { ProjectStatus } from '@nakiros/shared';

export const PROJECT_INACTIVITY_THRESHOLD_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Projects without a usable activity timestamp stay visible. This preserves
 * configuration-only projects while hiding session-backed projects that have
 * genuinely gone quiet.
 */
export function isProjectActivityInactive(
  lastActivityAt: string | null,
  now = Date.now(),
): boolean {
  if (!lastActivityAt) return false;
  const activityAt = Date.parse(lastActivityAt);
  if (!Number.isFinite(activityAt)) return false;
  return now - activityAt > PROJECT_INACTIVITY_THRESHOLD_DAYS * DAY_MS;
}

export function projectStatusFromActivity(
  lastActivityAt: string | null,
  now = Date.now(),
): Exclude<ProjectStatus, 'dismissed'> {
  return isProjectActivityInactive(lastActivityAt, now) ? 'inactive' : 'active';
}

/** Keep inactive records on disk, but omit them from normal project lists. */
export function isProjectVisible(
  project: { status: ProjectStatus; lastActivityAt: string | null },
  now = Date.now(),
): boolean {
  return (
    project.status !== 'dismissed' &&
    project.status !== 'inactive' &&
    !isProjectActivityInactive(project.lastActivityAt, now)
  );
}
