/** MIME-like classification helpers for skill asset files displayed in the UI. */

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif']);

/**
 * True when `path` ends with a known image extension (png/jpg/jpeg/gif/webp/
 * svg/ico/bmp/avif). Comparison is case-insensitive on the extension only.
 */
export function isImagePath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.has(ext);
}
