import { ReactNode } from 'react';
import {
  ArrowSquareOut,
  Car,
  CheckCircle,
  Crosshair,
  Database,
  Jeep,
  MapPinLine,
  Path,
  Sparkle,
  SpinnerGap,
  Tent,
  TreeEvergreen,
  Users,
  Warning,
} from '@phosphor-icons/react';
import { PotentialSpot } from '@/hooks/use-dispersed-roads';
import { useSpotNaipImage } from '@/hooks/use-spot-naip-image';
import type { Campsite } from '@/types/campsite';
import type { SpotAIAnalysis } from './types';
import { Mono, Pill } from '@/components/redesign';
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
  onConfirm: () => void;
}

const typeLabel = (type: PotentialSpot['type']) => {
  if (type === 'camp-site') return 'Known campsite';
  if (type === 'dead-end') return 'Road terminus';
  return 'Road junction';
};

// Map spot type → icon + accent. Keeps the hero block on each spot type
// visually consistent with the rest of the redesign (sage/clay/water/pine).
const typeStyle = (type: PotentialSpot['type']) => {
  if (type === 'camp-site') return { Icon: Tent,        bg: 'bg-pin-safe/15',     text: 'text-pin-safe' };
  if (type === 'dead-end')  return { Icon: MapPinLine,  bg: 'bg-pin-moderate/15', text: 'text-pin-moderate' };
  return                            { Icon: Path,        bg: 'bg-pin-easy/15',     text: 'text-pin-easy' };
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
  onConfirm,
}: SpotDetailPanelProps) => {
  const { Icon, bg, text } = typeStyle(selectedSpot.type);
  const { image: naipImage, loading: naipLoading } = useSpotNaipImage(selectedSpot.lat, selectedSpot.lng);
  const naipYear = naipImage?.taken_at ? new Date(naipImage.taken_at).getFullYear() : null;

  // Consolidated tags (excluding the source/derived flag — that lives in the
  // hero badge slot). Maps land/road flags to the redesign accent palette.
  const tags: { key: string; label: ReactNode; variant: Parameters<typeof DetailTag>[0]['variant'] }[] = [];
  if (selectedSpot.isOnMVUMRoad) tags.push({ key: 'mvum', variant: 'sage', label: 'USFS MVUM' });
  if (selectedSpot.isOnBLMRoad)  tags.push({ key: 'blm', variant: 'clay', label: 'BLM' });
  if (selectedSpot.isOnPublicLand && !selectedSpot.isOnMVUMRoad && !selectedSpot.isOnBLMRoad) {
    tags.push({ key: 'public', variant: 'sage', label: 'Public land' });
  }
  if (selectedSpot.passengerReachable) {
    tags.push({ key: 'pass', variant: 'pine', label: <><Car className="w-3 h-3" weight="regular" /> Passenger</> });
  }
  if (selectedSpot.highClearanceReachable && !selectedSpot.passengerReachable) {
    tags.push({ key: 'hc', variant: 'clay', label: <><Jeep className="w-3 h-3" weight="regular" /> High clearance</> });
  }
  if (selectedSpot.roadName) tags.push({ key: 'road', variant: 'ghost', label: selectedSpot.roadName });
  selectedSpot.reasons.forEach((reason, i) => {
    if (reason.toLowerCase() === 'on public land') return;
    tags.push({ key: `reason-${i}`, variant: 'ghost', label: reason });
  });

  return (
    <DetailShell>
      <DetailBody>
        {/* Top bar — back link + cache indicator */}
        <div className="px-[18px] py-3 border-b border-line flex items-center justify-between">
          <BackLink onBack={onBack} />
          {fromDatabase && (
            <Mono className="text-ink-3 inline-flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" weight="regular" />
              Cached
            </Mono>
          )}
        </div>

        {/* NAIP aerial — full-width hero strip when available */}
        {(naipLoading || naipImage) && (
          <div className="relative aspect-[4/3] bg-paper-2 overflow-hidden border-b border-line">
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
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-ink/80 text-cream text-[10px] font-mono uppercase tracking-[0.10em] font-semibold">
                  NAIP{naipYear ? ` · ${naipYear}` : ''}
                </div>
              </>
            )}
          </div>
        )}

        {/* Hero — type-colored icon, eyebrow, name, source badge */}
        <DetailSection title={typeLabel(selectedSpot.type)} first>
          <DetailHero
            Icon={Icon}
            iconBg={bg}
            iconText={text}
            title={selectedSpot.name || 'Unnamed spot'}
            badge={
              selectedSpot.source === 'derived' ? (
                <DetailTag variant="clay">Derived</DetailTag>
              ) : undefined
            }
          />
        </DetailSection>

        {/* Coords */}
        <DetailSection title="Coordinates">
          <CoordsStrip
            lat={selectedSpot.lat}
            lng={selectedSpot.lng}
            copied={copiedCoords}
            onCopy={onCopyCoords}
          />
        </DetailSection>

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

        {/* Tag cloud */}
        {tags.length > 0 && (
          <DetailSection title="Signals">
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <DetailTag key={t.key} variant={t.variant}>
                  {t.label}
                </DetailTag>
              ))}
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

        {/* AI Analysis */}
        <DetailSection title="AI assessment">
          {aiCheckingCache && !aiAnalysis && (
            <div className="flex items-center gap-2 py-2 text-ink-3">
              <SpinnerGap className="w-4 h-4 animate-spin" />
              <span className="text-[13px]">Checking for cached analysis…</span>
            </div>
          )}

          {!aiCheckingCache && !aiAnalysis && !aiAnalyzing && !aiError && (
            <div className="space-y-3">
              <p className="text-[13px] text-ink-3 leading-[1.55]">
                Get an AI-powered assessment of this spot's campability from satellite imagery.
              </p>
              <Pill variant="solid-pine" mono={false} onClick={onAnalyze} className="!w-full !justify-center">
                <Sparkle className="w-4 h-4" weight="fill" />
                Analyze
              </Pill>
            </div>
          )}

          {aiAnalyzing && !aiAnalysis && (
            <div className="flex flex-col items-center py-5 gap-2">
              <SpinnerGap className="w-5 h-5 animate-spin text-pine-6" />
              <Mono className="text-pine-6">Analyzing satellite imagery…</Mono>
            </div>
          )}

          {aiError && (
            <div className="space-y-2">
              <p className="text-[13px] text-ember">{aiError}</p>
              <Pill variant="ghost" sm mono={false} onClick={onDismissError} className="!w-full !justify-center">
                Retry
              </Pill>
            </div>
          )}

          {aiAnalysis && (
            <div className="space-y-3">
              {/* Score card — accent based on overall campability */}
              <AiScoreCard analysis={aiAnalysis} />

              {/* Factor grid */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Ground',  Icon: Crosshair,    data: aiAnalysis.ground },
                  { label: 'Access',  Icon: Path,         data: aiAnalysis.access },
                  { label: 'Cover',   Icon: TreeEvergreen, data: aiAnalysis.cover },
                  { label: 'Hazards', Icon: Warning,      data: aiAnalysis.hazards },
                ].map(({ label, Icon: FIcon, data }) => (
                  <FactorTile key={label} label={label} Icon={FIcon} data={data} />
                ))}
              </div>

              {/* Trail */}
              {aiAnalysis.trail && (
                <FactorTile label="Trail" Icon={Path} data={aiAnalysis.trail} />
              )}

              {/* Best use */}
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] border border-pine-6/30 bg-pine-6/[0.06]">
                <Tent className="w-4 h-4 text-pine-6 flex-shrink-0" weight="regular" />
                <p className="text-[13px] font-sans font-semibold text-ink">{aiAnalysis.bestUse}</p>
              </div>

              <Pill variant="ghost" sm mono={false} onClick={onReanalyze} className="!w-full !justify-center">
                Re-analyze
              </Pill>
            </div>
          )}
        </DetailSection>
      </DetailBody>

      {/* Sticky actions */}
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
        <Pill variant="ghost" mono={false} onClick={onConfirm} className="!w-full !justify-center">
          <CheckCircle className="w-3.5 h-3.5" weight={existingCampsiteForSpot ? 'fill' : 'regular'} />
          {existingCampsiteForSpot ? 'Confirmed' : 'Confirm spot'}
        </Pill>
      </DetailActions>
    </DetailShell>
  );
};

