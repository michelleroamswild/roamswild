import {
  ArrowLeft,
  ArrowSquareOut,
  Car,
  Check,
  CheckCircle,
  Copy,
  Crosshair,
  Database,
  Jeep,
  Lightning,
  MapPinLine,
  Path,
  SpinnerGap,
  Tent,
  TreeEvergreen,
  Users,
  Warning,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { PotentialSpot } from '@/hooks/use-dispersed-roads';
import type { Campsite } from '@/types/campsite';
import type { SpotAIAnalysis } from './types';

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
  if (type === 'camp-site') return 'Known Campsite';
  if (type === 'dead-end') return 'Road Terminus';
  return 'Road Junction';
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
  const TypeIcon = selectedSpot.type === 'camp-site' ? Tent : selectedSpot.type === 'dead-end' ? MapPinLine : Path;
  const typeColor = selectedSpot.type === 'camp-site' ? 'text-wildviolet bg-wildviolet/10' : selectedSpot.type === 'dead-end' ? 'text-orange-600 bg-orange-500/10' : 'text-blue-600 bg-blue-500/10';

  // Consolidated tags (site-type tag is rendered separately under the title)
  const tags: { label: React.ReactNode; className: string; key: string }[] = [];
  if (selectedSpot.isOnMVUMRoad) tags.push({ key: 'mvum', label: 'USFS MVUM', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' });
  if (selectedSpot.isOnBLMRoad) tags.push({ key: 'blm', label: 'BLM', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' });
  if (selectedSpot.isOnPublicLand && !selectedSpot.isOnMVUMRoad && !selectedSpot.isOnBLMRoad) {
    tags.push({ key: 'public', label: 'Public Land', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' });
  }
  if (selectedSpot.passengerReachable) {
    tags.push({ key: 'pass', label: <><Car className="w-3 h-3" /> Passenger</>, className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' });
  }
  if (selectedSpot.highClearanceReachable && !selectedSpot.passengerReachable) {
    tags.push({ key: 'hc', label: <><Jeep className="w-3 h-3" /> High Clearance</>, className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' });
  }
  if (selectedSpot.roadName) {
    tags.push({ key: 'road', label: selectedSpot.roadName, className: 'bg-muted text-muted-foreground' });
  }
  selectedSpot.reasons.forEach((reason, i) => {
    // Skip reasons that duplicate the structured tags above
    if (reason.toLowerCase() === 'on public land') return;
    tags.push({ key: `reason-${i}`, label: reason, className: 'bg-primary/10 text-primary' });
  });

  return (
    <div className="h-full flex flex-col">
      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-5">
        {/* Back nav */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to results
        </button>

        {/* Hero: icon + (name/type on left, coords/actions on right) */}
        <div className="flex items-start gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${typeColor}`}>
            <TypeIcon className="w-6 h-6" weight={selectedSpot.type === 'dead-end' ? 'fill' : 'regular'} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold leading-tight text-foreground">
                  {selectedSpot.name || 'Unnamed Spot'}
                </h2>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {selectedSpot.source === 'derived' && (
                    <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                      Derived site
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {typeLabel(selectedSpot.type)}
                  </span>
                  {fromDatabase && (
                    <span
                      title="Loaded from database cache"
                      className="inline-flex items-center text-muted-foreground"
                    >
                      <Database className="w-3.5 h-3.5" weight="fill" />
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <span className="text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                  {selectedSpot.lat.toFixed(4)}, {selectedSpot.lng.toFixed(4)}
                </span>
                <button
                  onClick={onCopyCoords}
                  className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  title="Copy coordinates"
                >
                  {copiedCoords ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Community confirmations */}
        {existingCampsiteForSpot && (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 text-green-700 dark:text-green-300 rounded-lg border border-green-500/20">
            <Users className="w-4 h-4 shrink-0" />
            <span className="text-sm font-medium">{existingCampsiteForSpot.confirmationCount} confirmed</span>
            {existingCampsiteForSpot.isConfirmed && (
              <span className="flex items-center gap-1 text-xs ml-auto">
                <CheckCircle className="w-3.5 h-3.5" /> Verified
              </span>
            )}
          </div>
        )}

        {/* Consolidated tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag.key}
                className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 ${tag.className}`}
              >
                {tag.label}
              </span>
            ))}
          </div>
        )}

        {/* Public-land entity */}
        {selectedSpot.landName && (
          <div className="flex items-start gap-2.5 px-3 py-2.5 bg-emerald-500/5 rounded-lg border border-emerald-500/20">
            <TreeEvergreen className="w-4 h-4 text-emerald-700 dark:text-emerald-300 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground leading-tight">{selectedSpot.landName}</p>
              {(selectedSpot.landProtectionTitle || selectedSpot.landProtectClass) && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedSpot.landProtectionTitle}
                  {selectedSpot.landProtectionTitle && selectedSpot.landProtectClass && ' · '}
                  {selectedSpot.landProtectClass && `IUCN ${selectedSpot.landProtectClass}`}
                </p>
              )}
            </div>
          </div>
        )}

        {/* OSM tag details */}
        {selectedSpot.osmTags && <OsmTagDetails tags={selectedSpot.osmTags} />}

        {/* AI Analysis */}
        <div className="pt-3 border-t border-border">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">AI Assessment</p>

          {aiCheckingCache && !aiAnalysis && (
            <div className="flex items-center gap-2 py-3 text-muted-foreground">
              <SpinnerGap className="w-4 h-4 animate-spin" />
              <span className="text-sm">Checking for cached analysis...</span>
            </div>
          )}

          {!aiCheckingCache && !aiAnalysis && !aiAnalyzing && !aiError && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Get an AI-powered assessment of this spot's campability from satellite imagery.
              </p>
              <Button variant="outline" size="sm" className="w-full" onClick={onAnalyze}>
                <Lightning className="w-4 h-4 mr-1.5" weight="fill" />
                Analyze
              </Button>
            </div>
          )}

          {aiAnalyzing && !aiAnalysis && (
            <div className="flex flex-col items-center py-6 text-muted-foreground">
              <SpinnerGap className="w-6 h-6 animate-spin mb-2" />
              <span className="text-sm">Analyzing satellite imagery...</span>
            </div>
          )}

          {aiError && (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{aiError}</p>
              <Button variant="outline" size="sm" className="w-full" onClick={onDismissError}>Retry</Button>
            </div>
          )}

            {aiAnalysis && (
              <div className="space-y-3">
                {/* Big score card */}
                <div className={`p-4 rounded-xl border-2 ${
                  aiAnalysis.campabilityScore >= 70 ? 'border-green-300 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 dark:border-green-700' :
                    aiAnalysis.campabilityScore >= 50 ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 dark:border-amber-700' :
                      aiAnalysis.campabilityScore >= 30 ? 'border-orange-300 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 dark:border-orange-700' :
                        'border-red-300 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 dark:border-red-700'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-white font-bold text-2xl shrink-0 ${
                      aiAnalysis.campabilityScore >= 70 ? 'bg-green-500' : aiAnalysis.campabilityScore >= 50 ? 'bg-amber-500' : aiAnalysis.campabilityScore >= 30 ? 'bg-orange-500' : 'bg-red-500'
                    }`}>{aiAnalysis.campabilityScore}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold">
                        {aiAnalysis.campabilityScore >= 70 ? 'Great Campsite' : aiAnalysis.campabilityScore >= 50 ? 'Decent Spot' : aiAnalysis.campabilityScore >= 30 ? 'Marginal' : 'Not Recommended'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 capitalize">{aiAnalysis.confidence} confidence</p>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed mt-3">{aiAnalysis.summary}</p>
                </div>

                {/* Factor grid */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Ground', icon: <Crosshair className="w-3.5 h-3.5" />, data: aiAnalysis.ground },
                    { label: 'Access', icon: <Path className="w-3.5 h-3.5" />, data: aiAnalysis.access },
                    { label: 'Cover', icon: <TreeEvergreen className="w-3.5 h-3.5" />, data: aiAnalysis.cover },
                    { label: 'Hazards', icon: <Warning className="w-3.5 h-3.5" />, data: aiAnalysis.hazards },
                  ].map(({ label, icon, data }) => (
                    <div key={label} className={`p-2.5 rounded-lg ${
                      data.rating === 'good' || data.rating === 'none' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' :
                        data.rating === 'fair' || data.rating === 'minor' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' :
                          data.rating === 'poor' || data.rating === 'moderate' || data.rating === 'significant' ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' :
                            'bg-muted text-muted-foreground'
                    }`}>
                      <div className="flex items-center gap-1 mb-1">
                        {icon}
                        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
                        <span className="text-[10px] font-medium ml-auto capitalize opacity-70">{data.rating}</span>
                      </div>
                      <p className="text-xs leading-snug">{data.detail}</p>
                    </div>
                  ))}
                </div>

                {/* Trail */}
                {aiAnalysis.trail && (
                  <div className={`p-2.5 rounded-lg ${
                    aiAnalysis.trail.rating === 'easy' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' :
                      aiAnalysis.trail.rating === 'moderate' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' :
                        aiAnalysis.trail.rating === 'difficult' || aiAnalysis.trail.rating === 'extreme' ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' :
                          'bg-muted text-muted-foreground'
                  }`}>
                    <div className="flex items-center gap-1 mb-1">
                      <Path className="w-3.5 h-3.5" />
                      <span className="text-xs font-semibold uppercase tracking-wide">Trail</span>
                      <span className="text-[10px] font-medium ml-auto capitalize opacity-70">{aiAnalysis.trail.rating}</span>
                    </div>
                    <p className="text-xs leading-snug">{aiAnalysis.trail.detail}</p>
                  </div>
                )}

                {/* Best use */}
                <div className="flex items-center gap-2.5 px-3 py-2.5 bg-primary/5 rounded-lg border border-primary/10">
                  <Tent className="w-4 h-4 text-primary shrink-0" />
                  <p className="text-sm font-medium">{aiAnalysis.bestUse}</p>
                </div>

                <Button variant="ghost" size="sm" className="w-full" onClick={onReanalyze}>Re-analyze</Button>
              </div>
            )}
          </div>
      </div>

      {/* Fixed bottom actions */}
      <div className="shrink-0 border-t border-border bg-background p-3 sm:p-4 md:p-6 space-y-2">
        <Button
          variant="primary"
          size="sm"
          className="w-full"
          onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${selectedSpot.lat},${selectedSpot.lng}`, '_blank')}
        >
          <ArrowSquareOut className="w-4 h-4 mr-1.5" />
          Open in Maps
        </Button>
        <Button variant="outline" size="sm" className="w-full" onClick={onConfirm}>
          <CheckCircle className="w-4 h-4 mr-1.5" />
          {existingCampsiteForSpot ? 'Confirmed' : 'Confirm'}
        </Button>
      </div>
    </div>
  );
};

// OSM tag details — surfaces every useful key from potential_spots.osm_tags
// for camp-sites that came from OSM tourism=camp_site/camp_pitch/caravan_site.
// Designed verbose so we can see what's actually present in the data and
// curate the UX later.
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

interface OsmTagDetailsProps {
  tags: Record<string, string>;
}

const OsmTagDetails = ({ tags }: OsmTagDetailsProps) => {
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
    amenities.length > 0 ||
    suitability.length > 0 ||
    tags.capacity ||
    tags.fee ||
    tags.reservation ||
    tags.opening_hours ||
    tags.operator ||
    tags.phone ||
    tags.website ||
    wikipediaHref ||
    tags.description ||
    tags.ele;

  if (!hasAnything) return null;

  return (
    <div className="pt-3 border-t border-border space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">From OSM</p>

      {amenities.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Amenities</p>
          <div className="flex flex-wrap gap-1.5">
            {amenities.map((a) => (
              <span key={a.key} className="px-2 py-1 rounded-md text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                {a.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {suitability.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Allowed</p>
          <div className="flex flex-wrap gap-1.5">
            {suitability.map((s) => (
              <span key={s.key} className="px-2 py-1 rounded-md text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                {s.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1 text-sm">
        {tags.capacity && (
          <DetailRow label="Capacity" value={`${tags.capacity} sites`} />
        )}
        {tags.fee && (
          <DetailRow
            label="Fee"
            value={tags.fee === 'yes' ? (tags['fee:amount'] || 'Yes') : 'Free'}
          />
        )}
        {tags.reservation && <DetailRow label="Reservation" value={tags.reservation} />}
        {tags.opening_hours && <DetailRow label="Hours" value={tags.opening_hours} />}
        {tags.seasonal && <DetailRow label="Seasonal" value={tags.seasonal} />}
        {tags.operator && <DetailRow label="Operator" value={tags.operator} />}
        {tags.ele && <DetailRow label="Elevation" value={`${tags.ele}m`} />}
      </div>

      {(tags.phone || tags.website || wikipediaHref) && (
        <div className="flex flex-wrap gap-3 text-xs">
          {tags.phone && (
            <a href={`tel:${tags.phone}`} className="text-primary hover:underline">
              {tags.phone}
            </a>
          )}
          {tags.website && (
            <a href={tags.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              Website
            </a>
          )}
          {wikipediaHref && (
            <a href={wikipediaHref} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              Wikipedia
            </a>
          )}
        </div>
      )}

      {tags.description && (
        <p className="text-sm text-muted-foreground leading-relaxed border-l-2 border-border pl-3">
          {tags.description}
        </p>
      )}
    </div>
  );
};

interface DetailRowProps {
  label: string;
  value: string;
}

const DetailRow = ({ label, value }: DetailRowProps) => (
  <div className="flex justify-between gap-3">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-foreground text-right">{value}</span>
  </div>
);
