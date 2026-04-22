import { Tent } from '@phosphor-icons/react';

type RoadFilter = 'all' | 'passenger' | 'high-clearance' | '4wd';
type SortBy = 'distance' | 'rating' | 'recommended';

interface SpotFiltersPanelProps {
  spotFilters: Set<string>;
  onToggleFilter: (filter: string) => void;
  onClearFilters: () => void;
  roadFilter: RoadFilter;
  onChangeRoadFilter: (filter: RoadFilter) => void;
  sortBy: SortBy;
  onChangeSortBy: (sortBy: SortBy) => void;
}

export const SpotFiltersPanel = ({
  spotFilters,
  onToggleFilter,
  onClearFilters,
  roadFilter,
  onChangeRoadFilter,
  sortBy,
  onChangeSortBy,
}: SpotFiltersPanelProps) => {
  return (
    <div className="space-y-4 mb-5">
      {/* Spot Type Filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onToggleFilter('campgrounds')}
          className={`px-3 py-1 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${
            spotFilters.has('campgrounds')
              ? 'text-white border-blue-500'
              : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
          }`}
          style={spotFilters.has('campgrounds') ? { backgroundColor: '#3b82f6' } : {}}
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
          Campgrounds
        </button>
        <button
          onClick={() => onToggleFilter('mine')}
          className={`px-3 py-1 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${
            spotFilters.has('mine')
              ? 'text-white border-violet-500'
              : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
          }`}
          style={spotFilters.has('mine') ? { backgroundColor: '#8b5cf6' } : {}}
        >
          <Tent className="w-3 h-3" weight="fill" />
          Mine
        </button>
        <button
          onClick={() => onToggleFilter('known')}
          className={`px-3 py-1 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${
            spotFilters.has('known')
              ? 'text-white border-mossgreen'
              : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
          }`}
          style={spotFilters.has('known') ? { backgroundColor: '#3d7a40' } : {}}
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3d7a40' }} />
          Known
        </button>
        <button
          onClick={() => onToggleFilter('high')}
          className={`px-3 py-1 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${
            spotFilters.has('high')
              ? 'text-white border-softamber'
              : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
          }`}
          style={spotFilters.has('high') ? { backgroundColor: '#eab308' } : {}}
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#eab308' }} />
          High
        </button>
        <button
          onClick={() => onToggleFilter('medium')}
          className={`px-3 py-1 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${
            spotFilters.has('medium')
              ? 'text-white border-orange-500'
              : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
          }`}
          style={spotFilters.has('medium') ? { backgroundColor: '#f97316' } : {}}
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#f97316' }} />
          Moderate
        </button>
        {spotFilters.size > 0 && (
          <button
            onClick={onClearFilters}
            className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {/* Vehicle Access + Sort row */}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => onChangeRoadFilter('all')}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              roadFilter === 'all'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            All
          </button>
          <button
            onClick={() => onChangeRoadFilter('passenger')}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              roadFilter === 'passenger'
                ? 'text-white border-[#3b82f6]'
                : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
            }`}
            style={roadFilter === 'passenger' ? { backgroundColor: '#3b82f6' } : {}}
          >
            2WD
          </button>
          <button
            onClick={() => onChangeRoadFilter('high-clearance')}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              roadFilter === 'high-clearance'
                ? 'text-white border-[#f97316]'
                : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
            }`}
            style={roadFilter === 'high-clearance' ? { backgroundColor: '#f97316' } : {}}
          >
            HC
          </button>
          <button
            onClick={() => onChangeRoadFilter('4wd')}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              roadFilter === '4wd'
                ? 'text-white border-[#ef4444]'
                : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
            }`}
            style={roadFilter === '4wd' ? { backgroundColor: '#ef4444' } : {}}
          >
            4WD
          </button>
        </div>
        <select
          value={sortBy}
          onChange={(e) => onChangeSortBy(e.target.value as SortBy)}
          className="text-xs bg-muted/50 border border-border rounded px-2.5 py-1 text-foreground"
        >
          <option value="recommended">Recommended</option>
          <option value="distance">Distance</option>
          <option value="rating">Rating</option>
        </select>
      </div>
    </div>
  );
};
