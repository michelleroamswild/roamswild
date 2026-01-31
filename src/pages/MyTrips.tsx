import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Path,
  Clock,
  Calendar,
  Trash,
  MapPinArea,
  DotsThreeVertical,
  Users,
  ShareNetwork,
  SpinnerGap,
  SortAscending,
  ClockCounterClockwise,
  CalendarCheck,
  CheckCircle,
  PencilSimpleLine,
  ArrowRight,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTrip } from '@/context/TripContext';
import { useTripDraft } from '@/hooks/use-trip-draft';
import { toast } from 'sonner';
import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal';
import { GeneratedTrip } from '@/types/trip';
import { useAuth } from '@/context/AuthContext';
import { getTripUrl } from '@/utils/slugify';
import { Header } from '@/components/Header';

interface TripWithMeta extends GeneratedTrip {
  isShared: boolean;
}

type TabType = 'upcoming' | 'past';

const MyTrips = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { savedTrips, sharedTrips, loadSavedTrip, deleteSavedTrip, markTripComplete, isLoading } = useTrip();
  const { draft, loading: draftLoading, deleteDraft, hasDraft } = useTripDraft();
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; tripId: string; tripName: string }>({
    isOpen: false,
    tripId: '',
    tripName: '',
  });
  const [sortBy, setSortBy] = useState<'trip-date' | 'name-asc' | 'name-desc' | 'created-newest' | 'created-oldest'>('trip-date');
  const [activeTab, setActiveTab] = useState<TabType>('upcoming');

  // Helper to get today's date at midnight for comparisons
  const getToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  };

  // Helper to check if a trip is currently active (today is between start and end date)
  const isTripCurrent = (trip: TripWithMeta): boolean => {
    // Manually completed trips are not current
    if (trip.config.completedAt) return false;

    if (!trip.config.startDate) return false;

    const startDate = new Date(trip.config.startDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + (trip.config.duration || trip.days.length) - 1);

    const today = getToday();
    return today >= startDate && today <= endDate;
  };

  // Helper to check if a trip is in the past (manually completed or dates passed)
  const isTripPast = (trip: TripWithMeta): boolean => {
    // Manually marked as complete
    if (trip.config.completedAt) return true;

    if (!trip.config.startDate) return false; // No date = not past

    // Calculate end date (start date + duration - 1 day)
    const startDate = new Date(trip.config.startDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + (trip.config.duration || trip.days.length) - 1);

    // Trip is past if end date is before today
    const today = getToday();
    return endDate < today;
  };

  // Sort function for trips
  const sortTrips = (trips: TripWithMeta[], isPastTab: boolean) => {
    return [...trips].sort((a, b) => {
      switch (sortBy) {
        case 'name-asc': {
          const aName = (a.config.name || 'Untitled Trip').toLowerCase();
          const bName = (b.config.name || 'Untitled Trip').toLowerCase();
          return aName.localeCompare(bName);
        }
        case 'name-desc': {
          const aName = (a.config.name || 'Untitled Trip').toLowerCase();
          const bName = (b.config.name || 'Untitled Trip').toLowerCase();
          return bName.localeCompare(aName);
        }
        case 'created-newest': {
          const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bCreated - aCreated;
        }
        case 'created-oldest': {
          const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return aCreated - bCreated;
        }
        case 'trip-date':
        default: {
          const aDate = a.config.startDate ? new Date(a.config.startDate).getTime() : null;
          const bDate = b.config.startDate ? new Date(b.config.startDate).getTime() : null;

          // Trips with start dates come before trips without
          if (aDate && !bDate) return -1;
          if (!aDate && bDate) return 1;

          // Both have start dates
          if (aDate && bDate) {
            // Past trips: most recent first (descending)
            // Upcoming trips: soonest first (ascending)
            return isPastTab ? bDate - aDate : aDate - bDate;
          }

          // Neither has start date - sort by creation date (newest first)
          const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bCreated - aCreated;
        }
      }
    });
  };

  // Combine all trips
  const allTripsRaw = useMemo(() => {
    const owned: TripWithMeta[] = savedTrips.map(t => ({ ...t, isShared: false }));
    const shared: TripWithMeta[] = sharedTrips.map(t => ({ ...t, isShared: true }));
    return [...owned, ...shared];
  }, [savedTrips, sharedTrips]);

  // Split into current, upcoming and past trips
  const { currentTrips, upcomingTrips, pastTrips } = useMemo(() => {
    const current: TripWithMeta[] = [];
    const upcoming: TripWithMeta[] = [];
    const past: TripWithMeta[] = [];

    for (const trip of allTripsRaw) {
      if (isTripCurrent(trip)) {
        current.push(trip);
      } else if (isTripPast(trip)) {
        past.push(trip);
      } else {
        upcoming.push(trip);
      }
    }

    return {
      currentTrips: sortTrips(current, false),
      upcomingTrips: sortTrips(upcoming, false),
      pastTrips: sortTrips(past, true),
    };
  }, [allTripsRaw, sortBy]);

  // Get the trips to display based on active tab
  const displayedTrips = activeTab === 'upcoming' ? upcomingTrips : pastTrips;

  const handleTripClick = (trip: TripWithMeta) => {
    loadSavedTrip(trip.id);
    navigate(getTripUrl(trip.config.name));
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

  const handleMarkComplete = async (e: React.MouseEvent, trip: TripWithMeta) => {
    e.stopPropagation();
    const isComplete = !!trip.config.completedAt;
    try {
      await markTripComplete(trip.id, !isComplete);
      toast.success(isComplete ? 'Trip marked as active' : 'Trip marked as complete', {
        description: isComplete
          ? `"${trip.config.name}" moved back to upcoming trips`
          : `"${trip.config.name}" moved to past trips`,
      });
    } catch (error) {
      toast.error('Failed to update trip');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container px-4 md:px-6 py-8 max-w-4xl mx-auto">
        {/* Page Title */}
        <div className="mb-6">
          <h1 className="text-3xl font-display font-bold text-foreground">My Trips</h1>
          <p className="text-muted-foreground mt-1">
            {allTripsRaw.length} {allTripsRaw.length === 1 ? 'trip' : 'trips'} saved
          </p>
        </div>

        {/* Draft In Progress Banner */}
        {!draftLoading && hasDraft && draft && (
          <div className="mb-8">
            <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <PencilSimpleLine className="w-4 h-4" />
              Draft In Progress
            </h2>
            <Card className="group border-2 border-dashed border-amber-500/50 bg-amber-500/5 hover:border-amber-500 hover:shadow-card transition-all duration-300 overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-stretch">
                  <div className="w-1.5 bg-amber-500" />
                  <div className="flex-1 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-display font-semibold text-foreground group-hover:text-amber-600 transition-colors">
                            {draft.wizard_state.tripName || 'Untitled Trip'}
                          </h3>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-600 rounded-full text-xs font-medium flex-shrink-0">
                            Draft
                          </span>
                        </div>

                        <p className="text-sm text-muted-foreground mt-2">
                          {draft.wizard_state.buildMethod === 'manual'
                            ? `Building day by day - ${draft.wizard_state.duration?.[0] || 3} day trip`
                            : draft.wizard_state.buildMethod === 'ai'
                              ? `AI-assisted planning - ${draft.wizard_state.destinations?.length || 0} destinations`
                              : `${draft.wizard_state.duration?.[0] || 3} day trip`}
                        </p>

                        <p className="text-xs text-muted-foreground mt-2">
                          Last edited {new Date(draft.updated_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteDraft();
                            toast.success('Draft discarded');
                          }}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash className="w-4 h-4" />
                        </Button>
                        <Link to="/create-trip">
                          <Button variant="primary" size="sm" className="gap-2">
                            Continue
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Current Trip Banner */}
        {!isLoading && currentTrips.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Current Trip
            </h2>
            {currentTrips.map((trip) => {
              // Calculate which day of the trip we're on
              const startDate = new Date(trip.config.startDate!);
              startDate.setHours(0, 0, 0, 0);
              const today = getToday();
              const dayNumber = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
              const totalDays = trip.config.duration || trip.days.length;

              return (
                <Card
                  key={trip.id}
                  className="group border-2 border-emerald-500/50 bg-emerald-500/5 hover:border-emerald-500 hover:shadow-card transition-all duration-300 cursor-pointer overflow-hidden"
                  onClick={() => handleTripClick(trip)}
                >
                  <CardContent className="p-0">
                    <div className="flex items-stretch">
                      <div className="w-1.5 bg-emerald-500" />
                      <div className="flex-1 p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="text-lg font-display font-semibold text-foreground group-hover:text-emerald-600 transition-colors truncate">
                                {trip.config.name || 'Untitled Trip'}
                              </h3>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-600 rounded-full text-xs font-medium flex-shrink-0">
                                Day {dayNumber} of {totalDays}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                              <MapPinArea className="w-4 h-4 flex-shrink-0" />
                              <span className="truncate">
                                {trip.config.baseLocation
                                  ? `Exploring ${trip.config.baseLocation.name}`
                                  : trip.config.startLocation?.name
                                    ? `From ${trip.config.startLocation.name}`
                                    : 'Trip'}
                              </span>
                            </div>

                            <div className="flex items-center flex-wrap gap-x-4 gap-y-2 mt-3 text-sm">
                              <span className="flex items-center gap-1.5 text-foreground font-medium">
                                <Calendar className="w-4 h-4 text-emerald-500" />
                                {new Date(trip.config.startDate!).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                })} - {new Date(new Date(trip.config.startDate!).getTime() + (totalDays - 1) * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                              <span className="flex items-center gap-1.5 text-foreground font-medium">
                                <Path className="w-4 h-4 text-terracotta" />
                                {trip.totalDistance}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center">
                            {!trip.isShared ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                                  >
                                    <DotsThreeVertical className="w-5 h-5" weight="bold" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenuItem
                                    onClick={(e) => handleMarkComplete(e as unknown as React.MouseEvent, trip)}
                                    className="cursor-pointer"
                                  >
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    Mark as Complete
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={(e) => handleDeleteClick(e as unknown as React.MouseEvent, trip.id, trip.config.name)}
                                    className="cursor-pointer text-destructive focus:text-destructive"
                                  >
                                    <Trash className="w-4 h-4 mr-2" />
                                    Delete Trip
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : (
                              <div className="w-8" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Tabs and Sort */}
        {!isLoading && allTripsRaw.length > 0 && (
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('upcoming')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                  activeTab === 'upcoming'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <CalendarCheck className="w-4 h-4" />
                Upcoming
                {upcomingTrips.length > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                    activeTab === 'upcoming' ? 'bg-primary-foreground/20' : 'bg-muted-foreground/20'
                  }`}>
                    {upcomingTrips.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('past')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                  activeTab === 'past'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <ClockCounterClockwise className="w-4 h-4" />
                Past Trips
                {pastTrips.length > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                    activeTab === 'past' ? 'bg-primary-foreground/20' : 'bg-muted-foreground/20'
                  }`}>
                    {pastTrips.length}
                  </span>
                )}
              </button>
            </div>
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
              <SelectTrigger className="w-[160px] h-9 text-sm">
                <div className="flex items-center gap-2">
                  <SortAscending className="w-4 h-4 text-muted-foreground" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trip-date">Trip Date</SelectItem>
                <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                <SelectItem value="created-newest">Newest First</SelectItem>
                <SelectItem value="created-oldest">Oldest First</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-16">
            <div className="flex items-center justify-center w-20 h-20 bg-secondary rounded-full mx-auto mb-6">
              <SpinnerGap className="w-10 h-10 text-primary animate-spin" />
            </div>
            <h2 className="text-xl font-display font-medium text-muted-foreground">
              Loading your trips...
            </h2>
          </div>
        ) : allTripsRaw.length === 0 ? (
          <div className="text-center py-16">
            <div className="flex items-center justify-center w-20 h-20 bg-secondary rounded-full mx-auto mb-6">
              <Path className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="font-display font-bold text-foreground mb-2">
              No saved trips yet
            </h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Create your first trip to start planning your next adventure. We'll save your
              campsites, hikes, and itinerary.
            </p>
            <Link to="/create-trip">
              <Button variant="primary" size="lg">
                <Path className="w-5 h-5 mr-2" weight="bold" />
                Create your first trip
              </Button>
            </Link>
          </div>
        ) : displayedTrips.length === 0 ? (
          <div className="text-center py-16">
            <div className="flex items-center justify-center w-20 h-20 bg-secondary rounded-full mx-auto mb-6">
              {activeTab === 'upcoming' ? (
                <CalendarCheck className="w-10 h-10 text-muted-foreground" />
              ) : (
                <ClockCounterClockwise className="w-10 h-10 text-muted-foreground" />
              )}
            </div>
            <h2 className="font-display font-bold text-foreground mb-2">
              {activeTab === 'upcoming' ? 'No upcoming trips' : 'No past trips'}
            </h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              {activeTab === 'upcoming'
                ? 'You don\'t have any upcoming trips planned. Create a new trip or add dates to existing trips.'
                : 'You don\'t have any past trips yet. Trips will appear here after their end date has passed.'}
            </p>
            {activeTab === 'upcoming' && (
              <Link to="/create-trip">
                <Button variant="primary" size="lg">
                  <Plus className="w-5 h-5 mr-2" weight="bold" />
                  Plan a New Trip
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {displayedTrips.map((trip, index) => (
              <Card
                key={trip.id}
                className="group hover:border-primary/30 hover:shadow-card transition-all duration-300 cursor-pointer animate-fade-in overflow-hidden"
                style={{ animationDelay: `${index * 50}ms` }}
                onClick={() => handleTripClick(trip)}
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
                                <ShareNetwork className="w-3 h-3" />
                                Sharing
                              </span>
                            ) : trip.config.completedAt ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted text-muted-foreground rounded-full text-xs font-medium flex-shrink-0">
                                <CheckCircle className="w-3 h-3" weight="fill" />
                                Completed
                              </span>
                            ) : null}
                          </div>

                          {/* Start/Base location */}
                          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                            <MapPinArea className="w-4 h-4 flex-shrink-0" />
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
                              <Path className="w-4 h-4 flex-shrink-0" />
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
                              <Path className="w-4 h-4 text-terracotta" />
                              {trip.totalDistance}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center">
                          {!trip.isShared ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                >
                                  <DotsThreeVertical className="w-5 h-5" weight="bold" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                <DropdownMenuItem
                                  onClick={(e) => handleMarkComplete(e as unknown as React.MouseEvent, trip)}
                                  className="cursor-pointer"
                                >
                                  <CheckCircle className={`w-4 h-4 mr-2 ${trip.config.completedAt ? 'text-emerald-600' : ''}`} weight={trip.config.completedAt ? 'fill' : 'regular'} />
                                  {trip.config.completedAt ? 'Mark as Active' : 'Mark as Complete'}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e) => handleDeleteClick(e as unknown as React.MouseEvent, trip.id, trip.config.name)}
                                  className="cursor-pointer text-destructive focus:text-destructive"
                                >
                                  <Trash className="w-4 h-4 mr-2" />
                                  Delete Trip
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <div className="w-8" />
                          )}
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
