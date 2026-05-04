import { useState, useEffect } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Mountains,
  NavigationArrow,
  Star,
  ArrowSquareOut,
  Compass,
  Boot,
  Path,
  Calendar,
  Tent,
  SpinnerGap,
  Camera,
  X,
  Sun,
  Shuffle,
  Binoculars,
  Drop,
  Check,
  Heart,
  CheckCircle,
} from '@phosphor-icons/react';
import { Slider } from '@/components/ui/slider';
import { PacePreference, LodgingType } from '@/types/trip';
import { useSavedLocations } from '@/context/SavedLocationsContext';
import { GoogleMap } from '@/components/GoogleMap';
import { InfoWindow } from '@react-google-maps/api';
import { AdvancedMarker } from '@/components/AdvancedMarker';
import { useNearbyPlaces, GoogleSavedPlace } from '@/hooks/use-nearby-places';
import { useNearbyHikes, HikeResult } from '@/hooks/use-nearby-hikes';
import { usePhotoHotspots, PhotoHotspot } from '@/hooks/use-photo-hotspots';
import { useNoaaWeather, getWeatherIcon } from '@/hooks/use-noaa-weather';
import { toast } from 'sonner';
import { useTrip } from '@/context/TripContext';
import { useTripGenerator } from '@/hooks/use-trip-generator';
import { createMarkerIcon } from '@/utils/mapMarkers';
import { getTripUrl } from '@/utils/slugify';
import { Mono, Pill } from '@/components/redesign';
import { cn } from '@/lib/utils';

type NearbyPlace = GoogleSavedPlace & { distance: number };

interface LocationState {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  surpriseMe?: {
    regionId: string;
    explanation: string;
    distanceMiles: number;
    driveTimeHours?: number;
    biome?: string;
    cautions?: string[];
    anchor?: {
      road: { name: string | null; ref: string | null; surface: string; highway: string };
      center: { lat: number; lng: number };
      lengthMiles: number;
    };
    highlights?: Array<{
      type: 'viewpoint' | 'trail' | 'water' | 'camp';
      name: string | null;
      lat: number;
      lon: number;
      distanceMiles: number;
    }>;
  };
}

const MARKER_SIZE = 38;

function getElevationMessage(elevationFeet: number): string | null {
  if (elevationFeet >= 8000) return 'Likely snow-covered';
  if (elevationFeet >= 6000) return 'Pack a puffy';
  if (elevationFeet >= 3000) return 'Could be chilly';
  return null;
}

function cleanRegionName(name: string): string {
  const suffixes = ['National Forest', 'National Park', 'Wilderness', 'State Park', 'Recreation Area'];
  for (const suffix of suffixes) {
    const duplicated = `${suffix} ${suffix}`;
    if (name.includes(duplicated)) return name.replace(duplicated, suffix);
  }
  return name;
}

const HIGHLIGHT_META: Record<
  'viewpoint' | 'trail' | 'water' | 'camp',
  { Icon: typeof Binoculars; bg: string; text: string }
> = {
  viewpoint: { Icon: Binoculars, bg: 'bg-ember/15', text: 'text-ember' },
  trail:     { Icon: Path,       bg: 'bg-sage/15',  text: 'text-sage' },
  water:     { Icon: Drop,       bg: 'bg-water/15', text: 'text-water' },
  camp:      { Icon: Tent,       bg: 'bg-clay/15',  text: 'text-clay' },
};

