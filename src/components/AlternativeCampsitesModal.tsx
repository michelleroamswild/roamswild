import { useState, useEffect } from 'react';
import { X, MapPin, SpinnerGap, Tent, Check, ArrowSquareOut } from '@phosphor-icons/react';
import { TripStop } from '@/types/trip';
import { useCampsites } from '@/context/CampsitesContext';
import { Mono } from '@/components/redesign';
import { cn } from '@/lib/utils';

type LodgingType = 'dispersed' | 'campground' | 'cabin' | 'hotel' | 'mixed' | 'other';

interface AlternativeCampsitesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCampsite: TripStop;
  searchLat: number;
  searchLng: number;
  onSelectCampsite: (campsite: TripStop) => void;
  tripStartDate?: string;
  tripDuration?: number;
  lodgingPreference?: LodgingType;
}

interface CampsiteOption {
  id: string;
  name: string;
  note?: string;
  lat: number;
  lng: number;
  distance: number;
  source: 'saved' | 'ridb' | 'usfs' | 'osm';
  hasAvailability?: boolean;
  availableSites?: number;
  bookingUrl?: string;
}

function getDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

interface RIDBFacility {
  FacilityID: string;
  FacilityName: string;
  FacilityDescription: string;
  FacilityLatitude: number;
  FacilityLongitude: number;
  FacilityTypeDescription: string;
}

async function searchRIDBCampsites(
  lat: number,
  lng: number,
  radiusMiles: number = 50
): Promise<CampsiteOption[]> {
  try {
    const params = new URLSearchParams({
      latitude: lat.toString(),
      longitude: lng.toString(),
      radius: radiusMiles.toString(),
      limit: '50',
    });

    const response = await fetch(`/api/ridb/facilities?${params}`);
    if (!response.ok) return [];

    const data = await response.json();
    const facilities: RIDBFacility[] = data.RECDATA || [];

    const campgroundTypes = ['campground', 'camping', 'camp'];
    const campgrounds = facilities.filter((f) => {
      if (!f.FacilityLatitude || !f.FacilityLongitude) return false;
      const typeDesc = (f.FacilityTypeDescription || '').toLowerCase();
      const name = (f.FacilityName || '').toLowerCase();
      return campgroundTypes.some((type) => typeDesc.includes(type) || name.includes(type));
    });

    return campgrounds
      .map((facility) => {
        const distance = getDistanceMiles(lat, lng, facility.FacilityLatitude, facility.FacilityLongitude);
        const cleanDescription =
          facility.FacilityDescription?.replace(/<[^>]*>/g, '')?.slice(0, 150) ||
          facility.FacilityTypeDescription;
        return {
          id: `ridb-${facility.FacilityID}`,
          name: facility.FacilityName,
          lat: facility.FacilityLatitude,
          lng: facility.FacilityLongitude,
          note: cleanDescription,
          distance,
          source: 'ridb' as const,
          bookingUrl: `https://www.recreation.gov/camping/campgrounds/${facility.FacilityID}`,
        };
      })
      .sort((a, b) => a.distance - b.distance);
  } catch {
    return [];
  }
}

async function loadSavedCampsites(): Promise<CampsiteOption[]> {
  try {
    const res = await fetch('/google-saved-places.json');
    if (!res.ok) return [];
    const places = await res.json();
    return places.map((place: any) => ({
      id: place.id || `saved-${place.name}`,
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      note: place.note,
      distance: 0,
      source: 'saved' as const,
    }));
  } catch {
    return [];
  }
}

async function checkAvailability(
  facilityIds: string[],
  startDate: string,
  numNights: number
): Promise<Map<string, { available: boolean; availableSites: number }>> {
  const availabilityMap = new Map<string, { available: boolean; availableSites: number }>();
  if (facilityIds.length === 0 || !startDate) return availabilityMap;

  try {
    const [year, month, day] = startDate.split('-').map(Number);
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;

    for (const facilityId of facilityIds) {
      try {
        const numericId = facilityId.replace('ridb-', '');
        const params = new URLSearchParams({ id: numericId, start_date: monthStart });
        const response = await fetch(`/api/recreation-availability?${params}`);
        if (!response.ok) continue;

        const data = await response.json();
        if (data.campsites) {
          const campsites = Object.values(data.campsites) as any[];
          let sitesWithAvailability = 0;

          for (const site of campsites) {
            if (site.availabilities) {
              let hasAllNights = true;
              const checkDate = new Date(year, month - 1, day);
              for (let i = 0; i < numNights; i++) {
                const y = checkDate.getFullYear();
                const m = String(checkDate.getMonth() + 1).padStart(2, '0');
                const d = String(checkDate.getDate()).padStart(2, '0');
                const dateKey = `${y}-${m}-${d}T00:00:00Z`;
                const status = site.availabilities[dateKey];
                const isAvailable = status === 'Available' || status === 'Open';
                if (!isAvailable) {
                  hasAllNights = false;
                  break;
                }
                checkDate.setDate(checkDate.getDate() + 1);
              }
              if (hasAllNights) sitesWithAvailability++;
            }
          }

          availabilityMap.set(facilityId, {
            available: sitesWithAvailability > 0,
            availableSites: sitesWithAvailability,
          });
        }
      } catch {
        // skip individual facility errors
      }
    }

    return availabilityMap;
  } catch {
    return availabilityMap;
  }
}

