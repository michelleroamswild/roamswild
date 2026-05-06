import { useEffect, useMemo, useState } from 'react';
import {
  X,
  Check,
  MapPin,
  SpinnerGap,
  Sparkle,
  Mountains,
  Camera,
  Jeep,
  Drop,
  Car,
  Bicycle,
  Star,
  Clock,
  Warning,
  Path,
} from '@phosphor-icons/react';
import type { ActivityType, GeneratedTrip, TripDay, TripStop } from '@/types/trip';
import type { StopType } from '@/types/maps';
import { Mono } from '@/components/redesign';
import { cn } from '@/lib/utils';
import { usePoiSuggestions } from '@/hooks/use-poi-suggestions';
import type { ScoredPoi } from '@/utils/poiScoring';
import { getDrivingInfo, formatDrivingTime } from '@/utils/drivingInfo';

interface SuggestPoiModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: GeneratedTrip;
  day: TripDay;
  onAddStop: (stop: TripStop) => void;
}

const ACTIVITY_ICON: Record<ActivityType, typeof Mountains> = {
  hiking: Mountains,
  biking: Bicycle,
  photography: Camera,
  offroading: Jeep,
  water: Drop,
  scenic_driving: Car,
  climbing: Mountains,
  fishing: Drop,
  wildlife: Sparkle,
};

const ACTIVITY_TO_STOP: Record<ActivityType, StopType> = {
  hiking: 'hike',
  biking: 'hike',
  photography: 'viewpoint',
  offroading: 'hike',
  water: 'water',
  scenic_driving: 'viewpoint',
  climbing: 'hike',
  fishing: 'water',
  wildlife: 'viewpoint',
};

const MAX_SUGGESTIONS = 4;

function formatMinutes(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'bg-pine-6 text-cream';
  if (score >= 60) return 'bg-sage text-cream';
  if (score >= 40) return 'bg-clay text-cream';
  return 'bg-ink-3/60 text-cream';
}

/**
 * Round-robin per selected activity so a hiking + photography trip gets a
 * mix instead of four hikes. Within an activity, candidates stay in score
 * order.
 */
function diversifyByActivity(
  scored: ScoredPoi[],
  activities: ActivityType[],
  max: number,
): ScoredPoi[] {
  const buckets = new Map<ActivityType, ScoredPoi[]>();
  for (const a of activities) buckets.set(a, []);
  for (const c of scored) {
    const a = c.score.matched_activity;
    if (a && buckets.has(a)) buckets.get(a)!.push(c);
  }
  const out: ScoredPoi[] = [];
  let added = true;
  while (out.length < max && added) {
    added = false;
    for (const a of activities) {
      const list = buckets.get(a);
      if (list && list.length > 0 && out.length < max) {
        out.push(list.shift()!);
        added = true;
      }
    }
  }
  return out;
}

function buildTripStopFromCandidate(
  c: ScoredPoi,
  dayNumber: number,
  drive: { minutesOneWay: number; distanceMiles: number; isReachable: boolean },
): TripStop {
  const activity = c.score.matched_activity ?? 'photography';
  const stopType = ACTIVITY_TO_STOP[activity];
  return {
    id: `poi-${dayNumber}-${c.poi.id}`,
    name: c.poi.canonical_name,
    type: stopType,
    coordinates: { lat: c.poi.lat, lng: c.poi.lng },
    duration: formatMinutes(c.score.on_site_minutes),
    distance: `${drive.distanceMiles.toFixed(1)} mi drive`,
    drivingTime: formatDrivingTime(drive.minutesOneWay, true),
    description: c.score.reasons.join(' · '),
    day: dayNumber,
  };
}

