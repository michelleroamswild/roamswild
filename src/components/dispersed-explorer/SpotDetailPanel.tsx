import {
  ArrowSquareOut,
  CheckCircle,
  Database,
  Drop,
  Shower,
  SpinnerGap,
  Tent,
  TrashSimple,
  TreeEvergreen,
  TShirt,
  Users,
} from '@phosphor-icons/react';
import { PotentialSpot } from '@/hooks/use-dispersed-roads';
import { useSpotNaipImage } from '@/hooks/use-spot-naip-image';
import type { Campsite } from '@/types/campsite';
import type { SpotAIAnalysis } from './types';
import { Mono, Pill } from '@/components/redesign';
import { AiAssessmentSection } from './AiAssessmentSection';
import { cn } from '@/lib/utils';
import {
  DetailShell,
  DetailBody,
  DetailActions,
  BackLink,
  DetailHero,
  CoordsStrip,
  DetailSection,
  DetailRow,
  DetailTag,
} from './DetailPanelChrome';

interface SpotDetailPanelProps {
  selectedSpot: PotentialSpot;
  existingCampsiteForSpot: Campsite | null;
  aiAnalysis: SpotAIAnalysis | null;
  aiAnalyzing: boolean;
  aiCheckingCache: boolean;
  aiError: string | null;
  copiedCoords: boolean;
  fromDatabase: boolean;
  onBack: () => void;
  onCopyCoords: () => void;
  onAnalyze: () => void;
  onReanalyze: () => void;
  onDismissError: () => void;
  /** Quick bookmark — saves the spot to the user's campsites without
   *  the heavier "I've been here" notes/road-access flow. */
  onSave: () => void;
  /** "I've been here" ground-truth confirmation flow. Currently surfaced
   *  via the dedicated ConfirmSpotDialog (notes + road access form). */
  onConfirm: () => void;
  // Soft-mark for delete: hide locally + queue for hard-delete on
  // AdminSpotReview. Optional so non-DB-backed callers can omit it.
  // Toggle: clicking again on a marked spot un-marks it.
  onMarkForDelete?: () => void;
  /** True when the selected spot is currently in the "marked for delete"
   *  set. Drives the icon swap (trash → filled check) + tooltip wording. */
  isMarkedForDelete?: boolean;
}

export const typeLabel = (spot: PotentialSpot): string => {
  // Dispersed: show source-bucket breadcrumb (matches the filter UI).
  if (spot.kind === 'dispersed_camping') {
    if (spot.dbSource === 'community' || spot.subKind === 'community') return 'Dispersed > Community';
    if (spot.subKind === 'known') return 'Dispersed > Known';
    return 'Dispersed > Derived';
  }
  if (spot.kind === 'established_campground') return 'Established';
  if (spot.kind === 'informal_camping')       return 'Informal';
  if (spot.kind === 'water')                  return 'Water';
  if (spot.kind === 'shower')                 return 'Shower';
  if (spot.kind === 'laundromat')             return 'Laundromat';
  // Runtime-derived spots (no kind set, came from road geometry).
  if (spot.type === 'camp-site') return 'Established';
  return 'Dispersed > Derived';
};

// Map top-level `kind` → icon + accent. Pin colors mirror the explorer
// map markers (--pin-* tokens). Source / sub_kind don't change the icon.
const typeStyle = (spot: PotentialSpot) => {
  switch (spot.kind) {
    case 'dispersed_camping':       return { Icon: Tent,         bg: 'bg-pin-dispersed/15',  text: 'text-pin-dispersed'  };
    case 'established_campground':  return { Icon: Tent,         bg: 'bg-pin-campground/15', text: 'text-pin-campground' };
    case 'informal_camping':        return { Icon: Tent,         bg: 'bg-pin-informal/15',   text: 'text-pin-informal'   };
    case 'water':                   return { Icon: Drop,         bg: 'bg-pin-water/15',      text: 'text-pin-water'      };
    case 'shower':                  return { Icon: Shower,   bg: 'bg-pin-shower/15',     text: 'text-pin-shower'     };
    case 'laundromat':              return { Icon: TShirt,       bg: 'bg-pin-laundromat/15', text: 'text-pin-laundromat' };
    default:
      // Runtime-derived spots without a kind set (from road geometry).
      if (spot.type === 'camp-site') return { Icon: Tent, bg: 'bg-pin-campground/15', text: 'text-pin-campground' };
      return { Icon: Tent, bg: 'bg-pin-dispersed/15', text: 'text-pin-dispersed' };
  }
};

