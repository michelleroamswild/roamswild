import { InfoWindow } from '@react-google-maps/api';
import { X } from '@phosphor-icons/react';
import { TripStop } from '@/types/trip';
import { getStopSource } from '@/utils/stop-source';

interface MapStopInfoWindowProps {
  stop: TripStop;
  onClose: () => void;
}

// Shared InfoWindow popover for the trip-detail and day-detail maps.
// Layout mirrors the explore-page popover: title left + close X right,
// description, day/duration meta, source line, and a "Get directions" CTA.
export const MapStopInfoWindow = ({ stop, onClose }: MapStopInfoWindowProps) => {
  const source = getStopSource(stop);

  return (
    <InfoWindow
      position={stop.coordinates}
      onCloseClick={onClose}
      options={{ pixelOffset: new google.maps.Size(0, -32), disableAutoPan: true }}
    >
      <div className="compact-info-window min-w-[220px] font-sans">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-[14px] font-semibold tracking-[-0.005em] text-ink leading-tight flex-1 min-w-0">
            {stop.name}
          </h4>
          <button
            onClick={onClose}
            className="shrink-0 p-0.5 -mr-0.5 -mt-0.5 text-ink-3 hover:text-ink transition-colors"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" weight="bold" />
          </button>
        </div>
        {stop.description && (
          <p className="text-[12px] text-ink-3 mt-1 leading-[1.5]">{stop.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 text-[11px] font-mono uppercase tracking-[0.10em] text-ink-3">
          <span>Day {stop.day}</span>
          {stop.duration && (
            <>
              <span>·</span>
              <span className="normal-case font-sans tracking-normal text-[12px]">
                {stop.duration}
              </span>
            </>
          )}
        </div>
        {source && (
          <p className="mt-1 text-[11px] font-mono uppercase tracking-[0.10em] text-ink-3">
            Source · <span className="text-ink-2">{source}</span>
          </p>
        )}
        <button
          onClick={() =>
            window.open(
              `https://www.google.com/maps/dir/?api=1&destination=${stop.coordinates.lat},${stop.coordinates.lng}`,
              '_blank',
            )
          }
          className="mt-2.5 w-full px-3 py-1.5 rounded-full bg-pine-6 text-cream dark:text-ink-pine text-[12px] font-sans font-semibold tracking-[0.01em] hover:bg-pine-5 transition-colors"
        >
          Get directions
        </button>
      </div>
    </InfoWindow>
  );
};
