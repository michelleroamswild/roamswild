import { TripStop } from '@/types/trip';

// Resolve a stop's data origin from its id prefix. Returns null for trip-
// generated anchors (start/end/destination/town/travel/explore/return) where
// "source" doesn't apply.
//
// Centralised so the trip-detail and day-detail maps surface identical
// labels in their info-window popovers.
export const getStopSource = (stop: TripStop): string | null => {
  const id = stop.id;
  if (id.startsWith('ridb-')) return 'Recreation.gov';
  if (id.startsWith('usfs-')) return 'US Forest Service';
  if (id.startsWith('osm-dispersed-')) return 'OpenStreetMap (dispersed)';
  if (id.startsWith('osm-')) return 'OpenStreetMap';
  if (id.startsWith('hike-')) return 'Google Places';
  if (/^(start-|end-|dest-|town-|travel-|explore-|return-)/.test(id)) return null;
  if (stop.type === 'camp') return 'Community spots';
  return null;
};