export function SuggestPoiModal({ isOpen, onClose, trip, day, onAddStop }: SuggestPoiModalProps) {
  const { candidates, loading, error, activityWindowMinutes } = usePoiSuggestions({
    trip,
    day,
    enabled: isOpen,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSelectedId(null);
      setAdding(false);
    }
  }, [isOpen]);

  const visibleCandidates = useMemo(() => {
    const selectedActivities = (trip.config.activities ?? []) as ActivityType[];
    if (selectedActivities.length === 0) return candidates.slice(0, MAX_SUGGESTIONS);
    return diversifyByActivity(candidates, selectedActivities, MAX_SUGGESTIONS);
  }, [candidates, trip.config.activities]);

  const handleSelect = async (c: ScoredPoi) => {
    if (adding) return;
    setSelectedId(c.poi.id);
    setAdding(true);

    // Real Google Directions drive time from today's campsite (or first stop)
    // to the POI. Falls back to the haversine heuristic if Maps is unavailable.
    const camp =
      day.stops.find((s) => s.type === 'camp')?.coordinates ?? day.stops[0]?.coordinates;
    const drive = camp
      ? await getDrivingInfo(camp.lat, camp.lng, c.poi.lat, c.poi.lng, c.poi.canonical_name)
      : {
          distanceMiles: c.score.distance_from_camp_mi ?? 0,
          durationMinutes: c.score.drive_minutes_one_way,
          isReachable: true,
          fromDirections: false,
        };

    const stop = buildTripStopFromCandidate(c, day.day, {
      minutesOneWay: drive.durationMinutes,
      distanceMiles: drive.distanceMiles,
      isReachable: drive.isReachable,
    });
    onAddStop(stop);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center font-sans">
      <div
        className="absolute inset-0 bg-ink-pine/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-white dark:bg-paper-2 border border-line rounded-[18px] shadow-[0_18px_44px_rgba(29,34,24,.16),0_3px_8px_rgba(29,34,24,.08)] w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden animate-fade-in">
        <div className="flex items-start justify-between p-5 border-b border-line gap-3">
          <div>
            <Mono className="text-pine-6 flex items-center gap-1.5">
              <Sparkle className="w-3.5 h-3.5" weight="regular" />
              Suggest activities
            </Mono>
            <h2 className="text-[20px] font-sans font-semibold tracking-[-0.015em] text-ink leading-[1.15] mt-1">
              Top picks for Day {day.day}
            </h2>
            <p className="text-[13px] text-ink-3 mt-1">
              Ranked by location, time fit, and your preferences.
              {activityWindowMinutes != null && activityWindowMinutes > 0 && (
                <> {formatMinutes(activityWindowMinutes)} of activity time left.</>
              )}
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

        <div className="p-5 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10">
                <SpinnerGap className="w-5 h-5 text-pine-6 animate-spin" />
              </div>
              <p className="text-[14px] text-ink-3">Scoring nearby POIs…</p>
            </div>
          ) : error ? (
            <div className="border border-dashed border-line bg-cream/40 dark:bg-paper-2/40 rounded-[14px] px-6 py-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-clay/15 text-clay mb-3">
                <Warning className="w-5 h-5" weight="regular" />
              </div>
              <p className="text-[14px] font-sans font-semibold text-ink">Couldn't load suggestions</p>
              <p className="text-[13px] text-ink-3 mt-1">{error}</p>
            </div>
          ) : visibleCandidates.length === 0 ? (
            <div className="border border-dashed border-line bg-cream/40 dark:bg-paper-2/40 rounded-[14px] px-6 py-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-sage/15 text-sage mb-3">
                <Sparkle className="w-5 h-5" weight="regular" />
              </div>
              <p className="text-[14px] font-sans font-semibold text-ink">Nothing fits this day</p>
              <p className="text-[13px] text-ink-3 mt-1">
                Try widening your activity time or relaxing skill level.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {visibleCandidates.map((c) => {
                const selected = selectedId === c.poi.id;
                const Icon = c.score.matched_activity
                  ? ACTIVITY_ICON[c.score.matched_activity]
                  : MapPin;
                return (
                  <button
                    key={c.poi.id}
                    onClick={() => handleSelect(c)}
                    disabled={adding}
                    className={cn(
                      'w-full text-left p-4 rounded-[14px] border bg-white dark:bg-paper-2 transition-all',
                      selected
                        ? 'border-pine-6 ring-1 ring-pine-6/40 bg-pine-6/[0.04]'
                        : 'border-line hover:border-ink-3/40',
                      adding && !selected && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'inline-flex items-center justify-center w-9 h-9 rounded-[10px] flex-shrink-0 transition-colors',
                          selected ? 'bg-pine-6 text-cream' : 'bg-sage/15 text-sage',
                        )}
                      >
                        {selected && adding ? (
                          <SpinnerGap className="w-4 h-4 animate-spin" />
                        ) : selected ? (
                          <Check className="w-4 h-4" weight="bold" />
                        ) : (
                          <Icon className="w-4 h-4" weight="regular" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <h3 className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink flex-1 truncate">
                            {c.poi.canonical_name}
                          </h3>
                          <span
                            className={cn(
                              'inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold tracking-[0.05em]',
                              scoreColor(c.score.score_0_100),
                            )}
                          >
                            {c.score.score_0_100}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono uppercase tracking-[0.10em] text-ink-3">
                          <span className="inline-flex items-center gap-1">
                            <Path className="w-3 h-3" weight="regular" />
                            {formatMinutes(c.score.on_site_minutes)} on site
                          </span>
                          {c.score.drive_minutes_one_way > 0 && (
                            <span className="inline-flex items-center gap-1 text-pine-6">
                              <Clock className="w-3 h-3" weight="regular" />
                              ~{formatMinutes(c.score.drive_minutes_one_way)} drive
                            </span>
                          )}
                          {c.score.distance_from_camp_mi != null && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3 h-3" weight="regular" />
                              {c.score.distance_from_camp_mi.toFixed(1)} mi
                            </span>
                          )}
                          {c.poi.is_hidden_gem && (
                            <span className="inline-flex items-center gap-1 text-clay">
                              <Star className="w-3 h-3" weight="fill" />
                              gem
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-[12px] text-ink-3 leading-[1.5]">
                          {c.score.reasons.join(' · ')}
                        </p>
                        {c.score.warnings.length > 0 && (
                          <div className="mt-1.5 flex items-center gap-1 text-[11px] text-clay">
                            <Warning className="w-3 h-3" weight="regular" />
                            {c.score.warnings.join(' · ')}
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
          <Mono className="text-ink-3 block text-center">
            Tap a suggestion to add it to Day {day.day}
          </Mono>
        </div>
      </div>
    </div>
  );
}
