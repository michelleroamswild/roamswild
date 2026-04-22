import { ArrowLeft, ArrowSquareOut, Check, Copy, TreeEvergreen } from '@phosphor-icons/react';
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

  // Consolidated tags (site-type tag is rendered separately under the title)
  const tags: { label: string; className: string; key: string }[] = [];
  if (campground.reservable) {
    tags.push({
      key: 'reservable',
      label: 'Reservable',
      className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    });
  }
  if (campground.facilityType) {
    tags.push({
      key: 'facility',
      label: campground.facilityType,
      className: 'bg-primary/10 text-primary',
    });
  }
  if (campground.agencyName) {
    tags.push({
      key: 'agency',
      label: campground.agencyName,
      className: 'bg-muted text-muted-foreground',
    });
  }

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

        {/* Hero: icon + (name on left, coords/copy on right) */}
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-blue-600 bg-blue-500/10">
            <TreeEvergreen className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold leading-tight text-foreground">{campground.name}</h2>
                <div className="mt-1.5">
                  <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                    Established campground
                  </span>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <span className="text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                  {campground.lat.toFixed(4)}, {campground.lng.toFixed(4)}
                </span>
                <button
                  onClick={handleCopyCoords}
                  className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  title="Copy coordinates"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Consolidated tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag.key}
                className={`px-2 py-1 rounded-md text-xs font-medium ${tag.className}`}
              >
                {tag.label}
              </span>
            ))}
          </div>
        )}

        {/* Description */}
        {campground.description && (
          <div className="pt-3 border-t border-border">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">About</p>
            <p className="text-sm text-foreground leading-relaxed">{campground.description}</p>
          </div>
        )}
      </div>

      {/* Fixed bottom actions */}
      <div className="shrink-0 border-t border-border bg-background p-3 sm:p-4 md:p-6 space-y-2">
        <Button
          variant="primary"
          size="sm"
          className="w-full"
          onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${campground.lat},${campground.lng}`, '_blank')}
        >
          <ArrowSquareOut className="w-4 h-4 mr-1.5" />
          Open in Maps
        </Button>
        {campground.reservable && campground.url && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => window.open(campground.url, '_blank')}
          >
            Reserve
            <ArrowSquareOut className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        )}
        {!campground.reservable && campground.url && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => window.open(campground.url, '_blank')}
          >
            <ArrowSquareOut className="w-4 h-4 mr-1.5" />
            View on Recreation.gov
          </Button>
        )}
      </div>
    </div>
  );
};
