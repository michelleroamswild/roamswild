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
  Mountains,
} from '@phosphor-icons/react';
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
import { getTripUrl } from '@/utils/slugify';
import { Header } from '@/components/Header';
import { Mono, Pill, Tag } from '@/components/redesign';
import { cn } from '@/lib/utils';

interface TripWithMeta extends GeneratedTrip {
  isShared: boolean;
}

type TabType = 'upcoming' | 'past';

// 2026 redesign — Pine + Paper. Hero strip on cream → trips list on paper-2.
// Status colors: clay (draft / shared with you), pine (current / sharing),
// muted ink (completed). No more amber/emerald/blue.
const MyTrips = () => {
  const navigate = useNavigate();
  const { savedTrips, sharedTrips, loadSavedTrip, deleteSavedTrip, markTripComplete, isLoading } = useTrip();
  const { draft, loading: draftLoading, deleteDraft, hasDraft } = useTripDraft();
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; tripId: string; tripName: string }>({
    isOpen: false,
    tripId: '',
    tripName: '',
  });
  const [sortBy, setSortBy] = useState<'trip-date' | 'name-asc' | 'name-desc' | 'created-newest' | 'created-oldest'>('trip-date');
  const [activeTab, setActiveTab] = useState<TabType>('upcoming');

  const getToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  };

  const isTripCurrent = (trip: TripWithMeta): boolean => {
    if (trip.config.completedAt) return false;
    if (!trip.config.startDate) return false;
    const startDate = new Date(trip.config.startDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + (trip.config.duration || trip.days.length) - 1);
    const today = getToday();
    return today >= startDate && today <= endDate;
  };

  const isTripPast = (trip: TripWithMeta): boolean => {
    if (trip.config.completedAt) return true;
    if (!trip.config.startDate) return false;
    const startDate = new Date(trip.config.startDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + (trip.config.duration || trip.days.length) - 1);
    const today = getToday();
    return endDate < today;
  };

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
          if (aDate && !bDate) return -1;
          if (!aDate && bDate) return 1;
          if (aDate && bDate) return isPastTab ? bDate - aDate : aDate - bDate;
          const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bCreated - aCreated;
        }
      }
    });
  };

  const allTripsRaw = useMemo(() => {
    const owned: TripWithMeta[] = savedTrips.map((t) => ({ ...t, isShared: false }));
    const shared: TripWithMeta[] = sharedTrips.map((t) => ({ ...t, isShared: true }));
    return [...owned, ...shared];
  }, [savedTrips, sharedTrips]);

  const { currentTrips, upcomingTrips, pastTrips } = useMemo(() => {
    const current: TripWithMeta[] = [];
    const upcoming: TripWithMeta[] = [];
    const past: TripWithMeta[] = [];
    for (const trip of allTripsRaw) {
      if (isTripCurrent(trip)) current.push(trip);
      else if (isTripPast(trip)) past.push(trip);
      else upcoming.push(trip);
    }
    return {
      currentTrips: sortTrips(current, false),
      upcomingTrips: sortTrips(upcoming, false),
      pastTrips: sortTrips(past, true),
    };
  }, [allTripsRaw, sortBy]);

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

  const totalCount = allTripsRaw.length;

  return (
    <div className="bg-cream dark:bg-paper text-ink font-sans min-h-screen">
      <Header />

      {/* === Hero strip — cream, page title + count + New Trip CTA === */}
      <section className="relative overflow-hidden bg-cream dark:bg-paper-2 -mt-16 md:-mt-20">
        <div className="relative max-w-[1440px] mx-auto px-6 md:px-14 pt-28 md:pt-36 pb-10 md:pb-14">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <Mono className="text-pine-6">
                {totalCount} {totalCount === 1 ? 'TRIP SAVED' : 'TRIPS SAVED'}
                {upcomingTrips.length > 0 && ` · ${upcomingTrips.length} UPCOMING`}
                {currentTrips.length > 0 && ` · ${currentTrips.length} ACTIVE`}
              </Mono>
              <h1 className="font-sans font-bold tracking-[-0.035em] leading-[1] text-[44px] md:text-[64px] m-0 text-ink mt-2.5">
                Your trips.
              </h1>
            </div>
            <Pill variant="solid-pine" mono={false} onClick={() => navigate('/create-trip')}>
              <Plus size={13} weight="bold" />
              New trip
            </Pill>
          </div>
        </div>
      </section>

      {/* === List section — paper-2 surface === */}
      <section className="bg-paper-2 min-h-[calc(100vh-300px)]">
        <div className="max-w-[1440px] mx-auto px-6 md:px-14 py-10 md:py-14">

          {/* Draft banner — clay accent */}
          {!draftLoading && hasDraft && draft && (
            <div className="mb-8">
              <Mono className="text-clay mb-3 flex items-center gap-2">
                <PencilSimpleLine className="w-3.5 h-3.5" weight="regular" />
                Draft in progress
              </Mono>
              <div className="border border-clay/40 bg-clay/5 rounded-[14px] overflow-hidden">
                <div className="flex items-stretch">
                  <div className="w-1.5 bg-clay" />
                  <div className="flex-1 p-5 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[17px] font-sans font-semibold tracking-[-0.01em] text-ink truncate">
                          {draft.wizard_state.tripName || 'Untitled trip'}
                        </h3>
                        <Tag>Draft</Tag>
                      </div>
                      <p className="text-[13px] text-ink-3 mt-2">
                        {draft.wizard_state.buildMethod === 'manual'
                          ? `Building day by day · ${draft.wizard_state.duration?.[0] || 3} day trip`
                          : draft.wizard_state.buildMethod === 'ai'
                            ? `AI-assisted planning · ${draft.wizard_state.destinations?.length || 0} destinations`
                            : `${draft.wizard_state.duration?.[0] || 3} day trip`}
                      </p>
                      <p className="text-[12px] text-ink-3 mt-2 font-mono uppercase tracking-[0.10em]">
                        Last edited {new Date(draft.updated_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteDraft();
                          toast.success('Draft discarded');
                        }}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-full text-ink-3 hover:text-ember hover:bg-ember/10 transition-colors"
                        aria-label="Discard draft"
                      >
                        <Trash className="w-4 h-4" weight="regular" />
                      </button>
                      <Pill variant="solid-ink" mono={false} onClick={() => navigate('/create-trip')}>
                        Continue
                        <ArrowRight size={13} weight="bold" />
                      </Pill>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Current trip banner — pine accent */}
          {!isLoading && currentTrips.length > 0 && (
            <div className="mb-8">
              <Mono className="text-pine-6 mb-3 flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pine-5 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-pine-6" />
                </span>
                Current trip
              </Mono>
              {currentTrips.map((trip) => {
                const startDate = new Date(trip.config.startDate!);
                startDate.setHours(0, 0, 0, 0);
                const today = getToday();
                const dayNumber = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                const totalDays = trip.config.duration || trip.days.length;

                return (
                  <div
                    key={trip.id}
                    className="border border-pine-6/30 bg-pine-6/5 rounded-[14px] overflow-hidden cursor-pointer hover:border-pine-6 hover:shadow-[0_18px_44px_rgba(58,74,42,.12)] transition-all"
                    onClick={() => handleTripClick(trip)}
                  >
                    <div className="flex items-stretch">
                      <div className="w-1.5 bg-pine-6" />
                      <div className="flex-1 p-5 flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-[17px] font-sans font-semibold tracking-[-0.01em] text-ink truncate">
                              {trip.config.name || 'Untitled trip'}
                            </h3>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-pine-6 text-cream dark:text-ink-pine rounded-full text-[10px] font-mono font-semibold uppercase tracking-[0.10em]">
                              Day {dayNumber} of {totalDays}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-2 text-[13px] text-ink-3">
                            <MapPinArea className="w-3.5 h-3.5 flex-shrink-0" weight="regular" />
                            <span className="truncate">
                              {trip.config.baseLocation
                                ? `Exploring ${trip.config.baseLocation.name}`
                                : trip.config.startLocation?.name
                                  ? `From ${trip.config.startLocation.name}`
                                  : 'Trip'}
                            </span>
                          </div>
                          <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 mt-3 text-[12px] font-mono uppercase tracking-[0.10em] text-ink-3">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-pine-6" weight="regular" />
                              {new Date(trip.config.startDate!).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}
                              {' – '}
                              {new Date(new Date(trip.config.startDate!).getTime() + (totalDays - 1) * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Path className="w-3.5 h-3.5" weight="regular" />
                              {trip.totalDistance}
                            </span>
                          </div>
                        </div>
                        {!trip.isShared && (
                          <TripActionsMenu
                            trip={trip}
                            onMarkComplete={(e) => handleMarkComplete(e, trip)}
                            onDelete={(e) => handleDeleteClick(e, trip.id, trip.config.name)}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tabs and Sort */}
          {!isLoading && allTripsRaw.length > 0 && (
            <div className="flex items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setActiveTab('upcoming')}
                  className={cn(
                    "inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-sans font-semibold tracking-[-0.005em] transition-colors",
                    activeTab === 'upcoming'
                      ? 'bg-ink dark:bg-ink-pine text-cream hover:bg-ink-2'
                      : 'text-ink hover:bg-ink/5'
                  )}
                >
                  <CalendarCheck className="w-4 h-4" weight="regular" />
                  Upcoming
                  {upcomingTrips.length > 0 && (
                    <span className={cn(
                      "ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold tracking-[0.05em]",
                      activeTab === 'upcoming' ? 'bg-cream/20 dark:bg-paper-2/20 text-cream' : 'bg-ink/10 text-ink-3'
                    )}>
                      {upcomingTrips.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('past')}
                  className={cn(
                    "inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-sans font-semibold tracking-[-0.005em] transition-colors",
                    activeTab === 'past'
                      ? 'bg-ink dark:bg-ink-pine text-cream hover:bg-ink-2'
                      : 'text-ink hover:bg-ink/5'
                  )}
                >
                  <ClockCounterClockwise className="w-4 h-4" weight="regular" />
                  Past
                  {pastTrips.length > 0 && (
                    <span className={cn(
                      "ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold tracking-[0.05em]",
                      activeTab === 'past' ? 'bg-cream/20 dark:bg-paper-2/20 text-cream' : 'bg-ink/10 text-ink-3'
                    )}>
                      {pastTrips.length}
                    </span>
                  )}
                </button>
              </div>
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
                <SelectTrigger className="w-[180px] h-9 text-[13px] bg-white dark:bg-paper-2 border-line rounded-full px-4 [&_svg]:opacity-100">
                  <div className="flex items-center gap-2 text-ink">
                    <SortAscending className="w-4 h-4 text-ink-3" weight="regular" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent className="rounded-[12px] border-line bg-white [&_[data-highlighted]]:bg-cream dark:bg-paper-2 [&_[data-highlighted]]:text-ink">
                  <SelectItem value="trip-date">Trip date</SelectItem>
                  <SelectItem value="name-asc">Name (A–Z)</SelectItem>
                  <SelectItem value="name-desc">Name (Z–A)</SelectItem>
                  <SelectItem value="created-newest">Newest first</SelectItem>
                  <SelectItem value="created-oldest">Oldest first</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Loading / empty / list */}
          {isLoading ? (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-pine-6/10 rounded-full mb-4">
                <SpinnerGap className="w-6 h-6 text-pine-6 animate-spin" />
              </div>
              <p className="text-[14px] text-ink-3">Loading your trips…</p>
            </div>
          ) : allTripsRaw.length === 0 ? (
            <EmptyState
              icon={<Path className="w-6 h-6 text-pine-6" weight="regular" />}
              title="No trips yet"
              copy="Create custom road-trip itineraries with campsites, hikes, and scenic stops."
              ctaLabel="Plan your first trip"
              onCta={() => navigate('/create-trip')}
            />
          ) : displayedTrips.length === 0 ? (
            <EmptyState
              icon={
                activeTab === 'upcoming'
                  ? <CalendarCheck className="w-6 h-6 text-pine-6" weight="regular" />
                  : <ClockCounterClockwise className="w-6 h-6 text-pine-6" weight="regular" />
              }
              title={activeTab === 'upcoming' ? 'No upcoming trips' : 'No past trips'}
              copy={
                activeTab === 'upcoming'
                  ? "You don't have any upcoming trips planned. Create a new trip or add dates to existing ones."
                  : "You don't have any past trips yet. Trips will appear here after their end date has passed."
              }
              ctaLabel={activeTab === 'upcoming' ? 'Plan a new trip' : undefined}
              onCta={activeTab === 'upcoming' ? () => navigate('/create-trip') : undefined}
            />
          ) : (
            <div className="space-y-3">
              {displayedTrips.map((trip) => (
                <TripRow
                  key={trip.id}
                  trip={trip}
                  onClick={() => handleTripClick(trip)}
                  onMarkComplete={(e) => handleMarkComplete(e, trip)}
                  onDelete={(e) => handleDeleteClick(e, trip.id, trip.config.name)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-cream dark:bg-paper-2 border-t border-line px-6 md:px-14 py-10 flex flex-wrap items-center justify-between gap-4">
        <Mono>ROAMSWILD · OFF-GRID CAMPING · 2026</Mono>
        <div className="flex flex-wrap gap-6 text-[13px] text-ink-3">
          <Link to="/about" className="hover:text-ink transition-colors">Field notes</Link>
          <Link to="/how-we-map" className="hover:text-ink transition-colors">How we map</Link>
          <Link to="/submit-spot" className="hover:text-ink transition-colors">Submit a spot</Link>
          <Link to="/privacy" className="hover:text-ink transition-colors">Privacy</Link>
        </div>
      </footer>

      <ConfirmDeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, tripId: '', tripName: '' })}
        onConfirm={handleConfirmDelete}
        title="Delete trip"
        description="Are you sure you want to delete this trip? This action cannot be undone."
        itemName={deleteModal.tripName}
      />
    </div>
  );
};

// Reusable trip-row card. Left accent bar color encodes ownership: water (shared
// with you), pine (you're sharing with someone), ink (solo). All on a white
// surface with a thin line — matches the home Index trips section.
const TripRow = ({
  trip,
  onClick,
  onMarkComplete,
  onDelete,
}: {
  trip: TripWithMeta;
  onClick: () => void;
  onMarkComplete: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}) => {
  // All three options are accent-palette colors. Solo (most common) gets sage
  // — calm and neutral; shared/collaborating variants get the more distinctive
  // water/clay so they stand out in a list of mostly-solo trips.
  const accent = trip.isShared
    ? 'bg-water'
    : (trip.collaboratorCount ?? 0) > 0
      ? 'bg-clay'
      : 'bg-sage';

  // Roll up stop counts so we can show "3 hikes · 5 camps" inline.
  let hikeCount = 0;
  let campCount = 0;
  let viewpointCount = 0;
  for (const day of trip.days) {
    for (const stop of day.stops) {
      if (stop.type === 'hike') hikeCount++;
      else if (stop.type === 'camp') campCount++;
      else if (stop.type === 'viewpoint') viewpointCount++;
    }
  }

  // Resolve a clean date range when both ends are known.
  const startDate = trip.config.startDate ? new Date(trip.config.startDate) : null;
  const totalDays = trip.config.duration || trip.days.length;
  const endDate = startDate
    ? new Date(startDate.getTime() + (totalDays - 1) * 24 * 60 * 60 * 1000)
    : null;
  const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const dateLabel = startDate && endDate
    ? startDate.getMonth() === endDate.getMonth()
      ? `${fmtDate(startDate)} – ${endDate.getDate()}`
      : `${fmtDate(startDate)} – ${fmtDate(endDate)}`
    : null;

  // Build a compact route preview when there are multiple destinations.
  // "St. George → Zion → Bryce" — capped at 3 to avoid overflow.
  const destNames = (trip.config.destinations ?? []).map((d) => d.name.split(',')[0].trim());
  const routePreview = destNames.length >= 2
    ? destNames.slice(0, 3).join(' → ') + (destNames.length > 3 ? ` → +${destNames.length - 3}` : '') + (trip.config.returnToStart ? ' ↺' : '')
    : null;

  // Tag chips: vehicle, lodging, top activity. Only render if set.
  const chips: string[] = [];
  if (trip.config.vehicleType) {
    chips.push(VEHICLE_LABEL[trip.config.vehicleType] ?? trip.config.vehicleType);
  }
  if (trip.config.lodgingPreference) {
    chips.push(LODGING_LABEL[trip.config.lodgingPreference] ?? trip.config.lodgingPreference);
  }
  if (trip.config.activities?.[0]) {
    chips.push(trip.config.activities[0]);
  }
  if (trip.config.pacePreference) {
    chips.push(`${trip.config.pacePreference} pace`);
  }

  // Build the right-side stat lines as data so we can map them.
  // Each renders as a single icon+text row, right-aligned on desktop.
  const statLines: { icon: typeof Calendar; text: string; tint?: string }[] = [];
  if (dateLabel) statLines.push({ icon: Calendar, text: dateLabel, tint: 'text-pine-6' });
  const daysDist = [
    `${trip.days.length} ${trip.days.length === 1 ? 'day' : 'days'}`,
    trip.totalDistance,
  ].filter(Boolean).join(' · ');
  if (daysDist) statLines.push({ icon: Clock, text: daysDist });
  if (trip.totalDrivingTime) statLines.push({ icon: Path, text: `${trip.totalDrivingTime} driving` });
  const stopBits = [
    hikeCount > 0 && `${hikeCount} ${hikeCount === 1 ? 'hike' : 'hikes'}`,
    campCount > 0 && `${campCount} ${campCount === 1 ? 'camp' : 'camps'}`,
    viewpointCount > 0 && `${viewpointCount} ${viewpointCount === 1 ? 'view' : 'views'}`,
  ].filter(Boolean).join(' · ');
  if (stopBits) statLines.push({ icon: Mountains, text: stopBits });

  return (
    <div
      onClick={onClick}
      className="border border-line dark:border-line-2 bg-white dark:bg-ink-pine rounded-[14px] overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(29,34,24,.10),0_3px_8px_rgba(29,34,24,.04)]"
    >
      <div className="flex items-stretch">
        <div className={cn("w-1.5", accent)} />
        <div className="flex-1 p-5 flex items-start gap-4">
          {/* Identity column (title, location, route, chips) + stats column,
              spread horizontally on desktop, stacked on mobile. */}
          <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-start md:gap-8">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[17px] font-sans font-semibold tracking-[-0.01em] text-ink truncate">
                  {trip.config.name || 'Untitled trip'}
                </h3>
                {trip.isShared ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-water/15 text-water rounded-full text-[10px] font-mono font-semibold uppercase tracking-[0.10em]">
                    <Users className="w-3 h-3" weight="regular" />
                    Shared
                  </span>
                ) : (trip.collaboratorCount ?? 0) > 0 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-pine-6/10 text-pine-6 rounded-full text-[10px] font-mono font-semibold uppercase tracking-[0.10em]">
                    <ShareNetwork className="w-3 h-3" weight="regular" />
                    Sharing · {trip.collaboratorCount}
                  </span>
                ) : trip.config.completedAt ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-ink/10 text-ink-3 rounded-full text-[10px] font-mono font-semibold uppercase tracking-[0.10em]">
                    <CheckCircle className="w-3 h-3" weight="fill" />
                    Done
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-2 mt-2 text-[13px] text-ink-3">
                <MapPinArea className="w-3.5 h-3.5 flex-shrink-0" weight="regular" />
                <span className="truncate">
                  {trip.config.baseLocation
                    ? `Exploring ${trip.config.baseLocation.name}`
                    : trip.config.startLocation?.name
                      ? `From ${trip.config.startLocation.name}`
                      : 'Trip'}
                </span>
              </div>

              {/* Route preview — compact chain of destination names */}
              {routePreview && (
                <div className="flex items-center gap-2 mt-1 text-[13px] text-ink-2">
                  <Path className="w-3.5 h-3.5 flex-shrink-0" weight="regular" />
                  <span className="truncate font-medium">{routePreview}</span>
                </div>
              )}

              {/* Optional chip row — vehicle, lodging, activities, pace */}
              {chips.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {chips.map((c) => (
                    <Tag key={c}>{c}</Tag>
                  ))}
                </div>
              )}
            </div>

            {/* Stats column — right side on desktop, full-width below identity on mobile.
                Visually separated from the identity column with a thin divider on the left. */}
            {statLines.length > 0 && (
              <div className="mt-3 md:mt-0 md:pl-8 md:border-l md:border-line md:min-w-[200px] md:text-right shrink-0">
                <div className="flex flex-wrap md:flex-col gap-x-4 gap-y-1.5 md:gap-y-2 text-[12px] font-mono uppercase tracking-[0.10em] text-ink-3">
                  {statLines.map(({ icon: Ico, text, tint }, i) => (
                    <span key={i} className="flex items-center md:justify-end gap-1.5 whitespace-nowrap">
                      <Ico className={cn("w-3.5 h-3.5", tint ?? 'text-ink-3')} weight="regular" />
                      {text}
                    </span>
                  ))}
                  {(trip.collaboratorCount ?? 0) > 0 && (
                    <span className="flex items-center md:justify-end gap-1.5 whitespace-nowrap">
                      <Users className="w-3.5 h-3.5" weight="regular" />
                      {trip.collaboratorCount} {trip.collaboratorCount === 1 ? 'guest' : 'guests'}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {!trip.isShared && (
            <TripActionsMenu trip={trip} onMarkComplete={onMarkComplete} onDelete={onDelete} />
          )}
        </div>
      </div>
    </div>
  );
};

// Display labels for vehicle/lodging codes — keeps the chip text human-readable.
const VEHICLE_LABEL: Record<string, string> = {
  sedan: 'Sedan',
  suv: 'SUV',
  '4wd': '4WD',
  rv: 'RV',
};
const LODGING_LABEL: Record<string, string> = {
  dispersed: 'Dispersed',
  campground: 'Campground',
  cabin: 'Cabin',
  hotel: 'Hotel',
  mixed: 'Mixed lodging',
  other: 'Other lodging',
};

// Small helper for the dot-menu on each trip — consistent across rows + banners.
const TripActionsMenu = ({
  trip,
  onMarkComplete,
  onDelete,
}: {
  trip: TripWithMeta;
  onMarkComplete: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
      <button
        className="inline-flex items-center justify-center w-8 h-8 rounded-full text-ink-3 hover:text-ink hover:bg-ink/5 transition-colors"
        aria-label="Trip actions"
      >
        <DotsThreeVertical className="w-5 h-5" weight="bold" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="end"
      onClick={(e) => e.stopPropagation()}
      className="rounded-[12px] border-line bg-white [&_[data-highlighted]]:bg-cream dark:bg-paper-2 [&_[data-highlighted]]:text-ink"
    >
      <DropdownMenuItem onClick={onMarkComplete} className="cursor-pointer text-[14px] text-ink">
        <CheckCircle
          className={cn("w-4 h-4 mr-2", trip.config.completedAt ? "text-pine-6" : "text-ink-2")}
          weight={trip.config.completedAt ? 'fill' : 'regular'}
        />
        {trip.config.completedAt ? 'Mark as active' : 'Mark as complete'}
      </DropdownMenuItem>
      <DropdownMenuSeparator className="bg-line" />
      <DropdownMenuItem
        onClick={onDelete}
        className="cursor-pointer text-[14px] text-ember data-[highlighted]:!text-ember data-[highlighted]:!bg-ember/10"
      >
        <Trash className="w-4 h-4 mr-2" weight="regular" />
        Delete trip
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

// Empty state — shared across no-trips and no-tab-trips.
const EmptyState = ({
  icon,
  title,
  copy,
  ctaLabel,
  onCta,
}: {
  icon: React.ReactNode;
  title: string;
  copy: string;
  ctaLabel?: string;
  onCta?: () => void;
}) => (
  <div className="border border-line dark:border-line-2 bg-white dark:bg-ink-pine rounded-[18px] px-8 py-14 text-center">
    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10 mb-4">
      {icon}
    </div>
    <h2 className="font-sans font-semibold text-xl tracking-[-0.01em] text-ink">{title}</h2>
    <p className="text-[14px] text-ink-3 mt-2 max-w-[460px] mx-auto leading-[1.55]">{copy}</p>
    {ctaLabel && onCta && (
      <div className="mt-6">
        <Pill variant="solid-pine" mono={false} onClick={onCta}>
          <Plus size={13} weight="bold" />
          {ctaLabel}
        </Pill>
      </div>
    )}
  </div>
);

export default MyTrips;
