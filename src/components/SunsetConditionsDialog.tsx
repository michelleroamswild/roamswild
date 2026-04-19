import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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

interface SunsetConditionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Overall = "excellent" | "good" | "fair" | "challenging";

function overallStyles(overall: Overall) {
  switch (overall) {
    case "excellent":
      return {
        text: "text-green-700 dark:text-green-400",
        bg: "bg-green-100 dark:bg-green-900/30",
        label: "Excellent",
      };
    case "good":
      return {
        text: "text-emerald-700 dark:text-emerald-400",
        bg: "bg-emerald-100 dark:bg-emerald-900/30",
        label: "Good",
      };
    case "fair":
      return {
        text: "text-amber-700 dark:text-amber-400",
        bg: "bg-amber-100 dark:bg-amber-900/30",
        label: "Fair",
      };
    case "challenging":
      return {
        text: "text-red-700 dark:text-red-400",
        bg: "bg-red-100 dark:bg-red-900/30",
        label: "Challenging",
      };
  }
}

function impactIcon(impact: ConditionInsight["impact"]) {
  switch (impact) {
    case "positive":
      return <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" weight="fill" />;
    case "caution":
      return <Warning className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" weight="fill" />;
    case "negative":
      return <Warning className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" weight="fill" />;
    default:
      return <Info className="w-4 h-4 text-foreground/50 flex-shrink-0" />;
  }
}

