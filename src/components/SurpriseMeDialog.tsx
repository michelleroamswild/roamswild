import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSurpriseMe } from '@/hooks/use-surprise-me';
import { useGoogleMaps } from '@/components/GoogleMapsProvider';
import { LocationSelector, SelectedLocation } from '@/components/LocationSelector';
import { SurpriseMeSuccessResponse, BiomeType, ScenicAnchorHighlight } from '@/types/surpriseMe';
import {
  Shuffle,
  MapPin,
  Path,
  Mountains,
  Tree,
  Waves,
  Sun,
  Flower,
  Warning,
  SpinnerGap,
  ArrowRight,
  Car,
  Binoculars,
  Drop,
  Tent,
  NavigationArrow,
  ArrowSquareOut,
  GlobeHemisphereWest,
} from '@phosphor-icons/react';
import { Mono, Pill } from '@/components/redesign';
import { cn } from '@/lib/utils';

interface SurpriseMeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Clean up duplicated suffixes like "San Juan National Forest National Forest"
function cleanRegionName(name: string): string {
  const suffixes = ['National Forest', 'National Park', 'Wilderness', 'State Park', 'Recreation Area'];
  for (const suffix of suffixes) {
    const duplicated = `${suffix} ${suffix}`;
    if (name.includes(duplicated)) return name.replace(duplicated, suffix);
  }
  return name;
}

const BIOME_ICONS: Record<BiomeType, React.ReactNode> = {
  desert: <Sun className="w-5 h-5" weight="fill" />,
  alpine: <Mountains className="w-5 h-5" weight="fill" />,
  forest: <Tree className="w-5 h-5" weight="fill" />,
  coastal: <Waves className="w-5 h-5" weight="fill" />,
  grassland: <Flower className="w-5 h-5" weight="fill" />,
};

// Biomes mapped to redesign accents (was rainbow palette before).
const BIOME_COLORS: Record<BiomeType, string> = {
  desert:    'bg-clay/15 text-clay',
  alpine:    'bg-water/15 text-water',
  forest:    'bg-pine-6/12 text-pine-6',
  coastal:   'bg-water/15 text-water',
  grassland: 'bg-sage/15 text-sage',
};

