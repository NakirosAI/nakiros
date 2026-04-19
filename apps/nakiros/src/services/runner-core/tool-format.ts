/**
 * Format a claude CLI tool invocation into a short human-readable label.
 * Shared across all runners so streams look identical regardless of domain.
 */
export function formatTool(name: string, input: Record<string, unknown>): string {
  const s = (v: unknown) => String(v ?? '');
  switch (name) {
    case 'Read': return `Reading ${s(input['file_path'])}`;
    case 'Write': return `Writing ${s(input['file_path'])}`;
    case 'Edit':
    case 'MultiEdit': return `Editing ${s(input['file_path'])}`;
    case 'Bash': return `$ ${s(input['command'])}`;
    case 'Glob': return `Glob: ${s(input['pattern'])}`;
    case 'Grep': return `Grep: ${s(input['pattern'])}`;
    default: return name;
  }
}
