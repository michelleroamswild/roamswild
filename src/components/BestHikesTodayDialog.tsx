/**
 * Best Hikes Today Dialog
 *
 * Shows the top-scored hikes near the user for today,
 * with weather-aware recommendations and explanations.
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Compass,
  SpinnerGap,
  Warning,
  Boot,
  Mountains,
  ArrowSquareOut,
  Star,
  NavigationArrow,
  Sun,
  Cloud,
  CheckCircle,
  Info,
  MapPin,
  ArrowRight,
} from "@phosphor-icons/react";
import { useBestHikesToday } from "@/hooks/use-best-hikes-today";
import { LocationSelector, SelectedLocation } from "@/components/LocationSelector";
import { ScoredHike } from "@/scoring";
import { Mono, Pill } from "@/components/redesign";
import { cn } from "@/lib/utils";

interface BestHikesTodayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Tier the score → pin-* accent so the badge matches the rest of the system.
const scoreTier = (score: number): { text: string; bg: string; border: string } => {
  if (score >= 80) return { text: 'text-pin-safe',     bg: 'bg-pin-safe/15',     border: 'border-pin-safe/40' };
  if (score >= 60) return { text: 'text-pin-easy',     bg: 'bg-pin-easy/15',     border: 'border-pin-easy/40' };
  return                  { text: 'text-pin-moderate', bg: 'bg-pin-moderate/15', border: 'border-pin-moderate/40' };
};

const HikeCard = ({ scoredHike, rank }: { scoredHike: ScoredHike; rank: number }) => {
  const { hike, score_0_100, reasons_short, warnings, breakdown } = scoredHike;
  const tier = scoreTier(score_0_100);

  const handleOpenInMaps = () =>
    window.open(`https://www.google.com/maps/search/?api=1&query=${hike.location.lat},${hike.location.lng}`, '_blank');
  const handleGetDirections = () =>
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${hike.location.lat},${hike.location.lng}`, '_blank');

  return (
    <div className="p-4 rounded-[14px] border border-line bg-white">
      {/* Header — rank, name, distance/elevation, score */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-pine-6/10 text-pine-6 font-mono font-bold text-[12px] flex-shrink-0">
            {rank}
          </div>
          <div className="min-w-0">
            <h4 className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink truncate">
              {hike.name}
            </h4>
            <Mono className="text-ink-3 block mt-0.5">
              {hike.distance_miles} mi · {hike.elevation_gain_ft.toLocaleString()} ft gain
            </Mono>
          </div>
        </div>
        <span className={cn(
          'inline-flex items-center px-2.5 py-1 rounded-full border text-[12px] font-mono font-bold tracking-[0.05em]',
          tier.text, tier.bg, tier.border,
        )}>
          {score_0_100}
        </span>
      </div>

      {/* Why-today reasons */}
      <div className="space-y-1.5 mb-3">
        {reasons_short.slice(0, 3).map((reason, i) => (
          <div key={i} className="flex items-center gap-2 text-[13px] text-ink">
            <CheckCircle className="w-3.5 h-3.5 text-sage flex-shrink-0" weight="fill" />
            <span>{reason}</span>
          </div>
        ))}
      </div>

      {/* Warnings */}
      {warnings && warnings.length > 0 && (
        <div className="mb-3 px-3 py-2 rounded-[10px] border border-clay/30 bg-clay/10">
          {warnings.slice(0, 2).map((warning, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[12px] text-clay">
              <Warning className="w-3 h-3 flex-shrink-0" weight="fill" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      {/* Score breakdown — collapsible */}
      <details className="mb-3 group">
        <summary className="cursor-pointer text-[11px] font-mono uppercase tracking-[0.10em] font-semibold text-ink-3 hover:text-ink transition-colors flex items-center gap-1 list-none">
          <Info className="w-3 h-3" weight="regular" />
          Score breakdown
        </summary>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] font-mono uppercase tracking-[0.08em] text-ink-3">
          <BreakdownStat Icon={Sun}       label="Weather"    value={Math.round(breakdown.weather * 100)} />
          <BreakdownStat Icon={Boot}      label="Conditions" value={Math.round(breakdown.conditions * 100)} />
          <BreakdownStat Icon={Cloud}     label="Light"      value={Math.round(breakdown.light * 100)} />
          <BreakdownStat Icon={Mountains} label="Effort"     value={Math.round(breakdown.effort_match * 100)} />
          <BreakdownStat Icon={Star}      label="Crowd"      value={Math.round(breakdown.crowd * 100)} />
          {breakdown.penalties < 1 && (
            <BreakdownStat Icon={Warning} label="Penalty" value={Math.round(breakdown.penalties * 100)} accent="text-clay" />
          )}
        </div>
      </details>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Pill variant="solid-pine" mono={false} onClick={handleGetDirections} className="!flex-1 !justify-center">
          <NavigationArrow className="w-3.5 h-3.5" weight="regular" />
          Directions
        </Pill>
        <Pill variant="ghost" mono={false} onClick={handleOpenInMaps}>
          <ArrowSquareOut className="w-3.5 h-3.5" weight="regular" />
        </Pill>
      </div>
    </div>
  );
};

const BreakdownStat = ({
  Icon,
  label,
  value,
  accent,
}: {
  Icon: typeof Sun;
  label: string;
  value: number;
  accent?: string;
}) => (
  <div className={cn('flex items-center gap-1', accent)}>
    <Icon className="w-3 h-3" weight="regular" />
    <span>{label} {value}%</span>
  </div>
);

export function BestHikesTodayDialog({ open, onOpenChange }: BestHikesTodayDialogProps) {
  const { scoredHikes, loading, error, locationError, fetchBestHikes, clearResults } = useBestHikesToday();
  const [manualLocation, setManualLocation] = useState<SelectedLocation | null>(null);

  useEffect(() => {
    if (open && scoredHikes.length === 0 && !loading && !error && !locationError) {
      fetchBestHikes();
    }
  }, [open, scoredHikes.length, loading, error, locationError, fetchBestHikes]);

  useEffect(() => {
    if (!open) {
      clearResults();
      setManualLocation(null);
    }
  }, [open, clearResults]);

  const handleUseManualLocation = () => {
    if (!manualLocation) return;
    clearResults();
    fetchBestHikes({ lat: manualLocation.lat, lng: manualLocation.lng });
  };

  const handleTryAgain = () => {
    clearResults();
    fetchBestHikes();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        className="max-h-[85vh] overflow-hidden flex flex-col border-line bg-white rounded-[18px] max-sm:inset-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:max-w-none max-sm:max-h-none max-sm:h-[100dvh] max-sm:rounded-none max-sm:border-0"
        onInteractOutside={(e) => { if (locationError) e.preventDefault(); }}
      >
        <DialogHeader>
          <Mono className="text-pine-6 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5" weight="regular" />
            Best hikes today
          </Mono>
          <DialogTitle className="font-sans font-semibold tracking-[-0.015em] text-ink text-[22px] leading-[1.15] mt-1">
            {loading
              ? 'Finding the best trails…'
              : scoredHikes.length > 0
                ? `Top ${Math.min(5, scoredHikes.length)} hikes for today`
                : 'Best hiking trails near you'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 -mx-6 px-6">
          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-pine-6/10 mb-3">
                <SpinnerGap className="w-6 h-6 text-pine-6 animate-spin" />
              </div>
              <Mono className="text-pine-6">Analyzing trails near you…</Mono>
              <p className="text-[12px] text-ink-3 mt-1.5">Weather, conditions, light</p>
            </div>
          )}

          {/* Location fallback */}
          {locationError && !loading && (
            <div className="flex flex-col items-center py-6 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10 text-pine-6">
                <MapPin className="w-5 h-5" weight="regular" />
              </div>
              <p className="text-[14px] text-ink-3 max-w-xs">
                We couldn't get your location. Search for a place to find nearby hikes.
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
                  Find hikes near here
                  <ArrowRight className="w-3.5 h-3.5" weight="bold" />
                </Pill>
              </div>
            </div>
          )}

          {/* Error */}
          {error && !locationError && !loading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-ember/15 text-ember mb-3">
                <Warning className="w-6 h-6" weight="regular" />
              </div>
              <Mono className="text-ember">Couldn't load trails</Mono>
              <p className="text-[14px] text-ink-3 mt-2 max-w-xs">{error}</p>
              <div className="mt-4">
                <Pill variant="ghost" mono={false} onClick={handleTryAgain}>
                  Try again
                </Pill>
              </div>
            </div>
          )}

          {/* Results */}
          {!loading && !error && scoredHikes.length > 0 && (
            <div className="space-y-3">
              {scoredHikes.slice(0, 5).map((scoredHike, index) => (
                <HikeCard key={scoredHike.hike.id} scoredHike={scoredHike} rank={index + 1} />
              ))}
              {scoredHikes.length > 5 && (
                <Mono className="text-ink-3 block text-center pt-2">
                  +{scoredHikes.length - 5} more trails analyzed
                </Mono>
              )}
            </div>
          )}
        </div>

        {/* Refresh footer */}
        {!loading && scoredHikes.length > 0 && (
          <div className="pt-4 border-t border-line">
            <Pill variant="ghost" mono={false} onClick={handleTryAgain} className="!w-full !justify-center">
              <Compass className="w-3.5 h-3.5" weight="regular" />
              Refresh rankings
            </Pill>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
