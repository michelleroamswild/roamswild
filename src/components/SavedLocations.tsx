import { useState } from "react";
import { MapPin, CaretRight, Trash, Compass, Heart, MagnifyingGlass } from "@phosphor-icons/react";
import { Button } from "./ui/button";
import { useSavedLocations } from "@/context/SavedLocationsContext";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";

export const SavedLocations = () => {
  const { locations, removeLocation } = useSavedLocations();
  const navigate = useNavigate();
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string; name: string }>({
    isOpen: false,
    id: '',
    name: '',
  });

  const handleRemoveClick = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    e.preventDefault();
    setDeleteModal({ isOpen: true, id, name });
  };

  const handleConfirmDelete = () => {
    removeLocation(deleteModal.id);
    toast.success(`Removed ${deleteModal.name}`, {
      description: "Removed from favorites",
    });
  };

  const handleViewAll = () => {
    navigate('/saved');
  };

  // Empty state when no saved locations
  if (locations.length === 0) {
    return (
      <section className="w-full max-w-4xl mx-auto">
        <div className="mb-6 text-center">
          <h2 className="font-display font-bold text-foreground">Favorites</h2>
        </div>

        <div className="py-8 md:py-12">
          <div className="max-w-md mx-auto text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <MapPin className="w-8 h-8 text-primary" weight="fill" />
            </div>

            <h3 className="font-display font-bold text-xl text-foreground mb-3">
              Save places you love
            </h3>
            <p className="text-muted-foreground mb-8">
              Search for a destination and save it to quickly access trip ideas, local conditions, and more.
            </p>

            <div className="space-y-4 inline-block text-left">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <MagnifyingGlass className="w-5 h-5 text-accent" weight="bold" />
                </div>
                <span className="text-sm text-foreground">Search for any destination</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <Heart className="w-5 h-5 text-accent" weight="fill" />
                </div>
                <span className="text-sm text-foreground">Click the heart to save it</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <Compass className="w-5 h-5 text-accent" weight="fill" />
                </div>
                <span className="text-sm text-foreground">Access it anytime from here</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full max-w-4xl mx-auto">
      <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:text-left sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="font-display font-bold text-foreground">Favorites</h2>
          <p className="text-muted-foreground mt-1">
            {locations.length} favorite location{locations.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="tertiary" size="sm" className="text-foreground border-border hover:border-primary hover:bg-primary/10" onClick={handleViewAll}>
          View All
          <CaretRight className="w-4 h-4 ml-1" weight="bold" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {locations.slice(0, 4).map((location, index) => (
          <Link
            key={location.id}
            to={`/location/${location.placeId}`}
            state={{
              placeId: location.placeId,
              name: location.name,
              address: location.address,
              lat: location.lat,
              lng: location.lng,
            }}
            className="group flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:border-primary/30 hover:shadow-card transition-all duration-300 animate-fade-in"
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
                {location.address && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-sm text-muted-foreground truncate">{location.address}</span>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={(e) => handleRemoveClick(e, location.id, location.name)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-destructive/10 rounded-lg"
            >
              <Trash className="w-4 h-4 text-destructive" />
            </button>
          </Link>
        ))}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: '', name: '' })}
        onConfirm={handleConfirmDelete}
        title="Remove Location"
        description="Are you sure you want to remove this favorite location?"
        itemName={deleteModal.name}
      />
    </section>
  );
};
