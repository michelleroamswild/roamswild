import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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

interface SurpriseMeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Clean up duplicated suffixes like "San Juan National Forest National Forest"
function cleanRegionName(name: string): string {
  const suffixes = ['National Forest', 'National Park', 'Wilderness', 'State Park', 'Recreation Area'];
  for (const suffix of suffixes) {
    const duplicated = `${suffix} ${suffix}`;
    if (name.includes(duplicated)) {
      return name.replace(duplicated, suffix);
    }
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

// Better contrast for biome colors
const BIOME_COLORS: Record<BiomeType, string> = {
  desert: 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30',
  alpine: 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/50',
  forest: 'text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30',
  coastal: 'text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30',
  grassland: 'text-lime-700 dark:text-lime-300 bg-lime-100 dark:bg-lime-900/30',
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

  // Clear state when dialog closes
  useEffect(() => {
    if (!open) {
      clearResult();
      setNearestLocation(null);
      setShowLocationFallback(false);
      setManualLocation(null);
      setLastUsedCoords(null);
    }
  }, [open, clearResult]);

  // Reverse geocode to get nearest city/state when result changes
  useEffect(() => {
    if (!result || !googleMapsLoaded || !window.google?.maps?.Geocoder) {
      return;
    }

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode(
      { location: { lat: result.region.center.lat, lng: result.region.center.lng } },
      (results, status) => {
        if (status === 'OK' && results && results.length > 0) {
          let city: string | null = null;
          let state: string | null = null;

          // Look through results for locality and state
          for (const r of results) {
            for (const component of r.address_components) {
              if (component.types.includes('locality') && !city) {
                city = component.long_name;
              }
              if (component.types.includes('administrative_area_level_1') && !state) {
                state = component.short_name;
              }
            }
            if (city && state) break;
          }

          if (city && state) {
            setNearestLocation(`Near ${city}, ${state}`);
          } else if (state) {
            setNearestLocation(state);
          }
        }
      }
    );
  }, [result, googleMapsLoaded]);

  // Start getting surprise when dialog opens
  useEffect(() => {
    if (open && !result && !loading && !error && !showLocationFallback) {
      handleGetSurprise();
    }
  }, [open]);

  const handleGetSurprise = async () => {
    setShowLocationFallback(false);
    setGettingLocation(true);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 300000, // Cache for 5 minutes
        });
      });

      setGettingLocation(false);
      const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
      setLastUsedCoords(coords);
      await getSurprise(coords.lat, coords.lng);
    } catch (err) {
      setGettingLocation(false);
      setShowLocationFallback(true);
    }
  };

  const handleExplore = () => {
    if (result) {
      recordClick();

      // Build location state with surprise me data
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
          anchor: result.anchor ? {
            road: result.anchor.road,
            center: result.anchor.center,
            lengthMiles: result.anchor.lengthMiles,
          } : undefined,
          highlights: result.anchorHighlights?.map(h => ({
            type: h.type,
            name: h.name,
            lat: h.lat,
            lon: h.lon,
            distanceMiles: h.distanceMiles,
          })),
        },
      };

      // Close dialog and navigate to location detail
      onOpenChange(false);
      navigate(`/location/${result.region.id}`, { state: locationState });
    }
  };

  const handleUseManualLocation = async () => {
    if (!manualLocation) return;
    setShowLocationFallback(false);
    setLastUsedCoords({ lat: manualLocation.lat, lng: manualLocation.lng });
    await getSurprise(manualLocation.lat, manualLocation.lng);
  };

  const handleAnywhere = async () => {
    setShowLocationFallback(false);
    // Geographic center of the contiguous US
    const overrides = { maxDistanceMiles: 2000 };
    setLastUsedCoords({ lat: 39.83, lng: -98.58, overrides });
    await getSurprise(39.83, -98.58, overrides);
  };

  const handleTryAgain = () => {
    clearResult();
    if (lastUsedCoords) {
      getSurprise(lastUsedCoords.lat, lastUsedCoords.lng, lastUsedCoords.overrides);
    } else {
      handleGetSurprise();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="max-sm:inset-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:max-w-none max-sm:h-[100dvh] max-sm:flex max-sm:flex-col max-sm:rounded-none max-sm:border-0" onInteractOutside={(e) => { if (showLocationFallback) e.preventDefault(); }}>
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            <Shuffle className="w-5 h-5 text-primary" weight="bold" />
            Surprise Me
          </DialogTitle>
          <DialogDescription>
            {loading || gettingLocation
              ? 'Finding you an adventure...'
              : result
                ? 'We found a great spot for you!'
                : 'Discover somewhere new to explore'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 max-sm:flex-1 max-sm:overflow-y-auto">
          {/* Loading State */}
          {(loading || gettingLocation) && (
            <div className="flex flex-col items-center justify-center py-8">
              <SpinnerGap className="w-12 h-12 text-primary animate-spin" />
              <p className="mt-4 text-sm text-foreground/70">
                {gettingLocation ? 'Getting your location...' : 'Finding your surprise...'}
              </p>
            </div>
          )}

          {/* Location Fallback State */}
          {showLocationFallback && !loading && !gettingLocation && (
            <div className="flex flex-col items-center py-4 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <MapPin className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-foreground/70">
                We couldn't get your location. Search for a place or explore anywhere.
              </p>

              <div className="w-full space-y-3">
                <LocationSelector
                  value={manualLocation}
                  onChange={setManualLocation}
                  placeholder="Search for a city or place..."
                  showMyLocation={false}
                  showSavedLocations={false}
                  showCoordinates={false}
                  showClear={true}
                  compact
                />

                {manualLocation && (
                  <Button onClick={handleUseManualLocation} className="w-full">
                    Use this location
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                )}

                <div className="flex items-center gap-3">
                  <div className="flex-1 border-t border-border" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <div className="flex-1 border-t border-border" />
                </div>

                <Button onClick={handleAnywhere} className="w-full">
                  <GlobeHemisphereWest className="w-4 h-4 mr-2" />
                  Surprise me from anywhere
                </Button>
              </div>
            </div>
          )}

          {/* Error State (non-location errors) */}
          {error && !showLocationFallback && !loading && !gettingLocation && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <Warning className="w-6 h-6 text-destructive" weight="fill" />
              </div>
              <p className="text-sm text-destructive font-medium mb-2">
                {error}
              </p>
              <Button variant="outline" size="sm" onClick={handleTryAgain} className="mt-2">
                Try Again
              </Button>
            </div>
          )}

          {/* Result State */}
          {result && !loading && !gettingLocation && (
            <ResultDisplay result={result} nearestLocation={nearestLocation} />
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 max-sm:mt-auto">
          {result && !loading && (
            <>
              <Button variant="outline" onClick={handleTryAgain} className="w-full sm:w-auto">
                <Shuffle className="w-4 h-4 mr-2" />
                Try Another
              </Button>
              <Button onClick={handleExplore} className="w-full sm:w-auto">
                Explore Region
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultDisplay({ result, nearestLocation }: { result: SurpriseMeSuccessResponse; nearestLocation: string | null }) {
  const biome = result.region.primaryBiome;
  const biomeColor = biome ? BIOME_COLORS[biome] : 'text-foreground/70 bg-secondary';
  const biomeIcon = biome ? BIOME_ICONS[biome] : <MapPin className="w-5 h-5" />;
  const displayName = cleanRegionName(result.region.name);

  return (
    <div className="space-y-4">
      {/* Region Header */}
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${biomeColor}`}>
          {biomeIcon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold text-lg text-foreground truncate">
            {displayName}
          </h3>
          <div className="flex items-center gap-2 text-sm text-foreground/70">
            {nearestLocation && (
              <>
                <MapPin className="w-3.5 h-3.5" />
                <span>{nearestLocation}</span>
                {biome && <span className="text-foreground/40">•</span>}
              </>
            )}
            {biome && <span className="capitalize">{biome}</span>}
          </div>
        </div>
      </div>

      {/* Explanation */}
      <p className="text-sm text-foreground/80 leading-relaxed">
        {cleanRegionName(result.explanation)}
      </p>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary border border-border">
          <Car className="w-4 h-4 text-foreground/60" />
          <div>
            <p className="text-xs text-foreground/60">Distance</p>
            <p className="text-sm font-medium text-foreground">{Math.round(result.region.distanceMiles)} miles</p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary border border-border">
          <Path className="w-4 h-4 text-foreground/60" />
          <div>
            <p className="text-xs text-foreground/60">Drive time</p>
            <p className="text-sm font-medium text-foreground">
              {result.region.driveTimeHours
                ? `${result.region.driveTimeHours.toFixed(1)} hrs`
                : `~${Math.round(result.region.distanceMiles / 50)} hrs`}
            </p>
          </div>
        </div>
      </div>

      {/* Scenic Anchor */}
      {result.anchor && (
        <button
          onClick={() => {
            window.open(
              `https://www.google.com/maps/dir/?api=1&destination=${result.anchor!.center.lat},${result.anchor!.center.lng}`,
              '_blank'
            );
          }}
          className="w-full p-4 rounded-xl bg-card border border-border shadow-sm hover:shadow-md hover:border-primary/30 transition-all text-left"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <NavigationArrow className="w-5 h-5 text-primary" weight="fill" />
              <p className="text-sm font-semibold text-foreground">Scenic Drive</p>
            </div>
            <ArrowSquareOut className="w-4 h-4 text-foreground/50" />
          </div>
          <p className="text-sm text-foreground/80">
            {result.anchor.road.name || result.anchor.road.ref || 'Unnamed road'}
            {result.anchor.lengthMiles > 0 && (
              <span className="text-sm ml-2 text-foreground/60">
                ({result.anchor.lengthMiles.toFixed(1)} mi)
              </span>
            )}
          </p>
          {result.anchor.road.surface !== 'unknown' && (
            <p className="text-xs text-foreground/60 mt-1 capitalize">
              {result.anchor.road.surface} surface
            </p>
          )}
        </button>
      )}

      {/* Nearby Highlights */}
      {result.anchorHighlights && result.anchorHighlights.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground/60 uppercase tracking-wide">Nearby Highlights</p>
          <div className="grid grid-cols-2 gap-2">
            {result.anchorHighlights.slice(0, 4).map((highlight, i) => (
              <HighlightChip key={i} highlight={highlight} />
            ))}
          </div>
        </div>
      )}

      {/* Cautions */}
      {result.cautions && result.cautions.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700/50">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1">Heads up</p>
          <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5">
            {result.cautions.slice(0, 3).map((caution, i) => (
              <li key={i}>• {caution}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const HIGHLIGHT_ICONS: Record<ScenicAnchorHighlight['type'], React.ReactNode> = {
  viewpoint: <Binoculars className="w-3.5 h-3.5" weight="fill" />,
  trail: <Path className="w-3.5 h-3.5" weight="fill" />,
  water: <Drop className="w-3.5 h-3.5" weight="fill" />,
  camp: <Tent className="w-3.5 h-3.5" weight="fill" />,
};

// Better contrast for highlight colors
const HIGHLIGHT_COLORS: Record<ScenicAnchorHighlight['type'], string> = {
  viewpoint: 'text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/40',
  trail: 'text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/40',
  water: 'text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40',
  camp: 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40',
};

function HighlightChip({ highlight }: { highlight: ScenicAnchorHighlight }) {
  const icon = HIGHLIGHT_ICONS[highlight.type];
  const colorClass = HIGHLIGHT_COLORS[highlight.type];
  const label = highlight.name || highlight.type.charAt(0).toUpperCase() + highlight.type.slice(1);
  const isLongName = label.length > 25;

  const handleClick = () => {
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${highlight.lat},${highlight.lon}`,
      '_blank'
    );
  };

  const chipContent = (
    <button
      onClick={handleClick}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg hover:opacity-80 transition-opacity ${colorClass}`}
    >
      {icon}
      <span className={`text-xs font-medium ${isLongName ? 'truncate max-w-[150px]' : ''}`}>{label}</span>
      <ArrowSquareOut className="w-3 h-3 opacity-70 flex-shrink-0" />
    </button>
  );

  if (isLongName) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {chipContent}
        </TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return chipContent;
}
