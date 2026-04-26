import { ArrowLeft, ArrowSquareOut, Copy, Drop, Path, Tent } from '@phosphor-icons/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Campsite } from '@/types/campsite';

interface UserCampsiteDetailPanelProps {
  campsite: Campsite;
  onBack: () => void;
}

export const UserCampsiteDetailPanel = ({ campsite, onBack }: UserCampsiteDetailPanelProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopyCoords = () => {
    navigator.clipboard.writeText(`${campsite.lat.toFixed(5)}, ${campsite.lng.toFixed(5)}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full overflow-y-auto p-3 sm:p-4 md:p-6 space-y-5">
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
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-wildviolet bg-wildviolet/10">
          <Tent className="w-6 h-6" weight="fill" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold leading-tight text-foreground">{campsite.name}</h2>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
              {campsite.type || 'Campsite'}
            </span>
            <span className="text-xs text-muted-foreground">Your spot</span>
          </div>
        </div>
      </div>

      {/* Coords bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 rounded-lg border border-border">
        <span className="text-xs font-mono text-muted-foreground truncate">
          {campsite.lat.toFixed(5)}, {campsite.lng.toFixed(5)}
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
            onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${campsite.lat},${campsite.lng}`, '_blank')}
            className="p-1.5 rounded hover:bg-background transition-colors text-muted-foreground hover:text-foreground"
            title="Open in Google Maps"
          >
            <ArrowSquareOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tags */}
      {(campsite.roadAccess || campsite.waterAvailable) && (
        <div className="flex flex-wrap gap-1.5">
          {campsite.roadAccess && (
            <span className="px-2 py-1 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 rounded-md text-xs font-medium flex items-center gap-1">
              <Path className="w-3 h-3" />
              {campsite.roadAccess === '2wd' ? '2WD OK' : campsite.roadAccess.toUpperCase()}
            </span>
          )}
          {campsite.waterAvailable && (
            <span className="px-2 py-1 bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300 rounded-md text-xs font-medium flex items-center gap-1">
              <Drop className="w-3 h-3" weight="fill" />
              Water
            </span>
          )}
        </div>
      )}

      {/* Description */}
      {campsite.description && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Notes</p>
          <p className="text-sm text-foreground leading-relaxed">{campsite.description}</p>
        </div>
      )}

      {/* Action */}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${campsite.lat},${campsite.lng}`, '_blank')}
      >
        Open in Google Maps
        <ArrowSquareOut className="w-3.5 h-3.5 ml-1.5" />
      </Button>

      {copied && (
        <p className="text-xs text-green-600 text-center">Coordinates copied</p>
      )}
    </div>
  );
};
