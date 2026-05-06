import { useState } from 'react';
import { ArrowSquareOut, Drop, Path, SpinnerGap, Tent } from '@phosphor-icons/react';
import type { Campsite } from '@/types/campsite';
import { useSpotNaipImage } from '@/hooks/use-spot-naip-image';
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
import { AiAssessmentSection } from './AiAssessmentSection';
import type { SpotAIAnalysis } from './types';

interface UserCampsiteDetailPanelProps {
  campsite: Campsite;
  onBack: () => void;
  // AI assessment props (same shape as SpotDetailPanel) — optional so the
  // panel still renders without them.
  aiAnalysis?: SpotAIAnalysis | null;
  aiAnalyzing?: boolean;
  aiCheckingCache?: boolean;
  aiError?: string | null;
  onAnalyze?: () => void;
  onReanalyze?: () => void;
  onDismissError?: () => void;
}

export const UserCampsiteDetailPanel = ({
  campsite,
  onBack,
  aiAnalysis,
  aiAnalyzing,
  aiCheckingCache,
  aiError,
  onAnalyze,
  onReanalyze,
  onDismissError,
}: UserCampsiteDetailPanelProps) => {
  const [copied, setCopied] = useState(false);
  // NAIP aerial chip — same shared hook the spot panel uses. Matches by
  // lat/lng so any saved campsite that's also a known spot in the DB
  // surfaces the cached imagery; otherwise resolves to null and the
  // hero strip is skipped.
  const { image: naipImage, loading: naipLoading } = useSpotNaipImage(campsite.lat, campsite.lng);
  const naipYear = naipImage?.taken_at ? new Date(naipImage.taken_at).getFullYear() : null;

  const handleCopyCoords = () => {
    navigator.clipboard.writeText(`${campsite.lat.toFixed(5)}, ${campsite.lng.toFixed(5)}`);
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

        {/* NAIP aerial — full-width hero strip when available. Same pattern
            as SpotDetailPanel so the visual rhythm matches between panels. */}
        {(naipLoading || naipImage) && (
          <div className="group/naip relative aspect-[4/3] bg-paper-2 overflow-hidden border-b border-line">
            {naipLoading && !naipImage && (
              <div className="absolute inset-0 flex items-center justify-center">
                <SpinnerGap className="w-5 h-5 animate-spin text-ink-3" />
              </div>
            )}
            {naipImage && (
              <>
                <img
                  src={naipImage.storage_url}
                  alt="Aerial view"
                  className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover/naip:scale-110"
                  loading="lazy"
                />
                {!naipImage.pinBaked && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center transition-transform duration-500 ease-out group-hover/naip:scale-110">
                    <div className="w-3.5 h-3.5 rounded-full bg-cream border-[2px] border-ink shadow-[0_2px_6px_rgba(0,0,0,0.45)]" />
                  </div>
                )}
                <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-ink/80 dark:bg-ink-pine/80 text-cream text-[10px] font-mono uppercase tracking-[0.10em] font-semibold">
                  NAIP{naipYear ? ` · ${naipYear}` : ''}
                </div>
              </>
            )}
          </div>
        )}

        {/* Hero */}
        <DetailSection title="Your spot" first>
          <DetailHero
            Icon={Tent}
            iconBg="bg-pine-6/15"
            iconText="text-pine-6"
            title={campsite.name}
            badge={<DetailTag variant="pine">{campsite.type || 'Campsite'}</DetailTag>}
          />
        </DetailSection>

        {/* Coords */}
        <DetailSection title="Coordinates">
          <CoordsStrip lat={campsite.lat} lng={campsite.lng} copied={copied} onCopy={handleCopyCoords} />
        </DetailSection>

        {/* Access + amenities — only show if any exist */}
        {(campsite.roadAccess || campsite.waterAvailable) && (
          <DetailSection title="Access & amenities">
            <div className="flex flex-wrap gap-1.5">
              {campsite.roadAccess && (
                <DetailTag variant="clay">
                  <Path className="w-3 h-3" weight="regular" />
                  {campsite.roadAccess === '2wd' ? '2WD OK' : campsite.roadAccess.toUpperCase()}
                </DetailTag>
              )}
              {campsite.waterAvailable && (
                <DetailTag variant="water">
                  <Drop className="w-3 h-3" weight="fill" />
                  Water
                </DetailTag>
              )}
            </div>
          </DetailSection>
        )}

        {/* Notes */}
        {campsite.description && (
          <DetailSection title="Notes">
            <p className="text-[13px] text-ink leading-[1.55]">{campsite.description}</p>
          </DetailSection>
        )}

        {/* AI assessment — only renders when the parent passes the AI props */}
        {onAnalyze && onReanalyze && onDismissError && (
          <AiAssessmentSection
            aiAnalysis={aiAnalysis ?? null}
            aiAnalyzing={!!aiAnalyzing}
            aiCheckingCache={!!aiCheckingCache}
            aiError={aiError ?? null}
            onAnalyze={onAnalyze}
            onReanalyze={onReanalyze}
            onDismissError={onDismissError}
          />
        )}
      </DetailBody>

      {/* Sticky action */}
      <DetailActions>
        <Pill
          variant="solid-pine"
          mono={false}
          onClick={() =>
            window.open(`https://www.google.com/maps/search/?api=1&query=${campsite.lat},${campsite.lng}`, '_blank')
          }
          className="!w-full !justify-center"
        >
          <ArrowSquareOut className="w-3.5 h-3.5" weight="regular" />
          Open in Google Maps
        </Pill>
      </DetailActions>
    </DetailShell>
  );
};