export const SpotDetailPanel = ({
  selectedSpot,
  existingCampsiteForSpot,
  aiAnalysis,
  aiAnalyzing,
  aiCheckingCache,
  aiError,
  copiedCoords,
  fromDatabase,
  onBack,
  onCopyCoords,
  onAnalyze,
  onReanalyze,
  onDismissError,
  onSave,
  onConfirm,
  onMarkForDelete,
  isMarkedForDelete = false,
}: SpotDetailPanelProps) => {
  const { Icon, bg, text } = typeStyle(selectedSpot);
  const { image: naipImage, loading: naipLoading } = useSpotNaipImage(selectedSpot.lat, selectedSpot.lng);
  const naipYear = naipImage?.taken_at ? new Date(naipImage.taken_at).getFullYear() : null;

  return (
    <DetailShell>
      <DetailBody>
        {/* Top bar — back link + cache indicator + mark-for-delete.
            Sticky so it stays visible as the rest of the panel scrolls.
            Cached + Mark-for-delete are icon-only since both are debug
            affordances; their tooltips carry the meaning. The delete icon
            only shows when (a) the parent supplied a handler and (b) the
            spot has a UUID id (i.e., it lives in the DB and AdminSpotReview
            can act on it). */}
        <div className="sticky top-0 z-10 bg-white dark:bg-paper-2 px-[18px] py-3 border-b border-line flex items-center justify-between">
          <BackLink onBack={onBack} />
          <div className="flex items-center gap-1">
            {fromDatabase && (
              <span
                title="Loaded from cached spot data"
                aria-label="Cached"
                className="inline-flex items-center justify-center w-7 h-7 rounded-full text-ink-3"
              >
                <Database className="w-3.5 h-3.5" weight="regular" />
              </span>
            )}
            {onMarkForDelete && /^[0-9a-f-]{36}$/i.test(selectedSpot.id) && (
              <button
                type="button"
                onClick={onMarkForDelete}
                title={isMarkedForDelete
                  ? 'Marked for deletion — click to undo'
                  : 'Hide from map and queue for deletion in admin review'}
                aria-label={isMarkedForDelete ? 'Undo mark for delete' : 'Mark for delete'}
                aria-pressed={isMarkedForDelete}
                className={cn(
                  'inline-flex items-center justify-center w-7 h-7 rounded-full transition-colors',
                  isMarkedForDelete
                    ? 'text-pine-6 bg-pine-6/10 hover:bg-pine-6/15'
                    : 'text-ember hover:bg-ember/10',
                )}
              >
                {isMarkedForDelete ? (
                  <CheckCircle className="w-3.5 h-3.5" weight="fill" />
                ) : (
                  <TrashSimple className="w-3.5 h-3.5" weight="regular" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* NAIP aerial — full-width hero strip when available. Hover to
            zoom in on the imagery (~10% scale, slight ease) so users can
            inspect terrain detail without leaving the panel. */}
        {(naipLoading || naipImage) && (
          <div className="group/naip relative aspect-[4/3] bg-paper-2 overflow-hidden border-b border-line">
            {naipLoading && !naipImage && (
              <div className="absolute inset-0 flex items-center justify-center">
                <SpinnerGap className="w-5 h-5 animate-spin text-ink-3" />
              </div>
            )}
            {naipImage && (
              <>
                <img
                  src={naipImage.storage_url}
                  alt="Aerial view"
                  className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover/naip:scale-110"
                  loading="lazy"
                />
                {/* Centered location pin — overlaid client-side so the
                    design can change without regenerating chips. Suppress
                    on legacy chips that have the pin baked into the JPEG. */}
                {!naipImage.pinBaked && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center transition-transform duration-500 ease-out group-hover/naip:scale-110">
                    <div className="w-3.5 h-3.5 rounded-full bg-cream border-[2px] border-ink shadow-[0_2px_6px_rgba(0,0,0,0.45)]" />
                  </div>
                )}
                <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-ink/80 dark:bg-ink-pine/80 text-cream text-[10px] font-mono uppercase tracking-[0.10em] font-semibold">
                  NAIP{naipYear ? ` · ${naipYear}` : ''}
                </div>
              </>
            )}
          </div>
        )}

        {/* Hero — type-colored icon, eyebrow, name, source badge */}
        <DetailSection title={typeLabel(selectedSpot)} first>
          <DetailHero
            Icon={Icon}
            iconBg={bg}
            iconText={text}
            title={selectedSpot.name || 'Unnamed spot'}
          />
        </DetailSection>

        {/* Sub-kind chip (character: wild / pullout / boondocking_lot,
            etc.) — drop legacy provenance values that leak into sub_kind. */}
        {selectedSpot.subKind
          && !['community', 'derived', 'known', 'campground'].includes(selectedSpot.subKind) && (
          <DetailSection title="Type">
            <DetailTag variant="ghost">
              {selectedSpot.subKind.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </DetailTag>
          </DetailSection>
        )}

        {/* User / AI-written description (community spots primarily) */}
        {selectedSpot.description && (
          <DetailSection title="Description">
            <p className="text-[14px] leading-[1.55] text-ink whitespace-pre-line">
              {selectedSpot.description}
            </p>
          </DetailSection>
        )}

        {/* Coords */}
        <DetailSection title="Coordinates">
          <CoordsStrip
            lat={selectedSpot.lat}
            lng={selectedSpot.lng}
            copied={copiedCoords}
            onCopy={onCopyCoords}
          />
        </DetailSection>

        {/* Amenities — raw bag from the DB, rendered as label/value pairs
            for booleans and enums alike. See AMENITIES.md for vocab. */}
        {selectedSpot.amenities && Object.keys(selectedSpot.amenities).length > 0 && (
          <DetailSection title="Amenities">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(selectedSpot.amenities).map(([k, v]) => {
                if (v === false || v === null || v === undefined || v === '') return null;
                const prettify = (s: string) =>
                  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                const label = prettify(k);
                let valStr: string | null;
                if (v === true) {
                  valStr = null;
                } else if (typeof v === 'object') {
                  valStr = JSON.stringify(v);
                } else if (typeof v === 'string') {
                  valStr = prettify(v);
                } else {
                  valStr = String(v);
                }
                return (
                  <DetailTag key={k} variant="ghost">
                    {valStr ? `${label}: ${valStr}` : label}
                  </DetailTag>
                );
              })}
            </div>
          </DetailSection>
        )}

        {/* Access difficulty + the OSM road tags that produced it */}
        {selectedSpot.accessDifficulty && selectedSpot.accessDifficulty !== 'unknown' && (() => {
          const d = selectedSpot.accessDifficulty;
          const r = selectedSpot.accessRoad;
          const styles: Record<string, { dot: string; bg: string; border: string; label: string; text: string }> = {
            extreme:  { dot: 'bg-pin-hard',     bg: 'bg-pin-hard/8',     border: 'border-pin-hard/40',     text: 'text-pin-hard',     label: 'Extreme access' },
            hard:     { dot: 'bg-pin-hard',     bg: 'bg-pin-hard/8',     border: 'border-pin-hard/40',     text: 'text-pin-hard',     label: 'Hard access' },
            moderate: { dot: 'bg-pin-moderate', bg: 'bg-pin-moderate/8', border: 'border-pin-moderate/40', text: 'text-pin-moderate', label: 'Moderate access' },
            easy:     { dot: 'bg-pin-easy',     bg: 'bg-pin-easy/8',     border: 'border-pin-easy/40',     text: 'text-pin-easy',     label: 'Easy access' },
          };
          const s = styles[d];
          if (!s) return null;
          return (
            <DetailSection title="Access difficulty">
              <div className={cn('px-3 py-2.5 rounded-[10px] border', s.bg, s.border)}>
                <div className="flex items-center gap-2">
                  <span className={cn('w-2.5 h-2.5 rounded-full', s.dot)} />
                  <span className={cn('text-[14px] font-sans font-semibold tracking-[-0.005em]', s.text)}>{s.label}</span>
                </div>
                {r && (r.road_name || r.tracktype || r.smoothness || r.surface) && (
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono uppercase tracking-[0.08em] text-ink-3">
                    {r.road_name   && <span><span className="text-ink-2 font-semibold">Track</span> {r.road_name}</span>}
                    {r.tracktype   && <span><span className="text-ink-2 font-semibold">Tracktype</span> {r.tracktype}</span>}
                    {r.smoothness  && <span><span className="text-ink-2 font-semibold">Smoothness</span> {r.smoothness}</span>}
                    {r.surface     && <span><span className="text-ink-2 font-semibold">Surface</span> {r.surface}</span>}
                    {r.four_wd_only && <span className="text-ink-2 font-semibold">4WD only</span>}
                  </div>
                )}
              </div>
            </DetailSection>
          );
        })()}

        {/* Community confirmations */}
        {existingCampsiteForSpot && (
          <DetailSection title="Community">
            <div className="flex items-center gap-2 px-3 py-2 rounded-[10px] border border-pine-6/30 bg-pine-6/[0.06] text-pine-6">
              <Users className="w-4 h-4 flex-shrink-0" weight="regular" />
              <span className="text-[13px] font-sans font-semibold">
                {existingCampsiteForSpot.confirmationCount} confirmed
              </span>
              {existingCampsiteForSpot.isConfirmed && (
                <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-[0.10em] font-semibold">
                  <CheckCircle className="w-3.5 h-3.5" weight="fill" />
                  Verified
                </span>
              )}
            </div>
          </DetailSection>
        )}

        {/* Public-land entity */}
        {selectedSpot.landName && (
          <DetailSection title="Public land">
            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-[10px] border border-sage/30 bg-sage/[0.06]">
              <TreeEvergreen className="w-4 h-4 text-sage flex-shrink-0 mt-0.5" weight="regular" />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-sans font-semibold text-ink leading-tight">
                  {selectedSpot.landName}
                </p>
                {(selectedSpot.landProtectionTitle || selectedSpot.landProtectClass) && (
                  <p className="text-[12px] text-ink-3 mt-0.5">
                    {selectedSpot.landProtectionTitle}
                    {selectedSpot.landProtectionTitle && selectedSpot.landProtectClass && ' · '}
                    {selectedSpot.landProtectClass && `IUCN ${selectedSpot.landProtectClass}`}
                  </p>
                )}
              </div>
            </div>
          </DetailSection>
        )}

        {/* OSM tag details (camp-site only) */}
        {selectedSpot.osmTags && <OsmTagDetails tags={selectedSpot.osmTags} />}

        {/* AI Analysis — campability assessment is meaningless for utility
            kinds (water spigots, showers, laundromats), so hide for those. */}
        {selectedSpot.kind !== 'water'
          && selectedSpot.kind !== 'shower'
          && selectedSpot.kind !== 'laundromat' && (
          <AiAssessmentSection
            aiAnalysis={aiAnalysis}
            aiAnalyzing={aiAnalyzing}
            aiCheckingCache={aiCheckingCache}
            aiError={aiError}
            onAnalyze={onAnalyze}
            onReanalyze={onReanalyze}
            onDismissError={onDismissError}
          />
        )}
      </DetailBody>

      {/* Sticky actions. Save Spot is camping-only — utility kinds (water,
          shower, laundromat) are points of interest, not bookmarkable
          campsites, so we hide the save affordance for those. */}
      <DetailActions>
        <Pill
          variant="solid-pine"
          mono={false}
          onClick={() =>
            window.open(`https://www.google.com/maps/search/?api=1&query=${selectedSpot.lat},${selectedSpot.lng}`, '_blank')
          }
          className="!w-full !justify-center"
        >
          <ArrowSquareOut className="w-3.5 h-3.5" weight="regular" />
          Open in Maps
        </Pill>
        {!['water', 'shower', 'laundromat'].includes(selectedSpot.kind ?? '') && (
          <Pill variant="ghost" mono={false} onClick={onSave} className="!w-full !justify-center">
            <CheckCircle className="w-3.5 h-3.5" weight={existingCampsiteForSpot ? 'fill' : 'regular'} />
            {existingCampsiteForSpot ? 'Saved' : 'Save spot'}
          </Pill>
        )}
      </DetailActions>
    </DetailShell>
  );
};

// === OSM tag details (camp-site spots only) ==============================
const AMENITY_LABELS: { key: string; label: string; activeIf?: (v: string) => boolean }[] = [
  { key: 'drinking_water', label: 'Drinking water' },
  { key: 'toilets', label: 'Toilets' },
  { key: 'shower', label: 'Showers' },
  { key: 'fire_pit', label: 'Fire pit' },
  { key: 'bbq', label: 'BBQ' },
  { key: 'electric_hookup', label: 'Power' },
  { key: 'internet_access', label: 'WiFi', activeIf: (v) => v !== 'no' },
];

const SUITABILITY_LABELS: { key: string; label: string }[] = [
  { key: 'tents', label: 'Tents' },
  { key: 'caravans', label: 'RVs' },
  { key: 'dogs', label: 'Dogs' },
  { key: 'wheelchair', label: 'Accessible' },
];

const isYes = (v?: string) => v === 'yes' || v === 'designated';

const OsmTagDetails = ({ tags }: { tags: Record<string, string> }) => {
  const amenities = AMENITY_LABELS.filter((a) => {
    const v = tags[a.key];
    if (!v) return false;
    return a.activeIf ? a.activeIf(v) : isYes(v);
  });
  const suitability = SUITABILITY_LABELS.filter((s) => isYes(tags[s.key]));

  const wikipediaHref = tags.wikipedia
    ? (() => {
        const m = tags.wikipedia.match(/^([a-z]{2}):(.+)$/);
        if (m) return `https://${m[1]}.wikipedia.org/wiki/${encodeURIComponent(m[2])}`;
        return `https://en.wikipedia.org/wiki/${encodeURIComponent(tags.wikipedia)}`;
      })()
    : null;

  const hasAnything =
    amenities.length > 0 || suitability.length > 0 ||
    tags.capacity || tags.fee || tags.reservation || tags.opening_hours ||
    tags.operator || tags.phone || tags.website || wikipediaHref ||
    tags.description || tags.ele;

  if (!hasAnything) return null;

  return (
    <DetailSection title="From OSM">
      {amenities.length > 0 && (
        <div className="mb-3">
          <Mono className="text-ink-3 block mb-1.5">Amenities</Mono>
          <div className="flex flex-wrap gap-1.5">
            {amenities.map((a) => (
              <DetailTag key={a.key} variant="sage">{a.label}</DetailTag>
            ))}
          </div>
        </div>
      )}

      {suitability.length > 0 && (
        <div className="mb-3">
          <Mono className="text-ink-3 block mb-1.5">Allowed</Mono>
          <div className="flex flex-wrap gap-1.5">
            {suitability.map((s) => (
              <DetailTag key={s.key} variant="water">{s.label}</DetailTag>
            ))}
          </div>
        </div>
      )}

      {(tags.capacity || tags.fee || tags.reservation || tags.opening_hours || tags.seasonal || tags.operator || tags.ele) && (
        <div>
          {tags.capacity && <DetailRow label="Capacity" value={`${tags.capacity} sites`} />}
          {tags.fee && <DetailRow label="Fee" value={tags.fee === 'yes' ? (tags['fee:amount'] || 'Yes') : 'Free'} />}
          {tags.reservation && <DetailRow label="Reservation" value={tags.reservation} />}
          {tags.opening_hours && <DetailRow label="Hours" value={tags.opening_hours} />}
          {tags.seasonal && <DetailRow label="Seasonal" value={tags.seasonal} />}
          {tags.operator && <DetailRow label="Operator" value={tags.operator} />}
          {tags.ele && <DetailRow label="Elevation" value={`${tags.ele}m`} />}
        </div>
      )}

      {(tags.phone || tags.website || wikipediaHref) && (
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-mono uppercase tracking-[0.10em] font-semibold">
          {tags.phone && (
            <a href={`tel:${tags.phone}`} className="text-pine-6 hover:text-pine-5 transition-colors">
              {tags.phone}
            </a>
          )}
          {tags.website && (
            <a href={tags.website} target="_blank" rel="noopener noreferrer" className="text-pine-6 hover:text-pine-5 transition-colors">
              Website
            </a>
          )}
          {wikipediaHref && (
            <a href={wikipediaHref} target="_blank" rel="noopener noreferrer" className="text-pine-6 hover:text-pine-5 transition-colors">
              Wikipedia
            </a>
          )}
        </div>
      )}

      {tags.description && (
        <p className="mt-3 text-[13px] text-ink-3 leading-[1.55] border-l-2 border-line pl-3">
          {tags.description}
        </p>
      )}
    </DetailSection>
  );
};