// === AI score card ========================================================
const SCORE_TIERS = [
  { min: 70, label: 'Great campsite',   bg: 'bg-pin-safe/[0.10]',     border: 'border-pin-safe/40',     pill: 'bg-pin-safe' },
  { min: 50, label: 'Decent spot',      bg: 'bg-pin-easy/[0.10]',     border: 'border-pin-easy/40',     pill: 'bg-pin-easy' },
  { min: 30, label: 'Marginal',         bg: 'bg-pin-moderate/[0.10]', border: 'border-pin-moderate/40', pill: 'bg-pin-moderate' },
  { min: 0,  label: 'Not recommended',  bg: 'bg-ember/[0.08]',        border: 'border-ember/40',        pill: 'bg-ember' },
];

const AiScoreCard = ({ analysis }: { analysis: SpotAIAnalysis }) => {
  const tier = SCORE_TIERS.find((t) => analysis.campabilityScore >= t.min) ?? SCORE_TIERS[SCORE_TIERS.length - 1];
  return (
    <div className={cn('p-4 rounded-[12px] border', tier.bg, tier.border)}>
      <div className="flex items-center gap-3">
        <div className={cn('w-14 h-14 rounded-[10px] flex items-center justify-center text-cream font-sans font-bold text-[22px] tracking-[-0.02em] flex-shrink-0', tier.pill)}>
          {analysis.campabilityScore}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink">{tier.label}</p>
          <Mono className="text-ink-3 block mt-0.5">{analysis.confidence} confidence</Mono>
        </div>
      </div>
      <p className="text-[13px] text-ink leading-[1.55] mt-3">{analysis.summary}</p>
    </div>
  );
};