export function SurpriseMeDialog({ open, onOpenChange }: SurpriseMeDialogProps) {
  const navigate = useNavigate();
  const { loading, error, result, getSurprise, clearResult, recordClick } = useSurpriseMe();
  const { isLoaded: googleMapsLoaded } = useGoogleMaps();

  const [gettingLocation, setGettingLocation] = useState(false);
  const [nearestLocation, setNearestLocation] = useState<string | null>(null);
  const [showLocationFallback, setShowLocationFallback] = useState(false);
  const [manualLocation, setManualLocation] = useState<SelectedLocation | null>(null);
  const [lastUsedCoords, setLastUsedCoords] = useState<{ lat: number; lng: number; overrides?: { maxDistanceMiles?: number } } | null>(null);

  useEffect(() => {
    if (!open) {
      clearResult();
      setNearestLocation(null);
      setShowLocationFallback(false);
      setManualLocation(null);
      setLastUsedCoords(null);
    }
  }, [open, clearResult]);

  // Reverse geocode the result location to a city/state label.
  useEffect(() => {
    if (!result || !googleMapsLoaded || !window.google?.maps?.Geocoder) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode(
      { location: { lat: result.region.center.lat, lng: result.region.center.lng } },
      (results, status) => {
        if (status === 'OK' && results && results.length > 0) {
          let city: string | null = null;
          let state: string | null = null;
          for (const r of results) {
            for (const c of r.address_components) {
              if (c.types.includes('locality') && !city) city = c.long_name;
              if (c.types.includes('administrative_area_level_1') && !state) state = c.short_name;
            }
            if (city && state) break;
          }
          if (city && state) setNearestLocation(`Near ${city}, ${state}`);
          else if (state) setNearestLocation(state);
        }
      },
    );
  }, [result, googleMapsLoaded]);

  useEffect(() => {
    if (open && !result && !loading && !error && !showLocationFallback) {
      handleGetSurprise();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleGetSurprise = async () => {
    setShowLocationFallback(false);
    setGettingLocation(false);
    const overrides = { maxDistanceMiles: 2000 };
    setLastUsedCoords({ lat: 39.83, lng: -98.58, overrides });
    await getSurprise(39.83, -98.58, overrides);
  };

  const handleExplore = () => {
    if (!result) return;
    recordClick();
    const locationState = {
      placeId: `surprise-${result.region.id}`,
      name: result.region.name,
      address: result.region.tagline || `${result.region.primaryBiome} region`,
      lat: result.anchor?.center.lat ?? result.region.center.lat,
      lng: result.anchor?.center.lng ?? result.region.center.lng,
      surpriseMe: {
        regionId: result.region.id,
        explanation: result.explanation,
        distanceMiles: result.region.distanceMiles,
        driveTimeHours: result.region.driveTimeHours,
        biome: result.region.primaryBiome,
        cautions: result.cautions,
        anchor: result.anchor
          ? { road: result.anchor.road, center: result.anchor.center, lengthMiles: result.anchor.lengthMiles }
          : undefined,
        highlights: result.anchorHighlights?.map((h) => ({
          type: h.type, name: h.name, lat: h.lat, lon: h.lon, distanceMiles: h.distanceMiles,
        })),
      },
    };
    onOpenChange(false);
    navigate(`/location/${result.region.id}`, { state: locationState });
  };

  const handleUseManualLocation = async () => {
    if (!manualLocation) return;
    setShowLocationFallback(false);
    setLastUsedCoords({ lat: manualLocation.lat, lng: manualLocation.lng });
    await getSurprise(manualLocation.lat, manualLocation.lng);
  };

  const handleAnywhere = async () => {
    setShowLocationFallback(false);
    const overrides = { maxDistanceMiles: 2000 };
    setLastUsedCoords({ lat: 39.83, lng: -98.58, overrides });
    await getSurprise(39.83, -98.58, overrides);
  };

  const handleTryAgain = () => {
    clearResult();
    if (lastUsedCoords) getSurprise(lastUsedCoords.lat, lastUsedCoords.lng, lastUsedCoords.overrides);
    else handleGetSurprise();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        className="max-w-lg sm:max-h-[85vh] flex flex-col border-line bg-white rounded-[18px] max-sm:inset-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:max-w-none max-sm:h-[100dvh] max-sm:rounded-none max-sm:border-0"
        onInteractOutside={(e) => { if (showLocationFallback) e.preventDefault(); }}
      >
        <DialogHeader className="text-left shrink-0">
          <Mono className="text-pine-6 flex items-center gap-1.5">
            <Shuffle className="w-3.5 h-3.5" weight="regular" />
            Surprise me
          </Mono>
          <DialogTitle className="font-sans font-semibold tracking-[-0.015em] text-ink text-[22px] leading-[1.15] mt-1">
            {loading || gettingLocation
              ? 'Finding you an adventure…'
              : result
                ? 'A great spot for you.'
                : 'Discover somewhere new.'}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 flex-1 overflow-y-auto">
          {/* Loading */}
          {(loading || gettingLocation) && (
            <div className="flex flex-col items-center justify-center py-10">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-pine-6/10 mb-3">
                <SpinnerGap className="w-6 h-6 text-pine-6 animate-spin" />
              </div>
              <Mono className="text-pine-6">
                {gettingLocation ? 'Getting your location…' : 'Finding your surprise…'}
              </Mono>
            </div>
          )}

          {/* Location fallback */}
          {showLocationFallback && !loading && !gettingLocation && (
            <div className="flex flex-col items-center py-4 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10 text-pine-6">
                <MapPin className="w-5 h-5" weight="regular" />
              </div>
              <p className="text-[14px] text-ink-3 max-w-xs leading-[1.55]">
                We couldn't get your location. Search for a place or explore anywhere.
              </p>
              <div className="w-full space-y-3">
                <LocationSelector
                  value={manualLocation}
                  onChange={setManualLocation}
                  placeholder="Search for a city or place…"
                  showMyLocation={false}
                  showSavedLocations={false}
                  showCoordinates={false}
                  showClear
                  compact
                />
                {manualLocation && (
                  <Pill variant="solid-pine" mono={false} onClick={handleUseManualLocation} className="!w-full !justify-center">
                    Use this location
                    <ArrowRight className="w-3.5 h-3.5" weight="bold" />
                  </Pill>
                )}
                <div className="flex items-center gap-3">
                  <div className="flex-1 border-t border-line" />
                  <Mono className="text-ink-3">Or</Mono>
                  <div className="flex-1 border-t border-line" />
                </div>
                <Pill variant="ghost" mono={false} onClick={handleAnywhere} className="!w-full !justify-center">
                  <GlobeHemisphereWest className="w-3.5 h-3.5" weight="regular" />
                  Surprise me from anywhere
                </Pill>
              </div>
            </div>
          )}

          {/* Error */}
          {error && !showLocationFallback && !loading && !gettingLocation && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-ember/15 text-ember mb-3">
                <Warning className="w-6 h-6" weight="regular" />
              </div>
              <Mono className="text-ember">Couldn't find a spot</Mono>
              <p className="text-[14px] text-ink-3 mt-2 max-w-xs">{error}</p>
              <div className="mt-4">
                <Pill variant="ghost" mono={false} onClick={handleTryAgain}>
                  Try again
                </Pill>
              </div>
            </div>
          )}

          {/* Result */}
          {result && !loading && !gettingLocation && (
            <ResultDisplay result={result} nearestLocation={nearestLocation} />
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 shrink-0">
          {result && !loading && (
            <>
              <Pill variant="ghost" mono={false} onClick={handleTryAgain} className="!w-full sm:!w-auto !justify-center">
                <Shuffle className="w-3.5 h-3.5" weight="regular" />
                Try another
              </Pill>
              <Pill variant="solid-pine" mono={false} onClick={handleExplore} className="!w-full sm:!w-auto !justify-center">
                Explore region
                <ArrowRight className="w-3.5 h-3.5" weight="bold" />
              </Pill>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// === Result body ========================================================
function ResultDisplay({
  result,
  nearestLocation,
}: {
  result: SurpriseMeSuccessResponse;
  nearestLocation: string | null;
}) {
  const biome = result.region.primaryBiome;
  const biomeColor = biome ? BIOME_COLORS[biome] : 'bg-cream text-ink-3';
  const biomeIcon = biome ? BIOME_ICONS[biome] : <MapPin className="w-5 h-5" />;
  const displayName = cleanRegionName(result.region.name);

  return (
    <div className="space-y-4">
      {/* Region header */}
      <div className="flex items-start gap-3">
        <div className={cn('w-12 h-12 rounded-[12px] flex items-center justify-center flex-shrink-0', biomeColor)}>
          {biomeIcon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[18px] font-sans font-bold tracking-[-0.015em] text-ink leading-[1.15] truncate">
            {displayName}
          </h3>
          <Mono className="text-ink-3 block mt-1">
            {nearestLocation && <>{nearestLocation}{biome && ' · '}</>}
            {biome}
          </Mono>
        </div>
      </div>

      {/* Explanation */}
      <p className="text-[14px] text-ink leading-[1.55]">
        {cleanRegionName(result.explanation)}
      </p>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile Icon={Car} label="Distance" value={`${Math.round(result.region.distanceMiles)} mi`} />
        <StatTile
          Icon={Path}
          label="Drive time"
          value={
            result.region.driveTimeHours
              ? `${result.region.driveTimeHours.toFixed(1)} hrs`
              : `~${Math.round(result.region.distanceMiles / 50)} hrs`
          }
        />
      </div>

      {/* Scenic anchor */}
      {result.anchor ? (
        <button
          onClick={() => {
            window.open(
              `https://www.google.com/maps/dir/?api=1&destination=${result.anchor!.center.lat},${result.anchor!.center.lng}`,
              '_blank',
            );
          }}
          className="w-full p-4 rounded-[14px] border border-line bg-cream hover:border-pine-6 hover:bg-pine-6/[0.04] transition-all text-left animate-in fade-in duration-300"
        >
          <div className="flex items-center justify-between mb-2">
            <Mono className="text-pine-6 flex items-center gap-1.5">
              <NavigationArrow className="w-3.5 h-3.5" weight="regular" />
              Scenic drive
            </Mono>
            <ArrowSquareOut className="w-3.5 h-3.5 text-ink-3" weight="regular" />
          </div>
          <p className="text-[14px] font-sans font-semibold text-ink">
            {result.anchor.road.name || result.anchor.road.ref || 'Unnamed road'}
            {result.anchor.lengthMiles > 0 && (
              <span className="ml-2 text-ink-3 font-normal">
                ({result.anchor.lengthMiles.toFixed(1)} mi)
              </span>
            )}
          </p>
          {result.anchor.road.surface !== 'unknown' && (
            <Mono className="text-ink-3 block mt-1">{result.anchor.road.surface} surface</Mono>
          )}
        </button>
      ) : (
        <div className="w-full p-4 rounded-[14px] border border-line bg-cream">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded bg-line animate-pulse" />
            <div className="h-4 w-24 rounded bg-line animate-pulse" />
          </div>
          <div className="h-3.5 w-48 rounded bg-line animate-pulse" />
          <div className="h-3 w-20 rounded bg-line animate-pulse mt-2" />
        </div>
      )}

      {/* Highlights */}
      {result.anchorHighlights && result.anchorHighlights.length > 0 ? (
        <div className="space-y-2 animate-in fade-in duration-300">
          <Mono className="text-ink-2 block">Nearby highlights</Mono>
          <div className="grid grid-cols-2 gap-2">
            {result.anchorHighlights.slice(0, 4).map((h, i) => (
              <HighlightChip key={i} highlight={h} />
            ))}
          </div>
        </div>
      ) : !result.anchor && (
        <div className="space-y-2">
          <div className="h-3 w-28 rounded bg-line animate-pulse" />
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-9 rounded-[10px] bg-line animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {/* Cautions */}
      {result.cautions && result.cautions.length > 0 && (
        <div className="px-3 py-2.5 rounded-[12px] border border-clay/40 bg-clay/[0.08]">
          <Mono className="text-clay block">Heads up</Mono>
          <ul className="text-[13px] text-ink mt-1.5 space-y-0.5 leading-[1.5]">
            {result.cautions.slice(0, 3).map((caution, i) => (
              <li key={i}>· {caution}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const StatTile = ({
  Icon,
  label,
  value,
}: {
  Icon: typeof Car;
  label: string;
  value: string;
}) => (
  <div className="flex items-center gap-2 p-3 rounded-[12px] border border-line bg-cream">
    <Icon className="w-4 h-4 text-ink-3 flex-shrink-0" weight="regular" />
    <div className="min-w-0">
      <Mono className="text-ink-3 block">{label}</Mono>
      <p className="text-[14px] font-sans font-bold tracking-[-0.005em] text-ink mt-0.5">{value}</p>
    </div>
  </div>
);

// Highlight chip — small pill with type-accent color and external link icon.
const HIGHLIGHT_STYLES: Record<ScenicAnchorHighlight['type'], { Icon: typeof Binoculars; bg: string; text: string; border: string }> = {
  viewpoint: { Icon: Binoculars, bg: 'bg-ember/12',  text: 'text-ember',  border: 'border-ember/40' },
  trail:     { Icon: Path,       bg: 'bg-sage/15',   text: 'text-sage',   border: 'border-sage/40' },
  water:     { Icon: Drop,       bg: 'bg-water/15',  text: 'text-water',  border: 'border-water/40' },
  camp:      { Icon: Tent,       bg: 'bg-clay/15',   text: 'text-clay',   border: 'border-clay/40' },
};

function HighlightChip({ highlight }: { highlight: ScenicAnchorHighlight }) {
  const s = HIGHLIGHT_STYLES[highlight.type];
  const Icon = s.Icon;
  const label = highlight.name || highlight.type.charAt(0).toUpperCase() + highlight.type.slice(1);
  const isLong = label.length > 25;

  const handleClick = () =>
    window.open(`https://www.google.com/maps/search/?api=1&query=${highlight.lat},${highlight.lon}`, '_blank');

  const chipContent = (
    <button
      onClick={handleClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-2 rounded-[10px] border hover:opacity-80 transition-opacity',
        s.bg, s.text, s.border,
      )}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" weight="fill" />
      <span className={cn('text-[12px] font-mono uppercase tracking-[0.10em] font-semibold', isLong && 'truncate max-w-[150px]')}>
        {label}
      </span>
      <ArrowSquareOut className="w-3 h-3 opacity-70 flex-shrink-0" weight="regular" />
    </button>
  );

  if (isLong) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{chipContent}</TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    );
  }
  return chipContent;
}
