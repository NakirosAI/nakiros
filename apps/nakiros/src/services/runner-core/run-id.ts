let counter = 0;

export function generateRunId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${(++counter).toString(36)}`;
}
