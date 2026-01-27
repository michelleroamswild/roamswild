import { NormalizedElement, SurfaceType } from './types';

const PAVED_SURFACES = ['asphalt', 'concrete', 'paved', 'chipseal'];
const GRAVEL_SURFACES = ['gravel', 'fine_gravel', 'compacted', 'pebblestone'];
const DIRT_SURFACES = ['dirt', 'earth', 'ground', 'mud', 'sand', 'grass'];

export function classifySurface(surface: string | undefined): SurfaceType | null {
  if (!surface) return null;
  const lower = surface.toLowerCase();
  if (PAVED_SURFACES.includes(lower)) return 'paved';
  if (GRAVEL_SURFACES.includes(lower)) return 'gravel';
  if (DIRT_SURFACES.includes(lower)) return 'dirt';
  return 'unknown';
}

export interface RoadFilterResult {
  passes: boolean;
  reason?: string;
}

export function isCandidateRoad(el: NormalizedElement): boolean {
  return filterRoad(el).passes;
}

export function filterRoad(el: NormalizedElement): RoadFilterResult {
  const { tags } = el;

  // Must have geometry
  if (!el.geometry || el.geometry.length < 2) {
    return { passes: false, reason: 'no_geometry' };
  }

  // Check access restrictions
  const access = tags.access?.toLowerCase();
  if (access === 'private' || access === 'no' || access === 'customers') {
    return { passes: false, reason: 'access_restricted' };
  }

  // Check vehicle restrictions
  if (tags.motor_vehicle === 'no' || tags.vehicle === 'no') {
    return { passes: false, reason: 'no_motor_vehicles' };
  }

  // Check tracktype for tracks
  if (tags.highway === 'track') {
    const tracktype = tags.tracktype;
    if (tracktype === 'grade4' || tracktype === 'grade5') {
      return { passes: false, reason: 'track_too_rough' };
    }
  }

  // Check surface for passability
  const surface = classifySurface(tags.surface);
  if (surface === 'dirt' && tags.smoothness === 'very_bad') {
    return { passes: false, reason: 'surface_impassable' };
  }

  return { passes: true };
}

export function roadPriorityScore(
  way: NormalizedElement,
  highway?: string,
  surface?: SurfaceType | null
): number {
  const hw = highway ?? way.tags.highway;
  const sf = surface ?? classifySurface(way.tags.surface);

  // Highway type score (0-50)
  let hwScore = 0;
  switch (hw) {
    case 'tertiary': hwScore = 50; break;
    case 'unclassified': hwScore = 45; break;
    case 'track': hwScore = 40; break;
    case 'secondary': hwScore = 30; break;
    default: hwScore = 20;
  }

  // Surface score (0-30)
  let sfScore = 15; // default for unknown
  switch (sf) {
    case 'gravel': sfScore = 30; break;
    case 'dirt': sfScore = 25; break;
    case 'paved': sfScore = 10; break;
  }

  // Named road bonus (0-20)
  const nameBonus = way.tags.name || way.tags.ref ? 20 : 0;

  return hwScore + sfScore + nameBonus;
}
