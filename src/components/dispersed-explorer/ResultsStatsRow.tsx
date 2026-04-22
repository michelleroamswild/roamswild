import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { PotentialSpot, EstablishedCampground } from '@/hooks/use-dispersed-roads';
import type { Campsite } from '@/types/campsite';

interface ResultsStatsRowProps {
  filteredPotentialSpots: PotentialSpot[];
  allEstablishedCampgrounds: EstablishedCampground[];
  campsites: Campsite[];
}

export const ResultsStatsRow = ({
  filteredPotentialSpots,
  allEstablishedCampgrounds,
  campsites,
}: ResultsStatsRowProps) => {
  return (
    <div className="hidden sm:grid grid-cols-5 gap-2 mb-5">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="p-2 bg-mossgreen/10 dark:bg-mossgreen/20 rounded-lg border border-mossgreen/30 text-center cursor-pointer">
            <p className="text-xl font-bold text-mossgreen">{filteredPotentialSpots.filter(s => s.type === 'camp-site').length}</p>
            <p className="text-xs font-medium text-mossgreen">Known</p>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">Known Campsites</p>
          <p className="text-xs text-muted-foreground">Campsites tagged by the OSM community</p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="p-2 bg-softamber/10 dark:bg-softamber/20 rounded-lg border border-softamber/30 text-center cursor-pointer">
            <p className="text-xl font-bold text-softamber">{filteredPotentialSpots.filter(s => s.type !== 'camp-site' && s.score >= 35).length}</p>
            <p className="text-xs font-medium text-softamber">High</p>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">High Confidence (35+)</p>
          <p className="text-xs text-muted-foreground">Official roads (MVUM/BLM), named roads, or good access</p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800 text-center cursor-pointer">
            <p className="text-xl font-bold text-orange-600 dark:text-orange-400">{filteredPotentialSpots.filter(s => s.type !== 'camp-site' && s.score >= 25 && s.score < 35).length}</p>
            <p className="text-xs font-medium text-orange-600 dark:text-orange-400">Moderate</p>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">Moderate Confidence (25-34)</p>
          <p className="text-xs text-muted-foreground">Unnamed tracks on public land</p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 text-center cursor-pointer">
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{allEstablishedCampgrounds.length}</p>
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400">Campgrounds</p>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">Established Campgrounds</p>
          <p className="text-xs text-muted-foreground">USFS/BLM campgrounds from Recreation.gov</p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="p-2 bg-violet-50 dark:bg-violet-900/20 rounded-lg border border-violet-200 dark:border-violet-800 text-center cursor-pointer">
            <p className="text-xl font-bold text-violet-600 dark:text-violet-400">{campsites.length}</p>
            <p className="text-xs font-medium text-violet-600 dark:text-violet-400">My Sites</p>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">Your Saved Campsites</p>
          <p className="text-xs text-muted-foreground">Campsites you've saved to your account</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
