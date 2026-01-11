import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Route,
  Clock,
  Calendar,
  Trash2,
  MapPin,
  ChevronRight,
  Users,
  Share2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useTrip } from '@/context/TripContext';
import { toast } from 'sonner';
import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal';
import { GeneratedTrip } from '@/types/trip';
import { useAuth } from '@/context/AuthContext';

interface TripWithMeta extends GeneratedTrip {
  isShared: boolean;
}

const MyTrips = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { savedTrips, sharedTrips, loadSavedTrip, deleteSavedTrip } = useTrip();
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; tripId: string; tripName: string }>({
    isOpen: false,
    tripId: '',
    tripName: '',
  });

  // Combine and sort all trips
  const allTrips = useMemo(() => {
    const owned: TripWithMeta[] = savedTrips.map(t => ({ ...t, isShared: false }));
    const shared: TripWithMeta[] = sharedTrips.map(t => ({ ...t, isShared: true }));

    return [...owned, ...shared].sort((a, b) => {
      // Sort by start date first (upcoming trips first)
      const aDate = a.config.startDate ? new Date(a.config.startDate).getTime() : null;
      const bDate = b.config.startDate ? new Date(b.config.startDate).getTime() : null;

      // Trips with start dates come before trips without
      if (aDate && !bDate) return -1;
      if (!aDate && bDate) return 1;

      // Both have start dates - sort by date (ascending - upcoming first)
      if (aDate && bDate) return aDate - bDate;

      // Neither has start date - sort by creation date (newest first)
      const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bCreated - aCreated;
    });
  }, [savedTrips, sharedTrips]);

  const handleTripClick = (tripId: string) => {
    loadSavedTrip(tripId);
    navigate(`/trip/${tripId}`);
  };

  const handleDeleteClick = (e: React.MouseEvent, tripId: string, tripName: string) => {
    e.stopPropagation();
    setDeleteModal({ isOpen: true, tripId, tripName: tripName || 'Untitled Trip' });
  };

  const handleConfirmDelete = () => {
    deleteSavedTrip(deleteModal.tripId);
    toast.success(`Deleted "${deleteModal.tripName}"`, {
      description: 'Trip removed from your saved trips',
    });
  };

  return (
    <div className="min-h-screen bg-background topo-pattern">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container px-4 md:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="icon" className="rounded-full">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-display font-bold text-foreground">My Trips</h1>
                <p className="text-sm text-muted-foreground">
                  {allTrips.length} {allTrips.length === 1 ? 'trip' : 'trips'}
                </p>
              </div>
            </div>
            <Link to="/create-trip">
              <Button variant="hero" size="sm">
                <Plus className="w-4 h-4 mr-1" />
                New Trip
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container px-4 md:px-6 py-8 max-w-4xl mx-auto">
        {allTrips.length === 0 ? (
          <div className="text-center py-16">
            <div className="flex items-center justify-center w-20 h-20 bg-secondary rounded-full mx-auto mb-6">
              <Route className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-display font-bold text-foreground mb-2">
              No saved trips yet
            </h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Create your first trip to start planning your next adventure. We'll save your
              campsites, hikes, and itinerary.
            </p>
            <Link to="/create-trip">
              <Button variant="hero" size="lg">
                <Plus className="w-5 h-5 mr-2" />
                Create Your First Trip
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {allTrips.map((trip, index) => (
              <Card
                key={trip.id}
                className="group hover:border-primary/30 hover:shadow-card transition-all duration-300 cursor-pointer animate-fade-in overflow-hidden"
                style={{ animationDelay: `${index * 50}ms` }}
                onClick={() => handleTripClick(trip.id)}
              >
                <CardContent className="p-0">
                  <div className="flex items-stretch">
                    {/* Left accent bar - blue for shared with you, emerald for sharing, primary for owned */}
                    <div className={`w-1.5 ${
                      trip.isShared
                        ? 'bg-blue-500'
                        : (trip.collaboratorCount && trip.collaboratorCount > 0)
                          ? 'bg-emerald-500'
                          : 'bg-primary'
                    }`} />

                    <div className="flex-1 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-display font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                              {trip.config.name || 'Untitled Trip'}
                            </h3>
                            {trip.isShared ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 text-blue-600 rounded-full text-xs font-medium flex-shrink-0">
                                <Users className="w-3 h-3" />
                                Shared with you
                              </span>
                            ) : (trip.collaboratorCount && trip.collaboratorCount > 0) ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-600 rounded-full text-xs font-medium flex-shrink-0">
                                <Share2 className="w-3 h-3" />
                                Sharing
                              </span>
                            ) : null}
                          </div>

                          {/* Start/Base location */}
                          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                            <MapPin className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">
                              {trip.config.baseLocation
                                ? `Exploring ${trip.config.baseLocation.name}`
                                : trip.config.startLocation?.name
                                  ? `From ${trip.config.startLocation.name}`
                                  : 'Trip'}
                            </span>
                          </div>

                          {/* Destinations - only show for owned trips */}
                          {!trip.isShared && trip.config.destinations && trip.config.destinations.length > 0 && (
                            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                              <Route className="w-4 h-4 flex-shrink-0" />
                              <span className="truncate">
                                {trip.config.destinations.length}{' '}
                                {trip.config.destinations.length === 1
                                  ? 'destination'
                                  : 'destinations'}
                                {trip.config.returnToStart && ' (round trip)'}
                              </span>
                            </div>
                          )}

                          {/* Stats */}
                          <div className="flex items-center flex-wrap gap-x-4 gap-y-2 mt-3 text-sm">
                            {trip.config.startDate && (
                              <span className="flex items-center gap-1.5 text-foreground font-medium">
                                <Calendar className="w-4 h-4 text-primary" />
                                {new Date(trip.config.startDate).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </span>
                            )}
                            <span className="flex items-center gap-1.5 text-foreground font-medium">
                              <Clock className="w-4 h-4 text-muted-foreground" />
                              {trip.days.length} {trip.days.length === 1 ? 'day' : 'days'}
                            </span>
                            <span className="flex items-center gap-1.5 text-foreground font-medium">
                              <Route className="w-4 h-4 text-terracotta" />
                              {trip.totalDistance}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          {!trip.isShared && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => handleDeleteClick(e, trip.id, trip.config.name)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, tripId: '', tripName: '' })}
        onConfirm={handleConfirmDelete}
        title="Delete Trip"
        description="Are you sure you want to delete this trip? This action cannot be undone."
        itemName={deleteModal.tripName}
      />
    </div>
  );
};

export default MyTrips;
