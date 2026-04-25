import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Tailwind-aware classname helper: combines `clsx` (conditional, array, object
 * inputs) with `tailwind-merge` (last-write-wins on conflicting Tailwind
 * utilities, e.g. `p-2 p-4` → `p-4`).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
