import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Number of archived audit reports in `<skillDir>/audits/`. An audit report is
 * a file named `audit-<timestamp>.md`. Returns `0` when the directory is
 * missing or unreadable.
 */
export function countAuditReports(skillDir: string): number {
  const auditsDir = join(skillDir, 'audits');
  if (!existsSync(auditsDir)) return 0;
  try {
    return readdirSync(auditsDir).filter((f) => f.startsWith('audit-') && f.endsWith('.md')).length;
  } catch {
    return 0;
  }
}
