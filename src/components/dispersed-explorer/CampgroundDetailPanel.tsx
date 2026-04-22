import { ArrowLeft, ArrowSquareOut, Copy, TreeEvergreen } from '@phosphor-icons/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EstablishedCampground } from '@/hooks/use-dispersed-roads';

interface CampgroundDetailPanelProps {
  campground: EstablishedCampground;
  onBack: () => void;
}

export const CampgroundDetailPanel = ({ campground, onBack }: CampgroundDetailPanelProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopyCoords = () => {
    navigator.clipboard.writeText(`${campground.lat.toFixed(5)}, ${campground.lng.toFixed(5)}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-5">
      {/* Back nav */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to results
      </button>

      {/* Hero header */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-blue-600 bg-blue-500/10">
          <TreeEvergreen className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold leading-tight text-foreground">{campground.name}</h2>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 font-medium">
              {campground.facilityType}
            </span>
            {campground.agencyName && (
              <span className="text-xs text-muted-foreground">{campground.agencyName}</span>
            )}
          </div>
        </div>
      </div>

      {/* Coords bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 rounded-lg border border-border">
        <span className="text-xs font-mono text-muted-foreground truncate">
          {campground.lat.toFixed(5)}, {campground.lng.toFixed(5)}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleCopyCoords}
            className="p-1.5 rounded hover:bg-background transition-colors text-muted-foreground hover:text-foreground"
            title="Copy coordinates"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${campground.lat},${campground.lng}`, '_blank')}
            className="p-1.5 rounded hover:bg-background transition-colors text-muted-foreground hover:text-foreground"
            title="Open in Google Maps"
          >
            <ArrowSquareOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Status tags */}
      <div className="flex flex-wrap gap-1.5">
        {campground.reservable && (
          <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded-md text-xs font-medium">
            Reservable
          </span>
        )}
      </div>

      {/* Description */}
      {campground.description && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">About</p>
          <p className="text-sm text-foreground leading-relaxed">{campground.description}</p>
        </div>
      )}

      {/* Actions */}
      {(campground.reservable && campground.url) && (
        <Button
          variant="primary"
          size="sm"
          className="w-full"
          onClick={() => window.open(campground.url, '_blank')}
        >
          Reserve
          <ArrowSquareOut className="w-3.5 h-3.5 ml-1.5" />
        </Button>
      )}

      {campground.url && (
        <a
          href={campground.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 text-xs text-blue-600 hover:underline"
        >
          <ArrowSquareOut className="w-3 h-3" />
          View on Recreation.gov
        </a>
      )}
    </div>
  );
};
