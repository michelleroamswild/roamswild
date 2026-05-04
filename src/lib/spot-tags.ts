/**
 * Canonical spot tags.
 *
 * Fixed vocabulary that applies to any camping spot (dispersed,
 * established, informal). Renders as selectable chips on the spot detail
 * panel and as filter chips elsewhere. The list is intentionally short —
 * tags should be high-signal flags, not free-form notes.
 *
 * Source of truth — keep this file in sync with AMENITIES.md.
 *
 * Eventually a community contributor (and the saved-spot owner) can
 * apply / remove tags on a spot. For now this is the read-only canonical
 * vocab — the editing surface lands separately.
 */
export const CANONICAL_SPOT_TAGS = [
  '4wd Only',
  'Bumpy Road',
  'Great Starlink',
  'High Clearance',
  'Multiple Rigs',
  'Multiple spots in area',
  'Private',
  'Some Starlink',
  'Unknown status',
  'Water access',
] as const;

export type CanonicalSpotTag = typeof CANONICAL_SPOT_TAGS[number];

/** True when the given string matches one of the canonical tags exactly. */
export const isCanonicalTag = (s: string): s is CanonicalSpotTag =>
  (CANONICAL_SPOT_TAGS as readonly string[]).includes(s);

/**
 * Merge the canonical list with any user-supplied tag strings, preserving
 * canonical-list order first, then anything else alphabetically. Used by
 * the tag picker so canonical tags surface at the top regardless of what
 * the user has previously saved.
 */
export const mergedTagOptions = (existing: readonly string[] = []): string[] => {
  const canonical = [...CANONICAL_SPOT_TAGS];
  const extras = existing
    .filter((t) => !isCanonicalTag(t))
    .sort((a, b) => a.localeCompare(b));
  return [...canonical, ...extras];
};
