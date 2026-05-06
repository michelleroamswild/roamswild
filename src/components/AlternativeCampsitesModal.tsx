import { useEffect, useMemo, useState } from 'react';
import { X, MapPin, SpinnerGap, Tent, Check, ArrowSquareOut, Warning } from '@phosphor-icons/react';
import type { TripStop, TripConfig } from '@/types/trip';
import { Mono } from '@/components/redesign';
import { cn } from '@/lib/utils';
import { useCampsiteCandidates } from '@/hooks/use-campsite-candidates';
import type { CampsiteCandidate, ScoredCampsite } from '@/utils/campsiteScoring';

interface AlternativeCampsitesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCampsite: TripStop;
  searchLat: number;
  searchLng: number;
  onSelectCampsite: (campsite: TripStop) => void;
  /** Optional — passing the full config lets us scope by vehicle + lodging
   *  preference and (when `lodging === 'campground'`) layer in RIDB results. */
  tripConfig?: TripConfig;
}

interface RIDBFacility {
  FacilityID: string;
  FacilityName: string;
  FacilityDescription: string;
  FacilityLatitude: number;
  FacilityLongitude: number;
  FacilityTypeDescription: string;
}

async function searchRIDBCampsites(lat: number, lng: number, radiusMiles = 50): Promise<CampsiteCandidate[]> {
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
      return campgroundTypes.some((t) => typeDesc.includes(t) || name.includes(t));
    });
    return campgrounds.map((f) => {
      const dist = haversineMiles(lat, lng, f.FacilityLatitude, f.FacilityLongitude);
      const desc = f.FacilityDescription?.replace(/<[^>]*>/g, '')?.slice(0, 150) || f.FacilityTypeDescription;
      return {
        id: `ridb-${f.FacilityID}`,
        name: f.FacilityName,
        lat: f.FacilityLatitude,
        lng: f.FacilityLongitude,
        distance_miles: dist,
        source: 'ridb',
        kind: 'established_campground',
        description: desc,
        amenities: null,
        extra: null,
        public_access: null,
        land_type: 'public',
        public_land_manager: null,
        bookingUrl: `https://www.recreation.gov/camping/campgrounds/${f.FacilityID}`,
      } as CampsiteCandidate;
    });
  } catch {
    return [];
  }
}