async function findAlternativeCampsites(
  lat: number,
  lng: number,
  excludeId?: string,
  radiusMiles: number = 50,
  tripStartDate?: string,
  tripDuration?: number,
  lodgingPreference?: LodgingType,
  dispersedCampsites?: CampsiteOption[]
): Promise<CampsiteOption[]> {
  const savedCampsites = await loadSavedCampsites();

  const nearbySaved = savedCampsites
    .map((site) => ({
      ...site,
      distance: getDistanceMiles(lat, lng, site.lat, site.lng),
    }))
    .filter((site) => site.distance <= radiusMiles && site.id !== excludeId)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  if (lodgingPreference === 'dispersed') {
    const nearbyDispersed = (dispersedCampsites || [])
      .map((site) => ({
        ...site,
        distance: getDistanceMiles(lat, lng, site.lat, site.lng),
        source: 'osm' as const,
      }))
      .filter((site) => site.distance <= radiusMiles && site.id !== excludeId)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10);

    return [...nearbyDispersed, ...nearbySaved].slice(0, 10);
  }

  const ridbCampsites = await searchRIDBCampsites(lat, lng, radiusMiles);
  let nearbyRidb = ridbCampsites.filter((site) => site.id !== excludeId).slice(0, 15);

  if (tripStartDate && tripDuration && nearbyRidb.length > 0) {
    const ridbIds = nearbyRidb.map((c) => c.id);
    const availabilityMap = await checkAvailability(ridbIds, tripStartDate, tripDuration);

    nearbyRidb = nearbyRidb.map((site) => {
      const availability = availabilityMap.get(site.id);
      if (availability) {
        return {
          ...site,
          hasAvailability: availability.available,
          availableSites: availability.availableSites,
          bookingUrl: `https://www.recreation.gov/camping/campgrounds/${site.id.replace('ridb-', '')}`,
        };
      }
      return site;
    });

    nearbyRidb = nearbyRidb.filter((s) => s.hasAvailability !== false);
    nearbyRidb.sort((a, b) => a.distance - b.distance);
  }

  const withAvailability = nearbyRidb.filter((s) => s.hasAvailability === true);
  const unknownAvailability = nearbyRidb.filter((s) => s.hasAvailability === undefined);

  return [...withAvailability, ...nearbySaved, ...unknownAvailability].slice(0, 10);
}

