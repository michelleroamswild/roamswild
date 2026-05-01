import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SunHorizon,
  SpinnerGap,
  Warning,
  MapPin,
  ArrowRight,
  Cloud,
  Wind,
  Eye,
  Thermometer,
  Camera,
  CheckCircle,
  Info,
} from "@phosphor-icons/react";
import { usePhotoWeather } from "@/hooks/use-photo-weather";
import { LocationSelector, SelectedLocation } from "@/components/LocationSelector";
import { formatTime, formatTimeRange } from "@/utils/sunCalc";
import { getUserLocation, type UserLocation } from "@/utils/getUserLocation";
import type { ConditionInsight } from "@/types/weather";
import { Mono, Pill } from "@/components/redesign";
import { cn } from "@/lib/utils";

interface SunsetConditionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Overall = "excellent" | "good" | "fair" | "challenging";

// Map the four sunset-quality tiers to redesign accents.
const OVERALL_STYLES: Record<Overall, { text: string; bg: string; border: string; label: string }> = {
  excellent:   { text: 'text-sage',     bg: 'bg-sage/15',     border: 'border-sage/40',     label: 'Excellent' },
  good:        { text: 'text-pine-6',   bg: 'bg-pine-6/15',   border: 'border-pine-6/40',   label: 'Good' },
  fair:        { text: 'text-clay',     bg: 'bg-clay/15',     border: 'border-clay/40',     label: 'Fair' },
  challenging: { text: 'text-ember',    bg: 'bg-ember/15',    border: 'border-ember/40',    label: 'Challenging' },
};

const ImpactIcon = ({ impact }: { impact: ConditionInsight['impact'] }) => {
  if (impact === 'positive') return <CheckCircle className="w-4 h-4 text-sage flex-shrink-0" weight="fill" />;
  if (impact === 'caution')  return <Warning className="w-4 h-4 text-clay flex-shrink-0" weight="fill" />;
  if (impact === 'negative') return <Warning className="w-4 h-4 text-ember flex-shrink-0" weight="fill" />;
  return <Info className="w-4 h-4 text-ink-3 flex-shrink-0" weight="regular" />;
};