export function SunsetConditionsDialog({ open, onOpenChange }: SunsetConditionsDialogProps) {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [manualLocation, setManualLocation] = useState<SelectedLocation | null>(null);

  // Try geolocation when the dialog opens
  useEffect(() => {
    if (!open) return;
    if (location || locationError || gettingLocation) return;

    setGettingLocation(true);
    getUserLocation()
      .then((loc) => {
        setLocation({ ...loc, name: loc.name ?? "Your location" });
        setGettingLocation(false);
      })
      .catch(() => {
        setLocationError("Location unavailable");
        setGettingLocation(false);
      });
  }, [open, location, locationError, gettingLocation]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setManualLocation(null);
      // Keep location/error so reopening is instant; clear only manual selector state
    }
  }, [open]);

  const { forecast, loading, error, refetch } = usePhotoWeather(
    location?.lat ?? 0,
    location?.lng ?? 0,
    0
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
    // Surface positives first, then cautions/negatives
    const score = (i: ConditionInsight) =>
      i.impact === "positive" ? 0 : i.impact === "neutral" ? 1 : i.impact === "caution" ? 2 : 3;
    return [...all].sort((a, b) => score(a) - score(b)).slice(0, 3);
  }, [conditions]);

  const handleUseManualLocation = () => {
    if (!manualLocation) return;
    setLocationError(null);
    setLocation({ lat: manualLocation.lat, lng: manualLocation.lng, name: manualLocation.name });
  };

  const showSearch = !location && locationError !== null;
  const isLoading = gettingLocation || (location !== null && loading && !forecast);

  const tempF = metrics?.temperature !== undefined ? Math.round(metrics.temperature * 9 / 5 + 32) : null;
  const windMph = metrics?.windSpeed !== undefined ? Math.round(metrics.windSpeed * 2.237) : null;
  const cloudPct = metrics?.cloudCover !== undefined ? Math.round(metrics.cloudCover) : null;
  const visibilityMi = metrics?.visibility !== undefined ? Math.round(metrics.visibility * 0.621371) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        className="max-h-[85vh] overflow-hidden flex flex-col max-sm:inset-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:max-w-none max-sm:max-h-none max-sm:h-[100dvh] max-sm:rounded-none max-sm:border-0"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SunHorizon className="w-5 h-5 text-orange-500" weight="fill" />
            Tonight's Sunset
          </DialogTitle>
          <DialogDescription>
            {location?.name
              ? `Photo conditions near ${location.name}`
              : "Photo conditions for this evening"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 -mx-6 px-6">
          {/* Loading */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <SpinnerGap className="w-12 h-12 text-orange-500 animate-spin" />
              <p className="mt-4 text-sm text-foreground/70">Reading the sky...</p>
              <p className="text-xs text-foreground/50 mt-1">Cloud cover, light & wind</p>
            </div>
          )}

          {/* Location fallback */}
          {!isLoading && showSearch && (
            <div className="flex flex-col items-center py-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <MapPin className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-foreground/70">
                We couldn't get your location. Search for a place to see tonight's sunset conditions.
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
                <Button onClick={handleUseManualLocation} disabled={!manualLocation} className="w-full">
                  Check sunset here
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Error */}
          {!isLoading && error && !showSearch && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <Warning className="w-6 h-6 text-destructive" weight="fill" />
              </div>
              <p className="text-sm text-destructive font-medium mb-2">{error}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
                Try Again
              </Button>
            </div>
          )}

          {/* Results */}
          {!isLoading && !error && forecast && conditions && (
            <div className="space-y-4">
              {/* Hero card: time + score */}
              <div className="rounded-xl border border-border bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-transparent p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-foreground/60">Sunset</p>
                    <p className="text-2xl font-display font-bold text-foreground">
                      {sunsetForecast ? formatTime(sunsetForecast.time) : formatTime(forecast.current.sunset)}
                    </p>
                  </div>
                  {sunsetForecast && (() => {
                    const styles = overallStyles(sunsetForecast.overall);
                    return (
                      <div className={`px-3 py-1.5 rounded-full text-sm font-semibold ${styles.text} ${styles.bg}`}>
                        {styles.label}
                      </div>
                    );
                  })()}
                </div>
                <p className="text-sm text-foreground/80">{conditions.headline}</p>

                {/* Golden / blue hour windows */}
                {sunsetForecast && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/70">
                    <span>
                      Golden hour{" "}
                      <span className="font-medium text-foreground">
                        {formatTimeRange({ start: sunsetForecast.goldenHourStart, end: sunsetForecast.goldenHourEnd })}
                      </span>
                    </span>
                    <span>
                      Blue hour{" "}
                      <span className="font-medium text-foreground">
                        {formatTimeRange({ start: sunsetForecast.blueHourStart, end: sunsetForecast.blueHourEnd })}
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {/* Quick metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {cloudPct !== null && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-card border border-border">
                    <Cloud className="w-5 h-5 text-sky-600 dark:text-sky-400" weight="fill" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-foreground/50">Cloud</p>
                      <p className="text-sm font-bold text-foreground leading-tight">{cloudPct}%</p>
                    </div>
                  </div>
                )}
                {windMph !== null && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-card border border-border">
                    <Wind className="w-5 h-5 text-sky-600 dark:text-sky-400" weight="fill" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-foreground/50">Wind</p>
                      <p className="text-sm font-bold text-foreground leading-tight">{windMph} mph</p>
                    </div>
                  </div>
                )}
                {visibilityMi !== null && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-card border border-border">
                    <Eye className="w-5 h-5 text-emerald-600 dark:text-emerald-400" weight="fill" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-foreground/50">Visibility</p>
                      <p className="text-sm font-bold text-foreground leading-tight">{visibilityMi} mi</p>
                    </div>
                  </div>
                )}
                {tempF !== null && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-card border border-border">
                    <Thermometer className="w-5 h-5 text-amber-600 dark:text-amber-400" weight="fill" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-foreground/50">Temp</p>
                      <p className="text-sm font-bold text-foreground leading-tight">{tempF}°F</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Top insights */}
              {topInsights.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs uppercase tracking-wide text-foreground/60 font-semibold">
                    What to expect
                  </h4>
                  <div className="space-y-2">
                    {topInsights.map((insight, i) => (
                      <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-card border border-border">
                        {impactIcon(insight.impact)}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{insight.label}</p>
                          <p className="text-xs text-foreground/70 mt-0.5">{insight.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top shot suggestion */}
              {conditions.shotSuggestions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs uppercase tracking-wide text-foreground/60 font-semibold">
                    Shoot this
                  </h4>
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
                    <Camera className="w-4 h-4 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" weight="fill" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{conditions.shotSuggestions[0].type}</p>
                      <p className="text-xs text-foreground/70 mt-0.5">{conditions.shotSuggestions[0].reason}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Confidence note */}
              <p className="text-[11px] text-foreground/50 text-center pt-1">
                Forecast confidence {Math.round(conditions.confidence)}% • Conditions can shift quickly
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
