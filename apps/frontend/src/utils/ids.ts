/**
 * Génère un identifiant unique court (8 caractères hex).
 * Utilise crypto.randomUUID() pour une entropie correcte.
 */
export function uid(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}
