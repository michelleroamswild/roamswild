import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  X,
  Path,
  Clock,
  Mountains,
  Tent,
  GasPump,
  MapPin,
  MapPinArea,
  NavigationArrow,
  ShareNetwork,
  Heart,
  CheckCircle,
  Star,
  Calendar,
  CaretDown,
  CaretUp,
  CaretRight,
  ArrowSquareOut,
  Boot,
  Trash,
  ArrowsClockwise,
  Camera,
  Warning,
  Gauge,
  PencilSimple,
  CircleNotch,
  Plus,
  SlidersHorizontal,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useTrip, Collaborator } from '@/context/TripContext';
import { GoogleMap } from '@/components/GoogleMap';
import { Marker, InfoWindow, DirectionsRenderer } from '@react-google-maps/api';
import { TripStop, TripDay } from '@/types/trip';
import { toast } from 'sonner';
import { AlternativeHikesModal } from '@/components/AlternativeHikesModal';
import { AlternativeCampsitesModal } from '@/components/AlternativeCampsitesModal';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { createMarkerIcon, createSimpleMarkerIcon, getTypeStyles } from '@/utils/mapMarkers';
import { estimateDayTime } from '@/utils/tripValidation';
import { getAllTrailsUrl, estimateTrailLength } from '@/utils/hikeUtils';
import { ShareTripModal } from '@/components/ShareTripModal';
import { CollaboratorAvatars } from '@/components/CollaboratorAvatars';
import { getTripSlug, getDayUrl } from '@/utils/slugify';
import { PlaceSearch } from '@/components/PlaceSearch';
import { useTripGenerator } from '@/hooks/use-trip-generator';
import { useTheme } from '@/hooks/use-theme';
import { usePhotoWeather } from '@/hooks/use-photo-weather';
import { PhotoWeatherCard } from '@/components/PhotoWeatherCard';
import { EntryPointSelector, checkIfDrivable } from '@/components/EntryPointSelector';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { TripDestination, PacePreference } from '@/types/trip';
import { ActivityEditorModal } from '@/components/ActivityEditorModal';

const getIcon = (type: string) => {
  switch (type) {
    case 'hike':
      return Boot;
    case 'gas':
      return GasPump;
    case 'camp':
      return Tent;
    case 'photo':
      return Camera;
    case 'start':
    case 'end':
      return MapPin;
    default:
      return MapPinArea;
  }
};

const loaderStates = [
  { icon: MapPin, color: '#34b5a5', bg: 'bg-aquateal/20', label: 'Finding locations...' },
  { icon: MapPinArea, color: '#6b5ce6', bg: 'bg-lavenderslate/20', label: 'Planning destinations...' },
  { icon: Boot, color: '#3c8a79', bg: 'bg-pinesoft/20', label: 'Discovering hikes...' },
  { icon: Tent, color: '#a855f7', bg: 'bg-wildviolet/20', label: 'Finding campsites...' },
];

const RegeneratingLoader = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % loaderStates.length);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  const current = loaderStates[currentIndex];
  const Icon = current.icon;

  return (
    <div className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-card border border-border rounded-xl p-8 shadow-lg flex flex-col items-center gap-5">
        <div className="relative">
          <svg className="w-20 h-20 animate-spin" viewBox="0 0 50 50">
            <circle
              cx="25"
              cy="25"
              r="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="80, 200"
              className="opacity-20"
            />
            <circle
              cx="25"
              cy="25"
              r="20"
              fill="none"
              stroke={current.color}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="40, 200"
              className="transition-all duration-500"
            />
          </svg>
          <div className={`absolute inset-0 flex items-center justify-center`}>
            <div className={`w-12 h-12 rounded-full ${current.bg} flex items-center justify-center transition-all duration-500`}>
              <Icon className="w-6 h-6 transition-all duration-500" style={{ color: current.color }} />
            </div>
          </div>
        </div>
        <div className="text-center">
          <p className="font-semibold text-foreground text-lg">Regenerating Trip</p>
          <p className="text-sm text-muted-foreground transition-all duration-300">{current.label}</p>
        </div>
      </div>
    </div>
  );
};

const TripDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { generatedTrip, tripConfig, setTripConfig, setGeneratedTrip, saveTrip, deleteSavedTrip, isTripSaved, loadSavedTripBySlug, updateTripStop, removeTripStop, addTripStop, fetchCollaborators, isOwner, isLoading } = useTrip();
  const { generateTrip, generating: regenerating } = useTripGenerator();
  const { isDark } = useTheme();

  const [expandedDays, setExpandedDays] = useState<number[]>([1]);
  const [, forceUpdate] = useState({});

  // Force re-render when tab becomes visible to fix blank page issue
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        forceUpdate({});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [activityEditorOpen, setActivityEditorOpen] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [selectedStop, setSelectedStop] = useState<TripStop | null>(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [dayDirections, setDayDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const [hikeModalOpen, setHikeModalOpen] = useState(false);
  const [selectedHikeForSwap, setSelectedHikeForSwap] = useState<TripStop | null>(null);
  const [campsiteModalOpen, setCampsiteModalOpen] = useState(false);
  const [selectedCampsiteForSwap, setSelectedCampsiteForSwap] = useState<TripStop | null>(null);
  const [dateEditModal, setDateEditModal] = useState(false);
  const [editingStartDate, setEditingStartDate] = useState<Date | undefined>(undefined);
  const [editingEndDate, setEditingEndDate] = useState<Date | undefined>(undefined);
  const [editLocationModal, setEditLocationModal] = useState<{
    isOpen: boolean;
    type: 'start' | 'destination' | 'end';
    index?: number;
    currentName: string;
  }>({ isOpen: false, type: 'start', currentName: '' });
  const [pendingLocationChange, setPendingLocationChange] = useState<google.maps.places.PlaceResult | null>(null);
  const [exitConfirmModal, setExitConfirmModal] = useState(false);
  const [entryPointModal, setEntryPointModal] = useState<{
    isOpen: boolean;
    place: google.maps.places.PlaceResult | null;
    context: 'edit' | 'add';
  }>({ isOpen: false, place: null, context: 'edit' });
  const [addDestinationModal, setAddDestinationModal] = useState(false);
  const [pendingNewDestination, setPendingNewDestination] = useState<google.maps.places.PlaceResult | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  // Get elevation from stop if available (parse from string like "8,500 ft")
  const selectedStopElevation = useMemo(() => {
    if (!selectedStop?.elevation) return 0;
    const match = selectedStop.elevation.match(/[\d,]+/);
    if (match) {
      const feet = parseInt(match[0].replace(/,/g, ''), 10);
      return feet * 0.3048; // Convert to meters
    }
    return 0;
  }, [selectedStop]);

  // Fetch photo weather for selected stop
  const {
    forecast: selectedStopWeather,
    loading: loadingStopWeather,
    error: stopWeatherError,
  } = usePhotoWeather(
    selectedStop?.coordinates.lat ?? 0,
    selectedStop?.coordinates.lng ?? 0,
    selectedStopElevation
  );

  // Check if this trip is saved
  const isSaved = generatedTrip ? isTripSaved(generatedTrip.id) : false;

  // Load saved trip if no generated trip or if the URL slug doesn't match the current trip
  useEffect(() => {
    // Wait for trips to finish loading before attempting to load
    if (isLoading) return;

    // If trip is already loaded with correct slug, don't do anything
    if (generatedTrip && getTripSlug(generatedTrip.config.name) === slug) return;

    if (slug) {
      const loaded = loadSavedTripBySlug(slug);
      if (!loaded) {
        // Trip not found - redirect to My Trips
        navigate('/trips');
      }
    }
  }, [slug, generatedTrip, loadSavedTripBySlug, navigate, isLoading]);

  // Fetch collaborators when trip loads
  useEffect(() => {
    if (generatedTrip?.id) {
      fetchCollaborators(generatedTrip.id).then(setCollaborators);
    }
  }, [generatedTrip?.id, fetchCollaborators]);

  // Find the best day to add a photo spot based on proximity to that day's stops
  const handleSaveTrip = async () => {
    if (generatedTrip) {
      try {
        await saveTrip(generatedTrip);
        toast.success('Trip saved!');
        return true;
      } catch (err) {
        console.error('Failed to save trip:', err);
        toast.error('Failed to save trip', {
          description: 'Please try again',
        });
        return false;
      }
    }
    return false;
  };

  const handleUpdateActivities = (data: {
    activities: string[];
    pacePreference: PacePreference;
    offroadVehicleType?: '4wd-high' | 'awd-medium';
  }) => {
    if (!tripConfig) return;

    const updatedConfig = {
      ...tripConfig,
      activities: data.activities as any[],
      pacePreference: data.pacePreference,
      offroadVehicleType: data.offroadVehicleType,
      hikingPreference: data.activities.includes('hiking') ? 'daily' as const : 'none' as const,
    };

    setTripConfig(updatedConfig);

    // If trip is saved, save the updated config
    if (generatedTrip && isSaved) {
      const updatedTrip = {
        ...generatedTrip,
        config: updatedConfig,
      };
      saveTrip(updatedTrip);
    }

    toast.success('Activities updated!');
  };

  const handleExitClick = () => {
    if (isSaved) {
      navigate('/trips');
    } else {
      setExitConfirmModal(true);
    }
  };

  const handleSaveAndExit = async () => {
    const saved = await handleSaveTrip();
    if (saved) {
      setExitConfirmModal(false);
      navigate('/trips');
    }
  };

  const handleExitWithoutSaving = () => {
    setExitConfirmModal(false);
    navigate('/trips');
  };

  const handleUnsaveTrip = () => {
    if (generatedTrip) {
      deleteSavedTrip(generatedTrip.id);
      toast.success('Trip removed', {
        description: 'Removed from your saved trips',
      });
    }
  };

  const handleOpenHikeSwap = (hike: TripStop) => {
    setSelectedHikeForSwap(hike);
    setHikeModalOpen(true);
  };

  const handleSwapHike = (newHike: TripStop) => {
    if (selectedHikeForSwap) {
      updateTripStop(selectedHikeForSwap.day, selectedHikeForSwap.id, newHike);
      toast.success('Hike updated!', {
        description: `Changed to ${newHike.name}`,
      });
    }
  };

  const handleOpenCampsiteSwap = (campsite: TripStop) => {
    setSelectedCampsiteForSwap(campsite);
    setCampsiteModalOpen(true);
  };

  const handleSwapCampsite = (newCampsite: TripStop) => {
    if (selectedCampsiteForSwap) {
      updateTripStop(selectedCampsiteForSwap.day, selectedCampsiteForSwap.id, newCampsite);
      toast.success('Campsite updated!', {
        description: `Changed to ${newCampsite.name}`,
      });
    }
  };

  const handleRemoveStop = (dayNumber: number, stop: TripStop) => {
    removeTripStop(dayNumber, stop.id);
    toast.success('Stop removed', {
      description: `Removed ${stop.name} from Day ${dayNumber}`,
    });
  };

  const handleOpenDateEdit = () => {
    if (generatedTrip && tripConfig.startDate) {
      const [year, month, day] = tripConfig.startDate.split('-').map(Number);
      const start = new Date(year, month - 1, day);
      const end = new Date(start);
      end.setDate(start.getDate() + generatedTrip.days.length - 1);
      setEditingStartDate(start);
      setEditingEndDate(end);
    } else {
      setEditingStartDate(undefined);
      setEditingEndDate(undefined);
    }
    setDateEditModal(true);
  };

  // Calculate duration from start and end dates
  const getEditingDuration = () => {
    if (!editingStartDate || !editingEndDate) return 0;
    const diffTime = editingEndDate.getTime() - editingStartDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, diffDays);
  };

  const handleUpdateDates = async () => {
    if (!generatedTrip || !editingStartDate || !editingEndDate) return;

    const newDuration = getEditingDuration();
    const currentDuration = generatedTrip.days.length;

    // Convert Date to string format (YYYY-MM-DD) for config
    const startDateStr = `${editingStartDate.getFullYear()}-${String(editingStartDate.getMonth() + 1).padStart(2, '0')}-${String(editingStartDate.getDate()).padStart(2, '0')}`;

    // Update tripConfig with new start date and duration
    const updatedConfig = {
      ...tripConfig,
      startDate: startDateStr,
      duration: newDuration,
    };

    // If adding days, regenerate to get new activities but keep existing day customizations
    if (newDuration > currentDuration) {
      setDateEditModal(false);
      toast.loading('Generating activities for new days...', { id: 'regenerating' });

      try {
        const regeneratedTrip = await generateTrip(updatedConfig);
        if (regeneratedTrip) {
          // Keep existing days with their customizations, only take NEW days from regenerated trip

          // Update existing days with new dates but keep all customizations
          const existingDaysUpdated = generatedTrip.days.map((day, index) => {
            const dayDate = new Date(editingStartDate);
            dayDate.setDate(editingStartDate.getDate() + index);
            return {
              ...day,
              day: index + 1,
              date: dayDate.toISOString().split('T')[0],
            };
          });

          // The previous last day may not have had a campsite - add one from regenerated trip
          const lastExistingDayIndex = currentDuration - 1;
          const lastExistingDay = existingDaysUpdated[lastExistingDayIndex];
          const hasCampsite = lastExistingDay?.campsite || lastExistingDay?.stops?.some(s => s.type === 'camp');

          if (!hasCampsite && regeneratedTrip.days[lastExistingDayIndex]) {
            const regeneratedDay = regeneratedTrip.days[lastExistingDayIndex];
            const campsiteFromRegenerated = regeneratedDay.campsite || regeneratedDay.stops?.find(s => s.type === 'camp');

            if (campsiteFromRegenerated) {
              // Add campsite to the previously-final day
              existingDaysUpdated[lastExistingDayIndex] = {
                ...lastExistingDay,
                campsite: campsiteFromRegenerated,
                stops: [...lastExistingDay.stops, campsiteFromRegenerated],
              };
            }
          }

          // Get only the NEW days from the regenerated trip (days beyond current duration)
          const newDays = regeneratedTrip.days.slice(currentDuration).map((day, index) => {
            const dayIndex = currentDuration + index;
            const dayDate = new Date(editingStartDate);
            dayDate.setDate(editingStartDate.getDate() + dayIndex);
            return {
              ...day,
              day: dayIndex + 1,
              date: dayDate.toISOString().split('T')[0],
            };
          });

          // Merge existing customized days with new generated days
          const mergedDays = [...existingDaysUpdated, ...newDays];

          const tripWithId = {
            ...regeneratedTrip,
            id: generatedTrip.id,
            config: updatedConfig,
            days: mergedDays,
          };
          setTripConfig(updatedConfig);
          setGeneratedTrip(tripWithId);
          await saveTrip(tripWithId);
          toast.success(`Trip extended to ${newDuration} days! Your existing changes were preserved.`, { id: 'regenerating' });
        } else {
          toast.error('Failed to generate new days', { id: 'regenerating' });
        }
      } catch (error) {
        toast.error('Failed to extend trip', { id: 'regenerating' });
      }
      return;
    }

    // For shortening or just changing dates, update without regenerating
    let updatedDays = [...generatedTrip.days];

    if (newDuration < currentDuration) {
      // Removing days - truncate the array
      updatedDays = updatedDays.slice(0, newDuration);
    }

    // Update all day numbers and dates
    updatedDays = updatedDays.map((day, index) => {
      const dayDate = new Date(editingStartDate);
      dayDate.setDate(editingStartDate.getDate() + index);
      return {
        ...day,
        day: index + 1,
        date: dayDate.toISOString().split('T')[0],
      };
    });

    const updatedTrip = {
      ...generatedTrip,
      config: updatedConfig,
      days: updatedDays,
    };

    // Update local state
    setTripConfig(updatedConfig);
    setGeneratedTrip(updatedTrip);

    // Save to database
    try {
      await saveTrip(updatedTrip);
      if (newDuration < currentDuration) {
        toast.success(`Trip shortened to ${newDuration} days`);
      } else {
        toast.success('Trip dates updated!');
      }
      setDateEditModal(false);
    } catch (error) {
      toast.error('Failed to update dates');
    }
  };

  // Start a specific day - show its route on the map
  const handleStartDay = (dayNumber: number) => {
    if (!generatedTrip) return;

    const day = generatedTrip.days.find(d => d.day === dayNumber);
    if (!day || day.stops.length === 0) return;

    // Set active day and expand it - useEffect will handle fetching directions
    setActiveDay(dayNumber);
    setExpandedDays(prev => prev.includes(dayNumber) ? prev : [...prev, dayNumber]);
  };

  // Exit day mode and show full trip
  const handleExitDayMode = () => {
    setActiveDay(null);
    setDayDirections(null);
  };

  // Clear directions when trip ID changes (new trip loaded)
  useEffect(() => {
    setDirections(null);
    setDayDirections(null);
    setActiveDay(null);
    setSelectedStop(null);
  }, [generatedTrip?.id]);

  // Refresh day directions when active day's stops change (e.g., hike swapped)
  useEffect(() => {
    if (!mapsLoaded || !generatedTrip || activeDay === null) {
      return;
    }

    const day = generatedTrip.days.find(d => d.day === activeDay);
    if (!day) {
      setDayDirections(null);
      return;
    }

    const directionsService = new google.maps.DirectionsService();
    const startLocation = generatedTrip.config.startLocation?.coordinates;
    const baseLocation = generatedTrip.config.baseLocation?.coordinates;
    const isLastDayOfTrip = activeDay === generatedTrip.days.length;
    const endLocation = startLocation || baseLocation;

    // Helper to find most recent campsite from previous days
    const findMostRecentCampsite = () => {
      for (let d = activeDay - 1; d >= 1; d--) {
        const prevDay = generatedTrip.days.find(day => day.day === d);
        const campsite = prevDay?.stops.find(s => s.type === 'camp');
        if (campsite) return campsite;
      }
      return null;
    };

    // Determine where this day starts from
    let dayOrigin: google.maps.LatLngLiteral | undefined;

    if (activeDay === 1) {
      // Day 1 starts from trip start or base location
      dayOrigin = startLocation || baseLocation || day.stops[0]?.coordinates;
    } else {
      // Other days start from most recent campsite (look back through all previous days)
      const recentCampsite = findMostRecentCampsite();
      dayOrigin = recentCampsite?.coordinates || day.stops[0]?.coordinates;
    }

    // Determine day destination
    const dayCampsite = day.stops.find(s => s.type === 'camp');
    const dayActivities = day.stops.filter(s => s.type === 'hike' || s.type === 'viewpoint' || s.type === 'photo');

    let dayDestination: google.maps.LatLngLiteral | undefined;

    // Check if this is the final day returning home FIRST
    if (isLastDayOfTrip && generatedTrip.config.returnToStart && endLocation) {
      // Last day returning home - destination is start/base location
      dayDestination = endLocation;
    } else if (dayCampsite) {
      // Day ends at campsite
      dayDestination = dayCampsite.coordinates;
    } else if (dayActivities.length > 0) {
      // Fall back to last activity
      dayDestination = dayActivities[dayActivities.length - 1].coordinates;
    }

    // Need both origin and destination to route
    if (!dayOrigin || !dayDestination) {
      setDayDirections(null);
      return;
    }

    // Waypoints are the activities for this day
    const waypoints = dayActivities.map(stop => ({
      location: stop.coordinates,
      stopover: true,
    }));

    directionsService.route(
      {
        origin: dayOrigin,
        destination: dayDestination,
        waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      },
      (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          setDayDirections(result);
        } else if (waypoints.length > 0) {
          // Fallback: try without waypoints
          directionsService.route(
            {
              origin: dayOrigin,
              destination: dayDestination,
              waypoints: [],
              travelMode: google.maps.TravelMode.DRIVING,
            },
            (fallbackResult, fallbackStatus) => {
              if (fallbackStatus === google.maps.DirectionsStatus.OK && fallbackResult) {
                setDayDirections(fallbackResult);
              }
            }
          );
        }
      }
    );
  }, [mapsLoaded, generatedTrip, activeDay]);

  // Fetch driving directions when map loads or trip changes
  // Full trip route: Start → Camp1 → Camp2 → ... → End
  useEffect(() => {
    if (!mapsLoaded || !generatedTrip) {
      return;
    }

    setDirections(null);
    const directionsService = new google.maps.DirectionsService();

    // Get start and end locations
    const startLocation = generatedTrip.config.startLocation?.coordinates;
    const baseLocation = generatedTrip.config.baseLocation?.coordinates;
    const isLocationBased = !!baseLocation && !startLocation;

    // Get unique campsites in day order (avoid duplicates for multi-night stays)
    const campsites: google.maps.LatLngLiteral[] = [];
    const seenCampsites = new Set<string>();
    for (const day of generatedTrip.days) {
      // Find camp - check for both 'camp' type and day.campsite
      const campsite = day.stops.find(s => s.type === 'camp') || day.campsite;
      if (campsite) {
        const coordKey = `${campsite.coordinates.lat.toFixed(5)},${campsite.coordinates.lng.toFixed(5)}`;
        if (!seenCampsites.has(coordKey)) {
          seenCampsites.add(coordKey);
          campsites.push(campsite.coordinates);
        }
      }
    }

    // For location-based trips: just route through campsites
    if (isLocationBased) {
      if (campsites.length < 2) return;

      const origin = campsites[0];
      const destination = campsites[campsites.length - 1];
      const waypoints = campsites.slice(1, -1).map(coord => ({
        location: coord,
        stopover: true,
      }));

      directionsService.route(
        { origin, destination, waypoints, travelMode: google.maps.TravelMode.DRIVING, optimizeWaypoints: false },
        (result, status) => {
          if (status === google.maps.DirectionsStatus.OK && result) {
            setDirections(result);
          }
        }
      );
      return;
    }

    // For trips with start/end locations
    if (!startLocation) return;

    const isRoundTrip = generatedTrip.config.returnToStart;
    const configDestinations = generatedTrip.config.destinations || [];

    const origin = { lat: startLocation.lat, lng: startLocation.lng };

    // Find the end destination
    let destination: google.maps.LatLngLiteral;
    if (isRoundTrip) {
      destination = origin;
    } else {
      // For non-round trips, find the 'end' type stop
      const endStop = allStops.find(s => s.type === 'end');
      destination = endStop?.coordinates || (campsites.length > 0 ? campsites[campsites.length - 1] : origin);
    }

    // For round trips, all campsites are waypoints
    // For one-way trips, all campsites are waypoints (end is the 'end' stop, not a campsite)
    const waypointCampsites = campsites;

    const campsiteWaypoints = waypointCampsites.map(coord => ({
      location: { lat: coord.lat, lng: coord.lng },
      stopover: true,
    }));

    // Try campsites first
    directionsService.route(
      {
        origin,
        destination,
        waypoints: campsiteWaypoints,
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      },
      (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          setDirections(result);
        } else if (campsites.length > 0 || !isRoundTrip) {
          // Try routing in segments: origin→camp1, camp1→camp2, etc. → end
          const allPoints: google.maps.LatLngLiteral[] = [origin, ...campsites];
          // Add final destination (origin for round trip, end stop for one-way)
          allPoints.push(destination);

          const segmentPromises: Promise<google.maps.DirectionsResult | null>[] = [];

          for (let i = 0; i < allPoints.length - 1; i++) {
            segmentPromises.push(
              new Promise((resolve) => {
                directionsService.route(
                  {
                    origin: allPoints[i],
                    destination: allPoints[i + 1],
                    travelMode: google.maps.TravelMode.DRIVING,
                  },
                  (segResult, segStatus) => {
                    resolve(segStatus === google.maps.DirectionsStatus.OK ? segResult : null);
                  }
                );
              })
            );
          }

          Promise.all(segmentPromises).then((segments) => {
            const validSegments = segments.filter((s): s is google.maps.DirectionsResult => s !== null);
            if (validSegments.length > 0) {
              setDirections(validSegments[0]);
            }
          });
        } else {
          // Fallback: route through destinations instead
          const destCoords = configDestinations.map(d => d.coordinates);

          // Use all destinations as waypoints, final destination is already computed
          const destinationWaypoints = destCoords.map(coords => ({
            location: { lat: coords.lat, lng: coords.lng },
            stopover: true,
          }));

          directionsService.route(
            {
              origin,
              destination,
              waypoints: destinationWaypoints,
              travelMode: google.maps.TravelMode.DRIVING,
              optimizeWaypoints: false,
            },
            (fallbackResult, fallbackStatus) => {
              if (fallbackStatus === google.maps.DirectionsStatus.OK && fallbackResult) {
                setDirections(fallbackResult);
              } else {
                // Build route using only reachable destinations
                const testDestination = async (dest: typeof configDestinations[0]): Promise<google.maps.LatLngLiteral | null> => {
                  return new Promise((resolve) => {
                    directionsService.route(
                      { origin, destination: dest.coordinates, travelMode: google.maps.TravelMode.DRIVING },
                      (_, testStatus) => {
                        resolve(testStatus === google.maps.DirectionsStatus.OK ? dest.coordinates : null);
                      }
                    );
                  });
                };

                Promise.all(configDestinations.map(testDestination)).then(results => {
                  const reachable = results.filter((r): r is google.maps.LatLngLiteral => r !== null);
                  if (reachable.length === 0) return;

                  // Use all reachable points as waypoints, route to final destination
                  directionsService.route(
                    {
                      origin,
                      destination,
                      waypoints: reachable.map(c => ({ location: c, stopover: true })),
                      travelMode: google.maps.TravelMode.DRIVING,
                    },
                    (finalResult, finalStatus) => {
                      if (finalStatus === google.maps.DirectionsStatus.OK && finalResult) {
                        setDirections(finalResult);
                      }
                    }
                  );
                });
              }
            }
          );
        }
      }
    );
  }, [mapsLoaded, generatedTrip]);

  // Show loading state while fetching trips
  if (isLoading || !generatedTrip || !tripConfig) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span>Loading trip...</span>
        </div>
      </div>
    );
  }

  const toggleDay = (day: number) => {
    setExpandedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  // Calculate map center and all stops
  const allStops = generatedTrip.days.flatMap((day) => day.stops);
  const mapCenter = allStops.length > 0
    ? {
        lat: allStops.reduce((sum, s) => sum + s.coordinates.lat, 0) / allStops.length,
        lng: allStops.reduce((sum, s) => sum + s.coordinates.lng, 0) / allStops.length,
      }
    : { lat: 37.7749, lng: -122.4194 }; // Default to SF if no stops

  // Fit map bounds to show all markers
  const fitMapBounds = useCallback((map: google.maps.Map, stopsToFit?: typeof allStops) => {
    const stops = stopsToFit || allStops;
    if (stops.length === 0) return;

    const bounds = new google.maps.LatLngBounds();

    // Add all stops to bounds
    stops.forEach(stop => {
      bounds.extend(stop.coordinates);
    });

    // Add start/base location if exists
    if (tripConfig.startLocation?.coordinates) {
      bounds.extend(tripConfig.startLocation.coordinates);
    }
    if (tripConfig.baseLocation?.coordinates) {
      bounds.extend(tripConfig.baseLocation.coordinates);
    }

    // Fit bounds with padding
    map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
  }, [allStops, tripConfig.startLocation, tripConfig.baseLocation]);

  // Handle map load
  const handleMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    setMapsLoaded(true);
    // Fit bounds on initial load
    fitMapBounds(map);
  }, [fitMapBounds]);

  // Fit bounds when active day changes
  useEffect(() => {
    if (!mapRef.current || !mapsLoaded) return;

    if (activeDay) {
      const day = generatedTrip.days.find(d => d.day === activeDay);
      const dayStops = day?.stops || [];

      // Build bounds including origin and destination markers
      const bounds = new google.maps.LatLngBounds();

      // Add day's stops
      dayStops.forEach(stop => bounds.extend(stop.coordinates));

      // Add origin marker (start location for day 1, most recent campsite for other days)
      if (activeDay === 1) {
        const startLoc = tripConfig.startLocation || tripConfig.baseLocation;
        if (startLoc) {
          bounds.extend(startLoc.coordinates);
        }
      } else {
        // Look back through previous days to find most recent campsite
        for (let d = activeDay - 1; d >= 1; d--) {
          const prevDay = generatedTrip.days.find(day => day.day === d);
          const campsite = prevDay?.stops.find(s => s.type === 'camp');
          if (campsite) {
            bounds.extend(campsite.coordinates);
            break;
          }
        }
      }

      // Add destination marker for last day returning to start
      const isLastDay = activeDay === generatedTrip.days.length;
      const endLocation = tripConfig.startLocation || tripConfig.baseLocation;
      if (isLastDay && tripConfig.returnToStart && endLocation) {
        bounds.extend(endLocation.coordinates);
      }

      // Fit bounds with padding
      if (!bounds.isEmpty()) {
        mapRef.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
      }
    } else {
      fitMapBounds(mapRef.current);
    }
  }, [activeDay, mapsLoaded, generatedTrip.days, fitMapBounds, tripConfig.startLocation, tripConfig.returnToStart]);

  const handleNavigateDay = () => {
    if (!activeDay) return;

    const day = generatedTrip.days.find(d => d.day === activeDay);
    if (!day || day.stops.length === 0) return;

    const stops = day.stops;
    const dest = `${stops[stops.length - 1].coordinates.lat},${stops[stops.length - 1].coordinates.lng}`;

    // Build navigation URL with current location as origin (on mobile)
    const buildNavUrl = (origin?: string) => {
      let waypoints: string;
      if (origin) {
        // Using current location - all stops except last are waypoints
        waypoints = stops.slice(0, -1)
          .map(s => `${s.coordinates.lat},${s.coordinates.lng}`)
          .join('|');
      } else {
        // Using first stop as origin - middle stops are waypoints
        waypoints = stops.slice(1, -1)
          .map(s => `${s.coordinates.lat},${s.coordinates.lng}`)
          .join('|');
        origin = `${stops[0].coordinates.lat},${stops[0].coordinates.lng}`;
      }

      return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${waypoints ? `&waypoints=${waypoints}` : ''}`;
    };

    // Try to get user's current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const origin = `${position.coords.latitude},${position.coords.longitude}`;
          window.open(buildNavUrl(origin), '_blank');
        },
        () => {
          // Geolocation failed or denied - use first stop as origin
          window.open(buildNavUrl(), '_blank');
        },
        { timeout: 5000, maximumAge: 60000 }
      );
    } else {
      // Geolocation not available - use first stop as origin
      window.open(buildNavUrl(), '_blank');
    }
  };

  const handleStartNavigation = () => {
    // Get start/base location from config
    const startLocation = generatedTrip.config.startLocation?.coordinates;
    const baseLocation = generatedTrip.config.baseLocation?.coordinates;
    const isLocationBased = !!baseLocation;

    // Get route stops from the trip
    const routeStops = allStops.filter(stop =>
      stop.type === 'viewpoint' || stop.type === 'camp' || stop.type === 'hike'
    );

    // Determine origin
    const originCoords = startLocation || baseLocation || (routeStops.length > 0 ? routeStops[0].coordinates : null);
    if (!originCoords) return;

    // Determine destination
    const returnToStart = generatedTrip.config.returnToStart;
    const lastStopCoords = routeStops.length > 0 ? routeStops[routeStops.length - 1].coordinates : null;
    const destCoords = isLocationBased
      ? (lastStopCoords || baseLocation)
      : (returnToStart && startLocation ? startLocation : lastStopCoords);
    if (!destCoords) return;

    const origin = `${originCoords.lat},${originCoords.lng}`;
    const dest = `${destCoords.lat},${destCoords.lng}`;

    // Build waypoints
    const hasOriginLocation = startLocation || baseLocation;
    const waypointStops = hasOriginLocation ? routeStops : routeStops.slice(1);
    const finalWaypointStops = returnToStart ? waypointStops : waypointStops.slice(0, -1);
    const waypoints = finalWaypointStops
      .map((s) => `${s.coordinates.lat},${s.coordinates.lng}`)
      .join('|');

    window.open(
      `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${waypoints ? `&waypoints=${waypoints}` : ''}`,
      '_blank'
    );
  };

  const handleLocationSelect = async (place: google.maps.places.PlaceResult) => {
    if (place.geometry?.location && place.place_id) {
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();

      // Check if this location is drivable
      const isDrivable = await checkIfDrivable(lat, lng);
      if (!isDrivable) {
        setEntryPointModal({ isOpen: true, place, context: 'edit' });
        return;
      }
    }
    setPendingLocationChange(place);
  };

  const handleEntryPointSelect = (entryPoint: {
    placeId: string;
    name: string;
    coordinates: { lat: number; lng: number };
  }) => {
    // Create a mock PlaceResult from the entry point
    const mockPlace = {
      place_id: entryPoint.placeId,
      name: entryPoint.name,
      formatted_address: entryPoint.name,
      geometry: {
        location: {
          lat: () => entryPoint.coordinates.lat,
          lng: () => entryPoint.coordinates.lng,
        } as google.maps.LatLng,
      },
    } as google.maps.places.PlaceResult;

    if (entryPointModal.context === 'add') {
      setPendingNewDestination(mockPlace);
    } else {
      setPendingLocationChange(mockPlace);
    }
    setEntryPointModal({ isOpen: false, place: null, context: 'edit' });
  };

  const handleUseOriginalLocation = () => {
    if (entryPointModal.place) {
      if (entryPointModal.context === 'add') {
        setPendingNewDestination(entryPointModal.place);
      } else {
        setPendingLocationChange(entryPointModal.place);
      }
    }
    setEntryPointModal({ isOpen: false, place: null, context: 'edit' });
  };

  const handleLocationUpdate = async () => {
    const place = pendingLocationChange;
    if (!tripConfig || !place?.geometry?.location || !place.place_id) return;

    const newLocation: TripDestination = {
      id: `loc-${place.place_id}`,
      placeId: place.place_id,
      name: place.name || place.formatted_address || '',
      address: place.formatted_address || '',
      coordinates: {
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      },
    };

    let updatedConfig = { ...tripConfig };

    if (editLocationModal.type === 'start') {
      // If it was a round trip, keep the original start as the end destination
      if (tripConfig.returnToStart && tripConfig.startLocation) {
        const originalStart: TripDestination = {
          id: `end-${tripConfig.startLocation.placeId}`,
          placeId: tripConfig.startLocation.placeId,
          name: tripConfig.startLocation.name,
          address: tripConfig.startLocation.address,
          coordinates: tripConfig.startLocation.coordinates,
        };
        updatedConfig.destinations = [...tripConfig.destinations, originalStart];
        updatedConfig.returnToStart = false;
      }
      updatedConfig.startLocation = newLocation;
    } else if (editLocationModal.type === 'end') {
      // Changing end location
      if (editLocationModal.index !== undefined) {
        // Editing the last destination (which is the end when returnToStart is false)
        const newDestinations = [...tripConfig.destinations];
        newDestinations[editLocationModal.index] = newLocation;
        updatedConfig.destinations = newDestinations;
      } else {
        // Was a round trip - no longer returning to start, add new end as destination
        updatedConfig.returnToStart = false;
        updatedConfig.destinations = [...tripConfig.destinations, newLocation];
      }
    } else if (editLocationModal.type === 'destination' && editLocationModal.index !== undefined) {
      const newDestinations = [...tripConfig.destinations];
      newDestinations[editLocationModal.index] = newLocation;
      updatedConfig.destinations = newDestinations;
    }

    setEditLocationModal({ isOpen: false, type: 'start', currentName: '' });
    setPendingLocationChange(null);

    // Show loading toast while regenerating
    const toastId = toast.loading('Regenerating trip with new location...');

    try {
      // Regenerate the trip with the updated config
      const newTrip = await generateTrip(updatedConfig);

      if (newTrip) {
        // Keep the same trip ID so it can be saved over the existing trip
        const tripWithSameId = {
          ...newTrip,
          id: generatedTrip?.id || newTrip.id,
        };
        setGeneratedTrip(tripWithSameId);
        setTripConfig(updatedConfig);
        toast.success('Trip regenerated!', {
          id: toastId,
          description: 'Your trip has been updated with the new location.',
        });
      } else {
        toast.error('Failed to regenerate trip', {
          id: toastId,
          description: 'Please try again.',
        });
      }
    } catch (error) {
      console.error('Failed to regenerate trip:', error);
      toast.error('Failed to regenerate trip', {
        id: toastId,
        description: 'Please try again.',
      });
    }
  };

  const handleCloseEditModal = () => {
    setEditLocationModal({ isOpen: false, type: 'start', currentName: '' });
    setPendingLocationChange(null);
  };

  const handleNewDestinationSelect = async (place: google.maps.places.PlaceResult) => {
    if (place.geometry?.location && place.place_id) {
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();

      // Check if this location is drivable
      const isDrivable = await checkIfDrivable(lat, lng);
      if (!isDrivable) {
        setEntryPointModal({ isOpen: true, place, context: 'add' });
        return;
      }
    }
    setPendingNewDestination(place);
  };

  const handleAddDestination = async () => {
    const place = pendingNewDestination;
    if (!tripConfig || !place?.geometry?.location || !place.place_id) return;

    const newDestination: TripDestination = {
      id: `loc-${place.place_id}-${Date.now()}`,
      placeId: place.place_id,
      name: place.name || place.formatted_address || '',
      address: place.formatted_address || '',
      coordinates: {
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      },
    };

    const updatedConfig = {
      ...tripConfig,
      destinations: [...tripConfig.destinations, newDestination],
    };

    setAddDestinationModal(false);
    setPendingNewDestination(null);

    const toastId = toast.loading('Regenerating trip with new destination...');

    try {
      const newTrip = await generateTrip(updatedConfig);

      if (newTrip) {
        const tripWithSameId = {
          ...newTrip,
          id: generatedTrip?.id || newTrip.id,
        };
        setGeneratedTrip(tripWithSameId);
        setTripConfig(updatedConfig);
        toast.success('Destination added!', {
          id: toastId,
          description: 'Your trip has been updated.',
        });
      } else {
        toast.error('Failed to add destination', {
          id: toastId,
          description: 'Please try again.',
        });
      }
    } catch (error) {
      console.error('Failed to add destination:', error);
      toast.error('Failed to add destination', {
        id: toastId,
        description: 'Please try again.',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="container px-3 sm:px-4 md:px-6 pt-4 pb-2.5 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <Button variant="ghost" size="icon" className="rounded-full shrink-0" onClick={handleExitClick}>
                <X className="w-5 h-5" weight="bold" />
              </Button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-display font-bold text-foreground truncate">
                  {tripConfig.name || 'My Trip'}
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {generatedTrip.days.length} days • {generatedTrip.totalDistance}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
              {collaborators.length > 1 && (
                <CollaboratorAvatars collaborators={collaborators} size="sm" maxDisplay={4} />
              )}
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                onClick={() => setActivityEditorOpen(true)}
                title="Edit Activities"
              >
                <SlidersHorizontal className="w-5 h-5" weight="bold" />
              </Button>
              {isSaved && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  onClick={() => setShareModalOpen(true)}
                >
                  <ShareNetwork className="w-5 h-5" weight="bold" />
                </Button>
              )}
              {isSaved ? (
                <button
                  onClick={handleUnsaveTrip}
                  className="flex items-center justify-center gap-1.5 w-9 h-9 sm:w-[110px] sm:h-auto sm:py-2 text-sm font-semibold text-white bg-earth border-2 border-earth rounded-md hover:bg-earth/90 transition-colors"
                >
                  <CheckCircle className="w-4 h-4" weight="fill" />
                  <span className="hidden sm:inline">Saved</span>
                </button>
              ) : (
                <button
                  onClick={handleSaveTrip}
                  className="flex items-center justify-center gap-1.5 w-9 h-9 sm:w-[110px] sm:h-auto sm:py-2 text-sm font-semibold text-earth bg-earth-light border-2 border-earth rounded-md hover:bg-earth-light/80 transition-colors"
                >
                  <Heart className="w-4 h-4" weight="bold" />
                  <span className="hidden sm:inline">Save Trip</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Trip Timeline Overview */}
      {(tripConfig.startLocation || tripConfig.baseLocation) && (
        <div className="sticky top-[52px] sm:top-[73px] z-40 bg-muted/80 backdrop-blur-sm border-b border-border">
          <div className="px-3 sm:px-4 md:px-6 py-2 sm:py-3">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
              {/* Start Location */}
              {tripConfig.startLocation && (
                <>
                  <button
                    onClick={() => setEditLocationModal({
                      isOpen: true,
                      type: 'start',
                      currentName: tripConfig.startLocation?.name || '',
                    })}
                    className="flex items-center gap-1.5 flex-shrink-0 group hover:bg-white/50 rounded-full px-2 py-1 -mx-2 -my-1 transition-colors"
                  >
                    <div className="w-2 h-2 rounded-full bg-[#34b5a5]" />
                    <span className="text-sm font-medium text-foreground whitespace-nowrap">
                      {tripConfig.startLocation.name.split(',')[0]}
                    </span>
                    <PencilSimple className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                  {tripConfig.destinations.length > 0 && (
                    <CaretRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  )}
                </>
              )}

              {/* Base Location Mode */}
              {tripConfig.baseLocation && !tripConfig.startLocation && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-sm font-medium text-foreground whitespace-nowrap">
                    Exploring {tripConfig.baseLocation.name.split(',')[0]}
                  </span>
                </div>
              )}

              {/* Destinations */}
              {tripConfig.destinations.map((dest, index) => {
                const isLastDestination = index === tripConfig.destinations.length - 1;
                const isEndLocation = isLastDestination && !tripConfig.returnToStart;

                return (
                  <div key={dest.id} className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setEditLocationModal({
                        isOpen: true,
                        type: isEndLocation ? 'end' : 'destination',
                        index,
                        currentName: dest.name,
                      })}
                      className="flex items-center gap-1.5 group hover:bg-white/50 rounded-full px-2 py-1 -mx-2 -my-1 transition-colors"
                    >
                      <div className={`w-2 h-2 rounded-full ${isEndLocation ? 'bg-[#34b5a5]' : 'bg-primary'}`} />
                      <span className="text-sm font-medium text-foreground whitespace-nowrap">
                        {dest.name.split(',')[0]}
                      </span>
                      <PencilSimple className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                    {!isEndLocation && (
                      <CaretRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    )}
                  </div>
                );
              })}

              {/* Add Destination Button - only show if returning to start or no destinations */}
              {(tripConfig.returnToStart || tripConfig.destinations.length === 0) && (
                <>
                  <button
                    onClick={() => setAddDestinationModal(true)}
                    className="flex items-center gap-1.5 flex-shrink-0 group hover:bg-white/50 rounded-full px-2 py-1 -mx-2 -my-1 transition-colors"
                  >
                    <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">Add location</span>
                    <Plus className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
                  </button>

                  {tripConfig.returnToStart && (
                    <CaretRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  )}
                </>
              )}

              {/* Return to Start / End Location */}
              {tripConfig.returnToStart && tripConfig.startLocation && (
                <button
                  onClick={() => setEditLocationModal({
                    isOpen: true,
                    type: 'end',
                    currentName: tripConfig.startLocation?.name || '',
                  })}
                  className="flex items-center gap-1.5 flex-shrink-0 group hover:bg-white/50 rounded-full px-2 py-1 -mx-2 -my-1 transition-colors"
                >
                  <div className="w-2 h-2 rounded-full bg-[#34b5a5]" />
                  <span className="text-sm font-medium text-foreground whitespace-nowrap">
                    {tripConfig.startLocation.name.split(',')[0]}
                  </span>
                  <PencilSimple className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Location Modal */}
      <Dialog open={editLocationModal.isOpen} onOpenChange={(open) => !open && handleCloseEditModal()}>
        <DialogContent
          className="sm:max-w-md"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            // Prevent closing when clicking on Google Autocomplete dropdown
            const target = e.target as HTMLElement;
            if (target.closest('.pac-container') || target.closest('.pac-item')) {
              e.preventDefault();
            }
          }}
          onPointerDownOutside={(e) => {
            // Prevent closing when clicking on Google Autocomplete dropdown
            const target = e.target as HTMLElement;
            if (target.closest('.pac-container') || target.closest('.pac-item')) {
              e.preventDefault();
            }
          }}
          onFocusOutside={(e) => {
            // Prevent focus issues with autocomplete
            e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editLocationModal.type === 'start' || editLocationModal.type === 'end' ? (
                <MapPin className="w-5 h-5 text-aquateal" />
              ) : (
                <MapPinArea className="w-5 h-5 text-lavenderslate" />
              )}
              {editLocationModal.type === 'start'
                ? 'Change Start Location'
                : editLocationModal.type === 'end'
                ? 'Change End Location'
                : 'Change Destination'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Current: <span className="font-medium text-foreground">{editLocationModal.currentName}</span>
            </p>
            <PlaceSearch
              onPlaceSelect={handleLocationSelect}
              placeholder="Search for a new location..."
            />
            {pendingLocationChange && (
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <p className="text-sm text-muted-foreground">New location:</p>
                <p className="font-medium text-foreground">{pendingLocationChange.name || pendingLocationChange.formatted_address}</p>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={handleCloseEditModal} className="flex-1">
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleLocationUpdate}
                disabled={!pendingLocationChange || regenerating}
                className="flex-1"
              >
                {regenerating ? 'Updating...' : 'Change Location'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Entry Point Selector Modal */}
      {entryPointModal.place && (
        <EntryPointSelector
          isOpen={entryPointModal.isOpen}
          onClose={() => setEntryPointModal({ isOpen: false, place: null, context: 'edit' })}
          parentPlace={{
            name: entryPointModal.place.name || entryPointModal.place.formatted_address || '',
            placeId: entryPointModal.place.place_id || '',
            coordinates: {
              lat: entryPointModal.place.geometry?.location?.lat() || 0,
              lng: entryPointModal.place.geometry?.location?.lng() || 0,
            },
          }}
          onSelectEntryPoint={handleEntryPointSelect}
          onUseOriginal={handleUseOriginalLocation}
        />
      )}

      {/* Add Destination Modal */}
      <Dialog open={addDestinationModal} onOpenChange={(open) => {
        if (!open) {
          setAddDestinationModal(false);
          setPendingNewDestination(null);
        }
      }}>
        <DialogContent
          className="sm:max-w-md"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('.pac-container') || target.closest('.pac-item')) {
              e.preventDefault();
            }
          }}
          onPointerDownOutside={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('.pac-container') || target.closest('.pac-item')) {
              e.preventDefault();
            }
          }}
          onFocusOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPinArea className="w-5 h-5 text-lavenderslate" />
              Add Destination
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <PlaceSearch
              onPlaceSelect={handleNewDestinationSelect}
              placeholder="Search for a destination..."
            />
            {pendingNewDestination && (
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <p className="text-sm text-muted-foreground">New destination:</p>
                <p className="font-medium text-foreground">{pendingNewDestination.name || pendingNewDestination.formatted_address}</p>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => {
                setAddDestinationModal(false);
                setPendingNewDestination(null);
              }} className="flex-1">
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleAddDestination}
                disabled={!pendingNewDestination || regenerating}
                className="flex-1"
              >
                {regenerating ? 'Adding...' : 'Add Destination'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <main className="w-full">
        <div className="grid lg:grid-cols-2">
          {/* Map Section */}
          <div className="order-2 lg:order-1 h-[280px] sm:h-[400px] lg:h-[calc(100vh-120px)] lg:sticky lg:top-[120px]">
              <div className="relative w-full h-full">
                <GoogleMap
                  center={mapCenter}
                  zoom={8}
                  className="w-full h-full"
                  onLoad={handleMapLoad}
                  options={{ mapTypeId: 'satellite' }}
                >
                  {/* Route directions - show day route if day selected, otherwise full trip */}
                  {activeDay !== null && dayDirections ? (
                    <DirectionsRenderer
                      key={`day-${activeDay}-route`}
                      directions={dayDirections}
                      options={{
                        suppressMarkers: true,
                        polylineOptions: {
                          strokeColor: isDark ? '#d9d0c3' : '#2d5a3d',
                          strokeWeight: 5,
                          strokeOpacity: 1,
                        },
                      }}
                    />
                  ) : directions ? (
                    <DirectionsRenderer
                      key="full-trip-route"
                      directions={directions}
                      options={{
                        suppressMarkers: true,
                        polylineOptions: {
                          strokeColor: isDark ? '#d9d0c3' : '#2d5a3d',
                          strokeWeight: 5,
                          strokeOpacity: 1,
                        },
                      }}
                    />
                  ) : null}

                  {/* Start/Base marker (only shown when viewing full trip) */}
                  {!activeDay && (tripConfig.startLocation || tripConfig.baseLocation) && (
                    <Marker
                      position={(tripConfig.startLocation || tripConfig.baseLocation)!.coordinates}
                      icon={createMarkerIcon('start', { size: 36 })}
                      title={tripConfig.startLocation
                        ? `Start: ${tripConfig.startLocation.name}`
                        : `Base: ${tripConfig.baseLocation!.name}`
                      }
                    />
                  )}

                  {/* Show origin marker for day preview (previous night's camp or start location) */}
                  {activeDay && (() => {
                    if (activeDay === 1) {
                      // Day 1: show start location as origin
                      const startLoc = tripConfig.startLocation || tripConfig.baseLocation;
                      if (startLoc) {
                        return (
                          <Marker
                            key="day-origin-start"
                            position={startLoc.coordinates}
                            icon={createMarkerIcon('start', { isActive: true, size: 36 })}
                            title={`Start: ${startLoc.name}`}
                          />
                        );
                      }
                    } else {
                      // Other days: show most recent campsite as origin (look back through all previous days)
                      for (let d = activeDay - 1; d >= 1; d--) {
                        const prevDay = generatedTrip.days.find(day => day.day === d);
                        const campsite = prevDay?.stops.find(s => s.type === 'camp');
                        if (campsite) {
                          return (
                            <Marker
                              key="day-origin-camp"
                              position={campsite.coordinates}
                              icon={createSimpleMarkerIcon('camp', { isActive: true, size: 8 })}
                              title={`From: ${campsite.name}`}
                            />
                          );
                        }
                      }
                    }
                    return null;
                  })()}

                  {/* Show destination marker for last day preview when returning to start */}
                  {activeDay && activeDay === generatedTrip.days.length && tripConfig.returnToStart && (tripConfig.startLocation || tripConfig.baseLocation) && (
                    <Marker
                      key="day-destination-end"
                      position={(tripConfig.startLocation || tripConfig.baseLocation)!.coordinates}
                      icon={createMarkerIcon('end', { isActive: true, size: 36 })}
                      title={`End: ${(tripConfig.startLocation || tripConfig.baseLocation)!.name}`}
                    />
                  )}

                  {/* Show end marker when trip doesn't return to start (end is at last destination) */}
                  {!activeDay && !tripConfig.returnToStart && (() => {
                    const endStop = allStops.find(s => s.type === 'end');
                    if (endStop) {
                      return (
                        <Marker
                          key="trip-end-marker"
                          position={endStop.coordinates}
                          icon={createMarkerIcon('end', { size: 36 })}
                          title={`End: ${endStop.name}`}
                        />
                      );
                    }
                    return null;
                  })()}

                  {/* Show end marker for last day preview when NOT returning to start */}
                  {activeDay && activeDay === generatedTrip.days.length && !tripConfig.returnToStart && (() => {
                    const dayStops = generatedTrip.days.find(d => d.day === activeDay)?.stops || [];
                    const endStop = dayStops.find(s => s.type === 'end');
                    if (endStop) {
                      return (
                        <Marker
                          key="day-end-marker"
                          position={endStop.coordinates}
                          icon={createMarkerIcon('end', { isActive: true, size: 36 })}
                          title={`End: ${endStop.name}`}
                        />
                      );
                    }
                    return null;
                  })()}

                  {/* Show only active day's stops when day is selected, otherwise all stops */}
                  {/* Filter out 'end' type stops since we have dedicated start/end markers */}
                  {(activeDay ? generatedTrip.days.find(d => d.day === activeDay)?.stops || [] : allStops)
                    .filter(stop => stop.type !== 'end')
                    .map((stop) => (
                    <Marker
                      key={stop.id}
                      position={stop.coordinates}
                      icon={createMarkerIcon(stop.type, { isActive: !!activeDay, size: 36 })}
                      title={stop.name}
                      onClick={() => setSelectedStop(stop)}
                    />
                  ))}


                  {/* Info window for selected stop */}
                  {selectedStop && (
                    <InfoWindow
                      position={selectedStop.coordinates}
                      onCloseClick={() => setSelectedStop(null)}
                    >
                      <div className="p-1 min-w-[200px]">
                        <h4 className="font-semibold text-gray-900 text-base mb-1">
                          {selectedStop.name}
                        </h4>
                        <p className="text-gray-600 text-sm mb-2">{selectedStop.description}</p>
                        <div className="flex items-center gap-2 text-gray-500 text-sm mb-3">
                          <span>Day {selectedStop.day}</span>
                          <span>•</span>
                          <span>{selectedStop.duration}</span>
                        </div>
                        <button
                          onClick={() => {
                            window.open(
                              `https://www.google.com/maps/dir/?api=1&destination=${selectedStop.coordinates.lat},${selectedStop.coordinates.lng}`,
                              '_blank'
                            );
                          }}
                          className="w-full px-3 py-1.5 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-700 transition-colors"
                        >
                          Get Directions
                        </button>
                      </div>
                    </InfoWindow>
                  )}
                </GoogleMap>

                {/* Route info overlay */}
                <div className="absolute bottom-2 sm:bottom-4 left-2 sm:left-4 right-2 sm:right-4 z-10">
                  <div className="bg-card/95 backdrop-blur-sm rounded-xl border border-border p-2.5 sm:p-4 shadow-lg">
                    {activeDay ? (
                      // Day-specific info
                      <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-4">
                        <div className="flex items-center gap-2 sm:gap-4">
                          <div className="hidden sm:flex items-center justify-center w-10 h-10 bg-emerald-500/10 rounded-full">
                            <span className="text-lg font-bold text-emerald-600">{activeDay}</span>
                          </div>
                          <div>
                            <p className="font-semibold text-foreground text-sm sm:text-base">Day {activeDay}</p>
                            <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Path className="w-3 h-3" />
                                {generatedTrip.days.find(d => d.day === activeDay)?.drivingDistance}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {generatedTrip.days.find(d => d.day === activeDay)?.drivingTime}
                              </span>
                              <span className="hidden sm:flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {generatedTrip.days.find(d => d.day === activeDay)?.stops.length} stops
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <Button variant="outline" size="sm" className="text-xs sm:text-sm h-8" onClick={handleExitDayMode}>
                            <X className="w-3.5 h-3.5 sm:mr-1" />
                            <span className="hidden sm:inline">Exit Day</span>
                          </Button>
                          <Button variant="primary" size="sm" className="text-xs sm:text-sm h-8" onClick={handleNavigateDay}>
                            <NavigationArrow className="w-3.5 h-3.5 sm:mr-2" />
                            <span className="hidden sm:inline">Navigate Day {activeDay}</span>
                            <span className="sm:hidden">Navigate</span>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // Full trip info
                      <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-4">
                        <div className="flex items-center gap-3 sm:gap-6 text-xs sm:text-sm">
                          <div className="flex items-center gap-1.5">
                            <Path className="w-3.5 h-3.5 text-terracotta" />
                            <span className="font-semibold text-foreground">
                              {generatedTrip.totalDistance}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-foreground">{generatedTrip.totalDrivingTime}</span>
                          </div>
                          <div className="hidden sm:flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-primary" />
                            <span className="text-foreground">{generatedTrip.days.length} days</span>
                          </div>
                        </div>
                        <Button variant="primary" size="sm" className="text-xs sm:text-sm h-8" onClick={handleStartNavigation}>
                          <NavigationArrow className="w-3.5 h-3.5 sm:mr-2" />
                          <span className="hidden sm:inline">Start Navigation</span>
                          <span className="sm:hidden">Navigate</span>
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
          </div>

          {/* Itinerary Panel */}
          <div className="order-1 lg:order-2 space-y-4 lg:h-[calc(100vh-120px)] lg:overflow-y-auto">
            {/* Trip Header */}
            <div className="bg-muted/40 border-b px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 space-y-2 sm:space-y-3">
              <div>
                <h1 className="text-xl sm:text-3xl font-display font-bold text-foreground">
                  {tripConfig.name || 'My Trip'}
                </h1>
                {tripConfig.startDate ? (
                  <button
                    onClick={handleOpenDateEdit}
                    className="flex items-center gap-2 mt-1 text-sm group hover:bg-secondary/50 rounded-lg px-2 py-1 -mx-2 transition-colors"
                  >
                    <Calendar className="w-4 h-4 text-primary" />
                    <span className="text-muted-foreground">
                      {new Date(tripConfig.startDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                      {' – '}
                      {(() => {
                        const startDate = new Date(tripConfig.startDate!);
                        const endDate = new Date(startDate);
                        endDate.setDate(startDate.getDate() + generatedTrip.days.length - 1);
                        return endDate.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        });
                      })()}
                    </span>
                    <PencilSimple className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ) : (
                  <button
                    onClick={handleOpenDateEdit}
                    className="flex items-center gap-2 mt-1 text-sm text-primary hover:underline"
                  >
                    <Calendar className="w-4 h-4" />
                    <span>Add trip dates</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1 text-xs sm:text-sm text-muted-foreground">
                <span className="flex items-center gap-1 sm:gap-1.5">
                  <Path className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-terracotta" />
                  {generatedTrip.totalDistance}
                </span>
                <span className="flex items-center gap-1 sm:gap-1.5">
                  <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  {generatedTrip.totalDrivingTime}
                </span>
                <span className="flex items-center gap-1 sm:gap-1.5">
                  <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />
                  {generatedTrip.days.length} days
                </span>
                <span className="hidden sm:flex items-center gap-1.5 capitalize">
                  <Gauge className="w-3.5 h-3.5" />
                  {tripConfig.pacePreference || 'Moderate'}
                </span>
                {(() => {
                  let totalHikingMinutes = 0;
                  let hikeCount = 0;
                  generatedTrip.days.forEach(day => {
                    const estimate = estimateDayTime(day);
                    totalHikingMinutes += estimate.hikingHours * 60;
                    hikeCount += day.stops.filter(s => s.type === 'hike').length;
                  });
                  const hikingHours = Math.floor(totalHikingMinutes / 60);
                  const hikingMiles = Math.round((totalHikingMinutes / 60) * 1.8);
                  if (hikeCount === 0) return null;
                  return (
                    <span className="flex items-center gap-1.5">
                      <Boot className="w-3.5 h-3.5 text-pinesoft" />
                      {hikeCount} {hikeCount === 1 ? 'hike' : 'hikes'} • ~{hikingHours}h • ~{hikingMiles} mi
                    </span>
                  );
                })()}
              </div>
            </div>

           <div className="px-4 sm:px-6 space-y-4">
            {/* Photography Conditions - shows when a stop is selected */}
            {selectedStop && (
              <PhotoWeatherCard
                forecast={selectedStopWeather}
                loading={loadingStopWeather}
                error={stopWeatherError}
                locationName={selectedStop.name}
              />
            )}

            {/* Day-by-Day Itinerary */}
            <div className="space-y-3">
              <h2 className="text-lg font-display font-semibold text-foreground">Itinerary</h2>

              {generatedTrip.days.map((day) => (
                <DayCard
                  key={day.day}
                  day={day}
                  tripName={tripConfig.name}
                  tripStartDate={tripConfig.startDate}
                  expanded={expandedDays.includes(day.day)}
                  isActive={activeDay === day.day}
                  isFirstDay={day.day === 1}
                  isLastDay={day.day === generatedTrip.days.length}
                  startLocation={tripConfig.startLocation}
                  returnToStart={tripConfig.returnToStart}
                  onToggle={() => toggleDay(day.day)}
                  onStartDay={() => handleStartDay(day.day)}
                  onExitDay={handleExitDayMode}
                  onStopClick={setSelectedStop}
                  onSwapHike={handleOpenHikeSwap}
                  onSwapCampsite={handleOpenCampsiteSwap}
                  onRemoveStop={handleRemoveStop}
                />
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-4 pb-4 sm:pb-0">
              <Button variant="primary" size="lg" className="flex-1" onClick={handleStartNavigation}>
                <NavigationArrow className="w-4 h-4 mr-2" />
                Start Trip
              </Button>
              <Link to="/create-trip" className="sm:w-auto">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  Edit Trip
                </Button>
              </Link>
            </div>
           </div>
          </div>
        </div>
      </main>

      {/* Alternative Hikes Modal */}
      {selectedHikeForSwap && (
        <AlternativeHikesModal
          isOpen={hikeModalOpen}
          onClose={() => {
            setHikeModalOpen(false);
            setSelectedHikeForSwap(null);
          }}
          currentHike={selectedHikeForSwap}
          searchLat={selectedHikeForSwap.coordinates.lat}
          searchLng={selectedHikeForSwap.coordinates.lng}
          onSelectHike={handleSwapHike}
        />
      )}

      {/* Alternative Campsites Modal */}
      {selectedCampsiteForSwap && (
        <AlternativeCampsitesModal
          isOpen={campsiteModalOpen}
          onClose={() => {
            setCampsiteModalOpen(false);
            setSelectedCampsiteForSwap(null);
          }}
          currentCampsite={selectedCampsiteForSwap}
          searchLat={selectedCampsiteForSwap.coordinates.lat}
          searchLng={selectedCampsiteForSwap.coordinates.lng}
          onSelectCampsite={handleSwapCampsite}
          tripStartDate={tripConfig.startDate ? (() => {
            // Calculate the specific date for this campsite's day
            const [year, month, day] = tripConfig.startDate!.split('-').map(Number);
            const date = new Date(year, month - 1, day + (selectedCampsiteForSwap.day || 1) - 1);
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          })() : undefined}
          tripDuration={1}
          lodgingPreference={
            // If user clicked "Search for established campgrounds" on a no-dispersed marker, force campground search
            selectedCampsiteForSwap.id === 'no-dispersed-found' || selectedCampsiteForSwap.note === 'NO_DISPERSED_SITES_FOUND'
              ? 'campground'
              : tripConfig.lodgingPreference
          }
        />
      )}

      {/* Edit Dates Modal */}
      <Dialog open={dateEditModal} onOpenChange={setDateEditModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              {tripConfig.startDate ? 'Edit Trip Dates' : 'Set Trip Dates'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <DatePicker
                  value={editingStartDate}
                  onChange={(date) => {
                    setEditingStartDate(date);
                    // Auto-adjust end date if start is after end
                    if (date && editingEndDate && date > editingEndDate) {
                      setEditingEndDate(date);
                    }
                  }}
                  placeholder="Select start date"
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <DatePicker
                  value={editingEndDate}
                  onChange={setEditingEndDate}
                  placeholder="Select end date"
                />
              </div>
            </div>
            {editingStartDate && editingEndDate && generatedTrip && (
              <div className="p-3 bg-secondary/50 rounded-lg space-y-2">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{getEditingDuration()} days</span>
                  {' '}from{' '}
                  <span className="font-medium text-foreground">
                    {editingStartDate.toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  {' '}to{' '}
                  <span className="font-medium text-foreground">
                    {editingEndDate.toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </p>
                {getEditingDuration() !== generatedTrip.days.length && (
                  <p className="text-sm">
                    {getEditingDuration() > generatedTrip.days.length ? (
                      <span className="text-primary">
                        +{getEditingDuration() - generatedTrip.days.length} day(s) will be added
                      </span>
                    ) : (
                      <span className="text-amber-600">
                        {generatedTrip.days.length - getEditingDuration()} day(s) will be removed
                      </span>
                    )}
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDateEditModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateDates} disabled={!editingStartDate || !editingEndDate}>
              Save Dates
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Trip Modal */}
      {generatedTrip && (
        <ShareTripModal
          tripId={generatedTrip.id}
          tripName={tripConfig.name || 'My Trip'}
          isOpen={shareModalOpen}
          onClose={() => {
            setShareModalOpen(false);
            // Refresh collaborators after modal closes
            fetchCollaborators(generatedTrip.id).then(setCollaborators);
          }}
        />
      )}

      {/* Activity Editor Modal */}
      <ActivityEditorModal
        isOpen={activityEditorOpen}
        onClose={() => setActivityEditorOpen(false)}
        activities={tripConfig.activities || []}
        pacePreference={tripConfig.pacePreference}
        offroadVehicleType={tripConfig.offroadVehicleType}
        onSave={handleUpdateActivities}
      />

      {/* Exit Confirmation Modal */}
      <Dialog open={exitConfirmModal} onOpenChange={setExitConfirmModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Warning className="w-5 h-5 text-amber-500" weight="fill" />
              Unsaved Trip
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              This trip hasn't been saved yet. If you leave now, you'll lose all your trip details.
            </p>
            <div className="flex flex-col gap-2">
              <Button variant="primary" onClick={handleSaveAndExit}>
                <Heart className="w-4 h-4 mr-2" weight="bold" />
                Save & Exit
              </Button>
              <Button variant="outline" onClick={handleExitWithoutSaving}>
                Exit Without Saving
              </Button>
              <Button variant="ghost" onClick={() => setExitConfirmModal(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Regenerating Loading Overlay */}
      {regenerating && <RegeneratingLoader />}

    </div>
  );
};

interface DayCardProps {
  day: TripDay;
  tripName?: string;
  tripStartDate?: string; // ISO date string (YYYY-MM-DD)
  expanded: boolean;
  isActive: boolean;
  isFirstDay: boolean;
  isLastDay: boolean;
  startLocation?: { name: string; coordinates: { lat: number; lng: number } };
  returnToStart?: boolean;
  onToggle: () => void;
  onStartDay: () => void;
  onExitDay: () => void;
  onStopClick: (stop: TripStop) => void;
  onSwapHike: (hike: TripStop) => void;
  onSwapCampsite: (campsite: TripStop) => void;
  onRemoveStop: (dayNumber: number, stop: TripStop) => void;
}

const DayCard = ({ day, tripName, tripStartDate, expanded, isActive, isFirstDay, isLastDay, startLocation, returnToStart, onToggle, onStartDay, onExitDay, onStopClick, onSwapHike, onSwapCampsite, onRemoveStop }: DayCardProps) => {
  const timeEstimate = estimateDayTime(day);

  // Calculate the date for this day
  const dayDate = tripStartDate ? (() => {
    const [year, month, dayNum] = tripStartDate.split('-').map(Number);
    const date = new Date(year, month - 1, dayNum + day.day - 1);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  })() : null;

  return (
    <Card className={`overflow-hidden ${isActive ? 'ring-2 ring-primary border-primary' : ''}`}>
      {/* Day Header */}
      <div className="p-3 sm:p-4 hover:bg-secondary/50 transition-colors">
        <div className="flex items-center justify-between">
          <button
            onClick={onToggle}
            className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0"
          >
            <div className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full shrink-0 ${isActive ? 'bg-primary text-primary-foreground' : 'bg-primary/10'}`}>
              <span className={`text-sm sm:text-lg font-bold ${isActive ? '' : 'text-primary'}`}>{day.day}</span>
            </div>
            <div className="text-left min-w-0">
              <p className="font-medium text-foreground text-sm sm:text-base truncate">
                Day {day.day}
                {dayDate && <span className="ml-1.5 sm:ml-2 text-xs sm:text-sm font-normal text-muted-foreground">{dayDate}</span>}
                {isActive && <span className="ml-1.5 text-[10px] sm:text-xs text-primary font-normal">(Previewing)</span>}
              </p>
              <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Path className="w-3 h-3" />
                  {day.drivingDistance}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {day.drivingTime}
                </span>
              </div>
            </div>
          </button>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {timeEstimate.warningMessage && (
              <Warning
                className={`w-4 h-4 hidden sm:block ${timeEstimate.isOverloaded ? 'text-amber-500' : 'text-blue-500'}`}
                title={timeEstimate.warningMessage}
              />
            )}
            <div className="hidden sm:flex items-center gap-1">
              {day.hike && <Boot className="w-4 h-4 text-pinesoft" />}
              {day.campsite && <Tent className="w-4 h-4 text-wildviolet" />}
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="text-xs sm:text-sm h-7 w-7 sm:w-auto sm:h-8 px-0 sm:px-3"
              onClick={(e) => {
                e.stopPropagation();
                if (isActive) {
                  onExitDay();
                } else {
                  onStartDay();
                }
              }}
            >
              <NavigationArrow className="w-3 h-3 sm:mr-1" />
              <span className="hidden sm:inline">{isActive ? 'Exit Preview' : 'Preview'}</span>
            </Button>
            <button onClick={onToggle}>
              {expanded ? (
                <CaretUp className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
              ) : (
                <CaretDown className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Day Stops */}
      {expanded && (
        <div className="border-t border-border">
          {/* Starting location on day 1 */}
          {isFirstDay && startLocation && (
            <div className="p-4 bg-aquateal/5 border-b border-border">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg border border-aquateal/30 bg-aquateal/20">
                  <MapPin className="w-4 h-4 text-aquateal" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-foreground">Start: {startLocation.name}</h4>
                  <p className="text-sm text-muted-foreground mt-0.5">Trip starting point</p>
                </div>
              </div>
            </div>
          )}

          {day.stops.map((stop, index) => {
            const Icon = getIcon(stop.type);
            const typeStyles = getTypeStyles(stop.type);

            // Special handling for "no dispersed sites found" marker
            if (stop.id === 'no-dispersed-found' || stop.note === 'NO_DISPERSED_SITES_FOUND') {
              return (
                <div
                  key={stop.id}
                  className="p-4 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-100 dark:bg-amber-800/30">
                      <Warning className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-amber-800 dark:text-amber-200">No dispersed campsites found</h4>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">
                        There are no known dispersed camping spots in this area.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 border-amber-400 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-800/30"
                        onClick={() => onSwapCampsite(stop)}
                      >
                        <Tent className="w-4 h-4 mr-2" />
                        Search for established campgrounds instead
                      </Button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={stop.id}
                className="p-4 hover:bg-secondary/30 transition-colors border-b border-border last:border-b-0 group"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex items-center justify-center w-9 h-9 rounded-lg border ${typeStyles}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className="cursor-pointer flex-1"
                        onClick={() => onStopClick(stop)}
                      >
                        <h4 className="font-medium text-foreground">{stop.name}</h4>
                        <p className="text-sm text-muted-foreground mt-0.5">{stop.description}</p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {stop.type === 'hike' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSwapHike(stop);
                            }}
                            className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors"
                            title="Choose different hike"
                          >
                            <ArrowsClockwise className="w-4 h-4" weight="bold" />
                          </button>
                        )}
                        {stop.type === 'camp' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSwapCampsite(stop);
                            }}
                            className="p-1.5 rounded-lg hover:bg-wildviolet/10 text-wildviolet transition-colors"
                            title="Choose different campsite"
                          >
                            <ArrowsClockwise className="w-4 h-4" weight="bold" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveStop(day.day, stop);
                          }}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                          title="Remove stop"
                        >
                          <Trash className="w-4 h-4" weight="bold" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {stop.duration}
                      </span>
                      {stop.type === 'hike' && estimateTrailLength(stop.duration) && (
                        <span className="flex items-center gap-1">
                          <Mountains className="w-3 h-3" />
                          {estimateTrailLength(stop.duration)}
                        </span>
                      )}
                      {stop.distance && (
                        <span className="flex items-center gap-1">
                          <Path className="w-3 h-3" />
                          {stop.distance}
                        </span>
                      )}
                      {stop.drivingTime && (
                        <span className="flex items-center gap-1 text-primary">
                          <NavigationArrow className="w-3 h-3" />
                          {stop.drivingTime}
                        </span>
                      )}
                      {stop.rating && (
                        <span className="flex items-center gap-1">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          {stop.rating.toFixed(1)}
                        </span>
                      )}
                      {stop.type === 'hike' && (
                        <a
                          href={getAllTrailsUrl(stop.name, stop.coordinates.lat, stop.coordinates.lng)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 hover:underline"
                        >
                          <ArrowSquareOut className="w-3 h-3" />
                          AllTrails
                        </a>
                      )}
                      {stop.type === 'camp' && stop.bookingUrl && (
                        <a
                          href={stop.bookingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-wildviolet hover:text-wildviolet/80 hover:underline"
                        >
                          <ArrowSquareOut className="w-3 h-3" />
                          Book Site
                        </a>
                      )}
                      {stop.type === 'camp' && (
                        <span className="flex items-center gap-1 text-muted-foreground/70">
                          {stop.id.startsWith('ridb-') ? (
                            <a
                              href={`https://www.recreation.gov/camping/campgrounds/${stop.id.replace('ridb-', '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-primary hover:underline"
                            >
                              Recreation.gov
                            </a>
                          ) : stop.id.startsWith('usfs-') ? (
                            <a
                              href={`https://www.google.com/search?q=${encodeURIComponent(stop.name + ' USFS campground')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-primary hover:underline"
                            >
                              USFS
                            </a>
                          ) : stop.id.startsWith('osm-') ? (
                            <a
                              href={`https://www.openstreetmap.org/${stop.id.replace('osm-', '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-primary hover:underline"
                            >
                              OpenStreetMap
                            </a>
                          ) : stop.placeId ? (
                            <a
                              href={`https://www.google.com/maps/place/?q=place_id:${stop.placeId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-primary hover:underline"
                            >
                              Google Maps
                            </a>
                          ) : 'source unknown'}
                          <span className="text-[10px] opacity-70">
                            ({stop.coordinates.lat.toFixed(4)}, {stop.coordinates.lng.toFixed(4)})
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Ending location on last day if returning to start */}
          {isLastDay && returnToStart && startLocation && (
            <div className="p-4 bg-aquateal/5 border-b border-border">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg border border-aquateal/30 bg-aquateal/20">
                  <MapPin className="w-4 h-4 text-aquateal" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-foreground">End: {startLocation.name}</h4>
                  <p className="text-sm text-muted-foreground mt-0.5">Return to starting point</p>
                </div>
              </div>
            </div>
          )}

          {/* View Day Details Link */}
          <Link
            to={getDayUrl(tripName, day.day)}
            className="block p-3 text-center text-sm font-medium text-primary hover:bg-primary/5 transition-colors"
          >
            View Day Details →
          </Link>
        </div>
      )}
    </Card>
  );
};

export default TripDetail;
