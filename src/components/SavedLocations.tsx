import { MapPin, Star, ChevronRight } from "lucide-react";
import { Button } from "./ui/button";

const savedLocations = [
  {
    id: 1,
    name: "Joshua Tree National Park",
    type: "National Park",
    distance: "142 mi",
    saved: true,
  },
  {
    id: 2,
    name: "Alabama Hills",
    type: "Dispersed Camping",
    distance: "215 mi",
    saved: true,
  },
  {
    id: 3,
    name: "Death Valley Overlook",
    type: "Viewpoint",
    distance: "198 mi",
    saved: true,
  },
  {
    id: 4,
    name: "Lone Pine Creek Trail",
    type: "Hike",
    distance: "220 mi",
    saved: true,
  },
];

export const SavedLocations = () => {
  return (
    <section className="w-full max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Saved Locations</h2>
          <p className="text-muted-foreground mt-1">Your favorite spots from Google Maps</p>
        </div>
        <Button variant="ghost" className="text-primary font-medium">
          View All
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {savedLocations.map((location, index) => (
          <div
            key={location.id}
            className="group flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:border-primary/30 hover:shadow-card transition-all duration-300 cursor-pointer animate-fade-in"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex items-center justify-center w-12 h-12 bg-secondary rounded-lg group-hover:bg-primary/10 transition-colors duration-200">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors duration-200">
                {location.name}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-muted-foreground">{location.type}</span>
                <span className="text-muted-foreground">•</span>
                <span className="text-sm text-muted-foreground">{location.distance}</span>
              </div>
            </div>
            <Star className="w-5 h-5 text-terracotta fill-terracotta" />
          </div>
        ))}
      </div>
    </section>
  );
};
