/**
 * Best Hikes Today Dialog
 *
 * Shows the top-scored hikes near the user for today,
 * with weather-aware recommendations and explanations.
 */

import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
  Wind,
  Drop,
  CheckCircle,
  Info,
} from "@phosphor-icons/react";
import { useBestHikesToday } from "@/hooks/use-best-hikes-today";
import { ScoredHike } from "@/scoring";

interface BestHikesTodayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Score color based on value
function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-600 dark:text-green-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function getScoreBgColor(score: number): string {
  if (score >= 80) return "bg-green-100 dark:bg-green-900/30";
  if (score >= 60) return "bg-amber-100 dark:bg-amber-900/30";
  return "bg-red-100 dark:bg-red-900/30";
}

// Hike card component
function HikeCard({ scoredHike, rank }: { scoredHike: ScoredHike; rank: number }) {
  const { hike, score_0_100, reasons_short, warnings, breakdown } = scoredHike;

  const handleOpenInMaps = () => {
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${hike.location.lat},${hike.location.lng}`,
      "_blank"
    );
  };

  const handleGetDirections = () => {
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${hike.location.lat},${hike.location.lng}`,
      "_blank"
    );
  };

  return (
    <div className="p-4 rounded-xl border border-border bg-card hover:shadow-md transition-shadow">
      {/* Header with rank and score */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
            {rank}
          </div>
          <div className="min-w-0">
            <h4 className="font-semibold text-foreground truncate">{hike.name}</h4>
            <div className="flex items-center gap-2 text-xs text-foreground/60">
              <span>{hike.distance_miles} mi</span>
              <span>•</span>
              <span>{hike.elevation_gain_ft.toLocaleString()} ft gain</span>
            </div>
          </div>
        </div>
        <div className={`px-2.5 py-1 rounded-full text-sm font-bold ${getScoreColor(score_0_100)} ${getScoreBgColor(score_0_100)}`}>
          {score_0_100}
        </div>
      </div>

      {/* Why today reasons */}
      <div className="space-y-1.5 mb-3">
        {reasons_short.slice(0, 3).map((reason, i) => (
          <div key={i} className="flex items-center gap-2 text-sm text-foreground/80">
            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" weight="fill" />
            <span>{reason}</span>
          </div>
        ))}
      </div>

      {/* Warnings */}
      {warnings && warnings.length > 0 && (
        <div className="mb-3 p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700/50">
          {warnings.slice(0, 2).map((warning, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
              <Warning className="w-3.5 h-3.5 flex-shrink-0" weight="fill" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      {/* Score breakdown (collapsible detail) */}
      <details className="mb-3 text-xs">
        <summary className="cursor-pointer text-foreground/50 hover:text-foreground/70 flex items-center gap-1">
          <Info className="w-3.5 h-3.5" />
          Score breakdown
        </summary>
        <div className="mt-2 grid grid-cols-3 gap-2 text-foreground/60">
          <div className="flex items-center gap-1">
            <Sun className="w-3 h-3" />
            <span>Weather {Math.round(breakdown.weather * 100)}%</span>
          </div>
          <div className="flex items-center gap-1">
            <Boot className="w-3 h-3" />
            <span>Conditions {Math.round(breakdown.conditions * 100)}%</span>
          </div>
          <div className="flex items-center gap-1">
            <Cloud className="w-3 h-3" />
            <span>Light {Math.round(breakdown.light * 100)}%</span>
          </div>
          <div className="flex items-center gap-1">
            <Mountains className="w-3 h-3" />
            <span>Effort {Math.round(breakdown.effort_match * 100)}%</span>
          </div>
          <div className="flex items-center gap-1">
            <Star className="w-3 h-3" />
            <span>Crowd {Math.round(breakdown.crowd * 100)}%</span>
          </div>
          {breakdown.penalties < 1 && (
            <div className="flex items-center gap-1 text-amber-600">
              <Warning className="w-3 h-3" />
              <span>Penalty {Math.round(breakdown.penalties * 100)}%</span>
            </div>
          )}
        </div>
      </details>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="primary" size="sm" className="flex-1" onClick={handleGetDirections}>
          <NavigationArrow className="w-4 h-4 mr-1" />
          Directions
        </Button>
        <Button variant="outline" size="sm" onClick={handleOpenInMaps}>
          <ArrowSquareOut className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export function BestHikesTodayDialog({ open, onOpenChange }: BestHikesTodayDialogProps) {
  const { scoredHikes, loading, error, fetchBestHikes, clearResults } = useBestHikesToday();

  // Fetch when dialog opens
  useEffect(() => {
    if (open && scoredHikes.length === 0 && !loading && !error) {
      fetchBestHikes();
    }
  }, [open, scoredHikes.length, loading, error, fetchBestHikes]);

  // Clear when dialog closes
  useEffect(() => {
    if (!open) {
      clearResults();
    }
  }, [open, clearResults]);

  const handleTryAgain = () => {
    clearResults();
    fetchBestHikes();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-primary" weight="fill" />
            Best Hikes Today
          </DialogTitle>
          <DialogDescription>
            {loading
              ? "Finding the best trails for today's conditions..."
              : scoredHikes.length > 0
                ? `Top ${Math.min(5, scoredHikes.length)} hikes ranked by weather, conditions & more`
                : "Discover the best hiking trails near you"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 -mx-6 px-6">
          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <SpinnerGap className="w-12 h-12 text-primary animate-spin" />
              <p className="mt-4 text-sm text-foreground/70">
                Analyzing trails near you...
              </p>
              <p className="text-xs text-foreground/50 mt-1">
                Checking weather, conditions, and light
              </p>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <Warning className="w-6 h-6 text-destructive" weight="fill" />
              </div>
              <p className="text-sm text-destructive font-medium mb-2">{error}</p>
              <Button variant="outline" size="sm" onClick={handleTryAgain} className="mt-2">
                Try Again
              </Button>
            </div>
          )}

          {/* Results */}
          {!loading && !error && scoredHikes.length > 0 && (
            <div className="space-y-3">
              {scoredHikes.slice(0, 5).map((scoredHike, index) => (
                <HikeCard key={scoredHike.hike.id} scoredHike={scoredHike} rank={index + 1} />
              ))}

              {scoredHikes.length > 5 && (
                <p className="text-center text-sm text-foreground/50 pt-2">
                  +{scoredHikes.length - 5} more trails analyzed
                </p>
              )}
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && scoredHikes.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Compass className="w-12 h-12 text-foreground/20 mb-4" />
              <p className="text-sm text-foreground/60">
                Click the button below to find the best hikes for today
              </p>
            </div>
          )}
        </div>

        {/* Footer with refresh */}
        {!loading && scoredHikes.length > 0 && (
          <div className="pt-4 border-t border-border">
            <Button variant="outline" size="sm" onClick={handleTryAgain} className="w-full">
              <Compass className="w-4 h-4 mr-2" />
              Refresh Rankings
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