function SurpriseMeBanner({ surpriseMe }: { surpriseMe: NonNullable<LocationState['surpriseMe']> }) {
  return (
    <div className="bg-clay/[0.06] border border-clay/30 rounded-[14px] p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-[10px] bg-clay/15 text-clay flex items-center justify-center">
          <Shuffle className="w-5 h-5" weight="regular" />
        </div>
        <div>
          <Mono className="text-clay">Surprise me discovery</Mono>
          <p className="text-[13px] text-ink-3 mt-0.5">
            {Math.round(surpriseMe.distanceMiles)} mi away
            {surpriseMe.driveTimeHours && ` · ~${surpriseMe.driveTimeHours.toFixed(1)} hr drive`}
          </p>
        </div>
      </div>

      <p className="text-[14px] text-ink leading-[1.55] mb-4">
        {cleanRegionName(surpriseMe.explanation)}
      </p>

      {surpriseMe.anchor && (
        <button
          onClick={() => {
            window.open(
              `https://www.google.com/maps/dir/?api=1&destination=${surpriseMe.anchor!.center.lat},${surpriseMe.anchor!.center.lng}`,
              '_blank',
            );
          }}
          className="w-full p-4 rounded-[12px] bg-white dark:bg-paper-2 border border-line shadow-[0_1px_2px_rgba(29,34,24,.04)] hover:border-pine-6/40 hover:shadow-[0_8px_18px_rgba(29,34,24,.08)] transition-all text-left mb-4"
        >
          <div className="flex items-center justify-between mb-1.5">
            <Mono className="text-pine-6 inline-flex items-center gap-1.5">
              <NavigationArrow className="w-3.5 h-3.5" weight="regular" />
              Scenic drive
            </Mono>
            <ArrowSquareOut className="w-3.5 h-3.5 text-ink-3" weight="regular" />
          </div>
          <p className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink">
            {surpriseMe.anchor.road.name || surpriseMe.anchor.road.ref || 'Unnamed road'}
            {surpriseMe.anchor.lengthMiles > 0 && (
              <span className="text-[13px] text-ink-3 font-normal ml-2">
                ({surpriseMe.anchor.lengthMiles.toFixed(1)} mi)
              </span>
            )}
          </p>
          {surpriseMe.anchor.road.surface !== 'unknown' && (
            <Mono className="text-ink-3 mt-1 capitalize block">
              {surpriseMe.anchor.road.surface} surface
            </Mono>
          )}
        </button>
      )}

      {surpriseMe.highlights && surpriseMe.highlights.length > 0 && (
        <div className="mb-4">
          <Mono className="text-ink-2 mb-2 block">Nearby highlights</Mono>
          <div className="flex flex-wrap gap-1.5">
            {surpriseMe.highlights.slice(0, 4).map((h, i) => {
              const meta = HIGHLIGHT_META[h.type] || HIGHLIGHT_META.viewpoint;
              const HIcon = meta.Icon;
              return (
                <button
                  key={i}
                  onClick={() =>
                    window.open(`https://www.google.com/maps/search/?api=1&query=${h.lat},${h.lon}`, '_blank')
                  }
                  className={cn(
                    'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-mono uppercase tracking-[0.10em] font-semibold transition-opacity hover:opacity-80',
                    meta.bg,
                    meta.text,
                  )}
                >
                  <HIcon className="w-3 h-3" weight="regular" />
                  <span className="truncate max-w-[120px]">
                    {h.name || h.type.charAt(0).toUpperCase() + h.type.slice(1)}
                  </span>
                  <ArrowSquareOut className="w-2.5 h-2.5" weight="regular" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {surpriseMe.cautions && surpriseMe.cautions.length > 0 && (
        <div className="px-3 py-2.5 rounded-[10px] border border-clay/40 bg-clay/[0.10]">
          <Mono className="text-clay mb-1 block">Heads up</Mono>
          <ul className="text-[12px] text-ink-2 space-y-0.5 leading-[1.5]">
            {surpriseMe.cautions.slice(0, 2).map((caution, i) => (
              <li key={i}>· {caution}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const LocationDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { locations, addLocation, removeLocation, isLocationSaved } = useSavedLocations();
  const { setTripConfig, setGeneratedTrip } = useTrip();
  const { generateTrip, generating } = useTripGenerator();

  const [selectedHike, setSelectedHike] = useState<HikeResult | null>(null);
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [elevation, setElevation] = useState<number | null>(null);

  const [tripDuration, setTripDuration] = useState<number[]>([3]);
  const [activities, setActivities] = useState<string[]>(['hiking']);
  const [pacePreference, setPacePreference] = useState<PacePreference>('moderate');
  const [globalLodging, setGlobalLodging] = useState<LodgingType>('dispersed');
  const [sameCampsite, setSameCampsite] = useState(false);
  const [itineraryModalOpen, setItineraryModalOpen] = useState(false);

  const stateLocation = routerLocation.state as LocationState | null;

  const [surpriseMeData, setSurpriseMeData] = useState<LocationState['surpriseMe'] | null>(null);

  useEffect(() => {
    if (stateLocation?.surpriseMe && !surpriseMeData) {
      setSurpriseMeData(stateLocation.surpriseMe);
    }
  }, [stateLocation?.surpriseMe]);

  const savedLocation = locations.find((l) => l.placeId === id || l.id === id);

  const location = savedLocation
    ? {
        placeId: savedLocation.placeId,
        name: savedLocation.name,
        address: savedLocation.address,
        type: savedLocation.type,
        lat: savedLocation.lat,
        lng: savedLocation.lng,
      }
    : stateLocation
      ? {
          placeId: stateLocation.placeId,
          name: stateLocation.name,
          address: stateLocation.address,
          type: 'Place',
          lat: stateLocation.lat,
          lng: stateLocation.lng,
        }
      : null;

  const isSaved = location ? isLocationSaved(location.placeId) : false;

  const { nearbyPlaces, loading: nearbyLoading } = useNearbyPlaces(
    location?.lat ?? 0,
    location?.lng ?? 0,
    50,
  );

  const { hikes, loading: hikesLoading } = useNearbyHikes(
    location?.lat ?? 0,
    location?.lng ?? 0,
    30,
  );

  const { hotspots: photoHotspots, loading: photoHotspotsLoading } = usePhotoHotspots(
    location?.lat ?? 0,
    location?.lng ?? 0,
    50,
  );

  const { weather, loading: weatherLoading } = useNoaaWeather(
    location?.lat ?? null,
    location?.lng ?? null,
  );

  const [enlargedPhoto, setEnlargedPhoto] = useState<{ url: string; name: string } | null>(null);
  const [selectedPhotoHotspot, setSelectedPhotoHotspot] = useState<PhotoHotspot | null>(null);

  useEffect(() => {
    if (!location) return;
    const controller = new AbortController();
    fetch(
      `https://epqs.nationalmap.gov/v1/json?x=${location.lng}&y=${location.lat}&units=Meters&output=json`,
      { signal: controller.signal },
    )
      .then((res) => res.json())
      .then((data) => {
        if (data?.value !== undefined) setElevation(Number(data.value));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [location]);

  if (!location) {
    return (
      <div className="min-h-screen bg-cream dark:bg-paper flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-sage/15 text-sage mb-4">
            <MapPin className="w-6 h-6" weight="regular" />
          </div>
          <Mono className="text-sage">Lost in the woods</Mono>
          <h1 className="text-[24px] font-sans font-bold tracking-[-0.02em] text-ink mt-2">
            Location not found.
          </h1>
          <p className="text-[14px] text-ink-3 mt-2">This location may have been removed.</p>
          <Link
            to="/"
            className="mt-6 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-pine-6 text-cream dark:text-ink-pine border border-pine-6 text-[12px] font-sans font-semibold tracking-[0.01em] hover:bg-pine-5 hover:border-pine-5 transition-colors"
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  const handleOpenInMaps = () =>
    window.open(`https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`, '_blank');

  const handleGetDirections = () =>
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`, '_blank');

  const handleSaveLocation = () => {
    if (!location) return;
    const added = addLocation({
      placeId: location.placeId,
      name: location.name,
      address: location.address,
      type: location.type,
      lat: location.lat,
      lng: location.lng,
    });
    if (added) toast.success(`Saved ${location.name}`, { description: 'Added to your favorites' });
  };

  const handleRemoveLocation = () => {
    if (!savedLocation) return;
    removeLocation(savedLocation.id);
    toast.success(`Removed ${location.name}`, { description: 'Removed from favorites' });
  };

  const handleGenerateTrip = async () => {
    if (!location) return;

    const paceToActivities: Record<PacePreference, number> = {
      relaxed: 1,
      moderate: 2,
      packed: 3,
    };

    const tripConfig = {
      name: `Trip to ${location.name}`,
      duration: tripDuration[0],
      destinations: [],
      returnToStart: false,
      baseLocation: {
        id: location.placeId,
        placeId: location.placeId,
        name: location.name,
        address: location.address,
        coordinates: { lat: location.lat, lng: location.lng },
      },
      activities,
      pacePreference,
      activitiesPerDay: paceToActivities[pacePreference],
      globalLodging,
      sameCampsite,
    };

    const tripResult = await generateTrip(tripConfig);
    if (tripResult) {
      setTripConfig(tripResult.config);
      setGeneratedTrip(tripResult);
      navigate(getTripUrl(tripResult.config.name));
    }
  };

  const cleanedName = cleanRegionName(location.name);
  const WeatherIcon = weather ? getWeatherIcon(weather.shortForecast) : Sun;

  return (
    <div className="min-h-screen bg-paper text-ink font-sans">
      {/* Sticky cream header */}
      <header className="sticky top-0 z-50 bg-cream/95 dark:bg-paper-2/95 backdrop-blur-md border-b border-line">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <Link
                to="/"
                aria-label="Back home"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full text-ink-3 hover:text-ink hover:bg-ink/5 transition-colors shrink-0"
              >
                <ArrowLeft className="w-4 h-4" weight="regular" />
              </Link>
              <div className="min-w-0">
                <Mono className="text-pine-6 inline-flex items-center gap-1.5">
                  <MapPin className="w-3 h-3" weight="regular" />
                  Location
                </Mono>
                <h1 className="text-[16px] sm:text-[20px] font-sans font-bold tracking-[-0.01em] text-ink truncate mt-0.5">
                  {cleanedName}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {isSaved ? (
                <Pill variant="solid-pine" mono={false} onClick={handleRemoveLocation}>
                  <CheckCircle className="w-4 h-4" weight="fill" />
                  <span className="hidden sm:inline">Saved</span>
                </Pill>
              ) : (
                <Pill
                  variant="ghost"
                  mono={false}
                  onClick={handleSaveLocation}
                  className="!border-pine-6 !text-pine-6 hover:!bg-pine-6/10"
                >
                  <Heart className="w-4 h-4" weight="regular" />
                  <span className="hidden sm:inline">Save</span>
                </Pill>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="w-full">
        <div className="grid lg:grid-cols-2">
          {/* Map (left, sticky on lg) */}
          <div className="order-2 lg:order-1 h-[400px] lg:h-[calc(100vh-73px)] lg:sticky lg:top-[73px]">
            <div className="relative w-full h-full">
              <GoogleMap
                center={{ lat: location.lat, lng: location.lng }}
                zoom={hikes.length > 0 ? 11 : 13}
                className="w-full h-full"
                onLoad={setMapInstance}
              >
                <AdvancedMarker
                  map={mapInstance}
                  position={{ lat: location.lat, lng: location.lng }}
                  content={createMarkerIcon('viewpoint', { size: 40 })}
                />
                {hikes.map((hike) => (
                  <AdvancedMarker
                    key={hike.id}
                    map={mapInstance}
                    position={{ lat: hike.lat, lng: hike.lng }}
                    title={hike.name}
                    content={createMarkerIcon('hike', { size: MARKER_SIZE })}
                    onClick={() => setSelectedHike(hike)}
                  />
                ))}
                {selectedHike && (
                  <InfoWindow
                    position={{ lat: selectedHike.lat, lng: selectedHike.lng }}
                    onCloseClick={() => setSelectedHike(null)}
                  >
                    <div className="min-w-[200px] font-sans">
                      <h4 className="text-[14px] font-semibold tracking-[-0.005em] text-ink">
                        {selectedHike.name}
                      </h4>
                      {selectedHike.rating && (
                        <div className="flex items-center gap-1 text-[12px] text-ink-3 mt-1">
                          <Star className="w-3 h-3 fill-clay text-clay" weight="fill" />
                          <span>{selectedHike.rating.toFixed(1)}</span>
                          {selectedHike.reviewCount && (
                            <span className="text-ink-3/70">({selectedHike.reviewCount})</span>
                          )}
                        </div>
                      )}
                      {selectedHike.location && (
                        <p className="text-[12px] text-ink-3 mt-1">{selectedHike.location}</p>
                      )}
                      <div className="flex gap-1.5 mt-2.5">
                        <button
                          onClick={() =>
                            window.open(
                              `https://www.google.com/maps/dir/?api=1&destination=${selectedHike.lat},${selectedHike.lng}`,
                              '_blank',
                            )
                          }
                          className="flex-1 px-2.5 py-1 rounded-full bg-pine-6 text-cream dark:text-ink-pine text-[11px] font-sans font-semibold tracking-[0.01em] hover:bg-pine-5 transition-colors"
                        >
                          Directions
                        </button>
                      </div>
                    </div>
                  </InfoWindow>
                )}
              </GoogleMap>

              {/* Map overlay — coords + actions */}
              <div className="absolute bottom-4 left-4 right-4 z-10">
                <div className="bg-white/95 backdrop-blur-md border border-line rounded-[14px] shadow-[0_8px_22px_rgba(29,34,24,.10)] px-3.5 py-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="inline-flex items-center gap-1.5 min-w-0">
                      <MapPin className="w-3.5 h-3.5 text-pine-6 flex-shrink-0" weight="regular" />
                      <Mono className="text-ink-2 truncate">
                        {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                      </Mono>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Pill variant="ghost" sm mono={false} onClick={handleOpenInMaps}>
                        <ArrowSquareOut className="w-3.5 h-3.5" weight="regular" />
                        Maps
                      </Pill>
                      <Pill variant="solid-pine" sm mono={false} onClick={handleGetDirections}>
                        <NavigationArrow className="w-3.5 h-3.5" weight="regular" />
                        Directions
                      </Pill>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Info panel (right, scrollable on lg) */}
          <div className="order-1 lg:order-2 bg-paper lg:h-[calc(100vh-73px)] lg:overflow-y-auto">
            <div className="px-4 sm:px-6 py-5 space-y-5">
              {/* Intro card */}
              <div className="bg-white dark:bg-paper-2 border border-line rounded-[14px] p-5">
                <Mono className="text-pine-6">{location.type}</Mono>
                <h2 className="text-[24px] sm:text-[28px] font-sans font-bold tracking-[-0.025em] text-ink leading-[1.1] mt-1">
                  {cleanedName}
                </h2>
                {location.address && (
                  <p className="text-[14px] text-ink-3 mt-2 leading-[1.5]">{location.address}</p>
                )}

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-line">
                  <StatTile
                    Icon={Mountains}
                    accent="sage"
                    label="Elevation"
                    value={elevation !== null ? `${Math.round(elevation * 3.28084).toLocaleString()} ft` : '—'}
                    hint={
                      elevation !== null ? getElevationMessage(Math.round(elevation * 3.28084)) : null
                    }
                  />
                  <StatTile
                    Icon={weatherLoading ? SpinnerGap : WeatherIcon}
                    accent="water"
                    label="Weather"
                    value={weather ? `${weather.temperature}°${weather.temperatureUnit}` : '—'}
                    hint={weather?.shortForecast || null}
                    iconClass={weatherLoading ? 'animate-spin' : ''}
                  />
                  <StatTile
                    Icon={Compass}
                    accent="clay"
                    label="Coords"
                    value={`${location.lat.toFixed(2)}°, ${location.lng.toFixed(2)}°`}
                  />
                </div>
              </div>

              {/* Surprise me banner */}
              {surpriseMeData && <SurpriseMeBanner surpriseMe={surpriseMeData} />}

              {/* Things to do divider */}
              <div className="flex items-center gap-3 pt-2">
                <div className="flex-1 h-px bg-line" />
                <Mono className="text-ink-3">Things to do</Mono>
                <div className="flex-1 h-px bg-line" />
              </div>

              {/* Three column section */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Hikes */}
                <SectionCard
                  Icon={Boot}
                  accent="sage"
                  title="Hikes"
                  count={hikes.length}
                  loading={hikesLoading}
                  loadingLabel="Finding trails…"
                  emptyLabel="No hikes found"
                >
                  {hikes.slice(0, 4).map((hike) => (
                    <ListRow
                      key={hike.id}
                      onClick={() =>
                        window.open(
                          `https://www.google.com/maps/search/?api=1&query=${hike.lat},${hike.lng}`,
                          '_blank',
                        )
                      }
                      title={hike.name}
                      meta={
                        hike.rating ? (
                          <span className="inline-flex items-center gap-0.5">
                            <Star className="w-2.5 h-2.5 fill-clay text-clay" weight="fill" />
                            {hike.rating.toFixed(1)}
                          </span>
                        ) : null
                      }
                    />
                  ))}
                  {hikes.length > 4 && <MoreLine count={hikes.length - 4} />}
                </SectionCard>

                {/* Camping */}
                <SectionCard
                  Icon={Tent}
                  accent="clay"
                  title="Camping"
                  count={nearbyPlaces.length}
                  loading={nearbyLoading}
                  loadingLabel="Finding campsites…"
                  emptyLabel="No campsites found"
                >
                  {nearbyPlaces.slice(0, 4).map((place: NearbyPlace) => (
                    <ListRow
                      key={place.id}
                      onClick={() => {
                        if (place.source === 'ridb') {
                          const facilityId = place.id.replace('ridb-', '');
                          window.open(`https://www.recreation.gov/camping/campgrounds/${facilityId}`, '_blank');
                        } else {
                          window.open(
                            `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`,
                            '_blank',
                          );
                        }
                      }}
                      title={place.name}
                      meta={
                        <>
                          {place.distance.toFixed(1)} mi
                          {place.source === 'ridb' && <span className="text-water ml-1">· Rec.gov</span>}
                        </>
                      }
                    />
                  ))}
                  {nearbyPlaces.length > 4 && <MoreLine count={nearbyPlaces.length - 4} />}
                </SectionCard>

                {/* Photos */}
                <SectionCard
                  Icon={Camera}
                  accent="ember"
                  title="Photos"
                  count={photoHotspots.length}
                  loading={photoHotspotsLoading}
                  loadingLabel="Finding spots…"
                  emptyLabel="No photo spots"
                >
                  {photoHotspots.slice(0, 4).map((hotspot) => (
                    <button
                      key={hotspot.id}
                      onClick={() => {
                        if (hotspot.samplePhotoUrl) {
                          setEnlargedPhoto({ url: hotspot.samplePhotoUrl, name: hotspot.name });
                        } else {
                          setSelectedPhotoHotspot(hotspot);
                        }
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[8px] hover:bg-cream dark:hover:bg-paper-2 transition-colors text-left"
                    >
                      {hotspot.samplePhotoUrl ? (
                        <img
                          src={hotspot.samplePhotoUrl}
                          alt={hotspot.name}
                          className="w-7 h-7 rounded-[6px] object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-[6px] bg-ember/15 text-ember flex items-center justify-center flex-shrink-0">
                          <Camera className="w-3.5 h-3.5" weight="regular" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-sans font-semibold tracking-[-0.005em] text-ink truncate">
                          {hotspot.name}
                        </p>
                        <Mono className="text-ink-3 block">{hotspot.photoCount.toLocaleString()} photos</Mono>
                      </div>
                    </button>
                  ))}
                  {photoHotspots.length > 4 && <MoreLine count={photoHotspots.length - 4} />}
                </SectionCard>
              </div>
            </div>

            {/* Sticky bottom action bar */}
            <div className="sticky bottom-0 border-t border-line bg-cream dark:bg-paper-2 px-4 sm:px-6 py-3 flex items-center gap-2">
              <Pill
                variant="solid-pine"
                mono={false}
                onClick={() => setItineraryModalOpen(true)}
                className="!flex-1 !justify-center"
              >
                <Calendar className="w-4 h-4" weight="regular" />
                Plan a trip
              </Pill>
              <Pill variant="ghost" mono={false} onClick={handleGetDirections}>
                <NavigationArrow className="w-4 h-4" weight="regular" />
              </Pill>
            </div>
          </div>
        </div>
      </main>

      {/* Itinerary modal */}
      {itineraryModalOpen && (
        <ItineraryModal
          locationName={cleanedName}
          tripDuration={tripDuration}
          setTripDuration={setTripDuration}
          activities={activities}
          setActivities={setActivities}
          pacePreference={pacePreference}
          setPacePreference={setPacePreference}
          globalLodging={globalLodging}
          setGlobalLodging={setGlobalLodging}
          sameCampsite={sameCampsite}
          setSameCampsite={setSameCampsite}
          generating={generating}
          onClose={() => setItineraryModalOpen(false)}
          onGenerate={() => {
            setItineraryModalOpen(false);
            handleGenerateTrip();
          }}
        />
      )}

      {/* Photo lightbox */}
      {enlargedPhoto && (
        <div
          className="fixed inset-0 z-[100] bg-ink-pine/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setEnlargedPhoto(null)}
        >
          <button
            className="absolute top-4 right-4 inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/10 text-cream hover:bg-white/20 transition-colors"
            onClick={() => setEnlargedPhoto(null)}
            aria-label="Close"
          >
            <X className="w-5 h-5" weight="regular" />
          </button>
          <div className="max-w-4xl max-h-[90vh] relative" onClick={(e) => e.stopPropagation()}>
            <img
              src={enlargedPhoto.url}
              alt={enlargedPhoto.name}
              className="max-w-full max-h-[85vh] object-contain rounded-[14px]"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-ink-pine/90 to-transparent p-4 rounded-b-[14px]">
              <p className="text-cream text-[15px] font-sans font-semibold tracking-[-0.005em]">
                {enlargedPhoto.name}
              </p>
              <Mono className="text-cream/70 mt-0.5 inline-flex items-center gap-1">
                <Camera className="w-3 h-3" weight="regular" />
                Photo hotspot · Flickr
              </Mono>
            </div>
          </div>
        </div>
      )}

      {/* Photo hotspot detail (when no sample photo) */}
      {selectedPhotoHotspot && !enlargedPhoto && (
        <div
          className="fixed inset-0 z-[90] bg-ink-pine/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedPhotoHotspot(null)}
        >
          <div
            className="bg-white dark:bg-paper-2 border border-line rounded-[18px] shadow-[0_18px_44px_rgba(29,34,24,.16)] max-w-sm w-full p-5 animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-[10px] bg-ember/15 text-ember mb-3">
              <Camera className="w-5 h-5" weight="regular" />
            </div>
            <Mono className="text-ember">Photo hotspot</Mono>
            <h3 className="text-[18px] font-sans font-bold tracking-[-0.015em] text-ink mt-1">
              {selectedPhotoHotspot.name}
            </h3>
            <p className="text-[13px] text-ink-3 mt-1">
              {selectedPhotoHotspot.photoCount.toLocaleString()} photos shared here.
            </p>
            <div className="mt-4">
              <Pill
                variant="solid-pine"
                mono={false}
                onClick={() => setSelectedPhotoHotspot(null)}
                className="!w-full !justify-center"
              >
                Close
              </Pill>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationDetail;

// === Helpers ===

const ACCENT_TONES: Record<
  'sage' | 'clay' | 'ember' | 'water' | 'pine',
  { bg: string; text: string }
> = {
  sage:  { bg: 'bg-sage/15',   text: 'text-sage' },
  clay:  { bg: 'bg-clay/15',   text: 'text-clay' },
  ember: { bg: 'bg-ember/15',  text: 'text-ember' },
  water: { bg: 'bg-water/15',  text: 'text-water' },
  pine:  { bg: 'bg-pine-6/12', text: 'text-pine-6' },
};

const StatTile = ({
  Icon,
  accent,
  label,
  value,
  hint,
  iconClass,
}: {
  Icon: typeof Mountains;
  accent: keyof typeof ACCENT_TONES;
  label: string;
  value: string;
  hint?: string | null;
  iconClass?: string;
}) => {
  const tone = ACCENT_TONES[accent];
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <div
        className={cn(
          'w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0',
          tone.bg,
          tone.text,
        )}
      >
        <Icon className={cn('w-4 h-4', iconClass)} weight="regular" />
      </div>
      <div className="min-w-0">
        <Mono className="text-ink-3 block">{label}</Mono>
        <p className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink truncate mt-0.5">
          {value}
        </p>
        {hint && <p className="text-[11px] text-ink-3 mt-0.5 truncate">{hint}</p>}
      </div>
    </div>
  );
};

const SectionCard = ({
  Icon,
  accent,
  title,
  count,
  loading,
  loadingLabel,
  emptyLabel,
  children,
}: {
  Icon: typeof Boot;
  accent: keyof typeof ACCENT_TONES;
  title: string;
  count: number;
  loading: boolean;
  loadingLabel: string;
  emptyLabel: string;
  children: React.ReactNode;
}) => {
  const tone = ACCENT_TONES[accent];
  return (
    <div className="bg-white dark:bg-paper-2 border border-line rounded-[14px] p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <div
          className={cn(
            'w-7 h-7 rounded-[8px] flex items-center justify-center flex-shrink-0',
            tone.bg,
            tone.text,
          )}
        >
          <Icon className="w-3.5 h-3.5" weight="regular" />
        </div>
        <h3 className="text-[13px] font-sans font-semibold tracking-[-0.005em] text-ink">{title}</h3>
        {count > 0 && !loading && <Mono className="text-ink-3 ml-auto">{count}</Mono>}
      </div>
      {loading ? (
        <div className="text-center py-5">
          <SpinnerGap className="w-4 h-4 mx-auto mb-1.5 text-pine-6 animate-spin" />
          <Mono className="text-pine-6">{loadingLabel}</Mono>
        </div>
      ) : count === 0 ? (
        <div className="text-center py-5">
          <Icon className="w-5 h-5 mx-auto mb-1.5 text-ink-3 opacity-40" weight="regular" />
          <Mono className="text-ink-3">{emptyLabel}</Mono>
        </div>
      ) : (
        <div className="space-y-1">{children}</div>
      )}
    </div>
  );
};

const ListRow = ({
  onClick,
  title,
  meta,
}: {
  onClick: () => void;
  title: string;
  meta?: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[8px] hover:bg-cream dark:hover:bg-paper-2 transition-colors text-left"
  >
    <div className="flex-1 min-w-0">
      <p className="text-[12px] font-sans font-semibold tracking-[-0.005em] text-ink truncate">
        {title}
      </p>
      {meta && (
        <Mono className="text-ink-3 mt-0.5 inline-flex items-center gap-1">{meta}</Mono>
      )}
    </div>
    <ArrowSquareOut className="w-3 h-3 text-ink-3 flex-shrink-0" weight="regular" />
  </button>
);

const MoreLine = ({ count }: { count: number }) => (
  <Mono className="text-ink-3 block text-center pt-1">+{count} more</Mono>
);

// === Itinerary Modal ===

type AccentName = 'pine' | 'sage' | 'water' | 'clay' | 'ember';

const ACCENT_FULL: Record<
  AccentName,
  {
    iconBg: string;
    iconText: string;
    selectedBorder: string;
    selectedBg: string;
    dot: string;
  }
> = {
  pine:  { iconBg: 'bg-pine-6/12', iconText: 'text-pine-6', selectedBorder: 'border-pine-6', selectedBg: 'bg-pine-6/[0.06]', dot: 'border-pine-6 bg-pine-6' },
  sage:  { iconBg: 'bg-sage/15',   iconText: 'text-sage',   selectedBorder: 'border-sage',   selectedBg: 'bg-sage/[0.06]',   dot: 'border-sage bg-sage' },
  water: { iconBg: 'bg-water/15',  iconText: 'text-water',  selectedBorder: 'border-water',  selectedBg: 'bg-water/[0.06]',  dot: 'border-water bg-water' },
  clay:  { iconBg: 'bg-clay/15',   iconText: 'text-clay',   selectedBorder: 'border-clay',   selectedBg: 'bg-clay/[0.06]',   dot: 'border-clay bg-clay' },
  ember: { iconBg: 'bg-ember/15',  iconText: 'text-ember',  selectedBorder: 'border-ember',  selectedBg: 'bg-ember/[0.06]',  dot: 'border-ember bg-ember' },
};

const ACTIVITY_OPTIONS: Array<{ id: string; label: string; description: string; accent: AccentName }> = [
  { id: 'hiking',      label: 'Hiking',      description: 'Find trails and hikes along your route.',  accent: 'sage' },
  { id: 'photography', label: 'Photography', description: 'Photo hotspots and scenic viewpoints.',     accent: 'ember' },
  { id: 'offroading',  label: 'Offroading',  description: 'Trails and off-highway routes.',            accent: 'clay' },
];

const PACE_OPTIONS: Array<{ id: PacePreference; label: string; description: string; accent: AccentName }> = [
  { id: 'relaxed',  label: 'Relaxed',  description: 'Fewer activities, more downtime.',  accent: 'water' },
  { id: 'moderate', label: 'Moderate', description: 'Balanced activity and rest.',       accent: 'pine'  },
  { id: 'packed',   label: 'Packed',   description: 'Maximum activities each day.',      accent: 'ember' },
];

const LODGING_OPTIONS: Array<{ id: LodgingType; label: string; description: string; accent: AccentName }> = [
  { id: 'dispersed',  label: 'Dispersed camping',   description: 'Free camping on public lands.', accent: 'pine' },
  { id: 'campground', label: 'Established camping', description: 'Campgrounds with amenities.',   accent: 'water' },
];

const CAMPSITE_OPTIONS: Array<{ id: string; label: string; description: string; baseCamp: boolean; accent: AccentName }> = [
  { id: 'best-each-night', label: 'Best each night', description: 'Pick the best option for each night.', baseCamp: false, accent: 'sage' },
  { id: 'basecamp',        label: 'Setup basecamp',  description: 'Same campsite every night.',           baseCamp: true,  accent: 'clay' },
];

const ItineraryModal = ({
  locationName,
  tripDuration,
  setTripDuration,
  activities,
  setActivities,
  pacePreference,
  setPacePreference,
  globalLodging,
  setGlobalLodging,
  sameCampsite,
  setSameCampsite,
  generating,
  onClose,
  onGenerate,
}: {
  locationName: string;
  tripDuration: number[];
  setTripDuration: (v: number[]) => void;
  activities: string[];
  setActivities: (v: string[]) => void;
  pacePreference: PacePreference;
  setPacePreference: (v: PacePreference) => void;
  globalLodging: LodgingType;
  setGlobalLodging: (v: LodgingType) => void;
  sameCampsite: boolean;
  setSameCampsite: (v: boolean) => void;
  generating: boolean;
  onClose: () => void;
  onGenerate: () => void;
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center font-sans">
    <div className="absolute inset-0 bg-ink-pine/60 backdrop-blur-sm" onClick={onClose} />
    <div className="relative bg-white dark:bg-paper-2 border border-line rounded-[18px] shadow-[0_18px_44px_rgba(29,34,24,.16),0_3px_8px_rgba(29,34,24,.08)] w-full max-w-md mx-4 max-h-[90dvh] flex flex-col overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Mono className="text-pine-6 inline-flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" weight="regular" />
            Plan a trip
          </Mono>
          <h2 className="text-[20px] font-sans font-semibold tracking-[-0.015em] text-ink leading-[1.15] mt-1">
            Trip to {locationName}.
          </h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="inline-flex items-center justify-center w-9 h-9 rounded-full text-ink-3 hover:text-ink hover:bg-ink/5 transition-colors shrink-0"
        >
          <X className="w-4 h-4" weight="regular" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Duration */}
        <div className="space-y-3">
          <Mono className="text-ink-2 block">Trip duration</Mono>
          <div className="flex items-baseline justify-between">
            <span className="text-[42px] font-sans font-bold tracking-[-0.025em] text-ink leading-none">
              {tripDuration[0]}
            </span>
            <Mono className="text-ink-3">{tripDuration[0] === 1 ? 'day' : 'days'}</Mono>
          </div>
          <Slider
            value={tripDuration}
            onValueChange={setTripDuration}
            min={1}
            max={14}
            step={1}
            className="w-full cursor-grab active:cursor-grabbing"
          />
          <div className="flex justify-between">
            <Mono className="text-ink-3">1 day</Mono>
            <Mono className="text-ink-3">14 days</Mono>
          </div>
        </div>

        {/* Activities */}
        <div className="space-y-3 pt-2 border-t border-line">
          <div className="pt-4">
            <Mono className="text-ink-2 block">Activities</Mono>
            <p className="text-[13px] text-ink-3 mt-1">What do you want to do on this trip?</p>
          </div>
          <div className="space-y-2">
            {ACTIVITY_OPTIONS.map(({ id, label, description, accent }) => {
              const a = ACCENT_FULL[accent];
              const selected = activities.includes(id);
              return (
                <label
                  key={id}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-[12px] border bg-white dark:bg-paper-2 cursor-pointer transition-all',
                    selected ? `${a.selectedBorder} ${a.selectedBg}` : 'border-line hover:border-ink-3/40',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => {
                      if (e.target.checked) setActivities([...activities, id]);
                      else setActivities(activities.filter((x) => x !== id));
                    }}
                    className="sr-only"
                  />
                  <div
                    className={cn(
                      'w-5 h-5 rounded-[5px] border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors',
                      selected ? a.dot : 'border-ink-3/40 bg-transparent',
                    )}
                  >
                    {selected && <Check className="w-3 h-3 text-cream" weight="bold" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink">
                      {label}
                    </div>
                    <p className="text-[13px] text-ink-3 mt-0.5 leading-[1.5]">{description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Pace */}
        <RadioGroup
          label="Trip pace"
          hint="How packed do you want each day to be?"
          options={PACE_OPTIONS}
          value={pacePreference}
          onChange={setPacePreference}
        />

        {/* Lodging */}
        <RadioGroup
          label="Lodging type"
          options={LODGING_OPTIONS}
          value={globalLodging}
          onChange={setGlobalLodging}
        />

        {/* Campsite selection */}
        <RadioGroup
          label="Campsite selection"
          options={CAMPSITE_OPTIONS.map((o) => ({ ...o, id: o.baseCamp ? 'basecamp' : 'best-each-night' }))}
          value={sameCampsite ? 'basecamp' : 'best-each-night'}
          onChange={(v) => setSameCampsite(v === 'basecamp')}
        />
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-line flex items-center gap-2">
        <Pill variant="ghost" mono={false} onClick={onClose} className="!flex-1 !justify-center">
          Cancel
        </Pill>
        <Pill
          variant="solid-pine"
          mono={false}
          onClick={onGenerate}
          className={cn('!flex-1 !justify-center', generating && 'opacity-50 pointer-events-none')}
        >
          {generating ? (
            <>
              <SpinnerGap className="w-3.5 h-3.5 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Calendar className="w-3.5 h-3.5" weight="regular" />
              Generate trip
            </>
          )}
        </Pill>
      </div>
    </div>
  </div>
);

function RadioGroup<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: Array<{ id: T; label: string; description: string; accent: AccentName }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-3 pt-2 border-t border-line">
      <div className="pt-4">
        <Mono className="text-ink-2 block">{label}</Mono>
        {hint && <p className="text-[13px] text-ink-3 mt-1">{hint}</p>}
      </div>
      <div className="grid gap-2">
        {options.map((option) => {
          const a = ACCENT_FULL[option.accent];
          const selected = value === option.id;
          return (
            <label
              key={option.id}
              className={cn(
                'flex items-center gap-3 p-3 rounded-[12px] border bg-white dark:bg-paper-2 cursor-pointer transition-all',
                selected ? `${a.selectedBorder} ${a.selectedBg}` : 'border-line hover:border-ink-3/40',
              )}
            >
              <input
                type="radio"
                checked={selected}
                onChange={() => onChange(option.id)}
                className="sr-only"
              />
              <div
                className={cn(
                  'w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0',
                  selected ? a.dot : 'border-ink-3/40 bg-transparent',
                )}
              >
                {selected && <span className="w-1.5 h-1.5 rounded-full bg-cream dark:bg-paper-2" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink">
                  {option.label}
                </div>
                <p className="text-[13px] text-ink-3 mt-0.5 leading-[1.5]">{option.description}</p>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
