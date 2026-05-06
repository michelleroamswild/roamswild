import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTrip, Collaborator } from '@/context/TripContext';
import { TripStop, TripDestination, PacePreference } from '@/types/trip';
import { toast } from 'sonner';
import { AlternativeHikesModal } from '@/components/AlternativeHikesModal';
import { AlternativeCampsitesModal } from '@/components/AlternativeCampsitesModal';
import { ShareTripModal } from '@/components/ShareTripModal';
import { getTripSlug } from '@/utils/slugify';
import { useTripGenerator } from '@/hooks/use-trip-generator';
import { useTheme } from '@/hooks/use-theme';
import { usePhotoWeather } from '@/hooks/use-photo-weather';
import { EntryPointSelector, checkIfDrivable } from '@/components/EntryPointSelector';
import { ActivityEditorModal } from '@/components/ActivityEditorModal';
import { RegeneratingLoader } from '@/components/RegeneratingLoader';
import { ExitConfirmModal } from '@/components/trip-detail/ExitConfirmModal';
import { EditDatesModal } from '@/components/trip-detail/EditDatesModal';
import { EditLocationModal } from '@/components/trip-detail/EditLocationModal';
import { AddDestinationModal } from '@/components/trip-detail/AddDestinationModal';
import { TripDetailHeader } from '@/components/trip-detail/TripDetailHeader';
import { TripTimelineStrip } from '@/components/trip-detail/TripTimelineStrip';
import { TripMapView } from '@/components/trip-detail/TripMapView';
import { ItineraryPanel } from '@/components/trip-detail/ItineraryPanel';

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

  const handleRegenerateFromScratch = async () => {
    if (!generatedTrip) return;
    const ok = window.confirm(
      'Regenerate this trip from scratch? All day customizations (swapped hikes, campsites, removed stops) will be lost.'
    );
    if (!ok) return;

    toast.loading('Regenerating trip from scratch...', { id: 'regenerating' });
    try {
      const fresh = await generateTrip(tripConfig);
      if (!fresh) {
        toast.error('Failed to regenerate trip', { id: 'regenerating' });
        return;
      }
      const replaced = {
        ...fresh,
        id: generatedTrip.id,
        config: tripConfig,
        // The reorder happened on first creation — preserve the notice so
        // regenerating doesn't make it disappear.
        reorderedDestinations: generatedTrip.reorderedDestinations,
      };
      setGeneratedTrip(replaced);
      if (isSaved) await saveTrip(replaced);
      toast.success(`Trip regenerated (${replaced.days.length} days)`, { id: 'regenerating' });
    } catch (err) {
      toast.error('Failed to regenerate trip', { id: 'regenerating' });
    }
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
      <div className="min-h-screen bg-cream dark:bg-paper flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10">
            <div className="w-5 h-5 border-2 border-pine-6 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-[12px] font-mono font-semibold uppercase tracking-[0.12em] text-pine-6">Loading trip…</p>
        </div>
      </div>
    );
  }

  const toggleDay = (day: number) => {
    setExpandedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  // Calculate map center and all stops. Memoized so map callbacks/effects
  // stay referentially stable — otherwise selecting a stop re-renders this
  // component, recomputes allStops, invalidates fitMapBounds, fires the
  // refit effect, and the map jumps mid-interaction.
  const allStops = useMemo(
    () => generatedTrip.days.flatMap((day) => day.stops),
    [generatedTrip.days],
  );
  const mapCenter = useMemo(
    () => (allStops.length > 0
      ? {
          lat: allStops.reduce((sum, s) => sum + s.coordinates.lat, 0) / allStops.length,
          lng: allStops.reduce((sum, s) => sum + s.coordinates.lng, 0) / allStops.length,
        }
      : { lat: 37.7749, lng: -122.4194 }),
    [allStops],
  );

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
          config: updatedConfig,
        };
        setGeneratedTrip(tripWithSameId);
        setTripConfig(updatedConfig);
        try {
          await saveTrip(tripWithSameId);
        } catch (saveErr) {
          console.warn('Failed to persist regenerated trip:', saveErr);
        }
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

    // For round trips (or empty itineraries) the new stop appends. For
    // one-way trips the last destination IS the end, so we insert the new
    // stop just before it — keeping the user's chosen endpoint intact.
    const nextDestinations = [...tripConfig.destinations];
    if (tripConfig.returnToStart || nextDestinations.length === 0) {
      nextDestinations.push(newDestination);
    } else {
      nextDestinations.splice(nextDestinations.length - 1, 0, newDestination);
    }
    const updatedConfig = {
      ...tripConfig,
      destinations: nextDestinations,
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
          config: updatedConfig,
        };
        setGeneratedTrip(tripWithSameId);
        setTripConfig(updatedConfig);
        // Persist so the new destination survives a reload.
        try {
          await saveTrip(tripWithSameId);
        } catch (saveErr) {
          console.warn('Failed to persist regenerated trip:', saveErr);
        }
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
    <div className="min-h-screen bg-paper text-ink font-sans">
      {/* Sticky cluster — header + timeline strip move together so the
          timeline never gets cut off behind the sticky header. */}
      <div className="sticky top-0 z-50">
        <TripDetailHeader
          tripName={tripConfig.name}
          totalDays={generatedTrip.days.length}
          requestedDuration={tripConfig.duration}
          totalDistance={generatedTrip.totalDistance}
          collaborators={collaborators}
          isSaved={isSaved}
          onExitClick={handleExitClick}
          onOpenActivityEditor={() => setActivityEditorOpen(true)}
          onOpenShare={() => setShareModalOpen(true)}
          onUnsave={handleUnsaveTrip}
          onSave={handleSaveTrip}
          onRegenerateFromScratch={handleRegenerateFromScratch}
          regenerating={regenerating}
          reorderedDestinations={generatedTrip.reorderedDestinations}
        />

        <TripTimelineStrip
          tripConfig={tripConfig}
          onEditStart={() => setEditLocationModal({
            isOpen: true,
            type: 'start',
            currentName: tripConfig.startLocation?.name || '',
          })}
          onEditDestination={(index, currentName, isEndLocation) => setEditLocationModal({
            isOpen: true,
            type: isEndLocation ? 'end' : 'destination',
            index,
            currentName,
          })}
          onEditEnd={() => setEditLocationModal({
            isOpen: true,
            type: 'end',
            currentName: tripConfig.startLocation?.name || '',
          })}
          onAddDestination={() => setAddDestinationModal(true)}
        />
      </div>

      {/* Edit Location Modal */}
      <EditLocationModal
        isOpen={editLocationModal.isOpen}
        type={editLocationModal.type}
        currentName={editLocationModal.currentName}
        pendingLocation={pendingLocationChange}
        regenerating={regenerating}
        onPlaceSelect={handleLocationSelect}
        onConfirm={handleLocationUpdate}
        onClose={handleCloseEditModal}
      />

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
      <AddDestinationModal
        isOpen={addDestinationModal}
        pendingDestination={pendingNewDestination}
        regenerating={regenerating}
        onPlaceSelect={handleNewDestinationSelect}
        onAdd={handleAddDestination}
        onClose={() => {
          setAddDestinationModal(false);
          setPendingNewDestination(null);
        }}
      />

      <main className="w-full">
        <div className="grid lg:grid-cols-2">
          {/* Map Section */}
          <TripMapView
            tripConfig={tripConfig}
            generatedTrip={generatedTrip}
            allStops={allStops}
            mapCenter={mapCenter}
            isDark={isDark}
            activeDay={activeDay}
            directions={directions}
            dayDirections={dayDirections}
            selectedStop={selectedStop}
            onMapLoad={handleMapLoad}
            onSelectStop={setSelectedStop}
          />

          {/* Itinerary Panel */}
          <ItineraryPanel
            tripConfig={tripConfig}
            generatedTrip={generatedTrip}
            expandedDays={expandedDays}
            activeDay={activeDay}
            selectedStop={selectedStop}
            selectedStopWeather={selectedStopWeather}
            loadingStopWeather={loadingStopWeather}
            stopWeatherError={stopWeatherError}
            onOpenDateEdit={handleOpenDateEdit}
            onToggleDay={toggleDay}
            onStartDay={handleStartDay}
            onExitDay={handleExitDayMode}
            onStopClick={setSelectedStop}
            onSwapHike={handleOpenHikeSwap}
            onSwapCampsite={handleOpenCampsiteSwap}
            onRemoveStop={handleRemoveStop}
            onStartNavigation={handleStartNavigation}
          />
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
      <EditDatesModal
        isOpen={dateEditModal}
        onOpenChange={setDateEditModal}
        hasExistingStartDate={!!tripConfig.startDate}
        startDate={editingStartDate}
        endDate={editingEndDate}
        onStartDateChange={setEditingStartDate}
        onEndDateChange={setEditingEndDate}
        currentTripDays={generatedTrip.days.length}
        getEditingDuration={getEditingDuration}
        onSave={handleUpdateDates}
        onCancel={() => setDateEditModal(false)}
      />

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
      <ExitConfirmModal
        isOpen={exitConfirmModal}
        onOpenChange={setExitConfirmModal}
        onSaveAndExit={handleSaveAndExit}
        onExitWithoutSaving={handleExitWithoutSaving}
        onCancel={() => setExitConfirmModal(false)}
      />

      {/* Regenerating Loading Overlay */}
      {regenerating && (
        <RegeneratingLoader
          tripName={tripConfig?.name}
          destinations={tripConfig?.destinations}
        />
      )}

    </div>
  );
};


export default TripDetail;