export function SunsetConditionsDialog({ open, onOpenChange }: SunsetConditionsDialogProps) {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [manualLocation, setManualLocation] = useState<SelectedLocation | null>(null);

  useEffect(() => {
    if (!open) return;
    if (location || locationError || gettingLocation) return;
    setGettingLocation(true);
    getUserLocation()
      .then((loc) => {
        setLocation({ ...loc, name: loc.name ?? 'Your location' });
        setGettingLocation(false);
      })
      .catch(() => {
        setLocationError('Location unavailable');
        setGettingLocation(false);
      });
  }, [open, location, locationError, gettingLocation]);

  useEffect(() => {
    if (!open) setManualLocation(null);
  }, [open]);

  const { forecast, loading, error, refetch } = usePhotoWeather(
    location?.lat ?? 0,
    location?.lng ?? 0,
    0,
  );

  const sunsetForecast = forecast?.current?.conditions?.sunsetForecast ?? null;
  const conditions = forecast?.current?.conditions ?? null;
  const metrics = forecast?.current?.metrics ?? null;

  const topInsights = useMemo(() => {
    if (!conditions) return [] as ConditionInsight[];
    const all = [
      ...conditions.sky,
      ...conditions.atmosphere,
      ...conditions.precipitation,
      ...conditions.wind,
    ];
    const score = (i: ConditionInsight) =>
      i.impact === 'positive' ? 0 : i.impact === 'neutral' ? 1 : i.impact === 'caution' ? 2 : 3;
    return [...all].sort((a, b) => score(a) - score(b)).slice(0, 3);
  }, [conditions]);

  const handleUseManualLocation = () => {
    if (!manualLocation) return;
    setLocationError(null);
    setLocation({ lat: manualLocation.lat, lng: manualLocation.lng, name: manualLocation.name });
  };

  const showSearch = !location && locationError !== null;
  const isLoading = gettingLocation || (location !== null && loading && !forecast);

  const tempF = metrics?.temperature !== undefined ? Math.round((metrics.temperature * 9) / 5 + 32) : null;
  const windMph = metrics?.windSpeed !== undefined ? Math.round(metrics.windSpeed * 2.237) : null;
  const cloudPct = metrics?.cloudCover !== undefined ? Math.round(metrics.cloudCover) : null;
  const visibilityMi = metrics?.visibility !== undefined ? Math.round(metrics.visibility * 0.621371) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        className="max-h-[85vh] overflow-hidden flex flex-col border-line bg-white rounded-[18px] max-sm:inset-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:max-w-none max-sm:max-h-none max-sm:h-[100dvh] max-sm:rounded-none max-sm:border-0"
      >
        <DialogHeader>
          <Mono className="text-clay flex items-center gap-1.5">
            <SunHorizon className="w-3.5 h-3.5" weight="regular" />
            Tonight's sunset
          </Mono>
          <DialogTitle className="font-sans font-semibold tracking-[-0.015em] text-ink text-[22px] leading-[1.15] mt-1">
            {location?.name ? `Sunset near ${location.name}` : 'Photo conditions tonight'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 -mx-6 px-6">
          {/* Loading */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-clay/10 mb-3">
                <SpinnerGap className="w-6 h-6 text-clay animate-spin" />
              </div>
              <Mono className="text-clay">Reading the sky…</Mono>
              <p className="text-[12px] text-ink-3 mt-1.5">Cloud cover, light & wind</p>
            </div>
          )}

          {/* Location fallback */}
          {!isLoading && showSearch && (
            <div className="flex flex-col items-center py-6 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10 text-pine-6">
                <MapPin className="w-5 h-5" weight="regular" />
              </div>
              <p className="text-[14px] text-ink-3 max-w-xs">
                We couldn't get your location. Search for a place to see tonight's sunset conditions.
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
                <Pill
                  variant="solid-pine"
                  mono={false}
                  onClick={handleUseManualLocation}
                  className={cn('!w-full !justify-center', !manualLocation && 'opacity-50 pointer-events-none')}
                >
                  Check sunset here
                  <ArrowRight className="w-3.5 h-3.5" weight="bold" />
                </Pill>
              </div>
            </div>
          )}

          {/* Error */}
          {!isLoading && error && !showSearch && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-ember/15 text-ember mb-3">
                <Warning className="w-6 h-6" weight="regular" />
              </div>
              <Mono className="text-ember">Forecast error</Mono>
              <p className="text-[14px] text-ink-3 mt-2 max-w-xs">{error}</p>
              <div className="mt-4">
                <Pill variant="ghost" mono={false} onClick={() => refetch()}>
                  Try again
                </Pill>
              </div>
            </div>
          )}

          {/* Results */}
          {!isLoading && !error && forecast && conditions && (
            <div className="space-y-4">
              {/* Hero card — sunset time + overall tier */}
              <div className="rounded-[14px] border border-line bg-clay/[0.05] p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <Mono className="text-ink-3">Sunset</Mono>
                    <p className="text-[28px] font-sans font-bold tracking-[-0.02em] text-ink leading-[1.05] mt-1">
                      {sunsetForecast ? formatTime(sunsetForecast.time) : formatTime(forecast.current.sunset)}
                    </p>
                  </div>
                  {sunsetForecast && (() => {
                    const s = OVERALL_STYLES[sunsetForecast.overall];
                    return (
                      <span className={cn(
                        'inline-flex items-center px-3 py-1 rounded-full border text-[11px] font-mono uppercase tracking-[0.10em] font-semibold',
                        s.text, s.bg, s.border,
                      )}>
                        {s.label}
                      </span>
                    );
                  })()}
                </div>
                <p className="text-[14px] text-ink leading-[1.55]">{conditions.headline}</p>

                {/* Golden / blue hour windows */}
                {sunsetForecast && (
                  <div className="mt-4 pt-4 border-t border-line flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono uppercase tracking-[0.10em] text-ink-3">
                    <span>
                      Golden{' '}
                      <span className="text-ink">
                        {formatTimeRange({ start: sunsetForecast.goldenHourStart, end: sunsetForecast.goldenHourEnd })}
                      </span>
                    </span>
                    <span>
                      Blue{' '}
                      <span className="text-ink">
                        {formatTimeRange({ start: sunsetForecast.blueHourStart, end: sunsetForecast.blueHourEnd })}
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {/* Quick metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {cloudPct !== null && (
                  <MetricTile Icon={Cloud} accent="water" label="Cloud" value={`${cloudPct}%`} />
                )}
                {windMph !== null && (
                  <MetricTile Icon={Wind} accent="water" label="Wind" value={`${windMph} mph`} />
                )}
                {visibilityMi !== null && (
                  <MetricTile Icon={Eye} accent="sage" label="Visibility" value={`${visibilityMi} mi`} />
                )}
                {tempF !== null && (
                  <MetricTile Icon={Thermometer} accent="clay" label="Temp" value={`${tempF}°F`} />
                )}
              </div>

              {/* Top insights */}
              {topInsights.length > 0 && (
                <div className="space-y-2">
                  <Mono className="text-ink-2 block">What to expect</Mono>
                  {topInsights.map((insight, i) => (
                    <div key={i} className="flex items-start gap-2 p-3 rounded-[12px] border border-line bg-cream">
                      <ImpactIcon impact={insight.impact} />
                      <div className="min-w-0">
                        <p className="text-[14px] font-sans font-semibold text-ink">{insight.label}</p>
                        <p className="text-[12px] text-ink-3 mt-0.5 leading-[1.5]">{insight.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Top shot suggestion */}
              {conditions.shotSuggestions.length > 0 && (
                <div className="space-y-2">
                  <Mono className="text-ink-2 block">Shoot this</Mono>
                  <div className="flex items-start gap-2 p-3 rounded-[12px] border border-clay/40 bg-clay/[0.06]">
                    <Camera className="w-4 h-4 text-clay flex-shrink-0 mt-0.5" weight="fill" />
                    <div className="min-w-0">
                      <p className="text-[14px] font-sans font-semibold text-ink">{conditions.shotSuggestions[0].type}</p>
                      <p className="text-[12px] text-ink-3 mt-0.5 leading-[1.5]">{conditions.shotSuggestions[0].reason}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Confidence note */}
              <Mono className="text-ink-3 block text-center pt-1">
                Forecast confidence {Math.round(conditions.confidence)}% · Conditions can shift quickly
              </Mono>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Reusable metric tile — accent-tinted icon + mono label + sans-bold value.
const MetricTile = ({
  Icon,
  accent,
  label,
  value,
}: {
  Icon: typeof Cloud;
  accent: 'water' | 'sage' | 'clay';
  label: string;
  value: string;
}) => {
  const text =
    accent === 'water' ? 'text-water' : accent === 'sage' ? 'text-sage' : 'text-clay';
  return (
    <div className="flex items-center gap-2 p-3 rounded-[12px] border border-line bg-cream">
      <Icon className={cn('w-5 h-5 flex-shrink-0', text)} weight="fill" />
      <div className="min-w-0">
        <Mono className="text-ink-3 block">{label}</Mono>
        <p className="text-[14px] font-sans font-bold tracking-[-0.005em] text-ink leading-tight mt-0.5">
          {value}
        </p>
      </div>
    </div>
  );
};
