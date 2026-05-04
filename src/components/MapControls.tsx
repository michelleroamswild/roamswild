import { Plus, Minus, Compass } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type MapType = "roadmap" | "satellite" | "hybrid" | "terrain";

interface MapControlsProps {
  /** Resolved Google Map instance — controls are no-ops until it loads. */
  map: google.maps.Map | null;
  /** Show the +/- zoom buttons. */
  showZoom?: boolean;
  /** Show the Map/Sat toggle. Pass `null` to hide. */
  mapType?: MapType | null;
  /** Notified when the user picks a new map type. The component does not
   *  call setMapTypeId itself — the parent owns that state. */
  onMapTypeChange?: (type: MapType) => void;
  /** Optional locate / recenter button. Hidden if no handler is provided. */
  onLocate?: () => void;
  /** Layout / position is up to the parent — this component is a styled
   *  vertical column of buttons that floats over a map. */
  className?: string;
}

// Standalone square button base — used by zoom +/- and the optional locate.
// Matches the design (36×36, rounded-[10px], cream bg, line border).
const SQUARE_BUTTON =
  "inline-flex items-center justify-center w-9 h-9 rounded-[10px] bg-cream dark:bg-paper-2 border border-line text-ink-2 hover:text-ink hover:bg-paper dark:hover:bg-paper transition-colors";

/**
 * Pine + Paper styled map controls. Replaces Google's default zoom /
 * map-type chrome, which sits out of the design system. Buttons are
 * standalone tiles stacked with a small gap — see `explore-mapfirst-split`
 * in the claude.design export for the canonical layout.
 */
export const MapControls = ({
  map,
  showZoom = true,
  mapType = null,
  onMapTypeChange,
  onLocate,
  className,
}: MapControlsProps) => {
  const zoomBy = (delta: number) => {
    if (!map) return;
    const next = (map.getZoom() ?? 8) + delta;
    map.setZoom(next);
  };

  const isMap = mapType === "roadmap" || mapType === "terrain";
  const isSat = mapType === "hybrid" || mapType === "satellite";

  return (
    <div className={cn("inline-flex flex-col items-end gap-1.5", className)}>
      {/* Map / Sat toggle — single ring container, two stacked text buttons.
          Active state inverts to ink fill / cream text. */}
      {mapType !== null && onMapTypeChange && (
        <div
          role="group"
          aria-label="Map type"
          className="bg-cream dark:bg-paper-2 border border-line rounded-[10px] p-1 flex flex-col gap-0.5"
        >
          <button
            type="button"
            onClick={() => onMapTypeChange("roadmap")}
            aria-pressed={isMap}
            className={cn(
              "px-3 py-1 rounded-[6px] text-[11px] font-sans font-semibold tracking-[-0.005em] transition-colors",
              isMap
                ? "bg-ink text-cream"
                : "text-ink hover:bg-paper",
            )}
          >
            Map
          </button>
          <button
            type="button"
            onClick={() => onMapTypeChange("hybrid")}
            aria-pressed={isSat}
            className={cn(
              "px-3 py-1 rounded-[6px] text-[11px] font-sans font-semibold tracking-[-0.005em] transition-colors",
              isSat
                ? "bg-ink text-cream"
                : "text-ink hover:bg-paper",
            )}
          >
            Sat
          </button>
        </div>
      )}

      {/* Zoom — two standalone square tiles. */}
      {showZoom && (
        <>
          <button
            type="button"
            onClick={() => zoomBy(1)}
            aria-label="Zoom in"
            className={SQUARE_BUTTON}
          >
            <Plus className="w-4 h-4" weight="bold" />
          </button>
          <button
            type="button"
            onClick={() => zoomBy(-1)}
            aria-label="Zoom out"
            className={SQUARE_BUTTON}
          >
            <Minus className="w-4 h-4" weight="bold" />
          </button>
        </>
      )}

      {/* Locate — pine accent icon to match the design's compass. */}
      {onLocate && (
        <button
          type="button"
          onClick={onLocate}
          aria-label="Recenter"
          className={cn(SQUARE_BUTTON, "text-pine-6 hover:text-pine-6")}
        >
          <Compass className="w-4 h-4" weight="regular" />
        </button>
      )}
    </div>
  );
};
