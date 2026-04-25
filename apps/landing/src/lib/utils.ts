import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Tailwind-aware className combinator.
 *
 * Runs `clsx` to flatten conditional class inputs, then `tailwind-merge` so
 * conflicting utility classes resolve to the last one (e.g. `px-2 px-4` →
 * `px-4`). Used by {@link InstallCommand}, {@link Button}, and any other
 * landing component that composes classes.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
