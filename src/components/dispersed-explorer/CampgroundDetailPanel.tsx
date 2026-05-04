import { useState } from 'react';
import { ArrowSquareOut, TreeEvergreen } from '@phosphor-icons/react';
import { EstablishedCampground } from '@/hooks/use-dispersed-roads';
import { Pill } from '@/components/redesign';
import {
  DetailShell,
  DetailBody,
  DetailActions,
  BackLink,
  DetailHero,
  CoordsStrip,
  DetailSection,
  DetailTag,
} from './DetailPanelChrome';

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
    <DetailShell>
      <DetailBody>
        {/* Top bar — back link, sticky as the body scrolls. */}
        <div className="sticky top-0 z-10 bg-white dark:bg-paper-2 px-[18px] py-3 border-b border-line">
          <BackLink onBack={onBack} />
        </div>

        {/* Hero */}
        <DetailSection title="Established campground" first>
          <DetailHero
            Icon={TreeEvergreen}
            iconBg="bg-pin-campground/15"
            iconText="text-pin-campground"
            title={campground.name}
            badge={
              <div className="flex flex-wrap gap-1.5">
                {campground.reservable && <DetailTag variant="pine">Reservable</DetailTag>}
                {campground.facilityType && <DetailTag variant="ghost">{campground.facilityType}</DetailTag>}
                {campground.agencyName && <DetailTag variant="ghost">{campground.agencyName}</DetailTag>}
              </div>
            }
          />
        </DetailSection>

        {/* Coords */}
        <DetailSection title="Coordinates">
          <CoordsStrip lat={campground.lat} lng={campground.lng} copied={copied} onCopy={handleCopyCoords} />
        </DetailSection>

        {/* Description */}
        {campground.description && (
          <DetailSection title="About">
            <p className="text-[13px] text-ink leading-[1.55]">{campground.description}</p>
          </DetailSection>
        )}
      </DetailBody>

      {/* Sticky actions */}
      <DetailActions>
        <Pill
          variant="solid-pine"
          mono={false}
          onClick={() =>
            window.open(
              `https://www.google.com/maps/search/?api=1&query=${campground.lat},${campground.lng}`,
              '_blank',
            )
          }
          className="!w-full !justify-center"
        >
          <ArrowSquareOut className="w-3.5 h-3.5" weight="regular" />
          Open in Maps
        </Pill>
        {campground.url && (
          <Pill
            variant="ghost"
            mono={false}
            onClick={() => window.open(campground.url, '_blank')}
            className="!w-full !justify-center"
          >
            {campground.reservable ? 'Reserve' : 'View on Recreation.gov'}
            <ArrowSquareOut className="w-3.5 h-3.5" weight="regular" />
          </Pill>
        )}
      </DetailActions>
    </DetailShell>
  );
};
