import { useState } from "react";
import { MapPin, CaretRight, Trash } from "@phosphor-icons/react";
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
      description: "Removed from saved locations",
    });
  };

  const handleViewAll = () => {
    navigate('/saved');
  };

  // Don't render the section if there are no saved locations
  if (locations.length === 0) {
    return null;
  }

  return (
    <section className="w-full max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Saved Locations</h2>
          <p className="text-muted-foreground mt-1">
            {locations.length} saved location{locations.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="ghost" className="text-primary font-medium" onClick={handleViewAll}>
          View All
          <CaretRight className="w-4 h-4" />
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
        description="Are you sure you want to remove this saved location?"
        itemName={deleteModal.name}
      />
    </section>
  );
};
