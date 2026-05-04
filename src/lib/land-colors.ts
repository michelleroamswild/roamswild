/**
 * Single source of truth for public-land overlay polygon colors.
 * Mirrors the `--land-*-fill / --land-*-stroke` HSL tokens in
 * src/index.css so the JS-rendered Google Maps polygons match the
 * legend swatches and the rest of the design system.
 *
 * If you change a value here, change the matching token in index.css
 * (and the dark-mode variant) so they stay in lockstep.
 */

export type LandBucket =
  | 'BLM'
  | 'USFS'
  | 'NPS'
  | 'STATE_PARK'
  | 'STATE_TRUST'
  | 'LAND_TRUST'
  | 'TRIBAL';

export interface LandColorPair {
  fill: string;
  stroke: string;
}

// HSL strings (light-mode). Google Maps `<Polygon>` accepts any valid
// CSS color string, so hsl(...) works here without a getComputedStyle
// dance. Format is `hsl(<h> <s>% <l>%)` per CSS Color Level 4.
export const LAND_OVERLAY_COLORS: Record<LandBucket, LandColorPair> = {
  BLM:         { fill: 'hsl(36 55% 52%)',  stroke: 'hsl(36 60% 36%)' },
  USFS:        { fill: 'hsl(140 32% 42%)', stroke: 'hsl(140 38% 28%)' },
  NPS:         { fill: 'hsl(268 28% 52%)', stroke: 'hsl(268 32% 36%)' },
  STATE_PARK:  { fill: 'hsl(206 42% 50%)', stroke: 'hsl(206 48% 34%)' },
  STATE_TRUST: { fill: 'hsl(186 36% 48%)', stroke: 'hsl(186 42% 32%)' },
  LAND_TRUST:  { fill: 'hsl(338 38% 58%)', stroke: 'hsl(338 42% 40%)' },
  TRIBAL:      { fill: 'hsl(5 50% 42%)',   stroke: 'hsl(5 58% 28%)' },
};

// Default for unknown / fallback agencies. Pulled from the Pine + Paper
// palette's neutral pine-3 so it doesn't fight the rest of the map.
export const DEFAULT_LAND_OVERLAY_COLOR: LandColorPair = {
  fill: 'hsl(80 10% 50%)',
  stroke: 'hsl(80 14% 32%)',
};

// PAD-US managing-agency code → bucket. Mirrors the bucketing in
// DispersedMap.tsx so the explorer legend toggles map cleanly to the
// admin-side polygon coloring.
const STATE_TRUST_AGENCIES = new Set([
  'SDOL', 'SFW', 'SPR', 'SDNR', 'SLB', 'SLO', 'SDC', 'SDF', 'OTHS',
]);

export function bucketForAgency(agency: string | null | undefined): LandBucket {
  if (!agency) return 'BLM'; // unknown → most common bucket; callers can override
  if (agency === 'BLM')    return 'BLM';
  if (agency === 'NPS')    return 'NPS';
  if (agency === 'STATE')  return 'STATE_PARK';
  if (agency === 'TRIB')   return 'TRIBAL';
  if (agency === 'NGO')    return 'LAND_TRUST';
  if (STATE_TRUST_AGENCIES.has(agency)) return 'STATE_TRUST';
  // FS / USFS and anything else (FWS, DOD, BOR, …) fall through to USFS
  // green by default. Add explicit cases as needed.
  return 'USFS';
}

export function colorsForAgency(agency: string | null | undefined): LandColorPair {
  return LAND_OVERLAY_COLORS[bucketForAgency(agency)] ?? DEFAULT_LAND_OVERLAY_COLOR;
}