async function checkAvailability(
  facilityIds: string[],
  startDate: string,
  numNights: number,
): Promise<Map<string, { available: boolean; availableSites: number }>> {
  const out = new Map<string, { available: boolean; availableSites: number }>();
  if (facilityIds.length === 0 || !startDate) return out;
  try {
    const [year, month, day] = startDate.split('-').map(Number);
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;
    for (const id of facilityIds) {
      try {
        const numericId = id.replace('ridb-', '');
        const params = new URLSearchParams({ id: numericId, start_date: monthStart });
        const r = await fetch(`/api/recreation-availability?${params}`);
        if (!r.ok) continue;
        const data = await r.json();
        if (!data.campsites) continue;
        let sitesWithAvailability = 0;
        for (const site of Object.values<any>(data.campsites)) {
          if (!site.availabilities) continue;
          let hasAllNights = true;
          const checkDate = new Date(year, month - 1, day);
          for (let i = 0; i < numNights; i++) {
            const y = checkDate.getFullYear();
            const m = String(checkDate.getMonth() + 1).padStart(2, '0');
            const d = String(checkDate.getDate()).padStart(2, '0');
            const status = site.availabilities[`${y}-${m}-${d}T00:00:00Z`];
            if (status !== 'Available' && status !== 'Open') {
              hasAllNights = false;
              break;
            }
            checkDate.setDate(checkDate.getDate() + 1);
          }
          if (hasAllNights) sitesWithAvailability++;
        }
        out.set(id, { available: sitesWithAvailability > 0, availableSites: sitesWithAvailability });
      } catch {
        // skip individual facility errors
      }
    }
    return out;
  } catch {
    return out;
  }
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scoreColor(score: number): string {
  if (score >= 80) return 'bg-pine-6 text-cream';
  if (score >= 60) return 'bg-sage text-cream';
  if (score >= 40) return 'bg-clay text-cream';
  return 'bg-ink-3/60 text-cream';
}

const SOURCE_LABELS: Record<CampsiteCandidate['source'], { label: string; cls: string }> = {
  user_saved:     { label: 'Saved',     cls: 'bg-pine-6/10 text-pine-6' },
  ridb:           { label: 'Bookable',  cls: 'bg-water/15 text-water' },
  spot_known:     { label: 'Known',     cls: 'bg-sage/15 text-sage' },
  spot_community: { label: 'Community', cls: 'bg-clay/15 text-clay' },
  spot_derived:   { label: 'OSM',       cls: 'bg-ink-3/15 text-ink-3' },
  spot_unknown:   { label: 'Unverified',cls: 'bg-ink-3/15 text-ink-3' },
};

export function AlternativeCampsitesModal({
  isOpen,
  onClose,
  currentCampsite,
  searchLat,
  searchLng,
  onSelectCampsite,
  tripConfig,
}: AlternativeCampsitesModalProps) {
  const [ridbExtras, setRidbExtras] = useState<CampsiteCandidate[]>([]);
  const [ridbLoading, setRidbLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // RIDB is only fetched when the user actually wants established campgrounds.
  // For 'mixed' we also include it because the user accepts either type.
  const includeRidb =
    tripConfig?.lodgingPreference === 'campground' ||
    tripConfig?.lodgingPreference === 'mixed';

  useEffect(() => {
    if (!isOpen) {
      setSelectedId(null);
      return;
    }
    if (!includeRidb) {
      setRidbExtras([]);
      return;
    }
    let cancelled = false;
    setRidbLoading(true);
    (async () => {
      const ridb = await searchRIDBCampsites(searchLat, searchLng, 50);
      if (cancelled) return;
      const startDate = tripConfig?.startDate;
      const duration = tripConfig?.duration;
      if (startDate && duration && ridb.length > 0) {
        const ids = ridb.map((c) => c.id);
        const availMap = await checkAvailability(ids, startDate, duration);
        const enriched = ridb.map((c) => {
          const a = availMap.get(c.id);
          return a ? { ...c, hasAvailability: a.available, availableSites: a.availableSites } : c;
        });
        if (!cancelled) setRidbExtras(enriched);
      } else {
        setRidbExtras(ridb);
      }
      if (!cancelled) setRidbLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, includeRidb, searchLat, searchLng, tripConfig?.startDate, tripConfig?.duration]);

  // Use defaults when no tripConfig is supplied so the modal still works
  // standalone — callers without a config get a generic dispersed search.
  const effectiveConfig = useMemo<TripConfig>(() => {
    if (tripConfig) return tripConfig;
    return {
      name: 'temp',
      duration: 1,
      destinations: [],
      returnToStart: false,
      lodgingPreference: 'dispersed',
    };
  }, [tripConfig]);

  const { candidates, loading: candidatesLoading, error } = useCampsiteCandidates({
    anchor: { lat: searchLat, lng: searchLng },
    config: effectiveConfig,
    enabled: isOpen,
    extraCandidates: ridbExtras,
    excludeId: currentCampsite.id,
  });

  const loading = candidatesLoading || ridbLoading;

  const handleSelect = (sc: ScoredCampsite) => {
    setSelectedId(sc.campsite.id);
    const c = sc.campsite;
    const newStop: TripStop = {
      id: c.id,
      name: c.name,
      type: 'camp',
      coordinates: { lat: c.lat, lng: c.lng },
      duration: 'Overnight',
      distance: `${c.distance_miles.toFixed(1)} mi away`,
      description: c.description ?? sc.score.reasons.join(' · '),
      day: currentCampsite.day,
      note: c.description ?? undefined,
      bookingUrl: c.bookingUrl,
      isReservable: c.hasAvailability,
    };
    setTimeout(() => {
      onSelectCampsite(newStop);
      onClose();
    }, 250);
  };

  const getGoogleMapsUrl = (c: CampsiteCandidate) =>
    `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`;

  if (!isOpen) return null;

  const top = candidates.slice(0, 10);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center font-sans">
      <div className="absolute inset-0 bg-ink-pine/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white dark:bg-paper-2 border border-line rounded-[18px] shadow-[0_18px_44px_rgba(29,34,24,.16),0_3px_8px_rgba(29,34,24,.08)] w-full max-w-lg mx-4 max-h-[85vh] flex flex-col overflow-hidden animate-fade-in">
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

        <div className="flex-1 overflow-y-auto p-5">
          {includeRidb && !tripConfig?.startDate && (
            <div className="mb-4 px-3 py-2.5 rounded-[12px] border border-clay/30 bg-clay/[0.06]">
              <Mono className="text-clay">Set trip dates to see live availability</Mono>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10">
                <SpinnerGap className="w-5 h-5 text-pine-6 animate-spin" />
              </div>
              <Mono className="text-pine-6">Scoring nearby campsites…</Mono>
            </div>
          ) : error ? (
            <div className="border border-dashed border-line bg-cream/40 dark:bg-paper-2/40 rounded-[14px] px-6 py-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-clay/15 text-clay mb-3">
                <Warning className="w-5 h-5" weight="regular" />
              </div>
              <p className="text-[14px] font-sans font-semibold text-ink">Couldn't load alternatives</p>
              <p className="text-[13px] text-ink-3 mt-1">{error}</p>
            </div>
          ) : top.length === 0 ? (
            <div className="border border-dashed border-line bg-cream/40 dark:bg-paper-2/40 rounded-[14px] px-6 py-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-sage/15 text-sage mb-3">
                <Tent className="w-5 h-5" weight="regular" />
              </div>
              <p className="text-[14px] font-sans font-semibold text-ink">No alternative campsites nearby</p>
              <p className="text-[13px] text-ink-3 mt-1">Try expanding the trip area.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {top.map((sc) => {
                const c = sc.campsite;
                const selected = selectedId === c.id;
                const sourceMeta = SOURCE_LABELS[c.source];
                return (
                  <button
                    key={c.id}
                    onClick={() => handleSelect(sc)}
                    className={cn(
                      'w-full text-left p-4 rounded-[14px] border bg-white dark:bg-paper-2 transition-all',
                      selected
                        ? 'border-pine-6 ring-1 ring-pine-6/40 bg-pine-6/[0.04]'
                        : 'border-line hover:border-ink-3/40',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'inline-flex items-center justify-center w-9 h-9 rounded-[10px] flex-shrink-0 transition-colors',
                          selected ? 'bg-pine-6 text-cream dark:text-ink-pine' : 'bg-clay/15 text-clay',
                        )}
                      >
                        {selected ? (
                          <Check className="w-4 h-4" weight="bold" />
                        ) : (
                          <Tent className="w-4 h-4" weight="regular" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <h3 className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink flex-1 truncate">
                            {c.name}
                          </h3>
                          <span
                            className={cn(
                              'inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold tracking-[0.05em]',
                              scoreColor(sc.score.score_0_100),
                            )}
                          >
                            {sc.score.score_0_100}
                          </span>
                        </div>

                        {c.description && (
                          <p className="text-[13px] text-ink-3 mt-1 line-clamp-2">{c.description}</p>
                        )}

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span
                            className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-[0.10em] font-semibold',
                              sourceMeta.cls,
                            )}
                          >
                            {sourceMeta.label}
                          </span>
                          {c.public_land_manager && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-sage/15 text-sage text-[10px] font-mono uppercase tracking-[0.10em] font-semibold">
                              {c.public_land_manager}
                            </span>
                          )}
                          {c.hasAvailability === true && c.availableSites !== undefined && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-sage/15 text-sage text-[10px] font-mono uppercase tracking-[0.10em] font-semibold">
                              {c.availableSites} available
                            </span>
                          )}
                          {c.hasAvailability === false && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-ember/15 text-ember text-[10px] font-mono uppercase tracking-[0.10em] font-semibold">
                              No availability
                            </span>
                          )}
                        </div>

                        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] font-mono uppercase tracking-[0.10em] text-ink-3">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" weight="regular" />
                            {c.distance_miles.toFixed(1)} mi
                          </span>
                          {sc.score.drive_minutes_one_way > 0 && (
                            <span className="inline-flex items-center gap-1 text-pine-6">
                              ~{Math.round(sc.score.drive_minutes_one_way)} min drive
                            </span>
                          )}
                          <a
                            href={getGoogleMapsUrl(c)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-sage hover:text-sage/80 transition-colors"
                          >
                            <ArrowSquareOut className="w-3 h-3" weight="regular" />
                            Maps
                          </a>
                          {c.bookingUrl && (
                            <a
                              href={c.bookingUrl}
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

                        {sc.score.warnings.length > 0 && (
                          <div className="mt-1.5 flex items-center gap-1 text-[11px] text-clay">
                            <Warning className="w-3 h-3" weight="regular" />
                            {sc.score.warnings.join(' · ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-line bg-cream dark:bg-paper-2">
          <Mono className="text-ink-3 block text-center">Tap a campsite to swap it in</Mono>
        </div>
      </div>
    </div>
  );
}
