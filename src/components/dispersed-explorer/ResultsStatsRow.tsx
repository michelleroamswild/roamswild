import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Mono } from '@/components/redesign';
import { cn } from '@/lib/utils';
import type { PotentialSpot, EstablishedCampground } from '@/hooks/use-dispersed-roads';
import type { Campsite } from '@/types/campsite';

interface ResultsStatsRowProps {
  filteredPotentialSpots: PotentialSpot[];
  allEstablishedCampgrounds: EstablishedCampground[];
  campsites: Campsite[];
}

// Compact stat tiles. Counts come from the same buckets the filters use, with
// the exact pin-* color for each so the legend, filter chips, and tile colors
// all stay in lockstep.
export const ResultsStatsRow = ({
  filteredPotentialSpots,
  allEstablishedCampgrounds,
  campsites,
}: ResultsStatsRowProps) => {
  const knownCount = filteredPotentialSpots.filter((s) => s.type === 'camp-site').length;
  const highCount = filteredPotentialSpots.filter((s) => s.type !== 'camp-site' && s.score >= 35).length;
  const moderateCount = filteredPotentialSpots.filter(
    (s) => s.type !== 'camp-site' && s.score >= 25 && s.score < 35,
  ).length;

  const tiles: Array<{
    count: number;
    label: string;
    tooltipTitle: string;
    tooltipBody: string;
    bg: string;
    text: string;
    border: string;
  }> = [
    {
      count: knownCount,
      label: 'Known',
      tooltipTitle: 'Known campsites',
      tooltipBody: 'Campsites tagged by the OSM community',
      bg: 'bg-pin-safe/12',
      text: 'text-pin-safe',
      border: 'border-pin-safe/30',
    },
    {
      count: highCount,
      label: 'High',
      tooltipTitle: 'High confidence (35+)',
      tooltipBody: 'Official roads (MVUM/BLM), named roads, or good access',
      bg: 'bg-pin-easy/12',
      text: 'text-pin-easy',
      border: 'border-pin-easy/30',
    },
    {
      count: moderateCount,
      label: 'Moderate',
      tooltipTitle: 'Moderate confidence (25–34)',
      tooltipBody: 'Unnamed tracks on public land',
      bg: 'bg-pin-moderate/12',
      text: 'text-pin-moderate',
      border: 'border-pin-moderate/30',
    },
    {
      count: allEstablishedCampgrounds.length,
      label: 'Camps',
      tooltipTitle: 'Established campgrounds',
      tooltipBody: 'USFS/BLM campgrounds from Recreation.gov',
      bg: 'bg-pin-campground/12',
      text: 'text-pin-campground',
      border: 'border-pin-campground/30',
    },
    {
      count: campsites.length,
      label: 'Mine',
      tooltipTitle: 'Your saved campsites',
      tooltipBody: "Campsites you've saved to your account",
      bg: 'bg-pine-6/12',
      text: 'text-pine-6',
      border: 'border-pine-6/30',
    },
  ];

  return (
    <div className="hidden sm:grid grid-cols-5 gap-2">
      {tiles.map((t) => (
        <Tooltip key={t.label}>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'p-2.5 rounded-[10px] border text-center cursor-default transition-colors',
                t.bg,
                t.border,
              )}
            >
              <p className={cn('text-[20px] font-sans font-bold tracking-[-0.02em] leading-none', t.text)}>
                {t.count}
              </p>
              <Mono className={cn('mt-1.5 block', t.text)}>{t.label}</Mono>
            </div>
          </TooltipTrigger>
          <TooltipContent className="rounded-[10px] border-line bg-white">
            <p className="font-sans font-semibold text-ink text-[13px]">{t.tooltipTitle}</p>
            <p className="text-[12px] text-ink-3 mt-0.5">{t.tooltipBody}</p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
};
