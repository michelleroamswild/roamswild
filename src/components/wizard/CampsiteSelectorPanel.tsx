import { useState, useEffect } from "react";
import { Tent, MagnifyingGlass, MapTrifold, Star, Navigation, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MapLocationPicker } from "@/components/MapLocationPicker";
import { TripStop } from "@/types/trip";
import { useAreaRecommendations } from "@/hooks/use-area-recommendations";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"search" | "map">("search");

  // Fetch campground recommendations for the area
  const { recommendations, loading, fetchRecommendations } = useAreaRecommendations();

  // Filter to only campgrounds
  const campgrounds = recommendations.filter(r => r.type === 'campground');

  // Fetch when panel opens
  useEffect(() => {
    if (isOpen && areaCenter) {
      fetchRecommendations(areaCenter.lat, areaCenter.lng, 50);
    }
  }, [isOpen, areaCenter, fetchRecommendations]);

  // Filter campgrounds by search query
  const filteredCampgrounds = campgrounds.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectCampground = (campground: typeof campgrounds[0]) => {
    const campsite: TripStop = {
      id: `campsite-${Date.now()}-${campground.id}`,
      name: campground.name,
      type: "campsite",
      coordinates: { lat: campground.lat, lng: campground.lng },
      day: dayNumber,
    };
    onSelectCampsite(campsite);
    onClose();
  };

  const handleMapLocationSelect = (location: { lat: number; lng: number; name: string }) => {
    const campsite: TripStop = {
      id: `campsite-map-${Date.now()}`,
      name: location.name,
      type: "campsite",
      coordinates: { lat: location.lat, lng: location.lng },
      day: dayNumber,
    };
    onSelectCampsite(campsite);
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <Tent className="w-5 h-5" />
            Select Campsite
            {areaName && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                near {areaName}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "search" | "map")} className="flex-1 flex flex-col">
          <div className="px-4 pt-2">
            <TabsList className="w-full">
              <TabsTrigger value="search" className="flex-1">
                <MagnifyingGlass className="w-4 h-4 mr-2" />
                Search
              </TabsTrigger>
              <TabsTrigger value="map" className="flex-1">
                <MapTrifold className="w-4 h-4 mr-2" />
                Browse Map
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="search" className="flex-1 overflow-hidden flex flex-col m-0 px-4 pb-4">
            {/* Search Input */}
            <div className="relative mb-4">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search campgrounds..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto space-y-2">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Searching for campgrounds...</p>
                </div>
              ) : filteredCampgrounds.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Tent className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No campgrounds found</p>
                  <p className="text-sm mt-1">Try browsing the map instead</p>
                </div>
              ) : (
                filteredCampgrounds.map((campground) => (
                  <button
                    key={campground.id}
                    onClick={() => handleSelectCampground(campground)}
                    className="w-full flex items-center gap-3 p-3 bg-card rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Tent className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{campground.name}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {campground.rating && (
                          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <Star className="w-3 h-3" weight="fill" />
                            {campground.rating.toFixed(1)}
                          </span>
                        )}
                        {campground.vicinity && (
                          <span className="truncate">{campground.vicinity}</span>
                        )}
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
