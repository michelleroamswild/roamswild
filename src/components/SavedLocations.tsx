import { MapPin, Star, ChevronRight, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { useSavedLocations } from "@/context/SavedLocationsContext";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";

const defaultLocations = [
  {
    id: "default-1",
    name: "Joshua Tree National Park",
    type: "National Park",
    address: "California, USA",
  },
  {
    id: "default-2",
    name: "Alabama Hills",
    type: "Dispersed Camping",
    address: "Lone Pine, CA",
  },
  {
    id: "default-3",
    name: "Death Valley Overlook",
    type: "Viewpoint",
    address: "Death Valley, CA",
  },
  {
    id: "default-4",
    name: "Lone Pine Creek Trail",
    type: "Hike",
    address: "Lone Pine, CA",
  },
];

export const SavedLocations = () => {
  const { locations, removeLocation } = useSavedLocations();
  const navigate = useNavigate();

  const handleRemove = (id: string, name: string) => {
    removeLocation(id);
    toast.success(`Removed ${name}`, {
      description: "Removed from saved locations",
    });
  };

  
  const handleViewAll = () => {
    navigate('/saved');
  };

  // Combine user-saved locations with defaults if no saved locations
  const displayLocations = locations.length > 0
    ? locations
    : defaultLocations.map(loc => ({
        ...loc,
        placeId: loc.id,
        lat: 0,
        lng: 0,
        savedAt: "",
      }));

  const isUserLocation = locations.length > 0;

  return (
    <section className="w-full max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Saved Locations</h2>
          <p className="text-muted-foreground mt-1">
            {isUserLocation
              ? `${locations.length} saved location${locations.length !== 1 ? 's' : ''}`
              : 'Your favorite spots from Google Maps'
            }
          </p>
        </div>
        {locations.length > 0 && (
          <Button variant="ghost" className="text-primary font-medium" onClick={handleViewAll}>
            View All
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {displayLocations.slice(0, 4).map((location, index) => {
          const cardContent = (
            <>
              <div className="flex items-center justify-center w-12 h-12 bg-secondary rounded-lg group-hover:bg-primary/10 transition-colors duration-200">
                <MapPin className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors duration-200">
                  {location.name}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-muted-foreground">{location.type}</span>
                  {'address' in location && location.address && (
                    <>
                      <span className="text-muted-foreground">•</span>
                      <span className="text-sm text-muted-foreground truncate">{location.address}</span>
                    </>
                  )}
                </div>
              </div>
              {isUserLocation ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleRemove(location.id, location.name);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-destructive/10 rounded-lg"
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </button>
              ) : (
                <Star className="w-5 h-5 text-terracotta fill-terracotta" />
              )}
            </>
          );

          return isUserLocation ? (
            <Link
              key={location.id}
              to={`/location/${location.placeId}`}
              className="group flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:border-primary/30 hover:shadow-card transition-all duration-300 animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {cardContent}
            </Link>
          ) : (
            <div
              key={location.id}
              className="group flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:border-primary/30 hover:shadow-card transition-all duration-300 animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {cardContent}
            </div>
          );
        })}
      </div>

      {locations.length === 0 && (
        <p className="text-center text-muted-foreground mt-6 text-sm">
          Search for a location above and save it to see it here
        </p>
      )}
    </section>
  );
};
