/**
 * Generate a URL-friendly slug from a string
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Generate a trip slug from trip name
 */
export function getTripSlug(tripName: string | undefined): string {
  if (!tripName) return 'untitled-trip';
  return slugify(tripName) || 'untitled-trip';
}

/**
 * Get the full trip URL path (just the slug, no ID)
 */
export function getTripUrl(tripName: string | undefined): string {
  const slug = getTripSlug(tripName);
  return `/trip/${slug}`;
}

/**
 * Get day URL path for a trip
 */
export function getDayUrl(tripName: string | undefined, dayNumber: number): string {
  const slug = getTripSlug(tripName);
  return `/trip/${slug}/day/${dayNumber}`;
}
