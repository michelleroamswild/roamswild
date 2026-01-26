import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSurpriseMe } from '@/hooks/use-surprise-me';
import { SurpriseMeSuccessResponse, BiomeType } from '@/types/surpriseMe';
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
} from '@phosphor-icons/react';

interface SurpriseMeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BIOME_ICONS: Record<BiomeType, React.ReactNode> = {
  desert: <Sun className="w-5 h-5" weight="fill" />,
  alpine: <Mountains className="w-5 h-5" weight="fill" />,
  forest: <Tree className="w-5 h-5" weight="fill" />,
  coastal: <Waves className="w-5 h-5" weight="fill" />,
  grassland: <Flower className="w-5 h-5" weight="fill" />,
};

const BIOME_COLORS: Record<BiomeType, string> = {
  desert: 'text-amber-500 bg-amber-500/10',
  alpine: 'text-slate-500 bg-slate-500/10',
  forest: 'text-green-600 bg-green-600/10',
  coastal: 'text-blue-500 bg-blue-500/10',
  grassland: 'text-lime-500 bg-lime-500/10',
};

export function SurpriseMeDialog({ open, onOpenChange }: SurpriseMeDialogProps) {
  const { loading, error, result, getSurprise, clearResult, recordClick } = useSurpriseMe();

  const [locationError, setLocationError] = useState<string | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  // Clear state when dialog closes
  useEffect(() => {
    if (!open) {
      clearResult();
      setLocationError(null);
    }
  }, [open, clearResult]);

  // Start getting surprise when dialog opens
  useEffect(() => {
    if (open && !result && !loading && !error && !locationError) {
      handleGetSurprise();
    }
  }, [open]);

  const handleGetSurprise = async () => {
    setLocationError(null);
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
      await getSurprise(position.coords.latitude, position.coords.longitude);
    } catch (err) {
      setGettingLocation(false);
      if (err instanceof GeolocationPositionError) {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setLocationError('Location access denied. Please enable location services.');
            break;
          case err.POSITION_UNAVAILABLE:
            setLocationError('Unable to determine your location.');
            break;
          case err.TIMEOUT:
            setLocationError('Location request timed out.');
            break;
        }
      } else {
        setLocationError('Failed to get your location.');
      }
    }
  };

  const handleExplore = () => {
    if (result) {
      recordClick();
      // Navigate to a search or explore page with the region
      // For now, we'll close the dialog - this can be enhanced later
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${result.region.center.lat},${result.region.center.lng}`,
        '_blank'
      );
    }
  };

  const handleTryAgain = () => {
    clearResult();
    handleGetSurprise();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
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

        <div className="py-4">
          {/* Loading State */}
          {(loading || gettingLocation) && (
            <div className="flex flex-col items-center justify-center py-8">
              <SpinnerGap className="w-12 h-12 text-primary animate-spin" />
              <p className="mt-4 text-sm text-muted-foreground">
                {gettingLocation ? 'Getting your location...' : 'Finding your surprise...'}
              </p>
            </div>
          )}

          {/* Error State */}
          {(error || locationError) && !loading && !gettingLocation && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <Warning className="w-6 h-6 text-destructive" weight="fill" />
              </div>
              <p className="text-sm text-destructive font-medium mb-2">
                {locationError || error}
              </p>
              <Button variant="outline" size="sm" onClick={handleTryAgain} className="mt-2">
                Try Again
              </Button>
            </div>
          )}

          {/* Result State */}
          {result && !loading && !gettingLocation && (
            <ResultDisplay result={result} />
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
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

function ResultDisplay({ result }: { result: SurpriseMeSuccessResponse }) {
  const biome = result.region.primaryBiome;
  const biomeColor = biome ? BIOME_COLORS[biome] : 'text-muted-foreground bg-muted';
  const biomeIcon = biome ? BIOME_ICONS[biome] : <MapPin className="w-5 h-5" />;

  return (
    <div className="space-y-4">
      {/* Region Header */}
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${biomeColor}`}>
          {biomeIcon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold text-lg text-foreground truncate">
            {result.region.name}
          </h3>
          {biome && (
            <p className="text-sm text-muted-foreground capitalize">{biome} region</p>
          )}
        </div>
      </div>

      {/* Explanation */}
      <p className="text-sm text-muted-foreground leading-relaxed">
        {result.explanation}
      </p>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
          <Car className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Distance</p>
            <p className="text-sm font-medium">{Math.round(result.region.distanceMiles)} miles</p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
          <Path className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Drive time</p>
            <p className="text-sm font-medium">
              {result.region.driveTimeHours
                ? `${result.region.driveTimeHours.toFixed(1)} hrs`
                : `~${Math.round(result.region.distanceMiles / 50)} hrs`}
            </p>
          </div>
        </div>
      </div>

      {/* Cautions */}
      {result.cautions && result.cautions.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p className="text-xs font-medium text-amber-600 mb-1">Heads up</p>
          <ul className="text-xs text-amber-600/80 space-y-0.5">
            {result.cautions.slice(0, 3).map((caution, i) => (
              <li key={i}>• {caution}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
