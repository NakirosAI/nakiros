/**
 * Tronque un chemin de fichier long en ajoutant '…' au début.
 */
export function truncatePath(path: string, maxLen = 40): string {
  if (path.length <= maxLen) return path;
  return '…' + path.slice(-(maxLen - 1));
}