export function AlternativeCampsitesModal({
  isOpen,
  onClose,
  currentCampsite,
  searchLat,
  searchLng,
  onSelectCampsite,
  tripStartDate,
  tripDuration,
  lodgingPreference,
}: AlternativeCampsitesModalProps) {
  const [alternatives, setAlternatives] = useState<CampsiteOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { getExplorerSpots } = useCampsites();

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setSelectedId(null);

      const fetchAlternatives = async () => {
        let dispersedCampsites: CampsiteOption[] | undefined;

        if (lodgingPreference === 'dispersed') {
          try {
            const spots = await getExplorerSpots(searchLat, searchLng, 50);
            dispersedCampsites = spots.map((spot) => ({
              id: spot.id,
              name: spot.name,
              lat: spot.lat,
              lng: spot.lng,
              note: spot.description || spot.road_type || 'Dispersed camping spot',
              distance: 0,
              source: 'osm' as const,
            }));
          } catch (err) {
            console.error('[AlternativeCampsitesModal] Error loading dispersed spots:', err);
          }
        }

        const sites = await findAlternativeCampsites(
          searchLat,
          searchLng,
          currentCampsite.id,
          50,
          tripStartDate,
          tripDuration,
          lodgingPreference,
          dispersedCampsites,
        );
        setAlternatives(sites);
        setLoading(false);
      };

      fetchAlternatives();
    }
  }, [isOpen, searchLat, searchLng, currentCampsite.id, tripStartDate, tripDuration, lodgingPreference, getExplorerSpots]);

  const handleSelect = (campsite: CampsiteOption) => {
    const newStop: TripStop = {
      id: campsite.id,
      name: campsite.name,
      type: 'camp',
      coordinates: { lat: campsite.lat, lng: campsite.lng },
      duration: 'Overnight',
      distance: `${campsite.distance.toFixed(0)} mi away`,
      description: campsite.note || 'Dispersed camping',
      day: currentCampsite.day,
      note: campsite.note,
      bookingUrl: campsite.bookingUrl,
      isReservable: campsite.hasAvailability,
    };
    setSelectedId(campsite.id);
    setTimeout(() => {
      onSelectCampsite(newStop);
      onClose();
    }, 300);
  };

  const getGoogleMapsUrl = (campsite: CampsiteOption) =>
    `https://www.google.com/maps/search/?api=1&query=${campsite.lat},${campsite.lng}`;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center font-sans">
      <div className="absolute inset-0 bg-ink-pine/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white border border-line rounded-[18px] shadow-[0_18px_44px_rgba(29,34,24,.16),0_3px_8px_rgba(29,34,24,.08)] w-full max-w-lg mx-4 max-h-[85vh] flex flex-col overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-line gap-3">
          <div className="min-w-0">
            <Mono className="text-pine-6 flex items-center gap-1.5">
              <Tent className="w-3.5 h-3.5" weight="regular" />
              Swap camp
            </Mono>
            <h2 className="text-[20px] font-sans font-semibold tracking-[-0.015em] text-ink leading-[1.15] mt-1">
              Pick a different campsite.
            </h2>
            <p className="text-[13px] text-ink-3 mt-1 truncate">
              Replacing <span className="font-sans font-semibold text-ink">{currentCampsite.name}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="inline-flex items-center justify-center w-9 h-9 rounded-full text-ink-3 hover:text-ink hover:bg-ink/5 transition-colors shrink-0"
          >
            <X className="w-4 h-4" weight="regular" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Date hint */}
          {!tripStartDate && lodgingPreference !== 'dispersed' && (
            <div className="mb-4 px-3 py-2.5 rounded-[12px] border border-clay/30 bg-clay/[0.06]">
              <Mono className="text-clay">Set trip dates to see live availability</Mono>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10">
                <SpinnerGap className="w-5 h-5 text-pine-6 animate-spin" />
              </div>
              <Mono className="text-pine-6">Finding nearby campsites…</Mono>
            </div>
          ) : alternatives.length === 0 ? (
            <div className="border border-dashed border-line bg-cream/40 rounded-[14px] px-6 py-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-sage/15 text-sage mb-3">
                <Tent className="w-5 h-5" weight="regular" />
              </div>
              <p className="text-[14px] font-sans font-semibold text-ink">No alternative campsites nearby</p>
              <p className="text-[13px] text-ink-3 mt-1">Try expanding the trip area.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {alternatives.map((campsite) => {
                const selected = selectedId === campsite.id;
                return (
                  <button
                    key={campsite.id}
                    onClick={() => handleSelect(campsite)}
                    className={cn(
                      'w-full text-left p-4 rounded-[14px] border bg-white transition-all',
                      selected
                        ? 'border-pine-6 ring-1 ring-pine-6/40 bg-pine-6/[0.04]'
                        : 'border-line hover:border-ink-3/40',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'inline-flex items-center justify-center w-9 h-9 rounded-[10px] flex-shrink-0 transition-colors',
                          selected ? 'bg-pine-6 text-cream' : 'bg-clay/15 text-clay',
                        )}
                      >
                        {selected ? (
                          <Check className="w-4 h-4" weight="bold" />
                        ) : (
                          <Tent className="w-4 h-4" weight="regular" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink">
                            {campsite.name}
                          </h3>
                        </div>

                        {campsite.note && (
                          <p className="text-[13px] text-ink-3 mt-1 line-clamp-2">{campsite.note}</p>
                        )}

                        {/* Source + availability tags */}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <SourceTag source={campsite.source} />
                          {campsite.hasAvailability === true && campsite.availableSites !== undefined && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-sage/15 text-sage text-[10px] font-mono uppercase tracking-[0.10em] font-semibold">
                              {campsite.availableSites} available
                            </span>
                          )}
                          {campsite.hasAvailability === false && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-ember/15 text-ember text-[10px] font-mono uppercase tracking-[0.10em] font-semibold">
                              No availability
                            </span>
                          )}
                        </div>

                        {/* Meta row */}
                        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] font-mono uppercase tracking-[0.10em] text-ink-3">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" weight="regular" />
                            {campsite.distance.toFixed(1)} mi
                          </span>
                          <a
                            href={getGoogleMapsUrl(campsite)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-sage hover:text-sage/80 transition-colors"
                          >
                            <ArrowSquareOut className="w-3 h-3" weight="regular" />
                            Maps
                          </a>
                          {campsite.bookingUrl && (
                            <a
                              href={campsite.bookingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-water hover:text-water/80 transition-colors"
                            >
                              <ArrowSquareOut className="w-3 h-3" weight="regular" />
                              Book
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-line bg-cream">
          <Mono className="text-ink-3 block text-center">Tap a campsite to swap it in</Mono>
        </div>
      </div>
    </div>
  );
}

const SourceTag = ({ source }: { source: CampsiteOption['source'] }) => {
  const config: Record<CampsiteOption['source'], { label: string; cls: string }> = {
    saved: { label: 'Saved', cls: 'bg-pine-6/10 text-pine-6' },
    ridb: { label: 'Recreation.gov', cls: 'bg-water/15 text-water' },
    usfs: { label: 'USFS', cls: 'bg-sage/15 text-sage' },
    osm: { label: 'Dispersed', cls: 'bg-clay/15 text-clay' },
  };
  const c = config[source];
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-[0.10em] font-semibold',
        c.cls,
      )}
    >
      {c.label}
    </span>
  );
};
