import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Trash2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSavedLocations } from "@/context/SavedLocationsContext";
import { toast } from "sonner";

const SavedLocations = () => {
  const { locations, removeLocation } = useSavedLocations();
  const navigate = useNavigate();

  const handleRemove = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    removeLocation(id);
    toast.success(`Removed ${name}`, {
      description: "Removed from saved locations",
    });
  };

  const handleLocationClick = (placeId: string) => {
    navigate(`/location/${placeId}`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container px-4 md:px-6 py-4">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon" className="rounded-full">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-display font-bold text-foreground">Saved Locations</h1>
              <p className="text-sm text-muted-foreground">
                {locations.length} saved location{locations.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container px-4 md:px-6 py-6">
        {locations.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {locations.map((location, index) => (
              <Card
                key={location.id}
                onClick={() => handleLocationClick(location.placeId)}
                className="group cursor-pointer hover:border-primary/30 hover:shadow-card transition-all duration-300 animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-12 h-12 bg-primary/10 rounded-lg flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                      <MapPin className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                          {location.name}
                        </h3>
                        <Star className="w-4 h-4 text-terracotta fill-terracotta flex-shrink-0" />
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 truncate">
                        {location.address}
                      </p>
                      <div className="flex items-center justify-between mt-3">
                        <span className="text-xs px-2 py-1 bg-secondary rounded-full text-muted-foreground">
                          {location.type}
                        </span>
                        <button
                          onClick={(e) => handleRemove(e, location.id, location.name)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-destructive/10 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mb-6">
              <MapPin className="w-10 h-10 text-muted-foreground opacity-50" />
            </div>
            <h2 className="text-xl font-display font-bold text-foreground mb-2">
              No saved locations yet
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md">
              Search for destinations and save them to quickly access them later
            </p>
            <Link to="/">
              <Button variant="hero">
                Search Locations
              </Button>
            </Link>
          </div>
        )}
      </main>
    </div>
  );
};

export default SavedLocations;
