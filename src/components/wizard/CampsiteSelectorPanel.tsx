import { useState, useEffect } from 'react';
import { Tent, MagnifyingGlass, MapTrifold, Star } from '@phosphor-icons/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { MapLocationPicker } from '@/components/MapLocationPicker';
import { TripStop } from '@/types/trip';
import { useAreaRecommendations } from '@/hooks/use-area-recommendations';
import { Mono } from '@/components/redesign';
import { cn } from '@/lib/utils';

interface CampsiteSelectorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCampsite: (campsite: TripStop) => void;
  areaCenter?: { lat: number; lng: number };
  areaName?: string;
  dayNumber: number;
}

export function CampsiteSelectorPanel({
  isOpen,
  onClose,
  onSelectCampsite,
  areaCenter,
  areaName,
  dayNumber,
}: CampsiteSelectorPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'search' | 'map'>('search');

  const { recommendations, loading, fetchRecommendations } = useAreaRecommendations();
  const campgrounds = recommendations.filter((r) => r.type === 'campground');

  useEffect(() => {
    if (isOpen && areaCenter) {
      fetchRecommendations(areaCenter.lat, areaCenter.lng, 50);
    }
  }, [isOpen, areaCenter, fetchRecommendations]);

  const filteredCampgrounds = campgrounds.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleSelectCampground = (campground: typeof campgrounds[0]) => {
    onSelectCampsite({
      id: `campsite-${Date.now()}-${campground.id}`,
      name: campground.name,
      type: 'campsite',
      coordinates: { lat: campground.lat, lng: campground.lng },
      day: dayNumber,
    });
    onClose();
  };

  const handleMapLocationSelect = (location: { lat: number; lng: number; name: string }) => {
    onSelectCampsite({
      id: `campsite-map-${Date.now()}`,
      name: location.name,
      type: 'campsite',
      coordinates: { lat: location.lat, lng: location.lng },
      day: dayNumber,
    });
    onClose();
  };

  const inputCls =
    'w-full h-10 pl-9 pr-3 rounded-[12px] border border-line bg-white dark:bg-paper-2 text-ink text-[14px] outline-none placeholder:text-ink-3 focus:border-pine-6 transition-colors';

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col bg-paper border-line font-sans"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <SheetHeader className="p-4 border-b border-line bg-cream dark:bg-paper-2">
          <Mono className="text-pine-6 inline-flex items-center gap-1.5">
            <Tent className="w-3.5 h-3.5" weight="regular" />
            Select campsite
          </Mono>
          <SheetTitle className="text-[20px] font-sans font-bold tracking-[-0.015em] text-ink leading-[1.15] mt-1">
            Pick a place to stay.
            {areaName && (
              <span className="text-[14px] font-sans font-normal text-ink-3 ml-2">near {areaName}</span>
            )}
          </SheetTitle>
        </SheetHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'search' | 'map')}
          className="flex-1 flex flex-col"
        >
          <div className="px-4 pt-3">
            <TabsList className="w-full bg-cream dark:bg-paper-2 rounded-full p-1 h-auto border border-line">
              <TabsTrigger
                value="search"
                className={cn(
                  'flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-full text-[12px] font-sans font-semibold tracking-[0.01em] transition-colors',
                  'data-[state=active]:bg-ink dark:data-[state=active]:bg-ink-pine data-[state=active]:text-cream data-[state=active]:shadow-[0_1px_2px_rgba(29,34,24,.08)]',
                  'data-[state=inactive]:text-ink-3 data-[state=inactive]:hover:text-ink',
                )}
              >
                <MagnifyingGlass className="w-3.5 h-3.5" weight="regular" />
                Search
              </TabsTrigger>
              <TabsTrigger
                value="map"
                className={cn(
                  'flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-full text-[12px] font-sans font-semibold tracking-[0.01em] transition-colors',
                  'data-[state=active]:bg-ink dark:data-[state=active]:bg-ink-pine data-[state=active]:text-cream data-[state=active]:shadow-[0_1px_2px_rgba(29,34,24,.08)]',
                  'data-[state=inactive]:text-ink-3 data-[state=inactive]:hover:text-ink',
                )}
              >
                <MapTrifold className="w-3.5 h-3.5" weight="regular" />
                Browse map
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="search" className="flex-1 overflow-hidden flex flex-col m-0 px-4 pb-4 pt-3">
            <div className="relative mb-3">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" weight="regular" />
              <input
                type="text"
                placeholder="Search campgrounds…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={inputCls}
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {loading ? (
                <div className="text-center py-12">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10 mb-2.5">
                    <Tent className="w-5 h-5 text-pine-6 animate-pulse" weight="regular" />
                  </div>
                  <Mono className="text-pine-6 block">Searching for campgrounds…</Mono>
                </div>
              ) : filteredCampgrounds.length === 0 ? (
                <div className="text-center py-12">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-clay/15 text-clay mb-2.5">
                    <Tent className="w-5 h-5" weight="regular" />
                  </div>
                  <p className="text-[14px] font-sans font-semibold text-ink">No campgrounds found</p>
                  <p className="text-[13px] text-ink-3 mt-1">Try browsing the map instead.</p>
                </div>
              ) : (
                filteredCampgrounds.map((campground) => (
                  <button
                    key={campground.id}
                    onClick={() => handleSelectCampground(campground)}
                    className="w-full flex items-center gap-3 p-3 bg-white dark:bg-paper-2 rounded-[14px] border border-line hover:border-pine-6/40 hover:bg-pine-6/[0.04] transition-all text-left"
                  >
                    <div className="w-10 h-10 rounded-[10px] bg-clay/15 text-clay flex items-center justify-center flex-shrink-0">
                      <Tent className="w-5 h-5" weight="regular" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink truncate">
                        {campground.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] font-mono uppercase tracking-[0.10em] text-ink-3">
                        {campground.rating && (
                          <span className="inline-flex items-center gap-0.5 text-clay">
                            <Star className="w-3 h-3 fill-clay" weight="fill" />
                            {campground.rating.toFixed(1)}
                          </span>
                        )}
                        {campground.vicinity && <span className="truncate normal-case font-sans tracking-normal text-[12px] text-ink-3">{campground.vicinity}</span>}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="map" className="flex-1 m-0">
            <div className="h-full">
              <MapLocationPicker
                onSelectLocation={handleMapLocationSelect}
                onCancel={onClose}
                initialCenter={areaCenter}
              />
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