// === Factor tile (Ground/Access/Cover/Hazards/Trail) =====================
type FactorRating = string;
type FactorData = { rating: FactorRating; detail: string };

// Maps a rating string → an accent. Pine (good), clay (fair), ember (bad).
const ratingAccent = (rating: FactorRating): { bg: string; text: string } => {
  if (['good', 'none', 'easy'].includes(rating))                               return { bg: 'bg-pin-safe/15',     text: 'text-pin-safe' };
  if (['fair', 'minor', 'moderate'].includes(rating))                          return { bg: 'bg-pin-easy/15',     text: 'text-pin-easy' };
  if (['poor', 'significant', 'difficult'].includes(rating))                   return { bg: 'bg-pin-moderate/15', text: 'text-pin-moderate' };
  if (['extreme'].includes(rating))                                            return { bg: 'bg-ember/15',        text: 'text-ember' };
  return                                                                              { bg: 'bg-paper-2',         text: 'text-ink-3' };
};

const FactorTile = ({
  label,
  Icon,
  data,
}: {
  label: string;
  Icon: typeof Path;
  data: FactorData;
}) => {
  const { bg, text } = ratingAccent(data.rating);
  return (
    <div className={cn('p-2.5 rounded-[10px]', bg)}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn('w-3.5 h-3.5', text)} weight="regular" />
        <Mono className={text}>{label}</Mono>
        <Mono className={cn('ml-auto opacity-70', text)}>{data.rating}</Mono>
      </div>
      <p className={cn('text-[12px] leading-snug', text)}>{data.detail}</p>
    </div>
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
